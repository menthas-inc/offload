// The five calendar tools, on the server side of the boundary.
//
// **The model is told the outcome of the outward test and never supplies it.**
// There is no field in any of these schemas that could skip a confirmation,
// which matters because some of what the model just read was written by a
// stranger: a calendar it can see is a calendar somebody else can write into.
//
// So a write that reaches nobody happens now, and a write that reaches somebody
// becomes a proposal that a person has to tap. Every tool in this product
// executes inside the turn and returns a result, so there was no pending state
// to reuse and this is where it is built.

import { describeRule, parseRule } from "@offload/widgets";
import { sql } from "kysely";
import { db } from "../db.js";
import { GrantRevoked, type EventDraft } from "./google.js";
import { outwardLine, readCalendarVerdict, type OutwardVerdict } from "./outward.js";
import { accessTokenFor, markNeedsReauth } from "./tokens.js";
import { performWrite, targetFor, verdictFor, writable, type WriteAction } from "./write.js";
import type { ScopedCalendar } from "../threads/calendars.js";
import { deleteContent, setArchived } from "../routes/threads.js";

/** How long a proposal is worth confirming. An unconfirmed one changed nothing
 *  anywhere, so expiry is an ordinary ending rather than a failure. */
const PENDING_TTL_MS = 60 * 60 * 1000;

export interface CalendarSummary {
  calendarId: string;
  name: string;
  writable: boolean;
  /** The acting account's own. Only these can be written to. */
  yours: boolean;
}

/** The calendars in the turn's scope, at most twenty, as the model sees them. */
export function summarise(scope: ScopedCalendar[]): CalendarSummary[] {
  return scope.slice(0, 20).map((calendar) => ({
    calendarId: calendar.id,
    name: calendar.name,
    writable: calendar.writable,
    yours: calendar.yours,
  }));
}

export interface FoundEvent {
  sourceRef: string;
  title: string;
  startsAt: string | null;
  calendarId: string;
  /** Somebody else's text: another member's calendar, or an event the person
   *  did not write. Read, never obeyed. */
  untrusted: boolean;
  /** 027. The person's own: on their calendar, and made by them, inviting
   *  them, or not read yet. False for somebody else's day on a shared
   *  calendar and for another member's calendar. */
  yours: boolean;
}

/** What is on the calendars in scope between two moments, from the copy.
 *
 *  Never Google: an answering turn costs no token refresh and no round trip,
 *  and what the model sees is exactly what the rail shows. Capped at fifty. */
export async function findEvents(scope: ScopedCalendar[], from: Date, to: Date): Promise<FoundEvent[]> {
  if (scope.length === 0) return [];
  const rows = await db
    .selectFrom("connector_events as e")
    .select([
      "e.source_ref as sourceRef",
      "e.title as title",
      "e.occurs_at as occursAt",
      "e.calendar_id as calendarId",
      "e.untrusted as untrusted",
      "e.created_by_me as createdByMe",
      "e.invited_me as invitedMe",
    ])
    .where(
      "e.calendar_id",
      "in",
      scope.map((calendar) => calendar.id)
    )
    .where("e.deleted_at", "is", null)
    .where("e.occurs_at", "<=", to)
    .where(sql<boolean>`coalesce(e.occurs_end_at, e.occurs_at) >= ${from}`)
    .orderBy("e.occurs_at")
    .limit(50)
    .execute();

  const yours = new Set(scope.filter((calendar) => calendar.yours).map((calendar) => calendar.id));
  return rows.map((row) => ({
    sourceRef: row.sourceRef,
    title: row.title,
    startsAt: row.occursAt ? row.occursAt.toISOString() : null,
    calendarId: row.calendarId,
    untrusted: row.untrusted || !yours.has(row.calendarId),
    yours:
      yours.has(row.calendarId) &&
      (row.createdByMe === true || row.invitedMe === true || (row.createdByMe === null && row.invitedMe === null)),
  }));
}

/** The calendar an event lives on, among the acting account's own. Another
 *  member's pick is readable and never writable, so an event on one of theirs
 *  is unknown here. */
