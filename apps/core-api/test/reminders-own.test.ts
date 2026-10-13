// 042 E3: a reminder of its own, shortly before something with a clock time.
// Placed by the hourly pass at most an hour ahead, once per thing, occurrence
// and window; re-checked when it runs; dropped late; sent only to a phone
// that can draw it, with ids and a closed kind and nothing else. (AC-11,
// AC-12, AC-15, AC-16, AC-17)

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { runOwn, scheduleOwn } from "../src/notifications/own.js";
import { MemoryPush, push } from "../src/notifications/push.js";
import { account, label, row, thread, token, wipe } from "./reminders-kit.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const memoryPush = push() as MemoryPush;

beforeEach(async () => {
  await wipe();
  memoryPush.sent.length = 0;
});

const LONG_AGO = new Date("2026-06-01T00:00:00Z");
/** 14:10 in Lisbon on Monday 2 November (UTC+0). */
const NOW = new Date("2026-11-02T14:10:00Z");

async function standup(me: string, at = new Date("2026-11-02T15:00:00Z"), over: Record<string, unknown> = {}) {
  const t = await thread([me]);
  const id = await row(me, t, "Standup", { at }, { type: "event", ...over });
  return { t, id };
}

const placedJobs = () =>
  db.selectFrom("jobs").select(["payload", "run_after", "idempotency_key", "account_id"]).where("kind", "=", "reminder.own").execute();

describe("the hourly pass", () => {
  it("places a reminder that falls in the coming hour, once, with ids and no words", async () => {
    const me = await account();
    const { id } = await standup(me);
    await label(me, { contentId: id }, { kind: "meeting", lead: "none", labelled_at: LONG_AGO, date_set_at: LONG_AGO });
    expect(await scheduleOwn(NOW)).toBe(1);
    expect(await scheduleOwn(NOW)).toBe(1);
    const jobs = await placedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.run_after.toISOString()).toBe("2026-11-02T14:45:00.000Z");
    expect(jobs[0]!.idempotency_key).toBe(`reminder.own:${id}:2026-11-02:day`);
    expect(jobs[0]!.payload).toEqual({ of: "content", id, occurrence: "2026-11-02", at: "2026-11-02T14:45:00.000Z" });
    expect(JSON.stringify(jobs[0]!.payload)).not.toContain("Standup");
  });

  it("places nothing outside the hour, and nothing with Reminders off", async () => {
    const me = await account();
    const { id } = await standup(me, new Date("2026-11-02T18:00:00Z"));
    await label(me, { contentId: id }, { kind: "meeting", lead: "none", labelled_at: LONG_AGO });
    const off = await account({ notify_reminders: false });
    const { id: theirs } = await standup(off);
    await label(off, { contentId: theirs }, { kind: "meeting", lead: "none", labelled_at: LONG_AGO });
    expect(await scheduleOwn(NOW)).toBe(0);
  });

  it("places the default for a timed row no pass has labelled", async () => {
    const me = await account();
    await standup(me, new Date("2026-11-02T15:00:00Z"));
    expect(await scheduleOwn(NOW)).toBe(1);
    expect((await placedJobs())[0]!.run_after.toISOString()).toBe("2026-11-02T14:30:00.000Z");
  });
});

describe("the reminder, when it runs", () => {
  async function placedFor(me: string) {
    const { t, id } = await standup(me);
    await label(me, { contentId: id }, { kind: "meeting", lead: "none", labelled_at: LONG_AGO, date_set_at: LONG_AGO });
    await scheduleOwn(NOW);
    const [job] = await placedJobs();
    return { t, id, payload: job!.payload as Record<string, unknown> };
  }
  const at = new Date("2026-11-02T14:45:00Z");

  it("sends to the phones that take one, on the reminders channel, and records it", async () => {
    const me = await account();
    await token(me);
    await token(me, false);
    const { t, id, payload } = await placedFor(me);
    expect(await runOwn(me, payload, at)).toBe("sent");
    expect(memoryPush.sent).toHaveLength(1);
    expect(memoryPush.sent[0]).toMatchObject({
      title: "In 15 minutes",
      body: "Standup at 15:00.",
      channelId: "reminders",
      data: { kind: "reminder", threadId: t, contentId: id },
    });
    expect(Object.keys(memoryPush.sent[0]!.data as object).sort()).toEqual(["contentId", "kind", "threadId"]);
    const records = await db.selectFrom("activity").select(["kind", "sent", "title", "body", "thread_id", "content_id"]).where("account_id", "=", me).execute();
    expect(records).toEqual([{ kind: "reminder", sent: true, title: "In 15 minutes", body: "Standup at 15:00.", thread_id: t, content_id: id }]);
  });

  it("is dropped when the thing was ticked, moved, stopped, or its thread left since", async () => {
    for (const change of ["done", "moved", "stopped", "left"] as const) {
      await wipe();
      memoryPush.sent.length = 0;
      const me = await account();
      await token(me);
      const { t, id, payload } = await placedFor(me);
      if (change === "done") await db.updateTable("content").set({ done_at: new Date() }).where("id", "=", id).execute();
      if (change === "moved") await db.updateTable("content").set({ occurs_at: new Date("2026-11-02T17:00:00Z") }).where("id", "=", id).execute();
      if (change === "stopped") await db.updateTable("reminder_labels").set({ stopped_at: new Date() }).where("content_id", "=", id).execute();
      if (change === "left") await db.updateTable("thread_members").set({ state: "left" } as never).where("thread_id", "=", t).execute();
      expect(await runOwn(me, payload, at), change).toBe("gone");
      expect(memoryPush.sent, change).toEqual([]);
    }
  });

  it("is dropped more than 15 minutes late, and sends nothing with Reminders off", async () => {
    const me = await account();
    await token(me);
    const { payload } = await placedFor(me);
    expect(await runOwn(me, payload, new Date("2026-11-02T15:01:00Z"))).toBe("late");
    await db.updateTable("accounts").set({ notify_reminders: false } as never).where("id", "=", me).execute();
    expect(await runOwn(me, payload, at)).toBe("gone");
    expect(memoryPush.sent).toEqual([]);
    expect(await db.selectFrom("activity").select("id").where("account_id", "=", me).execute()).toEqual([]);
  });

  it("reaches no phone whose session has expired", async () => {
    const me = await account();
    await token(me);
    await db.updateTable("sessions").set({ expires_at: new Date(Date.now() - 60_000) }).where("account_id", "=", me).execute();
    const { payload } = await placedFor(me);
    expect(await runOwn(me, payload, at)).toBe("skipped_permission");
    expect(memoryPush.sent).toEqual([]);
  });

  it("with no phone that takes one, is recorded as not sent by permission", async () => {
    const me = await account();
    await token(me, false);
    const { payload } = await placedFor(me);
    expect(await runOwn(me, payload, at)).toBe("skipped_permission");
    expect(memoryPush.sent).toEqual([]);
    const [record] = await db.selectFrom("activity").select(["kind", "sent", "reason"]).where("account_id", "=", me).execute();
    expect(record).toEqual({ kind: "reminder", sent: false, reason: "permission" });
  });
});
