// The channels on Android, and the one category Android refuses. 024.
//
// The first run on a Pixel (2026-09-24) logged notifications.prepare as
// failed and made no channels at all: expo-notifications on Android throws
// "Must provide at least one action" for a category with no actions, which
// is what the plain digest asked for, and the channels were behind it in
// the same try. A send with no verbs needs no category on Android, and the
// channels must not depend on the categories.

import { beforeEach, describe, expect, it, vi } from "vitest";

const categories: { id: string; actions: number }[] = [];
const channels: string[] = [];
const failures: string[] = [];

vi.mock("react-native", () => ({ Platform: { OS: "android", select: (o: Record<string, unknown>) => o["android"] } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "proj" } } } } }));
vi.mock("expo-notifications", () => ({
  // The platform's own rule, mirrored: a category needs an action.
  setNotificationCategoryAsync: async (id: string, actions: unknown[]) => {
    if (actions.length === 0) throw new Error("Invalid arguments provided for notification category. Must provide at least one action.");
    categories.push({ id, actions: actions.length });
  },
  setNotificationChannelAsync: async (id: string) => {
    channels.push(id);
  },
  getPermissionsAsync: async () => ({ status: "granted" }),
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[phone]" }),
  dismissNotificationAsync: async () => undefined,
  clearLastNotificationResponseAsync: async () => undefined,
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));
vi.mock("../lib/log", () => ({ failed: (event: string) => failures.push(event) }));
vi.mock("../lib/auth", () => ({ beforeSignOut: () => undefined }));
vi.mock("../lib/api", () => ({ registerPushToken: async () => true, deletePushToken: async () => true, actOnNotification: async () => true }));

const { prepare } = await import("../lib/notifications");

beforeEach(() => {
  categories.length = 0;
  channels.length = 0;
  failures.length = 0;
});

describe("024 preparing an Android phone", () => {
  it("makes the four channels, asks for no category without an action, and logs no failure", async () => {
    await prepare();
    expect(channels).toEqual(["due_today", "coming_tomorrow", "people_requests", "shared_activity"]);
    expect(categories.map((c) => c.id)).toEqual(["digest_verbs", "people"]);
    expect(categories.every((c) => c.actions > 0)).toBe(true);
    expect(failures).toEqual([]);
  });
});
