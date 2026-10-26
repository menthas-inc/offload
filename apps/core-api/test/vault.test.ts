// 012: the connector vault.
//
// AC-2: third-party credentials are sealed under their own key, in their own
//   table, and a ciphertext is bound to the row and column it belongs to.

import { describe, expect, it } from "vitest";
import { open, seal, VAULT_NAME, connectorsAvailable } from "../src/connectors/vault.js";
import { wrapUnderRoot } from "../src/crypto/keys.js";

const CONNECTION = "0199e0d0-0000-7000-8000-000000000001";
const OTHER = "0199e0d0-0000-7000-8000-000000000002";

describe("AC-2 sealing a credential", () => {
  it("round-trips", () => {
    const sealed = seal("ya29.a0-token", CONNECTION, "access_token");
    expect(open(sealed, CONNECTION, "access_token")).toBe("ya29.a0-token");
  });

  it("does not store the token in the clear", () => {
    const sealed = seal("ya29.a0-token", CONNECTION, "access_token");
    expect(sealed.toString("utf8")).not.toContain("ya29");
    expect(sealed.toString("base64")).not.toContain(Buffer.from("ya29").toString("base64"));
  });

  it("seals the same value differently every time", () => {
    // A random nonce per seal, so two connections holding the same token do not
    // produce the same bytes and a repeated value is not visible in the column.
    const a = seal("same", CONNECTION, "access_token");
    const b = seal("same", CONNECTION, "access_token");
    expect(a.equals(b)).toBe(false);
  });
});

describe("AC-2 a ciphertext is bound to where it lives", () => {
  it("refuses to open under another connection", () => {
    // Somebody with write access to the database moving a sealed value from one
    // account's row to another's gets a failure, not a working token.
    const sealed = seal("ya29.a0-token", CONNECTION, "access_token");
    expect(() => open(sealed, OTHER, "access_token")).toThrow();
  });

  it("refuses to open as the other field", () => {
    // A refresh token moved into the access token column is a long-lived
    // credential used where a short-lived one was expected.
    const sealed = seal("1//refresh", CONNECTION, "refresh_token");
    expect(() => open(sealed, CONNECTION, "access_token")).toThrow();
  });

  it("refuses a truncated value", () => {
    const sealed = seal("ya29.a0-token", CONNECTION, "access_token");
    expect(() => open(sealed.subarray(0, 8), CONNECTION, "access_token")).toThrow();
  });

  it("refuses a tampered value", () => {
    const sealed = seal("ya29.a0-token", CONNECTION, "access_token");
    sealed[sealed.length - 1]! ^= 0xff;
    expect(() => open(sealed, CONNECTION, "access_token")).toThrow();
  });
});

describe("AC-2 the vault is not the root", () => {
  it("cannot open something the root sealed", () => {
    // The whole point of two keys. If this passed, they would be one key with
    // two names and rotating either would be a decision about both.
    const rootSealed = wrapUnderRoot(Buffer.from("content key")).wrapped_dek;
    expect(() => open(rootSealed, CONNECTION, "access_token")).toThrow();
  });

  it("names the key that sealed it", () => {
    expect(VAULT_NAME).toBe("vault:v1");
  });
});

describe("AC-1 unset credentials are a supported state", () => {
  it("reports unavailable rather than throwing", () => {
    // The Maps precedent: the code ships, the boundary holds, and every screen
    // says the connector is not available yet rather than offering a button
    // that cannot work.
    expect(typeof connectorsAvailable()).toBe("boolean");
  });
});
