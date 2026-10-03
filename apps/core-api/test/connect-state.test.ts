// 012: the OAuth state, which is this flow's whole CSRF defence.
//
// AC-1: connecting is its own consent, and the callback belongs to the account
//   that started it. This flow does not go through Better Auth, so it inherits
//   none of Better Auth's state handling and every property below is one this
//   code has to hold on its own.

import { describe, expect, it } from "vitest";
import { openState, pkce, sealState } from "../src/connectors/state.js";

const NOW = 1_800_000_000_000;
const ACCOUNT = "0199e0d0-0000-7000-8000-0000000000aa";
const OTHER = "0199e0d0-0000-7000-8000-0000000000bb";

const mint = (accountId = ACCOUNT, at = NOW) =>
  sealState({ accountId, verifier: "verifier-value", landing: "settings" }, at);

describe("AC-1 the state binds the flow to one account", () => {
  it("round-trips what it was minted with", () => {
    const opened = openState(mint(), NOW);
    expect(opened?.accountId).toBe(ACCOUNT);
    expect(opened?.verifier).toBe("verifier-value");
    expect(opened?.landing).toBe("settings");
  });

  it("carries the account, so a callback can be checked against its session", () => {
    // The attack this exists for: somebody runs their own consent, then gets a
    // signed-in person to open the resulting callback. Without the account in
    // here there is nothing to compare and their calendar links to that
    // person's threads.
    const opened = openState(mint(OTHER), NOW);
    expect(opened?.accountId).not.toBe(ACCOUNT);
  });

  it("is different every time, so one cannot be replayed as another", () => {
    expect(mint()).not.toBe(mint());
  });

  it("shows nothing it carries to whoever sees the URL", () => {
    // The state travels in Google's authorization URL and again in the
    // callback's, beside the code. Readable, it handed anybody who saw the
    // callback the code and the PKCE verifier together, which is the pair
    // PKCE exists to keep apart.
    const state = mint();
    const readable = [state, ...state.split(".")].flatMap((part) => [
      part,
      Buffer.from(part, "base64url").toString("utf8"),
      Buffer.from(part, "base64").toString("utf8"),
    ]);
    for (const text of readable) {
      expect(text).not.toContain("verifier-value");
      expect(text).not.toContain(ACCOUNT);
      expect(text).not.toContain("settings");
    }
  });
});

describe("AC-1 anything that is not ours is refused", () => {
  it("refuses a tampered payload", () => {
    const state = mint();
    const [encoded, expiry, mac] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ accountId: OTHER, verifier: "v", landing: "settings", nonce: "n" })
    ).toString("base64url");
    expect(openState(`${forged}.${expiry}.${mac}`, NOW)).toBeNull();
    expect(encoded).not.toBe(forged);
  });

  it("refuses a bad signature", () => {
    const [encoded, expiry] = mint().split(".");
    expect(openState(`${encoded}.${expiry}.notthemac`, NOW)).toBeNull();
  });

  it("refuses an expired state", () => {
    // Ten minutes is enough for a consent screen and short enough that a URL
    // left in a history is not a live one.
    expect(openState(mint(), NOW + 11 * 60 * 1000)).toBeNull();
  });

  it("refuses the wrong shape", () => {
    expect(openState("", NOW)).toBeNull();
    expect(openState("a.b", NOW)).toBeNull();
    expect(openState("a.b.c.d", NOW)).toBeNull();
  });

  it("refuses a landing that is not one of ours", () => {
    // The redirect target is an enum precisely so it cannot be a URL from the
    // request, which at the end of an authenticated flow is an open redirect.
    const forged = sealState(
      { accountId: ACCOUNT, verifier: "v", landing: "https://evil.example" as never },
      NOW
    );
    expect(openState(forged, NOW)).toBeNull();
  });
});

describe("AC-1 PKCE", () => {
  it("makes a verifier and its S256 challenge", () => {
    const { verifier, challenge } = pkce();
    expect(verifier.length).toBeGreaterThan(32);
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is different every time", () => {
    expect(pkce().verifier).not.toBe(pkce().verifier);
  });
});
