// The end of a session on this phone, for anything holding a copy of it.
//
// Its own module, importing nothing of the app's, so a cache in any lib can hear the
// end without pulling the auth client into its graph. `auth.ts` says when;
// this says who hears it. Signed out, deleted, refused by the server, or
// another account found under the stamp: all four are this.

import { within } from "./within";

type SignedOutListener = () => void | Promise<void>;
const signedOut = new Set<SignedOutListener>();

/** Hear the session end on this device, for anything holding a copy of who
 *  was signed in: the identity cache kept the last account's clock and name
 *  in memory for the next person on a shared phone until a screen asked
 *  again. 023, from the security review of 2026-09-22. Returns the way to
 *  stop. */
export function onSignedOut(listener: SignedOutListener): () => void {
  signedOut.add(listener);
  return () => {
    signedOut.delete(listener);
  };
}

/** How long one listener is waited on. The gate and Sign out's button wait
 *  on all of them, and a store that never answers must not hold the last
 *  account's screen up. */
const PATIENCE_MS = 3000;

/** Tell each listener in the order they asked, and wait for each: forgetting
 *  the phone's copy deletes files and keys, and the gate opens after. One that
 *  fails or hangs does not stop the rest. */
export async function ended(): Promise<void> {
  for (const listener of [...signedOut]) {
    // Whatever one that failed held is cleared on the next launch's stamp check.
    await within(
      Promise.resolve()
        .then(listener)
        .catch(() => undefined),
      PATIENCE_MS,
      undefined,
    );
  }
}

/** How many times this phone has let go of the account's copy. */
let generation = 0;

export function copyGeneration(): number {
  return generation;
}

export function copyForgotten(): void {
  generation += 1;
}
