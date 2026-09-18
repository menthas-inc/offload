// A coordinate becomes a town.
//
// The opposite call from `resolve.ts`, and its own path for that reason: what
// leaves here is where somebody stood, not a name they typed. So the
// coordinate is rounded to three decimals, about a hundred metres, before it
// goes anywhere; only the locality is asked for, never a street; the cache is
// keyed on the rounded pair with no account column; and what comes back is a
// town, which is what the row shows. The exact coordinate stays on the blob
// and reaches no wire (020, and the privacy policy's row for this provider
// once it is switched on).

import { sql } from "kysely";
import { db } from "../db.js";
import { env } from "../env.js";
import { takenSentence } from "../blobs/photos.js";

const TIMEOUT_MS = 5000;

/** Both the key and the switch. The key alone serves 006's place names and
 *  says nothing about whether a coordinate may leave. */
export function reverseGeocodingOn(): boolean {
  return Boolean(env.GOOGLE_MAPS_API_KEY) && env.PHOTO_TOWNS === "on";
}

/** What a reverse geocoder looks like here: a rounded pair in, a town or
 *  nothing out. A function so a test can pass one in and this file makes no
 *  network call a test could let through. */
export type ReverseGeocoder = (lat: number, lng: number) => Promise<string | null>;

/** About a hundred metres. Enough to name a town and not enough to name a
 *  house. */
export function rounded(value: number): string {
  return value.toFixed(3);
}

/** Google Geocoding, reverse, locality only. The locality of the first
 *  result that has one; nothing finer is read, so a neighbourhood never
 *  reaches a row, which is what the decision and the policy's row say. */
export const googleReverse: ReverseGeocoder = async (lat, lng) => {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key || !reverseGeocodingOn()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      latlng: `${rounded(lat)},${rounded(lng)}`,
      result_type: "locality",
      language: "en",
      key,
    });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`geocode ${response.status}`);
    const body = (await response.json()) as {
      results?: { address_components?: { long_name: string; types: string[] }[] }[];
    };
    for (const result of body.results ?? []) {
      const parts = result.address_components ?? [];
      const town = parts.find((p) => p.types.includes("locality") || p.types.includes("postal_town"));
      if (town?.long_name) return town.long_name.slice(0, 80);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export type LocateOutcome = "skipped" | "hit" | "named" | "not_found" | "provider_error";

/** Name the town for one blob, if it has a coordinate and no town yet.
 *  Returns what happened, for the log line and the tests. Never throws on a
 *  provider problem: a photo without a town is a normal, permanent state. */
export async function locateBlob(blobId: string, reverse: ReverseGeocoder = googleReverse): Promise<LocateOutcome> {
  const blob = await db
    .selectFrom("blobs")
    .select(["id", "latitude", "longitude", "town", "taken_at"])
    .where("id", "=", blobId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!blob || blob.latitude === null || blob.longitude === null || blob.town !== null) return "skipped";

  const lat = rounded(blob.latitude);
  const lng = rounded(blob.longitude);

  const known = await db
    .selectFrom("place_reverse")
    .select("town")
    .where("lat", "=", lat)
    .where("lng", "=", lng)
    .executeTakeFirst();

  let town: string | null;
  let outcome: LocateOutcome;
  if (known) {
    town = known.town;
    outcome = known.town ? "hit" : "not_found";
  } else {
    try {
      town = await reverse(Number(lat), Number(lng));
    } catch {
      // Not even inspected: a provider error can quote the request.
      return "provider_error";
    }
    await db
      .insertInto("place_reverse")
      .values({ lat, lng, town })
      .onConflict((oc) => oc.columns(["lat", "lng"]).doNothing())
      .execute();
    outcome = town ? "named" : "not_found";
  }

  if (!town) return outcome;

  await db.transaction().execute(async (trx) => {
    await trx.updateTable("blobs").set({ town }).where("id", "=", blob.id).execute();
    // The row's own sentence gains its place. Rewritten by the server, which
    // is the only thing that ever wrote it: the model never sees the town.
    const rows = await trx
      .selectFrom("content_blobs")
      .innerJoin("content", "content.id", "content_blobs.content_id")
      .select(["content.id as id", "content.body as body"])
      .where("content_blobs.blob_id", "=", blob.id)
      .where("content.deleted_at", "is", null)
      .execute();
    const before = takenSentence(blob.taken_at, null);
    const after = takenSentence(blob.taken_at, town);
    for (const row of rows) {
      const body = row.body ?? "";
      const next = before && body.includes(before) ? body.replace(before, after) : [body, after].filter(Boolean).join("\n\n");
      if (next !== body) {
        await trx.updateTable("content").set({ body: next, updated_at: sql`now()` }).where("id", "=", row.id).execute();
      }
    }
  });
  return outcome;
}
