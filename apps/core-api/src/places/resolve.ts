// Turning a place name into a point on a map.
//
// **This is the first time anything offload holds leaves for a company that has
// never seen any of it.** Google Maps Platform receives place names taken out
// of what people dump. Everything in this file is shaped by that:
//
// - **Only the name goes.** Never the dump, never a thread name, never a
//   conversation turn, never an account id, never a forwarded header. The name
//   was already validated as short and single-line by the tool endpoint, which
//   is where that claim is enforced rather than requested.
// - **In a job, never in a turn.** A dump is not held up by a third party, and a
//   provider that is down produces a location with a name and no pin rather
//   than a failed answer.
// - **Two caches, because one does not do what it sounds like.** Caching by the
//   provider's place id only saves the details lookup once the id is known; the
//   search that turns a name into an id still runs per distinct phrase. So
//   there are two, and a repeated place costs no outbound call at either step.
// - **Neither cache carries an account column and neither may ever gain one.**
//   They hold what a public geocoder returned. A place row has the sensitivity
//   of a phone book entry, which is only true while nothing links a row to a
//   person, so nothing may.
// - **Ids, outcome and latency in logs. Never the query.** A place name derived
//   from a dump is content, and the obvious thing to log while debugging a
//   geocoder is exactly the thing OFF-1 forbids.

import { createHash } from "node:crypto";
import { sql } from "kysely";
import { db } from "../db.js";
import { env } from "../env.js";

/** Long enough for a slow provider, short enough that a hung request does not
 *  hold a job runner. */
const TIMEOUT_MS = 8_000;

export type ResolveOutcome =
  | "hit"
  | "resolved"
  | "not_found"
  | "provider_error"
  | "skipped";

export interface Place {
  providerPlaceId: string;
  name: string;
  formattedAddress: string | null;
  lat: number | null;
  lng: number | null;
}

/** What a geocoder looks like to this module.
 *
 *  A function rather than a class so a test can pass one in, and so this file
 *  makes no network call a test could accidentally let through. */
export type Geocoder = (query: string) => Promise<Place | null>;

/** The normalised form of a query, and the only thing derived from it that is
 *  stored.
 *
 *  Hashed rather than kept, so `place_lookups` does not become a plaintext list
 *  of every place anybody has ever mentioned. Lowercased and whitespace
 *  collapsed first, so "Time Out Market" and "time out  market" are one entry
 *  rather than two lookups and two outbound calls. */
export function queryHash(name: string): string {
  const normalised = name.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalised).digest("hex");
}

/** Google Places Text Search.
 *
 *  The real one, behind the `Geocoder` type so nothing else in the codebase
 *  reaches for `fetch` with a place name in it. */
export const googleGeocoder: Geocoder = async (query) => {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        // A field mask, so the response carries the four things a pin needs and
        // nothing else. Not an optimisation: asking for less is the difference
        // between receiving a place and receiving a dossier about one.
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      // The query and nothing else. No account, no session, no language or
      // region hint derived from a person, no bias toward where they are.
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`places ${response.status}`);

    const body = (await response.json()) as {
      places?: {
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }[];
    };

    const first = body.places?.[0];
    if (!first) return null;

    return {
      providerPlaceId: first.id,
      name: first.displayName?.text ?? query,
      formattedAddress: first.formattedAddress ?? null,
      lat: first.location?.latitude ?? null,
      lng: first.location?.longitude ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
};

/** Resolve one piece of content's place, if it has one and has not got one.
 *
 *  Returns what happened, for the log line and for the tests. Never throws on a
 *  provider problem: an unresolved location is a normal, permanent state and
 *  the row is already safe.
 */
export async function resolvePlace(
  contentId: string,
  geocode: Geocoder = googleGeocoder,
): Promise<ResolveOutcome> {
  const row = await db
    .selectFrom("content")
    .select(["id", "title", "type", "place_id"])
    .where("id", "=", contentId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();

  // Anything but a location that still wants a pin is nothing to do. Undone
  // content lands here too, which is right: geocoding a row somebody has just
  // taken back would be an outbound call on their behalf after they said no.
  if (!row || row.type !== "location" || row.place_id !== null) return "skipped";

  const hash = queryHash(row.title);

  // First cache: has this phrase been looked up before, by anybody. A row with
  // a null place_id is a remembered miss, so an unresolvable name is not
  // retried on every dump forever.
  const known = await db
    .selectFrom("place_lookups")
    .select("place_id")
    .where("query_hash", "=", hash)
    .executeTakeFirst();

  if (known) {
    if (known.place_id) {
      await attach(contentId, known.place_id);
      return "hit";
    }
    return "not_found";
  }

  let found: Place | null;
  try {
    found = await geocode(row.title);
  } catch {
    // The error is not even inspected. A provider error can quote the request,
    // and the request is the place name.
    return "provider_error";
  }

  if (!found) {
    await db
      .insertInto("place_lookups")
      .values({ query_hash: hash, place_id: null })
      .onConflict((oc) => oc.column("query_hash").doNothing())
      .execute();
    return "not_found";
  }

  const place = found;

  // Second cache: the place itself, by the provider's id, so two phrasings of
  // one place share a row.
  const placeId = await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("places")
      .values({
        provider: "google",
        provider_place_id: place.providerPlaceId,
        name: place.name,
        formatted_address: place.formattedAddress,
        lat: place.lat,
        lng: place.lng,
        resolved_at: sql`now()`,
      })
      .onConflict((oc) => oc.columns(["provider", "provider_place_id"]).doNothing())
      .execute();

    const existing = await trx
      .selectFrom("places")
      .select("id")
      .where("provider", "=", "google")
      .where("provider_place_id", "=", place.providerPlaceId)
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("place_lookups")
      .values({ query_hash: hash, place_id: existing.id })
      .onConflict((oc) => oc.column("query_hash").doNothing())
      .execute();

    return existing.id;
  });

  await attach(contentId, placeId);
  return "resolved";
}

async function attach(contentId: string, placeId: string): Promise<void> {
  await db
    .updateTable("content")
    .set({ place_id: placeId, updated_at: sql`now()` })
    .where("id", "=", contentId)
    // Only if it still wants one, so two jobs for one row cannot fight.
    .where("place_id", "is", null)
    .execute();
}
