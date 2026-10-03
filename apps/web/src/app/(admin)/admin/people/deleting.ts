// Delete, said the same on the list and on the person's page (034 section G).
// The kit's dialog with what 034 changed: notes, not memories, and a day in
// which an owner can still cancel.

import { moment } from "../../ui";

export const DELETE_BODY =
  "This removes the account and everything in it: its threads, its notes and every conversation. They are signed out now and it is destroyed in 24 hours. Until then an owner can cancel. After that it cannot be undone.";

/** When a marked account goes. */
export const goes = (deleteAfter: string) => `To be deleted ${moment(deleteAfter)}`;
