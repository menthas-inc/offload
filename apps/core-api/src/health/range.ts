// The ranges every plot offers, and the buckets a plot over one draws (034).
//
// Hours over a day, UTC days otherwise. A day is stepped as 24 hours from a
// UTC midnight, never as `interval '1 day'`, which follows the session's time
// zone across a clock change.

import { sql, type RawBuilder } from "kysely";

export const RANGES = ["24h", "7d", "30d", "90d"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_HOURS: Record<Range, number> = { "24h": 24, "7d": 168, "30d": 720, "90d": 2160 };

/** When the range began, by the database's clock. */
export function since(range: Range): RawBuilder<Date> {
  return sql<Date>`(now() - make_interval(hours => ${RANGE_HOURS[range]}))`;
}

export function unitOf(range: Range): "hour" | "day" {
  return range === "24h" ? "hour" : "day";
}

/** One row per bucket in the range, oldest first, to be aliased `as buckets(at)`: 24 hours, or 7, 30
 *  or 90 UTC days, today included. A bucket with nothing in it is still a
 *  point, so a plot reads zero and not a gap. */
export function series(range: Range): RawBuilder<unknown> {
  if (range === "24h") {
    return sql`generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour')`;
  }
  const days = RANGE_HOURS[range] / 24;
  return sql`generate_series(date_trunc('day', now(), 'UTC') - make_interval(hours => ${(days - 1) * 24}), date_trunc('day', now(), 'UTC'), interval '24 hours')`;
}

/** The bucket a moment falls in. */
export function bucketOf(range: Range, column: RawBuilder<unknown>): RawBuilder<Date> {
  return range === "24h" ? sql<Date>`date_trunc('hour', ${column})` : sql<Date>`date_trunc('day', ${column}, 'UTC')`;
}
