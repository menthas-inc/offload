// Turning a row's place into a point on a map (006, rewritten for 030).
//
// **Google Maps Platform receives place names taken out of what people dump,
// and keeps them to improve its own products.** That is in its terms, the
// product owner accepted it on 2026-10-02, and the privacy page says so by
// name. Everything in this file is shaped by it:
//
// - **Only what `placeQuery` lets through goes**, and only the query: never the
//   dump, a thread name, a turn, an account or a header. The filter is the one
//   gate in front of Google; nothing here decides what may be sent.
// - **In a job, never in a turn.** A dump is not held up by a third party, and
//   a provider that is down leaves a row with no point rather than a failed
//   answer.
// - **What is kept is what Google's terms allow**: its place id, and the
//   coordinates and whether the place is an area for at most thirty days. Never
//   its name, address or categories. The age sweep (`age.ts`) enforces the
//   thirty days; a place on a map that has lost its coordinates is asked for
//   again then (`refreshPlace`), so Google is asked about a place only when
//   somebody looks at it.
// - **Two caches, neither ever tied to an account.** The query cache is keyed
//   by a peppered hash, so a copy of it is not a dictionary of places people
//   mentioned, and a remembered miss expires after thirty days.
// - **Ids, outcome and latency in logs. Never the query.**

import { sql } from "kysely";
import { db } from "../db.js";
import { env } from "../env.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { details, kindOf, searchId } from "./google.js";
import { placeQuery, queryKey } from "./query.js";

export type ResolveOutcome = "hit" | "resolved" | "not_found" | "provider_error" | "skipped";

/** A place as Google gave it, in the shape offload keeps. */
export interface Found {
  placeId: string;
  lat: number;
  lng: number;
  approximate: boolean;
}

/** What a geocoder looks like to this module: a function, so a test can pass
 *  one in and this file makes no network call a test could let through. */
export type Geocoder = (query: string, key: string) => Promise<Found | null>;

/** Whether the map is on, and what it needs. Read from the environment by
 *  default; a test passes its own. Boot refuses `MAPS=on` without the key and
 *  the pepper (`mapsConfigProblem`). */
export interface MapsConfig {
  on: boolean;
  key: string;
  pepper: string;
}

export function mapsConfig(): MapsConfig {
  return {
    on: env.MAPS === "on",
    key: env.GOOGLE_MAPS_API_KEY ?? "",
    pepper: env.PLACE_HASH_PEPPER ?? "",
  };
}

/** A remembered miss is asked again after this long, so a provider that was
 *  down, or a place that opened since, is not refused forever. */
const MISS_DAYS = 30;

/** Google, in its two cheap steps: the id, then the coordinates and kind. A
 *  country or a region is too coarse to draw and counts as not found. */
export const googleGeocoder: Geocoder = async (query, key) => {
  const placeId = await searchId(query, key);
  if (!placeId) return null;
  const place = await details(placeId, key);
  if (!place) return null;
  const kind = kindOf(place.types);
  if (kind === "coarse") return null;
  return { placeId, lat: place.lat, lng: place.lng, approximate: kind === "area" };
};

/** The words a row is looked up by: a saved place's name, or an event's or a
 *  link's location. Anything else has none. */
function queryOf(row: { type: string; title: string; location: string | null }): string | null {
  if (row.type === "location") return row.title;
  if (row.type === "event" || row.type === "link") return row.location;
  return null;
}

/** Look up one row's place, if it has one and has not got one.
 *
 *  Returns what happened, for the log line and for the tests. Never throws on
 *  a provider problem: a row with no point is a normal, permanent state. */
