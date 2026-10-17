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
let stored: Record<string, string> = {};
let signOutBehaviour: () => Promise<unknown> = () => Promise.resolve();

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: (key: string) => {
    deleted.push(key);
    return Promise.resolve();
  },
  getItemAsync: (key: string) => Promise.resolve(stored[key] ?? null),
  setItemAsync: (key: string, value: string) => {
    stored[key] = value;
    return Promise.resolve();
  },
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

const { accountChanged, accountDeleted, onSignedOut, sessionRefused, signOut, SignOutFailed } = await import("../lib/auth");

beforeEach(() => {
  deleted.length = 0;
  stored = {};
  signOutBehaviour = () => Promise.resolve();
});

describe("AC-3 signing out waits for the server", () => {
  it("clears the device only once the server has agreed", async () => {
    await signOut();
    expect(deleted.sort()).toEqual(["offload_cookie", "offload_session_data"]);
  });

  // Security review 2026-09-22, L31. The plugin splits a value over 1,800
  // characters into `<key>.0..N` under a marker, and sign-out deleted the
  // marker and left the chunks, which is where the token would have been.
  it("clears the chunks a long value was split into", async () => {
    stored = { offload_cookie: "ba-chunks:3", "offload_cookie.0": "a", "offload_cookie.1": "b", "offload_cookie.2": "c" };
    await signOut();
    expect(deleted.sort()).toEqual([
      "offload_cookie",
      "offload_cookie.0",
      "offload_cookie.1",
      "offload_cookie.2",
      "offload_session_data",
    ]);
  });

  // @better-auth/expo 1.7 writes a slotted marker, `ba-chunks:N:S[:F]`, with
  // the chunks under `<key>.S.i` and the previous slot's kept for recovery.
  it("clears the chunks of a slotted marker, both slots", async () => {
    stored = {
      offload_cookie: "ba-chunks:2:1:3",
      "offload_cookie.1.0": "a",
      "offload_cookie.1.1": "b",
      "offload_cookie.0.0": "x",
      "offload_cookie.0.1": "y",
      "offload_cookie.0.2": "z",
    };
    await signOut();
    expect(deleted.sort()).toEqual([
      "offload_cookie",
      "offload_cookie.0.0",
      "offload_cookie.0.1",
      "offload_cookie.0.2",
      "offload_cookie.1.0",
      "offload_cookie.1.1",
      "offload_session_data",
    ]);
  });

  // The plugin writes `{}` over the marker as it prepares the request, so by
  // the time the server agrees the marker no longer says where the chunks are.
  it("clears the chunks when the plugin has already written over the marker", async () => {
    stored = { offload_cookie: "ba-chunks:2:0", "offload_cookie.0.0": "a", "offload_cookie.0.1": "b" };
    signOutBehaviour = () => {
      stored["offload_cookie"] = "{}";
      return Promise.resolve();
    };
    await signOut();
    expect(deleted).toEqual(expect.arrayContaining(["offload_cookie.0.0", "offload_cookie.0.1"]));
  });

  // A deleted account or a refused session forgets with no snapshot taken
  // first, so a marker the plugin already cleared said nothing about where the
  // chunks were and they stayed on the phone.
  for (const [name, end] of [
    ["a deleted account", () => accountDeleted()],
    ["a refused session", () => sessionRefused()],
  ] as const) {
    it(`clears every chunk the plugin can have written on ${name}, whatever the marker says`, async () => {
      stored = {
        offload_cookie: "{}",
        "offload_cookie.0": "a",
        "offload_cookie.1": "b",
        "offload_cookie.0.0": "c",
        "offload_cookie.0.1": "d",
        "offload_cookie.1.0": "e",
      };
      await end();
      expect(deleted.sort()).toEqual(expect.arrayContaining(Object.keys(stored).sort()));
    });
  }

  it("tells whoever holds a copy of the session once it has ended, and not before", async () => {
    let told = 0;
    onSignedOut(() => {
      told += 1;
    });
    await signOut();
    expect(told).toBe(1);
  });

  // 2026-10-11. What the phone keeps of the account is forgotten by a
  // listener that has files and keys to delete, so sign-out resolves only
  // once it has, and the gate never opens over a copy still being cleared.
  it("waits for whoever forgets the phone's copy before it resolves", async () => {
    let forgotten = false;
    const stop = onSignedOut(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      forgotten = true;
    });
    await signOut();
    expect(forgotten).toBe(true);
    stop();
  });

  // From the security review of PR 108: a keystore or a notification centre
  // that never answers held the old screen up, since the gate and Sign out's
  // button wait on every listener. Each is waited on for three seconds, and
  // the ones after it are still told.
  it("waits on no listener longer than three seconds, and tells the rest", async () => {
    vi.useFakeTimers();
    let after = false;
    const stuck = onSignedOut(() => new Promise<void>(() => undefined));
    const next = onSignedOut(() => {
      after = true;
    });
    try {
      let done = false;
      void accountDeleted().then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(2900);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(after).toBe(true);
      expect(done).toBe(true);
    } finally {
      stuck();
      next();
      vi.useRealTimers();
    }
  });

  it("tells them on a deleted account too, and stops when asked", async () => {
    let told = 0;
    const stop = onSignedOut(() => {
      told += 1;
    });
    await accountDeleted();
    stop();
    await accountDeleted();
    expect(told).toBe(1);
  });

  // The stamp found another account's copy: the session is the new one's
  // and stays, and everything holding the old one's is told.
  it("tells them when another account is found here, and keeps the session", async () => {
    let told = 0;
    const stop = onSignedOut(() => {
      told += 1;
    });
    await accountChanged();
    expect(told).toBe(1);
    expect(deleted).toEqual([]);
    stop();
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

// What the plugin actually does, read out of `@better-auth/expo/dist/client.js`:
// its request hook clears the stored cookie and session data *as it prepares
// the sign-out request*, before the server has answered anything. So the
// stub above passed for the wrong reason: a call that fails leaves the device
// with nothing, whatever this module deletes or keeps. Found on the Pixel on
// 2026-09-23 as a toast saying the sign-out did not go through, above an app
// with every screen empty and no way back to the gate.
describe("the plugin clears the device before the server answers", () => {
  const cookie = '{"offload.session_token":{"value":"abc"}}';
  const data = '{"session":{"token":"abc"}}';

  const clearsThenFails = () => {
    stored["offload_cookie"] = "{}";
    stored["offload_session_data"] = "{}";
    return Promise.reject(new Error("network"));
  };

  it("puts the session back when the call fails, so Try again has something to send", async () => {
    stored = { offload_cookie: cookie, offload_session_data: data };
    signOutBehaviour = clearsThenFails;

    await expect(signOut()).rejects.toBeInstanceOf(SignOutFailed);

    expect(stored["offload_cookie"]).toBe(cookie);
    expect(stored["offload_session_data"]).toBe(data);
    expect(deleted).toEqual([]);
  });

  // Better Auth resolves an HTTP error as `{ error }` rather than rejecting.
  it("puts the session back when the server refused", async () => {
    stored = { offload_cookie: cookie, offload_session_data: data };
    signOutBehaviour = () => {
      stored["offload_cookie"] = "{}";
      stored["offload_session_data"] = "{}";
      return Promise.resolve({ data: null, error: { status: 503 } });
    };

    await expect(signOut()).rejects.toBeInstanceOf(SignOutFailed);

    expect(stored["offload_cookie"]).toBe(cookie);
    expect(stored["offload_session_data"]).toBe(data);
    expect(deleted).toEqual([]);
  });

  it("counts a 401 as done, since the session is already gone", async () => {
    signOutBehaviour = () => Promise.resolve({ data: null, error: { status: 401 } });
    await signOut();
    expect(deleted.sort()).toEqual(["offload_cookie", "offload_session_data"]);
  });

  it("puts the session back when the call never settles", async () => {
    vi.useFakeTimers();
    stored = { offload_cookie: cookie, offload_session_data: data };
    signOutBehaviour = () => {
      stored["offload_cookie"] = "{}";
      stored["offload_session_data"] = "{}";
      return new Promise(() => undefined);
    };

    const attempt = signOut();
    const assertion = expect(attempt).rejects.toBeInstanceOf(SignOutFailed);
    await vi.advanceTimersByTimeAsync(9_000);
    await assertion;

    expect(stored["offload_cookie"]).toBe(cookie);
    expect(stored["offload_session_data"]).toBe(data);
    vi.useRealTimers();
  });

  it("puts a chunked value back whole", async () => {
    stored = { offload_cookie: "ba-chunks:2", "offload_cookie.0": "ab", "offload_cookie.1": "cd", offload_session_data: data };
    signOutBehaviour = () => {
      stored["offload_cookie"] = "{}";
      stored["offload_cookie.0"] = "";
      stored["offload_cookie.1"] = "";
      stored["offload_session_data"] = "{}";
      return Promise.reject(new Error("network"));
    };

    await expect(signOut()).rejects.toBeInstanceOf(SignOutFailed);

    expect(stored).toEqual({ offload_cookie: "ba-chunks:2", "offload_cookie.0": "ab", "offload_cookie.1": "cd", offload_session_data: data });
  });
});
