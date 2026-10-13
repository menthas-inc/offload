// 2026-10-10, a tweak to 024 and 042: the morning send names the day's events
// on the account's own calendars, and a dumped row offload wrote to a
// calendar keeps its reminders. The calendar's titles leave with the
// calendar: a record that named one goes when it is disconnected or unticked.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { composeDigest, runDigest } from "../src/notifications/digest.js";
import { anchorsFor, wantedLabels } from "../src/notifications/labels.js";
import { scheduleOwn } from "../src/notifications/own.js";
import { MemoryPush, push } from "../src/notifications/push.js";
import { revokeAndForget } from "../src/connectors/tokens.js";
import { record } from "../src/notifications/activity.js";
import { calendar, calendarEvent, connection } from "./today-kit.js";
import { buildApp } from "../src/app.js";
import { account, label, row, signIn, thread, token, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const memoryPush = push() as MemoryPush;

beforeEach(async () => {
  await wipe();
  memoryPush.sent.length = 0;
});

const DAY = "2026-11-02"; // Monday; Lisbon is UTC+0
const MORNING = new Date(`${DAY}T08:00:00Z`);
const SOON = new Date(`${DAY}T08:00:10Z`);
const LONG_AGO = new Date("2026-06-01T00:00:00Z");

async function myCalendar(me: string, over: { selected?: boolean } = {}) {
  return calendar(await connection(me), over);
}

const records = (me: string) => db.selectFrom("activity").select(["title", "body", "sent"]).where("account_id", "=", me).execute();

describe("the morning names the day's calendar events", () => {
  it("at their hours, with what offload reminds about, in the order of the day", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    await row(me, t, "Pay the rent", { day: DAY }, { is_reminder: true });
    const work = await myCalendar(me);
    await calendarEvent(me, work, "Dentist", `${DAY}T15:00:00Z`);
    await calendarEvent(me, work, "Standup", `${DAY}T09:00:00Z`);
    await calendarEvent(me, work, "Lunch with Ana", `${DAY}T13:00:00Z`);
    expect(await runDigest(me, "morning", DAY, MORNING, SOON)).toBe("sent");
    expect(memoryPush.sent.map((m) => [m.title, m.body])).toEqual([
      ["Four today", "Pay the rent, Standup at 9:00, Lunch with Ana at 13:00, and Dentist at 15:00."],
    ]);
  });

  it("sends for the calendar alone, with no verbs", async () => {
    const me = await account();
    await token(me);
    await calendarEvent(me, await myCalendar(me), "Standup", `${DAY}T09:00:00Z`);
    expect(await runDigest(me, "morning", DAY, MORNING, SOON)).toBe("sent");
    expect(memoryPush.sent.map((m) => [m.title, m.body, m.categoryId, m.data])).toEqual([
      ["One today", "Standup at 9:00.", "digest", { kind: "digest", send: "morning" }],
    ]);
  });

  it("only the morning, only today, only the account's own part of its ticked calendars", async () => {
    const me = await account();
    const other = await account();
    await token(me);
    const work = await myCalendar(me);
    const unticked = await myCalendar(me, { selected: false });
    const gone = await connection(me, { deleted_at: new Date() });
    await calendarEvent(me, work, "Tomorrow's standup", `2026-11-03T09:00:00Z`);
    await calendarEvent(me, work, "Somebody else's", `${DAY}T10:00:00Z`, { createdByMe: false, invitedMe: false });
    await calendarEvent(me, unticked, "Unticked", `${DAY}T10:00:00Z`);
    await calendarEvent(me, await calendar(gone), "Disconnected", `${DAY}T10:00:00Z`);
    await calendarEvent(other, await myCalendar(other), "Theirs", `${DAY}T10:00:00Z`);
    expect((await composeDigest(me, "morning", DAY, MORNING)).rows).toEqual([]);
    await calendarEvent(me, work, "Wednesday standup", `2026-11-03T09:00:00Z`);
    expect((await composeDigest(me, "evening", DAY, MORNING)).rows).toEqual([]);
    expect(await runDigest(me, "evening", DAY, new Date(`${DAY}T19:00:00Z`), new Date(`${DAY}T19:00:10Z`))).toBe("empty");
  });

  it("an invite only once you said yes or maybe, never one unanswered or not read yet", async () => {
    const me = await account();
    await token(me);
    const work = await myCalendar(me);
    await calendarEvent(me, work, "offload: storage full", `${DAY}T09:00:00Z`, { createdByMe: false, invitedMe: true, going: false });
    await calendarEvent(me, work, "Not read yet", `${DAY}T10:00:00Z`, { createdByMe: null, invitedMe: null, going: null });
    expect(await runDigest(me, "morning", DAY, MORNING, SOON)).toBe("empty");
    await calendarEvent(me, work, "Design review", `${DAY}T11:00:00Z`, { createdByMe: false, invitedMe: true, going: true });
    await runDigest(me, "morning", DAY, MORNING, SOON);
    expect(memoryPush.sent.map((m) => m.body)).toEqual(["Design review at 11:00."]);
  });

  it("nothing from a connection whose access was revoked at Google", async () => {
    const me = await account();
    await token(me);
    await calendarEvent(me, await calendar(await connection(me, { state: "needs_reauth" })), "Standup", `${DAY}T09:00:00Z`);
    expect(await runDigest(me, "morning", DAY, MORNING, SOON)).toBe("empty");
  });

  it("a title somebody else wrote is one line, bounded, with no dash and no hidden marks", async () => {
    const me = await account();
    await token(me);
    const hostile = `Sync \u2014 with \u202eAna\u202c\n${"x".repeat(300)}`;
    await calendarEvent(me, await myCalendar(me), hostile, `${DAY}T09:00:00Z`);
    await runDigest(me, "morning", DAY, MORNING, SOON);
    const body = memoryPush.sent[0]!.body;
    expect(body).not.toMatch(/[\u2013\u2014\u202e\u202c\n]/);
    expect(body.startsWith("Sync, with Ana x")).toBe(true);
    expect(body.length).toBeLessThanOrEqual(240);
  });

  it("an all-day event first, by its name alone", async () => {
    const me = await account();
    await token(me);
    const work = await myCalendar(me);
    await calendarEvent(me, work, "Standup", `${DAY}T09:00:00Z`);
    await calendarEvent(me, work, "Ana's birthday", `${DAY}T00:00:00Z`, { allDay: true, end: `2026-11-03T00:00:00Z` });
    await runDigest(me, "morning", DAY, MORNING, SOON);
    expect(memoryPush.sent.map((m) => m.body)).toEqual(["Ana's birthday, and Standup at 9:00."]);
  });

  it("a dumped row offload wrote to the calendar is named once", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    const work = await myCalendar(me);
    const ref = `${work.external}:evt-dentist`;
    await row(me, t, "Dentist", { at: new Date(`${DAY}T15:00:00Z`) }, { type: "event", is_reminder: true, source_ref: ref });
    await calendarEvent(me, work, "Dentist", `${DAY}T15:00:00Z`, { sourceRef: ref });
    await runDigest(me, "morning", DAY, MORNING, SOON);
    expect(memoryPush.sent.map((m) => [m.title, m.body])).toEqual([["One today", "Dentist at 15:00."]]);
  });

  it("a written row the send does not name is named by its calendar's copy", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    const work = await myCalendar(me);
    const ref = `${work.external}:evt-standup`;
    await row(me, t, "Standup", { at: new Date(`${DAY}T15:00:00Z`) }, { type: "event", source_ref: ref });
    await calendarEvent(me, work, "Standup", `${DAY}T15:00:00Z`, { sourceRef: ref });
    await runDigest(me, "morning", DAY, MORNING, SOON);
    expect(memoryPush.sent.map((m) => m.body)).toEqual(["Standup at 15:00."]);
  });

  it("follows the Calendar switch alone: Due today off still names them", async () => {
    const me = await account({ notify_due_today: false });
    await token(me);
    const t = await thread([me]);
    await row(me, t, "Pay the rent", { day: DAY }, { is_reminder: true });
    await calendarEvent(me, await myCalendar(me), "Standup", `${DAY}T09:00:00Z`);
    expect(await runDigest(me, "morning", DAY, MORNING, SOON)).toBe("sent");
    expect(memoryPush.sent.map((m) => [m.title, m.body])).toEqual([["One today", "Standup at 9:00."]]);
  });

  it("Calendar off: the events are not there, and a day of only events is empty", async () => {
    const me = await account({ notify_calendar: false });
    await token(me);
    await calendarEvent(me, await myCalendar(me), "Standup", `${DAY}T09:00:00Z`);
    expect(await runDigest(me, "morning", DAY, MORNING, SOON)).toBe("empty");
    expect(await records(me)).toEqual([]);
    await row(me, await thread([me]), "Pay the rent", { day: DAY }, { is_reminder: true });
    await runDigest(me, "morning", DAY, MORNING, SOON);
    expect(memoryPush.sent.map((m) => m.body)).toEqual(["Pay the rent."]);
  });

  it("a written row Due today holds back is named by its calendar's copy", async () => {
    const me = await account({ notify_due_today: false, notify_reminders: false });
    await token(me);
    const t = await thread([me]);
    const work = await myCalendar(me);
    const ref = `${work.external}:evt-dentist`;
    await row(me, t, "Dentist", { at: new Date(`${DAY}T15:00:00Z`) }, { type: "event", is_reminder: true, source_ref: ref });
    await calendarEvent(me, work, "Dentist", `${DAY}T15:00:00Z`, { sourceRef: ref });
    await runDigest(me, "morning", DAY, MORNING, SOON);
    expect(memoryPush.sent.map((m) => m.body)).toEqual(["Dentist at 15:00."]);
  });

  it("the events carry counts, never a title", async () => {
    const me = await account();
    await token(me);
    await calendarEvent(me, await myCalendar(me), "Standup", `${DAY}T09:00:00Z`);
    await runDigest(me, "morning", DAY, MORNING, SOON);
    const events = await db.selectFrom("analytics_events").select(["name", "properties"]).where("name", "=", "digest_sent").execute();
    expect(events.map((e) => e.properties)).toEqual([{ send: "morning", rows: 0, overdue: 0, events: 1 }]);
  });

  it("names what is due first, so a busy calendar never pushes it out", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    const work = await myCalendar(me);
    for (const hour of ["09", "10", "11", "13", "14", "15"]) await calendarEvent(me, work, `Meeting ${hour}`, `${DAY}T${hour}:00:00Z`);
    await row(me, t, "Pay the rent", { at: new Date(`${DAY}T16:00:00Z`) }, { is_reminder: true });
    await runDigest(me, "morning", DAY, MORNING, SOON);
    expect(memoryPush.sent.map((m) => [m.title, m.body])).toEqual([["Seven today", "Pay the rent, Meeting 09 at 9:00, and five more."]]);
  });
});

