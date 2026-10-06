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
import { derivedKey } from "../crypto/derived.js";

export const ATTEMPT_COOKIE = "offload_attempt";
const TTL_MS = 10 * 60 * 1000;

// Two things now, and they share one scope on purpose. Both are values a
// Better Auth hook learns in the middle of a sign-in and cannot hand anywhere
// itself, and `withAttempt` already wraps the whole handler, so a second
// AsyncLocalStorage with a second wrapper would be this mechanism twice.
interface AttemptStore {
  email: string | null;
  /** Set when the account exists and is disabled, by a staff member or for
   *  the day before a deletion. The screen then says that, where it would
   *  have said there is no invite and offered a waitlist the person is not
   *  waiting on. Nothing else is ever named: the person authenticated with
   *  this address a moment ago, so its state tells nobody else anything. */
  reason: AttemptReason | null;
  /** The name the provider handed over, recorded by `mapProfileToUser` and read
   *  by the account hook a few frames later. It is the only point at which
   *  Google and Apple agree: Google's name is a claim on the ID token, Apple's
   *  arrives once in the form post of the first authorization and is never in a
   *  token at all. */
  providerName: string | null;
  /** 039. A review code typed on the sign-in screen and sent with a native
   *  sheet's token. A browser sign-in carries it in its OAuth state instead,
   *  which is bound to that one attempt (`auth/code-at-sign-in.ts`). */
  code: string | null;
  /** Who is asking, for the review code limiter. */
  ip: string | null;
  /** A code came with this sign-in and did not let them in. The refusal that
   *  follows says so. */
  codeRefused: boolean;
}

/** `disabled`: the account exists and is disabled. `code`: a review code came
 *  with the sign-in and did not work. */
export type AttemptReason = "disabled" | "code";

const storage = new AsyncLocalStorage<AttemptStore>();

/** Run a request with a slot the gate hooks can write a refused address into. */
export function withAttempt<T>(fn: (store: AttemptStore) => Promise<T>): Promise<T> {
  const store: AttemptStore = { email: null, reason: null, providerName: null, code: null, ip: null, codeRefused: false };
  return storage.run(store, () => fn(store));
}

/** Called from inside the gate when it turns someone away. No-op outside a
 *  request, which is what tests calling the gate directly do. */
export function recordAttempt(email: string | null | undefined, reason: AttemptReason | null = null): void {
  const store = storage.getStore();
  if (!store || !email) return;
  store.email = email;
  store.reason = reason;
}

/** Called from `mapProfileToUser` on both providers. No-op outside a request,
 *  which is what a test calling the provider directly does. */
export function recordProviderName(name: string | null | undefined): void {
  const store = storage.getStore();
  if (store && name) store.providerName = name;
}

/** What the provider called them this sign-in, if anything. */
export function providerName(): string | null {
  return storage.getStore()?.providerName ?? null;
}

/** 039. The code a native sign-in carried, and the address asking. */
export function carried(): { code: string | null; ip: string | null } {
  const store = storage.getStore();
  return { code: store?.code ?? null, ip: store?.ip ?? null };
}

export function markCodeRefused(): void {
  const store = storage.getStore();
  if (store) store.codeRefused = true;
}

/** The reason a refusal carries: disabled wins, then a code that did not work. */
export function refusalReason(disabled: boolean): AttemptReason | null {
  if (disabled) return "disabled";
  return storage.getStore()?.codeRefused ? "code" : null;
}

/** Its own key, derived from the auth secret rather than the secret itself,
 *  so this cookie, the waitlist limiter and the connector state cannot be
 *  forged with one another's material. See `crypto/derived.ts`. */
const KEY = derivedKey("attempt-cookie");

function sign(payload: string): string {
  return createHmac("sha256", KEY).update(payload).digest("base64url");
}

/** `address.expiry.mac`, or `address.expiry.reason.mac` when there is a
 *  reason. The signature covers whichever it is, so a reason can be neither
 *  added to a cookie nor taken off one. */
export function seal(email: string, now: number, reason: AttemptReason | null = null): string {
  const payload = `${Buffer.from(email).toString("base64url")}.${now + TTL_MS}${reason ? `.${reason}` : ""}`;
  return `${payload}.${sign(payload)}`;
}

export function unsealAttempt(value: string, now: number): { email: string; reason: AttemptReason | null } | null {
  const parts = value.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const mac = parts[parts.length - 1]!;
  const [encoded, expiresAt, reason] = parts.slice(0, -1) as [string, string, string | undefined];
  if (reason !== undefined && reason !== "disabled" && reason !== "code") return null;

  const expected = Buffer.from(sign(parts.slice(0, -1).join(".")));
  const actual = Buffer.from(mac);
  // Compare lengths first: timingSafeEqual throws rather than returning false
  // when they differ, and a thrown error here would be a 500 on a cold path.
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < now) return null;
  return { email: Buffer.from(encoded, "base64url").toString("utf8"), reason: (reason as AttemptReason | undefined) ?? null };
}

/** The address alone. */
export function unseal(value: string, now: number): string | null {
  return unsealAttempt(value, now)?.email ?? null;
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() !== name) continue;
    // A value that is not valid percent-encoding is not a cookie we set, so
    // it reads as no cookie. `decodeURIComponent` throws on one, and unguarded
    // that was a 500 from a header anybody can send.
    try {
      return decodeURIComponent(pair.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