export async function calendarOfEvent(accountId: string, sourceRef: string): Promise<string | null> {
  const row = await db
    .selectFrom("connector_events as e")
    .innerJoin("connector_calendars as c", "c.id", "e.calendar_id")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select("c.id as id")
    .where("e.source_ref", "=", sourceRef)
    .where("e.deleted_at", "is", null)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .executeTakeFirst();
  return row?.id ?? null;
}

export type ToolWriteOutcome =
  | { kind: "refused"; reason: "unknown_calendar" | "read_only" | "needs_reconnect" }
  | { kind: "written"; sourceRef: string | null }
  | { kind: "pending"; pendingId: string; line: string };

/** Perform it, or propose it. Never ask the model which.
 *
 *  The decision is the outward test, evaluated here against live state, and the
 *  model receives the answer as a result rather than choosing it. */
export async function writeThroughTool(
  accountId: string,
  calendarId: string,
  write: WriteAction,
  /** The message whose tool call this is. A proposal without one cannot be
   *  reached from any screen, so it would be announced and then expire. */
  messageId: string | null,
  /** 019. The row a create is putting on the calendar. It remembers the event
   *  it became, on a performed write now and on a confirmed one later. */
  contentId: string | null = null,
  /** `confirm`: put it to the person whatever the outward test says. Set by
   *  the tool endpoint for a turn that has read a calendar, because what it
   *  read is text other people wrote (security review 2026-09-22, M11). */
  options: { confirm?: boolean } = {}
): Promise<ToolWriteOutcome> {
  const target = await targetFor(calendarId, accountId);
  if (!target) return { kind: "refused", reason: "unknown_calendar" };
  if (!writable(target)) return { kind: "refused", reason: "read_only" };

  // **A revoked grant is an answer, not a crash.** Uncaught it escaped as a
  // 500, and the planner's loop treats a non-200 as a network blip worth three
  // retries, so a permanent refusal burned the turn's retries against a dead
  // connection and never marked it. It is a refusal the model can relay.
  let token: string;
  let verdict;
  // Read before the write, since the write is what changes it.
  const was = await before(target, write);
  try {
    token = await accessTokenFor(target.connectionId);
    verdict = await verdictFor(target, write, token);
    // The outward reasons win when they apply, since their sentence names who
    // finds out. A write nobody else would notice, in a turn that read a
    // calendar first, is put to the person only when Undo could not take it
    // back: what Undo covers is done, as an add always was.
    if (options.confirm && !verdict.outward && !was) verdict = readCalendarVerdict();
  } catch (error) {
    if (error instanceof GrantRevoked) {
      await markNeedsReauth(target.connectionId);
      return { kind: "refused", reason: "needs_reconnect" };
    }
    throw error;
  }

  if (!verdict.outward) {
    // The same answer for a grant Google refuses at the write itself, which
    // a token that looked fine at the read cannot rule out: on a device the
    // tap drew the failure line, the turn's tool call went out as a 500, and
    // the connection stayed "active" for the next attempt to fail the same way.
    let done;
    try {
      done = await performWrite(target, write, verdict);
    } catch (error) {
      if (error instanceof GrantRevoked) {
        await markNeedsReauth(target.connectionId);
        return { kind: "refused", reason: "needs_reconnect" };
      }
      throw error;
    }
    if (done.sourceRef && write.action === "create") await remember(contentId, target.externalId, done.sourceRef);
    const rows = await follow(accountId, write, messageId);
    // A change or a removal files no row, so this is the turn's record of
    // having done it, and what its Undo reads. Kept the way an agreed proposal
    // is, as one that needed no asking.
    if (was && messageId && write.action !== "create") {
      await db
        .insertInto("connector_pending_writes")
        .values({
          account_id: accountId,
          calendar_id: calendarId,
          content_id: null,
          action: write.action,
          scope: write.scope,
          payload: JSON.stringify({ before: kept(was, write, verdict, rows) }),
          source_ref: write.sourceRef,
          message_id: messageId,
          confirmed_at: new Date(),
          expires_at: new Date(),
        })
        .execute();
    }
    return { kind: "written", sourceRef: done.sourceRef };
  }

  const pending = await db
    .insertInto("connector_pending_writes")
    .values({
      account_id: accountId,
      calendar_id: calendarId,
      content_id: contentId,
      action: write.action,
      scope: write.action === "create" ? null : write.scope,
      // **Stored as JSON, so the Dates in it come back as strings.** A
      // `WriteAction` carries real `Date`s and jsonb has no such type; reading
      // the row back and casting it returned strings where the write path
      // calls `.toISOString()`, which threw on every confirmed write with a
      // time on it. That is the whole point of the confirmation path, and it
      // crashed at the moment somebody tapped. `reviveWrite` below puts them
      // back.
      // The reason rides along so the line can be recomputed for as long as
      // the proposal sits.
      payload: JSON.stringify({ ...write, because: verdict.reason }),
      source_ref: write.action === "create" ? null : write.sourceRef,
      message_id: messageId,
      expires_at: new Date(Date.now() + PENDING_TTL_MS),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { kind: "pending", pendingId: pending.id, line: outwardLine(verdict, cadenceOf(write)) ?? "" };
}

/** A person tapped. Re-run the test against live state, because minutes have
 *  passed and a calendar can be shared in them, then do it. */
export async function confirmPending(accountId: string, pendingId: string): Promise<boolean> {
  const pending = await db
    .selectFrom("connector_pending_writes")
    .selectAll()
    .where("id", "=", pendingId)
    .where("account_id", "=", accountId)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
  if (!pending) return false;

  const target = await targetFor(pending.calendar_id, accountId);
  if (!target || !writable(target)) return false;

  const write = reviveWrite(pending.payload);
  if (!write) return false;
  const token = await accessTokenFor(target.connectionId);
  const verdict = await verdictFor(target, write, token);

  const was = await before(target, write);
  const done = await performWrite(target, write, verdict);
  const rows = await follow(accountId, write, pending.message_id);

  // What it said is not needed again. What the event was is, for the Undo,
  // until that is pressed or the daily purge empties it.
  await db
    .updateTable("connector_pending_writes")
    .set({
      confirmed_at: new Date(),
      payload: JSON.stringify(was ? { before: kept(was, write, verdict, rows) } : {}),
    })
    .where("id", "=", pendingId)
    .execute();

  // The row the proposal was about remembers the event it became. The copy
  // brings the event in on the next sync; nothing is filed into a thread.
  if (done.sourceRef && write.action === "create") {
    await remember(pending.content_id, target.externalId, done.sourceRef);
  }

  // 2026-10-13. The proposals this one stood for: the same calendar and the
  // same reason, so the verdict the person just agreed to is theirs too. One
  // that fails is left open, as a row with no event, and the rest go on.
  for (const other of await alikeOpen(pending, accountId)) {
    const also = reviveWrite(other.payload);
    if (!also) continue;
    try {
      const went = await performWrite(target, also, verdict);
      await db
        .updateTable("connector_pending_writes")
        .set({ confirmed_at: new Date(), payload: JSON.stringify({}) })
        .where("id", "=", other.id)
        .execute();
      if (went.sourceRef && also.action === "create") await remember(other.content_id, target.externalId, went.sourceRef);
    } catch (error) {
      console.warn(JSON.stringify({ at: "calendar.confirm", outcome: "failed", error_type: error instanceof Error ? error.name : typeof error, sibling: true }));
    }
  }

  return true;
}

/** What a change or a removal of one event would need to be taken back.
 *
 *  Read from the copy, before the write. A removal keeps the whole event, to
 *  re-add it; a change keeps the old value of each field it touches and no
 *  other. Null when there is no taking it back: "this and all following"
 *  rewrites a series, and an event with no time in the copy cannot be put
 *  anywhere. The guests are not in the copy (027), so the caller adds them
 *  from what Google said at the moment of the write. */
interface Before {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  timezone?: string | null;
  location?: string | null;
  attendees?: string[];
  /** A change keeps only whether there were guests to tell, never who. */
  notify?: boolean;
  /** The rows a removal took with the event, for Undo to put back. */
  rows?: string[];
}

/** What is stored: a removal needs its guests' addresses to invite them
 *  again, a change needs only to know whether anybody is told. */
function kept(was: Before, write: WriteAction, verdict: OutwardVerdict, rows: string[]): Before {
  return write.action === "delete" ? { ...was, attendees: verdict.audience, rows } : { ...was, notify: verdict.audience.length > 0 };
}

/** The row an event was filed as goes where the event goes.
 *
 *  An add files a row that remembers its event, and Today and the rail draw
 *  the row in the event's place. So a removal that left the row left the
 *  appointment on Today, and a change left it on its old day. One event only:
 *  a series is one row for many events. The account's own rows only, as the
 *  write is its own. Returns the rows a removal took.
 *
 *  The turn is told which thread it changed, so a screen that is open reads
 *  again: a removal files nothing, and Today went on drawing what was gone.
 *
 *  After the write, and never failing it: Google has it by now. */
async function follow(accountId: string, write: WriteAction, messageId: string | null): Promise<string[]> {
  if (write.action === "create" || write.scope !== "one") return [];
  try {
    const rows = await db
      .selectFrom("content")
      .select(["id", "thread_id"])
      .where("account_id", "=", accountId)
      .where("source_ref", "=", write.sourceRef)
      .where("deleted_at", "is", null)
      .execute();
    const ids = rows.map((row) => row.id);
    if (messageId && rows.length > 0) {
      await db
        .insertInto("message_threads")
        .values([...new Set(rows.map((row) => row.thread_id))].map((threadId) => ({ message_id: messageId, thread_id: threadId, landed: false })))
        .onConflict((oc) => oc.columns(["message_id", "thread_id"]).doNothing())
        .execute();
    }
    if (write.action === "delete") {
      for (const id of ids) await deleteContent(accountId, id);
      return ids;
    }
    const patch = write.patch;
    if (ids.length === 0 || (patch.title === undefined && patch.startsAt === undefined && patch.endsAt === undefined)) return [];
    await db
      .updateTable("content")
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.startsAt === undefined ? {} : { occurs_at: patch.startsAt, attrs: sql`attrs || '{"all_day": false}'::jsonb` }),
        ...(patch.endsAt === undefined ? {} : { occurs_end_at: patch.endsAt }),
        updated_at: new Date(),
      })
      .where("id", "in", ids)
      .execute();
  } catch (error) {
    console.error(JSON.stringify({ at: "calendar.follow", outcome: "failed", error_type: error instanceof Error ? error.name : "unknown" }));
  }
  return [];
}

