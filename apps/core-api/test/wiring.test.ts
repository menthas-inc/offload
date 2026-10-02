// The wiring the server does, tested where a test can see it.
//
// This file exists because of one bug: nothing drained the jobs table in
// production. Enqueueing was correct and transactional, every handler was
// tested, and no email had ever been sent, because each test built its own
// JobRunner and drained it by hand while the server built none. A suite cannot
// notice a call it never makes itself, so the wiring is a function now and
// this asserts it.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { createJobRunner } from "../src/jobs/runner.js";
import { handlers } from "../src/jobs/handlers.js";
import { MODEL_KINDS } from "../src/jobs/kinds.js";
import { MemoryMailer } from "../src/mail/index.js";
import { enqueue } from "../src/jobs/queue.js";
import { promote } from "../src/admin/promote.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("staff").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("account_identities").execute();
  await db.deleteFrom("accounts").execute();
});

describe("the job runner the server builds", () => {
  it("exists as a factory the server can call", () => {
    const mailer = new MemoryMailer();
    const runner = createJobRunner(undefined, () => mailer);
    expect(runner).toBeDefined();
    expect(typeof runner.start).toBe("function");
    expect(typeof runner.stop).toBe("function");
  });

  it("drains what promotion enqueues, end to end", async () => {
    const mailer = new MemoryMailer();
    const runner = createJobRunner(undefined, () => mailer);

    await promote("ana@example.test");
    expect(await db.selectFrom("jobs").selectAll().execute()).toHaveLength(1);

    // One tick, the way the running server's timer would call it.
    expect(await runner.tick()).toBe(true);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("ana@example.test");

    const jobs = await db.selectFrom("jobs").select(["state"]).execute();
    expect(jobs[0]?.state).toBe("done");
  });

  it("has a handler for every kind anything enqueues", async () => {
    // A job with no handler is a row that retries until it dies, silently,
    // which looks exactly like a job that has not run yet.
    const kinds = ["email.waitlist_joined", "email.invited"];
    for (const kind of kinds) expect(Object.keys(handlers)).toContain(kind);
  });

  it("leaves a kind it does not handle for the runner that does", async () => {
    const mailer = new MemoryMailer();
    const runner = createJobRunner(undefined, () => mailer);

    // dump.answer belongs to the Python worker. This runner used to claim
    // anything, and it treats an unhandled kind as a deploy problem and fails
    // it on the spot, so unscoped it would have killed every dump before the
    // worker ever saw one.
    await enqueue({ kind: "dump.answer", payload: {} });
    expect(await runner.tick()).toBe(false);

    const job = await db
      .selectFrom("jobs")
      .select(["state", "attempts"])
      .where("kind", "=", "dump.answer")
      .executeTakeFirstOrThrow();
    expect(job.state).toBe("queued");
    expect(job.attempts).toBe(0);
  });

  it("has an owner for every kind anything enqueues", async () => {
    // What the previous version of this test was really guarding, kept now that
    // an unowned kind is skipped quietly rather than failed loudly: a kind
    // nobody drains would sit queued forever and nothing would say so.
    const enqueued = ["email.waitlist_joined", "email.invited", "dump.answer", "thread.nightly"];
    const owned = new Set<string>([...Object.keys(handlers), ...MODEL_KINDS]);
    expect(enqueued.filter((k) => !owned.has(k))).toEqual([]);
  });
});

// 032 AC-5. A kind nothing claims any more is closed at deploy rather than
// left queued forever, and a typed row is never left drawn as being sorted.
describe("032 the retired kinds", () => {
  it("closes queued and running jobs of every retired kind, and clears filing_at", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const retired = ["thread.quick_add", "notes.compact", "loose.propose", "labels.sort"];
    const ids: string[] = [];
    for (const kind of retired) {
      const row = await db
        .insertInto("jobs")
        .values({ kind, payload: JSON.stringify({}), priority: 100, run_after: new Date(), state: "queued" } as never)
        .returning("id")
        .executeTakeFirstOrThrow();
      ids.push(row.id);
    }
    const live = await db
      .insertInto("jobs")
      .values({ kind: "dump.answer", payload: JSON.stringify({}), priority: 10, run_after: new Date(), state: "queued" } as never)
      .returning("id")
      .executeTakeFirstOrThrow();

    const file = fileURLToPath(new URL("../migrations/0070_fewer_model_calls.sql", import.meta.url));
    await sql.raw(readFileSync(file, "utf8")).execute(db);

    const states = await db.selectFrom("jobs").select(["id", "state"]).where("id", "in", [...ids, live.id]).execute();
    for (const id of ids) expect(states.find((s) => s.id === id)?.state).toBe("done");
    expect(states.find((s) => s.id === live.id)?.state).toBe("queued");
    const filing = await db.selectFrom("content").select("id").where("filing_at", "is not", null).execute();
    expect(filing).toHaveLength(0);
  });
});
