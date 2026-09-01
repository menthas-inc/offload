// AC-4, the half of it that can be checked without a device.
//
// Apple's client secret is a JWT we mint, so it is the one credential in this
// system that can be wrong in a way only Apple notices, at the end of a
// redirect chain, as "invalid_client". This verifies it here instead.

import { describe, expect, it } from "vitest";
import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { appleClientSecret, appleConfigured } from "../src/auth/apple.js";
import { env } from "../src/env.js";

const configured = appleConfigured();

describe.skipIf(!configured)("the Apple client secret", () => {
  const now = 1_700_000_000_000;
  const token = () => appleClientSecret(now);

  const parts = () => token().split(".");
  const decode = (segment: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

  it("is signed with the key Apple will look up by kid", () => {
    const header = decode(parts()[0]!);
    expect(header["alg"]).toBe("ES256");
    expect(header["kid"]).toBe(env.APPLE_KEY_ID);
  });

  it("claims the team as issuer and the service id as subject", () => {
    const payload = decode(parts()[1]!);
    expect(payload["iss"]).toBe(env.APPLE_TEAM_ID);
    expect(payload["sub"]).toBe(env.APPLE_CLIENT_ID);
    expect(payload["aud"]).toBe("https://appleid.apple.com");
  });

  it("expires within Apple's six month ceiling", () => {
    const payload = decode(parts()[1]!);
    const lifetime = Number(payload["exp"]) - Number(payload["iat"]);
    expect(lifetime).toBeGreaterThan(0);
    expect(lifetime).toBeLessThanOrEqual(15777000);
  });

  it("verifies against the public half of the key, in raw r||s", () => {
    const [header, payload, signature] = parts() as [string, string, string];
    const publicKey = createPublicKey(createPrivateKey(env.APPLE_PRIVATE_KEY!));

    // The encoding is the whole test. Node signs EC as DER by default and
    // Apple only accepts ieee-p1363, so a secret that verifies here in raw
    // form is one Apple will accept.
    const ok = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url")
    );
    expect(ok).toBe(true);
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
  });
});
