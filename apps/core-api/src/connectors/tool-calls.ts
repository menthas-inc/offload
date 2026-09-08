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

import { db } from "../db.js";
import { mapEvent, sourceRefFor } from "./events.js";
import { GrantRevoked, listEvents, type EventDraft } from "./google.js";
import { outwardLine } from "./outward.js";
import { accessTokenFor, markNeedsReauth } from "./tokens.js";
import { performWrite, targetFor, verdictFor, writable, type WriteAction } from "./write.js";

/** How long a proposal is worth confirming. An unconfirmed one changed nothing
 *  anywhere, so expiry is an ordinary ending rather than a failure. */
const PENDING_TTL_MS = 60 * 60 * 1000;

export interface CalendarSummary {
  calendarId: string;
  name: string;
  writable: boolean;
  shared: boolean;
}

export async function listCalendarsFor(accountId: string): Promise<CalendarSummary[]> {
  const rows = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select(["c.id as id", "c.summary as summary", "c.access_role as role", "c.is_shared as shared"])
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .where("n.state", "=", "active")
    .orderBy("c.is_primary", "desc")
    .execute();

  return rows.map((row) => ({
    calendarId: row.id,
    name: row.summary,
    writable: row.role === "owner" || row.role === "writer",
    shared: row.shared,
  }));
}

export interface FoundEvent {
  sourceRef: string;
  title: string;
  startsAt: string | null;
  calendarId: string;
}

/** What is on somebody's calendar between two dates.
 *
 *  Read live rather than from `content`, so the model sees the calendar as it
 *  is now rather than as the last sync left it, and so a calendar that is
 *  connected but not filing anywhere can still be answered about. */
export async function findEvents(
  accountId: string,
  calendarId: string,
  from: Date,
  to: Date
): Promise<FoundEvent[] | "needs_reconnect"> {
  const target = await targetFor(calendarId, accountId);
  if (!target) return [];

  let token: string;
  try {
    token = await accessTokenFor(target.connectionId);
  } catch (error) {
    if (error instanceof GrantRevoked) {
      await markNeedsReauth(target.connectionId);
      return "needs_reconnect";
    }
    throw error;
  }

  const page = await listEvents(token, target.externalId, { syncToken: null, timeMin: from, timeMax: to });
  if (page === "resync") return [];

  return page.events
    .filter((event) => event.status !== "cancelled")
    .map((event) => ({
      sourceRef: sourceRefFor(target.externalId, event.externalId),
      title: event.title,
      startsAt: event.startsAt ? event.startsAt.toISOString() : null,
      calendarId,
    }));
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
  messageId: string | null
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
  } catch (error) {
    if (error instanceof GrantRevoked) {
      await markNeedsReauth(target.connectionId);
      return { kind: "refused", reason: "needs_reconnect" };
    }
    throw error;
  }

  if (!verdict.outward) {
    const done = await performWrite(target, write, verdict);
    return { kind: "written", sourceRef: done.sourceRef };
  }

  const pending = await db
    .insertInto("connector_pending_writes")
    .values({
      account_id: accountId,
      calendar_id: calendarId,
      action: write.action,
      scope: write.action === "create" ? null : write.scope,
      // **Stored as JSON, so the Dates in it come back as strings.** A
      // `WriteAction` carries real `Date`s and jsonb has no such type; reading
      // the row back and casting it returned strings where the write path
      // calls `.toISOString()`, which threw on every confirmed write with a
      // time on it. That is the whole point of the confirmation path, and it
      // crashed at the moment somebody tapped. `reviveWrite` below puts them
      // back.
      payload: JSON.stringify(write),
      source_ref: write.action === "create" ? null : write.sourceRef,
      message_id: messageId,
      expires_at: new Date(Date.now() + PENDING_TTL_MS),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { kind: "pending", pendingId: pending.id, line: outwardLine(verdict) ?? "" };
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

  // Filed straight away rather than waiting for the next sync, so the thing
  // they just agreed to is on screen when they look.
  if (done.sourceRef && write.action === "create") {
    const calendar = await db
      .selectFrom("connector_calendars")
      .select(["external_id", "default_thread_id"])
      .where("id", "=", pending.calendar_id)
      .executeTakeFirst();
    if (calendar?.default_thread_id) {
      const draft = (write as { draft: EventDraft }).draft;
      const eventId = done.sourceRef.split(":").slice(1).join(":");
      await db
        .insertInto("content")
        .values({
          account_id: accountId,
          thread_id: calendar.default_thread_id,
          type: "event",
          title: draft.title,
          occurs_at: draft.startsAt,
          occurs_end_at: draft.endsAt,
          source: "calendar",
          source_ref: done.sourceRef,
          attrs: JSON.stringify(
            mapEvent(
              {
                externalId: eventId,
                seriesId: null,
                status: "confirmed",
                title: draft.title,
                location: draft.location ?? null,
                startsAt: draft.startsAt,
                endsAt: draft.endsAt,
                allDay: draft.allDay ?? false,
                timezone: draft.timezone ?? null,
                organizedByMe: true,
                attendees: (draft.attendees ?? []).map((email) => ({ name: null, email, response: null })),
              },
              calendar.external_id,
              calendar.default_thread_id
            ).attrs
          ),
        })
        .onConflict((oc) => oc.columns(["account_id", "source_ref"]).where("source_ref", "is not", null).doNothing())
        .execute();
    }
  }

  return true;
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

  if (guests.length === 1) return `${guests[0]} will be told.`;
  if (guests.length > 1) return `${guests.length} guests will be told.`;
  return "Everyone on this calendar will see it.";
}
