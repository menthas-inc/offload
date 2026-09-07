// The branch nobody exercises by hand.
//
// Signing out works on the first try every time somebody tests it, which is
// exactly why the failure path is worth a test: on a shared device, a phone
// that clears its keys after a call the server never got looks signed out while
// the account's session is live for up to thirty days, and it has forgotten who
// it was, so there is nothing left to retry with.
//
// The rule this locks is an ordering: the server first, the keys second, and no
// keys at all if the server did not answer.

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleted: string[] = [];
let signOutBehaviour: () => Promise<unknown> = () => Promise.resolve();

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

// `lib/auth.ts` is the real module under test, so everything native it reaches
// for is stubbed rather than the module being reimplemented here. A test that
// reimplements the thing it tests passes for the wrong reason.
vi.mock("react-native", () => ({ Platform: { OS: "android", select: (o: Record<string, unknown>) => o["android"] } }));
vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: () => Promise.resolve(false),
  signInAsync: () => Promise.resolve({}),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { scheme: "offload", version: "0.1.0" } } }));
vi.mock("@better-auth/expo/client", () => ({ expoClient: () => ({ id: "expo" }) }));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    signOut: () => signOutBehaviour(),
    signIn: { social: () => Promise.resolve() },
    getCookie: () => "",
  }),
}));

const { signOut, SignOutFailed } = await import("../lib/auth");

beforeEach(() => {
  deleted.length = 0;
  signOutBehaviour = () => Promise.resolve();
});

describe("AC-3 signing out waits for the server", () => {
  it("clears the device only once the server has agreed", async () => {
    await signOut();
    expect(deleted.sort()).toEqual(["offload_cookie", "offload_session_data"]);
  });

  it("leaves the session alone when the call fails, and says so", async () => {
    signOutBehaviour = () => Promise.reject(new Error("network"));

    await expect(signOut()).rejects.toBeInstanceOf(SignOutFailed);

    // The whole point. Cleared keys here would be a phone that cannot try
    // again and an account still open on the server.
    expect(deleted).toEqual([]);
  });

  it("treats a call that never settles the same as one that failed", async () => {
    vi.useFakeTimers();
    signOutBehaviour = () => new Promise(() => undefined);

    const attempt = signOut();
    const assertion = expect(attempt).rejects.toBeInstanceOf(SignOutFailed);
    await vi.advanceTimersByTimeAsync(9_000);
    await assertion;

    expect(deleted).toEqual([]);
    vi.useRealTimers();
  });
});