/** Undo of a removal: its rows come back, remembering the event Undo made.
 *  A row past its eight seconds is gone, and the event is then drawn as the
 *  calendar's. */
async function putBack(accountId: string, rows: string[], calendarExternalId: string, sourceRef: string | null): Promise<void> {
  for (const id of rows) {
    try {
      await setArchived(accountId, id, false, { byPerson: false });
      if (!sourceRef) continue;
      await db
        .updateTable("content")
        .set({ source_ref: sourceRef, attrs: sql`attrs || ${JSON.stringify({ calendar: calendarExternalId })}::jsonb` })
        .where("id", "=", id)
        .where("account_id", "=", accountId)
        .execute();
    } catch {
      // Purged, or no longer theirs to read: the event still came back.
    }
  }
}

async function before(target: { calendarId: string }, write: WriteAction): Promise<Before | null> {
  if (write.action === "create" || write.scope !== "one") return null;
  const row = await db
    .selectFrom("connector_events")
    .select(["title", "occurs_at", "occurs_end_at", "all_day", "timezone", "location"])
    .where("calendar_id", "=", target.calendarId)
    .where("source_ref", "=", write.sourceRef)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
  if (!row?.occurs_at) return null;
  const startsAt = row.occurs_at.toISOString();
  const endsAt = (row.occurs_end_at ?? new Date(row.occurs_at.getTime() + 60 * 60 * 1000)).toISOString();

  if (write.action === "delete") {
    return { title: row.title, startsAt, endsAt, allDay: row.all_day, timezone: row.timezone, location: row.location };
  }
  return {
    ...(write.patch.title === undefined ? {} : { title: row.title }),
    ...(write.patch.startsAt === undefined ? {} : { startsAt }),
    ...(write.patch.endsAt === undefined ? {} : { endsAt }),
    ...(write.patch.location === undefined ? {} : { location: row.location }),
  };
}

