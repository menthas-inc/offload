// 012 C: turning an event into offload's copy of it.
//
// AC-6:  what is kept and what is dropped.
// AC-11: untrusted is per event, by author, not per calendar.
//
// 019 took the routing out: a copy lives on the connection, one row per event
// per calendar, and a thread reads it through its picks. There is nowhere for
// an event to be routed to, so `threadFor` and its rules are gone.

import { describe, expect, it } from "vitest";
import { isUntrusted, mapEvent, minimiseAttendees, sourceRefFor } from "../src/connectors/events.js";
import type { GoogleEvent } from "../src/connectors/google.js";

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
    const mapped = mapEvent(event(), "cal-1");
    expect(JSON.stringify(mapped)).not.toContain("description");
    expect(mapped.organizerIsMe).toBe(true);
    expect(mapped.untrusted).toBe(false);
  });

  it("keeps the zone, and flags an all-day event as a day", () => {
    // An all-day event is a date, not midnight anywhere. Storing it as a time
    // is how a birthday lands a day out for half the planet.
    const mapped = mapEvent(event({ allDay: true, timezone: "Europe/Lisbon" }), "cal-1");
    expect(mapped.allDay).toBe(true);
    expect(mapped.timezone).toBe("Europe/Lisbon");
  });

  it("namespaces the reference by calendar", () => {
    // So one prefix scan finds everything a calendar holds.
    expect(sourceRefFor("cal-1", "evt1")).toBe("cal-1:evt1");
    expect(mapEvent(event(), "cal-1").sourceRef).toBe("cal-1:evt1");
  });

  it("names no thread", () => {
    // 019. The copy is the calendar's; where it is read is the thread's picks.
    expect(mapEvent(event(), "cal-1")).not.toHaveProperty("threadId");
  });
});
