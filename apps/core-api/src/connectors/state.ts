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
// It also carries the PKCE verifier, and **it is sealed, not only signed.**
// The state rides in Google's authorization URL and again in the callback's,
// beside the code. Signed but readable, it gave anybody who saw the callback
// URL the code and the verifier together, which is the pair PKCE exists to
// keep apart. AES-256-GCM both hides it and authenticates it, so a state is
// either exactly what we minted or nothing.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { derivedKey } from "../crypto/derived.js";

const TTL_MS = 10 * 60 * 1000;

/** Its own key, see `crypto/derived.ts`. A new purpose rather than the old
 *  signing key's, so the HMAC key never doubles as a cipher key. */
const KEY = derivedKey("connector-state-seal");
const IV_BYTES = 12;

/** Where somebody lands after connecting.
 *
 *  **An enum, never a URL from the request.** A redirect target taken from a
 *  parameter at the end of an authenticated flow is an open redirect, which is
 *  why `auth.ts` keeps `trustedOrigins` deliberately narrow. The same reasoning
 *  ends this flow. */
export const LANDINGS = ["settings", "first-run", "first-run-bring"] as const;

/** 033. `first-run-bring` is Bring it all in, which a connect returns to.
 *  `first-run` stays for phones on an older build. */
export type Landing = (typeof LANDINGS)[number];

export interface ConnectState {
  accountId: string;
  verifier: string;
  landing: Landing;
  nonce: string;
}

/** A fresh PKCE verifier and its S256 challenge. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** `iv.ciphertext.tag`, all base64url. The expiry is inside, so it is as
 *  sealed as everything else. */
export function sealState(state: Omit<ConnectState, "nonce">, now: number): string {
  const body = { ...state, nonce: randomBytes(9).toString("base64url"), expiresAt: now + TTL_MS };
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const sealed = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]);
  return [iv, sealed, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

/** Null for anything that is not exactly what we minted, and the reasons are
 *  not distinguished: a caller that could tell an expired state from a forged
 *  one is a caller that can probe. */
export function openState(value: string, now: number): ConnectState | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, sealed, tag] = parts.map((part) => Buffer.from(part, "base64url")) as [Buffer, Buffer, Buffer];
    if (iv.length !== IV_BYTES || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(sealed), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as ConnectState & { expiresAt: unknown };
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < now) return null;
    if (typeof parsed.accountId !== "string" || !parsed.accountId) return null;
    if (typeof parsed.verifier !== "string" || !parsed.verifier) return null;
    if (!LANDINGS.includes(parsed.landing)) return null;
    const { expiresAt: _expiresAt, ...state } = parsed;
    return state;
  } catch {
    // A failed tag, a short buffer and bad JSON all land here, undistinguished.
    return null;
  }
}