describe("the Calendar switch", () => {
  it("is on until changed", async () => {
    const app = await buildApp();
    try {
      const cookie = await signIn(await account());
      expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json()).toMatchObject({ notifyCalendar: true });
      const off = await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie }, payload: { notifyCalendar: false } });
      expect(off.json()).toMatchObject({ notifyCalendar: false, notifyReminders: true });
    } finally {
      await app.close();
    }
  });
});

describe("a calendar's titles leave with the calendar", () => {
  async function sentWith(me: string) {
    await token(me);
    const conn = await connection(me);
    const work = await calendar(conn);
    await calendarEvent(me, work, "Standup", `${DAY}T09:00:00Z`);
    await runDigest(me, "morning", DAY, MORNING, SOON);
    return { conn, work };
  }

  it("a record that named an event goes when its calendar is disconnected", async () => {
    const me = await account();
    const { conn } = await sentWith(me);
    expect(await records(me)).toEqual([{ title: "One today", body: "Standup at 9:00.", sent: true }]);
    await revokeAndForget(conn);
    expect(await records(me)).toEqual([]);
  });

  it("and when it is unticked", async () => {
    const me = await account();
    const { work } = await sentWith(me);
    await db.updateTable("connector_calendars").set({ selected: false }).where("id", "=", work.id).execute();
    expect(await records(me)).toEqual([]);
  });

  it("no record when the calendar went before it was written", async () => {
    const me = await account();
    const conn = await connection(me);
    const gone = await calendar(conn);
    await db.deleteFrom("connector_calendars").where("id", "=", gone.id).execute();
    await record(me, { kind: "digest", sent: true, title: "One today", body: "Standup at 9:00.", send: "morning", calendars: [gone.id] });
    expect(await records(me)).toEqual([]);
  });

  it("a record that named nothing from it stays", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    await row(me, t, "Pay the rent", { day: DAY }, { is_reminder: true });
    const conn = await connection(me);
    await calendar(conn);
    await runDigest(me, "morning", DAY, MORNING, SOON);
    await revokeAndForget(conn);
    expect(await records(me)).toHaveLength(1);
  });
});