/** Take back what a turn changed on or removed from a calendar.
 *
 *  A removal is re-added from what was kept, guests included, so they are
 *  told again; a change gets its old values back. Newest first, so two
 *  changes to one event in one turn unwind in order. Each is emptied as it
 *  is taken back, so a second press re-adds nothing.
 *
 *  Best effort, as the add's Undo is: Google refusing leaves the event as it
 *  is and what was kept in place, and the rest of the turn still undoes. */
export async function undoToolWrites(accountId: string, turnId: string, since?: string): Promise<void> {
  const rows = await db
    .selectFrom("connector_pending_writes as p")
    .innerJoin("messages as m", "m.id", "p.message_id")
    .select(["p.id as id", "p.calendar_id as calendarId", "p.action as action", "p.source_ref as sourceRef", "p.payload as payload"])
    .where("m.turn_id", "=", turnId)
    .where("p.account_id", "=", accountId)
    .where("p.confirmed_at", "is not", null)
    .where(sql<boolean>`p.payload ? 'before'`)
    .$if(since !== undefined, (qb) => qb.where("p.confirmed_at", "<=", sql<Date>`${since}::timestamptz`))
    .orderBy("p.confirmed_at", "desc")
    .execute();

  for (const row of rows) {
    const was = (row.payload as { before?: Before }).before;
    if (!was) continue;
    const at = (value: string | undefined): Date | undefined => (value ? new Date(value) : undefined);
    try {
      const target = await targetFor(row.calendarId, accountId);
      if (!target || !writable(target)) continue;
      const attendees = was.attendees ?? [];
      // Nobody is asked: it is their own Undo. Guests are told, since the
      // removal told them.
      const verdict: OutwardVerdict = { outward: false, notify: was.notify ?? attendees.length > 0, audience: attendees, reason: "none" };
      const startsAt = at(was.startsAt);
      const endsAt = at(was.endsAt);
      if (row.action === "delete") {
        if (!was.title || !startsAt || !endsAt) continue;
        const readded = await performWrite(
          target,
          {
            action: "create",
            draft: { title: was.title, startsAt, endsAt, allDay: was.allDay ?? false, timezone: was.timezone ?? null, location: was.location ?? null, attendees },
          },
          verdict,
        );
        await putBack(accountId, was.rows ?? [], target.externalId, readded.sourceRef);
      } else if (row.action === "edit" && row.sourceRef) {
        const back: WriteAction = {
          action: "edit",
          sourceRef: row.sourceRef,
          scope: "one",
          patch: {
            ...(was.title === undefined ? {} : { title: was.title }),
            ...(startsAt ? { startsAt } : {}),
            ...(endsAt ? { endsAt } : {}),
            ...(was.location === undefined ? {} : { location: was.location }),
          },
        };
        await performWrite(target, back, verdict);
        await follow(accountId, back, null);
      } else continue;
      await db.updateTable("connector_pending_writes").set({ payload: JSON.stringify({}) }).where("id", "=", row.id).execute();
    } catch {
      // Left as it is, with what was kept still there for another press.
    }
  }
}

