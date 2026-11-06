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
import { inBackground, worksInBackground } from "../accounts/active.js";
import { enqueue } from "../jobs/queue.js";
import {
  GrantRevoked,
  listEvents,
  listInstances,
  type GoogleEvent,
} from "./google.js";
import { mapEvent, sourceRefFor, upsertEvent, type MappedEvent } from "./events.js";
import { accessTokenFor, markNeedsReauth } from "./tokens.js";
import { refreshCalendars } from "./calendars.js";
import { bookLocate } from "../places/resolve.js";
import { deleteContent, moveContentIn } from "../routes/threads.js";
import { defaultThreadOf } from "../loose/read.js";
import { zoneOf } from "../accounts/zone.js";
import { record } from "../notifications/activity.js";
import { canceledCopy, dayLabel } from "../notifications/copy.js";

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

/** Whether a connection's account still gets scheduled work (034). */
async function connectionWorks(connectionId: string): Promise<boolean> {
  const row = await db
    .selectFrom("connector_connections as n")
    .innerJoin("accounts", "accounts.id", "n.account_id")
    .select("n.id")
    .where("n.id", "=", connectionId)
    .where(inBackground())
    .executeTakeFirst();
  return row !== undefined;
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
  // 034. No tick for an account that gets no work in the background, so a
  // disabled account's chain ends with the tick that finds it disabled. The
  // supervisor starts it again within a day of their being enabled.
  if (!(await connectionWorks(connectionId))) return;
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
  // A tick queued before the account was disabled reads nothing.
  if (!(await worksInBackground(connection.account_id))) return outcome;

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

    // Per calendar. On the outcome alone it leaked: one calendar's expired
    // token made the next one in the connection read its delta as the whole
    // window and retire everything the delta did not mention.
    let reread = full;
    if (page === "resync") {
      outcome.resynced = true;
      reread = true;
      page = await listEvents(accessToken, calendar.external_id, { syncToken: null, timeMin, timeMax });
      if (page === "resync") continue;
    }

    const seen: string[] = [];
    const touchedSeries = new Set<string>();
    const cancelledSeries = new Set<string>();
    const gone: Gone = { refs: [], series: new Set() };
    const remembered = await rememberedOn(connection.account_id, calendar.external_id);
    for (const event of page.events) {
      const sourceRef = sourceRefFor(calendar.external_id, event.externalId);
      seen.push(sourceRef);
      if (event.seriesId) touchedSeries.add(event.seriesId);

      // Cancelled arrives in a delta as the way a deletion is reported. A whole
      // series deleted can arrive as the series itself, whose id no occurrence
      // row carries as its own, only as its `series_ref`.
      if (event.status === "cancelled") {
        if (!event.seriesId) cancelledSeries.add(event.externalId);
        gone.refs.push(sourceRef);
        gone.series.add(event.seriesId ?? event.externalId);
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

      const mapped = mapEvent(event, calendar.external_id, { accountEmail: connection.external_account_email, primary: calendar.is_primary });
      if (remembered.has(sourceRef)) await followChange(connection.account_id, calendar.id, mapped);
      await upsertEvent(db, connection.account_id, calendar.id, mapped);
      outcome.written += 1;
    }

    // A full pass is the only one that can conclude something is gone from an
    // absence: a delta only ever reports what changed. It is also where the
    // window is enforced: the copy holds sixty days back and no more, since it
    // is a cache of somebody else's system and not a record of what anybody
    // dumped.
    if (reread) {
      outcome.retired += await retireMissing(calendar.id, seen, timeMin, timeMax, undefined, gone);
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
        outcome.retired += await retireMissing(calendar.id, kept, timeMin, timeMax, seriesId, gone);
      }
    }

    if (remembered.size > 0) await letGo(connection.account_id, calendar.id, calendar.external_id, gone);

    await db
      .updateTable("connector_calendars")
      .set({ sync_token: page.nextSyncToken, synced_at: new Date(), updated_at: new Date() })
      .where("id", "=", calendar.id)
      .execute();

    // 030. A calendar some thread picks has its new or changed locations
    // looked up, a batch per fifteen-minute slot. Only while the map is on;
    // a calendar no thread picks is never looked up.
    const picked = await db
      .selectFrom("thread_calendars")
      .select("calendar_id")
      .where("calendar_id", "=", calendar.id)
      .executeTakeFirst();
    if (picked) {
      const slot = Math.floor(Date.now() / 900_000);
      await bookLocate(calendar.id, `event.locate:${calendar.id}:${slot}`);
    }
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
  seriesId: string | undefined,
  gone: Gone
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

  const retired = await query.returning(["source_ref", "series_ref"]).execute();
  for (const row of retired) {
    gone.refs.push(row.source_ref);
    if (row.series_ref) gone.series.add(row.series_ref);
  }
  return retired.length;
}

/** What Google no longer has, from one calendar's pass: events by their own
 *  ref, and the series any of them belonged to. */
interface Gone {
  refs: string[];
  series: Set<string>;
}

/** The refs this account's rows remember on one calendar, so a pass that
 *  touches none of them costs one query. */
async function rememberedOn(accountId: string, calendarExternalId: string): Promise<Set<string>> {
  const prefix = sourceRefFor(calendarExternalId, "");
  const rows = await db
    .selectFrom("content")
    .select("source_ref")
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where(sql<boolean>`left(source_ref, ${prefix.length}) = ${prefix}`)
    .execute();
  return new Set(rows.map((row) => row.source_ref!));
}

