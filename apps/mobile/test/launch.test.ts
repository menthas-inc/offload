// Launch asks the server who this is, and only one answer means signed out.
//
// On 2026-09-30 between 07:33 and 07:42 UTC Railway's edge answered
// "Application not found" (404) for api.offload.club with every service
// healthy. The Pixel's launch read that as signed out and showed the gate,
// while the session it held was still good: its next request after recovery
// was an authenticated 200. A 401 is the server saying there is no session.
// Anything else, an edge's 404, a 502, a timeout, no network, is the app not
// hearing an answer, and launch holds rather than guessing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let cookie = "offload.session_token=abc";
let answer: () => Promise<Response> = () => Promise.resolve(new Response("{}", { status: 200 }));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: () => Promise.resolve(),
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  getItem: () => null,
  setItem: () => undefined,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "afu",
}));
vi.mock("react-native", () => ({ Platform: { OS: "android", select: (o: Record<string, unknown>) => o["android"] } }));
vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: () => Promise.resolve(false),
  signInAsync: () => Promise.resolve({}),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { scheme: "offload", version: "0.1.0" } } }));
vi.mock("@better-auth/expo/client", () => ({ expoClient: () => ({ id: "expo" }) }));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signOut: () => Promise.resolve(),
    signIn: { social: () => Promise.resolve() },
    getCookie: () => cookie,
  }),
}));

vi.stubGlobal("fetch", vi.fn(() => answer()));

const { getMe } = await import("../lib/api");

const ME = { accountId: "a1", state: "active", displayName: "Ana", email: "ana@example.com", needsFirstRun: false, needsName: false };

beforeEach(() => {
  cookie = "offload.session_token=abc";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("launch's question", () => {
  it("is the account when the server knows the session", async () => {
    answer = () => Promise.resolve(new Response(JSON.stringify(ME), { status: 200 }));
    expect(await getMe()).toEqual(ME);
  });

  it("is signed out on a 401 that carried the cookie", async () => {
    answer = () => Promise.resolve(new Response('{"error":"unauthenticated"}', { status: 401 }));
    expect(await getMe()).toBe("signed-out");
  });

  it("is signed out on a 401 with no cookie to send", async () => {
    cookie = "";
    answer = () => Promise.resolve(new Response('{"error":"unauthenticated"}', { status: 401 }));
    expect(await getMe()).toBe("signed-out");
  });

  it("is unreachable on the edge's 404, not signed out", async () => {
    answer = () => Promise.resolve(new Response("Application not found", { status: 404 }));
    expect(await getMe()).toBe("unreachable");
  });

  it("is unreachable on a 502", async () => {
    answer = () => Promise.resolve(new Response("Bad gateway", { status: 502 }));
    expect(await getMe()).toBe("unreachable");
  });

  it("is unreachable with no network, rather than throwing", async () => {
    answer = () => Promise.reject(new TypeError("Network request failed"));
    expect(await getMe()).toBe("unreachable");
  });

  it("is unreachable on a 200 that is not the account", async () => {
    answer = () => Promise.resolve(new Response("<html>maintenance</html>", { status: 200 }));
    expect(await getMe()).toBe("unreachable");
  });

  it("is unreachable when nothing answers in time", async () => {
    vi.useFakeTimers();
    answer = () => new Promise<Response>(() => undefined);
    const asked = getMe();
    await vi.advanceTimersByTimeAsync(15000);
    expect(await asked).toBe("unreachable");
  });
});
