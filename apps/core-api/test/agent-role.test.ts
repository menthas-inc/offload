// What the agent plane's database role may actually do.
//
// **This file exists because deploying found something no test could.** Every
// test connects as the database owner, so a missing grant is invisible here and
// certain in production: 013 added three chunk tables and no grants at all, and
// every embed job failed with `permission denied for table content_chunks` the
// moment it reached Railway. The feature degraded quietly, because a row that
// cannot be embedded is still found by exact terms.
//
// `set role` is what closes the gap. The role is `nologin`, so no test can
// connect as it, but any session can become it inside a transaction and find
// out what it is allowed to do. Rolled back either way.
//
// The rule this encodes: **a new table the agent plane touches is a new grant**,
// and the place that fails when somebody forgets is here rather than in the
// logs of a service nobody is watching.

import { afterAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

/** Run one statement as the agent role and say whether it was allowed.
 *
 *  Always rolled back. The point is the permission check, never the write. */
async function asAgent(statement: string): Promise<{ allowed: boolean; error: string }> {
  try {
    await db.transaction().execute(async (trx) => {
      await sql`set local role offload_agent`.execute(trx);
      await sql.raw(statement).execute(trx);
      // Whatever happened, this transaction does not land.
      throw new Error("__rollback__");
    });
    return { allowed: true, error: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "__rollback__") return { allowed: true, error: "" };
    return { allowed: false, error: message };
  }
}

describe("the agent role can do its job", () => {
  // Reading a row to chunk it. `content` came with 0011 and `messages` with
  // 0009; `memories` was missed until the sweep started embedding them.
  for (const table of ["content", "memories", "messages", "threads", "thread_members"]) {
    it(`reads ${table}`, async () => {
      const { allowed, error } = await asAgent(`select 1 from ${table} limit 1`);
      expect(allowed, error).toBe(true);
    });
  }

  // Writing what it embeds. A chunk is a derived index of a row, rebuilt by the
  // sweep whenever it is missing or stale, which is why the one writer rule
  // does not reach it.
  for (const table of ["content_chunks", "memory_chunks", "message_chunks"]) {
    it(`writes ${table}`, async () => {
      const del = await asAgent(`delete from ${table} where false`);
      expect(del.allowed, del.error).toBe(true);
      const upd = await asAgent(`update ${table} set embedded_at = now() where false`);
      expect(upd.allowed, upd.error).toBe(true);
    });
  }

  it("claims a job", async () => {
    const { allowed, error } = await asAgent(`update jobs set state = state where false`);
    expect(allowed, error).toBe(true);
  });
});

describe("and no more than its job", () => {
  // 0009 and 0010 are both about keeping this role small, and 0015 exists
  // because a grant was added on an assumption that turned out to be wrong. The
  // narrowness is the point, so it is asserted rather than trusted.
  for (const table of ["sessions", "account_identities", "account_keys", "thread_keys", "staff"]) {
    it(`cannot read ${table}`, async () => {
      const { allowed, error } = await asAgent(`select 1 from ${table} limit 1`);
      expect(allowed, `it could read ${table}`).toBe(false);
      expect(error).toMatch(/permission denied/i);
    });
  }

  for (const table of ["content", "memories", "messages", "threads"]) {
    it(`cannot write ${table}`, async () => {
      const { allowed } = await asAgent(`delete from ${table} where false`);
      expect(allowed, `it could delete from ${table}`).toBe(false);
    });
  }

  it("reads only three columns of accounts, never the address", async () => {
    const ok = await asAgent("select id, state, default_thread_id from accounts limit 1");
    expect(ok.allowed, ok.error).toBe(true);

    const nope = await asAgent("select email from accounts limit 1");
    expect(nope.allowed, "it could read an email address").toBe(false);
  });
});
