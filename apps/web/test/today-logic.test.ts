// 027 T2.1 to T2.4: the logic both clients' Today share.
//
// AC-14 the stepper's names; AC-16 the next line; AC-17 an event's time range;
// AC-24 the empty day's line; AC-29 the retry schedule.

import { describe, expect, it } from "vitest";
import { afterWrite, dayName, eventRange, nextLine, nothingLine, retryDelay, stackView } from "@offload/widgets";

// Tuesday 29 September 2026.
const TUE = "2026-09-29";
const SAT = "2026-10-03";
const LISBON = "Europe/Lisbon";

describe("027 AC-14 the stepper's names", () => {
  it("names today, tomorrow with its full date, then weekdays to the end of the week with their date", () => {
    expect(dayName(TUE, TUE, "monday")).toEqual({ name: "Today", sub: null });
    expect(dayName("2026-09-30", TUE, "monday")).toEqual({ name: "Tomorrow", sub: "Wednesday 30 September" });
    expect(dayName("2026-10-01", TUE, "monday")).toEqual({ name: "Thursday", sub: "1 October" });
    expect(dayName("2026-10-04", TUE, "monday")).toEqual({ name: "Sunday", sub: "4 October" });
  });

  it("names the week after with Next, then the date with nothing under it", () => {
    expect(dayName("2026-10-05", TUE, "monday")).toEqual({ name: "Next Monday", sub: "5 October" });
    expect(dayName("2026-10-11", TUE, "monday")).toEqual({ name: "Next Sunday", sub: "11 October" });
    expect(dayName("2026-10-12", TUE, "monday")).toEqual({ name: "Mon 12 Oct", sub: null });
    expect(dayName("2026-10-15", TUE, "monday")).toEqual({ name: "Thu 15 Oct", sub: null });
  });

  it("ends the week on Saturday when it starts on Sunday", () => {
    expect(dayName("2026-10-03", TUE, "sunday")).toEqual({ name: "Saturday", sub: "3 October" });
    expect(dayName("2026-10-04", TUE, "sunday")).toEqual({ name: "Next Sunday", sub: "4 October" });
    expect(dayName("2026-10-10", TUE, "sunday")).toEqual({ name: "Next Saturday", sub: "10 October" });
    expect(dayName("2026-10-11", TUE, "sunday")).toEqual({ name: "Sun 11 Oct", sub: null });
  });

  it("calls Saturday's Monday Next Monday with a Monday week", () => {
    expect(dayName("2026-10-04", SAT, "monday")).toEqual({ name: "Tomorrow", sub: "Sunday 4 October" });
    expect(dayName("2026-10-05", SAT, "monday")).toEqual({ name: "Next Monday", sub: "5 October" });
  });
});

describe("027 AC-16 the next line", () => {
  const ev = (over: Partial<{ id: string; title: string; startsAt: string | null; endsAt: string | null; allDay: boolean; mine: boolean }>) => ({
    id: "e",
    title: "Call with Ana",
    startsAt: null,
    endsAt: null,
    allDay: false,
    mine: true,
    ...over,
  });
  const NOW = new Date("2026-09-30T09:30:00Z"); // 10:30 in Lisbon

  it("counts down to the next of the person's own timed events", () => {
    const events = [
      ev({ id: "past", title: "Standup", startsAt: "2026-09-30T08:00:00Z", endsAt: "2026-09-30T08:30:00Z" }),
      ev({ id: "allday", title: "Holiday", startsAt: "2026-09-30T00:00:00Z", allDay: true }),
      ev({ id: "theirs", title: "Ana's dentist", startsAt: "2026-09-30T10:00:00Z", mine: false }),
      ev({ id: "next", title: "Call with Ana", startsAt: "2026-09-30T11:00:00Z", endsAt: "2026-09-30T11:30:00Z" }),
    ];
    expect(nextLine(events, NOW, true, LISBON)).toEqual({ id: "next", title: "Call with Ana", tail: " in 1h 30m" });
  });

  it("says minutes alone under an hour, hours alone on the hour", () => {
    expect(nextLine([ev({ startsAt: "2026-09-30T10:15:00Z" })], NOW, true, LISBON)?.tail).toBe(" in 45m");
    expect(nextLine([ev({ startsAt: "2026-09-30T11:30:00Z" })], NOW, true, LISBON)?.tail).toBe(" in 2h");
  });

  it("says until while it is happening", () => {
    expect(nextLine([ev({ startsAt: "2026-09-30T09:00:00Z", endsAt: "2026-09-30T11:30:00Z" })], NOW, true, LISBON)?.tail).toBe(" until 12:30");
  });

  it("names another day's first event at its hour", () => {
    const events = [ev({ id: "b", title: "Lunch", startsAt: "2026-10-01T12:00:00Z" }), ev({ id: "a", title: "Dentist", startsAt: "2026-10-01T09:00:00Z" })];
    expect(nextLine(events, NOW, false, LISBON)).toEqual({ id: "a", title: "Dentist", tail: " at 10:00" });
  });

  it("is nothing once every event has ended, or with only all-day and other people's", () => {
    expect(nextLine([ev({ startsAt: "2026-09-30T07:00:00Z", endsAt: "2026-09-30T08:00:00Z" })], NOW, true, LISBON)).toBeNull();
    expect(nextLine([ev({ allDay: true, startsAt: "2026-09-30T00:00:00Z" }), ev({ mine: false, startsAt: "2026-09-30T12:00:00Z" })], NOW, true, LISBON)).toBeNull();
  });

  it("treats an event with no end as over an hour after it starts", () => {
    expect(nextLine([ev({ startsAt: "2026-09-30T09:00:00Z" })], NOW, true, LISBON)?.tail).toBe(" until 11:00");
    expect(nextLine([ev({ startsAt: "2026-09-30T08:00:00Z" })], NOW, true, LISBON)).toBeNull();
  });
});

