// Writing to somebody's calendar, which is the only thing in this product that
// leaves offload.
//
// **One function decides outward-facing and both callers reach it here.** A
// screen and the model take the same path, and the model is told the outcome
// rather than supplying it: some of what it just read was written by a
// stranger, so a field it could set to skip a confirmation would be the whole
// defence handed to the attacker.

import { db } from "../db.js";
import {
  createEvent,
  deleteEvent,
  getEvent,
  GrantRevoked,
  patchEvent,
  type EventDraft,
} from "./google.js";
import { outwardTest, type OutwardVerdict } from "./outward.js";
import { truncate, type Scope } from "./recurrence.js";
import { accessTokenFor, markNeedsReauth } from "./tokens.js";
import { sourceRefFor } from "./events.js";

export interface CalendarTarget {
  calendarId: string;
  externalId: string;
  connectionId: string;
  accountId: string;
  isShared: boolean;
  accessRole: string;
  timezone: string | null;
}

/** The calendar, and whether this account may write to it at all.
 *
 *  Ownership through the connection, because `connector_calendars` carries no
 *  account column and a join that is never checked is not authorization. */
export async function targetFor(
  calendarId: string,
  accountId: string
): Promise<CalendarTarget | null> {
  const row = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select([
      "c.id as calendarId",
      "c.external_id as externalId",
      "c.is_shared as isShared",
      "c.access_role as accessRole",
      "c.timezone as timezone",
      "n.id as connectionId",
      "n.account_id as accountId",
    ])
    .where("c.id", "=", calendarId)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .where("n.state", "=", "active")
    .executeTakeFirst();

  return row ?? null;
}

export function writable(target: CalendarTarget): boolean {
  return target.accessRole === "owner" || target.accessRole === "writer";
}

export type WriteAction =
  | { action: "create"; draft: EventDraft }
  | { action: "edit"; sourceRef: string; patch: Partial<EventDraft>; scope: Scope }
  | { action: "delete"; sourceRef: string; scope: Scope };

/** What this write would mean, before it happens.
 *
 *  Read live from Google, because a calendar can be shared and an event can gain
 *  a guest in the minutes between somebody asking and somebody agreeing. */
export async function verdictFor(
  target: CalendarTarget,
  write: WriteAction,
  accessToken: string
): Promise<OutwardVerdict> {
  const eventId = write.action === "create" ? null : write.sourceRef.split(":").slice(1).join(":");
  const existing = eventId ? await getEvent(accessToken, target.externalId, eventId) : null;

  const attendeesBefore = existing?.attendees ?? [];
  const attendeesAfter =
    write.action === "delete"
      ? attendeesBefore
      : write.action === "create"
        ? (write.draft.attendees ?? [])
        : (write.patch.attendees ?? attendeesBefore);

  return outwardTest({ attendeesBefore, attendeesAfter, calendarIsShared: target.isShared });
}

export interface WriteResult {
  sourceRef: string | null;
  verdict: OutwardVerdict;
}

/** Do it. The caller has already decided it is allowed to happen now: either it
 *  was not outward facing, or somebody tapped. */
export async function performWrite(
  target: CalendarTarget,
  write: WriteAction,
  verdict: OutwardVerdict
): Promise<WriteResult> {
  let accessToken: string;
  try {
    accessToken = await accessTokenFor(target.connectionId);
  } catch (error) {
    if (error instanceof GrantRevoked) await markNeedsReauth(target.connectionId);
    throw error;
  }

  if (write.action === "create") {
    const id = await createEvent(accessToken, target.externalId, write.draft, verdict.notify);
    return { sourceRef: sourceRefFor(target.externalId, id), verdict };
  }

  const eventId = write.sourceRef.split(":").slice(1).join(":");

  if (write.action === "delete") {
    if (write.scope === "one") {
      await deleteEvent(accessToken, target.externalId, eventId, verdict.notify);
      return { sourceRef: write.sourceRef, verdict };
    }
    // This and all following: end the series rather than delete it, so every
    // past occurrence survives.
    //
    // The rule is read from the series rather than assumed. Writing
    // `FREQ=WEEKLY` because most things are weekly would quietly turn somebody's
    // monthly rent reminder into a weekly one on the way to ending it.
    const existing = await getEvent(accessToken, target.externalId, eventId);
    const seriesId = existing?.seriesId ?? eventId;
    const series = seriesId === eventId ? existing : await getEvent(accessToken, target.externalId, seriesId);

    if (existing?.startsAt && series?.recurrence.length) {
      await patchEvent(
        accessToken,
        target.externalId,
        seriesId,
        { recurrence: truncate(series.recurrence, existing.startsAt) },
        verdict.notify
      );
    } else {
      // Not a series after all, so there is nothing to end and the occurrence
      // itself is the whole event.
      await deleteEvent(accessToken, target.externalId, eventId, verdict.notify);
    }
    return { sourceRef: write.sourceRef, verdict };
  }

  // An edit of one occurrence is a patch on that instance, and Google records
  // the exception itself.
  const patch: Record<string, unknown> = {};
  if (write.patch.title !== undefined) patch["summary"] = write.patch.title;
  if (write.patch.location !== undefined) patch["location"] = write.patch.location;
  if (write.patch.startsAt) {
    patch["start"] = { dateTime: write.patch.startsAt.toISOString(), ...(target.timezone ? { timeZone: target.timezone } : {}) };
  }
  if (write.patch.endsAt) {
    patch["end"] = { dateTime: write.patch.endsAt.toISOString(), ...(target.timezone ? { timeZone: target.timezone } : {}) };
  }
  if (write.patch.attendees) patch["attendees"] = write.patch.attendees.map((email) => ({ email }));

  await patchEvent(accessToken, target.externalId, eventId, patch, verdict.notify);
  return { sourceRef: write.sourceRef, verdict };
}

/** Take back a write nobody else learned about, inside the Undo window.
 *
 *  **Google first, and the local row only if that worked.** Every other Undo in
 *  this product is a local soft delete; this one has to reach outside, because
 *  the effect already left. If Google refuses, nothing local changes, so offload
 *  and the calendar never disagree, and the line says the event is still there
 *  without guessing which of the two was at fault. */
export async function undoWrite(target: CalendarTarget, sourceRef: string): Promise<boolean> {
  const eventId = sourceRef.split(":").slice(1).join(":");
  try {
    const accessToken = await accessTokenFor(target.connectionId);
    await deleteEvent(accessToken, target.externalId, eventId, false);
  } catch {
    return false;
  }

  await db
    .updateTable("content")
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where("account_id", "=", target.accountId)
    .where("source_ref", "=", sourceRef)
    .where("deleted_at", "is", null)
    .execute();

  return true;
}
