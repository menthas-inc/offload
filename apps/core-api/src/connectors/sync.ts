// Keeping offload's idea of your week and your calendar's idea of your week the
// same thing.
//
// **The window is sixty days back and twelve months forward.** A calendar is
// not a feed with an end: one weekly recurrence runs forever, and materialising
// every occurrence is a table that grows with time rather than with use. The
// window bounds what offload *fetches*; it does not delete anything that ages
// out of it, which would be a retention rule this product does not otherwise
// have.

import { sql } from "kysely";
import { db } from "../db.js";
import { enqueue } from "../jobs/queue.js";
import {
  GrantRevoked,
  listEvents,
  listInstances,
  type GoogleEvent,
} from "./google.js";
import { mapEvent, sourceRefFor, upsertEvent } from "./events.js";
import { accessTokenFor, markNeedsReauth } from "./tokens.js";
import { refreshCalendars } from "./calendars.js";

const DAYS_BACK = 60;
const MONTHS_FORWARD = 12;

/** Fifteen minutes. A calendar changing is not urgent and a person who just
 *  edited one sees their own change immediately, because offload wrote it. */
export const SYNC_INTERVAL_SECONDS = 15 * 60;

function windowFor(now: Date): { timeMin: Date; timeMax: Date } {
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - DAYS_BACK);
  const timeMax = new Date(now);
  timeMax.setMonth(timeMax.getMonth() + MONTHS_FORWARD);
  return { timeMin, timeMax };
}

/** The next tick, enqueued **before** the work rather than after it.
 *
 *  This is the first self-rescheduling job in the codebase and it has two ways
 *  to stop forever, both silent. If the next tick were only enqueued by a run
 *  that succeeded, five failed attempts on a Google outage would mark the job
 *  dead and that connection would simply never sync again, looking healthy. And
 *  `enqueue` does `onConflict().doNothing()`, so a stable idempotency key, which
 *  is the obvious way to make the first enqueue safe, would make every later
 *  tick a silent no-op after exactly one run.
 *
 *  So: scheduled first, and the key carries the tick. */
export async function scheduleNextSync(connectionId: string, now = new Date()): Promise<void> {
  const tick = new Date(now.getTime() + SYNC_INTERVAL_SECONDS * 1000);
  const slot = `${tick.getUTCFullYear()}-${tick.getUTCMonth()}-${tick.getUTCDate()}-${tick.getUTCHours()}-${Math.floor(tick.getUTCMinutes() / 15)}`;
  await enqueue({
    kind: "calendar.sync",
    payload: { connectionId },
    runAfterSeconds: SYNC_INTERVAL_SECONDS,
    priority: 100,
    idempotencyKey: `calendar.sync:${connectionId}:${slot}`,
    maxAttempts: 3,
  });
}

/** Sync this connection now, because somebody just did something that should
 *  show up.
 *
 *  **The chain reschedules itself and nothing starts it.** Turning a calendar on
 *  and seeing nothing for up to a day is not a slow sync, it is a broken
 *  feature, and that is what shipped: the only two enqueuers were the sync
 *  handler rescheduling itself and the daily supervisor, so the first tick for
 *  a new connection was whenever the supervisor next noticed.
 *
 *  Its own key prefix, so it collapses a burst of toggles into one run without
 *  colliding with the quarter-hour chain, which would silently no-op one of
 *  them under `onConflict().doNothing()`. */
