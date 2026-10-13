// 2026-10-13 (the owner). An answer's rows can share a title, eight glass
// blowing classes, and the date is what tells them apart. A dated row in an
// answer carries its date under the title as the kit's meta line, in the
// words the row's own chip uses, with the end of a span after it. Decided
// once for the phones and the web.

import { dayIn, daysBetween, noonUtc, partsOf, utcDay } from "./days.js";
import { chipFor } from "./nearness.js";

/** What an answer's row carries of its dates. Done is not read: the tick
 *  beside the row already says it, and the date is the same either way. */
export interface FoundDated {
  type: string;
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  rrule: string | null;
}

/** The chip's own rule for a day: within a fortnight the weekday and the
 *  day, "Sun 25"; further out the day and the month, "25 Oct". */
const NEAR_DAYS = 14;
function dayWords(day: string, today: string, locale?: string): string {
  const near = Math.abs(daysBetween(today, day)) <= NEAR_DAYS;
  if (near) return `${new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(noonUtc(day))} ${partsOf(day).dom}`;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(noonUtc(day));
}

/** The meta line under an answer's row, or null for a row with no date. A
 *  span says where it ends, in the same words as where it starts. */
export function foundMeta(row: FoundDated, zone: string | null | undefined, today: string, locale?: string): string | null {
  const chip = chipFor({ ...row, doneAt: null }, zone, today, locale);
  if (!chip) return null;
  if (row.type !== "event" || !row.occursEndAt) return chip.label;
  const end = new Date(row.occursEndAt);
  const endDay = row.allDay ? utcDay(end) : dayIn(end, zone);
  if (endDay <= chip.day) return chip.label;
  return `${chip.label} to ${dayWords(endDay, today, locale)}`;
}
