// Where you are signed in, and ending a session that should not be there.
//
// Security review 2026-09-22, M8. The privacy page promised this control and
// no client had it. Better Auth already lists and revokes sessions; this is
// the thin layer the account pane reads.

import { beforeEach, describe, expect, it, vi } from "vitest";

const revoked: string[] = [];
let sessions: { token: string; userAgent: string | null; createdAt: string }[] = [];

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
  }),
}));

const { describeDevice, endSignedIn, listSignedIn } = await import("../src/lib/sessions");

beforeEach(() => {
  revoked.length = 0;
  sessions = [
    { token: "old", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36", createdAt: "2026-09-01T10:00:00Z" },
    { token: "here", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15", createdAt: "2026-09-20T10:00:00Z" },
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

describe("the list", () => {
  it("marks this device and puts it first, then newest first", async () => {
    const rows = await listSignedIn();
    expect(rows.map((row) => [row.token, row.current])).toEqual([
      ["here", true],
      ["phone", false],
      ["old", false],
    ]);
    expect(rows[0]!.device).toBe("Safari on Mac");
  });

  it("ends the one asked for and no other", async () => {
    expect(await endSignedIn("old")).toBe(true);
    expect(revoked).toEqual(["old"]);
  });
});
