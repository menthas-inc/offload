// Today's Reminders section as drawn 2026-10-11 (C2b): the countdown, the day
// line, the time line and the dismiss toast, decided once for the phones and
// the web.

import { describe, expect, it } from "vitest";
import { countdownLabel, dismissedLine, dismissLabel, reminderDayLine, reminderTimeLine } from "../src/reminders.js";

const TODAY = "2026-11-02"; // a Monday

describe("the countdown", () => {
  it("Today, Tomorrow, then In N days", () => {
    expect(countdownLabel("2026-11-02", TODAY)).toBe("Today");
    expect(countdownLabel("2026-11-03", TODAY)).toBe("Tomorrow");
    expect(countdownLabel("2026-11-04", TODAY)).toBe("In 2 days");
    expect(countdownLabel("2026-11-30", TODAY)).toBe("In 28 days");
  });

  it("a day already here is Today, never a negative count", () => {
    expect(countdownLabel("2026-11-01", TODAY)).toBe("Today");
  });
});

describe("the day and the time under it", () => {
  it("the weekday, the day and the month, short, with By for a deadline or a task for something", () => {
    expect(reminderDayLine("2026-11-02", false)).toBe("Mon 2 Nov");
    expect(reminderDayLine("2026-11-18", true)).toBe("By Wed 18 Nov");
  });

  it("the time, with By for a deadline", () => {
    expect(reminderTimeLine("21:40", false)).toBe("21:40");
    expect(reminderTimeLine("18:00", true)).toBe("By 18:00");
  });
});

describe("dismiss", () => {
  it("names the thing", () => {
    expect(dismissLabel("Mum's birthday")).toBe("Dismiss Mum's birthday");
  });

  it("says when the thing comes back, which is its next reminder, and nothing more", () => {
    expect(dismissedLine("2026-11-03", TODAY)).toBe("Dismissed until tomorrow");
    expect(dismissedLine("2026-11-06", TODAY)).toBe("Dismissed until Friday");
    expect(dismissedLine("2026-11-25", TODAY)).toBe("Dismissed until 25 November");
    expect(dismissedLine("2026-11-02", TODAY)).toBe("Dismissed until later today");
    expect(dismissedLine(null, TODAY)).toBe("Dismissed");
  });

  it("no dash anywhere", () => {
    for (const line of [dismissedLine("2026-11-25", TODAY), dismissedLine(null, TODAY), dismissLabel("x"), reminderDayLine("2026-11-02", true)]) {
      expect(line).not.toMatch(/[–—]/);
    }
  });
});

describe("where a reminder lives, decided once for the phones and the web", () => {
  it("a row: its thread with the thread's own icon, lasso as the fallback, inbox for Not in a thread", async () => {
    const { whereOf } = await import("../src/reminders.js");
    expect(whereOf({ of: "content", threadName: "Flat", threadIcon: "wrench" })).toEqual({ icon: "wrench", text: "Flat" });
    expect(whereOf({ of: "content", threadName: "Flat", threadIcon: null })).toEqual({ icon: "lasso", text: "Flat" });
    expect(whereOf({ of: "content", threadName: null, threadIcon: null })).toEqual({ icon: "inbox", text: "Not in a thread" });
  });

  it("a note draws text-quote whatever its thread; a memory is Memories under cloudy", async () => {
    const { whereOf } = await import("../src/reminders.js");
    expect(whereOf({ of: "note", threadName: "Flat", threadIcon: "wrench" })).toEqual({ icon: "text-quote", text: "Flat" });
    expect(whereOf({ of: "note", threadName: null, threadIcon: null })).toEqual({ icon: "text-quote", text: "Not in a thread" });
    expect(whereOf({ of: "memory", threadName: null, threadIcon: null })).toEqual({ icon: "cloudy", text: "Memories" });
  });

  it("a dismissed reminder is keyed by the thing, its day and the reminder showing", async () => {
    const { reminderKey } = await import("../src/reminders.js");
    expect(reminderKey({ of: "memory", id: "m1", day: "2026-11-30", window: "long" })).toBe("memory:m1:2026-11-30:long");
    expect(reminderKey({ of: "content", id: "c1", day: "2026-11-04", window: "short" })).not.toBe(reminderKey({ of: "content", id: "c1", day: "2026-11-04", window: "day" }));
  });
});

describe("one line per reminder, the same on the phones and the web (S14)", () => {
  const row = {
    id: "c1",
    title: "Pack the adapters",
    type: "task",
    dueAt: "2026-11-04T17:00:00.000Z",
    occursAt: null,
    allDay: false,
    doneAt: null,
    rrule: null,
    remindDay: "2026-11-04",
    remindBy: true,
    window: "short" as const,
    next: null,
    threadId: "t1",
    threadName: "Trip",
    threadIcon: "plane",
  };
  const other = (of: "note" | "memory", id: string, day: string, threadId: string | null = null) => ({
    of,
    id,
    name: id,
    day,
    by: false,
    time: null,
    window: "long" as const,
    next: "2026-11-20",
    threadId,
    threadName: threadId ? "Rent" : null,
    threadIcon: null,
  });

  it("puts rows, notes and memories in one list, nearest first, a row first on its day", async () => {
    const { remindersInOrder } = await import("../src/reminders.js");
    const merged = remindersInOrder({ rows: [row, { ...row, id: "c2", remindDay: "2026-11-20" }], others: [other("note", "n1", "2026-11-03"), other("memory", "m1", "2026-11-04")] });
    expect(merged.map((entry) => ("row" in entry ? entry.row.id : entry.other.id))).toEqual(["n1", "c1", "m1", "c2"]);
    expect(merged.map((entry) => entry.day)).toEqual(["2026-11-03", "2026-11-04", "2026-11-04", "2026-11-20"]);
  });

  it("draws a row: its time in the zone, its thread, and the dismissal the server keys", async () => {
    const { reminderLine } = await import("../src/reminders.js");
    expect(reminderLine({ row, day: row.remindDay }, "Europe/London")).toEqual({
      key: "content:c1:2026-11-04:short",
      name: "Pack the adapters",
      day: "2026-11-04",
      by: true,
      time: "17:00",
      next: null,
      opens: { threadId: "t1", threadName: "Trip" },
      where: { icon: "plane", text: "Trip" },
      which: { of: "content", id: "c1", day: "2026-11-04", window: "short" },
    });
    expect(reminderLine({ row: { ...row, allDay: true }, day: row.remindDay }, "Europe/London").time).toBeNull();
  });

  it("opens a memory in Memories, a note in its thread, and nothing for a note with no thread", async () => {
    const { reminderLine } = await import("../src/reminders.js");
    const memory = reminderLine({ other: other("memory", "m1", "2026-11-04"), day: "2026-11-04" }, null);
    expect(memory).toMatchObject({ key: "memory:m1:2026-11-04:long", opens: { memory: "m1" }, where: { icon: "cloudy", text: "Memories" } });
    expect(reminderLine({ other: other("note", "n1", "2026-11-04", "t2"), day: "2026-11-04" }, null).opens).toEqual({ threadId: "t2", threadName: "Rent" });
    expect(reminderLine({ other: other("note", "n2", "2026-11-04"), day: "2026-11-04" }, null).opens).toBeNull();
  });
});
