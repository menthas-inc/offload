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
  // 0009; `notes` was missed until the sweep started embedding them.
  for (const table of ["content", "notes", "messages", "threads", "thread_members"]) {
    it(`reads ${table}`, async () => {
      const { allowed, error } = await asAgent(`select 1 from ${table} limit 1`);
      expect(allowed, error).toBe(true);
    });
  }

  // Writing what it embeds. A chunk is a derived index of a row, rebuilt by the
  // sweep whenever it is missing or stale, which is why the one writer rule
  // does not reach it.
  for (const table of ["content_chunks", "note_chunks", "message_chunks"]) {
    it(`writes ${table}`, async () => {
      const del = await asAgent(`delete from ${table} where false`);
      expect(del.allowed, del.error).toBe(true);
      const upd = await asAgent(`update ${table} set embedded_at = now() where false`);
      expect(upd.allowed, upd.error).toBe(true);
    });
  }

  // 040. A memory's own vector, on its own row, and nothing else of it.
  it("writes a memory's embedding and no other column of notes", async () => {
    const vector = await asAgent(`update notes set embedding = null, embedding_model = null, embedded_at = now() where false`);
    expect(vector.allowed, vector.error).toBe(true);
    for (const column of ["text", "kind", "place_dx", "deleted_at"]) {
      const other = await asAgent(`update notes set ${column} = null where false`);
      expect(other.allowed, `it could write notes.${column}`).toBe(false);
    }
  });

  // 034. The three switches the worker reads on every turn, and the code it
  // writes beside the reason when a job fails.
  it("reads app_settings", async () => {
    const { allowed, error } = await asAgent(`select key, value from app_settings limit 1`);
    expect(allowed, error).toBe(true);
    const write = await asAgent(`delete from app_settings where false`);
    expect(write.allowed, "it could write app_settings").toBe(false);
  });

  it("writes a job's error code", async () => {
    const { allowed, error } = await asAgent(`update jobs set error_code = 'stale' where false`);
    expect(allowed, error).toBe(true);
  });

  it("claims a job", async () => {
    const { allowed, error } = await asAgent(`update jobs set state = state where false`);
    expect(allowed, error).toBe(true);
  });
});

describe("and no more than its job", () => {
  // 0009 and 0010 are both about keeping this role small, and 0015 exists
  // because a grant was added on an assumption that turned out to be wrong. The
  // narrowness is the point, so it is asserted rather than trusted.
  // 022's tables stay on this side of the boundary: the share tool resolves
  // people in core-api, and the mark is not the worker's to read. The pair
  // table alone is readable, for "has this account any connection".
  for (const table of [
    "sessions",
    "account_identities",
    "account_keys",
    "thread_keys",
    "staff",
    "connection_requests",
    "blocks",
    "pending_shares",
    "people_lookups",
    "visible_people",
  ]) {
    it(`cannot read ${table}`, async () => {
      const { allowed, error } = await asAgent(`select 1 from ${table} limit 1`);
      expect(allowed, `it could read ${table}`).toBe(false);
      expect(error).toMatch(/permission denied/i);
    });
  }

  for (const table of ["content", "notes", "messages", "threads"]) {
    it(`cannot write ${table}`, async () => {
      const { allowed } = await asAgent(`delete from ${table} where false`);
      expect(allowed, `it could delete from ${table}`).toBe(false);
    });
  }

  // 020. Which photos a message carries and when their renditions landed.
  // Never the file's name, the exact coordinate or the device, which are
  // the dumper's and reach the worker through no read it has.
  it("reads five columns of blobs, never the name or the coordinate", async () => {
    const ok = await asAgent("select id, message_id, created_at, deleted_at, renditions_at from blobs limit 1");
    expect(ok.allowed, ok.error).toBe(true);
    for (const column of ["name", "latitude", "longitude", "device", "town"]) {
      const nope = await asAgent(`select ${column} from blobs limit 1`);
      expect(nope.allowed, `it could read blobs.${column}`).toBe(false);
    }
    const links = await asAgent("select 1 from content_blobs limit 1");
    expect(links.allowed, links.error).toBe(true);
    const keys = await asAgent("select 1 from blob_keys limit 1");
    expect(keys.allowed, "it could read blob_keys").toBe(false);
  });

  it("reads whether an account has a connection, and no more of 022", async () => {
    const ok = await asAgent("select 1 from connections limit 1");
    expect(ok.allowed, ok.error).toBe(true);
    const nope = await asAgent("delete from connections where false");
    expect(nope.allowed, "it could write connections").toBe(false);
  });

  it("reads only three columns of accounts, never the address", async () => {
    const ok = await asAgent("select id, state, default_thread_id from accounts limit 1");
    expect(ok.allowed, ok.error).toBe(true);

    const nope = await asAgent("select email from accounts limit 1");
    expect(nope.allowed, "it could read an email address").toBe(false);
    const mark = await asAgent("select avatar_png from accounts limit 1");
    expect(mark.allowed, "it could read a mark").toBe(false);
  });
});

// 038. The memory pass reads since the account's last pass, and never learns
// again from a forgotten memory's message. It writes neither: the Core API
// stamps the pass and records what was forgotten. Found by running the pass
// against a local worker, which connects as this role and the suite does not.
describe("038 the memory pass", () => {
  it("reads the last pass's stamp and the forgotten sources, and writes neither", async () => {
    const stamp = await asAgent("select memories_at from accounts limit 1");
    expect(stamp.allowed, stamp.error).toBe(true);
    const forgotten = await asAgent("select account_id, message_id from memory_forgotten limit 1");
    expect(forgotten.allowed, forgotten.error).toBe(true);
    const write = await asAgent("delete from memory_forgotten where false");
    expect(write.allowed, "it could write memory_forgotten").toBe(false);
    const stampWrite = await asAgent("update accounts set memories_at = now() where false");
    expect(stampWrite.allowed, "it could stamp the pass").toBe(false);
  });
});
