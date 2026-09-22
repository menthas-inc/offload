// The date chip: three states from one function, and the words on it.
//
// 023 AC-13 late, soon and later from the day and today; the boundary is today
//           plus three days inclusive; done is plain; a repeating row is never late.
// 023 AC-14 the words: today and tomorrow as words, the weekday within fourteen
//           days, the month past it with no prefix, the type's column, the
//           next occurrence of a rule.
// 023 AC-4  a bare day is read as its UTC date, a timed row in the account's zone.

import { describe, expect, it } from "vitest";
import { SOON_DAYS, chipFor, nearness, whenDayOf } from "@offload/widgets";

const TODAY = "2026-09-22";
const LISBON = "Europe/Lisbon";

function task(over: Partial<Parameters<typeof chipFor>[0]> = {}) {
  return { type: "task", dueAt: null, occursAt: null, allDay: true, doneAt: null, rrule: null, ...over };
}

describe("AC-13 nearness", () => {
  it("is late before today, soon for today and three days, later after", () => {
    expect(SOON_DAYS).toBe(3);
    expect(nearness("2026-09-21", TODAY)).toBe("late");
    expect(nearness("2026-09-22", TODAY)).toBe("soon");
    expect(nearness("2026-09-25", TODAY)).toBe("soon");
    expect(nearness("2026-09-26", TODAY)).toBe("later");
  });
  it("a done row is plain whatever its date", () => {
    const chip = chipFor(task({ dueAt: "2026-09-01T12:00:00Z", doneAt: "2026-09-02T10:00:00Z" }), LISBON, TODAY, "en-GB");
    expect(chip?.tone).toBe("done");
  });
  it("a repeating row names its next occurrence and is never late", () => {
    const chip = chipFor(task({ dueAt: "2026-09-04T12:00:00Z", rrule: "FREQ=WEEKLY;BYDAY=FR" }), LISBON, TODAY, "en-GB");
    expect(chip).toEqual({ label: "Due Fri 25", tone: "soon", day: "2026-09-25" });
  });
});

describe("AC-4 the day of a row", () => {
  it("reads a bare day as its UTC date in any zone", () => {
    const row = task({ dueAt: "2026-09-25T12:00:00Z" });
    expect(whenDayOf(row, "Pacific/Auckland")).toBe("2026-09-25");
    expect(whenDayOf(row, "America/Los_Angeles")).toBe("2026-09-25");
  });
  it("reads a timed row in the account's zone", () => {
    const row = task({ dueAt: "2026-09-25T23:30:00Z", allDay: false });
    expect(whenDayOf(row, "Europe/Lisbon")).toBe("2026-09-26");
    expect(whenDayOf(row, "America/Los_Angeles")).toBe("2026-09-25");
  });
  it("takes the type's column when a row has both", () => {
    const both = { dueAt: "2026-09-25T12:00:00Z", occursAt: "2026-09-28T12:00:00Z" };
    expect(whenDayOf(task(both), LISBON)).toBe("2026-09-25");
    expect(whenDayOf(task({ ...both, type: "event" }), LISBON)).toBe("2026-09-28");
    expect(whenDayOf(task({ ...both, type: "link" }), LISBON)).toBe("2026-09-25");
  });
  it("is null with no date, and the chip draws nothing", () => {
    expect(whenDayOf(task(), LISBON)).toBeNull();
    expect(chipFor(task(), LISBON, TODAY, "en-GB")).toBeNull();
  });
});

describe("AC-14 the words", () => {
  it("a task", () => {
    const at = (day: string, hour?: string) =>
      chipFor(task({ dueAt: hour ? `${day}T${hour}:00Z` : `${day}T12:00:00Z`, allDay: !hour }), LISBON, TODAY, "en-GB")?.label;
    expect(at("2026-09-22")).toBe("Due today");
    expect(at("2026-09-23")).toBe("Due tomorrow");
    expect(at("2026-09-25")).toBe("Due Fri 25");
    expect(at("2026-10-06")).toBe("Due Tue 6");
    expect(at("2026-10-07")).toBe("7 Oct");
    expect(at("2026-11-12")).toBe("12 Nov");
    expect(at("2026-09-18")).toBe("Due Fri 18");
    expect(at("2026-08-12")).toBe("12 Aug");
    // 08:00Z is 9:00 in Lisbon in September.
    expect(at("2026-09-25", "08:00")).toBe("Due Fri 25, 9:00");
    expect(at("2026-09-22", "08:00")).toBe("Due today, 9:00");
  });
  it("an event", () => {
    const at = (day: string, hour?: string) =>
      chipFor(task({ type: "event", occursAt: hour ? `${day}T${hour}:00Z` : `${day}T12:00:00Z`, allDay: !hour }), LISBON, TODAY, "en-GB")?.label;
    expect(at("2026-09-25", "18:00")).toBe("Fri 25, 19:00");
    expect(at("2026-09-22", "18:00")).toBe("Today, 19:00");
    expect(at("2026-09-25")).toBe("Fri 25");
    // Lisbon is back on standard time in November, so 18:00Z is 18:00 there.
    expect(at("2026-11-12", "18:00")).toBe("12 Nov, 18:00");
  });
  it("a 12-hour locale gets its own clock", () => {
    const chip = chipFor(task({ dueAt: "2026-09-25T08:00:00Z", allDay: false }), LISBON, TODAY, "en-US");
    expect(chip?.label).toBe("Due Fri 25, 9:00 AM");
  });
  it("carries the tone", () => {
    expect(chipFor(task({ dueAt: "2026-09-18T12:00:00Z" }), LISBON, TODAY, "en-GB")?.tone).toBe("late");
    expect(chipFor(task({ dueAt: "2026-09-25T12:00:00Z" }), LISBON, TODAY, "en-GB")?.tone).toBe("soon");
    expect(chipFor(task({ dueAt: "2026-10-25T12:00:00Z" }), LISBON, TODAY, "en-GB")?.tone).toBe("later");
  });
});
