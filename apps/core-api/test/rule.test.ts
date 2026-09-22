// 023: recurrence becomes a rule.
//
// AC-7  the migration replaces repeats and repeats_until with rrule on both
//       tables, rewriting the six values and an until into the canonical
//       serialisation, and every migrated row survives the parser unchanged.
// AC-8  the database refuses a rule with no anchor, a note's rule with no
//       occurrence, and a rule on a calendar's series.

import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { isCanonicalRule } from "@offload/widgets";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

const MIGRATION = readFileSync(new URL("../migrations/0057_a_rule.sql", import.meta.url), "utf8");

/** The text between two markers in the migration, so the test runs the very
 *  expression the migration ran rather than a copy of it. */
function marked(name: string): string {
  const begin = MIGRATION.indexOf(`-- ${name}:begin`);
  const end = MIGRATION.indexOf(`-- ${name}:end`);
  if (begin < 0 || end < 0) throw new Error(`no ${name} markers in the migration`);
  return MIGRATION.slice(MIGRATION.indexOf("\n", begin) + 1, end);
}

async function columnsOf(table: string): Promise<Set<string>> {
  const result = await sql<{ column_name: string }>`
    select column_name from information_schema.columns where table_name = ${table}
  `.execute(db);
  return new Set(result.rows.map((row) => row.column_name));
}

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name: "Lisbon trip", always_on: false })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

describe("AC-7 the migration", () => {
  it("drops repeats and repeats_until and adds rrule on both tables", async () => {
    for (const table of ["content", "notes"]) {
      const columns = await columnsOf(table);
      expect(columns.has("rrule"), `${table}.rrule`).toBe(true);
      expect(columns.has("repeats"), `${table}.repeats`).toBe(false);
      expect(columns.has("repeats_until"), `${table}.repeats_until`).toBe(false);
    }
  });

  it("rewrites the six values and an until into canonical rules", async () => {
    const expression = marked("rewrite");
    const rows = await db.transaction().execute(async (trx) => {
      await sql`create temp table legacy (repeats text, repeats_until timestamptz) on commit drop`.execute(trx);
      await sql`insert into legacy values
        ('day', null), ('weekday', null), ('week', null), ('two_weeks', null), ('month', null), ('year', null),
        ('week', '2026-10-06T08:59:59Z')`.execute(trx);
      const result = await sql<{ repeats: string; rrule: string }>`
        select repeats, (${sql.raw(expression)}) as rrule from legacy order by repeats_until nulls first, repeats
      `.execute(trx);
      return result.rows;
    });
    const byInput = new Map(rows.slice(0, 6).map((row) => [row.repeats, row.rrule]));
    expect(byInput.get("day")).toBe("FREQ=DAILY");
    expect(byInput.get("weekday")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(byInput.get("week")).toBe("FREQ=WEEKLY");
    expect(byInput.get("two_weeks")).toBe("FREQ=WEEKLY;INTERVAL=2");
    expect(byInput.get("month")).toBe("FREQ=MONTHLY");
    expect(byInput.get("year")).toBe("FREQ=YEARLY");
    expect(rows[6]?.rrule).toBe("FREQ=WEEKLY;UNTIL=20261006T085959Z");
    for (const row of rows) expect(isCanonicalRule(row.rrule), row.rrule).toBe(true);
  });
});

describe("AC-8 what the database refuses", () => {
  it("a rule on a row with no anchoring date", async () => {
    const me = await account();
    const th = await thread(me);
    const insert = (type: "task" | "event", values: Record<string, unknown>) =>
      db
        .insertInto("content")
        .values({ account_id: me, thread_id: th, title: "Rent", type, ...values } as never)
        .execute();
    // A task anchors on due_at, an event on occurs_at.
    await expect(insert("task", { rrule: "FREQ=MONTHLY" })).rejects.toThrow(/content_rrule_needs_when/);
    await expect(insert("task", { rrule: "FREQ=MONTHLY", occurs_at: new Date() })).rejects.toThrow(/content_rrule_needs_when/);
    await expect(insert("event", { rrule: "FREQ=MONTHLY", due_at: new Date() })).rejects.toThrow(/content_rrule_needs_when/);
    await expect(insert("task", { rrule: "FREQ=MONTHLY", due_at: new Date() })).resolves.toBeDefined();
    await expect(insert("event", { rrule: "FREQ=MONTHLY", occurs_at: new Date() })).resolves.toBeDefined();
  });

  it("a rule on a calendar's series, and a shape that is not a rule", async () => {
    const me = await account();
    const th = await thread(me);
    await expect(
      db
        .insertInto("content")
        .values({
          account_id: me,
          thread_id: th,
          title: "Standup",
          type: "event",
          occurs_at: new Date(),
          rrule: "FREQ=WEEKLY",
          attrs: sql`'{"series_ref": "abc"}'::jsonb`,
        } as never)
        .execute(),
    ).rejects.toThrow(/content_rrule_or_series/);
    await expect(
      db
        .insertInto("content")
        .values({ account_id: me, thread_id: th, title: "Standup", type: "event", occurs_at: new Date(), rrule: "weekly" } as never)
        .execute(),
    ).rejects.toThrow(/rrule/);
  });

  it("a note's rule with no occurrence", async () => {
    const me = await account();
    const th = await thread(me);
    const insert = (values: Record<string, unknown>) =>
      db
        .insertInto("notes")
        .values({ account_id: me, scope: "thread", subject_id: th, kind: "preference", text: "Yoga", origin: "stated", ...values } as never)
        .execute();
    await expect(insert({ rrule: "FREQ=WEEKLY" })).rejects.toThrow(/notes_rrule_needs_a_date/);
    await expect(insert({ rrule: "FREQ=WEEKLY", occurs_at: new Date() })).resolves.toBeDefined();
  });
});
