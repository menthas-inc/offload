// 042. The Reminders section of Settings, Notifications: its switch, How many
// as three tiles that grey with it, the hours that grey only when both
// switches that use them are off, and the Dates caption. Read from the
// source where it is drawing, since these tests render nothing.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hoursOn } from "@offload/widgets";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("the hours", () => {
  const off = { notifyDueToday: false, notifyComingTomorrow: false, notifyReminders: false };

  it("grey only when both switches that use them are off", () => {
    expect(hoursOn(off)).toEqual({ morning: false, evening: false });
    expect(hoursOn({ ...off, notifyReminders: true })).toEqual({ morning: true, evening: true });
    expect(hoursOn({ ...off, notifyDueToday: true })).toEqual({ morning: true, evening: false });
    expect(hoursOn({ ...off, notifyComingTomorrow: true })).toEqual({ morning: false, evening: true });
  });
});

describe("the page", () => {
  const page = read("components/settings/NotificationsPage.tsx");

  it("puts Reminders between Dates and People", () => {
    const dates = page.indexOf('label="Dates"');
    const reminders = page.indexOf('label="Reminders"');
    const people = page.indexOf('label="People"');
    expect(dates).toBeGreaterThan(-1);
    expect(reminders).toBeGreaterThan(dates);
    expect(people).toBeGreaterThan(reminders);
  });

  it("draws the switch with the shared line, and mirrors its Android channel", () => {
    expect(page).toMatch(/toggle\("notifyReminders", "Reminders", REMINDERS_LINE/);
    expect(page).toMatch(/notifyReminders: "reminders"/);
  });

  it("draws How many as three tiles from the shared counts, greyed with the switch, the caption following the pick", () => {
    expect(page).toMatch(/REMINDER_COUNTS\.map/);
    expect(page).toMatch(/<CountPreview count=\{/);
    expect(page).toMatch(/disabled=\{!remindersOn\}/);
    expect(page).toMatch(/REMINDER_COUNTS\.find\(\(choice\) => choice\.count === count\)\?\.caption/);
    expect(page).toMatch(/notifyReminderCount/);
    expect(page).toMatch(/value\("notifyReminderCount"\) \?\? REMINDER_COUNT_DEFAULT/);
    expect(page).not.toMatch(/\?\? 2\b/);
  });

  it("greys How many one way with the hours: a fade on the whole row", () => {
    const count = page.slice(page.indexOf("function CountRow"), page.indexOf("function HourRow"));
    expect(count).toMatch(/\$\{on \? "" : "opacity-60"\}/);
    expect(count).not.toMatch(/state-disabled/);
    expect(page).toMatch(/\$\{on \? "" : "opacity-60"\} \$\{edge\}/);
  });

  it("greys each hour on both of its switches, from the shared rule, and says the Dates caption from the shared words", () => {
    expect(page).toMatch(/import \{[^}]*\bhoursOn\b[^}]*\} from "@offload\/widgets"/);
    expect(page).toMatch(/hoursOn\(/);
    expect(read("lib/settings.ts")).not.toMatch(/hoursOn/);
    expect(page).toMatch(/caption=\{DATES_CAPTION\}/);
    expect(page).not.toMatch(/said once a day rather than one by one/);
  });
});

describe("the tiles", () => {
  const tiles = read("components/settings/ChoiceTiles.tsx");

  it("take disabled: not pressable and announced as disabled, greyed by the row that holds them and not by colours of their own", () => {
    expect(tiles).toMatch(/disabled\?: boolean/);
    expect(tiles).toMatch(/disabled=\{disabled\}/);
    expect(tiles).toMatch(/accessibilityState=\{\{ checked: on, disabled \}\}/);
    expect(tiles).not.toMatch(/state-disabled/);
    expect(tiles).not.toMatch(/never a fade/);
  });

  it("draw How many as a line ending at a date, with one to three marks before it, from tokens", () => {
    const preview = tiles.slice(tiles.indexOf("export function CountPreview"));
    expect(preview.length).toBeGreaterThan(30);
    expect(preview).toMatch(/count: 1 \| 2 \| 3/);
    expect(preview).toMatch(/Array\.from\(\{ length: count \}/);
    expect(preview).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
  });
});

describe("the account", () => {
  it("carries the switch and How many, written through setNotify", () => {
    const me = read("lib/me.ts");
    expect(me).toMatch(/notifyReminders: boolean;/);
    expect(me).toMatch(/notifyReminderCount: 1 \| 2 \| 3;/);
    expect(me).toMatch(/notifyReminders\?: boolean;/);
    expect(me).toMatch(/notifyReminderCount\?: 1 \| 2 \| 3;/);
  });
});

describe("the Calendar section (2026-10-10)", () => {
  const page = read("components/settings/NotificationsPage.tsx");

  it("sits between Reminders and People, one switch with the shared line", () => {
    const reminders = page.indexOf('label="Reminders"');
    const calendar = page.indexOf('label="Calendar"');
    const people = page.indexOf('label="People"');
    expect(calendar).toBeGreaterThan(reminders);
    expect(people).toBeGreaterThan(calendar);
    expect(page).toMatch(/toggle\("notifyCalendar", "Today's events", CALENDAR_LINE/);
  });

  it("rides the morning's channel, so a morning switched off in the system shows it off", () => {
    expect(page).toMatch(/notifyCalendar: "due_today"/);
  });

  it("mirrors a blocked channel into every switch it carries in one write", () => {
    const mirror = page.slice(page.indexOf("The account switch follows the system's answer"), page.indexOf("function openChannel"));
    expect(mirror).toMatch(/const patch: Patch = \{\};/);
    expect(mirror.match(/write\(/g)).toHaveLength(1);
  });

  it("keeps the morning hour in use, from the shared rule", () => {
    expect(page).toMatch(/notifyCalendar: value\("notifyCalendar"\) === true/);
    expect(hoursOn({ notifyDueToday: false, notifyComingTomorrow: false, notifyReminders: false, notifyCalendar: true })).toEqual({ morning: true, evening: false });
  });

  it("is carried on the account and written through setNotify", () => {
    const me = read("lib/me.ts");
    expect(me).toMatch(/notifyCalendar: boolean;/);
    expect(me).toMatch(/notifyCalendar\?: boolean;/);
  });
});
