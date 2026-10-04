// 035 AC-3. Deleting an account must name every column that refers to one.
//
// 001 said it first: account deletion names every table it touches, or content
// survives a deletion the person believes happened. A list in a spec goes stale
// with the next migration, so the list lives in code and this asks the
// database what actually exists. A new foreign key to `accounts`, or a new
// column that looks like it holds an account, a pseudonym or an address, fails
// here until somebody writes down what a deletion does to it.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { ACCOUNT_LEDGER } from "../src/accounts/ledger.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

describe("the account ledger", () => {
  it("gives every foreign key to accounts the fate the database enforces", async () => {
    const keys = await sql<{ col: string; rule: string }>`
      select c.conrelid::regclass::text || '.' || a.attname as col,
             case c.confdeltype when 'c' then 'cascade' when 'n' then 'set-null' else 'other' end as rule
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f' and c.confrelid = 'accounts'::regclass
      order by 1
    `.execute(db);

    const wrong = keys.rows
      .filter((key) => ACCOUNT_LEDGER[key.col]?.fate !== key.rule)
      .map((key) => `${key.col}: database says ${key.rule}, ledger says ${ACCOUNT_LEDGER[key.col]?.fate ?? "nothing"}`);
    expect(wrong).toEqual([]);
  });

  // `accounts.delete_requested_by` holds an owner's account id with no foreign
  // key and none of the first five words in its name, and sat unnamed until
  // 2026-10-04. A column that says who did something is named `_by`.
  it("names every other column that could hold an account, a pseudonym or an address", async () => {
    const columns = await sql<{ col: string }>`
      select c.table_name || '.' || c.column_name as col
      from information_schema.columns c
      join pg_tables t on t.tablename = c.table_name and t.schemaname = 'public'
      where c.table_schema = 'public'
        and (c.column_name ~ 'account|subject|scope_id|email|owner'
             or (c.data_type = 'uuid' and c.column_name ~ '(^|_)by($|_)|staff|person|member|author|actor'))
        and not exists (
          select 1 from pg_constraint k
          join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
          where k.contype = 'f' and k.conrelid = format('%I', c.table_name)::regclass and a.attname = c.column_name
        )
      order by 1
    `.execute(db);

    const unnamed = columns.rows.map((row) => row.col).filter((col) => !(col in ACCOUNT_LEDGER));
    expect(unnamed).toEqual([]);
  });

  it("holds nothing the database no longer has", async () => {
    const existing = await sql<{ col: string }>`
      select table_name || '.' || column_name as col from information_schema.columns where table_schema = 'public'
    `.execute(db);
    const have = new Set(existing.rows.map((row) => row.col));
    expect(Object.keys(ACCOUNT_LEDGER).filter((col) => !have.has(col))).toEqual([]);
  });

  it("keeps the cost ledger without the account", () => {
    expect(ACCOUNT_LEDGER["llm_usage.account_id"]?.fate).toBe("set-null");
  });
});
