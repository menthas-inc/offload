// The date chip: which day a row is about, how near it is, and the words.
//
// One function for the boundary, shared by three surfaces and by the digest,
// because a boundary nobody writes down is a boundary each surface computes
// differently. Three days, stated once (023 AC-13).

import { daysBetween, dayIn, noonUtc, partsOf, utcDay } from "./days.js";
import { nextOnOrAfter, parseRule } from "./rrule.js";

export type Nearness = "late" | "soon" | "later";

/** Today and the next three days are soon. */
export const SOON_DAYS = 3;

export function nearness(day: string, today: string): Nearness {
  if (day < today) return "late";
  return daysBetween(today, day) <= SOON_DAYS ? "soon" : "later";
}

/** The least a row has to be to draw a chip. */
export interface ChipRow {
  type: string;
  dueAt: string | null;
  occursAt: string | null;
  /** The date carries no time, so it is read as a date and never as an
   *  instant in anybody's zone. */
  allDay: boolean;
  doneAt: string | null;
  rrule: string | null;
}

/** The instant the row's type is about: an event is when it happens,
 *  everything else is when it is wanted by. */
export function whenOf(row: ChipRow): string | null {
  return row.type === "event" ? row.occursAt : row.dueAt;
}

/** The calendar day the row is about, `YYYY-MM-DD`: a bare day by its UTC
 *  date, a timed row in the account's zone. */
export function whenDayOf(row: ChipRow, zone: string | null | undefined): string | null {
  const at = whenOf(row);
  if (!at) return null;
  const instant = new Date(at);
  if (Number.isNaN(instant.getTime())) return null;
  return row.allDay ? utcDay(instant) : dayIn(instant, zone);
}

/** A clock time in a zone, with no leading zero on the hour and the locale's
 *  own am and pm where it has them. */
export function timeIn(at: Date, zone: string | null | undefined, locale?: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone ?? "UTC",
  }).formatToParts(at);
  return parts
    .map((part) => (part.type === "hour" ? String(Number(part.value)) : part.value))
    .join("")
    .replace(/[  ]/g, " ")
    .trim();
}

export interface Chip {
  label: string;
  tone: Nearness | "done";
  /** The day the chip names. */
  day: string;
}

/** Fourteen days either side keep the weekday and the prefix; past that the
 *  chip names the month and drops both. */
const NEAR_DAYS = 14;

/** The chip, or null for a row with no date, which draws nothing and asks
 *  nothing. `today` is the account's own day. */
export function chipFor(
  row: ChipRow,
  zone: string | null | undefined,
  today: string,
  locale?: string,
): Chip | null {
  const anchor = whenDayOf(row, zone);
  if (!anchor) return null;

  let day = anchor;
  if (row.rrule) {
    const parsed = parseRule(row.rrule);
    if (parsed.ok) day = nextOnOrAfter(parsed.rule, anchor, today) ?? anchor;
  }

  const distance = daysBetween(today, day);
  const near = Math.abs(distance) <= NEAR_DAYS;
  const prefix = row.type === "event" ? "" : "Due ";
  let words: string;
  if (distance === 0) words = "today";
  else if (distance === 1) words = "tomorrow";
  else if (near) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(noonUtc(day));
    words = `${weekday} ${partsOf(day).dom}`;
  } else {
    words = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(noonUtc(day));
  }
  let label = near ? `${prefix}${words}` : words;
  if (!prefix) label = label.charAt(0).toUpperCase() + label.slice(1);

  const at = whenOf(row);
  if (!row.allDay && at) label += `, ${timeIn(new Date(at), zone, locale)}`;

  let tone: Chip["tone"] = row.doneAt ? "done" : nearness(day, today);
  // A repeating row has no occurrence to have missed: it is never late.
  if (row.rrule && tone === "late") tone = "later";
  return { label, tone, day };
}
