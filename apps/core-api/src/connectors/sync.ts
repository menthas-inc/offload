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
  type GoogleEvent,
} from "./google.js";
import { mapEvent, sourceRefFor, threadFor, upsertEvent, type Rule } from "./events.js";
import { accessTokenFor, markNeedsReauth } from "./tokens.js";

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
    .select(["id", "account_id"])
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

  const calendars = await db
    .selectFrom("connector_calendars")
    .selectAll()
    .where("connection_id", "=", connectionId)
    .where("selected", "=", true)
    .execute();

  const { timeMin, timeMax } = windowFor(new Date());

  for (const calendar of calendars) {
    if (!calendar.default_thread_id) continue;
    outcome.calendars += 1;

    const rules = (await db
      .selectFrom("connector_calendar_rules")
      .select(["ordinal", "match_kind", "match_value", "thread_id"])
      .where("calendar_id", "=", calendar.id)
      .execute()) as Rule[];

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
    for (const event of page.events) {
      const sourceRef = sourceRefFor(calendar.external_id, event.externalId);
      seen.push(sourceRef);

      // Cancelled arrives in a delta as the way a deletion is reported.
      if (event.status === "cancelled") {
        const result = await db
          .updateTable("content")
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where("account_id", "=", connection.account_id)
          .where("source_ref", "=", sourceRef)
          .where("deleted_at", "is", null)
          .executeTakeFirst();
        outcome.retired += Number(result.numUpdatedRows ?? 0);
        continue;
      }
      if (!event.startsAt) continue;

      const threadId = threadFor(event, rules, calendar.default_thread_id);
      await upsertEvent(db, connection.account_id, mapEvent(event, calendar.external_id, threadId));
      outcome.written += 1;
    }

    // A full pass is the only one that can conclude something is gone from an
    // absence: a delta only ever reports what changed.
    if (full || outcome.resynced) {
      outcome.retired += await retireMissing(connection.account_id, calendar.external_id, seen, timeMin, timeMax);
    }

    await db
      .updateTable("connector_calendars")
      .set({
        sync_token: page.nextSyncToken,
        synced_at: new Date(),
        // Google's word on the role, every pass. An invariant checked only when
        // it is written goes stale the day somebody shares the calendar.
        ...(calendar.access_role === "owner" ? {} : { is_shared: true }),
        updated_at: new Date(),
      })
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
 *  window because outside it Google was never asked. */
async function retireMissing(
  accountId: string,
  calendarExternalId: string,
  seen: string[],
  timeMin: Date,
  timeMax: Date
): Promise<number> {
  let query = db
    .updateTable("content")
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where("account_id", "=", accountId)
    .where("source", "=", "calendar")
    .where("source_ref", "like", `${calendarExternalId}:%`)
    .where("deleted_at", "is", null)
    .where("occurs_at", ">=", timeMin)
    .where("occurs_at", "<=", timeMax);

  if (seen.length) query = query.where("source_ref", "not in", seen);

  const result = await query.executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
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
            .whereRef(sql`jobs.payload ->> 'connectionId'`, "=", "n.id")
            .where("jobs.kind", "=", "calendar.sync")
            .where("jobs.state", "in", ["queued", "running"])
        )
      )
    )
    .execute();

  for (const connection of stalled) await scheduleNextSync(connection.id);
  return stalled.length;
}
