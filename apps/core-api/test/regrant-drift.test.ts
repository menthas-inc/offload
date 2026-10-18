// A restore gives the worker back exactly what apps/backup/regrant.sql lists,
// so a migration that grants offload_agent something must land there too.
// 042's reminder_labels did not, and every nightly and memory pass failed with
// permission denied after a restore. This reads the grants the migrated test
// database holds with regrant.test.sh's own query and compares them with the
// generated block, so it runs on every suite rather than only by hand.

import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const marker = "-- Generated from here down by apps/backup/test/regrant.test.sh --write.";
const script = readFileSync(new URL("../../backup/test/regrant.test.sh", import.meta.url), "utf8");
const regrant = readFileSync(new URL("../../backup/regrant.sql", import.meta.url), "utf8");

describe("regrant.sql", () => {
  it("gives the worker every grant the migrations give it, and nothing else", async () => {
    const query = /grants\(\) \{[\s\S]*?<<'SQL'\n([\s\S]*?)\nSQL\n/.exec(script)?.[1];
    expect(query, "regrant.test.sh's grants() query").toBeTruthy();
    // The query opens with `set search_path = ''`, made local here so it ends with the transaction.
    const [, select] = query!.split(/^set search_path = '';\n/);
    const rows = await db.transaction().execute(async (trx) => {
      await sql`set local search_path = ''`.execute(trx);
      return (await sql.raw<{ stmt: string }>(select!).execute(trx)).rows;
    });
    const generated = regrant.slice(regrant.indexOf(marker) + marker.length).trim().split("\n");
    const live = rows.map((r) => r.stmt);
    // A leftover grant on a shared database shows here as extra: regenerate against a scratch one.
    const fix = "re-run apps/backup/test/regrant.test.sh --write against a scratch database, not the shared one";
    expect({ missing: live.filter((g) => !generated.includes(g)), extra: generated.filter((g) => !live.includes(g)) }, fix).toEqual({ missing: [], extra: [] });
    expect(generated, fix).toEqual(live);
  });
});
