// The store demo (seeds/store-demo.sql) loads into a migrated database, twice,
// and comes out the same, so the App Store screenshots can be remade after any
// migration. A migration that breaks it fails here first.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { clearStoreDemo, seedStoreDemo, signInAsSam, SAM } from "../src/seed-store-demo.js";
import { CONSENT_VERSION } from "../src/routes/session.js";

await migrate(() => {});

afterAll(async () => {
  await clearStoreDemo();
  await closeDb();
});

const counts = async () =>
  (
    await sql<{ people: number; threads: number; members: number; rows: number; notes: number; memories: number; events: number; keys: number; placed: number; kinds: number }>`
      select (select count(*) from accounts where email like '%@demo.offload.test') as people,
             (select count(*) from threads where id::text like '0de70000-0000-4000-a001-%') as threads,
             (select count(*) from thread_members where thread_id::text like '0de70000-0000-4000-a001-%') as members,
             (select count(*) from content where id::text like '0de70000-0000-4000-a005-%') as rows,
             (select count(*) from notes where scope = 'thread' and id::text like '0de70000-0000-4000-a004-%') as notes,
             (select count(*) from notes where scope = 'account' and id::text like '0de70000-0000-4000-a004-%') as memories,
             (select count(*) from connector_events where id::text like '0de70000-0000-4000-a008-%') as events,
             (select count(*) from account_keys where account_id::text like '0de70000-0000-4000-a000-%') as keys,
             (select count(*) from notes where scope = 'account' and id::text like '0de70000-0000-4000-a004-%' and place_dx is not null and embedding is not null) as placed,
             (select count(*) from memory_kind_places where account_id = '0de70000-0000-4000-a000-000000000001') as kinds`.execute(db)
  ).rows[0];

describe("the store demo", () => {
  it("loads, twice, to the same three people", async () => {
    await seedStoreDemo();
    const first = await counts();
    await seedStoreDemo();
    expect(await counts()).toEqual(first);
    expect(first).toEqual({ people: 4, threads: 13, members: 16, rows: 26, notes: 6, memories: 19, events: 6, keys: 4, placed: 19, kinds: 5 });
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

  it("spreads Sam's memories on the map, no two of a kind in one place", async () => {
    await seedStoreDemo();
    const rows = await db
      .selectFrom("notes")
      .select(["kind", "place_dx", "place_dy"])
      .where("scope", "=", "account")
      .where("subject_id", "=", SAM)
      .execute();
    const spots = new Set(rows.map((r) => `${r.kind}:${r.place_dx}:${r.place_dy}`));
    expect(spots.size).toBe(rows.length);
    expect(Math.max(...rows.map((r) => Math.hypot(r.place_dx ?? 0, r.place_dy ?? 0)))).toBeGreaterThan(20);
  });

  it("clears, leaving nobody behind", async () => {
    await seedStoreDemo();
    await clearStoreDemo();
    expect(await counts()).toEqual({ people: 0, threads: 0, members: 0, rows: 0, notes: 0, memories: 0, events: 0, keys: 0, placed: 0, kinds: 0 });
  });

  // 2026-10-10: the seed carried 2026-10-07 after PR 98 moved the version to
  // 2026-10-08, so every demo person was asked to agree again on screen.
  it("has every person agreed to the current consent version", async () => {
    await seedStoreDemo();
    const versions = (
      await sql<{ v: string }>`select distinct consent_version as v from accounts where email like '%@demo.offload.test' and consent_version is not null`.execute(db)
    ).rows.map((r) => r.v);
    expect(versions).toEqual([CONSENT_VERSION]);
  });
});
