// A tick on a repeating task is this time done, not the series. The row moves
// to its next date, and Undo puts it back where it was. Amends 023.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { completeContent } from "../src/routes/threads.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

let accountId: string;
let threadId: string;

beforeEach(async () => {
  const account = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7(), time_zone: "America/New_York" })
    .returning("id")
    .executeTakeFirstOrThrow();
  accountId = account.id;
  const thread = await db.insertInto("threads").values({ created_by_account_id: accountId, name: "Home" }).returning("id").executeTakeFirstOrThrow();
  threadId = thread.id;
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state: "accepted" }).execute();
});

async function task(due: string, rrule: string | null, attrs: object = { all_day: true }): Promise<string> {
  const row = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, type: "task", title: "Pay mortgage", due_at: new Date(due), rrule, attrs: JSON.stringify(attrs) } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

const read = (id: string) => db.selectFrom("content").select(["due_at", "occurs_at", "rrule", "done_at", "attrs"]).where("id", "=", id).executeTakeFirstOrThrow();

describe("ticking a repeating task", () => {
  it("moves it to the next date and leaves it open", async () => {
    const id = await task("2026-11-05T12:00:00Z", "FREQ=MONTHLY");
    await completeContent(accountId, id, true, new Date("2026-11-05T15:00:00Z"));
    const row = await read(id);
    expect(row.done_at).toBeNull();
    expect(row.due_at?.toISOString()).toBe("2026-12-05T12:00:00.000Z");
    expect(row.rrule).toBe("FREQ=MONTHLY");
  });

  it("paid early takes this month's and not next month's", async () => {
    const id = await task("2026-11-05T12:00:00Z", "FREQ=MONTHLY");
    await completeContent(accountId, id, true, new Date("2026-11-02T15:00:00Z"));
    expect((await read(id)).due_at?.toISOString()).toBe("2026-12-05T12:00:00.000Z");
  });

  it("a row that fell behind lands on the next date still to come", async () => {
    const id = await task("2026-08-05T12:00:00Z", "FREQ=MONTHLY");
    await completeContent(accountId, id, true, new Date("2026-11-06T15:00:00Z"));
    expect((await read(id)).due_at?.toISOString()).toBe("2026-12-05T12:00:00.000Z");
  });

  it("keeps its clock time across a clock change", async () => {
    // 09:00 in New York is 13:00Z in October and 14:00Z in November.
    const id = await task("2026-10-30T13:00:00Z", "FREQ=WEEKLY", {});
    await completeContent(accountId, id, true, new Date("2026-10-30T15:00:00Z"));
    expect((await read(id)).due_at?.toISOString()).toBe("2026-11-06T14:00:00.000Z");
  });

  it("the 31st stays the 31st after a short month", async () => {
    const id = await task("2027-01-31T12:00:00Z", "FREQ=MONTHLY");
    await completeContent(accountId, id, true, new Date("2027-01-31T15:00:00Z"));
    expect((await read(id)).due_at?.toISOString()).toBe("2027-02-28T12:00:00.000Z");
    await completeContent(accountId, id, true, new Date("2027-02-28T15:00:00Z"));
    expect((await read(id)).due_at?.toISOString()).toBe("2027-03-31T12:00:00.000Z");
  });

  it("a counted rule keeps its last date", async () => {
    const id = await task("2026-11-02T12:00:00Z", "FREQ=WEEKLY;COUNT=3");
    await completeContent(accountId, id, true, new Date("2026-11-02T15:00:00Z"));
    const row = await read(id);
    expect(row.due_at?.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(row.rrule).toBe("FREQ=WEEKLY;COUNT=2");
  });

  it("the last occurrence is done for good", async () => {
    const id = await task("2026-11-02T12:00:00Z", "FREQ=WEEKLY;COUNT=1");
    await completeContent(accountId, id, true, new Date("2026-11-02T15:00:00Z"));
    expect((await read(id)).done_at).not.toBeNull();
  });

  it("a row that moves its second date with it, as one on a calendar has", async () => {
    const id = await task("2026-11-05T12:00:00Z", "FREQ=MONTHLY");
    await db.updateTable("content").set({ occurs_at: new Date("2026-11-05T12:00:00Z") }).where("id", "=", id).execute();
    await completeContent(accountId, id, true, new Date("2026-11-05T15:00:00Z"));
    expect((await read(id)).occurs_at?.toISOString()).toBe("2026-12-05T12:00:00.000Z");
  });

  it("Undo puts the date and the rule back", async () => {
    const id = await task("2026-11-02T12:00:00Z", "FREQ=WEEKLY;COUNT=3");
    await completeContent(accountId, id, true, new Date("2026-11-02T15:00:00Z"));
    await completeContent(accountId, id, false, new Date("2026-11-02T15:00:05Z"));
    const row = await read(id);
    expect(row.done_at).toBeNull();
    expect(row.due_at?.toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(row.rrule).toBe("FREQ=WEEKLY;COUNT=3");
    expect(row.attrs).toEqual({ all_day: true });
  });

  it("Undo leaves a date somebody set since alone", async () => {
    const id = await task("2026-11-05T12:00:00Z", "FREQ=MONTHLY");
    await completeContent(accountId, id, true, new Date("2026-11-05T15:00:00Z"));
    await db.updateTable("content").set({ due_at: new Date("2026-12-09T12:00:00Z") }).where("id", "=", id).execute();
    await completeContent(accountId, id, false, new Date("2026-11-05T16:00:00Z"));
    expect((await read(id)).due_at?.toISOString()).toBe("2026-12-09T12:00:00.000Z");
  });

  it("a task with no rule is still done", async () => {
    const id = await task("2026-11-05T12:00:00Z", null);
    await completeContent(accountId, id, true, new Date("2026-11-05T15:00:00Z"));
    expect((await read(id)).done_at).not.toBeNull();
  });
});
