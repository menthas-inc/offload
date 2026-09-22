// Finishing first run carries the device's zone. 023 AC-1.
//
// The one request that makes an account active is also the one that gives it
// a clock, so that the first date offload files is drawn in the zone the phone
// was in when the person said yes, and not in whatever the server assumed.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { url: string; init: RequestInit | undefined }[] = [];

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
vi.mock("expo-secure-store", () => ({
  deleteItemAsync: () => Promise.resolve(),
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  getItem: () => null,
  setItem: () => undefined,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
vi.mock("react-native", () => ({ Platform: { OS: "android", select: (o: Record<string, unknown>) => o["android"] } }));
vi.mock("expo-apple-authentication", () => ({ isAvailableAsync: () => Promise.resolve(false), signInAsync: () => Promise.resolve({}) }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { scheme: "offload", version: "0.1.0", extra: {} } } }));
vi.mock("@better-auth/expo/client", () => ({ expoClient: () => ({ id: "expo" }) }));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    getCookie: () => "",
    signIn: { social: () => Promise.resolve({}) },
    signOut: () => Promise.resolve({}),
  }),
}));

const { completeOnboarding } = await import("../lib/api");

beforeEach(() => {
  calls.length = 0;
});

describe("023 AC-1 finishing first run", () => {
  it("carries the device's zone", async () => {
    expect(await completeOnboarding("Ana", "Asia/Tokyo")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.endsWith("/api/onboarding/complete")).toBe(true);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      readPolicy: true,
      agreeToProcessing: true,
      displayName: "Ana",
      timeZone: "Asia/Tokyo",
    });
  });

  it("sends no zone when the device will not say, rather than an empty one", async () => {
    await completeOnboarding("Ana", null);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      readPolicy: true,
      agreeToProcessing: true,
      displayName: "Ana",
    });
  });
});
