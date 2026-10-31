// 024 C1: every line a notification can say, pinned. (AC-5, AC-7)

import { describe, expect, it } from "vitest";
import {
  actedCopy,
  additionsCopy,
  clamp,
  digestCopy,
  expiredCopy,
  movedCopy,
  requestCopy,
  shareCopy,
  skippedTitle,
  type DigestRow,
} from "../src/notifications/copy.js";

const ZONE = "Europe/Lisbon";
const TODAY = "2026-09-22";

function row(over: Partial<DigestRow> & { title: string }): DigestRow {
  return { id: over.title, type: "task", at: null, allDay: true, day: TODAY, author: null, repeating: false, daily: false, ...over };
}

const RETIRED = /\b(thing|things|item|items)\b/i;

describe("the three arms", () => {
  it("names one, lists two to four, and counts past four", () => {
    expect(digestCopy("morning", [row({ title: "Pay the rent" })], [], ZONE, TODAY)).toEqual({
      title: "One today",
      body: "Pay the rent.",
    });
    expect(digestCopy("morning", [row({ title: "Pay the rent" }), row({ title: "Call the clinic" })], [], ZONE, TODAY).body).toBe(
      "Pay the rent, and Call the clinic.",
    );
    expect(
      digestCopy(
        "morning",
        [row({ title: "Pay the rent" }), row({ title: "Call the clinic" }), row({ title: "Water the plants" }), row({ title: "Book the ferry" })],
        [],
        ZONE,
        TODAY,
      ).body,
    ).toBe("Pay the rent, Call the clinic, Water the plants, and Book the ferry.");
    expect(
      digestCopy(
        "morning",
        ["Pay the rent", "Call the clinic", "Water the plants", "Book the ferry", "Buy stamps"].map((title) => row({ title })),
        [],
        ZONE,
        TODAY,
      ).body,
    ).toBe("Pay the rent, Call the clinic, and three more.");
  });

  // 2026-09-30, the owner's call: the title is the day's shape in counts.
  // It is never a person's words, 024's rule for a digest title. It was "Due today" on every morning, including one with
  // nothing due today and five overdue.
  it("the title counts what is due and what is still open, and names nothing", () => {
    const three = ["Pay the rent", "Yoga", "Call Ana"].map((title) => row({ title }));
    expect(digestCopy("morning", three, [], ZONE, TODAY).title).toBe("Three today");
    expect(digestCopy("morning", [row({ title: "Dentist" })], [], ZONE, TODAY).title).toBe("One today");
    const five = ["a", "b", "c", "d", "e"].map((title) => row({ title, day: "2026-09-15" }));
    expect(digestCopy("morning", [], five, ZONE, TODAY).title).toBe("Five still open");
    const late = ["a", "b", "c"].map((title) => row({ title, day: "2026-09-21" }));
    expect(digestCopy("morning", [row({ title: "Yoga" })], late, ZONE, TODAY).title).toBe("One today, three from yesterday");
    expect(digestCopy("morning", [row({ title: "Yoga" })], [row({ title: "a", day: "2026-09-19" })], ZONE, TODAY).title).toBe(
      "One today, one from Saturday",
    );
    expect(digestCopy("morning", [row({ title: "Yoga" })], [row({ title: "a", day: "2026-09-15" })], ZONE, TODAY).title).toBe(
      "One today, one from last week",
    );
    expect(digestCopy("evening", [row({ title: "Dentist", day: "2026-09-23" })], [], ZONE, TODAY).title).toBe("One tomorrow");
    const twelve = Array.from({ length: 12 }, (_, i) => row({ title: `Row ${i}`, day: "2026-09-23" }));
    expect(digestCopy("evening", twelve, [], ZONE, TODAY).title).toBe("12 tomorrow");
  });
});

