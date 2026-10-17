// Writing to somebody's calendar, which is the only thing in this product that
// leaves offload.
//
// **One function decides outward-facing and both callers reach it here.** A
// screen and the model take the same path, and the model is told the outcome
// rather than supplying it: some of what it just read was written by a
// stranger, so a field it could set to skip a confirmation would be the whole
// defence handed to the attacker.

import { sql } from "kysely";
import { db } from "../db.js";
import {
  countParticipants,
  createEvent,
  deleteEvent,
  getEvent,
  GrantRevoked,
  patchEvent,
  type EventDraft,
} from "./google.js";
import { grantsAcl } from "./google.js";
import { logParticipantsFailed } from "./calendars.js";
import { outwardTest, type OutwardVerdict } from "./outward.js";
import { truncate, type Scope } from "./recurrence.js";
import { accessTokenFor, markNeedsReauth } from "./tokens.js";
import { sourceRefFor, upsertEvent } from "./events.js";
import { syncNow } from "./sync.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface CalendarTarget {
  calendarId: string;
  externalId: string;
  connectionId: string;
  accountId: string;
  /** Null: not owned, or the grant lacks the scope. Read as more than one. */
  participants: number | null;
  /** Whether the connection's grant carries the access-list scope, so the
   *  write path knows whether a fresh count can be read. */
  grantsAcl: boolean;
  askFirst: boolean;
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
    .innerJoin("accounts as a", "a.id", "n.account_id")
    .leftJoin("connector_secrets as s", "s.connection_id", "n.id")
    .select([
      "c.id as calendarId",
      "c.external_id as externalId",
      "c.participants as participants",
      "c.access_role as accessRole",
      "c.timezone as timezone",
      "n.id as connectionId",
      "n.account_id as accountId",
      "a.calendar_ask_first as askFirst",
      "s.scope as scope",
    ])
    .where("c.id", "=", calendarId)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .executeTakeFirst();

  if (!row) return null;
  const { scope, ...target } = row;
  return { ...target, grantsAcl: grantsAcl(scope) };
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

  let existing: Awaited<ReturnType<typeof getEvent>> = null;
  if (eventId) {
    try {
      existing = await getEvent(accessToken, target.externalId, eventId);
    } catch {
      // **Fail closed.** If the event cannot be read we do not know who is on
      // it, and guessing "nobody" is the one guess that skips a confirmation.
      // Treated as outward, so a person decides rather than offload deciding
      // on their behalf from a failed request.
      return { outward: true, notify: true, audience: [], reason: "guests" };
    }
  }

  const attendeesBefore = existing?.attendees ?? [];
  const attendeesAfter =
    write.action === "delete"
      ? attendeesBefore
      : write.action === "create"
        ? (write.draft.attendees ?? [])
        : (write.patch.attendees ?? attendeesBefore);

  return outwardTest({
    attendeesBefore,
    attendeesAfter,
    participants: await freshParticipants(target, accessToken),
    askFirst: target.askFirst,
  });
}

/** The calendar's participant count, read again now for a calendar the person
 *  owns on a grant that allows it, the way the event's guests are read live
 *  above: a calendar shared at noon confirms at noon rather than after the
 *  nightly pass. The fresh count is written back. A read that fails leaves the
 *  stored count, and a stored null reads as more than one. */
async function freshParticipants(target: CalendarTarget, accessToken: string): Promise<number | null> {
  if (target.accessRole !== "owner" || !target.grantsAcl) return target.participants;
  try {
    const count = await countParticipants(accessToken, target.externalId);
    await db
      .updateTable("connector_calendars")
      .set({ participants: count, participants_read_at: new Date(), updated_at: new Date() })
      .where("id", "=", target.calendarId)
      .execute();
    return count;
  } catch (error) {
    if (error instanceof GrantRevoked) throw error;
    logParticipantsFailed(target.calendarId, error);
    return target.participants;
  }
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
  const done = await writeToGoogle(target, write, verdict);
  // Google has it by now, so nothing below may fail the write.
  try {
    await mirror(target, write, done.sourceRef);
    await syncNow(target.connectionId);
  } catch (error) {
    console.error(
      JSON.stringify({ at: "calendar.mirror", outcome: "failed", error_type: error instanceof Error ? error.name : "unknown" })
    );
  }
  return done;
}

/** The copy, kept in step with a write offload made itself.
 *
 *  Every read a turn makes is of the copy, and the copy only moved on the
 *  quarter-hour sync. So an event added a minute ago was not there to find:
 *  "delete it" answered that there was no such event, on a calendar showing
 *  it. One event is written here as it was sent. A series and "this and all
 *  following" are left to the sync asked for beside this, which reads the
 *  occurrences Google made of them. */
async function mirror(target: CalendarTarget, write: WriteAction, sourceRef: string | null): Promise<void> {
  if (write.action === "create") {
    const draft = write.draft;
    if (!sourceRef || draft.recurrence?.length) return;
    await upsertEvent(db, target.accountId, target.calendarId, {
      sourceRef,
      title: draft.title,
      occursAt: draft.startsAt,
      occursEndAt: draft.endsAt,
      allDay: draft.allDay ?? false,
      timezone: draft.timezone ?? target.timezone,
      location: draft.location ?? null,
      seriesRef: null,
      organizerIsMe: true,
      untrusted: false,
      link: null,
      createdByMe: true,
      invitedMe: false,
      going: true,
    });
    return;
  }
  if (write.scope !== "one") return;

  const now = new Date();
  const patch = write.action === "delete" ? null : write.patch;
  await db
    .updateTable("connector_events")
    .set(
      patch === null
        ? { deleted_at: now, updated_at: now }
        : {
            ...(patch.title === undefined ? {} : { title: patch.title }),
            ...(patch.startsAt === undefined ? {} : { occurs_at: patch.startsAt }),
            ...(patch.endsAt === undefined ? {} : { occurs_end_at: patch.endsAt }),
            ...(patch.location === undefined ? {} : { location: patch.location }),
            updated_at: now,
          }
    )
    .where("calendar_id", "=", target.calendarId)
    .where("source_ref", "=", write.sourceRef)
    .where("deleted_at", "is", null)
    .execute();
}

