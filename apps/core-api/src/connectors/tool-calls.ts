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
import { listEvents, type EventDraft } from "./google.js";
import { outwardLine } from "./outward.js";
import { accessTokenFor } from "./tokens.js";
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
): Promise<FoundEvent[]> {
  const target = await targetFor(calendarId, accountId);
  if (!target) return [];

  const token = await accessTokenFor(target.connectionId);
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
  | { kind: "refused"; reason: "unknown_calendar" | "read_only" }
  | { kind: "written"; sourceRef: string | null }
  | { kind: "pending"; pendingId: string; line: string };

/** Perform it, or propose it. Never ask the model which.
 *
 *  The decision is the outward test, evaluated here against live state, and the
 *  model receives the answer as a result rather than choosing it. */
export async function writeThroughTool(
  accountId: string,
  calendarId: string,
  write: WriteAction
): Promise<ToolWriteOutcome> {
  const target = await targetFor(calendarId, accountId);
  if (!target) return { kind: "refused", reason: "unknown_calendar" };
  if (!writable(target)) return { kind: "refused", reason: "read_only" };

  const token = await accessTokenFor(target.connectionId);
  const verdict = await verdictFor(target, write, token);

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
      payload: JSON.stringify(write),
      source_ref: write.action === "create" ? null : write.sourceRef,
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

  const write = pending.payload as WriteAction;
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
