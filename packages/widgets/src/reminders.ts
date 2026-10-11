// 042. What both clients draw for reminders, decided once, so the phones and
// the web cannot disagree about when the bell shows or what a choice says.

import { addDays } from "./days.js";

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

/** Whether each hour is in use: the morning hour by Due today or Reminders,
 *  the evening hour by Tomorrow or Reminders. An hour greys only when both
 *  switches that use it are off. */
export function hoursOn(me: { notifyDueToday: boolean; notifyComingTomorrow: boolean; notifyReminders: boolean }): {
  morning: boolean;
  evening: boolean;
} {
  return { morning: me.notifyDueToday || me.notifyReminders, evening: me.notifyComingTomorrow || me.notifyReminders };
}

/** The query parameter that opens one memory in Memories, from Today's
 *  Reminders section, on the phones and the web alike. */
export const MEMORY_PARAM = "memory";
