// The account's clock, from the browser's side. 023.
//
// Finishing first run carries the browser's zone; Use, Keep and the switch
// each write one field of the account, never the pair and never a name.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { url: string; init: RequestInit | undefined }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return new Response(
    JSON.stringify({ accountId: "a", timeZone: "Asia/Tokyo", followDevice: true, keptTimeZone: null }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
vi.stubGlobal("window", {
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

const { completeOnboarding, updateClock } = await import("../src/lib/use-me");
const { zoneFor } = await import("../src/lib/clock");

beforeEach(() => {
  calls.length = 0;
});

describe("023 AC-1 finishing first run", () => {
  it("carries the browser's zone, and none when it will not say", async () => {
    expect(await completeOnboarding("Ana", "Asia/Tokyo")).toBe(true);
    expect(calls[0]!.url.endsWith("/api/onboarding/complete")).toBe(true);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      readPolicy: true,
      agreeToProcessing: true,
      displayName: "Ana",
      timeZone: "Asia/Tokyo",
    });
    calls.length = 0;
    await completeOnboarding("Ana", null);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      readPolicy: true,
      agreeToProcessing: true,
      displayName: "Ana",
    });
  });
});

describe("023 AC-3 the clock's writes", () => {
  it("Use writes the clock; Keep writes what was kept; the switch writes follow", async () => {
    const me = await updateClock({ timeZone: "Asia/Tokyo" });
    expect(me?.timeZone).toBe("Asia/Tokyo");
    await updateClock({ keptTimeZone: "Asia/Tokyo" });
    await updateClock({ followDevice: false });
    expect(calls.map((call) => call.url.endsWith("/api/me"))).toEqual([true, true, true]);
    expect(calls.map((call) => call.init?.method)).toEqual(["PATCH", "PATCH", "PATCH"]);
    expect(calls.map((call) => call.init?.credentials)).toEqual(["include", "include", "include"]);
    expect(calls.map((call) => JSON.parse(String(call.init?.body)))).toEqual([
      { timeZone: "Asia/Tokyo" },
      { keptTimeZone: "Asia/Tokyo" },
      { followDevice: false },
    ]);
  });
});

describe("023 the zone a pane draws in", () => {
  it("is the account's clock, else the browser's word", () => {
    expect(zoneFor("Europe/Lisbon", "Asia/Tokyo")).toBe("Europe/Lisbon");
    expect(zoneFor(null, "Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});
