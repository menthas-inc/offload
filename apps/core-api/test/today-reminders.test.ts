// 042 E8: Today's Reminders section. Every thing of the person's whose
// reminders have begun and whose day has not passed, nearest first, at most
// twenty with a count of the rest; a row Your day draws today is not repeated;
// it follows How many whether or not the notifications are on. (AC-26, OFF-3)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { todayReminders } from "../src/today/reminders.js";
import { account, label, memory, note, row, signIn, thread, wipe } from "./reminders-kit.js";

await migrate(() => {});
let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(wipe);

const NOW = new Date("2026-11-02T10:00:00Z"); // Monday, Lisbon UTC+0
const LONG_AGO = new Date("2026-06-01T00:00:00Z");
const labelled = (me: string, thing: { contentId?: string; noteId?: string }, over: Record<string, unknown>) =>
  label(me, thing, { labelled_at: LONG_AGO, date_set_at: LONG_AGO, ...over });

describe("what the section holds", () => {
  it("what has begun and not ended, nearest first, rows as Today's rows and the rest as lines", async () => {
    const me = await account();
    const t = await thread([me], "Trips");
    await db.updateTable("threads").set({ icon: "plane", hue: 6 }).where("id", "=", t).execute();
    // A month out on the 2nd for the 30th: begun.
    const meera = await memory(me, "Meera's birthday is 30 November.");
    await labelled(me, { noteId: meera }, { kind: "occasion", lead: "weeks", yearly_on: "11-30", name: "Meera's birthday" });
    // A week out on the 2nd for the 9th: begun.
    const trip = await note(me, t, "We're in Lisbon from the 9th", { day: "2026-11-09" });
    await labelled(me, { noteId: trip }, { kind: "trip", lead: "weeks", name: "Lisbon" });
    // Three days out on the 1st for the 4th: begun.
    const form = await row(me, t, "Submit the form", { day: "2026-11-04" });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    // Its first reminder is on the 12th: not begun.
    const later = await row(me, t, "Renew the gym", { day: "2026-11-15" });
    await labelled(me, { contentId: later }, { kind: "deadline", lead: "days" });
    // Due today, so Your day draws it.
    const today = await row(me, t, "Pay the rent", { day: "2026-11-02" });
    await labelled(me, { contentId: today }, { kind: "deadline", lead: "days" });

    const section = await todayReminders(me, NOW);
    expect(section.rows.map((r) => [r.id, r.remindDay, r.remindBy, r.threadName])).toEqual([[form, "2026-11-04", true, "Trips"]]);
    expect(section.others).toEqual([
      { of: "note", id: trip, name: "Lisbon", day: "2026-11-09", by: false, threadId: t, threadName: "Trips", threadIcon: "plane", threadHue: 6 },
      { of: "memory", id: meera, name: "Meera's birthday", day: "2026-11-30", by: false, threadId: null, threadName: null, threadIcon: null, threadHue: null },
    ]);
    expect(section.more).toBe(0);
  });

  it("an undated task that belongs to a trip, by the day before it", async () => {
    const me = await account();
    const t = await thread([me]);
    const trip = await note(me, t, "Lisbon 12 to 19 November", { day: "2026-11-12" });
    const visa = await row(me, t, "Get the visa");
    // Weeks: its month out was in October, so it has begun.
    await labelled(me, { contentId: visa }, { kind: "deadline", lead: "weeks", anchor_note_id: trip });
    const section = await todayReminders(me, NOW);
    expect(section.rows.map((r) => [r.id, r.remindDay, r.remindBy])).toEqual([[visa, "2026-11-11", true]]);
  });

  it("follows How many even with the notifications off, and never a stopped thing", async () => {
    const me = await account({ notify_reminders: false, notify_reminder_count: 1 });
    const t = await thread([me]);
    // Low keeps the week out (the 25th), not the month out (the 2nd): not begun.
    const meera = await memory(me, "Meera's birthday is 30 November.");
    await labelled(me, { noteId: meera }, { kind: "occasion", lead: "weeks", yearly_on: "11-30", name: "Meera's birthday" });
    const form = await row(me, t, "Submit the form", { day: "2026-11-04" });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    const stopped = await row(me, t, "Stopped", { day: "2026-11-04" });
    await labelled(me, { contentId: stopped }, { kind: "deadline", lead: "days", stopped_at: new Date() });
    const section = await todayReminders(me, NOW);
    expect(section.rows.map((r) => r.id)).toEqual([form]);
    expect(section.others).toEqual([]);
  });

  it("never another member's thing", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const hers = await row(ana, t, "Ana's form", { day: "2026-11-04" });
    await labelled(ana, { contentId: hers }, { kind: "deadline", lead: "days" });
    expect((await todayReminders(me, NOW)).rows).toEqual([]);
  });

  it("twenty, and a count of the rest, the further away", async () => {
    const me = await account();
    const t = await thread([me]);
    for (let n = 0; n < 23; n += 1) {
      const id = await row(me, t, `Form ${n}`, { day: "2026-11-04" }, { created_at: new Date(Date.UTC(2026, 0, 1, 0, n)) });
      await labelled(me, { contentId: id }, { kind: "deadline", lead: "days" });
    }
    const section = await todayReminders(me, NOW);
    expect(section.rows).toHaveLength(20);
    expect(section.more).toBe(3);
  });
});

describe("the route", () => {
  it("is the session's own", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/today/reminders" })).statusCode).toBe(401);
    const me = await account();
    const response = await app.inject({ method: "GET", url: "/v1/today/reminders", headers: { cookie: await signIn(me) } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ rows: [], others: [], more: 0 });
  });
});
