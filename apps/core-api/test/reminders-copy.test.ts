// 042 E1: what a reminder says. Coming up takes 024's three arms; a date
// within the week is its weekday, tomorrow is tomorrow, further out its day
// and month; a deadline and an anchored task say "by"; titles are counts; a
// reminder of its own says when in its title and what in its body. (AC-13,
// AC-14)

import { describe, expect, it } from "vitest";
import { cutAtWord, digestCopy, ownCopy, type ComingRow, type DigestRow } from "../src/notifications/copy.js";

const ZONE = "Europe/Lisbon";
const TODAY = "2026-11-02"; // a Monday

function due(title: string, over: Partial<DigestRow> = {}): DigestRow {
  return { id: title, title, type: "task", at: null, allDay: true, day: TODAY, author: null, repeating: false, daily: false, ...over };
}

function coming(name: string, day: string, by = false): ComingRow {
  return { id: name, name, day, by };
}

describe("Coming up", () => {
  it("follows what is due, under its own words", () => {
    const copy = digestCopy("morning", [due("Pay the rent")], [], ZONE, TODAY, "en", [
      coming("Meera's birthday", "2027-03-14"),
      coming("Lisbon", "2026-11-08"),
    ]);
    expect(copy).toEqual({
      title: "One today, two coming up",
      body: "Pay the rent. Coming up: Meera's birthday on 14 March, and Lisbon on Sunday.",
    });
  });

  it("is the whole body when nothing is due, and says by for a deadline", () => {
    const copy = digestCopy("morning", [], [], ZONE, TODAY, "en", [
      coming("Meera's birthday", "2027-03-14"),
      coming("Get the visa", "2026-11-11", true),
    ]);
    expect(copy).toEqual({ title: "Two coming up", body: "Meera's birthday on 14 March, and Get the visa by 11 November." });
  });

  it("says tomorrow, and one named alone", () => {
    expect(digestCopy("morning", [], [], ZONE, TODAY, "en", [coming("Lisbon", "2026-11-03")])).toEqual({
      title: "One coming up",
      body: "Lisbon tomorrow.",
    });
    expect(digestCopy("morning", [], [], ZONE, TODAY, "en", [coming("Rent", "2026-11-03", true)]).body).toBe("Rent by tomorrow.");
  });

  it("names two and counts the rest past four", () => {
    const five = ["A", "B", "C", "D", "E"].map((name, n) => coming(name, `2026-11-2${n}`));
    expect(digestCopy("morning", [], [], ZONE, TODAY, "en", five)).toEqual({
      title: "Five coming up",
      body: "A on 20 November, B on 21 November, and three more.",
    });
  });

  it("in the evening, after what is due tomorrow", () => {
    const flight = due("Flight to Lisbon", { type: "event", at: "2026-11-03T06:00:00Z", allDay: false, day: "2026-11-03" });
    const copy = digestCopy("evening", [flight], [], ZONE, TODAY, "en", [coming("Renew the passport", "2026-12-09", true)]);
    expect(copy).toEqual({
      title: "One tomorrow, one coming up",
      body: "Flight to Lisbon at 6:00. Coming up: Renew the passport by 9 December.",
    });
  });

  it("after what is still open, and counted in the title", () => {
    const late = due("Call the plumber", { day: "2026-11-01" });
    const copy = digestCopy("morning", [due("Pay the rent")], [late], ZONE, TODAY, "en", [coming("Lisbon", "2026-11-08")]);
    expect(copy.title).toBe("One today, one from yesterday, one coming up");
    expect(copy.body).toBe("Pay the rent. Still open: Call the plumber. Coming up: Lisbon on Sunday.");
  });

  it("clamps a name to one line and 120, and the send stays exactly as 024 built it without one", () => {
    const long = coming(`Lisbon\n${"x".repeat(200)}`, "2026-11-08");
    expect(digestCopy("morning", [], [], ZONE, TODAY, "en", [long]).body).toBe(`Lisbon ${"x".repeat(113)} on Sunday.`);
    expect(digestCopy("morning", [due("Pay the rent")], [], ZONE, TODAY)).toEqual({ title: "One today", body: "Pay the rent." });
  });
});

describe("the body is cut at a word", () => {
  it("at 240, ending in a full stop", () => {
    const words = Array.from({ length: 80 }, (_, n) => `word${n}`).join(" ");
    const cut = cutAtWord(`${words}.`, 240);
    expect(cut.length).toBeLessThanOrEqual(240);
    expect(cut.endsWith(".")).toBe(true);
    expect(cut).toMatch(/word\d+\.$/);
    expect(cutAtWord("Short.", 240)).toBe("Short.");
  });
});

describe("a reminder of its own", () => {
  const at = new Date("2026-11-02T09:30:00Z");

  it("says when in its title and what in its body", () => {
    expect(ownCopy("Standup", at, 15, ZONE)).toEqual({ title: "In 15 minutes", body: "Standup at 9:30." });
    expect(ownCopy("Call the clinic", at, 30, ZONE)).toEqual({ title: "In 30 minutes", body: "Call the clinic at 9:30." });
    expect(ownCopy("Dentist", at, 60, ZONE)).toEqual({ title: "In an hour", body: "Dentist at 9:30." });
    expect(ownCopy("Call mum", at, 0, ZONE)).toEqual({ title: "Now", body: "Call mum at 9:30." });
  });

  it("never carries a dash or a second line", () => {
    const copy = ownCopy("Standup \u2014 room 4\nsecond", at, 15, ZONE);
    expect(copy.body).toBe("Standup, room 4 second at 9:30.");
  });
});