/** A row filed as an event goes where Google moved it, and by its new name.
 *
 *  Judged against the copy, not the row: the daily pass reads every event, and
 *  one that is as the copy has it says nothing about the row, which keeps its
 *  own words and its own end. The fields PR 75's change path sets. */
async function followChange(accountId: string, calendarId: string, mapped: MappedEvent): Promise<void> {
  const was = await db
    .selectFrom("connector_events")
    .select(["title", "occurs_at", "occurs_end_at"])
    .where("calendar_id", "=", calendarId)
    .where("source_ref", "=", mapped.sourceRef)
    .executeTakeFirst();
  if (!was) return;
  const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const retitled = was.title !== mapped.title;
  const moved = !same(was.occurs_at, mapped.occursAt);
  // Google's all-day end is the day after; a row's is the last day.
  const end = mapped.allDay && mapped.occursEndAt ? new Date(mapped.occursEndAt.getTime() - 86_400_000) : mapped.occursEndAt;
  const stretched = !same(was.occurs_end_at, mapped.occursEndAt);
  if (!retitled && !moved && !stretched) return;
  await db
    .updateTable("content")
    .set({
      // A row that only found its event keeps its own words: an invitation's
      // title is its organiser's, and the row is what goes in later prompts.
      ...(retitled ? { title: sql<string>`case when attrs ? 'calendar_found' then title else ${mapped.title} end` } : {}),
      ...(moved ? { occurs_at: mapped.occursAt, attrs: sql`attrs || ${JSON.stringify({ all_day: mapped.allDay })}::jsonb` } : {}),
      ...(stretched ? { occurs_end_at: end } : {}),
      updated_at: new Date(),
    })
    .where("account_id", "=", accountId)
    .where("source_ref", "=", mapped.sourceRef)
    .where("deleted_at", "is", null)
    .execute();
}

/** The rows filed as events Google no longer has go, as a removal asked of
 *  offload takes them, with no Undo since offload was not asked.
 *
 *  A row remembering a series goes only once the copy holds none of the
 *  series. A row that only found its event stays, forgetting it. A row carrying a photo is not destroyed with an appointment: it
 *  stops being an event and goes loose, photo and all. The account's own rows
 *  only, as the calendar is. Never failing the pass: the copy is right by now. */
async function letGo(accountId: string, calendarId: string, calendarExternalId: string, gone: Gone): Promise<void> {
  const refs = [...gone.refs];
  for (const series of gone.series) {
    const left = await db
      .selectFrom("connector_events")
      .select("id")
      .where("calendar_id", "=", calendarId)
      .where("series_ref", "=", series)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!left) refs.push(sourceRefFor(calendarExternalId, series));
  }
  if (refs.length === 0) return;
  const rows = await db
    .selectFrom("content")
    .select(["id", "title", "thread_id", "occurs_at"])
    .select(sql<boolean>`attrs ? 'calendar_found'`.as("found"))
    .select(sql<boolean>`coalesce((attrs ->> 'all_day')::boolean, false)`.as("allDay"))
    .select((eb) =>
      eb
        .exists(eb.selectFrom("content_blobs").select("blob_id").whereRef("content_blobs.content_id", "=", "content.id"))
        .as("photo")
    )
    .where("account_id", "=", accountId)
    .where("source_ref", "in", refs)
    .where("deleted_at", "is", null)
    .execute();
  const zone = rows.length > 0 ? await zoneOf(accountId) : null;
  for (const row of rows) {
    try {
      // Quiet, like a move: nobody asked offload, and the words are a row's.
      const day = row.occurs_at ? dayLabel(row.occurs_at, row.allDay, zone) : null;
      const stays = row.found || row.photo;
      await record(accountId, {
        kind: "moved",
        sent: false,
        reason: "design",
        ...canceledCopy(stays ? row.title : null, day),
        threadId: row.thread_id,
        contentId: stays ? row.id : null,
      });
      // Filed from a dump, not made by the event: somebody cancelling a meeting
      // does not delete what the person forwarded. It only forgets the event.
      if (row.found) {
        await db
          .updateTable("content")
          .set({ source_ref: null, attrs: sql`attrs - 'calendar' - 'calendar_found'`, updated_at: new Date() })
          .where("id", "=", row.id)
          .execute();
        continue;
      }
      if (!row.photo) {
        await deleteContent(accountId, row.id);
        continue;
      }
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("content")
          .set({ occurs_at: null, occurs_end_at: null, rrule: null, source_ref: null, attrs: sql`attrs - 'calendar' - 'all_day'`, updated_at: new Date() })
          .where("id", "=", row.id)
          .execute();
        const loose = await defaultThreadOf(accountId, trx);
        if (loose) await moveContentIn(trx, accountId, row.id, loose);
      });
    } catch (error) {
      console.error(JSON.stringify({ at: "calendar.let_go", outcome: "failed", error_type: error instanceof Error ? error.name : "unknown" }));
    }
  }
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
    .innerJoin("accounts", "accounts.id", "n.account_id")
    .select("n.id as id")
    .where("n.state", "=", "active")
    .where("n.deleted_at", "is", null)
    .where(inBackground())
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
    .selectFrom("connector_connections as n")
    .innerJoin("accounts", "accounts.id", "n.account_id")
    .select("n.id as id")
    .where("n.state", "=", "active")
    .where("n.deleted_at", "is", null)
    .where(inBackground())
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
