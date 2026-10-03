// 034. What the database itself holds for the admin panel, whatever the
// application does: an audit entry nobody can change, a staff row only for an
// account with one way in, and a cost row that outlives its account.
//
// These are the guards that live in a trigger or a constraint because the
// application cannot be the last word on them (AC-51, AC-54).

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  // Truncate, not delete: the table refuses a delete, which is the point.
  await sql`truncate staff_audit`.execute(db);
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("lookups").execute();
  await db.deleteFrom("staff").execute();
  await db.deleteFrom("account_identities").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.test`, state: "active", email_verified: true })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function identity(accountId: string, provider: "apple" | "google"): Promise<void> {
  await db.insertInto("account_identities").values({ account_id: accountId, provider, subject: uuidv7() }).execute();
}

describe("AC-54 an audit entry", () => {
  it("is refused an update and a delete", async () => {
    const staff = await account();
    const entry = await db
      .insertInto("staff_audit")
      .values({ staff_account_id: staff, kind: "invited", target_account_id: staff })
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(
      db.updateTable("staff_audit").set({ kind: "removed" }).where("id", "=", entry.id).execute()
    ).rejects.toThrow(/staff_audit/);
    await expect(db.deleteFrom("staff_audit").where("id", "=", entry.id).execute()).rejects.toThrow(/staff_audit/);
    expect(await db.selectFrom("staff_audit").select("kind").execute()).toEqual([{ kind: "invited" }]);
  });

  it("can be removed once it is older than two years, and only then", async () => {
    const staff = await account();
    await db
      .insertInto("staff_audit")
      .values([
        { staff_account_id: staff, kind: "invited", at: sql`now() - interval '2 years 1 day'` },
        { staff_account_id: staff, kind: "resent", at: sql`now() - interval '1 year 364 days'` },
      ])
      .execute();

    await db.deleteFrom("staff_audit").where("kind", "=", "invited").execute();
    await expect(db.deleteFrom("staff_audit").where("kind", "=", "resent").execute()).rejects.toThrow(/staff_audit/);
    expect(await db.selectFrom("staff_audit").select("kind").execute()).toEqual([{ kind: "resent" }]);
  });

  it("outlives both accounts it names", async () => {
    const staff = await account();
    const person = await account();
    await db.insertInto("staff_audit").values({ staff_account_id: staff, kind: "disabled", target_account_id: person }).execute();
    await db.deleteFrom("accounts").execute();
    const kept = await db.selectFrom("staff_audit").select(["staff_account_id", "target_account_id"]).execute();
    expect(kept).toEqual([{ staff_account_id: staff, target_account_id: person }]);
  });

  it("records a person's page opened once per staff member, person and day", async () => {
    const staff = await account();
    const person = await account();
    const viewed = { staff_account_id: staff, kind: "person.viewed", target_account_id: person };
    await db.insertInto("staff_audit").values(viewed).execute();
    await expect(db.insertInto("staff_audit").values(viewed).execute()).rejects.toThrow(/unique|duplicate/i);
    // Another kind on the same person the same day is its own entry.
    await db.insertInto("staff_audit").values({ ...viewed, kind: "disabled" }).execute();
    await db.insertInto("staff_audit").values({ ...viewed, kind: "disabled" }).execute();
  });
});

describe("AC-51 a staff row", () => {
  it("is refused for an account with two sign-in identities", async () => {
    const id = await account();
    await identity(id, "google");
    await identity(id, "apple");
    await expect(db.insertInto("staff").values({ account_id: id, role: "support" }).execute()).rejects.toThrow(
      /more than one identity/
    );
  });

  it("is allowed for an account with one", async () => {
    const id = await account();
    await identity(id, "google");
    await db.insertInto("staff").values({ account_id: id, role: "support" }).execute();
    expect(await db.selectFrom("staff").select("role").execute()).toEqual([{ role: "support" }]);
  });
});

describe("the ledger survives its account", () => {
  it("keeps a model call and a search fee with nobody attached", async () => {
    const id = await account();
    await db
      .insertInto("llm_usage")
      .values({ account_id: id, job_kind: "dump.answer", category: "interactive", model: "claude-sonnet-5", cost_micros: 7 })
      .execute();
    await db.insertInto("lookups").values({ account_id: id, label: "search", kind: "search", outcome: "used", cost_micros: 3 }).execute();

    await db.deleteFrom("accounts").where("id", "=", id).execute();

    const calls = await db.selectFrom("llm_usage").select(["account_id", "cost_micros"]).execute();
    expect(calls.map((row) => [row.account_id, Number(row.cost_micros)])).toEqual([[null, 7]]);
    const fees = await db.selectFrom("lookups").select(["account_id", "cost_micros"]).execute();
    expect(fees.map((row) => [row.account_id, Number(row.cost_micros)])).toEqual([[null, 3]]);
  });
});

describe("AC-45 hourly history", () => {
  it("has no account column", async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns where table_name = 'job_stats_hourly'
    `.execute(db);
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain("hour");
    expect(names.filter((name) => name.includes("account"))).toEqual([]);
  });
});
