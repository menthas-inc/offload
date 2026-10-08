// 027 Today on the phones: the logic under the screen.
//
// AC-6, AC-7 the device cards; AC-11, AC-12 the stack; AC-15 the doors;
// AC-27 Customize Today, with open in your threads (2026-10-07); AC-30 the
// tabs.

import { describe, expect, it, vi } from "vitest";

const sent: { path: string; init: RequestInit | undefined }[] = [];
let status = 200;
vi.mock("../lib/api", () => ({
  send: (path: string, init?: RequestInit) => {
    sent.push({ path, init });
    return Promise.resolve({ status, data: status === 200 ? { ok: true } : null });
  },
  request: (path: string, init?: RequestInit) => {
    sent.push({ path, init });
    return Promise.resolve({});
  },
  fetchActivity: () => Promise.resolve(null),
  markActivitySeen: () => Promise.resolve(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios", select: (o: Record<string, unknown>) => o["ios"] } }));

const today = await import("../lib/today");
const activity = await import("../lib/activity");
const { tabOpacity } = await import("../lib/tabs");

const layout = (parts: [boolean, boolean, boolean, boolean], day = true, order: "needs" | "day" = "needs", open = true) => {
  const needs = {
    kind: "needs_you" as const,
    parts: [
      { kind: "account" as const, on: parts[0] },
      { kind: "people" as const, on: parts[1] },
      { kind: "questions" as const, on: parts[2] },
      { kind: "tips" as const, on: parts[3] },
    ],
  };
  const d = { kind: "day" as const, on: day };
  const o = { kind: "open_threads" as const, on: open };
  return { version: 1 as const, sections: order === "needs" ? [needs, d, o] : [d, needs, o] };
};

describe("027 AC-27 Customize Today", () => {
  it("switches one kind, the day or open in your threads, and nothing else", () => {
    expect(today.setSwitch(layout([true, true, true, true]), "people", false)).toEqual(layout([true, false, true, true]));
    expect(today.setSwitch(layout([true, true, true, true]), "day", false)).toEqual(layout([true, true, true, true], false));
    expect(today.setSwitch(layout([true, true, true, true]), "open_threads", false)).toEqual(layout([true, true, true, true], true, "needs", false));
    expect(today.openThreadsOn(layout([true, true, true, true], true, "needs", false))).toBe(false);
    expect(today.DEFAULT_LAYOUT).toEqual(layout([true, true, true, true]));
  });

  it("will not switch off the last switch that is on", () => {
    const one = layout([false, false, true, false], false, "needs", false);
    expect(today.canSwitchOff(one, "questions")).toBe(false);
    expect(today.canSwitchOff(layout([false, false, false, false], false), "open_threads")).toBe(false);
    expect(today.canSwitchOff(one, "day")).toBe(true);
    expect(today.setSwitch(one, "questions", false)).toEqual(one);
    expect(today.canSwitchOff(layout([true, true, true, true]), "tips")).toBe(true);
  });

  it("moves a section up or down, and not past either end", () => {
    expect(today.moveSection(layout([true, true, true, true]), "day", -1)).toEqual(layout([true, true, true, true], true, "day"));
    expect(today.moveSection(layout([true, true, true, true]), "needs_you", -1)).toEqual(layout([true, true, true, true]));
    expect(today.moveSection(layout([true, true, true, true], true, "day"), "day", 1)).toEqual(layout([true, true, true, true]));
  });

  it("writes the whole document to /api/me", async () => {
    sent.length = 0;
    await today.saveLayout(layout([true, false, true, true]));
    expect(sent[0]?.path).toBe("/api/me");
    expect(sent[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(sent[0]?.init?.body))).toEqual({ todayLayout: layout([true, false, true, true]) });
  });
});

describe("027 AC-6, AC-7 the device cards", () => {
  const me = { timeZone: "Europe/Lisbon", followDevice: true, keptTimeZone: null, notifyDueToday: true, notifyComingTomorrow: false, notifyPeopleRequests: false, notifySharedActivity: false };

  it("draws the zone card exactly when 023's strip would", () => {
    expect(today.zoneCard(me, "Asia/Tokyo")).toEqual({ key: "zone", kind: "zone", device: "Asia/Tokyo", account: "Europe/Lisbon" });
    expect(today.zoneCard(me, "Europe/Lisbon")).toBeNull();
    expect(today.zoneCard({ ...me, followDevice: false }, "Asia/Tokyo")).toBeNull();
    expect(today.zoneCard({ ...me, keptTimeZone: "Asia/Tokyo" }, "Asia/Tokyo")).toBeNull();
  });

  it("draws the notifications card with the permission off and a switch on, until it is put off on this phone", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(today.notificationsCard(me, false, null, now)).toEqual({ key: "notifications", kind: "notifications" });
    expect(today.notificationsCard(me, true, null, now)).toBeNull();
    expect(today.notificationsCard({ ...me, notifyDueToday: false }, false, null, now)).toBeNull();
    expect(today.notificationsCard(me, false, "2026-10-02T00:00:00Z", now)).toBeNull();
    expect(today.notificationsCard(me, false, "2026-10-01T09:00:00Z", now)).not.toBeNull();
  });
});

describe("027 AC-4, AC-11 the stack", () => {
  const server = [
    { key: "calendar:c", kind: "calendar" },
    { key: "request:r", kind: "request" },
    { key: "question:q", kind: "question" },
    { key: "tip:forwarding", kind: "tip" },
  ] as never[];
  const device = [{ key: "notifications", kind: "notifications" }, { key: "zone", kind: "zone" }] as never[];

  it("puts the device cards with the account issues, zone before notifications, and only when that kind is on", () => {
    expect(today.stackOf(server, device, layout([true, true, true, true])).map((c) => c.key)).toEqual([
      "calendar:c",
      "zone",
      "notifications",
      "request:r",
      "question:q",
      "tip:forwarding",
    ]);
    expect(today.stackOf(server.slice(1), device, layout([false, true, true, true])).map((c) => c.key)).toEqual(["request:r", "question:q", "tip:forwarding"]);
  });

  it("counts N of M from the load, and draws one sliver at two waiting and two at three or more", () => {
    const cards = today.stackOf(server, [], layout([true, true, true, true]));
    expect(today.stackView(cards, new Set())).toMatchObject({ position: 1, total: 4, slivers: 2 });
    expect(today.stackView(cards, new Set(["calendar:c", "request:r"]))).toMatchObject({ position: 3, total: 4, slivers: 1 });
    expect(today.stackView(cards, new Set(["calendar:c", "request:r", "question:q"]))).toMatchObject({ position: 4, total: 4, slivers: 0 });
    expect(today.stackView(cards, new Set(cards.map((c) => c.key))).current).toBeNull();
  });

  it("keeps counting from the load when a card leaves the stack by itself", () => {
    // The zone card goes once Keep is written; the stack is rebuilt without
    // it, and what was put off before stays put off.
    const loaded = today.stackOf(server, device, layout([true, true, true, true]));
    const after = loaded.filter((c) => c.key !== "zone");
    expect(today.stackView(after, new Set(["calendar:c"]), loaded.length)).toMatchObject({ position: 3, total: 6 });
    expect(today.stackView(after, new Set(["calendar:c"]), loaded.length).current?.key).toBe("notifications");
  });
});

describe("027 AC-12 the writes, and open in your threads", () => {
  it("puts a card off, for good where asked", async () => {
    sent.length = 0;
    await today.putOff("question:q");
    await today.putOff("invitation:i", true);
    expect(sent.map((s) => [s.path, JSON.parse(String(s.init?.body))])).toEqual([
      ["/v1/today/put-off", { card: "question:q" }],
      ["/v1/today/put-off", { card: "invitation:i", forGood: true }],
    ]);
  });

  it("lets a card go quietly when it was settled somewhere else, and says so when a write fails", async () => {
    status = 404;
    expect(await today.putOff("question:q")).toBe("gone");
    status = 500;
    expect(await today.putOff("question:q")).toBe("failed");
    status = 200;
    expect(await today.putOff("question:q")).toBe("ok");
  });

  it("reads open in your threads, and nothing when it did not come back", async () => {
    sent.length = 0;
    expect(await today.fetchOpenThreads()).toBeNull();
    expect(sent.map((s) => s.path)).toEqual(["/v1/today/threads"]);
  });

  it("reads the layout that names open in your threads, and the defaults before /api/me has said", () => {
    const me = { todayLayout: layout([true, true, true, true]), todayLayoutV2: layout([false, true, true, true]) };
    expect(today.layoutOf(me)).toEqual(layout([false, true, true, true]));
    expect(today.layoutOf(null)).toEqual(today.DEFAULT_LAYOUT);
  });
});

describe("027 AC-15 the doors", () => {
  const row = (over: Record<string, unknown>) =>
    ({ id: "a", kind: "digest", sent: true, reason: null, title: "Two tomorrow", body: null, send: "evening", occurredAt: "2026-09-30T18:00:00Z", ...over }) as never;

  it("opens an evening digest's Activity row on the day it named, and a past one on Today", () => {
    expect(activity.doorOf(row({}), { today: "2026-09-30", zone: "Europe/Lisbon" })).toEqual({ pathname: "/today", params: { day: "2026-10-01" } });
    expect(activity.doorOf(row({}), { today: "2026-10-02", zone: "Europe/Lisbon" })).toEqual({ pathname: "/today" });
    expect(activity.doorOf(row({ send: "morning" }), { today: "2026-09-30", zone: "Europe/Lisbon" })).toEqual({ pathname: "/today" });
  });

  it("opens an evening digest's notification on the day it carries", () => {
    expect(today.dayOfPush({ kind: "digest", send: "evening", day: "2026-10-01" }, "2026-09-30")).toBe("2026-10-01");
    expect(today.dayOfPush({ kind: "digest", send: "evening", day: "2026-10-01" }, "2026-10-01")).toBeNull();
    expect(today.dayOfPush({ kind: "digest", send: "morning" }, "2026-10-01")).toBeNull();
    expect(today.dayOfPush({ kind: "digest", send: "evening", day: "not a day" }, "2026-09-30")).toBeNull();
  });
});

describe("027 AC-30 the tabs under the keyboard", () => {
  it("fades over the keyboard's first 60pt and takes the lower of that and a sheet's fade", () => {
    expect(tabOpacity(0, 0)).toBe(1);
    expect(tabOpacity(0, -30)).toBeCloseTo(0.5);
    expect(tabOpacity(0, -60)).toBe(0);
    expect(tabOpacity(0, -300)).toBe(0);
    expect(tabOpacity(0.8, 0)).toBeCloseTo(0.2);
    expect(tabOpacity(0.2, -30)).toBeCloseTo(0.5);
  });
});

