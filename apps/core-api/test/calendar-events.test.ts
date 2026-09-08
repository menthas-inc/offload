// 012 C: turning an event into content, and deciding where it goes.
//
// AC-6:  what is kept and what is dropped.
// AC-8:  routing, first match wins.
// AC-11: untrusted is per event, by author, not per calendar.

import { describe, expect, it } from "vitest";
import {
  isUntrusted,
  mapEvent,
  minimiseAttendees,
  sourceRefFor,
  threadFor,
  type Rule,
} from "../src/connectors/events.js";
import type { GoogleEvent } from "../src/connectors/google.js";

const HOME = "0199e0d0-0000-7000-8000-00000000a001";
const WORK = "0199e0d0-0000-7000-8000-00000000a002";

function event(over: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    externalId: "evt1",
    seriesId: null,
    status: "confirmed",
    title: "Dinner with Ana",
    location: "Alfama",
    startsAt: new Date("2026-09-10T19:00:00Z"),
    endsAt: new Date("2026-09-10T21:00:00Z"),
    allDay: false,
    timezone: "Europe/Lisbon",
    organizedByMe: true,
    attendees: [{ name: "Ana", email: "ana@example.com", response: "accepted" }],
    ...over,
  };
}

describe("AC-11 untrusted is per event, by who wrote it", () => {
  it("trusts what you organised", () => {
    expect(isUntrusted(event({ organizedByMe: true }))).toBe(false);
  });

  it("distrusts an invitation, even on your own private calendar", () => {
    // The case the first draft got wrong. A stranger invites you, the event
    // lands on a calendar nobody else can see, and the title is theirs.
    expect(isUntrusted(event({ organizedByMe: false }))).toBe(true);
  });

  it("fails closed when Google says nothing", () => {
    expect(isUntrusted(event({ organizedByMe: undefined as unknown as boolean }))).toBe(true);
  });
});

describe("AC-6 attendees are minimised", () => {
  it("keeps a name and a response but drops the address", () => {
    // People who never signed up to offload. A name renders "dinner with Ana";
    // an address is contact details for a stranger.
    const [ana] = minimiseAttendees(event().attendees, false);
    expect(ana).toEqual({ name: "Ana", response: "accepted" });
    expect(ana).not.toHaveProperty("email");
  });

  it("keeps the address on an event offload created with guests", () => {
    // Because editing that one later has to name them again.
    const [ana] = minimiseAttendees(event().attendees, true);
    expect(ana?.email).toBe("ana@example.com");
  });
});

describe("AC-6 the mapping", () => {
  it("drops the description and keeps the organiser", () => {
    const mapped = mapEvent(event(), "cal-1", HOME);
    expect(JSON.stringify(mapped.attrs)).not.toContain("description");
    expect(mapped.attrs["organizer_is_me"]).toBe(true);
    expect(mapped.attrs["untrusted"]).toBe(false);
  });

  it("keeps the zone, and flags an all-day event as a day", () => {
    // An all-day event is a date, not midnight anywhere. Storing it as a time
    // is how a birthday lands a day out for half the planet.
    const mapped = mapEvent(event({ allDay: true, timezone: "Europe/Lisbon" }), "cal-1", HOME);
    expect(mapped.attrs["all_day"]).toBe(true);
    expect(mapped.attrs["timezone"]).toBe("Europe/Lisbon");
  });

  it("namespaces the reference by calendar", () => {
    // So one prefix scan finds everything a calendar filed, which is what
    // disconnect offers to remove.
    expect(sourceRefFor("cal-1", "evt1")).toBe("cal-1:evt1");
    expect(mapEvent(event(), "cal-1", HOME).sourceRef).toBe("cal-1:evt1");
  });
});

describe("AC-8 routing", () => {
  const rules: Rule[] = [
    { ordinal: 2, match_kind: "title_contains", match_value: "standup", thread_id: WORK },
    { ordinal: 1, match_kind: "attendee_is", match_value: "ana@example.com", thread_id: HOME },
  ];

  it("falls back to the calendar's own thread", () => {
    expect(threadFor(event({ attendees: [], title: "Dentist" }), rules, WORK)).toBe(WORK);
  });

  it("takes the first match by ordinal, not by array order", () => {
    // Both rules match this event. The one with the lower ordinal wins, and the
    // array is deliberately out of order so a sort that is missing shows up.
    const both = event({ title: "Standup", attendees: [{ name: "Ana", email: "ana@example.com", response: null }] });
    expect(threadFor(both, rules, WORK)).toBe(HOME);
  });

  it("matches a title case-insensitively", () => {
    expect(threadFor(event({ title: "Team STANDUP", attendees: [] }), rules, HOME)).toBe(WORK);
  });

  it("ignores a rule with nothing to match on", () => {
    const empty: Rule[] = [{ ordinal: 1, match_kind: "title_contains", match_value: "  ", thread_id: WORK }];
    expect(threadFor(event(), empty, HOME)).toBe(HOME);
  });

  it("sends everything when a rule says all", () => {
    const all: Rule[] = [{ ordinal: 1, match_kind: "all", match_value: null, thread_id: WORK }];
    expect(threadFor(event(), all, HOME)).toBe(WORK);
  });
});
