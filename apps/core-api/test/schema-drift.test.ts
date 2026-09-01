// Does the database have the columns Better Auth is going to ask for?
//
// This file exists because of one outage. Better Auth 1.7 scopes an account
// identity by issuer, we upgraded from 1.6 mid-flight to settle a zod peer
// range, and nobody ran the schema change that came with it. The first real
// OAuth callback in production died on
// `column account_identities.issuer does not exist`.
//
// No test could have caught it. The gate tests call the hooks directly and
// never complete a provider round trip, so the one code path that touches that
// column is the one path no test walks. Rather than add a test per column,
// this asks the library itself what it expects and compares that to what
// exists, which keeps working across the next upgrade too.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { getAuthTables } from "better-auth/db";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { auth } from "../src/auth/auth.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

async function columnsOf(table: string): Promise<Set<string>> {
  const result = await sql<{ column_name: string }>`
    select column_name from information_schema.columns where table_name = ${table}
  `.execute(db);
  return new Set(result.rows.map((row) => row.column_name));
}

describe("the schema Better Auth expects", () => {
  const tables = getAuthTables(auth.options);

  for (const [model, definition] of Object.entries(tables)) {
    const table = definition.modelName;

    it(`has every column the ${model} model reads or writes, in ${table}`, async () => {
      const actual = await columnsOf(table);
      expect(actual.size, `${table} does not exist`).toBeGreaterThan(0);

      const missing = Object.entries(definition.fields)
        .map(([field, spec]) => (spec as { fieldName?: string }).fieldName ?? field)
        .filter((column) => !actual.has(column));

      // A missing column is not a type error and not a test failure anywhere
      // else: it is a 500 on the one request that matters, in production.
      expect(missing, `${table} is missing columns Better Auth will query`).toEqual([]);
    });
  }

  it("covers every model the library declares, so a new one cannot slip past", () => {
    // If Better Auth adds a model in a future version, this list changes and
    // the diff makes someone look, rather than a table quietly not existing.
    expect(Object.keys(tables).sort()).toEqual(["account", "session", "user", "verification"]);
  });
});
