// 012 C: turning an event into offload's copy of it.
//
// AC-6:  what is kept and what is dropped.
// AC-11: untrusted is per event, by author, not per calendar.
//
// 019 took the routing out: a copy lives on the connection, one row per event
// per calendar, and a thread reads it through its picks. There is nowhere for
// an event to be routed to, so `threadFor` and its rules are gone.

import { afterEach, describe, expect, it, vi } from "vitest";
import { isUntrusted, mapEvent, sourceRefFor } from "../src/connectors/events.js";
import { countParticipants, eventLink, listEvents, sharedWith, type GoogleEvent } from "../src/connectors/google.js";

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
    link: null,
    creator: { email: null, self: false },
    organizerEmail: null,
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

describe("AC-6 nothing about the guests is kept", () => {
  it("keeps no name, no answer and no address, whoever made the event", () => {
    // People who never signed up to offload. 027: nothing ever read what the
    // copy kept of them, and a change to an event with guests asks Google who
    // they are at that moment, so none of it has a reason to sit here.
    for (const over of [{}, { organizedByMe: true }]) {
      const mapped = mapEvent(event(over), "cal-1", { accountEmail: "jo@hey.com", primary: true });
      expect(mapped).not.toHaveProperty("attendees");
      expect(JSON.stringify(mapped)).not.toContain("ana@example.com");
      expect(JSON.stringify(mapped)).not.toContain("accepted");
    }
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

// 027 T1.2: the event's own link, kept so Today can hand it to the platform.
describe("027 AC-19 the event's link", () => {
  it("is carried from Google's event into the copy", () => {
    const link = "https://www.google.com/calendar/event?eid=ZXZ0MSBjYWwtMQ";
    expect(mapEvent(event({ link }), "cal-1").link).toBe(link);
    expect(mapEvent(event({ link: null }), "cal-1").link).toBeNull();
  });

  it("is kept only when it is https on a Google host", () => {
    expect(eventLink("https://www.google.com/calendar/event?eid=a")).toBe("https://www.google.com/calendar/event?eid=a");
    expect(eventLink("https://calendar.google.com/calendar/event?eid=a")).toBe("https://calendar.google.com/calendar/event?eid=a");
    for (const bad of ["http://www.google.com/calendar/event?eid=a", "javascript:alert(1)", "https://www.google.com.evil.example/calendar/", "intent://x", 42, undefined, "x".repeat(3000)]) {
      expect(eventLink(bad)).toBeNull();
    }
  });

  it("is read from the field Google's events.list documents", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          items: [{ id: "evt1", status: "confirmed", summary: "Dinner", htmlLink: "https://www.google.com/calendar/event?eid=abc", start: { dateTime: "2026-10-02T19:00:00Z" }, end: { dateTime: "2026-10-02T20:00:00Z" } }],
          nextSyncToken: "t",
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const page = await listEvents("token", "cal-1", {});
      expect(page !== "resync" && page.events[0]?.link).toBe("https://www.google.com/calendar/event?eid=abc");
    } finally {
      globalThis.fetch = original;
    }
  });
});

// 027 tweak: whose an event is. A shared calendar carries somebody else's day;
// Today shows only what this account created or was asked to.
describe("027 an event is yours when you created it or were invited to it", () => {
  const me = { accountEmail: "Jo@Hey.com", primary: false };
  const guest = (self: boolean, response: string | null) => ({ name: "Jo", email: self ? "jo@hey.com" : "ana@hey.com", response, self });

  it("is yours when Google names you as its creator, whatever the case of the address", () => {
    const mapped = mapEvent(event({ creator: { email: "jo@hey.com", self: false } }), "shared", me);
    expect([mapped.createdByMe, mapped.invitedMe]).toEqual([true, false]);
  });

  it("is yours when you created it on your own primary calendar", () => {
    expect(mapEvent(event({ creator: { email: null, self: true } }), "cal-1", { ...me, primary: true }).createdByMe).toBe(true);
    expect(mapEvent(event({ creator: { email: null, self: true } }), "shared", me).createdByMe).toBe(false);
  });

  it("is yours when you are on its guest list and have not declined", () => {
    const by = { creator: { email: "ana@hey.com", self: false } };
    expect(mapEvent(event({ ...by, attendees: [guest(true, "accepted")] }), "shared", me).invitedMe).toBe(true);
    expect(mapEvent(event({ ...by, attendees: [guest(true, "needsAction")] }), "shared", me).invitedMe).toBe(true);
    expect(mapEvent(event({ ...by, attendees: [guest(true, "declined")] }), "shared", me).invitedMe).toBe(false);
    expect(mapEvent(event({ ...by, attendees: [guest(false, "accepted")] }), "shared", me).invitedMe).toBe(false);
  });

  it("you are going when you made it, or answered yes or maybe; an unanswered invite is not (2026-10-10)", () => {
    const by = { creator: { email: "ana@hey.com", self: false } };
    expect(mapEvent(event({ creator: { email: "jo@hey.com", self: false } }), "shared", me).going).toBe(true);
    expect(mapEvent(event({ ...by, attendees: [guest(true, "accepted")] }), "shared", me).going).toBe(true);
    expect(mapEvent(event({ ...by, attendees: [guest(true, "tentative")] }), "shared", me).going).toBe(true);
    expect(mapEvent(event({ ...by, attendees: [guest(true, "needsAction")] }), "shared", me).going).toBe(false);
    expect(mapEvent(event({ ...by, attendees: [guest(true, "declined")] }), "shared", me).going).toBe(false);
    expect(mapEvent(event({ ...by, attendees: [guest(false, "accepted")] }), "shared", me).going).toBe(false);
    expect(mapEvent(event(), "cal-1").going).toBeNull();
  });

  it("is somebody else's when they made it on a shared calendar and did not invite you", () => {
    const mapped = mapEvent(event({ creator: { email: "ana@hey.com", self: false }, attendees: [] }), "shared", me);
    expect([mapped.createdByMe, mapped.invitedMe]).toEqual([false, false]);
  });

  it("is not known when nothing says whose account read it", () => {
    const mapped = mapEvent(event(), "cal-1");
    expect([mapped.createdByMe, mapped.invitedMe]).toEqual([null, null]);
  });

  it("reads the creator and the guest's self from the fields events.list documents", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "evt2",
              status: "confirmed",
              summary: "Class",
              creator: { email: "ana@hey.com", self: false },
              attendees: [{ email: "jo@hey.com", self: true, responseStatus: "accepted" }],
              start: { dateTime: "2026-10-02T19:00:00Z" },
              end: { dateTime: "2026-10-02T20:00:00Z" },
            },
          ],
          nextSyncToken: "t",
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const page = await listEvents("token", "shared", {});
      const one = page !== "resync" ? page.events[0] : undefined;
      expect(one?.creator).toEqual({ email: "ana@hey.com", self: false });
      expect(one?.attendees[0]).toMatchObject({ email: "jo@hey.com", self: true, response: "accepted" });
    } finally {
      globalThis.fetch = original;
    }
  });
});

