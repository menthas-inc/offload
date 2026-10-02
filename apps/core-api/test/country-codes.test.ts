// A country stored under a code the register no longer offers moves to the
// current code for the same name, so nobody's setting turns into a bare code.

import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { isCountry } from "../src/countries.js";
import { account, wipe } from "./labels-kit.js";

await migrate(() => {});
afterAll(async () => {
  await closeDb();
});
beforeEach(wipe);

const MIGRATION = readFileSync(new URL("../migrations/0068_retired_country_codes.sql", import.meta.url), "utf8");

async function stored(code: string | null): Promise<string | null> {
  const id = await account();
  await db.updateTable("accounts").set({ country: code }).where("id", "=", id).execute();
  await sql.raw(MIGRATION).execute(db);
  const row = await db.selectFrom("accounts").select("country").where("id", "=", id).executeTakeFirstOrThrow();
  return row.country;
}

describe("retired country codes", () => {
  it("move to the current code for the name that was shown", async () => {
    expect(await stored("YU")).toBe("RS");
    expect(await stored("CS")).toBe("RS");
    expect(await stored("SU")).toBe("RU");
    expect(await stored("UK")).toBe("GB");
    expect(await stored("ZR")).toBe("CD");
  });

  it("leave a current code, and no country, alone", async () => {
    expect(await stored("PT")).toBe("PT");
    expect(await stored(null)).toBeNull();
  });

  it("land only on codes the register offers", async () => {
    const targets = [...MIGRATION.matchAll(/'([A-Z]{2})'\s*\)/g)].map((m) => m[1]!);
    expect(targets.length).toBeGreaterThan(10);
    for (const code of targets) expect(isCountry(code)).toBe(true);
  });
});