/** A row that went on the calendar remembers which event it became, so it is
 *  not put on again and the rail draws it once. */
async function remember(contentId: string | null, calendarExternalId: string, sourceRef: string): Promise<void> {
  if (!contentId) return;
  await db
    .updateTable("content")
    .set({
      source_ref: sourceRef,
      attrs: sql`attrs || ${JSON.stringify({ calendar: calendarExternalId })}::jsonb`,
      updated_at: new Date(),
    })
    .where("id", "=", contentId)
    .where("source_ref", "is", null)
    .execute();
}

/** Put the `Date`s back after a round trip through jsonb.
 *
 *  Checked rather than cast. The row was written by this service and should be
 *  the right shape, but "should be" is what the cast assumed and it was wrong
 *  about a type the database cannot store. */
export function reviveWrite(payload: unknown): WriteAction | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const at = (value: unknown): Date | null => {
    if (typeof value !== "string") return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  if (raw["action"] === "create") {
    const draft = (raw["draft"] ?? {}) as Record<string, unknown>;
    const startsAt = at(draft["startsAt"]);
    const endsAt = at(draft["endsAt"]);
    if (!startsAt || !endsAt) return null;
    return {
      action: "create",
      draft: { ...(draft as unknown as EventDraft), startsAt, endsAt },
    };
  }

  if (raw["action"] === "delete") {
    if (typeof raw["sourceRef"] !== "string") return null;
    return { action: "delete", sourceRef: raw["sourceRef"], scope: raw["scope"] === "following" ? "following" : "one" };
  }

  if (raw["action"] === "edit") {
    if (typeof raw["sourceRef"] !== "string") return null;
    const patch = { ...((raw["patch"] ?? {}) as Record<string, unknown>) };
    for (const key of ["startsAt", "endsAt"] as const) {
      if (patch[key] === undefined) continue;
      const date = at(patch[key]);
      if (!date) return null;
      patch[key] = date;
    }
    return {
      action: "edit",
      sourceRef: raw["sourceRef"],
      scope: raw["scope"] === "following" ? "following" : "one",
      patch: patch as unknown as Partial<EventDraft>,
    };
  }

  return null;
}

