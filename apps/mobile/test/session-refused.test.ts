// A session the server no longer recognises is a signed-out device, not an
// empty app.
//
// `request` and `send` turn every failure into `null`, which is right for a
// read where a failure and an empty answer look the same to the screen. A 401
// on a request that carried the cookie is not that case: it is the server
// saying the session this device holds is over, whether it expired, was ended
// from another device under "Signed in on", or was cleared by a sign-out the
// device never heard the answer to. On the Pixel on 2026-09-23 that state was
// a toast, then every screen empty, and no way back to the gate short of
// killing the app. The rule: a refused cookie is forgotten, and the shell is
// told so it can show the gate.

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleted: string[] = [];
let cookie = "offload.session_token=abc";
let status = 200;

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: (key: string) => {
    deleted.push(key);
    return Promise.resolve();
  },
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

vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.resolve(new Response(status === 204 ? null : "{}", { status }))),
);

const { getMe, request, send } = await import("../lib/api");
const { onSessionRefused, onSignedOut } = await import("../lib/auth");

/** Let the forget-and-tell that a refusal starts run to its end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  deleted.length = 0;
  cookie = "offload.session_token=abc";
  status = 200;
});

describe("a refused session", () => {
  it("is forgotten, and the shell is told, when a read with the cookie gets a 401", async () => {
    status = 401;
    const told = vi.fn();
    const stop = onSessionRefused(told);

    expect(await request("/api/me")).toBeNull();
    await settle();

    expect(deleted.sort()).toEqual(["offload_cookie", "offload_session_data"]);
    expect(told).toHaveBeenCalledTimes(1);
    stop();
  });

  // 2026-10-11. A refused session is a session ended on this phone, whether
  // the account was signed out elsewhere or deleted on the web: what the
  // phone kept of it goes, exactly as at a sign-out.
  it("forgets what the phone kept of the account, as a sign-out does", async () => {
    status = 401;
    let forgotten = 0;
    const stop = onSignedOut(() => {
      forgotten += 1;
    });

    await request("/api/me");
    await settle();

    expect(forgotten).toBe(1);
    stop();
  });

  it("is forgotten on a write too", async () => {
    status = 401;
    const told = vi.fn();
    const stop = onSessionRefused(told);

    expect((await send("/v1/dumps", { method: "POST", body: "{}" })).status).toBe(401);
    await settle();

    expect(deleted.sort()).toEqual(["offload_cookie", "offload_session_data"]);
    expect(told).toHaveBeenCalledTimes(1);
    stop();
  });

  it("is told once for a burst, not once per request", async () => {
    status = 401;
    const told = vi.fn();
    const stop = onSessionRefused(told);

    await Promise.all([request("/api/me"), request("/v1/threads"), request("/v1/today")]);
    await settle();

    expect(told).toHaveBeenCalledTimes(1);
    stop();
  });

  // The gate itself asks the server with no cookie and gets a 401 back. If
  // that counted, forgetting would tell the shell to show the gate, which
  // asks again, forever.
  it("does not count a 401 when no cookie was sent", async () => {
    status = 401;
    cookie = "";
    const told = vi.fn();
    const stop = onSessionRefused(told);

    expect(await request("/api/me")).toBeNull();
    await settle();

    expect(deleted).toEqual([]);
    expect(told).not.toHaveBeenCalled();
    stop();
  });

  it("leaves the session alone on any other failure", async () => {
    status = 500;
    const told = vi.fn();
    const stop = onSessionRefused(told);

    expect(await request("/api/me")).toBeNull();
    await settle();

    expect(deleted).toEqual([]);
    expect(told).not.toHaveBeenCalled();
    stop();
  });
});

// The root layout and the index route both ask who is signed in at launch,
// in the same frame. One request answers both.
describe("launch's question", () => {
  it("is asked once for two askers at once, and again after", async () => {
    const calls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/api/me")).length;
    const before = calls();
    const [a, b] = await Promise.all([getMe(), getMe()]);
    expect(a).toEqual(b);
    expect(calls() - before).toBe(1);
    await getMe();
    expect(calls() - before).toBe(2);
  });
});
