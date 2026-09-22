// One secret, several jobs, one key each.
//
// `BETTER_AUTH_SECRET` signs sessions. It was also the raw HMAC key for the
// waitlist limiter, the refused-attempt cookie and the calendar connector's
// state, so the four could forge one another and rotating the secret for any
// one reason broke all of them at once. Each purpose now takes a key derived
// from the secret with a name, the way `crypto/keys.ts` already derives the
// development root key. Rotation is still one variable; what changes is that
// a key handed to one signer proves nothing to another.
//
// Deterministic, so a value signed by one instance verifies on the next.

import { hkdfSync } from "node:crypto";
import { env } from "../env.js";

const KEY_BYTES = 32;

/** A 256-bit key for the named purpose. The name is the whole of the
 *  separation, so it is part of the call site rather than a lookup. */
export function derivedKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "offload-derived", purpose, KEY_BYTES));
}
