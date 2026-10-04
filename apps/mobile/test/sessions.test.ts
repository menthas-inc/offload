// Where you are signed in, from the phone.
//
// Security review 2026-09-22, M8. Same layer as the web's, over the same two
// endpoints, tested here because the phone's auth client is built differently.

import { beforeEach, describe, expect, it, vi } from "vitest";

const revoked: string[] = [];
let revokedOthers = 0;
let listFails = false;
let noSession = false;
let sessions: { token: string; userAgent: string | null; createdAt: string }[] = [];

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
    listSessions: () =>
      listFails
        ? Promise.resolve({ data: null, error: { status: 500, message: "down" } })
        : Promise.resolve({ data: sessions, error: null }),
    getSession: () =>
      noSession ? Promise.resolve({ data: null, error: { status: 500, message: "down" } }) : Promise.resolve({
        data: { session: { token: "here", userAgent: "okhttp/4.12.0", createdAt: "2026-09-20T10:00:00Z" } },
        error: null,
      }),
    revokeOtherSessions: () => {
      revokedOthers += 1;
      return Promise.resolve({ data: { status: true }, error: null });
    },
    revokeSession: ({ token }: { token: string }) => {
      revoked.push(token);
      return Promise.resolve({ data: { status: true }, error: null });
    },
    signIn: { social: () => Promise.resolve({}) },
    signOut: () => Promise.resolve({}),
    getCookie: () => "",
  }),
}));

const { endOthers, endSignedIn, listSignedIn, thisDevice } = await import("../lib/sessions");

beforeEach(() => {
  revoked.length = 0;
  revokedOthers = 0;
  listFails = false;
  noSession = false;
  sessions = [
    { token: "old", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36", createdAt: "2026-09-01T10:00:00Z" },
    { token: "here", userAgent: "okhttp/4.12.0", createdAt: "2026-09-20T10:00:00Z" },
  ];
});

describe("this device (031, AC-5)", () => {
  it("comes from the session the phone holds, not the list", async () => {
    listFails = true;
    expect((await thisDevice())?.device).toBe("The app on Android");
  });
});

describe("the list", () => {
  it("is every other session, described, without this one", async () => {
    const rows = await listSignedIn();
    expect(rows.map((row) => row.device)).toEqual(["Chrome on Windows"]);
  });

  it("is one row per device, every sign-in there counted since the first", async () => {
    sessions.push(
      { token: "old-2", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36", createdAt: "2026-09-12T10:00:00Z" },
      { token: "ipad", userAgent: "offload/1 CFNetwork/1498 Darwin/23.5.0", createdAt: "2026-09-02T10:00:00Z" },
    );
    const rows = await listSignedIn();
    expect(rows.map((row) => row.device)).toEqual(["Chrome on Windows", "The app on iPhone"]);
    expect(rows[0]!.tokens.sort()).toEqual(["old", "old-2"]);
    expect(rows[0]!.since).toEqual(new Date("2026-09-01T10:00:00Z"));
  });

  it("throws when the read fails, so nobody is told there is nothing", async () => {
    listFails = true;
    await expect(listSignedIn()).rejects.toThrow();
  });

  it("throws when this session cannot be told apart, so it is never offered an End", async () => {
    noSession = true;
    await expect(listSignedIn()).rejects.toThrow();
  });

  it("ends every other session at once", async () => {
    expect(await endOthers()).toBe(true);
    expect(revokedOthers).toBe(1);
  });

  it("ends every session on the device asked for", async () => {
    expect(await endSignedIn(["old", "old-2"])).toBe(true);
    expect(revoked).toEqual(["old", "old-2"]);
  });
});
