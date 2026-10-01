// 027 T1.5, T1.6, T1.8: one day of Today. (AC-14, AC-16 to AC-20, AC-24, AC-25)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addUtcDays, dayIn } from "@offload/widgets";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, calendar, calendarEvent, connection, offloadEvent, signIn, task, thread, ZONE } from "./today-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await db.deleteFrom("accounts").execute();
  await db.deleteFrom("threads").execute();
});

const TODAY = dayIn(new Date(), ZONE);
const TOMORROW = addUtcDays(TODAY, 1);

interface Row { id: string; title: string; threadId: string; threadName: string; dueAt: string | null }
interface Event {
  id: string; source: "calendar" | "offload"; title: string; startsAt: string | null; endsAt: string | null; allDay: boolean;
  mine: boolean; calendarName: string | null; link: string | null; threadId: string | null; threadName: string | null; authorName: string | null;
}
interface Day {
  date: string; events: Event[]; eventCount: number; late: Row[]; lateMore: number; timed: Row[]; rest: Row[]; restMore: number;
  picks: Row[]; everDumped: boolean;
}

async function day(cookie: string, date: string): Promise<Day> {
  const response = await app.inject({ method: "GET", url: `/v1/today/day?date=${date}`, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response.json() as Day;
}

describe("027 the day's events (AC-16, AC-17, AC-18)", () => {
  it("draws a ticked calendar's events, all-day first then by start, and never an un-ticked one's", async () => {
    const me = await account();
    const n = await connection(me);
    const work = await calendar(n, { summary: "Work" });
    const hidden = await calendar(n, { summary: "Hidden", selected: false });
    await calendarEvent(me, work, "Call with Ana", `${TOMORROW}T12:00:00Z`);
    await calendarEvent(me, work, "Standup", `${TOMORROW}T09:00:00Z`);
    await calendarEvent(me, work, "Holiday", `${TOMORROW}T00:00:00Z`, { allDay: true, end: `${addUtcDays(TOMORROW, 1)}T00:00:00Z` });
    await calendarEvent(me, hidden, "Secret", `${TOMORROW}T10:00:00Z`);
    const body = await day(await signIn(me), TOMORROW);
    expect(body.events.map((e) => e.title)).toEqual(["Holiday", "Standup", "Call with Ana"]);
    expect(body.events[1]).toMatchObject({ source: "calendar", mine: true, calendarName: "Calendar: Work", threadId: null });
  });

  it("draws only what the account created or was invited to, from a calendar shared with somebody else", async () => {
    const me = await account();
    const shared = await calendar(await connection(me), { summary: "Family" });
    await calendarEvent(me, shared, "Her class", `${TOMORROW}T08:00:00Z`, { createdByMe: false, invitedMe: false });
    await calendarEvent(me, shared, "Our dinner", `${TOMORROW}T19:00:00Z`, { createdByMe: false, invitedMe: true });
    await calendarEvent(me, shared, "My run", `${TOMORROW}T07:00:00Z`, { createdByMe: true, invitedMe: false });
    await calendarEvent(me, shared, "Not read yet", `${TOMORROW}T12:00:00Z`, { createdByMe: null, invitedMe: null });
    const body = await day(await signIn(me), TOMORROW);
    expect(body.events.map((e) => e.title)).toEqual(["My run", "Not read yet", "Our dinner"]);
    expect(body.eventCount).toBe(3);
    expect(body.events[0]!.calendarName).toBe("Calendar: Family");
  });

  it("never draws a calendar another member picked for a shared thread", async () => {
    const me = await account();
    const ana = await account({ display_name: "Ana" });
    const shared = await thread([me, ana], "Flat");
    const theirs = await calendar(await connection(ana), { summary: "Ana's" });
    await db.insertInto("thread_calendars").values({ thread_id: shared, calendar_id: theirs.id, account_id: ana } as never).execute();
    await calendarEvent(ana, theirs, "Ana's dentist", `${TOMORROW}T10:00:00Z`);
    const body = await day(await signIn(me), TOMORROW);
    expect(body.events).toEqual([]);
  });

  it("puts an event spanning three days on each of them", async () => {
    const me = await account();
    const work = await calendar(await connection(me));
    await calendarEvent(me, work, "Conference", `${TOMORROW}T00:00:00Z`, { allDay: true, end: `${addUtcDays(TOMORROW, 3)}T00:00:00Z` });
    const cookie = await signIn(me);
    for (const d of [TOMORROW, addUtcDays(TOMORROW, 1), addUtcDays(TOMORROW, 2)]) {
      expect((await day(cookie, d)).events.map((e) => e.title)).toEqual(["Conference"]);
    }
    expect((await day(cookie, addUtcDays(TOMORROW, 3))).events).toEqual([]);
  });

  it("draws an offload event with its thread, and another member's with their name", async () => {
    const me = await account({ display_name: "Jo" });
    const ana = await account({ display_name: "Ana Duarte" });
    const flat = await thread([me, ana], "Flat");
    await offloadEvent(me, flat, "Viewing", `${TOMORROW}T14:00:00Z`);
    await offloadEvent(ana, flat, "Dentist for Mia", `${TOMORROW}T10:00:00Z`);
    const body = await day(await signIn(me), TOMORROW);
    expect(body.events.map((e) => [e.title, e.source, e.threadName, e.mine, e.authorName])).toEqual([
      ["Dentist for Mia", "offload", "Flat", false, "Ana Duarte"],
      ["Viewing", "offload", "Flat", true, null],
    ]);
  });

  it("draws an event offload wrote to a calendar once, as the row", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    const work = await calendar(await connection(me));
    const ref = `${work.external}:evt-1`;
    await offloadEvent(me, flat, "Viewing", `${TOMORROW}T14:00:00Z`, { source_ref: ref });
    await calendarEvent(me, work, "Viewing", `${TOMORROW}T14:00:00Z`, { sourceRef: ref });
    const body = await day(await signIn(me), TOMORROW);
    expect(body.events.map((e) => [e.title, e.source])).toEqual([["Viewing", "offload"]]);
  });

  it("carries the event's link only when it is a Google one", async () => {
    const me = await account();
    const work = await calendar(await connection(me));
    await calendarEvent(me, work, "Linked", `${TOMORROW}T09:00:00Z`, { link: "https://www.google.com/calendar/event?eid=abc" });
    await calendarEvent(me, work, "Unlinked", `${TOMORROW}T10:00:00Z`);
    const body = await day(await signIn(me), TOMORROW);
    expect(body.events.map((e) => e.link)).toEqual(["https://www.google.com/calendar/event?eid=abc", null]);
  });

  it("draws thirty and counts them all", async () => {
    const me = await account();
    const work = await calendar(await connection(me));
    for (let i = 0; i < 33; i += 1) await calendarEvent(me, work, `E${i}`, `${TOMORROW}T08:${String(i).padStart(2, "0")}:00Z`);
    const body = await day(await signIn(me), TOMORROW);
    expect(body.events).toHaveLength(30);
    expect(body.eventCount).toBe(33);
  });
});

describe("027 the day's to-dos (AC-20)", () => {
  it("splits timed rows by the hour from the rest, and takes a bare day by its date", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Pay the council tax", TOMORROW);
    await task(me, flat, "Send the slides", null, { due_at: new Date(`${TOMORROW}T15:00:00Z`) });
    await task(me, flat, "Call the agent", null, { due_at: new Date(`${TOMORROW}T10:00:00Z`) });
    await task(me, flat, "Not tomorrow", addUtcDays(TOMORROW, 1));
    const body = await day(await signIn(me), TOMORROW);
    expect(body.timed.map((r) => r.title)).toEqual(["Call the agent", "Send the slides"]);
    expect(body.rest.map((r) => r.title)).toEqual(["Pay the council tax"]);
    expect(body.late).toEqual([]);
  });

  it("draws late rows on today only, oldest first, capped at a hundred", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Five days late", addUtcDays(TODAY, -5));
    await task(me, flat, "Two days late", addUtcDays(TODAY, -2));
    await task(me, flat, "Too old", addUtcDays(TODAY, -40));
    const cookie = await signIn(me);
    const today = await day(cookie, TODAY);
    expect(today.late.map((r) => r.title)).toEqual(["Five days late", "Two days late"]);
    expect((await day(cookie, TOMORROW)).late).toEqual([]);
  });

  it("puts a repeating row on its rule's day and never in late", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Bins", addUtcDays(TODAY, -14), { rrule: "FREQ=DAILY" });
    const cookie = await signIn(me);
    const today = await day(cookie, TODAY);
    expect(today.late).toEqual([]);
    expect(today.rest.map((r) => r.title)).toEqual(["Bins"]);
    expect((await day(cookie, TOMORROW)).rest.map((r) => r.title)).toEqual(["Bins"]);
  });

  it("leaves out notes, done, archived and deleted rows, and threads the person left", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    const left = await thread([me], "Old");
    await db.updateTable("thread_members").set({ state: "left" } as never).where("thread_id", "=", left).execute();
    await task(me, flat, "Done", TOMORROW, { done_at: new Date() });
    await task(me, flat, "Archived", TOMORROW, { archived_at: new Date() });
    await task(me, flat, "Gone", TOMORROW, { deleted_at: new Date() });
    await task(me, left, "Left behind", TOMORROW);
    await task(me, flat, "Kept", TOMORROW);
    const body = await day(await signIn(me), TOMORROW);
    expect([...body.timed, ...body.rest].map((r) => r.title)).toEqual(["Kept"]);
  });

  it("caps the timed rows too, and counts what it left out", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    for (let i = 0; i < 103; i += 1) await task(me, flat, `T${i}`, null, { due_at: new Date(`${TOMORROW}T10:${String(i % 60).padStart(2, "0")}:00Z`) });
    const body = (await day(await signIn(me), TOMORROW)) as Day & { timedMore: number };
    expect(body.timed).toHaveLength(100);
    expect(body.timedMore).toBe(3);
  });

  it("folds the rest past a hundred", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    for (let i = 0; i < 103; i += 1) await task(me, flat, `T${i}`, TOMORROW);
    const body = await day(await signIn(me), TOMORROW);
    expect(body.rest).toHaveLength(100);
    expect(body.restMore).toBe(3);
  });
});

describe("027 the day read (AC-14, AC-24)", () => {
  it("refuses a day before today and one past a year ahead", async () => {
    const me = await account();
    const cookie = await signIn(me);
    for (const date of [addUtcDays(TODAY, -1), addUtcDays(TODAY, 366), "not-a-day", "Zanzibarquill", ""]) {
      const response = await app.inject({ method: "GET", url: `/v1/today/day?date=${date}`, headers: { cookie } });
      expect(response.statusCode).toBe(400);
    }
    expect((await app.inject({ method: "GET", url: `/v1/today/day?date=${addUtcDays(TODAY, 365)}`, headers: { cookie } })).statusCode).toBe(200);
  });

  it("says whether anything was ever dumped", async () => {
    const me = await account();
    const cookie = await signIn(me);
    expect((await day(cookie, TODAY)).everDumped).toBe(false);
    await task(me, await thread([me], "Flat"), "Anything", null);
    expect((await day(cookie, TODAY)).everDumped).toBe(true);
  });

  it("is 401 without a session", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/today/day?date=${TODAY}` });
    expect(response.statusCode).toBe(401);
  });
});