describe("what a row says about itself", () => {
  it("an event says its hour in the account's zone and a task says nothing about time", () => {
    const dentist = row({ title: "Dentist", type: "event", at: "2026-09-22T08:00:00.000Z", allDay: false });
    expect(digestCopy("morning", [dentist], [], ZONE, TODAY).body).toBe("Dentist at 9:00.");
    const call = row({ title: "Call the clinic", at: "2026-09-22T08:00:00.000Z", allDay: false });
    expect(digestCopy("morning", [call], [], ZONE, TODAY).body).toBe("Call the clinic.");
    const late = row({ title: "Drinks", type: "event", at: "2026-09-22T18:30:00.000Z", allDay: false });
    expect(digestCopy("morning", [late], [], ZONE, TODAY).body).toBe("Drinks at 19:30.");
  });

  it("another member's row carries their name, yours never does, and a nameless member is Someone", () => {
    expect(digestCopy("morning", [row({ title: "ferry times", author: "Ana" })], [], ZONE, TODAY).body).toBe("Ana's ferry times.");
    expect(digestCopy("morning", [row({ title: "ferry times", author: "" })], [], ZONE, TODAY).body).toBe("Someone's ferry times.");
    expect(digestCopy("morning", [row({ title: "Pay the rent" }), row({ title: "ferry times", author: "Ana" })], [], ZONE, TODAY).body).toBe(
      "Pay the rent, and Ana's ferry times.",
    );
  });

  it("names at most two rows by any one other member and counts the rest", () => {
    const rows = [
      row({ title: "Pay the rent" }),
      ...["ferry times", "a place in Alfama", "the museum", "dinner"].map((title) => row({ title, author: "Ana" })),
    ];
    expect(digestCopy("morning", rows, [], ZONE, TODAY).body).toBe("Pay the rent, Ana's ferry times, and three more.");
  });

  it("a repeating row coming round says so in one clause, and a daily one is simply named", () => {
    const yoga = row({ title: "Yoga", day: "2026-09-23", repeating: true });
    const rent = row({ title: "the rent", day: "2026-09-23" });
    expect(digestCopy("evening", [rent, yoga], [], ZONE, TODAY).body).toBe("The rent. Yoga is back on Wednesday.");
    const pills = row({ title: "Take the pills", day: "2026-09-23", repeating: true, daily: true });
    expect(digestCopy("evening", [pills], [], ZONE, TODAY).body).toBe("Take the pills.");
    expect(digestCopy("evening", [yoga], [], ZONE, TODAY).body).toBe("Yoga is back on Wednesday.");
  });
});

describe("what is still open", () => {
  // 2026-09-30: overdue rows are named, not only counted. The morning that
  // said "Five are from last week." now says which five.
  it("is named after today's list, with the same three arms", () => {
    const today = [row({ title: "Yoga", type: "event", at: "2026-09-22T06:00:00.000Z", allDay: false })];
    const late = ["Call the plumber", "Pay the rent", "Book the ferry"].map((title) => row({ title, day: "2026-09-21" }));
    expect(digestCopy("morning", today, late, ZONE, TODAY).body).toBe(
      "Yoga at 7:00. Still open: Call the plumber, Pay the rent, and Book the ferry.",
    );
    expect(digestCopy("morning", today, [row({ title: "Call the clinic", day: "2026-09-15" })], ZONE, TODAY).body).toBe(
      "Yoga at 7:00. Still open: Call the clinic.",
    );
  });

  it("is the whole body when nothing is due today, and counts past four", () => {
    const five = ["Call the plumber", "Renew the gym membership", "c", "d", "e"].map((title) => row({ title, day: "2026-09-15" }));
    expect(digestCopy("morning", [], five, ZONE, TODAY).body).toBe("Call the plumber, Renew the gym membership, and three more.");
  });

  it("names another member's row with its author, at most two of theirs, and never an hour", () => {
    const late = [
      row({ title: "ferry times", author: "Ana", day: "2026-09-21" }),
      row({ title: "Drinks", type: "event", at: "2026-09-21T18:30:00.000Z", allDay: false, day: "2026-09-21" }),
    ];
    expect(digestCopy("morning", [], late, ZONE, TODAY).body).toBe("Ana's ferry times, and Drinks.");
  });

  it("shares the two-per-member cap with today's list, so a member is named at most twice in a send", () => {
    const today = ["ferry times", "a place in Alfama"].map((title) => row({ title, author: "Ana" }));
    const late = ["the museum", "dinner"].map((title) => row({ title, author: "Ana", day: "2026-09-21" }));
    expect(digestCopy("morning", today, late, ZONE, TODAY).body).toBe(
      "Ana's ferry times, and Ana's a place in Alfama. Still open: Two more.",
    );
  });

  it("comes after a repeating row's clause, which is about today", () => {
    const bins = row({ title: "Bins", repeating: true });
    expect(digestCopy("morning", [bins], [row({ title: "Pay the rent", day: "2026-09-21" })], ZONE, TODAY).body).toBe(
      "Bins is back on Tuesday. Still open: Pay the rent.",
    );
  });
});