export async function resolvePlace(
  contentId: string,
  geocode: Geocoder = googleGeocoder,
  config: MapsConfig = mapsConfig(),
): Promise<ResolveOutcome> {
  if (!config.on) return "skipped";

  const row = await db
    .selectFrom("content")
    .select(["id", "type", "title", "location", "place_id"])
    .where("id", "=", contentId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  // Undone content lands here too, which is right: a lookup for a row somebody
  // just took back would be a call on their behalf after they said no.
  if (!row || row.place_id !== null) return "skipped";

  const raw = queryOf(row);
  if (raw === null) return "skipped";
  const query = placeQuery(raw);
  if (query === null) return "skipped";

  const hash = queryKey(query, config.pepper);
  const known = await db
    .selectFrom("place_lookups")
    .leftJoin("places", "places.id", "place_lookups.place_id")
    .select(["place_lookups.place_id as placeId", "place_lookups.looked_up_at as lookedUpAt", "places.lat as lat"])
    .where("place_lookups.query_hash", "=", hash)
    .executeTakeFirst();

  if (known) {
    if (known.placeId) {
      if (!(await attach(contentId, known.placeId, row.type, raw))) return "skipped";
      // Kept past thirty days without coordinates: asked again, once a day at
      // most, and drawn when they arrive.
      if (known.lat === null) await bookRefresh(known.placeId);
      return "hit";
    }
    if (known.lookedUpAt.getTime() > Date.now() - MISS_DAYS * 86_400_000) return "not_found";
    await db.deleteFrom("place_lookups").where("query_hash", "=", hash).execute();
  }

  let found: Found | null;
  try {
    found = await geocode(query, config.key);
  } catch {
    // Not even inspected: a provider error can quote the request, and the
    // request is a place name. And not remembered as a miss, since the place
    // may well exist.
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

  const placeId = await keep(found);
  await db
    .insertInto("place_lookups")
    .values({ query_hash: hash, place_id: placeId })
    .onConflict((oc) => oc.column("query_hash").doNothing())
    .execute();
  if (!(await attach(contentId, placeId, row.type, raw))) return "skipped";
  return "resolved";
}

/** Keep what Google gave, by its id: two phrasings of one place share a row,
 *  and the coordinates and their age are brought up to date. */
export async function keep(found: Found): Promise<string> {
  const kept = await db
    .insertInto("places")
    .values({
      provider: "google",
      provider_place_id: found.placeId,
      lat: found.lat,
      lng: found.lng,
      approximate: found.approximate,
      coords_at: sql`now()`,
    })
    .onConflict((oc) =>
      oc.columns(["provider", "provider_place_id"]).doUpdateSet({
        lat: found.lat,
        lng: found.lng,
        approximate: found.approximate,
        coords_at: sql`now()`,
      }),
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return kept.id;
}

/** Attach a place to a row, only if it still wants one **and** still says what
 *  was looked up. A rename or an edit that overtook the lookup has booked its
 *  own, and this one must not put the old place on it. */
async function attach(contentId: string, placeId: string, type: string, raw: string): Promise<boolean> {
  const column = type === "location" ? "title" : "location";
  const result = await db
    .updateTable("content")
    .set({ place_id: placeId, updated_at: sql`now()` })
    .where("id", "=", contentId)
    .where("place_id", "is", null)
    .where(column, "=", raw)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Book a place's coordinates to be fetched again, once a day at most. */
export async function bookRefresh(placeId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  await enqueue({
    kind: "places.refresh",
    payload: { placeId },
    priority: PRIORITY.background,
    idempotencyKey: `places.refresh:${placeId}:${day}`,
  });
}

/** A point a page's own metadata gave, kept as the page's: never sent to
 *  Google, never aged, keyed on its coordinates rounded to five places (about
 *  a metre) so two links to one spot share a row. Refused unless it is a real
 *  place on Earth; `0,0` is the commonest default a page publishes by mistake. */
export async function attachPagePoint(contentId: string, lat: number, lng: number): Promise<boolean> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const kept = await db
    .insertInto("places")
    .values({ provider: "page", provider_place_id: key, lat, lng, approximate: false, coords_at: sql`now()` })
    .onConflict((oc) => oc.columns(["provider", "provider_place_id"]).doUpdateSet({ provider_place_id: key }))
    .returning("id")
    .executeTakeFirstOrThrow();
  const result = await db
    .updateTable("content")
    .set({ place_id: kept.id, updated_at: sql`now()` })
    .where("id", "=", contentId)
    .where("place_id", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

/** Fetch a Google place's coordinates again, once its thirty days have passed
 *  and a map wants it. Only while something live still points at it, so a
 *  place nobody has any more is not asked about. */
export async function refreshPlace(
  placeId: string,
  fetchDetails: (googleId: string) => Promise<{ lat: number; lng: number; types: string[] } | null> = (id) =>
    details(id, mapsConfig().key),
  config: MapsConfig = mapsConfig(),
): Promise<"refreshed" | "skipped" | "not_found" | "provider_error"> {
  if (!config.on) return "skipped";
  const place = await db
    .selectFrom("places")
    .select(["id", "provider_place_id", "lat"])
    .where("id", "=", placeId)
    .where("provider", "=", "google")
    .where(({ exists, selectFrom, or }) =>
      or([
        exists(selectFrom("content").select("content.id").whereRef("content.place_id", "=", "places.id").where("content.deleted_at", "is", null)),
        exists(
          selectFrom("connector_events")
            .select("connector_events.id")
            .whereRef("connector_events.place_id", "=", "places.id")
            .where("connector_events.deleted_at", "is", null),
        ),
      ]),
    )
    .executeTakeFirst();
  if (!place || place.lat !== null) return "skipped";
  let fresh: { lat: number; lng: number; types: string[] } | null;
  try {
    fresh = await fetchDetails(place.provider_place_id);
  } catch {
    return "provider_error";
  }
  if (!fresh) return "not_found";
  await db
    .updateTable("places")
    .set({ lat: fresh.lat, lng: fresh.lng, approximate: kindOf(fresh.types) === "area", coords_at: sql`now()` })
    .where("id", "=", place.id)
    .execute();
  return "refreshed";
}
