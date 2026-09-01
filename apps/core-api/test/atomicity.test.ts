// AC-2. Promotion is one transaction, and forcing a failure at each step leaves
// no half-promoted account.
//
// This matters more than it reads. A half-promoted account is worse than an
// unpromoted one: state 'invited' with no Miscellaneous thread signs in
// successfully and lands on a Today that cannot accept a dump, and nothing
// about that state says which step failed or how to finish it.
//
// The failures are injected with database triggers rather than by mocking a
// module. A mock proves the code calls what the test expects; a trigger proves
// Postgres rolled the whole thing back, which is the actual claim.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { promote } from "../src/admin/promote.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

/** Every table promotion writes to, after the account row itself. Each one is
 *  a step that can fail, and each is checked. */
const STEPS = ["account_keys", "threads", "thread_members", "thread_keys", "jobs", "analytics_events"] as const;

async function breakInserts(table: string): Promise<void> {
  await sql`
    create or replace function offload_test_fail() returns trigger as $$
    begin raise exception 'injected failure'; end;
    $$ language plpgsql;
  `.execute(db);
  await sql`
    create trigger offload_test_break before insert on ${sql.raw(table)}
    for each row execute function offload_test_fail();
  `.execute(db);
}

async function repair(table: string): Promise<void> {
  await sql`drop trigger if exists offload_test_break on ${sql.raw(table)};`.execute(db);
}

async function wipe(): Promise<void> {
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("staff").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
}

beforeEach(wipe);

afterEach(async () => {
  for (const table of STEPS) await repair(table);
});

describe("AC-2 a failure at any step promotes nobody", () => {
  for (const table of STEPS) {
    it(`rolls everything back when ${table} fails`, async () => {
      const { id } = await db
        .insertInto("accounts")
        .values({ email: "ana@example.test", state: "waitlist" })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await breakInserts(table);
      await expect(promote("ana@example.test")).rejects.toThrow(/injected failure/);
      await repair(table);

      const after = await db
        .selectFrom("accounts")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();

      // Still waiting. Not invited-but-broken, which is the state that signs
      // in and then does not work.
      expect(after.state).toBe("waitlist");
      expect(after.default_thread_id).toBeNull();

      for (const other of STEPS) {
        const rows = await sql<{ n: string }>`select count(*)::text as n from ${sql.raw(other)}`.execute(db);
        expect(rows.rows[0]?.n, `${other} should be empty after a rollback`).toBe("0");
      }
    });
  }

  it("and the account is still promotable afterwards", async () => {
    await db.insertInto("accounts").values({ email: "ana@example.test", state: "waitlist" }).execute();

    await breakInserts("threads");
    await expect(promote("ana@example.test")).rejects.toThrow();
    await repair("threads");

    // A failed attempt leaves nothing to clean up and nothing that makes the
    // retry behave differently. That is what "no side effects" has to mean to
    // be worth claiming.
    await expect(promote("ana@example.test")).resolves.toMatchObject({ status: "invited" });
  });
});
