// The when field, as the sheets hold it and the route takes it. 023.
//
// A sheet holds one value: a day, an hour on it, an end on an event, and a
// rule. The route takes the type's own column, so the value is turned into a
// patch here, once, rather than in each sheet. Every string is a wall time in
// the account's clock; the server reads it there.

import {
  chipFor,
  describeRule,
  formatRule,
  noonUtc,
  parseRule,
  whenDayOf,
  whenOf,
  type ChipRow,
} from "@offload/widgets";
import type { ContentPatch } from "./threads";

export interface WhenValue {
  /** `YYYY-MM-DD`, or null for no date at all. */
  day: string | null;
  /** `HH:MM`, twenty-four hour, in the account's clock; null is all day. */
  time: string | null;
  /** `HH:MM` on the same day, events only, once there is a time. */
  endTime: string | null;
  /** The canonical rule, or null. */
  rrule: string | null;
}

export const NOTHING: WhenValue = { day: null, time: null, endTime: null, rrule: null };

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

/** What a row holds, as the sheet opens on it. */
export function whenValueOf(
  row: ChipRow & { occursEndAt: string | null; rrule: string | null },
  zone: string | null,
): WhenValue {
  const day = whenDayOf(row, zone);
  if (!day) return NOTHING;
  const at = whenOf(row)!;
  const time = row.allDay ? null : timeHM(at, zone);
  const endTime =
    row.type === "event" && time && row.occursEndAt ? timeHM(row.occursEndAt, zone) : null;
  return { day, time, endTime, rrule: row.rrule };
}

/** The patch one value becomes, for the row's type. Null clears, and the
 *  server clears the end and the rule with the day. */
export function patchFor(row: { type: string }, value: WhenValue): ContentPatch {
  const event = row.type === "event";
  if (!value.day) return event ? { occursAt: null } : { dueAt: null };
  const at = value.time ? `${value.day}T${value.time}:00` : value.day;
  const patch: ContentPatch = { allDay: !value.time, rrule: value.rrule };
  if (event) {
    patch.occursAt = at;
    patch.occursEndAt = value.time && value.endTime ? `${value.day}T${value.endTime}:00` : null;
  } else {
    patch.dueAt = at;
  }
  return patch;
}

export function sameWhen(a: WhenValue, b: WhenValue): boolean {
  return a.day === b.day && a.time === b.time && a.endTime === b.endTime && a.rrule === b.rrule;
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

/** The When row's value: "Fri 25, 9:00", "Fri 25", or nothing. */
export function whenLabel(value: WhenValue, locale?: string): string {
  if (!value.day) return "";
  const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
    noonUtc(value.day),
  );
  return value.time ? `${day}, ${clockLabel(value.time, locale)}` : day;
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

export { formatRule };
