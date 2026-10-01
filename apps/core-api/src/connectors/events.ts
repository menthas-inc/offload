// Turning a calendar event into offload's copy of it.
//
// **The copy lives on the connection, not in a thread.** 012 filed events into
// the thread a calendar named; 019 holds one row per event per calendar in
// `connector_events` and threads read it through their picks, so a calendar
// picked in two threads is one copy and a calendar picked nowhere is still on
// the person's day.

import type { Transaction, Kysely } from "kysely";
import type { Database } from "../schema.js";
import type { GoogleEvent } from "./google.js";

/** What a calendar keeps of the people on an event.
 *
 *  **Minimised on the way in**, because these are people who never signed up to
 *  offload and never agreed to anything. A name and whether they accepted,
 *  always, because "dinner with Ana" needs a name. **Never an address** (027):
 *  nothing read the stored ones, since a change to an event with guests asks
 *  Google who they are at that moment (`verdictFor`), so a stranger's address
 *  had no reason to sit in the copy. */
export function minimiseAttendees(attendees: GoogleEvent["attendees"]): Array<{ name: string | null; response: string | null }> {
  return attendees.map((attendee) => ({ name: attendee.name, response: attendee.response }));
}

/** `<calendar>:<event>`, so one prefix scan finds everything one calendar filed
 *  and disconnect can offer to remove it. */
export function sourceRefFor(calendarExternalId: string, eventId: string): string {
  return `${calendarExternalId}:${eventId}`;
}

/** Text on this event was written by somebody else. AC-11.
 *
 *  **Per event, by author, not per calendar.** An invitation from a stranger
 *  lands on a calendar nobody else can even see, with a title they wrote, so
 *  asking "is this calendar shared" gets the common case exactly wrong. */
export function isUntrusted(event: GoogleEvent): boolean {
  return event.organizedByMe !== true;
}

export interface MappedEvent {
  sourceRef: string;
  title: string;
  occursAt: Date | null;
  occursEndAt: Date | null;
  allDay: boolean;
  timezone: string | null;
  location: string | null;
  seriesRef: string | null;
  organizerIsMe: boolean;
  untrusted: boolean;
  attendees: ReturnType<typeof minimiseAttendees>;
  link: string | null;
  createdByMe: boolean | null;
  invitedMe: boolean | null;
}

/** 027. The account that read the event: its connected address, and whether
 *  the calendar it was read from is that account's primary. */
export interface Reader {
  accountEmail: string;
  primary: boolean;
}

/** Whose the event is. Created by the account (Google names its address, or
 *  marks the creator as the primary calendar it was read from), or on the
 *  guest list as the account itself without having declined. */
export function whoseOf(event: GoogleEvent, reader: Reader): { createdByMe: boolean; invitedMe: boolean } {
  const creator = event.creator ?? { email: null, self: false };
  // Google's `self` says the entry is the calendar this copy was read from,
  // which on a calendar somebody shares with you is them. It counts only on
  // the account's own primary; anywhere else the address decides.
  const isMe = (email: string | null, self: boolean | undefined) => sameAddress(email, reader.accountEmail) || (self === true && reader.primary);
  // An event a calendar made itself (holidays, an imported feed, a group
  // calendar's own) is what the person subscribed to, so it is theirs to see.
  const byACalendar = creator.email !== null && /@([a-z0-9.-]+\.)?calendar\.google\.com$/i.test(creator.email);
  const createdByMe = isMe(creator.email, creator.self) || byACalendar;
  const invitedMe = event.attendees.some((guest) => guest.response !== "declined" && isMe(guest.email, guest.self));
  return { createdByMe, invitedMe };
}

function sameAddress(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

/** Whether the account organised it, by the same rule: its address, or
 *  Google's `self` on its own primary. Without a reader, Google's flag alone. */
function organizedByReader(event: GoogleEvent, reader: Reader | undefined): boolean {
  if (!reader) return event.organizedByMe === true;
  return sameAddress(event.organizerEmail ?? null, reader.accountEmail) || (event.organizedByMe === true && reader.primary);
}

/** The whole mapping, in one place.
 *
 *  `description` is dropped, and so are conferencing and attachments: they are
 *  the fields that behave like mail rather than like structure, which is what
 *  OFF-4 is about. The organiser is kept because the trust rule cannot be
 *  computed without it. */
export function mapEvent(event: GoogleEvent, calendarExternalId: string, reader?: Reader): MappedEvent {
  const whose = reader ? whoseOf(event, reader) : { createdByMe: null, invitedMe: null };
  const organizerIsMe = organizedByReader(event, reader);
  return {
    ...whose,
    sourceRef: sourceRefFor(calendarExternalId, event.externalId),
    title: event.title,
    occursAt: event.startsAt,
    occursEndAt: event.endsAt,
    allDay: event.allDay,
    timezone: event.timezone,
    location: event.location,
    seriesRef: event.seriesId,
    organizerIsMe,
    untrusted: isUntrusted({ ...event, organizedByMe: organizerIsMe }),
    attendees: minimiseAttendees(event.attendees),
    link: event.link,
  };
}

/** Write or update one occurrence in the copy.
 *
 *  Idempotent by `(calendar_id, source_ref)`, so a re-sync updates rather than
 *  duplicating and an at-least-once job is safe to run twice. */
export async function upsertEvent(
  tx: Transaction<Database> | Kysely<Database>,
  accountId: string,
  calendarId: string,
  mapped: MappedEvent
): Promise<void> {
  await tx
    .insertInto("connector_events")
    .values({
      account_id: accountId,
      calendar_id: calendarId,
      source_ref: mapped.sourceRef,
      title: mapped.title,
      occurs_at: mapped.occursAt,
      occurs_end_at: mapped.occursEndAt,
      all_day: mapped.allDay,
      timezone: mapped.timezone,
      location: mapped.location,
      series_ref: mapped.seriesRef,
      organizer_is_me: mapped.organizerIsMe,
      untrusted: mapped.untrusted,
      attendees: JSON.stringify(mapped.attendees),
      link: mapped.link,
      created_by_me: mapped.createdByMe,
      invited_me: mapped.invitedMe,
    })
    .onConflict((oc) =>
      oc.columns(["calendar_id", "source_ref"]).doUpdateSet((eb) => ({
        title: eb.ref("excluded.title"),
        occurs_at: eb.ref("excluded.occurs_at"),
        occurs_end_at: eb.ref("excluded.occurs_end_at"),
        all_day: eb.ref("excluded.all_day"),
        timezone: eb.ref("excluded.timezone"),
        location: eb.ref("excluded.location"),
        series_ref: eb.ref("excluded.series_ref"),
        organizer_is_me: eb.ref("excluded.organizer_is_me"),
        untrusted: eb.ref("excluded.untrusted"),
        attendees: eb.ref("excluded.attendees"),
        link: eb.ref("excluded.link"),
        created_by_me: eb.ref("excluded.created_by_me"),
        invited_me: eb.ref("excluded.invited_me"),
        // **Brought back, not just updated.** A row retired by reconciliation
        // or by a cancellation stays soft-deleted otherwise, so an event that
        // Google returns again, because a series' end moved back out or the
        // window shifted, would be updated and still invisible forever.
        deleted_at: null,
        updated_at: new Date(),
      }))
    )
    .execute();
}
