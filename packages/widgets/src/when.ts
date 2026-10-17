// The when field, as the sheets hold it and the route takes it. 023.
//
// A sheet holds one value: a day, an hour on it, an end on an event, and a
// rule. The route takes the type's own column, so the value is turned into a
// patch here, once, rather than in each sheet. Every string is a wall time in
// the account's clock; the server reads it there. Shared, because the phones
// and the web held byte-identical copies of this file, which is the drift the
// package exists to prevent, and the one helper each sheet reimplemented on
// its own is where the first defect was.

import { dayIn, instantIn, noonUtc, utcDay } from "./days.js";
import { chipFor, spanOf, whenDayOf, whenOf, type ChipRow } from "./nearness.js";
import { describeRule, parseRule } from "./rrule.js";

/** The date fields of the person-facing edit, as the route takes them:
 *  absent leaves a field alone, null clears it. */
export interface WhenPatch {
  dueAt?: string | null;
  occursAt?: string | null;
  occursEndAt?: string | null;
  allDay?: boolean;
  rrule?: string | null;
}

export interface WhenValue {
  /** `YYYY-MM-DD`, or null for no date at all. */
  day: string | null;
  /** `YYYY-MM-DD` after `day`, the last day of a span, or null for one day. */
  endDay: string | null;
  /** `HH:MM`, twenty-four hour, in the account's clock; null is all day. */
  time: string | null;
  /** `HH:MM` on the last day, events only, once there is a time. */
  endTime: string | null;
  /** The canonical rule, or null. */
  rrule: string | null;
}

export const NOTHING: WhenValue = { day: null, endDay: null, time: null, endTime: null, rrule: null };

