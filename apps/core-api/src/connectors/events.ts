// Turning a calendar event into a piece of content, and deciding where it goes.
//
// **Nothing renders an event specially.** It is a `content` row like anything
// else, so the agenda, Today, a thread's widgets and search all get it for free
// and there is no second path to keep in step.

import type { Transaction, Kysely } from "kysely";
import type { Database } from "../schema.js";
import type { GoogleEvent } from "./google.js";

/** What a calendar keeps of the people on an event.
 *
 *  **Minimised on the way in**, because these are people who never signed up to
 *  offload and never agreed to anything. A name and whether they accepted,
 *  always, because "dinner with Ana" needs a name. An address only for an event
 *  offload created with guests, because editing that one later has to name them
 *  again. Everything else drops the address. */
export function minimiseAttendees(
  attendees: GoogleEvent["attendees"],
  keepAddresses: boolean
): Array<{ name: string | null; email?: string; response: string | null }> {
  return attendees.map((attendee) => ({
    name: attendee.name,
    response: attendee.response,
    ...(keepAddresses && attendee.email ? { email: attendee.email } : {}),
  }));
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

export interface Rule {
  ordinal: number;
  match_kind: "title_contains" | "attendee_is" | "all";
  match_value: string | null;
  thread_id: string;
}

/** Where this event files. First match wins, else the calendar's own thread.
 *
 *  Matching is deliberately dull: lowercase substring for a title, exact
 *  address for an attendee. A rule nobody can predict the behaviour of is worse
 *  than no rule. */
export function threadFor(event: GoogleEvent, rules: Rule[], defaultThreadId: string): string {
  for (const rule of [...rules].sort((a, b) => a.ordinal - b.ordinal)) {
    if (rule.match_kind === "all") return rule.thread_id;
    const value = (rule.match_value ?? "").trim().toLowerCase();
    if (!value) continue;
    if (rule.match_kind === "title_contains" && event.title.toLowerCase().includes(value)) {
      return rule.thread_id;
    }
    if (
      rule.match_kind === "attendee_is" &&
      event.attendees.some((a) => (a.email ?? "").toLowerCase() === value)
    ) {
      return rule.thread_id;
    }
  }
  return defaultThreadId;
}

export interface MappedEvent {
  sourceRef: string;
  threadId: string;
  title: string;
  occursAt: Date | null;
  occursEndAt: Date | null;
  attrs: Record<string, unknown>;
}

/** The whole mapping, in one place.
 *
 *  `description` is dropped, and so are conferencing and attachments: they are
 *  the fields that behave like mail rather than like structure, which is what
 *  OFF-4 is about. The organiser is kept because the trust rule cannot be
 *  computed without it. */
export function mapEvent(
  event: GoogleEvent,
  calendarExternalId: string,
  threadId: string
): MappedEvent {
  return {
    sourceRef: sourceRefFor(calendarExternalId, event.externalId),
    threadId,
    title: event.title,
    occursAt: event.startsAt,
    occursEndAt: event.endsAt,
    attrs: {
      calendar: calendarExternalId,
      series_ref: event.seriesId,
      all_day: event.allDay,
      timezone: event.timezone,
      location: event.location,
      organizer_is_me: event.organizedByMe,
      untrusted: isUntrusted(event),
      attendees: minimiseAttendees(event.attendees, event.organizedByMe),
    },
  };
}

/** Write or update one occurrence.
 *
 *  Idempotent by `(account_id, source_ref)`, so a re-sync updates rather than
 *  duplicating and an at-least-once job is safe to run twice. */
export async function upsertEvent(
  tx: Transaction<Database> | Kysely<Database>,
  accountId: string,
  mapped: MappedEvent
): Promise<void> {
  await tx
    .insertInto("content")
    .values({
      account_id: accountId,
      thread_id: mapped.threadId,
      type: "event",
      title: mapped.title,
      occurs_at: mapped.occursAt,
      occurs_end_at: mapped.occursEndAt,
      source: "calendar",
      source_ref: mapped.sourceRef,
      attrs: JSON.stringify(mapped.attrs),
    })
    .onConflict((oc) =>
      oc
        .columns(["account_id", "source_ref"])
        .where("source_ref", "is not", null)
        .doUpdateSet((eb) => ({
          // The thread is not overwritten. A person who moved an event into a
          // different thread meant it, and a sync that put it back every
          // fifteen minutes would be the product arguing with them.
          title: eb.ref("excluded.title"),
          occurs_at: eb.ref("excluded.occurs_at"),
          occurs_end_at: eb.ref("excluded.occurs_end_at"),
          attrs: eb.ref("excluded.attrs"),
          updated_at: new Date(),
        }))
    )
    .execute();
}
