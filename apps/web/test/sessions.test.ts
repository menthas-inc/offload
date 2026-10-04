// Where you are signed in, and ending a session that should not be there.
//
// Security review 2026-09-22, M8. The privacy page promised this control and
// no client had it. Better Auth already lists and revokes sessions; this is
// the thin layer the account pane reads.
//
// 031: this device comes from the session the client holds, apart from the
// list, so it draws when the list fails; the list is the others only, and a
// failed read throws rather than coming back empty, which the page used to
// draw as "Nothing else".

import { beforeEach, describe, expect, it, vi } from "vitest";

const revoked: string[] = [];
let revokedOthers = 0;
let sessions: { token: string; userAgent: string | null; createdAt: string }[] = [];
let listFails: "reject" | "error" | null = null;

const HERE_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15";

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    listSessions: () => {
      if (listFails === "reject") return Promise.reject(new Error("offline"));
      if (listFails === "error") return Promise.resolve({ data: null, error: { status: 500 } });
      return Promise.resolve({ data: sessions, error: null });
    },
    getSession: () =>
      Promise.resolve({
        data: { session: { token: "here", userAgent: HERE_UA, createdAt: "2026-09-20T10:00:00Z" } },
        error: null,
      }),
    revokeSession: ({ token }: { token: string }) => {
      revoked.push(token);
      return Promise.resolve({ data: { status: true }, error: null });
    },
    revokeOtherSessions: () => {
      revokedOthers += 1;
      return Promise.resolve({ data: { status: true }, error: null });
    },
    signIn: { social: () => Promise.resolve({}) },
    signOut: () => Promise.resolve({}),
  }),
}));

const { describeDevice, endOthers, endSignedIn, listSignedIn, thisDevice } = await import("../src/lib/sessions");

beforeEach(() => {
  revoked.length = 0;
  revokedOthers = 0;
  listFails = null;
  sessions = [
    { token: "old", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36", createdAt: "2026-09-01T10:00:00Z" },
    { token: "here", userAgent: HERE_UA, createdAt: "2026-09-20T10:00:00Z" },
    { token: "phone", userAgent: "okhttp/4.12.0", createdAt: "2026-09-10T10:00:00Z" },
  ];
});

describe("a session, described", () => {
  it("names the browser and the machine, or the app and the phone", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15")).toBe("Safari on Mac");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(describeDevice("okhttp/4.12.0")).toBe("The app on Android");
    expect(describeDevice("offload/1 CFNetwork/1498 Darwin/23.5.0")).toBe("The app on iPhone");
    expect(describeDevice(null)).toBe("A device");
  });
});

describe("this device", () => {
  it("comes from the session alone, so it is there when the list fails", async () => {
    listFails = "reject";
    expect(await thisDevice()).toEqual({ device: "Safari on Mac" });
  });
});

describe("the others", () => {
  it("leaves this device out and lists the rest newest first", async () => {
    const rows = await listSignedIn();
    expect(rows.map((row) => row.tokens)).toEqual([["phone"], ["old"]]);
    expect(rows[1]!.device).toBe("Chrome on Windows");
  });

  it("is one row per device: every sign-in there is counted, since the first", async () => {
    sessions.push(
      { token: "phone-2", userAgent: "okhttp/4.12.0", createdAt: "2026-09-25T10:00:00Z" },
      { token: "phone-3", userAgent: "okhttp/4.12.0", createdAt: "2026-09-05T10:00:00Z" },
    );
    const rows = await listSignedIn();
    expect(rows.map((row) => row.device)).toEqual(["The app on Android", "Chrome on Windows"]);
    expect(rows[0]!.tokens.sort()).toEqual(["phone", "phone-2", "phone-3"]);
    expect(rows[0]!.since).toEqual(new Date("2026-09-05T10:00:00Z"));
  });

  it("throws when the read is refused or fails, rather than coming back empty", async () => {
    listFails = "error";
    await expect(listSignedIn()).rejects.toThrow();
    listFails = "reject";
    await expect(listSignedIn()).rejects.toThrow();
  });

  it("ends every session on the device asked for and no other", async () => {
    expect(await endSignedIn(["phone", "phone-2"])).toBe(true);
    expect(revoked).toEqual(["phone", "phone-2"]);
  });

  it("ends every other session through the revoke-others endpoint", async () => {
    expect(await endOthers()).toBe(true);
    expect(revokedOthers).toBe(1);
    expect(revoked).toEqual([]);
  });
});
