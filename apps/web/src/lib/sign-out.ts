"use client";

// Leaving.
//
// **The awaited call is the whole of signing out here.** The session is an
// httpOnly cookie on a different origin: JavaScript cannot read it and cannot
// clear it, so nothing local stands in for the server having agreed. A client
// that navigates to the gate without waiting has not signed anybody out, it has
// changed the page, and the next person on that browser is in the account.
//
// So a failure does not navigate. It says so and offers to try again, which is
// the house rule about failures: what happened, and a control next to it. It
// does not guess why, because it cannot see.

import { authClient } from "./auth-client";
import { forgetMe } from "./use-me";
import { forgetUndo } from "./undo";
import { closeLive } from "./live";
import { forgetRecent } from "./search";

/** Bounded, and the bound is not the interesting part.
 *
 *  Eight seconds because an unbounded call is how a button ends up doing
 *  nothing forever, which this repository has already paid for once. What
 *  matters is what happens when it expires: nothing, loudly. */
const PATIENCE_MS = 8_000;

export class SignOutFailed extends Error {
  constructor() {
    super("sign out did not complete");
  }
}

/** Resolves only when the server has actually ended the session.
 *
 *  Throws `SignOutFailed` otherwise, and the caller stays exactly where it is.
 *  There is deliberately no "clear what we can and hope" path: there is nothing
 *  to clear, and pretending would be the lie this exists to avoid. */
export async function signOut(): Promise<void> {
  const expired = Symbol("expired");

  const outcome = await Promise.race([
    // An HTTP error resolves as `{ error }` rather than rejecting; a 401 means
    // the session is already gone, which is what was asked for.
    authClient.signOut().then(
      (result) => (result?.error && result.error.status !== 401 ? ("failed" as const) : ("done" as const)),
      () => "failed" as const,
    ),
    new Promise<typeof expired>((resolve) => setTimeout(() => resolve(expired), PATIENCE_MS)),
  ]);

  if (outcome !== "done") throw new SignOutFailed();
  forgetMe();
  forgetUndo();
  closeLive();
  forgetRecent();
}
