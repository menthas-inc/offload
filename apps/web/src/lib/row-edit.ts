// A row's edit, drawn first. The thread pane, Today and Not in a thread each
// draw the dialog's save before it is sent and put the row back if it is
// refused; this is what they draw and what they put back, so the three
// cannot disagree about a field. 042 added `reminders`, and found the
// three had already drifted apart on body and labels.

import { drawnWhen } from "./when";
import type { ContentPatch, ContentRow, ContentSnapshot } from "./threads";

/** What a patch draws on the row, and the row's own values to put back. */
export function drawnEdit(
  row: ContentRow,
  patch: ContentPatch,
  zone: string | null,
): { drawn: Partial<ContentRow>; before: Partial<ContentRow> } {
  const drawn: Partial<ContentRow> = {};
  if (patch.labels !== undefined) drawn.labels = patch.labels;
  if (patch.title !== undefined) drawn.title = patch.title;
  if (patch.body !== undefined) drawn.body = patch.body;
  if (patch.isReminder !== undefined) drawn.isReminder = patch.isReminder;
  // A null `reminders` leaves it alone, so it draws nothing.
  if (patch.reminders !== undefined && patch.reminders !== null) {
    drawn.reminders = patch.reminders;
    // A stop takes the asked flag with it, as the server writes it.
    if (patch.reminders === "off") drawn.isReminder = false;
  }
  // The dates too, read in the account's clock exactly as the route reads
  // them, so the chip moves with the toast.
  Object.assign(drawn, drawnWhen(patch, zone));
  const before: Partial<ContentRow> = {
    title: row.title,
    body: row.body,
    isReminder: row.isReminder,
    reminders: row.reminders ?? null,
    dueAt: row.dueAt,
    occursAt: row.occursAt,
    occursEndAt: row.occursEndAt,
    rrule: row.rrule,
    allDay: row.allDay,
    labels: row.labels,
  };
  return { drawn, before };
}

/** The Undo: the snapshot the route sent back, as a patch, `reminders`
 *  included as given. A null there leaves it alone, which the route accepts. */
export function undoOf(previous: ContentSnapshot): ContentPatch {
  return { ...previous };
}
