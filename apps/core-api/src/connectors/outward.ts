// Does anybody but you find out.
//
// **This is the whole of OFF-6 for a calendar**, and it is one question asked of
// a write rather than a property of a calendar. The irreversible thing is not
// writing to a calendar: an event on a calendar only you can see, with no
// guests, can be deleted again inside the Undo window and nobody ever saw it.
// The irreversible thing is a notification that has already landed.
//
// **Three conditions, and the first is a union across the edit.** Removing every
// guest from an invited event sends each of them a cancellation, so a test that
// read only the proposed state would see no attendees and call it reversible.
// The second is the calendar's participant count, read from Google since 019,
// and since 2026-10-28 it confirms only a delete: the owner adds to a calendar
// they know is shared, and asking every time was friction. Adding and moving
// are done with Undo; removing somebody's plan from under them still asks.
// The third is the person asking to be asked on every write.
//
// **Evaluated server-side, from the event, the calendar and the account.** The
// model is told the outcome and has no field it could set to change it, which
// matters because some of what the model just read was written by a stranger.

export interface OutwardInput {
  /** Who is on the event now, before this write. */
  attendeesBefore: string[];
  /** Who will be on it after. Same list for a delete. */
  attendeesAfter: string[];
  /** Everyone Google lets see the calendar, the person included. Null when
   *  offload could not read it, which counts as more than one. */
  participants: number | null;
  /** The account's `Ask before adding` switch. */
  askFirst: boolean;
  /** Only a delete is confirmed for the participant count. */
  deleting: boolean;
}

export interface OutwardVerdict {
  outward: boolean;
  /** Whether Google should mail anybody. Driven by the same fact. */
  notify: boolean;
  /** Who finds out, for the sentence on the confirmation. Addresses, because
   *  the person is about to be told which of their guests this reaches. */
  audience: string[];
  reason: "guests" | "shared_calendar" | "asked_for" | "read_calendar" | "none";
}

/** The verdict for a write proposed by a turn that has read a calendar.
 *
 *  Not the outward test, and deliberately beside it rather than inside it:
 *  what the person's own calendar holds is text other people wrote, an
 *  invitation is such a title, and a turn that read one and then wants to
 *  change or remove an event is put to the person whatever the event's
 *  audience. The read is the fact; the model has no field that changes it. */
export function readCalendarVerdict(): OutwardVerdict {
  return { outward: true, notify: false, audience: [], reason: "read_calendar" };
}

export function outwardTest(input: OutwardInput): OutwardVerdict {
  const audience = [...new Set([...input.attendeesBefore, ...input.attendeesAfter])].filter(Boolean);

  if (audience.length > 0) {
    return { outward: true, notify: true, audience, reason: "guests" };
  }
  if (input.deleting && (input.participants === null || input.participants > 1)) {
    // Nobody to mail, and still outward: everybody who can see the calendar can
    // see the event, which is a person finding out by other means. Unknown is
    // treated the same way, because guessing "only them" is the one guess that
    // skips a confirmation.
    return { outward: true, notify: false, audience: [], reason: "shared_calendar" };
  }
  if (input.askFirst) {
    return { outward: true, notify: false, audience: [], reason: "asked_for" };
  }
  return { outward: false, notify: false, audience: [], reason: "none" };
}

/** What the person is told before they agree.
 *
 *  Names who finds out and nothing else. No explanation of why offload asked,
 *  because the control beside it is the answer. */
export function outwardLine(verdict: OutwardVerdict, cadence: string | null = null): string | null {
  if (!verdict.outward) return null;
  const who =
    verdict.reason === "shared_calendar"
      ? "Everyone on this calendar will see it."
      : verdict.reason === "asked_for"
        ? "You asked to check first."
        : verdict.reason === "read_calendar"
          ? "offload read a calendar this turn."
          : verdict.audience.length === 1
            ? `${verdict.audience[0]} will be told.`
            : `${verdict.audience.length} guests will be told.`;
  // 023. A series is not one event, so the line says how often before
  // somebody agrees to a year of their calendar.
  return cadence ? `${who} ${cadence}.` : who;
}
