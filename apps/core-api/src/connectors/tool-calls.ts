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
  try {
    token = await accessTokenFor(target.connectionId);
    verdict = await verdictFor(target, write, token);
    // The outward reasons win when they apply, since their sentence names who
    // finds out; a write nobody else would notice is still put to the person
    // when the turn read a calendar first.
    if (options.confirm && !verdict.outward) verdict = readCalendarVerdict();
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

  const done = await performWrite(target, write, verdict);

  await db
    .updateTable("connector_pending_writes")
    .set({ confirmed_at: new Date() })
    .where("id", "=", pendingId)
    .execute();

  // The row the proposal was about remembers the event it became. The copy
  // brings the event in on the next sync; nothing is filed into a thread.
  if (done.sourceRef && write.action === "create") {
    await remember(pending.content_id, target.externalId, done.sourceRef);
  }

  return true;
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
  const result = await db
    .updateTable("connector_pending_writes")
    .set({ declined_at: new Date() })
    .where("id", "=", pendingId)
    .where("account_id", "=", accountId)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0) > 0;
}

/** The proposal a turn is waiting on, if it has one.
 *
 *  One per message at most in practice, and the newest wins if a turn somehow
 *  proposed twice: the person answers what they were last told about. */
export async function waitingFor(
  messageIds: string[]
): Promise<Map<string, { id: string; because: string }>> {
  const found = new Map<string, { id: string; because: string }>();
  if (messageIds.length === 0) return found;

  const rows = await db
    .selectFrom("connector_pending_writes")
    .select(["id", "message_id", "payload", "calendar_id"])
    .where("message_id", "in", messageIds)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .where("expires_at", ">", new Date())
    .orderBy("created_at", "desc")
    .execute();

  for (const row of rows) {
    if (!row.message_id || found.has(row.message_id)) continue;
    found.set(row.message_id, { id: row.id, because: becauseOf(row.payload) });
  }
  return found;
}

/** Who finds out, in the words the screen shows.
 *
 *  Recomputed from the stored payload rather than saved as a string, so a
 *  proposal that sat for an hour still describes itself the way the code does
 *  now. Guests are named because the person is about to be told which of their
 *  guests this reaches. */
function becauseOf(payload: unknown): string {
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
    reason: guests.length > 0 ? "guests" : reason === "asked_for" ? "asked_for" : "shared_calendar",
  };
  return outwardLine(verdict, cadenceOf(write)) ?? "Everyone on this calendar will see it.";
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
