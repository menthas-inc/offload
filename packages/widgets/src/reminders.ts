// 042. What both clients draw for reminders, decided once, so the phones and
// the web cannot disagree about when the bell shows or what a choice says.
// Since 2026-10-10 also the Calendar switch's line and the hours it uses,
// since it rides in the same morning message.

import { addDays, daysBetween } from "./days.js";

/** The author's Remind me as the API sends it: on while offload will remind
 *  them, off once they stopped it, null otherwise and to anybody else. */
export type Reminders = "on" | "off" | null;

interface Remindable {
  reminders?: Reminders | undefined;
  isReminder?: boolean | undefined;
}

/** The bell on the date chip: offload will remind about it, or somebody
 *  asked to be reminded (024's flag, which every member still sees). */
export function bellOn(row: Remindable): boolean {
  return row.reminders === "on" || row.isReminder === true;
}

/** Where the switch is drawn: to the author on anything offload reminds
 *  about or that they stopped; to anybody else only while somebody asked. */
export function remindSwitchShown(row: Remindable, isAuthor: boolean): boolean {
  if (row.isReminder === true) return true;
  return isAuthor && (row.reminders === "on" || row.reminders === "off");
}

/** How many, as three choices with a caption each. */
export const REMINDER_COUNTS = [
  { count: 1, label: "Low", caption: "One for each date." },
  { count: 2, label: "Medium", caption: "Up to two for each date." },
  { count: 3, label: "High", caption: "Up to three for each date." },
] as const;

/** The Reminders switch's line on the Notifications page. */
export const REMINDERS_LINE = "Before the dates that need one, in those two messages or just before a set time.";

/** The Dates section's caption, which no longer says everything comes once a
 *  day: a set time can have a notification of its own. */
export const DATES_CAPTION = "What is due, in one message each morning and evening.";

/** Today's section, as Customize Today names it. */
export const TODAY_REMINDERS = { name: "Reminders", line: "What offload is reminding you about, nearest first" } as const;

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/** The day a reminder is about, as a line in Today's section: "Today",
 *  "Tomorrow", the weekday within the week, the day and month beyond, with
 *  "By" for a deadline. */
export function remindDayLabel(day: string, today: string, by: boolean): string {
  const at = new Date(`${day}T12:00:00Z`);
  let label: string;
  if (day === today) label = "today";
  else if (day === addDays(today, 1)) label = "tomorrow";
  else if (day > today && day < addDays(today, 7)) label = WEEKDAY.format(at);
  else label = DAY_MONTH.format(at);
  const said = by ? `by ${label}` : label;
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/** How many until the account says otherwise: Medium, as the column's default. */
export const REMINDER_COUNT_DEFAULT = 2;

/** Whether each hour is in use: the morning hour by Due today, Reminders or
 *  Calendar, the evening hour by Tomorrow or Reminders. An hour greys only
 *  when every switch that uses it is off. */
export function hoursOn(me: { notifyDueToday: boolean; notifyComingTomorrow: boolean; notifyReminders: boolean; notifyCalendar?: boolean }): {
  morning: boolean;
  evening: boolean;
} {
  return {
    morning: me.notifyDueToday || me.notifyReminders || me.notifyCalendar === true,
    evening: me.notifyComingTomorrow || me.notifyReminders,
  };
}

/** 2026-10-10. The Calendar switch's line on the Notifications page. */
export const CALENDAR_LINE = "Today's events on the calendars you chose, in the morning message.";

/** The query parameter that opens one memory in Memories, from Today's
 *  Reminders section, on the phones and the web alike. */
export const MEMORY_PARAM = "memory";

// ---------------------------------------------------------------- Today's column (drawn 2026-10-11)

/** The countdown that leads a card in Today's Reminders: Today, Tomorrow,
 *  then In N days. A day already here is Today, never a count below zero. */
export function countdownLabel(day: string, today: string): string {
  const ahead = daysBetween(today, day);
  if (ahead <= 0) return "Today";
  if (ahead === 1) return "Tomorrow";
  return `In ${ahead} days`;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Under the countdown: "Tue 13 Oct", or "By Sun 18 Oct" for a deadline or a
 *  task reminded against what it is for. */
export function reminderDayLine(day: string, by: boolean): string {
  const said = SHORT_DAY.format(new Date(`${day}T12:00:00Z`)).replace(",", "");
  return by ? `By ${said}` : said;
}

/** After where it lives, when the row has a clock time: "21:40", or "By
 *  18:00" for a deadline. */
export function reminderTimeLine(time: string, by: boolean): string {
  return by ? `By ${time}` : time;
}

/** The dismiss's accessible name. */
export function dismissLabel(name: string): string {
  return `Dismiss ${name}`;
}

/** The toast after a dismiss, with Undo beside it. A dismiss hides the one
 *  reminder that was showing, not the row (the owner, 2026-10-11), so the
 *  line says when the row's next reminder brings it back; with none to
 *  come, it says only that it is gone. */
export function dismissedLine(next: string | null, today: string): string {
  if (!next) return "Dismissed";
  if (next <= today) return "Dismissed until later today";
  const when = remindDayLabel(next, today, false);
  return `Dismissed until ${when === "Tomorrow" ? "tomorrow" : when}`;
}

/** Where what a reminder is about lives, under its name: a row's thread with
 *  the thread's own icon (`lasso` when it has none), `inbox` and Not in a
 *  thread for a row in the default thread; `text-quote` for a note whatever
 *  its thread; `cloudy` and Memories for a memory. Decided once. */
export function whereOf(which: { of: "content" | "note" | "memory"; threadName: string | null; threadIcon: string | null }): { icon: string; text: string } {
  if (which.of === "memory") return { icon: "cloudy", text: "Memories" };
  if (which.of === "note") return { icon: "text-quote", text: which.threadName ?? "Not in a thread" };
  return which.threadName === null ? { icon: "inbox", text: "Not in a thread" } : { icon: which.threadIcon ?? "lasso", text: which.threadName };
}

/** The key a dismissed reminder is hidden by on the screen: the row, its
 *  day and the reminder showing, as the server keys a dismissal. A key with
 *  the row alone would hide its next reminder too on a screen left open. */
export function reminderKey(which: { of: "content" | "note" | "memory"; id: string; day: string; window: string }): string {
  return `${which.of}:${which.id}:${which.day}:${which.window}`;
}
