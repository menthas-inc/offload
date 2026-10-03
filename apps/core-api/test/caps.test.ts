// 034. A cap is read from its setting, a person's own value beats it, the
// platform's cap refuses everybody, and every refusal is written down with
// whose cap it was (AC-29, AC-30, AC-31, AC-35).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { OverBudget, atDailyLimit, clearPlatformSpent, limitReached, platformSpent, recordHit } from "../src/budget.js";
import { clearSettingsCache } from "../src/settings.js";
import { takeDump } from "../src/routes/dumps.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  // Settings are global: a cap left behind here would refuse the next file.
  await db.deleteFrom("app_settings").execute();
  await db.deleteFrom("llm_usage").execute();
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("app_settings").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("lookups").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
  fresh();
});

/** What a save does on the instance that made it, and what fifteen seconds
 *  do on every other. */
function fresh(): void {
  clearSettingsCache();
  clearPlatformSpent();
}

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

async function spend(accountId: string, micros: number): Promise<void> {
  await db
    .insertInto("llm_usage")
    .values({ account_id: accountId, job_kind: "dump.answer", category: "interactive", model: "claude-sonnet-5", cost_micros: micros })
    .execute();
}

async function set(key: string, value: unknown): Promise<void> {
  await db
    .insertInto("app_settings")
    .values({ key, value: JSON.stringify(value), updated_by_account_id: null })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: JSON.stringify(value) }))
    .execute();
  fresh();
}

const hits = (accountId: string) =>
  db.selectFrom("limit_hits").select(["cap", "scope", "count"]).where("account_id", "=", accountId).orderBy("cap").execute();