export async function declinePending(accountId: string, pendingId: string): Promise<boolean> {
  const pending = await db
    .selectFrom("connector_pending_writes")
    .select(["id", "action", "message_id", "calendar_id", "payload"])
    .where("id", "=", pendingId)
    .where("account_id", "=", accountId)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .executeTakeFirst();
  if (!pending) return false;
  // 2026-10-13. The proposals this one stood for are declined with it.
  const ids = [pending.id, ...(await alikeOpen(pending, accountId)).map((other) => other.id)];
  const result = await db
    .updateTable("connector_pending_writes")
    .set({ declined_at: new Date() })
    .where("id", "in", ids)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0) > 0;
}

/** 027. A proposal nobody can answer any more, forgotten.
 *
 *  The payload holds the guests' addresses, the title and the place, and once
 *  a proposal is confirmed, declined or past its hour nothing reads what it
 *  said. So the daily purge deletes a declined or expired one, rather than
 *  letting the addresses of people offload invited sit here for good.
 *
 *  **A confirmed one keeps its row and nothing in it.** That includes what
 *  was kept of a changed or removed event for its Undo, guests' addresses
 *  among it: a day at most, then gone. That it happened is
 *  the turn's record of having done something, which is what draws Done after
 *  a reload (`confirmedFor`); the payload and the event's reference are
 *  emptied, so what stays is an id, a message and two times. */
export async function forgetPendingWrites(): Promise<number> {
  const gone = await db
    .deleteFrom("connector_pending_writes")
    .where("confirmed_at", "is", null)
    .where((eb) => eb.or([eb("declined_at", "is not", null), eb("expires_at", "<", new Date())]))
    .executeTakeFirst();
  const emptied = await db
    .updateTable("connector_pending_writes")
    .set({ payload: JSON.stringify({}), source_ref: null })
    .where("confirmed_at", "is not", null)
    .where(sql<boolean>`payload <> '{}'::jsonb`)
    .executeTakeFirst();
  return Number(gone.numDeletedRows ?? 0) + Number(emptied.numUpdatedRows ?? 0);
}

/** Which of these messages carry a calendar write that happened: one the
 *  person agreed to, or a change or removal that needed no asking.
 *
 *  Scoped to the account as well as the messages: the caller holds message
 *  ids it has already checked, and this does not lean on that. */
export async function confirmedFor(messageIds: string[], accountId: string): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const rows = await db
    .selectFrom("connector_pending_writes")
    .select("message_id")
    .where("message_id", "in", messageIds)
    .where("account_id", "=", accountId)
    .where("confirmed_at", "is not", null)
    .execute();
  return new Set(rows.flatMap((row) => (row.message_id ? [row.message_id] : [])));
}

/** The proposal a turn is waiting on, if it has one.
 *
 *  One per message at most in practice, and the newest wins if a turn somehow
 *  proposed twice: the person answers what they were last told about. */
export async function waitingFor(
  messageIds: string[]
): Promise<Map<string, { id: string; because: string; action: WriteAction["action"] }>> {
  const found = new Map<string, { id: string; because: string; action: WriteAction["action"] }>();
  if (messageIds.length === 0) return found;

  const rows = await db
    .selectFrom("connector_pending_writes")
    .select(["id", "message_id", "payload", "calendar_id", "action"])
    .where("message_id", "in", messageIds)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .where("expires_at", ">", new Date())
    .orderBy("created_at", "desc")
    .execute();

  for (const row of rows) {
    if (!row.message_id || found.has(row.message_id)) continue;
    // The action travels so the control can say what the tap does: "Add it"
    // under a proposal to remove an event was the label for every one of them.
    const action = row.action === "edit" || row.action === "delete" ? row.action : "create";
    const more = rows.filter((other) => alike(row, other)).length;
    found.set(row.message_id, { id: row.id, because: becauseOf(row.payload, more + 1), action });
  }
  return found;
}

