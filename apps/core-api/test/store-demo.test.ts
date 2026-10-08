// The store demo (seeds/store-demo.sql) loads into a migrated database, twice,
// and comes out the same, so the App Store screenshots can be remade after any
// migration. A migration that breaks it fails here first.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { clearStoreDemo, seedStoreDemo, signInAsSam, SAM } from "../src/seed-store-demo.js";

await migrate(() => {});

afterAll(async () => {
  await clearStoreDemo();
  await closeDb();
});

const counts = async () =>
  (
    await sql<{ people: number; threads: number; members: number; rows: number; notes: number; memories: number; events: number; keys: number }>`
      select (select count(*) from accounts where email like '%@demo.offload.test') as people,
             (select count(*) from threads where id::text like '0de70000-0000-4000-a001-%') as threads,
             (select count(*) from thread_members where thread_id::text like '0de70000-0000-4000-a001-%') as members,
             (select count(*) from content where id::text like '0de70000-0000-4000-a005-%') as rows,
             (select count(*) from notes where scope = 'thread' and id::text like '0de70000-0000-4000-a004-%') as notes,
             (select count(*) from notes where scope = 'account' and id::text like '0de70000-0000-4000-a004-%') as memories,
             (select count(*) from connector_events where id::text like '0de70000-0000-4000-a008-%') as events,
             (select count(*) from account_keys where account_id::text like '0de70000-0000-4000-a000-%') as keys`.execute(db)
  ).rows[0];

describe("the store demo", () => {
  it("loads, twice, to the same three people", async () => {
    await seedStoreDemo();
    const first = await counts();
    await seedStoreDemo();
    expect(await counts()).toEqual(first);
    expect(first).toEqual({ people: 3, threads: 12, members: 15, rows: 26, notes: 6, memories: 9, events: 6, keys: 3 });
  });

  it("keeps Sam's session across a reseed", async () => {
    await seedStoreDemo();
    const cookie = await signInAsSam();
    expect(cookie).toMatch(/^better-auth\.session_token=[^.]+\..+/);
    await seedStoreDemo();
    const token = cookie.split("=")[1]!.split(".")[0]!;
    const row = await db.selectFrom("sessions").select("account_id").where("token", "=", token).executeTakeFirst();
    expect(row?.account_id).toBe(SAM);
  });

  it("clears, leaving nobody behind", async () => {
    await seedStoreDemo();
    await clearStoreDemo();
    expect(await counts()).toEqual({ people: 0, threads: 0, members: 0, rows: 0, notes: 0, memories: 0, events: 0, keys: 0 });
  });
});
