// 2026-10-13 (the owner). An answer's rows can share a title, eight glass
// blowing classes, and the date is what tells them apart. A dated row in an
// answer carries its date under the title as the kit's meta line, in the
// words the row's own chip uses, with the end of a span after it. Decided
// once for the phones and the web.

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

/** The meta line under an answer's row, or null for a row with no date. A
 *  span's chip says where it ends (2026-10-17), so the line is the chip's. */
export function foundMeta(row: FoundDated, zone: string | null | undefined, today: string, locale?: string): string | null {
  return chipFor({ ...row, doneAt: null }, zone, today, locale)?.label ?? null;
}
