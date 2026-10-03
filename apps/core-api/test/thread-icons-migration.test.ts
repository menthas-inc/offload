// 037. Migration 0082: every thread that exists gets an icon and a hue.
//
// The backfill picks in SQL what `pickThreadIcon` picks in TypeScript, from a
// copy of the word list. Two copies drift, so the first test holds the
// migration's list to the module's, and the rest run the marked statement
// against seeded threads.

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { THREAD_ICONS, pickThreadIcon } from "@offload/widgets";
import { closeDb, db } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
});

const MIGRATION = readFileSync(new URL("../migrations/0082_thread_icons.sql", import.meta.url), "utf8");

function marked(name: string): string {
  const begin = MIGRATION.indexOf(`-- ${name}:begin`);
  const end = MIGRATION.indexOf(`-- ${name}:end`);
  if (begin < 0 || end < 0) throw new Error(`no ${name} markers in the migration`);
  return MIGRATION.slice(MIGRATION.indexOf("\n", begin) + 1, end);
}

beforeEach(async () => {
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function thread(accountId: string | null, name: string, minutesAgo: number): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, created_at: new Date(Date.now() - minutesAgo * 60_000), last_activity_at: new Date(), updated_at: new Date() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

const backfill = () => sql.raw(marked("backfill")).execute(db);

const read = (id: string) => db.selectFrom("threads").select(["icon", "hue", "icon_set_by"]).where("id", "=", id).executeTakeFirstOrThrow();

describe("migration 0082", () => {
  // An applied migration never changes. The day the module's list grows, this
  // has done its job: delete it, and the test under it, with that change.
  it("carries the module's word list, word for word and in order", () => {
    const rows = [...marked("backfill").matchAll(/\((\d+), '([a-z0-9-]+)', '([a-z]+)'\)/g)].map((m) => ({ ord: Number(m[1]), icon: m[2]!, word: m[3]! }));
    const expected = THREAD_ICONS.flatMap((one, index) => one.words.map((word) => ({ ord: index + 1, icon: one.icon, word })));
    expect(rows).toEqual(expected);
  });

  it("picks what the module picks", async () => {
    const me = await account();
    const names = ["Lisbon trip", "Gifts", "Recipe", "mum's-birthday!", "TAXES/2026", "Carpet", "Misc", "Party", "flights for the trip", "café trip", "Поездка gifts", "naïve-carpet", "día de camping"];
    const ids = [];
    for (const [index, name] of names.entries()) ids.push(await thread(me, name, 100 - index));
    await backfill();
    for (const [index, name] of names.entries()) {
      expect({ name, icon: (await read(ids[index]!)).icon }).toEqual({ name, icon: pickThreadIcon(name) ?? "lasso" });
    }
  });

  it("gives a creator's threads their hues in creation order, round again after ten", async () => {
    const me = await account();
    const other = await account();
    const mine = [];
    for (let index = 0; index < 12; index++) mine.push(await thread(me, `t${index}`, 100 - index));
    const theirs = await thread(other, "theirs", 50);
    await backfill();
    const hues = [];
    for (const id of mine) hues.push((await read(id)).hue);
    expect(hues).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2]);
    expect((await read(theirs)).hue).toBe(1);
  });

  it("does not count the default thread, and marks every pick as offload's", async () => {
    const me = await account();
    const home = await thread(me, "Miscellaneous", 200);
    await db.updateTable("accounts").set({ default_thread_id: home }).where("id", "=", me).execute();
    const first = await thread(me, "Dentist", 100);
    const orphan = await thread(null, "Nobody's", 90);
    await backfill();
    expect(await read(home)).toEqual({ icon: "lasso", hue: 1, icon_set_by: "offload" });
    expect(await read(first)).toEqual({ icon: "stethoscope", hue: 1, icon_set_by: "offload" });
    expect((await read(orphan)).hue).toBe(1);
  });

  it("refuses a hue outside one to ten and a pick that is nobody's", async () => {
    const me = await account();
    const id = await thread(me, "x", 1);
    await expect(db.updateTable("threads").set({ hue: 11 }).where("id", "=", id).execute()).rejects.toThrow();
    await expect(sql`update threads set icon_set_by = 'model' where id = ${id}`.execute(db)).rejects.toThrow();
    await expect(db.updateTable("threads").set({ icon: "../secret" }).where("id", "=", id).execute()).rejects.toThrow();
    await expect(db.updateTable("threads").set({ icon: 'x") url("//elsewhere' }).where("id", "=", id).execute()).rejects.toThrow();
  });
});
