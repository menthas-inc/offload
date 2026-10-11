// 042 E8: Today's Reminders section. Every thing of the person's whose
// reminders have begun and whose day has not passed, nearest first; a row Your
// day draws today is not repeated; it follows How many whether or not the
// notifications are on. (AC-26, OFF-3)
//
// 2026-10-11: each entry says which reminder has begun (its window), the
// thing's clock time, and the day its next reminder comes; the column shows
// them all; and a dismiss hides that one reminder and nothing else, so a
// birthday dismissed a month out comes back a week out. Remind me is not
// touched by a dismiss.

import { addUtcDays, dayIn } from "@offload/widgets";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { dismissReminder, todayReminders, undismissReminder } from "../src/today/reminders.js";
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

/** Meera's birthday on the 30th, `occasion` and `weeks`: on Medium its week
 *  out is the 25th and its month out the 2nd, so on the 2nd it has begun. */
async function meeraOf(me: string): Promise<string> {
  const meera = await memory(me, "Meera's birthday is 30 November.");
  await labelled(me, { noteId: meera }, { kind: "occasion", lead: "weeks", yearly_on: "11-30", name: "Meera's birthday" });
  return meera;
}

describe("what the section holds", () => {
  it("what has begun and not ended, nearest first, each with its window, its time and when its next reminder comes", async () => {
    const me = await account();
    const t = await thread([me], "Trips");
    await db.updateTable("threads").set({ icon: "plane", hue: 6 }).where("id", "=", t).execute();
    // A month out on the 2nd for the 30th: begun. Its week out comes on the 25th.
    const meera = await meeraOf(me);
    // A week out on the 2nd for the 9th: begun, and a trip has nothing on the day.
    const trip = await note(me, t, "We're in Lisbon from the 9th", { day: "2026-11-09" });
    await labelled(me, { noteId: trip }, { kind: "trip", lead: "weeks", name: "Lisbon" });
    // A note with a clock time carries it.
    const lands = await note(me, t, "Ana lands at Gatwick at 21:40", { at: new Date("2026-11-09T21:40:00Z") });
    await labelled(me, { noteId: lands }, { kind: "appointment", lead: "weeks", name: "Ana lands at Gatwick" });
    // Three days out on the 1st for the 4th: begun. On the day comes on the 4th.
    const form = await row(me, t, "Submit the form", { day: "2026-11-04" });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    // Its first reminder is on the 12th: not begun.
    const later = await row(me, t, "Renew the gym", { day: "2026-11-15" });
    await labelled(me, { contentId: later }, { kind: "deadline", lead: "days" });
    // Due today, so Your day draws it.
    const today = await row(me, t, "Pay the rent", { day: "2026-11-02" });
    await labelled(me, { contentId: today }, { kind: "deadline", lead: "days" });

    const section = await todayReminders(me, NOW);
    expect(section.rows.map((r) => [r.id, r.remindDay, r.remindBy, r.threadName, r.window, r.next])).toEqual([
      [form, "2026-11-04", true, "Trips", "short", "2026-11-04"],
    ]);
    expect(section.others).toEqual([
      {
        of: "note",
        id: trip,
        name: "Lisbon",
        day: "2026-11-09",
        by: false,
        time: null,
        window: "short",
        next: null,
        threadId: t,
        threadName: "Trips",
        threadIcon: "plane",
        threadHue: 6,
      },
      {
        of: "note",
        id: lands,
        name: "Ana lands at Gatwick",
        day: "2026-11-09",
        by: false,
        time: "21:40",
        window: "long",
        next: "2026-11-08",
        threadId: t,
        threadName: "Trips",
        threadIcon: "plane",
        threadHue: 6,
      },
      {
        of: "memory",
        id: meera,
        name: "Meera's birthday",
        day: "2026-11-30",
        by: false,
        time: null,
        window: "long",
        next: "2026-11-25",
        threadId: null,
        threadName: null,
        threadIcon: null,
        threadHue: null,
      },
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
    expect(section.rows.map((r) => [r.id, r.remindDay, r.remindBy, r.window])).toEqual([[visa, "2026-11-11", true, "long"]]);
  });

  it("follows How many even with the notifications off, and never a stopped thing", async () => {
    const me = await account({ notify_reminders: false, notify_reminder_count: 1 });
    const t = await thread([me]);
    // Low keeps the week out (the 25th), not the month out (the 2nd): not begun.
    await meeraOf(me);
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

  it("the column shows everything that has begun; nothing is held back as more", async () => {
    const me = await account();
    const t = await thread([me]);
    for (let n = 0; n < 23; n += 1) {
      const id = await row(me, t, `Form ${n}`, { day: "2026-11-04" }, { created_at: new Date(Date.UTC(2026, 0, 1, 0, n)) });
      await labelled(me, { contentId: id }, { kind: "deadline", lead: "days" });
    }
    const section = await todayReminders(me, NOW);
    expect(section.rows).toHaveLength(23);
    expect(section.more).toBe(0);
  });
});

describe("dismiss: this reminder, not the thing", () => {
  const LATER = new Date("2026-11-25T10:00:00Z"); // the week out's morning has gone

  it("hides the month out and leaves the week out to come, and Remind me stays on", async () => {
    const me = await account();
    const meera = await meeraOf(me);
    expect(await dismissReminder(me, { of: "memory", id: meera, day: "2026-11-30", window: "long" }, NOW)).toBe(true);
    expect((await todayReminders(me, NOW)).others).toEqual([]);
    const label = await db.selectFrom("reminder_labels").select("stopped_at").where("note_id", "=", meera).executeTakeFirstOrThrow();
    expect(label.stopped_at).toBeNull();

    // On the 25th the week out has begun: back, as that reminder.
    const back = (await todayReminders(me, LATER)).others;
    expect(back.map((one) => [one.id, one.window, one.next])).toEqual([[meera, "short", null]]);
    expect(await dismissReminder(me, { of: "memory", id: meera, day: "2026-11-30", window: "short" }, LATER)).toBe(true);
    expect((await todayReminders(me, LATER)).others).toEqual([]);
  });

  it("the same dismiss twice is one dismiss", async () => {
    const me = await account();
    const meera = await meeraOf(me);
    const once = { of: "memory" as const, id: meera, day: "2026-11-30", window: "long" as const };
    expect(await dismissReminder(me, once, NOW)).toBe(true);
    expect(await dismissReminder(me, once, NOW)).toBe(true);
    expect(await undismissReminder(me, once)).toBe(true);
    expect((await todayReminders(me, NOW)).others.map((one) => one.id)).toEqual([meera]);
  });

  it("Undo puts it back, and there is nothing to undo twice", async () => {
    const me = await account();
    const t = await thread([me]);
    const form = await row(me, t, "Submit the form", { day: "2026-11-04" });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    const which = { of: "content" as const, id: form, day: "2026-11-04", window: "short" as const };
    expect(await dismissReminder(me, which, NOW)).toBe(true);
    expect((await todayReminders(me, NOW)).rows).toEqual([]);
    expect(await undismissReminder(me, which)).toBe(true);
    expect((await todayReminders(me, NOW)).rows.map((r) => r.id)).toEqual([form]);
    expect(await undismissReminder(me, which)).toBe(false);
  });

  it("refuses a reminder that has not begun, a window that is not the one showing, and anybody else's thing", async () => {
    const me = await account();
    const ana = await account();
    const t = await thread([me, ana]);
    const form = await row(me, t, "Submit the form", { day: "2026-11-04" });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    const later = await row(me, t, "Renew the gym", { day: "2026-11-15" });
    await labelled(me, { contentId: later }, { kind: "deadline", lead: "days" });
    expect(await dismissReminder(me, { of: "content", id: later, day: "2026-11-15", window: "short" }, NOW)).toBe(false);
    expect(await dismissReminder(me, { of: "content", id: form, day: "2026-11-04", window: "day" }, NOW)).toBe(false);
    expect(await dismissReminder(me, { of: "content", id: form, day: "2026-11-05", window: "short" }, NOW)).toBe(false);
    expect(await dismissReminder(ana, { of: "content", id: form, day: "2026-11-04", window: "short" }, NOW)).toBe(false);
    expect(await dismissReminder(me, { of: "note", id: form, day: "2026-11-04", window: "short" }, NOW)).toBe(false);
    expect((await todayReminders(me, NOW)).rows.map((r) => r.id)).toEqual([form]);
    expect(await db.selectFrom("reminder_dismissals").select("id").execute()).toEqual([]);
  });

  it("is swept by the purge once its day is a week past, and not before", async () => {
    const me = await account();
    const t = await thread([me]);
    const form = await row(me, t, "Submit the form", { day: "2026-11-04" });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    await dismissReminder(me, { of: "content", id: form, day: "2026-11-04", window: "short" }, NOW);
    const past = await row(me, t, "Last year's form", { day: "2026-01-04" });
    await db.insertInto("reminder_dismissals").values({ account_id: me, content_id: past, occurrence: "2026-01-04", window_name: "day" } as never).execute();
    await handlers["content.purge"]!({}, { mailer: new MemoryMailer() }, null);
    expect((await db.selectFrom("reminder_dismissals").select("content_id").execute()).map((one) => one.content_id)).toEqual([form]);
  });

  it("goes with its thing, and with the account", async () => {
    const me = await account();
    const t = await thread([me]);
    const form = await row(me, t, "Submit the form", { day: "2026-11-04" });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    await dismissReminder(me, { of: "content", id: form, day: "2026-11-04", window: "short" }, NOW);
    await db.deleteFrom("content").where("id", "=", form).execute();
    expect(await db.selectFrom("reminder_dismissals").select("id").execute()).toEqual([]);
  });
});

describe("the routes", () => {
  it("the read is the session's own", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/today/reminders" })).statusCode).toBe(401);
    const me = await account();
    const response = await app.inject({ method: "GET", url: "/v1/today/reminders", headers: { cookie: await signIn(me) } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ rows: [], others: [], more: 0 });
  });

  it("dismiss and undismiss are POSTs of the session's own, 404 for anything that is not showing", async () => {
    const me = await account();
    const t = await thread([me]);
    // The routes read the clock, so: due the day after tomorrow, whose three
    // days out went yesterday morning and whose on the day is still to come.
    const soon = addUtcDays(dayIn(new Date(), "Europe/Lisbon"), 2);
    const form = await row(me, t, "Submit the form", { day: soon });
    await labelled(me, { contentId: form }, { kind: "deadline", lead: "days" });
    const body = { of: "content", id: form, day: soon, window: "short" };
    expect((await app.inject({ method: "POST", url: "/v1/today/reminders/dismiss", payload: body })).statusCode).toBe(401);
    const cookie = await signIn(me);
    const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: { cookie }, payload });
    expect((await post("/v1/today/reminders/dismiss", { ...body, extra: 1 })).statusCode).toBe(400);
    expect((await post("/v1/today/reminders/dismiss", { ...body, window: "week" })).statusCode).toBe(400);
    expect((await post("/v1/today/reminders/dismiss", { ...body, day: "2026-11-04T00:00" })).statusCode).toBe(400);
    expect((await post("/v1/today/reminders/undismiss", body)).statusCode).toBe(404);
    expect((await post("/v1/today/reminders/dismiss", { ...body, window: "day" })).statusCode).toBe(404);
    const dismissed = await post("/v1/today/reminders/dismiss", body);
    expect(dismissed.statusCode).toBe(200);
    expect(dismissed.json()).toEqual({ ok: true });
    expect((await app.inject({ method: "GET", url: "/v1/today/reminders", headers: { cookie } })).json().rows).toEqual([]);
    expect((await post("/v1/today/reminders/undismiss", body)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/today/reminders", headers: { cookie } })).json().rows.map((r: { id: string }) => r.id)).toEqual([form]);
    expect((await app.inject({ method: "GET", url: "/v1/today/reminders/dismiss", headers: { cookie } })).statusCode).toBe(404);
  });
});
