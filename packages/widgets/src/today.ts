// 027 Today: the words both clients draw from the same rules.
//
// The stepper's names, the next line, an event's time range, the empty day's
// line and launch's retry schedule. Pure, so the web and the phones cannot
// name a day differently except where the person's own week start says so.

import { daysBetween, noonUtc, weekdayIndex } from "./days.js";
import { timeIn } from "./nearness.js";

export type WeekStart = "monday" | "sunday";

const fmt = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(noonUtc(day));

/** The stepper's name for `day` and the small line under it. */
export function dayName(day: string, today: string, weekStart: WeekStart): { name: string; sub: string | null } {
  const ahead = daysBetween(today, day);
  if (ahead <= 0) return { name: "Today", sub: null };
  const weekday = fmt(day, { weekday: "long" });
  const date = fmt(day, { day: "numeric", month: "long" });
  if (ahead === 1) return { name: "Tomorrow", sub: `${weekday} ${date}` };
  // Days left in this week after today: a Monday week ends on Sunday, a
  // Sunday week on Saturday.
  const position = weekStart === "monday" ? weekdayIndex(today) : (weekdayIndex(today) + 1) % 7;
  const left = 6 - position;
  if (ahead <= left) return { name: weekday, sub: date };
  if (ahead <= left + 7) return { name: `Next ${weekday}`, sub: date };
  return { name: `${fmt(day, { weekday: "short" })} ${fmt(day, { day: "numeric" })} ${fmt(day, { month: "short" })}`, sub: null };
}

/** The empty day's one line, named as the stepper names the day. */
export function nothingLine(name: string): string {
  if (name === "Today") return "Nothing today.";
  if (name === "Tomorrow") return "Nothing tomorrow.";
  if (name.startsWith("Next ")) return `Nothing next ${name.slice(5)}.`;
  return `Nothing on ${name}.`;
}

export interface LineEvent {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  mine: boolean;
}

const HOUR_MS = 60 * 60 * 1000;

/** When an event is over: its end, or an hour after a start with no end. */
function endOf(event: LineEvent): number {
  const start = new Date(event.startsAt!).getTime();
  const end = event.endsAt ? new Date(event.endsAt).getTime() : start + HOUR_MS;
  return end > start ? end : start + HOUR_MS;
}

function countdown(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
}

/** The next line: the person's own next timed event and its tail, the part
 *  drawn in the attention colour, with its leading space. Never an all-day
 *  event and never another member's. */
export function nextLine(
  events: LineEvent[],
  now: Date,
  isToday: boolean,
  zone: string | null,
): { id: string; title: string; tail: string } | null {
  const timed = events
    .filter((event) => event.mine && !event.allDay && event.startsAt)
    .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime());
  if (!isToday) {
    const first = timed[0];
    return first ? { id: first.id, title: first.title, tail: ` at ${timeIn(new Date(first.startsAt!), zone, "en-GB")}` } : null;
  }
  const at = now.getTime();
  const next = timed.find((event) => endOf(event) > at);
  if (!next) return null;
  const start = new Date(next.startsAt!).getTime();
  if (start <= at) return { id: next.id, title: next.title, tail: ` until ${timeIn(new Date(endOf(next)), zone, "en-GB")}` };
  return { id: next.id, title: next.title, tail: ` ${countdown(start - at)}` };
}

/** An event card's first line: *9:00 to 9:30*, a start alone, or *All day*. */
export function eventRange(event: { startsAt: string | null; endsAt: string | null; allDay: boolean }, zone: string | null): string {
  if (event.allDay || !event.startsAt) return "All day";
  const start = timeIn(new Date(event.startsAt), zone, "en-GB");
  return event.endsAt ? `${start} to ${timeIn(new Date(event.endsAt), zone, "en-GB")}` : start;
}

/** Whether a timed event has ended at `now`. */
export function eventPast(event: { startsAt: string | null; endsAt: string | null; allDay: boolean }, now: Date): boolean {
  if (event.allDay || !event.startsAt) return false;
  return endOf({ ...event, id: "", title: "", mine: true }) <= now.getTime();
}

const RETRY_SECONDS = [2, 4, 8];
const RETRY_STEADY = 15;

/** Launch's retry when nothing answers: about 2, 4 and 8 seconds, then about
 *  every 15, each scaled into half again either way so phones that lost the
 *  server together do not come back together. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const seconds = RETRY_SECONDS[attempt] ?? RETRY_STEADY;
  return seconds * 1000 * (0.5 + random());
}
