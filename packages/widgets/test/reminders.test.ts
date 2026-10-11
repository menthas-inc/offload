// 042. What both clients draw for reminders, decided once: when the bell and
// the switch show, the words of the Notifications section, Today's section
// and the day a reminder is about.

import { describe, expect, it } from "vitest";
import {
  bellOn,
  DATES_CAPTION,
  REMINDER_COUNTS,
  REMINDERS_LINE,
  remindDayLabel,
  remindSwitchShown,
  TODAY_REMINDERS,
} from "../src/reminders.js";

describe("the bell and the switch", () => {
  it("the bell is on while offload will remind, or while somebody asked", () => {
    expect(bellOn({ reminders: "on", isReminder: false })).toBe(true);
    expect(bellOn({ reminders: "off", isReminder: false })).toBe(false);
    expect(bellOn({ reminders: null, isReminder: true })).toBe(true);
    expect(bellOn({ reminders: null, isReminder: false })).toBe(false);
    expect(bellOn({})).toBe(false);
  });

  it("the author sees the switch on anything offload reminds about or stopped; anybody else only on a row somebody asked about", () => {
    expect(remindSwitchShown({ reminders: "on" }, true)).toBe(true);
    expect(remindSwitchShown({ reminders: "off" }, true)).toBe(true);
    expect(remindSwitchShown({ reminders: null, isReminder: true }, true)).toBe(true);
    expect(remindSwitchShown({ reminders: null }, true)).toBe(false);
    expect(remindSwitchShown({ reminders: null, isReminder: true }, false)).toBe(true);
    expect(remindSwitchShown({ reminders: null, isReminder: false }, false)).toBe(false);
  });
});

describe("the words", () => {
  it("How many is three choices with a caption each", () => {
    expect(REMINDER_COUNTS).toEqual([
      { count: 1, label: "Low", caption: "One for each date." },
      { count: 2, label: "Medium", caption: "Up to two for each date." },
      { count: 3, label: "High", caption: "Up to three for each date." },
    ]);
    expect(REMINDERS_LINE).toBe("Before the dates that need one, in those two messages or just before a set time.");
    expect(DATES_CAPTION).toBe("What is due, in one message each morning and evening.");
    expect(TODAY_REMINDERS).toEqual({ name: "Reminders", line: "What offload is reminding you about, nearest first" });
  });

  it("no dash, no capitalised brand, sentence case", () => {
    const all = [REMINDERS_LINE, DATES_CAPTION, TODAY_REMINDERS.line, ...REMINDER_COUNTS.map((c) => c.caption)].join(" ");
    expect(all).not.toMatch(/[\u2013\u2014]|Offload/);
  });
});

describe("the day a reminder is about", () => {
  const TODAY = "2026-11-02"; // a Monday

  it("today, tomorrow, the weekday within the week, the day and month beyond", () => {
    expect(remindDayLabel("2026-11-02", TODAY, false)).toBe("Today");
    expect(remindDayLabel("2026-11-03", TODAY, false)).toBe("Tomorrow");
    expect(remindDayLabel("2026-11-06", TODAY, false)).toBe("Friday");
    expect(remindDayLabel("2026-11-30", TODAY, false)).toBe("30 November");
  });

  it("says by for a deadline", () => {
    expect(remindDayLabel("2026-11-03", TODAY, true)).toBe("By tomorrow");
    expect(remindDayLabel("2026-11-30", TODAY, true)).toBe("By 30 November");
  });
});

describe("decided once for both clients (review, 2026-10-10)", () => {
  it("How many is Medium until the account says otherwise", async () => {
    const { REMINDER_COUNT_DEFAULT } = await import("../src/reminders.js");
    expect(REMINDER_COUNT_DEFAULT).toBe(2);
  });

  it("an hour greys only when both switches that use it are off", async () => {
    const { hoursOn } = await import("../src/reminders.js");
    expect(hoursOn({ notifyDueToday: false, notifyComingTomorrow: true, notifyReminders: true })).toEqual({ morning: true, evening: true });
    expect(hoursOn({ notifyDueToday: false, notifyComingTomorrow: false, notifyReminders: false })).toEqual({ morning: false, evening: false });
    expect(hoursOn({ notifyDueToday: true, notifyComingTomorrow: false, notifyReminders: false })).toEqual({ morning: true, evening: false });
  });

  it("the morning hour is in use by Calendar too, never the evening", async () => {
    const { hoursOn, CALENDAR_LINE } = await import("../src/reminders.js");
    expect(hoursOn({ notifyDueToday: false, notifyComingTomorrow: false, notifyReminders: false, notifyCalendar: true })).toEqual({ morning: true, evening: false });
    expect(CALENDAR_LINE).not.toMatch(/[\u2013\u2014]/);
    // The ticked calendars only, as the privacy page says "the calendars you choose".
    expect(CALENDAR_LINE).toBe("Today's events on the calendars you chose, in the morning message.");
  });

  it("a memory opens from a reminder by one name on every surface", async () => {
    const { MEMORY_PARAM } = await import("../src/reminders.js");
    expect(MEMORY_PARAM).toBe("memory");
  });
});