// The review of the tweak: Google's `self` is about the calendar a copy sits
// on, not the person. On a calendar somebody shares with you, their own events
// carry `self` for them.
describe("027 self is the calendar's, not the person's", () => {
  const shared = { accountEmail: "jo@hey.com", primary: false };
  const her = { creator: { email: "ana@hey.com", self: true }, organizedByMe: true, organizerEmail: "ana@hey.com" };

  it("does not count a guest marked self on somebody else's calendar as you", () => {
    const mapped = mapEvent(event({ ...her, attendees: [{ name: "Ana", email: "ana@hey.com", response: "accepted", self: true }] }), "shared", shared);
    expect(mapped.invitedMe).toBe(false);
  });

  it("counts your own address on the guest list, and a self guest on your own primary", () => {
    const you = { name: "Jo", email: "JO@hey.com", response: "accepted", self: false };
    expect(mapEvent(event({ ...her, attendees: [you] }), "shared", shared).invitedMe).toBe(true);
    const selfOnPrimary = { name: "Jo", email: null, response: "accepted", self: true };
    expect(mapEvent(event({ ...her, attendees: [selfOnPrimary] }), "cal-1", { ...shared, primary: true }).invitedMe).toBe(true);
  });

  it("treats somebody else's event on a shared calendar as theirs: untrusted, and no guest kept", () => {
    const mapped = mapEvent(event({ ...her, attendees: [{ name: "Sam", email: "sam@hey.com", response: "accepted", self: false }] }), "shared", shared);
    expect(mapped.organizerIsMe).toBe(false);
    expect(mapped.untrusted).toBe(true);
    expect(mapped).not.toHaveProperty("attendees");
  });

  it("still trusts what you organised, by your address or on your own primary", () => {
    expect(mapEvent(event({ organizerEmail: "jo@hey.com", organizedByMe: false }), "shared", shared).untrusted).toBe(false);
    expect(mapEvent(event({ organizerEmail: null, organizedByMe: true }), "cal-1", { ...shared, primary: true }).untrusted).toBe(false);
  });

  it("counts an event a subscribed calendar made itself as yours, so holidays and imports stay on Today", () => {
    for (const email of ["en.usa#holiday@group.v.calendar.google.com", "abc123@import.calendar.google.com", "team@group.calendar.google.com"]) {
      expect(mapEvent(event({ creator: { email, self: false }, attendees: [] }), "subscribed", shared).createdByMe, email).toBe(true);
    }
  });
});

describe("2026-10-05 who a calendar is shared with", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is the people on Google's list, every page, lowercased, never a domain or a removed rule", async () => {
    const pages = [
      {
        items: [
          { role: "owner", scope: { type: "user", value: "Me@G.com" } },
          { role: "writer", scope: { type: "user", value: "Meera.Sen@gmail.com" } },
          { role: "none", scope: { type: "user", value: "gone@gmail.com" } },
        ],
        nextPageToken: "2",
      },
      { items: [{ role: "reader", scope: { type: "domain", value: "work.com" } }, { role: "reader", scope: { type: "user", value: "sam@x.com" } }] },
    ];
    const fetch = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => pages[url.includes("pageToken=2") ? 1 : 0],
    }));
    vi.stubGlobal("fetch", fetch);

    expect(await sharedWith("token", "cal-pb")).toEqual(["me@g.com", "meera.sen@gmail.com", "sam@x.com"]);
    // The count reads the same list and still counts a domain as more people.
    expect(await countParticipants("token", "cal-pb")).toBe(5);
  });
});
