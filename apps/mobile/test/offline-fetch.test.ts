// A fetch that throws is no answer, not an exception.
//
// React Native's fetch rejects at once with no connection, where the timeout
// was the only "no answer" `send` knew. The rejection went past every caller:
// one offline tick stopped the answer poll, and the turn said it was writing
// until the app was opened again.

import { beforeEach, describe, expect, it, vi } from "vitest";

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
    getCookie: () => "offload.session_token=abc",
  }),
}));
vi.mock("expo-file-system", () => ({ File: class {} }));

/** How many requests reject before one answers. */
let offline = 0;
vi.stubGlobal(
  "fetch",
  vi.fn(() => {
    if (offline > 0) {
      offline -= 1;
      return Promise.reject(new TypeError("Network request failed"));
    }
    return Promise.resolve(new Response(JSON.stringify({ state: "answered", reply: "Filed it." }), { status: 200 }));
  }),
);

const { send, upload } = await import("../lib/api");
const { awaitAnswer, undoTurn } = await import("../lib/dump");

beforeEach(() => {
  offline = 0;
});

describe("a fetch that throws", () => {
  it("is status 0 from send and from upload", async () => {
    offline = 2;
    expect(await send("/v1/turns/t1/undo", { method: "POST" })).toEqual({ status: 0, data: null });
    expect(await upload("/v1/blobs", new FormData())).toEqual({ status: 0, data: null });
  });

  it("is a false undo rather than a throw", async () => {
    offline = 1;
    expect(await undoTurn("t1")).toBe(false);
  });

  it("does not stop the answer poll, which settles on a later answer", async () => {
    vi.useFakeTimers();
    try {
      offline = 1;
      const seen: string[] = [];
      awaitAnswer("m1", (answer) => seen.push(answer.state));
      await vi.advanceTimersByTimeAsync(0);
      expect(seen).toEqual([]);
      await vi.advanceTimersByTimeAsync(1500);
      expect(seen).toEqual(["answered"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
