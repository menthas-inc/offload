// 2026-10-17 (the owner). What has passed archives itself: an event, a stay or
// a ticket once its last day is over in the author's clock, and the photos that
// came in the same dump with it. Never a to-do, however late, never a repeating
// row, and never a row somebody put back.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { archivePassed, PASSED_BATCH } from "../src/threads/passed.js";
import { setArchived } from "../src/routes/threads.js";
import { handlers } from "../src/jobs/handlers.js";
import { SCHEDULED } from "../src/jobs/schedule.js";

await migrate(() => {});
afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(zone: string | null = "Europe/Lisbon"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: "Ana", analytics_subject_id: uuidv7(), time_zone: zone } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string): Promise<string> {
  const row = await db.insertInto("threads").values({ created_by_account_id: accountId, name: "Weekend" }).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

async function message(accountId: string): Promise<string> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const row = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: uuidv7(), text: "", state: "answered" } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function row(accountId: string, threadId: string, over: Record<string, unknown>): Promise<string> {
  const made = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, title: "A row", type: "event", ...over } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.updateTable("threads").set({ content_count: (eb) => eb("content_count", "+", 1) }).where("id", "=", threadId).execute();
  return made.id;
}

const archived = async (id: string) =>
  (await db.selectFrom("content").select("archived_at").where("id", "=", id).executeTakeFirstOrThrow()).archived_at !== null;
const count = async (id: string) =>
  (await db.selectFrom("threads").select("content_count").where("id", "=", id).executeTakeFirstOrThrow()).content_count;

// 2026-10-17 at 00:30 in Lisbon, which is still the 16th in UTC.
const NOW = new Date("2026-10-16T23:30:00Z");
const allDay = { all_day: true };

