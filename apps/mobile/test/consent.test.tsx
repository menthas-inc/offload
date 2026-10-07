// Asking again when the privacy policy or the terms move (S20), and first
// run's failure line, which says what happened and nothing about why (S6).
// The screens are read from their source, since these tests render nothing.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { url: string; init: RequestInit | undefined }[] = [];
let status = 200;

vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ needsConsent: false }), {
    status,
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

const api = await import("../lib/api");
const gate = await import("../lib/gate");

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

beforeEach(() => {
  calls.length = 0;
  status = 200;
});

describe("S6 first run's failure line", () => {
  it("is one shared line that diagnoses nothing", () => {
    const line = (gate.GATE as Record<string, unknown>)["failed"];
    expect(typeof line).toBe("string");
    expect(line).not.toMatch(/connection/i);
  });

  it("is the line Before you start draws, not one typed inline", () => {
    const source = code("components/firstrun/BeforeYouStart.tsx");
    expect(source).not.toMatch(/That did not go through/);
    expect(source).toMatch(/\{GATE\.failed\}/);
  });

  it("is the web's line, word for word", () => {
    const web = readFileSync(new URL("../../web/src/components/firstrun/copy.ts", import.meta.url), "utf8");
    const match = /export const FAILED = "([^"]*)";/.exec(web);
    expect(match?.[1]).toBe((gate.GATE as Record<string, unknown>)["failed"]);
  });
});

describe("S20 asking again when the policy or the terms change", () => {
  const AGAIN = {
    accountId: "a1",
    state: "active" as const,
    displayName: "Jo",
    email: "jo@hey.com",
    needsFirstRun: false,
    needsName: false,
    needsConsent: true,
    suggestedName: null,
    webSearch: true,
    webLinks: true,
    country: null,
  };

  it("holds the app at launch for it", () => {
    expect(api.stillAsking(AGAIN)).toBe(true);
    expect(api.stillAsking({ ...AGAIN, needsConsent: false })).toBe(false);
  });

  it("posts both ticks and nothing else, and says whether it was recorded", async () => {
    const giveConsent = (api as Record<string, unknown>)["giveConsent"] as () => Promise<boolean>;
    expect(typeof giveConsent).toBe("function");
    expect(await giveConsent()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.endsWith("/api/consent")).toBe(true);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ readPolicy: true, agreeToProcessing: true });

    status = 500;
    expect(await giveConsent()).toBe(false);
  });

  it("opens first run's last screen alone, and goes to Today after the write", () => {
    const source = code("components/firstrun/FirstRun.tsx");
    expect(source).toMatch(/needsConsent/);
    expect(source).toMatch(/giveConsent\(\)/);
    expect(code("lib/me.ts")).toMatch(/needsConsent/);
  });

  it("says the pages changed, linking both", () => {
    const source = code("components/firstrun/BeforeYouStart.tsx");
    expect(source).toMatch(/RECONSENT\.before/);
    expect(source).toMatch(/Linking\.openURL\(TERMS_URL\)/);
    expect(source).toMatch(/Linking\.openURL\(PRIVACY_URL\)/);
    const words = Object.values((gate as Record<string, unknown>)["RECONSENT"] as Record<string, string>).join("");
    expect(words).toBe("We have changed the terms or the privacy policy.");
  });
});