async function cookieFor(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3_600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

describe("AC-29 a per-person cap is its setting", () => {
  it("refuses at the value an owner saved, without a deploy", async () => {
    const me = await account();
    await spend(me, 1_000_000);
    expect((await takeDump(me, "milk")).messageId).toBeTruthy();

    await set("cap.spend_micros", 1_000_000);
    await expect(takeDump(me, "eggs")).rejects.toBeInstanceOf(OverBudget);
    expect(await atDailyLimit(me)).toBe(true);
  });

  it("counts turns against the turns setting", async () => {
    const me = await account();
    await set("cap.turns", 2);
    await takeDump(me, "one");
    await takeDump(me, "two");
    const refused = await takeDump(me, "three").catch((e) => e);
    expect(refused).toBeInstanceOf(OverBudget);
    expect(refused).toMatchObject({ scope: "account", cap: "cap.turns" });
  });
});

describe("AC-30 a person's own value", () => {
  it("beats the global one, higher or lower", async () => {
    const me = await account();
    const other = await account();
    await set("cap.turns", 1);
    await db.insertInto("account_limits").values({ account_id: me, key: "cap.turns", value: 3 }).execute();
    fresh();
    await takeDump(me, "one");
    await takeDump(me, "two");
    await takeDump(other, "one");
    await expect(takeDump(other, "two")).rejects.toBeInstanceOf(OverBudget);
    expect(await limitReached(me)).toBeNull();
  });
});

describe("AC-31 the platform's cap", () => {
  it("is off until set, and off is not zero", async () => {
    const me = await account();
    const other = await account();
    await spend(other, 900_000_000);
    expect(await limitReached(me)).toBeNull();
    expect((await takeDump(me, "milk")).messageId).toBeTruthy();
  });

  it("refuses everybody once everyone together has spent it, and says the platform did", async () => {
    const me = await account();
    const other = await account();
    await spend(other, 20_000_000);
    await set("platform.spend_micros", 20_000_000);

    const refused = await takeDump(me, "milk").catch((e) => e);
    expect(refused).toBeInstanceOf(OverBudget);
    expect(refused).toMatchObject({ scope: "platform", cap: "platform.spend_micros" });
    expect(await atDailyLimit(me)).toBe(true);
    expect(await db.selectFrom("messages").select("id").execute()).toEqual([]);

    // Under it again, and turns resume.
    await set("platform.spend_micros", 21_000_000);
    expect((await takeDump(me, "milk")).messageId).toBeTruthy();
  });

  it("counts search fees and rows with nobody attached", async () => {
    const me = await account();
    const gone = await account();
    await spend(gone, 4_000_000);
    await db.insertInto("lookups").values({ account_id: gone, label: "search", kind: "search", outcome: "used", cost_micros: 1_000_000 }).execute();
    await db.deleteFrom("jobs").execute();
    await db.updateTable("accounts").set({ default_thread_id: null }).where("id", "=", gone).execute();
    await db.deleteFrom("accounts").where("id", "=", gone).execute();
    fresh();
    expect(await platformSpent()).toBe(5_000_000);
    await set("platform.spend_micros", 5_000_000);
    expect(await limitReached(me)).toEqual({ cap: "platform.spend_micros", scope: "platform" });
  });

  it("holds the sum for fifteen seconds rather than reading it on every dump", async () => {
    const me = await account();
    expect(await platformSpent()).toBe(0);
    await spend(me, 3_000_000);
    expect(await platformSpent()).toBe(0);
    clearPlatformSpent();
    expect(await platformSpent()).toBe(3_000_000);
  });

  it("answers the route with the same 429 and a scope", async () => {
    const me = await account();
    const cookie = await cookieFor(me);
    await spend(me, 2_000_000);
    await set("platform.spend_micros", 2_000_000);
    const platform = await app.inject({ method: "POST", url: "/v1/dumps", headers: { cookie }, payload: { text: "milk", clientKey: uuidv7() } });
    expect(platform.statusCode).toBe(429);
    expect(platform.json()).toEqual({ error: "daily_limit", scope: "platform" });

    await set("platform.spend_micros", null);
    await set("cap.spend_micros", 2_000_000);
    const own = await app.inject({ method: "POST", url: "/v1/dumps", headers: { cookie }, payload: { text: "milk", clientKey: uuidv7() } });
    expect(own.statusCode).toBe(429);
    expect(own.json()).toEqual({ error: "daily_limit", scope: "account" });
  });
});

describe("AC-35 every refusal is recorded", () => {
  it("writes one row per account, cap, scope and day, and counts", async () => {
    const me = await account();
    await set("cap.spend_micros", 1_000_000);
    await spend(me, 1_000_000);
    await takeDump(me, "a").catch(() => undefined);
    await takeDump(me, "b").catch(() => undefined);
    expect(await hits(me)).toEqual([{ cap: "cap.spend_micros", scope: "account", count: 2 }]);

    await set("platform.spend_micros", 1_000_000);
    await takeDump(me, "c").catch(() => undefined);
    // The platform's cap is checked first: when both are reached, it is the
    // one that would refuse everybody, and that is the news.
    expect(await hits(me)).toEqual([
      { cap: "cap.spend_micros", scope: "account", count: 2 },
      { cap: "platform.spend_micros", scope: "platform", count: 1 },
    ]);
  });

  it("does not record the composer asking whether the day is used", async () => {
    const me = await account();
    await set("cap.spend_micros", 1_000_000);
    await spend(me, 1_000_000);
    expect(await atDailyLimit(me)).toBe(true);
    expect(await hits(me)).toEqual([]);
  });

  it("keeps the day in UTC and the time of the last one", async () => {
    const me = await account();
    await recordHit(me, "cap.photos", "account");
    const row = await sql<{ day: string; today: string; recent: boolean }>`
      select day::text, (now() at time zone 'UTC')::date::text as today, last_at > now() - interval '1 minute' as recent
      from limit_hits where account_id = ${me}`.execute(db);
    expect(row.rows[0]!.day).toBe(row.rows[0]!.today);
    expect(row.rows[0]!.recent).toBe(true);
  });
});
