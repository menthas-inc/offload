// Google's thirty days, kept by SQL alone (030).
//
// Google's terms let offload keep a place's coordinates for at most thirty
// consecutive days. This sweep enforces that whatever else happens: no call
// to Google, just the coordinates and the area mark derived from Google's
// categories set to null. A place on a map that has lost them is asked for
// again when somebody opens that map (`refreshPlace`), so cost follows maps
// people look at rather than places they once kept.
//
// It also deletes a place nothing live points at any more, with its cache
// entries, and clears an Undo record no Undo can use: the next write clears it
// too, and 25 hours covers a mail turn's 24-hour Undo.

import { sql } from "kysely";
import { db } from "../db.js";

export async function agePlaces(): Promise<{ aged: number; dropped: number; priors: number }> {
  const aged = await db
    .updateTable("places")
    .set({ lat: null, lng: null, approximate: null, coords_at: null })
    .where("provider", "=", "google")
    .where("lat", "is not", null)
    .where("coords_at", "<", sql<Date>`now() - interval '30 days'`)
    .executeTakeFirst();

  const dropped = await db
    .deleteFrom("places")
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("content")
            .select("content.id")
            .whereRef("content.place_id", "=", "places.id")
            .where("content.deleted_at", "is", null),
        ),
      ),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("connector_events")
            .select("connector_events.id")
            .whereRef("connector_events.place_id", "=", "places.id")
            .where("connector_events.deleted_at", "is", null),
        ),
      ),
    )
    // Nor one a live Undo record still points at, so a turn undone within
    // its window gets its place back.
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("content")
            .select("content.id")
            .where(sql<string>`content.place_prior->>'placeId'`, "=", sql<string>`places.id::text`),
        ),
      ),
    )
    .executeTakeFirst();

  const priors = await db
    .updateTable("content")
    .set({ place_prior: null, place_prior_at: null })
    .where("place_prior_at", "<", sql<Date>`now() - interval '25 hours'`)
    .executeTakeFirst();

  return {
    aged: Number(aged.numUpdatedRows),
    dropped: Number(dropped.numDeletedRows),
    priors: Number(priors.numUpdatedRows),
  };
}