describe("027 AC-17 an event's time range", () => {
  it("reads 9:00 to 9:30, a start alone, or All day", () => {
    expect(eventRange({ startsAt: "2026-09-30T08:00:00Z", endsAt: "2026-09-30T08:30:00Z", allDay: false }, LISBON)).toBe("9:00 to 9:30");
    expect(eventRange({ startsAt: "2026-09-30T08:00:00Z", endsAt: null, allDay: false }, LISBON)).toBe("9:00");
    expect(eventRange({ startsAt: "2026-09-30T00:00:00Z", endsAt: null, allDay: true }, LISBON)).toBe("All day");
  });
});

describe("027 AC-24 the empty day's line", () => {
  it("names the day the way the stepper does", () => {
    expect(nothingLine("Today")).toBe("Nothing today.");
    expect(nothingLine("Tomorrow")).toBe("Nothing tomorrow.");
    expect(nothingLine("Thursday")).toBe("Nothing on Thursday.");
    expect(nothingLine("Next Monday")).toBe("Nothing next Monday.");
    expect(nothingLine("Wed 15 Oct")).toBe("Nothing on Wed 15 Oct.");
  });
});

describe("027 AC-29 the retry schedule", () => {
  it("waits about 2, 4, 8, then 15 seconds, each within half again either way", () => {
    const base = [2000, 4000, 8000, 15000, 15000, 15000];
    base.forEach((ms, attempt) => {
      expect(retryDelay(attempt, () => 0)).toBe(ms * 0.5);
      expect(retryDelay(attempt, () => 0.999999)).toBeLessThan(ms * 1.5);
      expect(retryDelay(attempt, () => 0.5)).toBe(ms);
    });
  });
});

describe("027 AC-11 the stack's count", () => {
  const cards = ["a", "b", "c", "d"].map((key) => ({ key }));
  it("counts N of M from the load and draws one sliver at two and two at three", () => {
    expect(stackView(cards, new Set())).toMatchObject({ position: 1, total: 4, slivers: 2 });
    expect(stackView(cards, new Set(["a", "b"]))).toMatchObject({ position: 3, total: 4, slivers: 1 });
    expect(stackView(cards, new Set(["a", "b", "c", "d"])).current).toBeNull();
  });
  it("goes on counting when a card leaves by itself", () => {
    const left = cards.filter((card) => card.key !== "b");
    expect(stackView(left, new Set(["a"]), 4)).toMatchObject({ position: 3, total: 4, current: { key: "c" } });
  });
});

describe("027 AC-27 a write that fails undoes only itself", () => {
  const A = { v: "a" }, B = { v: "b" }, C = { v: "c" };
  it("confirms what landed", () => {
    expect(afterWrite({ shown: B, confirmed: A }, B, true)).toEqual({ shown: B, confirmed: B });
  });
  it("puts back the last confirmed value when nothing newer was drawn", () => {
    expect(afterWrite({ shown: B, confirmed: A }, B, false)).toEqual({ shown: A, confirmed: A });
  });
  it("leaves a newer gesture drawn when an older write fails", () => {
    expect(afterWrite({ shown: C, confirmed: A }, B, false)).toEqual({ shown: C, confirmed: A });
  });
});
