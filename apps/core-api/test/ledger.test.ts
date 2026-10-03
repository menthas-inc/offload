// The ledger prices every model call itself, and the daily budget reads it.
//
// The budget shipped for security review M6 summed `llm_usage.cost_micros`,
// and every token row the worker wrote said zero: the price was a field the
// worker sent and the worker always sent 0. budget.test.ts stayed green because
// it wrote its spend straight into the table. These go through the route the
// worker calls, with tokens and no price, so the price has to come from here.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import { DAILY_TURNS, OverBudget, spentToday } from "../src/budget.js";
import { takeDump } from "../src/routes/dumps.js";
import { quickAdd } from "../src/routes/threads.js";

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
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("lookups").execute();
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

async function account(): Promise<{ id: string; thread: string }> {
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
  return { id: row.id, thread: thread.id };
}

/** A dump the worker has claimed, ready for its result. */
async function runningTurn(accountId: string): Promise<string> {
  const sent = await takeDump(accountId, "milk");
  const job = await db
    .selectFrom("jobs")
    .select("id")
    .where("account_id", "=", accountId)
    .where("kind", "=", "dump.answer")
    .orderBy("created_at", "desc")
    .executeTakeFirstOrThrow();
  await db.updateTable("jobs").set({ state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 }).where("id", "=", job.id).execute();
  expect(sent.messageId).toBeTruthy();
  return job.id;
}

const post = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/turn-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: payload as Record<string, unknown>,
  });

const ledger = (accountId: string) =>
  db
    .selectFrom("llm_usage")
    .select(["model", "cost_micros", "cache_write_tokens", "job_id"])
    .where("account_id", "=", accountId)
    .orderBy("created_at")
    .execute();

describe("the ledger prices what it is told was used", () => {
  it("prices a call from its tokens: input, output, cache reads and cache writes apart", async () => {
    const me = await account();
    const jobId = await runningTurn(me.id);
    const response = await post({
      outcome: "answered",
      jobId,
      replyText: "Noted.",
      usage: [{ model: "claude-sonnet-5", inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 8_000, cacheWriteTokens: 2_000, latencyMs: 900 }],
    });
    expect(response.statusCode).toBe(200);
    // Sonnet 5: $2 in, $10 out, $0.20 cache read, $2.50 cache write per million,
    // which is micros per token. Anthropic's input count excludes both cache counts.
    const rows = await ledger(me.id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.cost_micros)).toBe(1_000 * 2 + 500 * 10 + 8_000 * 0.2 + 2_000 * 2.5);
    expect(rows[0]!.cache_write_tokens).toBe(2_000);
    // 034. The row names the turn it was for, so a person's timeline can say
    // what each job cost. No foreign key: the ledger outlives the job table's
    // 30 days, and a purged job leaves its rows as they are.
    expect(rows[0]!.job_id).toBe(jobId);
    await db.deleteFrom("jobs").where("id", "=", jobId).execute();
    expect((await ledger(me.id))[0]!.job_id).toBe(jobId);
  });

  it("ignores a price the worker sends and prices the tokens", async () => {
    const me = await account();
    const jobId = await runningTurn(me.id);
    await post({
      outcome: "answered",
      jobId,
      replyText: "Noted.",
      usage: [{ model: "claude-haiku-4-5", inputTokens: 300, outputTokens: 20, cacheReadTokens: 0, costMicros: 0, latencyMs: 200 }],
    });
    expect(Number((await ledger(me.id))[0]!.cost_micros)).toBe(300 * 1 + 20 * 5);
  });

  it("prices a model it has no price for at the dearest rate it knows", async () => {
    const me = await account();
    const jobId = await runningTurn(me.id);
    await post({
      outcome: "answered",
      jobId,
      replyText: "Noted.",
      usage: [{ model: "claude-next", inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 0, latencyMs: 200 }],
    });
    // Opus 5 is the dearest in the table: $5 in, $25 out.
    expect(Number((await ledger(me.id))[0]!.cost_micros)).toBe(1_000 * 5 + 100 * 25);
  });

  it("spends the budget through the route, so the next dump is refused", async () => {
    const me = await account();
    const jobId = await runningTurn(me.id);
    // A million output tokens on Opus 5 is $25, past the $5 a day.
    await post({
      outcome: "answered",
      jobId,
      replyText: "Noted.",
      usage: [{ model: "claude-opus-5", inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 0, latencyMs: 200 }],
    });
    await expect(takeDump(me.id, "eggs")).rejects.toBeInstanceOf(OverBudget);
  });
});

describe("what the budget counts", () => {
  it("counts web search fees with the model's spend", async () => {
    const me = await account();
    await db
      .insertInto("lookups")
      .values([
        { account_id: me.id, label: "when_is", kind: "search", outcome: "used", cost_micros: 10_000 },
        { account_id: me.id, label: "when_is", kind: "search", outcome: "used", cost_micros: 10_000, created_at: sql`now() - interval '25 hours'` },
      ])
      .execute();
    await db.insertInto("llm_usage").values({ account_id: me.id, job_kind: "dump.answer", category: "interactive", model: "claude-sonnet-5", cost_micros: 5_000 }).execute();
    expect(await spentToday(me.id)).toBe(15_000);
  });
});

describe("how many turns a day", () => {
  async function turns(accountId: string, n: number, kind: string, hoursAgo = 0) {
    await db
      .insertInto("jobs")
      .values(Array.from({ length: n }, () => ({
        kind, account_id: accountId, payload: JSON.stringify({}), state: "done" as const,
        created_at: sql<Date>`now() - make_interval(hours => ${hoursAgo})`,
      })))
      .execute();
  }

  // 032 AC-4. A typed row is not a turn: it neither counts nor is refused.
  it("refuses the dump past the day's count, and still takes a typed row", async () => {
    const me = await account();
    await turns(me.id, DAILY_TURNS, "dump.answer");
    await expect(takeDump(me.id, "milk")).rejects.toBeInstanceOf(OverBudget);
    const typed = await quickAdd(me.id, me.thread, "brackets", "todo");
    expect(typed.kind).toBe("content");
  });

  it("counts only the last twenty four hours, only turns, and only this account", async () => {
    const me = await account();
    const other = await account();
    await turns(me.id, DAILY_TURNS, "dump.answer", 25);
    await turns(me.id, DAILY_TURNS, "embed.content");
    await turns(other.id, DAILY_TURNS, "dump.answer");
    await turns(me.id, DAILY_TURNS - 1, "dump.answer");
    const sent = await takeDump(me.id, "milk");
    expect(sent.messageId).toBeTruthy();
  });
});

describe("the account says when it is at the day's limit", () => {
  it("is false under both limits and true at either, so a client can close the composer before anyone types", async () => {
    const { meFor } = await import("../src/routes/session.js");
    const me = await account();
    expect((await meFor(me.id))!.atDailyLimit).toBe(false);

    await db.insertInto("llm_usage").values({ account_id: me.id, job_kind: "dump.answer", category: "interactive", model: "claude-sonnet-5", cost_micros: 5_000_000 }).execute();
    expect((await meFor(me.id))!.atDailyLimit).toBe(true);

    const other = await account();
    await db
      .insertInto("jobs")
      .values(Array.from({ length: DAILY_TURNS }, () => ({ kind: "dump.answer", account_id: other.id, payload: JSON.stringify({}), state: "done" as const })))
      .execute();
    expect((await meFor(other.id))!.atDailyLimit).toBe(true);
  });

  it("allows a hundred turns a day", () => {
    expect(DAILY_TURNS).toBe(100);
  });
});
