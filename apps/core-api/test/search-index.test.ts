// The index 013 needs, and the one gotcha 001 wrote down in advance.
//
// AC-12  chunks and their vectors exist, separately from the rows they came from.
// AC-13  a membership-scoped vector query returns the number of rows it asked for.
// AC-15  the agenda read has an index led by thread_id.
//
// **No Voyage in here.** These test pgvector's behaviour, not the embedder's,
// so the vectors are synthetic. A test that needed an API key to prove an index
// works would be a test nobody runs.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

/** A random unit-ish vector, built in SQL so a thousand of them do not cross
 *  the wire. `halfvec` parses the bracketed form, which float8[]'s own text
 *  representation is not. */
const randomVector = sql<string>`('[' || array_to_string(array_agg(random()), ',') || ']')::halfvec(1024)`;

let mine: string;
let myThread: string;

beforeAll(async () => {
  await db.deleteFrom("content_chunks").execute();
  await db.deleteFrom("content").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();

  // One account holding a small share of a populated table, which is the shape
  // that makes a post-filtered index scan under-return. At alpha one account is
  // most of the table and this never bites; the point is that it bites later.
  const accounts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const row = await db
      .insertInto("accounts")
      .values({
        email: `${uuidv7()}@example.com`,
        state: "active",
        email_verified: true,
        analytics_subject_id: uuidv7(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    accounts.push(row.id);
  }
  mine = accounts[0];

  const threads: string[] = [];
  for (const accountId of accounts) {
    const thread = await db
      .insertInto("threads")
      .values({ created_by_account_id: accountId, name: "Trip" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("thread_members")
      .values({ thread_id: thread.id, account_id: accountId, state: "accepted" })
      .execute();
    threads.push(thread.id);
  }
  myThread = threads[0];

  // 60 rows in mine, 1,200 across the others. Built entirely server-side.
  for (let i = 0; i < threads.length; i++) {
    const count = i === 0 ? 60 : 240;
    await sql`
      with rows as (
        insert into content (thread_id, account_id, title, type)
        select ${threads[i]}::uuid, ${accounts[i]}::uuid, 'row ' || g, 'note'
        from generate_series(1, ${count}) g
        returning id, thread_id
      )
      insert into content_chunks (content_id, thread_id, ord, text, embedding, embedded_at)
      select rows.id, rows.thread_id, 0, 'chunk', v.embedding, now()
      from rows
      cross join lateral (
        select ${randomVector} as embedding from generate_series(1, 1024)
      ) v
    `.execute(db);
  }
});

/** One fixed query vector, bound as a parameter.
 *
 *  Not `random()` inline. `random()` is VOLATILE, so an index scan re-evaluates
 *  it and there is no fixed point to search around: the scan returns nothing at
 *  all, which reads as a broken query rather than as a broken query vector.
 *  Production binds the embedding Voyage returned, which is a parameter, so
 *  this is also the shape the real search has. */
function queryVector(): string {
  return `[${Array.from({ length: 1024 }, () => Math.random().toFixed(6)).join(",")}]`;
}

/** The search, as the real one will run it: nearest chunks, scoped by the
 *  membership predicate rather than by author, with the planner denied the
 *  sequential scan that would hide the whole question. */
async function nearest(iterative: "off" | "relaxed_order", limit: number): Promise<number> {
  const probe = queryVector();
  const result = await db.connection().execute(async (conn) => {
    // `set`, not `set local`: outside a transaction `set local` is a no-op with
    // a warning, so it would have measured nothing while looking like it did.
    // A dedicated connection makes the session scope safe, and it is put back
    // below so the pool hands out a connection with the app's own setting.
    await sql`set enable_seqscan = off`.execute(conn);
    await sql.raw(`set hnsw.iterative_scan = ${iterative}`).execute(conn);
    return sql<{ id: string }>`
      select c.id
      from content_chunks c
      join readable_content rc on rc.id = c.content_id
      where rc.viewer_account_id = ${mine}::uuid
        and rc.deleted_at is null
        and c.embedding is not null
      order by c.embedding <=> ${probe}::halfvec(1024)
      limit ${limit}
    `.execute(conn);
  });
  return result.rows.length;
}

/** Put a borrowed connection back the way the pool handed it over. */
async function resetConnection(): Promise<void> {
  await db.connection().execute(async (conn) => {
    await sql`reset enable_seqscan`.execute(conn);
    await sql`set hnsw.iterative_scan = relaxed_order`.execute(conn);
  });
}

describe("AC-13 pgvector filters after the index scan", () => {
  // **There was a test here asserting that `off` under-returns**, as the
  // evidence that this file measures the right thing. It is gone, and the
  // reason is worth keeping.
  //
  // It passed alone and failed in the suite, because it depends on the planner
  // choosing the HNSW path. At this fixture size Postgres can just as
  // reasonably resolve membership first, get sixty content ids, and sort their
  // chunks exactly, which returns the full twenty with iterative scan off and
  // proves nothing either way. Making it stable needs a table big enough that
  // the vector index is the only sensible plan, which is minutes of fixture
  // for one assertion.
  //
  // A test whose result depends on a query plan is a flake, and this repository
  // spent today fixing two of those. What is left below is what the criterion
  // actually asks for.

  it("returns the whole limit with relaxed_order", async () => {
    expect(await nearest("relaxed_order", 20)).toBe(20);
  });

  it("is on by default for every pooled connection", async () => {
    await resetConnection();
    // `current_setting`, not `show`: show names its column after the setting,
    // dots and all, which is not a shape a typed row reads cleanly.
    const row = await sql<{ s: string }>`select current_setting('hnsw.iterative_scan', true) as s`.execute(db);
    expect(row.rows[0].s).toBe("relaxed_order");
  });
});

describe("AC-12 the corpus tables exist and keep chunks apart from vectors", () => {
  it("holds the raw chunk beside its vector, so a model change is a re-embed", async () => {
    const row = await sql<{ text: string; has_vector: boolean }>`
      select text, embedding is not null as has_vector from content_chunks limit 1
    `.execute(db);
    expect(row.rows[0].text).toBe("chunk");
    expect(row.rows[0].has_vector).toBe(true);
  });

  it("has a chunk table per corpus", async () => {
    const rows = await sql<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = current_schema()
        and table_name in ('content_chunks', 'memory_chunks', 'message_chunks')
      order by table_name
    `.execute(db);
    expect(rows.rows.map((r) => r.table_name)).toEqual([
      "content_chunks",
      "memory_chunks",
      "message_chunks",
    ]);
  });

  it("indexes the text half on the source rows, not the chunks", async () => {
    const rows = await sql<{ table_name: string }>`
      select table_name from information_schema.columns
      where table_schema = current_schema() and column_name = 'search_text'
      order by table_name
    `.execute(db);
    expect(rows.rows.map((r) => r.table_name)).toEqual(["content", "memories", "messages"]);
  });

  it("finds an exact term through the generated column", async () => {
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from content
      where thread_id = ${myThread}::uuid
        and search_text @@ websearch_to_tsquery('simple', 'row')
    `.execute(db);
    expect(rows.rows[0].n).toBe(60);
  });
});

describe("AC-15 the agenda read has an index led by thread_id", () => {
  it("has one for each of the three dates a question can mean", async () => {
    const rows = await sql<{ indexname: string }>`
      select indexname from pg_indexes
      where schemaname = current_schema()
        and indexname in ('content_thread_due_idx', 'content_thread_dated_idx', 'content_thread_idx')
      order by indexname
    `.execute(db);
    // due is new here; occurs and created shipped in 0016 and 0011, both
    // already thread-leading. 001's (account_id, occurs_at) was never built.
    expect(rows.rows.map((r) => r.indexname)).toEqual([
      "content_thread_dated_idx",
      "content_thread_due_idx",
      "content_thread_idx",
    ]);
  });
});