async function writeToGoogle(
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
        { recurrence: truncate(series.recurrence, existing.startsAt, series.allDay) },
        verdict.notify
      );
    } else {
      // Not a series after all, so there is nothing to end and the occurrence
      // itself is the whole event.
      await deleteEvent(accessToken, target.externalId, eventId, verdict.notify);
    }
    return { sourceRef: write.sourceRef, verdict };
  }

  // **This and all following**: end the old series at this occurrence and
  // start a new one carrying the change, so no past occurrence moves.
  //
  // New series first, then truncate the old, so a failure between the two
  // calls leaves a visible duplicate rather than a silent hole: a missing
  // standup is neither obvious nor fixable and a duplicate is both.
  let existing: Awaited<ReturnType<typeof getEvent>> = null;
  if (write.scope === "following") {
    existing = await getEvent(accessToken, target.externalId, eventId);
    const seriesId = existing?.seriesId ?? eventId;
    const series = seriesId === eventId ? existing : await getEvent(accessToken, target.externalId, seriesId);
    // shortcut: a counted rule cannot be split without counting the
    // occurrences before the split, and a copied COUNT runs past the old end,
    // so it moves this occurrence alone. Count them via instances if asked for.
    const counted = series?.recurrence.some((line) => line.startsWith("RRULE:") && line.includes("COUNT=")) ?? false;

    if (existing?.startsAt && series?.startsAt && series.recurrence.length && !counted) {
      const startsAt = write.patch.startsAt ?? existing.startsAt;
      const span = (series.endsAt?.getTime() ?? series.startsAt.getTime() + HOUR) - series.startsAt.getTime();

      // The old series moved, with the change on top: its title, length, place
      // and guests, and its rule as it was, so an UNTIL ends both on one day.
      await createEvent(
        accessToken,
        target.externalId,
        {
          title: write.patch.title ?? series.title,
          startsAt,
          endsAt: write.patch.endsAt ?? new Date(startsAt.getTime() + span),
          allDay: series.allDay,
          location: write.patch.location === undefined ? series.location : write.patch.location,
          attendees: write.patch.attendees ?? series.attendees,
          timezone: series.timezone ?? target.timezone,
          recurrence: series.recurrence,
        },
        verdict.notify
      );

      await patchEvent(
        accessToken,
        target.externalId,
        seriesId,
        { recurrence: truncate(series.recurrence, existing.startsAt, series.allDay) },
        verdict.notify
      );

      return { sourceRef: write.sourceRef, verdict };
    }
    // Not a series after all, so there is nothing to split and the occurrence
    // is the whole event. Falls through to the ordinary patch below.
  }

  // An edit of one occurrence is a patch on that instance, and Google records
  // the exception itself.
  const patch: Record<string, unknown> = {};
  if (write.patch.title !== undefined) patch["summary"] = write.patch.title;
  if (write.patch.location !== undefined) patch["location"] = write.patch.location;
  const moving = write.patch.startsAt || write.patch.endsAt ? (existing ?? (await getEvent(accessToken, target.externalId, eventId))) : null;
  if (moving?.allDay && moving.startsAt) {
    // An all-day event is a date at both ends, the end exclusive, and Google
    // refuses a time against a date. A move keeps how many days it spans.
    const day = (at: Date) => at.toISOString().slice(0, 10);
    const startsAt = write.patch.startsAt ?? moving.startsAt;
    const span = Math.max(DAY, (moving.endsAt?.getTime() ?? 0) - moving.startsAt.getTime());
    const endsAt = write.patch.endsAt && day(write.patch.endsAt) > day(startsAt) ? write.patch.endsAt : new Date(startsAt.getTime() + span);
    patch["start"] = { date: day(startsAt) };
    patch["end"] = { date: day(endsAt) };
  } else {
    if (write.patch.startsAt) {
      patch["start"] = { dateTime: write.patch.startsAt.toISOString(), ...(target.timezone ? { timeZone: target.timezone } : {}) };
    }
    if (write.patch.endsAt) {
      patch["end"] = { dateTime: write.patch.endsAt.toISOString(), ...(target.timezone ? { timeZone: target.timezone } : {}) };
    }
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

  const now = new Date();
  // The copy, if the sync has already brought the event in.
  await db
    .updateTable("connector_events")
    .set({ deleted_at: now, updated_at: now })
    .where("calendar_id", "=", target.calendarId)
    .where("source_ref", "=", sourceRef)
    .where("deleted_at", "is", null)
    .execute();
  // The row forgets the event it became. Whether the row itself goes is the
  // caller's decision: a whole-turn Undo takes the row too, an answer's Undo
  // leaves it as it was filed.
  await db
    .updateTable("content")
    .set({ source_ref: null, attrs: sql`attrs - 'calendar'`, updated_at: now })
    .where("account_id", "=", target.accountId)
    .where("source_ref", "=", sourceRef)
    .execute();

  return true;
}
