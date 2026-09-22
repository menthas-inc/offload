// 024 B1: the two tables and the seven columns, as the impl-spec writes them.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

async function columnsOf(table: string): Promise<Map<string, { type: string; nullable: boolean; def: string | null }>> {
  const rows = await sql<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>`
    select column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_name = ${table}
  `.execute(db);
  return new Map(rows.rows.map((r) => [r.column_name, { type: r.data_type, nullable: r.is_nullable === "YES", def: r.column_default }]));
}

describe("024 the account's notification columns", () => {
  it("exist, the switches on and the hours at 8:00 and 19:00 by default", async () => {
    const columns = await columnsOf("accounts");
    for (const name of ["notify_due_today", "notify_coming_tomorrow", "notify_people_requests", "notify_shared_activity"]) {
      expect(columns.get(name)?.type, name).toBe("boolean");
      expect(columns.get(name)?.def, name).toBe("true");
    }
    expect(columns.get("notify_due_today_at")?.type).toBe("time without time zone");
    expect(columns.get("notify_due_today_at")?.def).toContain("08:00");
    expect(columns.get("notify_coming_tomorrow_at")?.def).toContain("19:00");
    expect(columns.get("activity_seen_at")?.type).toBe("timestamp with time zone");
    expect(columns.get("activity_seen_at")?.nullable).toBe(true);
  });
});

describe("024 push tokens", () => {
  it("bind a token to one account, in Expo's own shape, on one of the two platforms", async () => {
    const columns = await columnsOf("push_tokens");
    expect([...columns.keys()].sort()).toEqual(["account_id", "created_at", "id", "last_seen_at", "platform", "token"]);
    const account = await db
      .insertInto("accounts")
      .values({ email: `${crypto.randomUUID()}@example.com`, state: "active", email_verified: true, analytics_subject_id: crypto.randomUUID() } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    await expect(
      sql`insert into push_tokens (account_id, token, platform) values (${account.id}, 'not-a-token', 'ios')`.execute(db),
    ).rejects.toThrow(/check/);
    await expect(
      sql`insert into push_tokens (account_id, token, platform) values (${account.id}, 'ExponentPushToken[abc]', 'web')`.execute(db),
    ).rejects.toThrow(/check/);
    await sql`insert into push_tokens (account_id, token, platform) values (${account.id}, 'ExponentPushToken[abc]', 'ios')`.execute(db);
    await expect(
      sql`insert into push_tokens (account_id, token, platform) values (${account.id}, 'ExponentPushToken[abc]', 'android')`.execute(db),
    ).rejects.toThrow(/unique|duplicate/);
  });
});

describe("024 activity", () => {
  it("holds a kind from the seven, a reason from the three, and bounded words", async () => {
    const columns = await columnsOf("activity");
    expect([...columns.keys()].sort()).toEqual([
      "about_account_id", "account_id", "body", "content_id", "id", "kind", "member_id", "occurred_at", "reason", "request_id", "send", "sent", "thread_id", "title",
    ]);
    const account = await db
      .insertInto("accounts")
      .values({ email: `${crypto.randomUUID()}@example.com`, state: "active", email_verified: true, analytics_subject_id: crypto.randomUUID() } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    await expect(
      sql`insert into activity (account_id, kind, sent, title) values (${account.id}, 'alert', true, 'Due today')`.execute(db),
    ).rejects.toThrow(/check/);
    await expect(
      sql`insert into activity (account_id, kind, sent, reason, title) values (${account.id}, 'digest', false, 'weather', 'Due today')`.execute(db),
    ).rejects.toThrow(/check/);
    await sql`insert into activity (account_id, kind, sent, reason, title, send) values (${account.id}, 'digest', false, 'setting', 'Tomorrow was off', 'evening')`.execute(db);
  });

  it("is nothing the worker may read", async () => {
    const grants = await sql<{ table_name: string }>`
      select table_name from information_schema.role_table_grants where grantee = 'offload_agent' and table_name in ('activity', 'push_tokens')
    `.execute(db);
    expect(grants.rows).toEqual([]);
  });
});
