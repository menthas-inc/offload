// 052. The words a reply draws beside its slices, from the turn's record. No
// model writes any of these (AC-23), so both clients word a reply the same way.

import { dayIn } from "./days.js";
import { timeIn } from "./nearness.js";
import { dayTitle } from "./today.js";
import { monthDated, monthFor, twoWeekFor, type Month, type MonthCount, type WeekStart } from "./timeline.js";

export type SummaryKind = "new" | "filed" | "moved" | "ticked" | "changed" | "started" | "remembered" | "added";
export interface ReplySummary {
  kind: SummaryKind;
  count: number;
}

export type PillKind = "date" | "calendar" | "remind" | "share" | "directions";
export interface Pill {
  kind: PillKind;
  rowId?: string;
  calendar?: { id: string; name: string; colour: string | null };
  person?: { accountId: string; name: string };
}

/** What the undo line says the turn did. */
export function summaryWords({ kind, count }: ReplySummary): string {
  switch (kind) {
    case "new":
      return count === 1 ? "Added" : `${count} new`;
    case "filed":
      return `${count} filed`;
    case "moved":
      return count === 1 ? "Moved" : `${count} moved`;
    case "ticked":
      return count === 1 ? "Ticked" : `${count} ticked`;
    case "changed":
      return count === 1 ? "Changed" : `${count} changed`;
    case "started":
      return "Started";
    case "remembered":
      return "Remembered";
    case "added":
      return "Added";
  }
}

const PILL_MAX = 24;

/** `lead` and then `name`, cut at a word so the whole fits in `max`. */
function fit(lead: string, name: string, max = PILL_MAX): string {
  const whole = `${lead}${name}`;
  if (whole.length <= max) return whole;
  const room = max - lead.length - 1;
  const words = name.split(/\s+/);
  let kept = "";
  for (const word of words) {
    const next = kept ? `${kept} ${word}` : word;
    if (next.length > room) break;
    kept = next;
  }
  // A single word longer than the room is cut where the room ends.
  return `${lead}${kept || name.slice(0, room)}…`;
}

export function pillLabel(pill: Pill): string {
  switch (pill.kind) {
    case "date":
      return "Add a date";
    case "remind":
      return "Remind me";
    case "directions":
      return "Directions";
    case "calendar":
      return fit("Add to ", pill.calendar?.name ?? "calendar");
    case "share":
      return fit("Share with ", (pill.person?.name ?? "").split(/\s+/)[0] ?? "");
  }
}

/** The threads a turn reached past its third slice, each one a link. */
export function alsoLine<T extends { id: string; name: string }>(threads: readonly T[]): { lead: string; threads: readonly T[] } | null {
  return threads.length ? { lead: "Also in", threads } : null;
}

/** Three domains, then the rest as a count in words. */
export function sourceLine<T extends { domain: string }>(sources: readonly T[]): { shown: T[]; more: string | null } | null {
  if (!sources.length) return null;
  const shown = sources.slice(0, 3);
  const rest = sources.length - shown.length;
  return { shown, more: rest > 0 ? `and ${rest} more` : null };
}

/** What a late Undo left as it was, because somebody changed it since. */
export function changedLine(changed: readonly string[]): string {
  if (!changed.length) return "Undone";
  if (changed.length > 3) return `Undone, except ${changed.length} that changed since`;
  const names = changed.length === 1 ? changed[0] : `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}`;
  return `Undone, except ${names}, which changed since`;
}

const DAY = 86_400_000;
const at = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** How far a date is from today, beside a month's name: nothing inside two
 *  weeks, which the two-week grid already shows; weeks to half a year; then
 *  months. */
export function periodLabel(day: string, today: string): string | null {
  const days = Math.round((at(day) - at(today)) / DAY);
  const away = Math.abs(days);
  if (away < 14) return null;
  const amount = away <= 26 * 7 ? `${Math.round(away / 7)} weeks` : `${Math.round(away / 30.44)} months`;
  return days > 0 ? `in ${amount}` : `${amount} ago`;
}

/** The grid for a reply's period: two weeks inside this week and next, from
 *  Monday as the server's period is, the month otherwise, and only the weeks the period reaches. */
export function gridFor(period: { from: string; to: string }, counts: readonly MonthCount[], today: string, weekStart: WeekStart = "monday"): Month {
  const dated = monthDated(counts);
  const days = Math.round((at(period.to) - at(period.from)) / DAY);
  const grid = days <= 13 ? twoWeekFor(period.from, dated, today, "monday") : monthFor(period.from, dated, today, weekStart);
  return { ...grid, weeks: grid.weeks.filter((week) => week.days[6]!.iso >= period.from && week.days[0]!.iso <= period.to) };
}

/** AC-9. When a moved entry was, from the reply's record of its date before
 *  the turn, while the Undo holds it. */
export function wasLine(previous: { dueAt?: string | null; occursAt?: string | null } | undefined, zone: string | null): string | null {
  const at = previous?.occursAt ?? previous?.dueAt;
  if (!at) return null;
  const when = new Date(at);
  return `was ${dayTitle(dayIn(when, zone))}, ${timeIn(when, zone, "en-GB")}`;
}

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;

/** A calendar's colour as its provider stores it, only when it is a colour:
 *  it goes into an inline style, where `url(...)` would fetch and a bad
 *  string breaks the drawing. Null falls back to the token. */
export function calendarColour(value: string | null | undefined): string | null {
  return value && COLOUR.test(value) ? value : null;
}
