// The `state` parameter, which is the whole of this flow's CSRF defence.
//
// **This flow is hand rolled, so it inherits nothing.** Better Auth implements
// state and PKCE inside its own handler; connecting a calendar deliberately does
// not go through it, for the reason `vault.ts` explains, and everything that
// handler would have given us has to be written here instead.
//
// **What an omission costs.** Without a state bound to the account that started
// the flow, an attacker runs their own consent, then gets a signed-in person to
// open the resulting callback URL. Their Google account is now connected to
// somebody else's offload account, and every event they write reaches that
// person's threads, carrying text they control. 012 spends a whole section on
// untrusted event text; this is the door it would walk through.
//
// So the state is signed, short lived, unguessable, and carries the account it
// was minted for. **It is not single use**, and the comment here used to claim
// it was: nothing records a redeemed nonce, so a state can be presented twice
// inside its ten minutes. The nonce makes two states unequal, which is what
// stops one being replayed as another; it does not make either one-shot. What
// actually bounds a replay is PKCE, since the verifier is needed to exchange
// the code and Google will not exchange the same code twice. The callback compares that against the session it
// actually arrives with and refuses a mismatch rather than linking anyway.
//
// It also carries the PKCE verifier, so an intercepted authorization code
// cannot be exchanged by anybody who did not start the flow.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { derivedKey } from "../crypto/derived.js";

const TTL_MS = 10 * 60 * 1000;

/** Its own key, see `crypto/derived.ts`. */
const KEY = derivedKey("connector-state");

/** Where somebody lands after connecting.
 *
 *  **An enum, never a URL from the request.** A redirect target taken from a
 *  parameter at the end of an authenticated flow is an open redirect, which is
 *  why `auth.ts` keeps `trustedOrigins` deliberately narrow. The same reasoning
 *  ends this flow. */
export type Landing = "settings" | "first-run";

export const LANDINGS: readonly Landing[] = ["settings", "first-run"];

export interface ConnectState {
  accountId: string;
  verifier: string;
  landing: Landing;
  nonce: string;
}

function sign(payload: string): string {
  return createHmac("sha256", KEY).update(payload).digest("base64url");
}

/** A fresh PKCE verifier and its S256 challenge. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function sealState(state: Omit<ConnectState, "nonce">, now: number): string {
  const body: ConnectState = { ...state, nonce: randomBytes(9).toString("base64url") };
  const payload = `${Buffer.from(JSON.stringify(body)).toString("base64url")}.${now + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** Null for anything that is not exactly what we minted, and the reasons are
 *  not distinguished: a caller that could tell an expired state from a forged
 *  one is a caller that can probe. */
export function openState(value: string, now: number): ConnectState | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [encoded, expiresAt, mac] = parts as [string, string, string];

  const expected = Buffer.from(sign(`${encoded}.${expiresAt}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < now) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ConnectState;
    if (typeof parsed.accountId !== "string" || !parsed.accountId) return null;
    if (typeof parsed.verifier !== "string" || !parsed.verifier) return null;
    if (!LANDINGS.includes(parsed.landing)) return null;
    return parsed;
  } catch {
    return null;
  }
}
