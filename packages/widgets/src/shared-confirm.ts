// 2026-10-07. What a shared thread asks before something leaves it, in one
// place so every surface says the same thing.
//
// Archive is thread-wide (`content.archived_at`): a row archived in a shared
// thread leaves the list for everyone in it, so there it asks first and says
// so. A thread with others in it is left rather than deleted, and the question
// names who it stays with.

import { nameList } from "./labels.js";

/** Whether archiving this row asks first. `shared` is whether the thread has
 *  anybody else in it; null where the page does not know, which falls back to
 *  whose row it is, since a row you cannot delete is somebody else's. Putting
 *  a row back never asks. */
export function asksBeforeArchive(row: { archivedAt: string | null; canDelete: boolean }, shared: boolean | null): boolean {
  if (row.archivedAt !== null) return false;
  return shared ?? !row.canDelete;
}

export const ARCHIVE_SHARED = "It leaves the list for everyone in the thread.";

export function archiveAsk(title: string): string {
  return `Archive ${title}?`;
}

export function leaveAsk(threadName: string): string {
  return `Leave ${threadName}?`;
}

/** Who the thread stays with, by first name. */
export function staysWith(names: readonly string[]): string {
  if (names.length === 0) return "";
  return `It stays for ${nameList(names.map((name) => name.trim().split(/\s+/)[0] ?? name))}.`;
}
