// 052 T0.1. What a turn changed, kept so its reply can show it and its Undo
// can put it back; and what an answer showed, kept so its reply can draw it.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { account, dump, wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(closeDb);
beforeEach(wipe);

async function change(messageId: string, accountId: string, targetId: string, previous: unknown) {
  await sql`
    insert into turn_changes (message_id, account_id, target_kind, target_id, tool, previous)
    values (${messageId}::uuid, ${accountId}::uuid, 'content', ${targetId}::uuid, 'complete_content', ${JSON.stringify(previous)}::jsonb)`.execute(db);
}

describe("turn_changes", () => {
  it("holds one row per message and target", async () => {
    const me = await account();
    const { messageId } = await dump(me);
    const target = "0190d4c0-0000-7000-8000-000000000001";
    await change(messageId, me, target, { done_at: null });
    await expect(change(messageId, me, target, { done_at: null })).rejects.toThrow(/turn_changes_pkey/);
  });

  it("refuses a target kind it does not know", async () => {
    const me = await account();
    const { messageId } = await dump(me);
    await expect(
      sql`insert into turn_changes (message_id, account_id, target_kind, target_id, tool)
          values (${messageId}::uuid, ${me}::uuid, 'memory', gen_random_uuid(), 'x')`.execute(db),
    ).rejects.toThrow(/turn_changes_target_kind_check/);
  });

  it("goes with the account", async () => {
    const me = await account();
    const { messageId } = await dump(me);
    await change(messageId, me, "0190d4c0-0000-7000-8000-000000000002", { done_at: null });
    await db.deleteFrom("accounts").where("id", "=", me).execute();
    const left = await sql<{ n: number }>`select count(*)::int as n from turn_changes`.execute(db);
    expect(left.rows[0]!.n).toBe(0);
  });
});

describe("messages.shown", () => {
  it("holds what an answer showed", async () => {
    const me = await account();
    const { messageId } = await dump(me);
    await sql`update messages set shown = ${JSON.stringify({ on: "2027-03-28" })}::jsonb where id = ${messageId}::uuid`.execute(db);
    const row = await sql<{ shown: unknown }>`select shown from messages where id = ${messageId}::uuid`.execute(db);
    expect(row.rows[0]!.shown).toEqual({ on: "2027-03-28" });
  });
});