describe("what has passed archives itself", () => {
  it("archives an event once its last day is over in the author's clock, and keeps one still on", async () => {
    const me = await account();
    const th = await thread(me);
    const yesterday = await row(me, th, { occurs_at: new Date("2026-10-16T12:00:00Z"), attrs: allDay });
    const tonight = await row(me, th, { occurs_at: new Date("2026-10-16T20:00:00Z") });
    const today = await row(me, th, { occurs_at: new Date("2026-10-17T12:00:00Z"), attrs: allDay });
    const stay = await row(me, th, { type: "location", occurs_at: new Date("2026-10-14T12:00:00Z"), occurs_end_at: new Date("2026-10-17T12:00:00Z"), attrs: allDay });

    expect(await archivePassed(NOW)).toMatchObject({ archived: 2 });
    expect(await archived(yesterday)).toBe(true);
    expect(await archived(tonight)).toBe(true);
    expect(await archived(today)).toBe(false);
    expect(await archived(stay)).toBe(false);
    expect(await count(th)).toBe(2);
  });

  it("reads a timed row's day in the author's zone, not UTC", async () => {
    const tokyo = await account("Asia/Tokyo");
    const th = await thread(tokyo);
    // 20:00 on the 16th in UTC is 05:00 on the 17th in Tokyo, which is today there.
    const id = await row(tokyo, th, { occurs_at: new Date("2026-10-16T20:00:00Z") });
    await archivePassed(NOW);
    expect(await archived(id)).toBe(false);
  });

  it("never archives a to-do, a repeating row or an undated one", async () => {
    const me = await account();
    const th = await thread(me);
    const late = await row(me, th, { type: "task", due_at: new Date("2026-10-01T12:00:00Z"), attrs: allDay });
    const span = await row(me, th, { type: "task", occurs_at: new Date("2026-10-01T12:00:00Z"), occurs_end_at: new Date("2026-10-02T12:00:00Z"), due_at: new Date("2026-10-02T12:00:00Z"), attrs: allDay });
    const weekly = await row(me, th, { occurs_at: new Date("2026-10-01T18:00:00Z"), rrule: "FREQ=WEEKLY" });
    const link = await row(me, th, { type: "link" });
    await archivePassed(NOW);
    for (const id of [late, span, weekly, link]) expect(await archived(id)).toBe(false);
  });

  it("takes the undated photos and files of the same dump with it, and nothing else from it", async () => {
    const me = await account();
    const th = await thread(me);
    const dump = await message(me);
    const ticket = await row(me, th, { occurs_at: new Date("2026-10-15T19:00:00Z"), derived_from_message_id: dump });
    const photo = await row(me, th, { type: "image", derived_from_message_id: dump });
    const pdf = await row(me, th, { type: "file", derived_from_message_id: dump });
    const task = await row(me, th, { type: "task", derived_from_message_id: dump });
    const other = await row(me, th, { type: "image", derived_from_message_id: await message(me) });
    expect(await archivePassed(NOW)).toMatchObject({ archived: 3 });
    expect([await archived(ticket), await archived(photo), await archived(pdf)]).toEqual([true, true, true]);
    expect([await archived(task), await archived(other)]).toEqual([false, false]);
    expect(await count(th)).toBe(2);
  });

  it("keeps a dump's photo while another row from it is still ahead, and takes it with the last one", async () => {
    // S39. A listing filed as two events: the photo goes in December, not October.
    const me = await account();
    const th = await thread(me);
    const dump = await message(me);
    const first = await row(me, th, { occurs_at: new Date("2026-10-15T19:00:00Z"), derived_from_message_id: dump });
    const second = await row(me, th, { occurs_at: new Date("2026-12-12T19:00:00Z"), derived_from_message_id: dump });
    const photo = await row(me, th, { type: "image", derived_from_message_id: dump });
    await archivePassed(NOW);
    expect([await archived(first), await archived(photo)]).toEqual([true, false]);

    await archivePassed(new Date("2026-12-14T12:00:00Z"));
    expect([await archived(second), await archived(photo)]).toEqual([true, true]);
  });

  it("leaves a row somebody put back where they put it", async () => {
    const me = await account();
    const th = await thread(me);
    const id = await row(me, th, { occurs_at: new Date("2026-10-10T12:00:00Z"), attrs: allDay });
    await archivePassed(NOW);
    await setArchived(me, id, false);
    expect(await archived(id)).toBe(false);
    await archivePassed(NOW);
    expect(await archived(id)).toBe(false);
  });

  it("does not count a deleted row, and reads an account with no zone as UTC", async () => {
    const me = await account(null);
    const th = await thread(me);
    const gone = await row(me, th, { occurs_at: new Date("2026-10-10T12:00:00Z"), deleted_at: new Date(), attrs: allDay });
    const utc = await row(me, th, { occurs_at: new Date("2026-10-15T23:00:00Z") });
    expect(await archivePassed(NOW)).toMatchObject({ archived: 1 });
    expect(await archived(gone)).toBe(false);
    expect(await archived(utc)).toBe(true);
  });

  it("archives a shared thread's passed row once, by its author's clock, and never pairs rows with no message", async () => {
    const me = await account();
    const ana = await account("Asia/Tokyo");
    const th = await thread(me);
    await db.insertInto("thread_members").values({ thread_id: th, account_id: ana, state: "accepted" }).execute();
    const mine = await row(me, th, { occurs_at: new Date("2026-10-16T12:00:00Z"), attrs: allDay });
    // Ana's row is timed, 20:00 UTC on the 16th, which is the 17th in Tokyo.
    const hers = await row(ana, th, { occurs_at: new Date("2026-10-16T20:00:00Z") });
    const loose = await row(me, th, { type: "image" });
    expect(await archivePassed(NOW)).toMatchObject({ archived: 1, threads: 1 });
    expect([await archived(mine), await archived(hers), await archived(loose)]).toEqual([true, false, false]);
  });

  it("works a batch at a time and says when there is more", async () => {
    const me = await account();
    const th = await thread(me);
    for (let i = 0; i < 3; i += 1) await row(me, th, { occurs_at: new Date("2026-10-10T12:00:00Z"), attrs: allDay });
    expect(await archivePassed(NOW, 2)).toMatchObject({ archived: 2, more: true });
    expect(await archivePassed(NOW, 2)).toMatchObject({ archived: 1, more: false });
    expect(await count(th)).toBe(0);
    expect(PASSED_BATCH).toBeGreaterThan(100);
  });

  it("is not stopped by an odd value where a flag is read", async () => {
    const me = await account();
    const th = await thread(me);
    const id = await row(me, th, { occurs_at: new Date("2026-10-10T12:00:00Z"), attrs: { all_day: "maybe", put_back: "maybe" } });
    await archivePassed(NOW);
    expect(await archived(id)).toBe(true);
  });

  it("is not kept out by offload's own put back, only a person's", async () => {
    const me = await account();
    const th = await thread(me);
    const id = await row(me, th, { occurs_at: new Date("2026-10-10T12:00:00Z"), attrs: allDay, archived_at: new Date() });
    await setArchived(me, id, false, { byPerson: false });
    await archivePassed(NOW);
    expect(await archived(id)).toBe(true);
  });

  it("runs hourly from the api, with a registry row", () => {
    expect(handlers["content.passed"]).toBeTypeOf("function");
    expect(SCHEDULED.find((one) => one.kind === "content.passed")).toMatchObject({ cadence: "hourly", runner: "api" });
  });
});