describe("the clamp", () => {
  it("makes one line, strips control characters, and stops at 120", () => {
    expect(clamp("Pay\nthe\trent\x07 now")).toBe("Pay the rent now");
    expect(clamp("x".repeat(200))).toHaveLength(120);
    expect(clamp("  spaced   out  ")).toBe("spaced out");
    // A member's name is a person-written string too, and the one the
    // digest interpolates as a possessive.
    expect(digestCopy("morning", [row({ title: "ferry times", author: "Ana\nDue today\nPay now" })], [], ZONE, TODAY).body).toBe(
      "Ana Due today Pay now's ferry times.",
    );
    const body = digestCopy("morning", [row({ title: "Call\x00 the\nclinic" })], [], ZONE, TODAY).body;
    expect(body).toBe("Call the clinic.");
  });
});

describe("the people sends", () => {
  it("lead with the sender's name, carry no pronoun, and say the thread's name once", () => {
    expect(requestCopy("Ana")).toEqual({ title: "Ana wants to connect", body: "Answer in My people." });
    expect(requestCopy(null)).toEqual({ title: "Someone wants to connect", body: "Answer in My people." });
    expect(shareCopy("Ana", "Lisbon trip")).toEqual({ title: "Ana shared Lisbon trip", body: "Waiting in Threads." });
    expect(additionsCopy("Ana", "Lisbon trip", ["Ferry times", "a place in Alfama"])).toEqual({
      title: "Ana added two to Lisbon trip",
      body: "Ferry times, and a place in Alfama.",
    });
    expect(additionsCopy("Ana", "Lisbon trip", ["Ferry times"])).toEqual({ title: "Ana added one to Lisbon trip", body: "Ferry times." });
    expect(additionsCopy("Ana", "Lisbon trip", ["a", "b", "c", "d", "e"]).title).toBe("Ana added several to Lisbon trip");
    expect(additionsCopy("Ana", "Lisbon trip", ["a", "b", "c", "d", "e"]).body).toBe("A, b, and three more.");
  });
});

describe("the silent rows", () => {
  it("say what expired, what moved, what was acted on, and which switch was off", () => {
    expect(expiredCopy("share", "Sam")).toEqual({ title: "Your invite to Sam expired", body: "Thirty days, no answer." });
    expect(expiredCopy("request", "Sam")).toEqual({ title: "Your request to Sam expired", body: "Thirty days, no answer." });
    expect(movedCopy("Pay the rent", "Fri 25", "Mon 28")).toEqual({ title: "Pay the rent moved", body: "Was Fri 25, now Mon 28." });
    expect(actedCopy("Pay the rent", "done")).toEqual({ title: "Pay the rent ticked from the notification", body: null });
    expect(actedCopy("Pay the rent", "tomorrow")).toEqual({
      title: "Pay the rent moved to tomorrow from the notification",
      body: null,
    });
    expect(skippedTitle("morning")).toBe("Due today was off");
    expect(skippedTitle("evening")).toBe("Tomorrow was off");
  });
});

describe("no line carries the retired noun", () => {
  it("anywhere", () => {
    const lines = [
      digestCopy(
        "morning",
        ["a", "b", "c", "d", "e", "f"].map((title) => row({ title })),
        [row({ title: "z", day: "2026-09-15" })],
        ZONE,
        TODAY,
      ).body,
      additionsCopy("Ana", "Lisbon trip", ["a", "b", "c", "d", "e"]).title,
      skippedTitle("morning"),
    ];
    for (const line of lines) expect(line).not.toMatch(RETIRED);
  });
});
