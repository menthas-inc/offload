// 035. Deleting the account this phone is signed in to.
//
// The server checks the word; this carries it and reads one of three answers.
// Only a delete the server confirmed forgets the session here, the same
// ordering signing out keeps: a phone that cleared its keys after a call the
// server never got would look deleted over an account that is still there.

import { send } from "./api";
import { accountDeleted } from "./auth";

export const DELETE_WORD = "delete";

/** Trimmed and whatever its case, as the server reads it. */
export function wordMatches(word: string): boolean {
  return word.trim().toLowerCase() === DELETE_WORD;
}

export type DeleteOutcome = "done" | "last_owner" | "failed";

/** Set by a delete that went through and read once by the sign-in screen, so
 *  the line is said to the person who deleted and to nobody after them. */
let notice = false;

export function takeDeletedNotice(): boolean {
  const was = notice;
  notice = false;
  return was;
}

export async function deleteAccount(word: string): Promise<DeleteOutcome> {
  try {
    const sent = await send<null>("/api/me", {
      method: "DELETE",
      body: JSON.stringify({ confirm: word.trim().toLowerCase() }),
    });
    if (sent.status === 409) return "last_owner";
    if (sent.status !== 204) return "failed";
    notice = true;
    await accountDeleted();
    return "done";
  } catch {
    return "failed";
  }
}
