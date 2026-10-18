// 2026-10-18 Today's month: the grid over Today's day, a dot for each thing a
// day would show. Same sources as the day read and nothing else: to-dos and
// offload events across the account's threads, and its own ticked calendars.

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
const day = (n: number) => addUtcDays(TODAY, n);

interface MonthDay { date: string; task: number; event: number; calendar: number }

async function month(cookie: string, from: string, to: string): Promise<{ status: number; days: MonthDay[] }> {
  const response = await app.inject({ method: "GET", url: `/v1/today/month?from=${from}&to=${to}`, headers: { cookie } });
  return { status: response.statusCode, days: response.statusCode === 200 ? (response.json() as { days: MonthDay[] }).days : [] };
}

describe("Today's month", () => {
  it("counts each day's to-dos, offload events and ticked calendar events", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Pay the council tax", day(1));
    await task(me, flat, "Call the plumber", day(1));
    await offloadEvent(me, flat, "Dinner", `${day(1)}T19:00:00Z`);
    const n = await connection(me);
    const work = await calendar(n, { summary: "Work" });
    const hidden = await calendar(n, { summary: "Hidden", selected: false });
    await calendarEvent(me, work, "Standup", `${day(2)}T09:00:00Z`);
    await calendarEvent(me, hidden, "Secret", `${day(2)}T10:00:00Z`);
    const body = await month(await signIn(me), TODAY, day(6));
    expect(body.status).toBe(200);
    expect(body.days).toEqual([
      { date: day(1), task: 2, event: 1, calendar: 0 },
      { date: day(2), task: 0, event: 0, calendar: 1 },
    ]);
  });

  it("puts a repeating to-do on every day its rule lands on", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Bins", day(1), { rrule: "FREQ=WEEKLY" });
    const body = await month(await signIn(me), TODAY, day(20));
    expect(body.days.map((one) => one.date)).toEqual([day(1), day(8), day(15)]);
  });

  it("never counts a calendar another member picked for a shared thread", async () => {
    const me = await account();
    const ana = await account({ display_name: "Ana" });
    const shared = await thread([me, ana], "Flat");
    const theirs = await calendar(await connection(ana), { summary: "Ana's" });
    await db.insertInto("thread_calendars").values({ thread_id: shared, calendar_id: theirs.id, account_id: ana } as never).execute();
    await calendarEvent(ana, theirs, "Ana's dentist", `${day(1)}T10:00:00Z`);
    expect((await month(await signIn(me), TODAY, day(6))).days).toEqual([]);
  });

  it("agrees with the day read on every day it covers", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Weekly", day(0), { rrule: "FREQ=WEEKLY" });
    // Overdue: Today carries it on today's cell, as its late section.
    await task(me, flat, "Overdue", day(-3));
    await task(me, flat, "Long gone", day(-40));
    await task(me, flat, "Timed", null, { due_at: new Date(`${day(3)}T22:30:00Z`), attrs: {} });
    await offloadEvent(me, flat, "Trip", `${day(4)}T08:00:00Z`, { occurs_end_at: new Date(`${day(6)}T08:00:00Z`) });
    const work = await calendar(await connection(me), { summary: "Work" });
    await calendarEvent(me, work, "Offsite", `${day(5)}T00:00:00Z`, { allDay: true, end: `${day(7)}T00:00:00Z` });
    const cookie = await signIn(me);
    const counted = new Map((await month(cookie, TODAY, day(9))).days.map((one) => [one.date, one]));
    for (let n = 0; n <= 9; n += 1) {
      const response = await app.inject({ method: "GET", url: `/v1/today/day?date=${day(n)}`, headers: { cookie } });
      const read = response.json() as { late: unknown[]; timed: unknown[]; rest: unknown[]; events: { source: string }[] };
      const got = counted.get(day(n)) ?? { task: 0, event: 0, calendar: 0 };
      expect([day(n), got.task, got.event, got.calendar]).toEqual([
        day(n),
        read.late.length + read.timed.length + read.rest.length,
        read.events.filter((one) => one.source === "offload").length,
        read.events.filter((one) => one.source === "calendar").length,
      ]);
    }
  });

  it("works each row's days out once, so many repeating rows with long counts stay quick", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await db
      .insertInto("content")
      .values(
        Array.from({ length: 300 }, (_, n) => ({
          account_id: me,
          thread_id: flat,
          title: `Repeat ${n}`,
          type: "task",
          due_at: new Date(`${day(0)}T12:00:00Z`),
          attrs: { all_day: true },
          rrule: "FREQ=DAILY;COUNT=999",
        })) as never,
      )
      .execute();
    const cookie = await signIn(me);
    const started = Date.now();
    const body = await month(cookie, TODAY, day(41));
    expect(Date.now() - started).toBeLessThan(1500);
    expect(body.days).toHaveLength(42);
    expect(body.days[0]!.task).toBe(300);
  });

  it("dots nothing before today, since a past day does not open; an overdue to-do dots today, as Today's late section", async () => {
    const me = await account();
    const flat = await thread([me], "Flat");
    await task(me, flat, "Yesterday's", day(-1));
    expect((await month(await signIn(me), day(-5), day(1))).days).toEqual([{ date: TODAY, task: 1, event: 0, calendar: 0 }]);
    // A window that starts after today carries no late rows.
    expect((await month(await signIn(me), day(1), day(5))).days).toEqual([]);
  });

  it("refuses a window that is not days, runs backwards or is longer than a month's grid", async () => {
    const cookie = await signIn(await account());
    expect((await month(cookie, "soon", day(3))).status).toBe(400);
    expect((await month(cookie, day(3), day(1))).status).toBe(400);
    expect((await month(cookie, TODAY, day(70))).status).toBe(400);
  });

  it("answers 401 without a session", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/today/month?from=${TODAY}&to=${day(6)}` });
    expect(response.statusCode).toBe(401);
  });
});
