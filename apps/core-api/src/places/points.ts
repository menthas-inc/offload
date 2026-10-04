// What a client reads to draw a thread's map (030).
//
// The thread's list is read a page at a time, so the map reads its points on
// their own: every live row with a point, and every picked calendar event in
// its window with one, with exactly what the point, the callout and the place
// sheet draw. **Nothing Google named**: the title is the row's or the event's,
// the address is an event's own words, and Google's id rides along only for
// the Directions link.

import { sql } from "kysely";
import { db } from "../db.js";
import { contentLabelsFor } from "../threads/labels.js";
import { threadEvents } from "../threads/calendars.js";
import { bookRefresh } from "./resolve.js";
import { mapsOn } from "../settings.js";

/** The heavy case is a few dozen; this is a guard, not a page. */
export const POINTS_MAX = 500;

/** The calendar window the map draws: yesterday to sixty days ahead, the same
 *  window the lookup fills. */
function window(): { from: Date; to: Date } {
  const now = Date.now();
  return { from: new Date(now - 86_400_000), to: new Date(now + 60 * 86_400_000) };
}

/** The row types that can have a point. A photo's camera position is never
 *  drawn, and a note has no place. */
const LOCATED = ["location", "link", "event"] as const;

export interface Point {
  key: string;
  source: "row" | "calendar";
  contentId: string | null;
  type: string;
  title: string;
  address: string | null;
  approximate: boolean;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  labelIds: string[];
  when: { at: string; endAt: string | null; allDay: boolean } | null;
  url: string | null;
  imageUrl: string | null;
  authorId: string | null;
  calendarName: string | null;
}

/** Whether a thread has anything to draw. Two flat EXISTS on their own partial
 *  indexes, read on every thread open, so never `threadEvents` for a yes or no. */
export async function hasPoint(threadId: string): Promise<boolean> {
  if (!(await mapsOn())) return false;
  const row = await db
    .selectFrom("content")
    .innerJoin("places", "places.id", "content.place_id")
    .select("content.id")
    .where("content.thread_id", "=", threadId)
    .where("content.deleted_at", "is", null)
    .where("content.archived_at", "is", null)
    .where("content.type", "in", LOCATED)
    .where("places.lat", "is not", null)
    .limit(1)
    .executeTakeFirst();
  if (row) return true;
  const { from, to } = window();
  const event = await db
    .selectFrom("thread_calendars as p")
    .innerJoin("connector_calendars as c", "c.id", "p.calendar_id")
    .innerJoin("connector_events as e", "e.calendar_id", "c.id")
    .innerJoin("places as pl", "pl.id", "e.place_id")
    .select("e.id")
    .where("p.thread_id", "=", threadId)
    .where("c.selected", "=", true)
    .where("e.deleted_at", "is", null)
    .where("e.occurs_at", "<=", to)
    .where(sql<boolean>`coalesce(e.occurs_end_at, e.occurs_at) >= ${from}`)
    .where("pl.lat", "is not", null)
    .limit(1)
    .executeTakeFirst();
  return event !== undefined;
}

/** A thread's points, content first and newest first, then calendar events
 *  nearest now, stopping at five hundred. A Google place that lost its
 *  coordinates past thirty days is left out, booked to be fetched again, and
 *  counted in `pending` so the client reads once more and draws it. */
export async function threadPoints(accountId: string, threadId: string): Promise<{ points: Point[]; pending: number }> {
  if (!(await mapsOn())) return { points: [], pending: 0 };

  const rows = await db
    .selectFrom("content")
    .innerJoin("places", "places.id", "content.place_id")
    .select([
      "content.id as id",
      "content.type as type",
      "content.title as title",
      "content.location as location",
      "content.url as url",
      "content.image_url as imageUrl",
      "content.account_id as authorId",
      "content.occurs_at as occursAt",
      "content.occurs_end_at as occursEndAt",
      "content.attrs as attrs",
      "places.id as placeId",
      "places.provider as provider",
      "places.provider_place_id as providerPlaceId",
      "places.lat as lat",
      "places.lng as lng",
      "places.approximate as approximate",
    ])
    .where("content.thread_id", "=", threadId)
    .where("content.deleted_at", "is", null)
    .where("content.archived_at", "is", null)
    .where("content.type", "in", LOCATED)
    .orderBy("content.created_at", "desc")
    .orderBy("content.id", "desc")
    .execute();

  const aged = [...new Set(rows.filter((r) => r.lat === null && r.provider === "google").map((r) => r.placeId))];
  for (const placeId of aged) await bookRefresh(placeId);

  const drawn = rows.filter((r) => r.lat !== null && r.lng !== null).slice(0, POINTS_MAX);
  const labels = await contentLabelsFor(drawn.map((r) => r.id));
  const points: Point[] = drawn.map((r) => ({
    key: `c:${r.id}`,
    source: "row",
    contentId: r.id,
    type: r.type,
    title: r.title,
    address: r.type === "event" ? r.location : null,
    approximate: r.approximate === true,
    lat: r.lat!,
    lng: r.lng!,
    googlePlaceId: r.provider === "google" ? r.providerPlaceId : null,
    labelIds: labels.get(r.id) ?? [],
    when: r.type === "event" && r.occursAt
      ? {
          at: r.occursAt.toISOString(),
          endAt: r.occursEndAt ? r.occursEndAt.toISOString() : null,
          allDay: (r.attrs as Record<string, unknown> | null)?.["all_day"] === true,
        }
      : null,
    url: r.type === "link" ? r.url : null,
    imageUrl: r.type === "link" ? r.imageUrl : null,
    authorId: r.authorId,
    calendarName: null,
  }));

  if (points.length < POINTS_MAX) {
    const { from, to } = window();
    const now = Date.now();
    const events = (await threadEvents(accountId, threadId, from, to))
      .filter((e) => e.place && e.place.lat !== null && e.place.lng !== null)
      .sort((a, b) => Math.abs(Date.parse(a.occursAt ?? "") - now) - Math.abs(Date.parse(b.occursAt ?? "") - now));
    const shown = events.slice(0, POINTS_MAX - points.length);
    // One read for every event drawn, not one each.
    const googleIds = await googleIdsOf(shown.map((e) => e.place!.id));
    for (const e of shown) {
      points.push({
        key: `e:${e.id}`,
        source: "calendar",
        contentId: null,
        type: "event",
        title: e.title,
        address: e.location,
        approximate: e.place!.approximate,
        lat: e.place!.lat!,
        lng: e.place!.lng!,
        googlePlaceId: googleIds.get(e.place!.id) ?? null,
        labelIds: [],
        when: e.occursAt ? { at: e.occursAt, endAt: e.occursEndAt, allDay: e.allDay } : null,
        url: null,
        imageUrl: null,
        authorId: null,
        calendarName: e.calendarName,
      });
    }
  }

  return { points, pending: aged.length };
}

async function googleIdsOf(placeIds: string[]): Promise<Map<string, string>> {
  if (placeIds.length === 0) return new Map();
  const places = await db
    .selectFrom("places")
    .select(["id", "provider_place_id"])
    .where("id", "in", placeIds)
    .where("provider", "=", "google")
    .execute();
  return new Map(places.flatMap((place) => (place.provider_place_id ? [[place.id, place.provider_place_id] as const] : [])));
}