export async function syncNow(connectionId: string, now = new Date()): Promise<void> {
  const slot = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${Math.floor(now.getUTCMinutes() / 5)}`;
  await enqueue({
    kind: "calendar.sync",
    payload: { connectionId },
    priority: 10,
    idempotencyKey: `calendar.sync:${connectionId}:now:${slot}`,
    maxAttempts: 3,
  });
}

export interface SyncOutcome {
  calendars: number;
  written: number;
  retired: number;
  resynced: boolean;
}

/** One pass over one connection.
 *
 *  `full` reads the whole window rather than the delta, which is what a nightly
 *  pass does and what a `410` forces. The delta is not trusted on its own to
 *  carry every removal: a series shortened by a split may or may not report its
 *  orphaned occurrences as cancelled, and this repository's rule is to verify a
 *  vendor's behaviour rather than infer it. */
export async function syncConnection(connectionId: string, full = false): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { calendars: 0, written: 0, retired: 0, resynced: false };

  const connection = await db
    .selectFrom("connector_connections")
    .select(["id", "account_id", "external_account_email"])
    .where("id", "=", connectionId)
    .where("state", "=", "active")
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!connection) return outcome;

  let accessToken: string;
  try {
    accessToken = await accessTokenFor(connectionId);
  } catch (error) {
    if (error instanceof GrantRevoked) {
      await markNeedsReauth(connectionId);
      return outcome;
    }
    throw error;
  }

  // A full pass is where the calendar list itself is refreshed, along with
  // each calendar's colour and its participant count. 012 read the list once,
  // at connect, and never again, so a calendar created afterwards never
  // appeared and one deleted at Google stayed forever.
  if (full) {
    try {
      await refreshCalendars(connectionId, accessToken);
    } catch (error) {
      if (error instanceof GrantRevoked) {
        await markNeedsReauth(connectionId);
        return outcome;
      }
      throw error;
    }
  }

  const calendars = await db
    .selectFrom("connector_calendars")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .where("selected", "=", true)
    .execute();

  const { timeMin, timeMax } = windowFor(new Date());

  for (const calendar of calendars) {
    outcome.calendars += 1;

    const useToken = full ? null : calendar.sync_token;
    let page = await listEvents(accessToken, calendar.external_id, {
      syncToken: useToken,
      timeMin,
      timeMax,
    });

    if (page === "resync") {
      outcome.resynced = true;
      page = await listEvents(accessToken, calendar.external_id, { syncToken: null, timeMin, timeMax });
      if (page === "resync") continue;
    }

    const seen: string[] = [];
    const touchedSeries = new Set<string>();
    const cancelledSeries = new Set<string>();
    for (const event of page.events) {
      const sourceRef = sourceRefFor(calendar.external_id, event.externalId);
      seen.push(sourceRef);
      if (event.seriesId) touchedSeries.add(event.seriesId);

      // Cancelled arrives in a delta as the way a deletion is reported. A whole
      // series deleted can arrive as the series itself, whose id no occurrence
      // row carries as its own, only as its `series_ref`.
      if (event.status === "cancelled") {
        if (!event.seriesId) cancelledSeries.add(event.externalId);
        const result = await db
          .updateTable("connector_events")
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where("calendar_id", "=", calendar.id)
          .where("deleted_at", "is", null)
          .where((eb) =>
            event.seriesId
              ? eb("source_ref", "=", sourceRef)
              : eb.or([eb("source_ref", "=", sourceRef), eb("series_ref", "=", event.externalId)])
          )
          .executeTakeFirst();
        outcome.retired += Number(result.numUpdatedRows ?? 0);
        continue;
      }
      if (!event.startsAt) continue;

      await upsertEvent(
        db,
        connection.account_id,
        calendar.id,
        mapEvent(event, calendar.external_id, { accountEmail: connection.external_account_email, primary: calendar.is_primary }),
      );
      outcome.written += 1;
    }

    // A full pass is the only one that can conclude something is gone from an
    // absence: a delta only ever reports what changed. It is also where the
    // window is enforced: the copy holds sixty days back and no more, since it
    // is a cache of somebody else's system and not a record of what anybody
    // dumped.
    if (full || outcome.resynced) {
      outcome.retired += await retireMissing(calendar.id, seen, timeMin, timeMax);
      await forgetBehindTheWindow(calendar.id, timeMin);
    } else {
      // "Delete this and following" cancels nothing: Google moves the series'
      // end back and may not report the occurrences it dropped. So a series
      // the delta touched is asked for what it holds now, once per series, and
      // the copy keeps only that. Before this, the tail stayed until the
      // nightly pass.
      for (const seriesId of touchedSeries) {
        if (cancelledSeries.has(seriesId)) continue;
        const held = await listInstances(accessToken, calendar.external_id, seriesId, { timeMin, timeMax });
        const kept = held === "gone"
          ? []
          : held.filter((e) => e.status !== "cancelled").map((e) => sourceRefFor(calendar.external_id, e.externalId));
        outcome.retired += await retireMissing(calendar.id, kept, timeMin, timeMax, seriesId);
      }
    }

    await db
      .updateTable("connector_calendars")
      .set({ sync_token: page.nextSyncToken, synced_at: new Date(), updated_at: new Date() })
      .where("id", "=", calendar.id)
      .execute();
  }

  await db
    .updateTable("connector_connections")
    .set({ last_sync_at: new Date(), updated_at: new Date() })
    .where("id", "=", connectionId)
    .execute();

  return outcome;
}

/** Rows for this calendar, inside the window, that Google did not return.
 *
 *  Deleted elsewhere, or the tail of a series a split shortened. Scoped to the
 *  window because outside it Google was never asked, and to one series when
 *  only that series was asked. */
async function retireMissing(
  calendarId: string,
  seen: string[],
  timeMin: Date,
  timeMax: Date,
  seriesId?: string
): Promise<number> {
  let query = db
    .updateTable("connector_events")
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where("calendar_id", "=", calendarId)
    .where("deleted_at", "is", null)
    .where("occurs_at", ">=", timeMin)
    .where("occurs_at", "<=", timeMax);

  if (seriesId) query = query.where("series_ref", "=", seriesId);
  if (seen.length) query = query.where("source_ref", "not in", seen);

  const result = await query.executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
}

/** Rows whose occurrence has fallen behind the window go, deleted rather than
 *  retired: outside the window Google is never asked again, and a copy nobody
 *  refreshes is a copy nobody should keep. An event with an end is judged by
 *  its end, so a stay that started before the window and ends inside it stays. */
async function forgetBehindTheWindow(calendarId: string, timeMin: Date): Promise<void> {
  await db
    .deleteFrom("connector_events")
    .where("calendar_id", "=", calendarId)
    .where(sql<boolean>`coalesce(occurs_end_at, occurs_at) < ${timeMin}`)
    .execute();
}

/** Notices a chain that broke in a way nobody predicted.
 *
 *  Neither guard above is proof, and the failure mode they protect against is a
 *  connection that has silently stopped syncing while looking perfectly
 *  healthy. This is the only thing that would ever spot it. */
export async function superviseSyncs(): Promise<number> {
  const stalled = await db
    .selectFrom("connector_connections as n")
    .select("n.id as id")
    .where("n.state", "=", "active")
    .where("n.deleted_at", "is", null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("jobs")
            .select("jobs.id")
            // By the connection in the payload, not by the account. An
            // account can hold two connections, and matching on the account
            // would let one queued job vouch for both.
            //
            // **`::text` on the uuid, not `::uuid` on the payload.** `->>`
            // yields text and `n.id` is a uuid, and Postgres refuses that
            // comparison outright: `operator does not exist: text = uuid`.
            // Casting the other way would throw on any payload whose value is
            // not a valid uuid, which is a row this query does not control.
            .where(sql<boolean>`jobs.payload ->> 'connectionId' = n.id::text`)
            .where("jobs.kind", "=", "calendar.sync")
            .where("jobs.state", "in", ["queued", "running"])
        )
      )
    )
    .execute();

  for (const connection of stalled) await scheduleNextSync(connection.id);
  return stalled.length;
}

/** One full pass per active connection, once a day.
 *
 *  012 specified a nightly full pass and never enqueued one, so reconciliation
 *  by absence, the calendar list, the colours and the participant counts were
 *  all read once at connect and never again. The supervisor runs daily; this
 *  rides on it. Its own key slot so it never collapses into the quarter-hour
 *  chain's row. */
export async function scheduleFullSyncs(now = new Date()): Promise<number> {
  // The window holds for a connection that has stopped syncing too: a grant
  // the person revoked is a copy nobody refreshes, and a copy nobody
  // refreshes still ages out, which is what the privacy page says of it.
  const stalled = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select("c.id as id")
    .where("n.state", "<>", "active")
    .where("n.deleted_at", "is", null)
    .execute();
  const { timeMin } = windowFor(now);
  for (const calendar of stalled) await forgetBehindTheWindow(calendar.id, timeMin);

  const active = await db
    .selectFrom("connector_connections")
    .select("id")
    .where("state", "=", "active")
    .where("deleted_at", "is", null)
    .execute();
  const day = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  for (const connection of active) {
    await enqueue({
      kind: "calendar.sync",
      payload: { connectionId: connection.id, full: true },
      priority: 100,
      idempotencyKey: `calendar.sync:${connection.id}:full:${day}`,
      maxAttempts: 3,
    });
  }
  return active.length;
}
