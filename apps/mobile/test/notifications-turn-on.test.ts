// Today's Turn on, on a phone that was never asked. 024, 027.
//
// Found recording the App Store review (2026-10-11): someone who skipped
// notifications in first run had never been asked, Turn on opened System
// settings, and iOS shows no Notifications row for an app until it has asked
// once. A dead end. A phone that can still be asked is asked; only one that
// cannot goes to System settings. On Android 13 and later the runtime
// permission can be granted while the app's switch is off in the system,
// which no dialog can change, so that one goes to System settings too.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Answer = { status: "granted" | "denied" | "undetermined"; granted: boolean; canAskAgain: boolean };

let held: Answer;
let broken = false;
let reply: Answer;
let asked = 0;
let settings = 0;
const tokens: string[] = [];

vi.mock("react-native", () => ({
  Platform: { OS: "ios", select: (o: Record<string, unknown>) => o["ios"] },
  Linking: {
    openSettings: async () => {
      settings += 1;
    },
  },
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "proj" } } } } }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: async () => {
    if (broken) throw new Error("permissions");
    return held;
  },
  requestPermissionsAsync: async () => {
    asked += 1;
    held = reply;
    return reply;
  },
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[phone]" }),
  AndroidImportance: { DEFAULT: 3 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));
vi.mock("../lib/log", () => ({ failed: () => undefined }));
vi.mock("../lib/auth", () => ({ beforeSignOut: () => undefined }));
vi.mock("../lib/api", () => ({
  registerPushToken: async (token: string) => {
    tokens.push(token);
    return true;
  },
  deletePushToken: async () => true,
  actOnNotification: async () => true,
}));

const { turnOn } = await import("../lib/notifications");

const NEVER: Answer = { status: "undetermined", granted: false, canAskAgain: true };
const YES: Answer = { status: "granted", granted: true, canAskAgain: true };
const NO: Answer = { status: "denied", granted: false, canAskAgain: false };

beforeEach(() => {
  broken = false;
  asked = 0;
  settings = 0;
  tokens.length = 0;
});

describe("Turn on asks a phone that can still be asked", () => {
  it("never asked: asks, registers the token on a yes, and opens no settings", async () => {
    held = NEVER;
    reply = YES;
    expect(await turnOn()).toBe("on");
    expect(asked).toBe(1);
    expect(settings).toBe(0);
    expect(tokens).toEqual(["ExponentPushToken[phone]"]);
  });

  it("never asked, and the dialog says no: nothing else opens, the card stays", async () => {
    held = NEVER;
    reply = NO;
    expect(await turnOn()).toBe("off");
    expect(asked).toBe(1);
    expect(settings).toBe(0);
    expect(tokens).toEqual([]);
  });

  it("Android 13 after one no: the system still lets it ask, so it asks", async () => {
    held = { status: "denied", granted: false, canAskAgain: true };
    reply = YES;
    expect(await turnOn()).toBe("on");
    expect(asked).toBe(1);
    expect(settings).toBe(0);
  });
});

describe("Turn on opens System settings only when asking cannot help", () => {
  it("refused and cannot ask again", async () => {
    held = NO;
    expect(await turnOn()).toBe("off");
    expect(asked).toBe(0);
    expect(settings).toBe(1);
  });

  it("Android 13: the permission is granted but the app is switched off in the system", async () => {
    held = { status: "denied", granted: true, canAskAgain: true };
    expect(await turnOn()).toBe("off");
    expect(asked).toBe(0);
    expect(settings).toBe(1);
  });

  it("already allowed: registers and opens nothing", async () => {
    held = YES;
    expect(await turnOn()).toBe("on");
    expect(asked).toBe(0);
    expect(settings).toBe(0);
    expect(tokens).toEqual(["ExponentPushToken[phone]"]);
  });
});

// A no from the person is theirs, and the card already says notifications
// are off; the next Turn on opens System settings. Only a call that did not
// go through is a failure, with its line and Try again.
describe("Turn on tells a refusal from a failure", () => {
  it("a call that throws is a failure", async () => {
    broken = true;
    expect(await turnOn()).toBe("failed");
    expect(settings).toBe(0);
  });
});

describe("the card", () => {
  const source = readFileSync(new URL("../components/today/NeedsYou.tsx", import.meta.url), "utf8");
  const action = source.slice(source.indexOf('case "notifications":\n        return ['), source.indexOf('case "request":\n        return ['));

  it("Turn on goes through turnOn, never straight to System settings", () => {
    expect(action).toMatch(/turnOn\(\)/);
    expect(action).not.toMatch(/openSettings/);
  });

  it("reads Needs you again on a yes, so the card goes, and says a failure", () => {
    expect(action).toMatch(/const outcome = await turnOn\(\);\s*if \(outcome === "on"\) onReload\(\);\s*return outcome === "failed" \? "failed" : "ok";/);
  });

  // `keeps` leaves the card on the stack while it runs. Its outcome was
  // dropped, so a failure said nothing (review of PR 108); a failed one now
  // shows its line and Try again, as every other action's does.
  it("says a failure from an action that keeps the card", () => {
    const press = source.slice(source.indexOf("onPress={() => {\n                      if (action.keeps)"));
    expect(press).toMatch(/if \(action\.keeps\) keep\(card\.key, action\.run, action\.failed, action\.label\);/);
    const keep = source.slice(source.indexOf("const keep = ("), source.indexOf("const tomorrow ="));
    expect(keep).toMatch(/if \(outcome === "failed"\) setFailed\(\{ key, label, line: failure \}\)/);
  });
});