describe("a dumped row offload wrote to a calendar keeps its reminders", () => {
  const SOONER = "2099-11-12";

  it("is labelled and can be a task's anchor; a calendar's own row is neither", async () => {
    const me = await account();
    const t = await thread([me]);
    const written = await row(me, t, "Flight to Lisbon", { day: SOONER }, { type: "event", source_ref: "cal-1:evt-1" });
    await row(me, t, "From the calendar", { day: SOONER }, { type: "event", source: "calendar", source_ref: "cal-1:evt-2" });
    expect((await wantedLabels(db, me, t)).map((one) => one.id)).toEqual([written]);
    expect((await anchorsFor(db, t)).map((one) => one.id)).toEqual([written]);
  });

  it("gets its reminder of its own before the meeting", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    const id = await row(me, t, "Standup", { at: new Date("2026-11-02T15:00:00Z") }, { type: "event", source_ref: "cal-1:evt-1" });
    await label(me, { contentId: id }, { kind: "meeting", lead: "none", labelled_at: LONG_AGO, date_set_at: LONG_AGO });
    expect(await scheduleOwn(new Date("2026-11-02T14:10:00Z"))).toBe(1);
  });

  it("is named in the morning as a reminder", async () => {
    const me = await account();
    await token(me);
    const t = await thread([me]);
    await row(me, t, "Pay the rent", { day: DAY }, { is_reminder: true, source_ref: "cal-1:evt-1" });
    await row(me, t, "From the calendar", { day: DAY }, { is_reminder: true, source: "calendar", source_ref: "cal-1:evt-2" });
    expect((await composeDigest(me, "morning", DAY, MORNING)).rows.map((one) => one.title)).toEqual(["Pay the rent"]);
  });
});