/** The wall clock of an instant in a zone, `HH:MM`. */
export function timeHM(iso: string, zone: string | null): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone ?? "UTC",
  }).formatToParts(new Date(iso));
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour === "24" ? "00" : hour}:${minute}`;
}

/** The calendar day of one of a row's instants, read as `whenDayOf` reads. */
function dayOfInstant(iso: string, allDay: boolean, zone: string | null): string {
  const at = new Date(iso);
  return allDay ? utcDay(at) : dayIn(at, zone);
}

/** What a row holds, as the sheet opens on it. A span opens on its first
 *  day: an event's is when it happens, anything else's is `occurs_at`, with
 *  its due day on the last (2026-10-17). A repeating row has no span, as
 *  `spanOf` reads it. */
export function whenValueOf(
  row: ChipRow & { occursEndAt: string | null; rrule: string | null },
  zone: string | null,
): WhenValue {
  const day = whenDayOf(row, zone);
  if (!day) return NOTHING;
  const at = whenOf(row)!;
  const time = row.allDay ? null : timeHM(at, zone);
  if (row.type === "event") {
    const end = row.occursEndAt ? dayOfInstant(row.occursEndAt, row.allDay, zone) : null;
    const endTime = time && row.occursEndAt ? timeHM(row.occursEndAt, zone) : null;
    return { day, endDay: end && end > day && !row.rrule ? end : null, time, endTime, rrule: row.rrule };
  }
  const span = spanOf(row, zone);
  if (span) return { day: span.start, endDay: span.end, time, endTime: null, rrule: row.rrule };
  return { day, endDay: null, time, endTime: null, rrule: row.rrule };
}

/** The patch one value becomes, for the row's type. Null clears, and the
 *  server clears the end and the rule with the day. A span on anything but
 *  an event is `occurs_at` to `occurs_end_at` with the due day on the last;
 *  `occursEndAt` is what the row held, so a span that goes takes its start
 *  with it and a row that never had one is left as it was. */
export function patchFor(row: { type: string; occursEndAt?: string | null }, value: WhenValue): WhenPatch {
  const event = row.type === "event";
  const hadSpan = !event && Boolean(row.occursEndAt);
  if (!value.day) return event ? { occursAt: null } : hadSpan ? { dueAt: null, occursAt: null } : { dueAt: null };
  const on = (day: string, time: string | null): string => (time ? `${day}T${time}:00` : day);
  const at = on(value.day, value.time);
  // A rule and a last day never travel together: the chip has no words for a
  // repeating span.
  const endDay = value.rrule ? null : value.endDay;
  const patch: WhenPatch = { allDay: !value.time, rrule: value.rrule };
  if (event) {
    patch.occursAt = at;
    const last = endDay ?? value.day;
    patch.occursEndAt = value.time ? (value.endTime ? on(last, value.endTime) : endDay ? on(last, value.time) : null) : endDay;
  } else if (endDay) {
    patch.occursAt = at;
    patch.occursEndAt = on(endDay, value.time);
    patch.dueAt = patch.occursEndAt;
  } else {
    patch.dueAt = at;
    if (hadSpan) patch.occursAt = null;
  }
  return patch;
}

export function sameWhen(a: WhenValue, b: WhenValue): boolean {
  return a.day === b.day && a.endDay === b.endDay && a.time === b.time && a.endTime === b.endTime && a.rrule === b.rrule;
}

/** A clock time as the locale says it, from `HH:MM`. */
export function clockLabel(time: string, locale?: string): string {
  const [h, m] = time.split(":").map(Number);
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)));
  return parts
    .map((part) => (part.type === "hour" ? String(Number(part.value)) : part.value))
    .join("")
    .replace(/[  ]/g, " ")
    .trim();
}

/** The When row's value: "Fri 25, 9:00", "Fri 25", "Sat 17 to Tue 20", or
 *  nothing. A span names its days and leaves the hours to their rows. */
export function whenLabel(value: WhenValue, locale?: string): string {
  if (!value.day) return "";
  // Composed, as the chip composes it: some locales put the day first.
  const words = (day: string): string =>
    `${new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(noonUtc(day))} ${noonUtc(day).getUTCDate()}`;
  if (value.endDay) return `${words(value.day)} to ${words(value.endDay)}`;
  return value.time ? `${words(value.day)}, ${clockLabel(value.time, locale)}` : words(value.day);
}

/** The Repeats row's value. */
export function repeatsLabel(value: WhenValue, locale?: string): string {
  if (!value.rrule || !value.day) return "Never";
  const parsed = parseRule(value.rrule);
  return parsed.ok ? describeRule(parsed.rule, value.day, locale) : "Custom";
}

/** The chip's own words for a row, for the action sheet's When row. */
export function whenChipLabel(
  row: ChipRow,
  zone: string | null,
  today: string,
  locale?: string,
): string | undefined {
  return chipFor(row, zone, today, locale)?.label;
}


/** The end an event is offered once it has an hour: an hour later on the same
 *  day, since an end is `HH:MM` on the day it starts. Past 23:00 an hour later
 *  wrapped to the small hours of the same day and the route refused an end
 *  before its start, so the offer stops at the day's last five-minute mark. */
export function anHourAfter(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const minutes = Math.min((h ?? 0) * 60 + (m ?? 0) + 60, 23 * 60 + 55);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** What a row draws the moment Save is tapped, before the server answers:
 *  the patch's wall times read in the account's clock exactly as the route
 *  reads them, so the chip moves with the toast rather than a round trip
 *  later. Absent fields stay absent and the row keeps what it had; a cleared
 *  day clears the end and the rule with it, as the server does. */
export function drawnWhen(patch: WhenPatch, zone: string | null): WhenPatch {
  const iso = (value: string | null | undefined): string | null | undefined => {
    if (value === undefined || value === null) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return noonUtc(value).toISOString();
    return instantIn(value, zone)?.toISOString();
  };
  const out: WhenPatch = {};
  const dueAt = iso(patch.dueAt);
  if (dueAt !== undefined) out.dueAt = dueAt;
  const occursAt = iso(patch.occursAt);
  if (occursAt !== undefined) out.occursAt = occursAt;
  const occursEndAt = iso(patch.occursEndAt);
  if (occursEndAt !== undefined) out.occursEndAt = occursEndAt;
  if (patch.allDay !== undefined) out.allDay = patch.allDay;
  if (patch.rrule !== undefined) out.rrule = patch.rrule;
  // The anchor going takes the rule; a to-do's span going is not its anchor.
  if (patch.dueAt === null || (patch.occursAt === null && patch.dueAt === undefined)) out.rrule = null;
  if (patch.occursAt === null) out.occursEndAt = null;
  return out;
}
