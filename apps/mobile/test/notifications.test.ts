// The payload table, the verbs, and the token going before the session. 024.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { path: string; init: RequestInit }[] = [];
const dismissed: string[] = [];
let cleared = 0;
let permission = "granted";

vi.mock("react-native", () => ({ Platform: { OS: "ios", select: (o: Record<string, unknown>) => o["ios"] } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "proj" } } } } }));
vi.mock("expo-notifications", () => ({
  setNotificationCategoryAsync: async () => undefined,
  setNotificationChannelAsync: async () => undefined,
  getPermissionsAsync: async () => ({ status: permission }),
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[phone]" }),
  dismissNotificationAsync: async (id: string) => {
    dismissed.push(id);
  },
  clearLastNotificationResponseAsync: async () => {
    cleared += 1;
  },
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));
vi.mock("../lib/log", () => ({ failed: () => undefined }));
const signingOut: (() => Promise<void>)[] = [];
vi.mock("../lib/auth", () => ({ beforeSignOut: (handler: () => Promise<void>) => signingOut.push(handler) }));
vi.mock("../lib/api", () => ({
  registerPushToken: async (token: string, platform: string) => {
    sent.push({ path: "/v1/push-tokens", init: { method: "POST", body: JSON.stringify({ token, platform }) } });
    return true;
  },
  deletePushToken: async (token: string) => {
    sent.push({ path: "/v1/push-tokens", init: { method: "DELETE", body: JSON.stringify({ token }) } });
  },
  actOnNotification: async (action: string, contentId: string) => {
    sent.push({ path: "/v1/notifications/act", init: { method: "POST", body: JSON.stringify({ action, contentId }) } });
    return contentId !== "00000000-0000-7000-8000-00000000dead";
  },
}));

const { register, registeredToken, respond, routeFor, verbOf } = await import("../lib/notifications");

beforeEach(() => {
  sent.length = 0;
  dismissed.length = 0;
  cleared = 0;
  permission = "granted";
});

const THREAD = "01a0c9c9-200a-732d-b56b-fd30e9379d81";

describe("024 AC-13 the payload maps to a screen from a table", () => {
  it("a digest opens Today, a request My people, a share the invitation and an addition the thread, by id", () => {
    expect(routeFor({ kind: "digest", send: "morning" })).toEqual({ pathname: "/" });
    // 027 AC-15. An evening digest hands the day it named through launch.
    expect(routeFor({ kind: "digest", send: "evening", day: "2026-10-01" }, "2026-09-30")).toEqual({ pathname: "/", params: { day: "2026-10-01" } });
    expect(routeFor({ kind: "digest", send: "evening", day: "2026-10-01" }, "2026-10-01")).toEqual({ pathname: "/" });
    expect(routeFor({ kind: "request" })).toEqual({ pathname: "/settings/people" });
    expect(routeFor({ kind: "share", memberId: THREAD })).toEqual({ pathname: "/invitations/[memberId]", params: { memberId: THREAD } });
    expect(routeFor({ kind: "shared_activity", threadId: THREAD })).toEqual({ pathname: "/threads/[id]", params: { id: THREAD } });
  });

  it("042 a reminder of its own opens its thread by id, whether it names a row or a note", () => {
    const ROW = "01a0c9c9-200a-732d-b56b-fd30e9379d82";
    expect(routeFor({ kind: "reminder", threadId: THREAD, contentId: ROW })).toEqual({ pathname: "/threads/[id]", params: { id: THREAD } });
    expect(routeFor({ kind: "reminder", threadId: THREAD, noteId: ROW })).toEqual({ pathname: "/threads/[id]", params: { id: THREAD } });
    expect(routeFor({ kind: "reminder", threadId: "../../etc", contentId: ROW })).toBeNull();
    expect(routeFor({ kind: "reminder" })).toBeNull();
    // Every id it carries is checked, not only the one the route uses.
    expect(routeFor({ kind: "reminder", threadId: THREAD, contentId: "/settings" })).toBeNull();
    expect(routeFor({ kind: "reminder", threadId: THREAD, noteId: 7 })).toBeNull();
  });

  it("ignores anything else: a path, a URL, an unknown kind, an id that is not one", () => {
    expect(routeFor({ kind: "digest", url: "https://evil.example/x", path: "/settings" })).toEqual({ pathname: "/" });
    expect(routeFor({ kind: "open", path: "/settings/people" })).toBeNull();
    expect(routeFor({ kind: "shared_activity", threadId: "../../etc" })).toBeNull();
    expect(routeFor("/threads/x")).toBeNull();
    expect(routeFor(null)).toBeNull();
  });
});

describe("024 AC-6 the verbs", () => {
  // The client review of 2026-09-22: the launch response and the listener
  // both deliver the tap that opened the app, and Tomorrow moves a date by
  // a day each time it is asked.
  it("act once on a response delivered twice", async () => {
    const response = {
      actionIdentifier: "tomorrow",
      notification: { request: { identifier: "twice", content: { data: { kind: "digest", send: "morning", contentId: THREAD } } } },
    } as never;
    await respond(response, () => undefined);
    await respond(response, () => undefined);
    expect(sent).toHaveLength(1);
    expect(dismissed).toEqual(["twice"]);
    // And the platform's copy of the last response goes, for the next launch.
    expect(cleared).toBe(1);
  });

  it("send the session and the row's id only, and dismiss the notification once the server has written", async () => {
    let opened: unknown = null;
    await respond(
      { actionIdentifier: "done", notification: { request: { identifier: "n1", content: { data: { kind: "digest", send: "morning", contentId: THREAD } } } } } as never,
      (route) => {
        opened = route;
      },
    );
    expect(sent).toEqual([{ path: "/v1/notifications/act", init: { method: "POST", body: JSON.stringify({ action: "done", contentId: THREAD }) } }]);
    expect(dismissed).toEqual(["n1"]);
    expect(opened).toBeNull();
  });

  it("leave the notification standing when the write is refused, and a tap opens the screen", async () => {
    await respond(
      {
        actionIdentifier: "tomorrow",
        notification: { request: { identifier: "n2", content: { data: { kind: "digest", send: "morning", contentId: "00000000-0000-7000-8000-00000000dead" } } } },
      } as never,
      () => undefined,
    );
    expect(dismissed).toEqual([]);
    let opened: unknown = null;
    await respond(
      { actionIdentifier: "expo.modules.notifications.actions.DEFAULT", notification: { request: { identifier: "n3", content: { data: { kind: "request" } } } } } as never,
      (route) => {
        opened = route;
      },
    );
    expect(opened).toEqual({ pathname: "/settings/people" });
    expect(verbOf("expo.modules.notifications.actions.DEFAULT")).toBeNull();
  });
});

describe("024 AC-11 the token", () => {
  it("is registered when permitted, with the platform and no account id, and never when the permission was refused", async () => {
    await register();
    expect(sent).toEqual([{ path: "/v1/push-tokens", init: { method: "POST", body: JSON.stringify({ token: "ExponentPushToken[phone]", platform: "ios" }) } }]);
    expect(registeredToken()).toBe("ExponentPushToken[phone]");
    sent.length = 0;
    permission = "denied";
    await register();
    expect(sent).toEqual([]);
  });

  it("is deleted on the server before the session ends", async () => {
    permission = "granted";
    await register();
    sent.length = 0;
    expect(signingOut).toHaveLength(1);
    await signingOut[0]!();
    expect(sent).toEqual([{ path: "/v1/push-tokens", init: { method: "DELETE", body: JSON.stringify({ token: "ExponentPushToken[phone]" }) } }]);
    expect(registeredToken()).toBeNull();
  });
});
