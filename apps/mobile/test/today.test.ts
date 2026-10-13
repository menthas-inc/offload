// 027 Today on the phones: the logic under the screen.
//
// AC-6, AC-7 the device cards; AC-11, AC-12 the stack; AC-15 the doors;
// AC-27 Customize Today, with open in your threads (2026-10-07); AC-30 the
// tabs.

import { readFileSync } from "node:fs";
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
    // 042. Reminders sits between Your day and open in your threads.
    const [needs, d, o] = layout([true, true, true, true]).sections;
    expect(today.DEFAULT_LAYOUT).toEqual({ version: 1, sections: [needs, d, { kind: "reminders", on: true }, o] });
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

  it("counts Calendar as a switch that reaches this phone (2026-10-10)", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    const off = { notifyDueToday: false, notifyComingTomorrow: false, notifyPeopleRequests: false, notifySharedActivity: false, notifyReminders: false };
    expect(today.notificationsCard(off, false, null, now)).toBeNull();
    expect(today.notificationsCard({ ...off, notifyCalendar: true }, false, null, now)).not.toBeNull();
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


describe("042 the Reminders section", () => {
  const four = (reminders = true) => {
    const base = layout([true, true, true, true]);
    const [needs, d, o] = base.sections;
    return { version: 1 as const, sections: [needs!, d!, { kind: "reminders" as const, on: reminders }, o!] };
  };

  it("switches, counts towards the last switch on, and moves like the others", () => {
    expect(today.remindersOn(four())).toBe(true);
    expect(today.remindersOn(today.setSwitch(four(), "reminders", false))).toBe(false);
    const only = today.setSwitch(today.setSwitch(today.setSwitch(four(), "day", false), "open_threads", false), "account", false);
    const alone = ["people", "questions", "tips"].reduce((held, part) => today.setSwitch(held, part as "people", false), only);
    expect(today.canSwitchOff(alone, "reminders")).toBe(false);
    expect(today.moveSection(four(), "reminders", -1).sections.map((one) => one.kind)).toEqual(["needs_you", "reminders", "day", "open_threads"]);
  });

  it("reads todayLayoutV3 first, then V2, then the defaults", () => {
    const v2 = layout([false, true, true, true]);
    const v3 = four(false);
    expect(today.layoutOf({ todayLayoutV2: v2, todayLayoutV3: v3 })).toEqual(v3);
    expect(today.layoutOf({ todayLayoutV2: v2 })).toEqual(v2);
    expect(today.layoutOf(undefined)).toEqual(today.DEFAULT_LAYOUT);
  });

  it("reads the section, and nothing when it did not come back", async () => {
    sent.length = 0;
    status = 500;
    expect(await today.fetchReminders()).toBeNull();
    expect(sent.map((s) => s.path)).toEqual(["/v1/today/reminders"]);
    status = 200;
  });

  it("puts rows, notes and memories in one list, nearest first", () => {
    const row = (id: string, remindDay: string) => ({ id, remindDay, remindBy: false }) as never;
    const other = (id: string, day: string, of: "note" | "memory" = "note") =>
      ({ of, id, name: id, day, by: false, time: null, window: "long", next: null, threadId: null, threadName: null, threadIcon: null, threadHue: null }) as const;
    const merged = today.remindersInOrder({ rows: [row("r1", "2026-10-12"), row("r2", "2026-10-20")], others: [other("n1", "2026-10-11"), other("m1", "2026-10-12", "memory")], more: 0 });
    expect(merged.map((entry) => entry.id)).toEqual(["n1", "r1", "m1", "r2"]);
  });

  it("dismisses one reminder, and undoes it, by what was on the screen", async () => {
    sent.length = 0;
    const which = { of: "memory" as const, id: "m1", day: "2026-11-30", window: "long" as const };
    expect(await today.dismissReminder(which)).toBe(true);
    expect(await today.undismissReminder(which)).toBe(true);
    expect(sent.map((s) => [s.path, s.init?.method, s.init?.body])).toEqual([
      ["/v1/today/reminders/dismiss", "POST", JSON.stringify(which)],
      ["/v1/today/reminders/undismiss", "POST", JSON.stringify(which)],
    ]);
    status = 404;
    expect(await today.dismissReminder(which)).toBe(false);
    status = 200;
  });

  it("opens a memory in Memories by the shared parameter, a note in its thread, and nothing for a note with no thread", () => {
    const other = { name: "x", day: "2026-10-11", by: false, time: null, window: "long" as const, next: null, threadName: null, threadIcon: null, threadHue: null };
    expect(today.reminderDoor({ ...other, of: "memory", id: "m1", threadId: null })).toEqual({ pathname: "/memories", params: { memory: "m1" } });
    expect(today.reminderDoor({ ...other, of: "note", id: "n1", threadId: "t1", threadName: "Rent" })).toEqual({ pathname: "/threads/[id]", params: { id: "t1" } });
    expect(today.reminderDoor({ ...other, of: "note", id: "n2", threadId: null })).toBeNull();
  });

  it("asks for the phone's permission when only Reminders would reach it", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    const off = { notifyDueToday: false, notifyComingTomorrow: false, notifyPeopleRequests: false, notifySharedActivity: false };
    expect(today.notificationsCard({ ...off, notifyReminders: true }, false, null, now)).not.toBeNull();
    expect(today.notificationsCard({ ...off, notifyReminders: false }, false, null, now)).toBeNull();
  });
});

