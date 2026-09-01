// Carrying a refused sign-in's address back to the browser.
//
// The no-invite screen names the address it checked, because "you are not on
// the list" without saying which account it looked at is the kind of dead end
// people write support mail about. The address is not in the URL: query
// strings land in browser history, in the Referer header of every subsequent
// request, and in any analytics that samples paths.
//
// So it travels in a short-lived httpOnly cookie instead. The problem is that
// the refusal happens deep inside a Better Auth database hook, which has no
// access to the reply. AsyncLocalStorage bridges that: the route wrapper opens
// a store for the request, the hook writes into it, and the wrapper reads it
// back when it sees the redirect.
//
// The value is HMAC-signed. Not because the address is a secret, since the
// person just authenticated with it, but because the page prefills the
// waitlist form from it, and unsigned input that flows into a write is a habit
// worth not having.

import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

export const ATTEMPT_COOKIE = "offload_attempt";
const TTL_MS = 10 * 60 * 1000;

interface AttemptStore {
  email: string | null;
}

const storage = new AsyncLocalStorage<AttemptStore>();

/** Run a request with a slot the gate hooks can write a refused address into. */
export function withAttempt<T>(fn: (store: AttemptStore) => Promise<T>): Promise<T> {
  const store: AttemptStore = { email: null };
  return storage.run(store, () => fn(store));
}

/** Called from inside the gate when it turns someone away. No-op outside a
 *  request, which is what tests calling the gate directly do. */
export function recordAttempt(email: string | null | undefined): void {
  const store = storage.getStore();
  if (store && email) store.email = email;
}

function sign(payload: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(payload).digest("base64url");
}

export function seal(email: string, now: number): string {
  const payload = `${Buffer.from(email).toString("base64url")}.${now + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function unseal(value: string, now: number): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [encoded, expiresAt, mac] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${encoded}.${expiresAt}`));
  const actual = Buffer.from(mac);
  // Compare lengths first: timingSafeEqual throws rather than returning false
  // when they differ, and a thrown error here would be a 500 on a cold path.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < now) return null;
  return Buffer.from(encoded, "base64url").toString("utf8");
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return null;
}
