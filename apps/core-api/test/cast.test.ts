// 038. The cast (apps/agent/evals/cast/cast.sql) loads into a migrated
// database, twice, and comes out the same. A migration that breaks it fails
// here rather than in the evals or on somebody's laptop.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { clearCast, seedCast, signInAs } from "../src/seed-cast.js";

await migrate(() => {});

// The suite shares one database, and later files count rows of their own.
afterAll(async () => {
  await clearCast();
  await closeDb();
});

const counts = async () =>
  (
    await sql<{ people: string; threads: string; members: string; said: string; memories: string; connections: string }>`
      select (select count(*) from accounts where email like '%@cast.offload.test') as people,
             (select count(*) from threads where id::text like '0ca50000-0000-4000-8001-%') as threads,
             (select count(*) from thread_members where thread_id::text like '0ca50000-0000-4000-8001-%') as members,
             (select count(*) from messages where id::text like '0ca50000-0000-4000-8003-%') as said,
             (select count(*) from notes where scope = 'account' and id::text like '0ca50000-0000-4000-8004-%') as memories,
             (select count(*) from connections where account_a::text like '0ca50000-0000-4000-8000-%') as connections`.execute(db)
  ).rows[0];

describe("the cast", () => {
  it("loads, twice, to the same seven people", async () => {
    await seedCast();
    const first = await counts();
    await seedCast();
    expect(await counts()).toEqual(first);
    expect(first).toEqual({ people: 7, threads: 21, members: 25, said: 19, memories: 5, connections: 4 });
  });

  it("signs in as one of them with a session the API accepts", async () => {
    await seedCast();
    const cookie = await signInAs("ana");
    expect(cookie).toMatch(/^better-auth\.session_token=[^.]+\..+/);
    const rows = await db.selectFrom("sessions").select("account_id").where("account_id", "=", "0ca50000-0000-4000-8000-000000000004").execute();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("clears, leaving nobody behind", async () => {
    await seedCast();
    await clearCast();
    expect(await counts()).toEqual({ people: 0, threads: 0, members: 0, said: 0, memories: 0, connections: 0 });
  });
});
