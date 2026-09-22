// Where you are signed in, from the phone.
//
// Security review 2026-09-22, M8. Same layer as the web's, over the same two
// endpoints, tested here because the phone's auth client is built differently.

import { beforeEach, describe, expect, it, vi } from "vitest";

const revoked: string[] = [];
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
    listSessions: () => Promise.resolve({ data: sessions, error: null }),
    getSession: () => Promise.resolve({ data: { session: { token: "here" } }, error: null }),
    revokeSession: ({ token }: { token: string }) => {
      revoked.push(token);
      return Promise.resolve({ data: { status: true }, error: null });
    },
    signIn: { social: () => Promise.resolve({}) },
    signOut: () => Promise.resolve({}),
    getCookie: () => "",
  }),
}));

const { endSignedIn, listSignedIn } = await import("../lib/sessions");

beforeEach(() => {
  revoked.length = 0;
  sessions = [
    { token: "old", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36", createdAt: "2026-09-01T10:00:00Z" },
    { token: "here", userAgent: "okhttp/4.12.0", createdAt: "2026-09-20T10:00:00Z" },
  ];
});

describe("the list", () => {
  it("marks this device first and describes the rest", async () => {
    const rows = await listSignedIn();
    expect(rows.map((row) => [row.device, row.current])).toEqual([
      ["The app on Android", true],
      ["Chrome on Windows", false],
    ]);
  });

  it("ends the one asked for", async () => {
    expect(await endSignedIn("old")).toBe(true);
    expect(revoked).toEqual(["old"]);
  });
});