/** 2026-10-13. The proposals one tap answers: creates on one message, to one
 *  calendar, for one reason, with no guests. Eight classes filed in one turn
 *  made eight proposals on one message, the screen drew the newest, and the
 *  other seven had no control and sat until the purge. One control stands
 *  for all of them, its line counts them, and the tap agrees to or declines
 *  every one. Guests keep a proposal of their own: who is told is on its
 *  line, and that line names one event's guests. */
type PendingShape = { id: string; action: string; message_id: string | null; calendar_id: string; payload: unknown };
function alike(head: PendingShape, other: PendingShape): boolean {
  if (head.id === other.id || head.action !== "create" || other.action !== "create") return false;
  if (!head.message_id || head.message_id !== other.message_id || head.calendar_id !== other.calendar_id) return false;
  const a = reviveWrite(head.payload);
  const b = reviveWrite(other.payload);
  if (a?.action !== "create" || b?.action !== "create") return false;
  if ((a.draft.attendees ?? []).length > 0 || (b.draft.attendees ?? []).length > 0) return false;
  return reasonOf(head.payload) === reasonOf(other.payload);
}

function reasonOf(payload: unknown): string | null {
  return (payload as { because?: string } | null)?.because ?? null;
}

/** The open proposals a tap on `head` also answers. */
async function alikeOpen(head: PendingShape, accountId: string): Promise<Array<PendingShape & { content_id: string | null }>> {
  if (!head.message_id) return [];
  const rows = await db
    .selectFrom("connector_pending_writes")
    .select(["id", "action", "message_id", "calendar_id", "payload", "content_id"])
    .where("message_id", "=", head.message_id)
    .where("account_id", "=", accountId)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .where("expires_at", ">", new Date())
    .orderBy("created_at", "asc")
    .execute();
  return rows.filter((row) => alike(head, row));
}

/** Who finds out, in the words the screen shows.
 *
 *  Recomputed from the stored payload rather than saved as a string, so a
 *  proposal that sat for an hour still describes itself the way the code does
 *  now. Guests are named because the person is about to be told which of their
 *  guests this reaches. */
function becauseOf(payload: unknown, count = 1): string {
  const write = reviveWrite(payload);
  const guests =
    write?.action === "create"
      ? (write.draft.attendees ?? [])
      : write?.action === "edit"
        ? (write.patch.attendees ?? [])
        : [];

  const reason = (payload as { because?: OutwardVerdict["reason"] } | null)?.because;
  const verdict: OutwardVerdict = {
    outward: true,
    notify: guests.length > 0,
    audience: guests,
    // **The stored reason, not a guess at it.** A turn that read a calendar
    // confirms a change to an event nobody else can see, and anything that was
    // not "asked_for" used to read as a shared calendar here: the control said
    // everyone on the calendar would see it, about a calendar with one person.
    reason:
      guests.length > 0
        ? "guests"
        : reason === "asked_for" || reason === "read_calendar"
          ? reason
          : "shared_calendar",
  };
  const line = outwardLine(verdict, cadenceOf(write)) ?? "Everyone on this calendar will see it.";
  // 2026-10-13. How many the one tap agrees to, when it is more than one.
  return count > 1 ? `${line} ${count} events.` : line;
}

/** 023. What a series says about itself on the line, read off the draft's
 *  rule and its first day. Null for a single event. */
function cadenceOf(write: WriteAction | null | undefined): string | null {
  if (write?.action !== "create") return null;
  const line = write.draft.recurrence?.find((one) => one.startsWith("RRULE:"));
  if (!line) return null;
  const parsed = parseRule(line.slice("RRULE:".length));
  return parsed.ok ? describeRule(parsed.rule, write.draft.startsAt.toISOString().slice(0, 10)) : null;
}
