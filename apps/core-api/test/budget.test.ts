// What one account may spend on the model in a day.
//
// Security review 2026-09-22, M6. Photos and voice notes had daily caps and a
// text dump had none, and each one is a model call. The ledger already prices
// every call; this reads it before another is enqueued.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { DAILY_MODEL_BUDGET_MICROS, OverBudget, spentToday } from "../src/budget.js";
import { takeDump } from "../src/routes/dumps.js";
import { quickAdd } from "../src/routes/threads.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  const thread = await db
    .insertInto("threads")
    .values({ created_by_account_id: row.id, name: "Miscellaneous", always_on: true, updated_at: new Date() })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: thread.id, account_id: row.id, state: "accepted" }).execute();
  await db.updateTable("accounts").set({ default_thread_id: thread.id }).where("id", "=", row.id).execute();
  return row.id;
}

async function spend(accountId: string, micros: number, hoursAgo = 0): Promise<void> {
  await db
    .insertInto("llm_usage")
    .values({
      account_id: accountId,
      job_kind: "dump.answer",
      category: "interactive",
      model: "claude-sonnet-5",
      cost_micros: micros,
      created_at: sql`now() - make_interval(hours => ${hoursAgo})`,
    })
    .execute();
}

describe("the daily model budget", () => {
  it("counts the last twenty four hours and nothing older", async () => {
    const me = await account();
    await spend(me, 1_000_000);
    await spend(me, 2_000_000, 23);
    await spend(me, 9_000_000, 25);
    expect(await spentToday(me)).toBe(3_000_000);
  });

  it("refuses a dump once the day's budget is spent, and only for that account", async () => {
    const me = await account();
    const other = await account();
    await spend(me, DAILY_MODEL_BUDGET_MICROS);

    await expect(takeDump(me, "milk")).rejects.toBeInstanceOf(OverBudget);
    expect(await db.selectFrom("messages").select("id").where("account_id", "=", me).execute()).toHaveLength(0);

    const theirs = await takeDump(other, "milk");
    expect(theirs.messageId).toBeTruthy();
  });

  it("refuses a row typed into a thread the same way", async () => {
    const me = await account();
    const thread = (await db.selectFrom("threads").select("id").executeTakeFirstOrThrow()).id;
    await spend(me, DAILY_MODEL_BUDGET_MICROS);
    await expect(quickAdd(me, thread, "brackets", "todo")).rejects.toBeInstanceOf(OverBudget);
  });

  it("lets the day's first dump through when the ledger is just under", async () => {
    const me = await account();
    await spend(me, DAILY_MODEL_BUDGET_MICROS - 1);
    const sent = await takeDump(me, "milk");
    expect(sent.messageId).toBeTruthy();
  });
});
