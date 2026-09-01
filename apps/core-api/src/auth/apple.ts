// Apple's client secret.
//
// Every other provider hands you a secret string. Apple hands you a signing
// key and expects you to mint the secret yourself: an ES256 JWT, issued by the
// team, subject the service id, audience Apple. It is minted at boot rather
// than stored, because a stored one is a secret with an expiry date that
// nothing is watching.
//
// Six months is Apple's ceiling and we take it. A process that has been up for
// six months without a deploy is not a scenario this product has yet, and if
// it ever is, the fix is a refresh timer, not a longer expiry Apple refuses.
//
// The signature has to be raw r||s. Node's default for EC keys is DER, which
// Apple rejects with an error that says only "invalid_client", so dsaEncoding
// is the line that makes this work.

import { createPrivateKey, sign } from "node:crypto";
import { env } from "../env.js";

const SIX_MONTHS_SECONDS = 15777000;
const AUDIENCE = "https://appleid.apple.com";

const base64url = (value: Buffer | string): string => Buffer.from(value).toString("base64url");

export function appleClientSecret(now: number = Date.now()): string {
  if (!env.APPLE_PRIVATE_KEY || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_CLIENT_ID) {
    throw new Error(
      "Apple sign-in needs APPLE_PRIVATE_KEY, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_CLIENT_ID."
    );
  }

  const issuedAt = Math.floor(now / 1000);
  const header = { alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" };
  const payload = {
    iss: env.APPLE_TEAM_ID,
    iat: issuedAt,
    exp: issuedAt + SIX_MONTHS_SECONDS,
    aud: AUDIENCE,
    sub: env.APPLE_CLIENT_ID,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    // Throws on a malformed key, at boot, with a stack that names this file.
    // Better than Apple's invalid_client at the end of a redirect chain.
    key: createPrivateKey(env.APPLE_PRIVATE_KEY),
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64url(signature)}`;
}

/** True when every piece Apple needs is present. Sign-in with Apple is then
 *  offered; otherwise the provider is simply not registered, and the button
 *  fails closed rather than sending someone into a redirect that dead-ends. */
export function appleConfigured(): boolean {
  return Boolean(
    env.APPLE_PRIVATE_KEY && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_CLIENT_ID
  );
}
