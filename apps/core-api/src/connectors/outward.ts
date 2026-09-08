// Does anybody but you find out.
//
// **This is the whole of OFF-6 for a calendar**, and it is one question asked of
// a write rather than a property of a calendar. The irreversible thing is not
// writing to a calendar: an event on a calendar only you can see, with no
// guests, can be deleted again inside the Undo window and nobody ever saw it.
// The irreversible thing is a notification that has already landed.
//
// **Two conditions, and the first is a union across the edit.** Removing every
// guest from an invited event sends each of them a cancellation, so a test that
// read only the proposed state would see no attendees and call it reversible.
//
// **Evaluated server-side, from the event and the calendar.** The model is told
// the outcome and has no field it could set to change it, which matters because
// some of what the model just read was written by a stranger.

export interface OutwardInput {
  /** Who is on the event now, before this write. */
  attendeesBefore: string[];
  /** Who will be on it after. Same list for a delete. */
  attendeesAfter: string[];
  /** The person's own answer about this calendar, not Google's access list. */
  calendarIsShared: boolean;
}

export interface OutwardVerdict {
  outward: boolean;
  /** Whether Google should mail anybody. Driven by the same fact. */
  notify: boolean;
  /** Who finds out, for the sentence on the confirmation. Addresses, because
   *  the person is about to be told which of their guests this reaches. */
  audience: string[];
  reason: "guests" | "shared_calendar" | "none";
}

export function outwardTest(input: OutwardInput): OutwardVerdict {
  const audience = [...new Set([...input.attendeesBefore, ...input.attendeesAfter])].filter(Boolean);

  if (audience.length > 0) {
    return { outward: true, notify: true, audience, reason: "guests" };
  }
  if (input.calendarIsShared) {
    // Nobody to mail, and still outward: everybody who can see the calendar can
    // see the event, which is a person finding out by other means.
    return { outward: true, notify: false, audience: [], reason: "shared_calendar" };
  }
  return { outward: false, notify: false, audience: [], reason: "none" };
}

/** What the person is told before they agree.
 *
 *  Names who finds out and nothing else. No explanation of why offload asked,
 *  because the control beside it is the answer. */
export function outwardLine(verdict: OutwardVerdict): string | null {
  if (!verdict.outward) return null;
  if (verdict.reason === "shared_calendar") return "Everyone on this calendar will see it.";
  if (verdict.audience.length === 1) return `${verdict.audience[0]} will be told.`;
  return `${verdict.audience.length} guests will be told.`;
}