describe("042 the screens", () => {
  const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

  it("draws Reminders in the layout's place, today only, never over the day-one invitation, from its own read", () => {
    const screen = read("components/today/TodayScreen.tsx");
    expect(screen).toMatch(/section\.kind === "reminders"/);
    expect(screen).toMatch(/isToday && remindersOn\(layout\) && reminders && !dayOne/);
    expect(screen).toMatch(/fetchReminders\(\)/);
    expect(screen).toMatch(/me\?\.todayLayoutV3 \?\? me\?\.todayLayoutV2|layoutOf\(me\)/);
  });

  it("draws the section as the kit's column (2026-10-11): the countdown, the name, where it lives, and the dismiss", () => {
    const screen = read("components/today/TodayScreen.tsx");
    expect(screen).toMatch(/<Reminders\b/);
    expect(screen).not.toMatch(/and \{reminders\.more\} more/);
    const column = read("components/today/Reminders.tsx");
    expect(column).toMatch(/countdownLabel\(/);
    expect(column).toMatch(/reminderDayLine\(/);
    expect(column).toMatch(/reminderTimeLine\(/);
    // Where it lives is decided once, in widgets, for the phones and the web.
    expect(column).toMatch(/whereOf\(/);
    expect(column).not.toMatch(/"Memories"|"Not in a thread"/);
    expect(column).toMatch(/dismissLabel\(/);
    expect(column).toMatch(/dismissedLine\(/);
    expect(column).toMatch(/dismissReminder\(/);
    expect(column).toMatch(/undismissReminder\(/);
    expect(column).toMatch(/unwrite: \(\) => undismissReminder\(/);
    // No thread page row, no chip, no pill: the row opens, and that is all.
    expect(column).not.toMatch(/rows\.row\(/);
    expect(column).not.toMatch(/PlainChip|ThreadPill|DateChip/);
    // A dismiss hides that reminder only, so the key carries the day and the window.
    expect(column).toMatch(/keyOf\(\{ of: "content", id: entry\.id, day: entry\.remindDay, window: entry\.window \}\)/);
    // Everything on the day shares one card under one Today.
    expect(column).toMatch(/entry\.day === today|day === today/);
  });

  it("wraps each drawn section in a band by position, and heads Reminders and Open in your threads at the band's size", () => {
    const screen = read("components/today/TodayScreen.tsx");
    expect(screen).toMatch(/<Band\b/);
    expect(screen).not.toMatch(/contentContainerClassName="gap-space-8 px-gutter-screen pt-space-3 pb-space-8"/);
    const band = read("components/today/Band.tsx");
    expect(band).toMatch(/export function Band\(/);
    expect(band).toMatch(/export function useInBand\(/);
    expect(band).toMatch(/isAndroid \? "bg-a-c-low" : "bg-surface-fill"/);
    const parts = read("components/today/DayParts.tsx");
    expect(parts).toMatch(/big\?: boolean/);
    expect(parts).toMatch(/useInBand\(\)/);
    expect(read("components/today/OpenThreads.tsx")).toMatch(/<SectionHead title="Open in your threads" count=\{count\} big \/>/);
    expect(read("components/today/OpenThreads.tsx")).toMatch(/useInBand\(\)/);
    expect(read("components/shell/DateChip.tsx")).toMatch(/useInBand\(\)/);
  });

  it("draws nothing for a kind it does not know: Your day is a branch of its own", () => {
    const screen = read("components/today/TodayScreen.tsx");
    expect(screen).toMatch(/if \(section\.kind !== "day"\) return null;/);
  });

  it("lists Reminders in Customize Today with the shared name and line", () => {
    const sheet = read("components/today/CustomizeSheet.tsx");
    expect(sheet).toMatch(/reminders: \[TODAY_REMINDERS\.name, TODAY_REMINDERS\.line\]/);
    expect(sheet).toMatch(/remindersOn\(shown\)/);
  });

  it("opens a memory in Memories by the shared parameter", () => {
    const memories = read("components/screens/Memories.tsx");
    expect(memories).toMatch(/useLocalSearchParams<\{ \[MEMORY_PARAM\]\?: string \}>/);
    expect(memories).toMatch(/params\[MEMORY_PARAM\]/);
    expect(memories).not.toMatch(/params\.open/);
  });

  it("draws a line with no door as no button: only a line that opens something is pressable", () => {
    const column = read("components/today/Reminders.tsx");
    expect(column).toMatch(/door: reminderDoor\(entry\)/);
    expect(column).toMatch(/line\.door \? \(\s*<Pressable/);
    expect(column).not.toMatch(/params: \{ open: entry\.id \}/);
  });

  it("keeps a reminder row's own fields through the drawn rows", () => {
    expect(read("components/today/useTodayRows.tsx")).toMatch(/live: <T extends TodayRow>\(rows: T\[\]\) => T\[\]/);
  });
});
