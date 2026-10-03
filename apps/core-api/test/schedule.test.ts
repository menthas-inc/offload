// 034 AC-39, AC-45 and AC-54. Every job that runs on a schedule has a row in
// one registry, so Health can list it with its cadence and say when it is
// late; and the daily purge keeps the panel's own tables to their windows.
//
// The coverage test reads the source. A kind somebody schedules tomorrow and
// forgets to describe fails here, not as a blank row on Health.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { SCHEDULED } from "../src/jobs/schedule.js";
import { handlers } from "../src/jobs/handlers.js";
import { MODEL_KINDS } from "../src/jobs/kinds.js";
import { MemoryMailer } from "../src/mail/mailer.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../src");

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/** Every kind the codebase books on a clock: named to one of the four
 *  scheduling helpers, or enqueued with `runAfterSeconds`. */
function scheduledInSource(): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of sources()) {
    const text = readFileSync(path, "utf8");
    for (const match of text.matchAll(/\b(?:scheduleDaily|scheduleHourly|startDaily|startHourly)\(\s*"([a-z_.]+)"/g)) {
      found.set(match[1]!, path);
    }
    // An `enqueue({ ... })` that carries `runAfterSeconds`: the kind is the
    // nearest one above it in the same call.
    for (const match of text.matchAll(/runAfterSeconds\s*:/g)) {
      const before = text.slice(0, match.index);
      const call = before.lastIndexOf("enqueue(");
      const kind = /kind:\s*"([a-z_.]+)"/.exec(before.slice(call));
      if (call !== -1 && kind) found.set(kind[1]!, path);
    }
  }
  return found;
}

describe("AC-39 the scheduled registry", () => {
  it("has a row for every kind the codebase books on a clock", () => {
    const registered = new Set(SCHEDULED.map((one) => one.kind));
    const inSource = scheduledInSource();
    // The search finds something, or it proves nothing.
    expect(inSource.size).toBeGreaterThanOrEqual(12);
    const missing = [...inSource].filter(([kind]) => !registered.has(kind)).map(([kind, path]) => `${kind} (${path.slice(SRC.length + 1)})`);
    expect(missing).toEqual([]);
  });

  it("names the kinds the impl-spec lists, once each", () => {
    const kinds = SCHEDULED.map((one) => one.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual(
      [
        "calendar.supervise",
        "jobs.purge",
        "account.daily",
        "blob.daily",
        "places.age",
        "people.daily",
        "digest.schedule",
        "analytics.ship",
        "embed.sweep",
        "calendar.sync",
        "account.daily.run",
        "thread.nightly",
        "account.digest",
        "push.receipts",
        "shared.activity",
        "content.purge",
        "voice.forget",
        "blob.locate",
        "health.rollup",
        "alerts.check",
        "billing.pull",
      ].sort()
    );
  });

  it("says what each does, in one line, how often, and which runner owns it", () => {
    for (const one of SCHEDULED) {
      expect(one.does.length, one.kind).toBeGreaterThan(10);
      expect(one.does, one.kind).not.toMatch(/[\n\u2013\u2014]/);
      expect(["minute", "quarter", "hourly", "daily"], one.kind).toContain(one.cadence);
      expect(one.graceMinutes, one.kind).toBeGreaterThan(0);
      // The registry and the two runners' own lists agree on who drains it.
      // `alerts.check` runs from the heartbeat timer and is not a job.
      if (one.kind === "alerts.check") continue;
      const worker = (MODEL_KINDS as readonly string[]).includes(one.kind) || one.kind === "voice.forget";
      expect(one.runner, one.kind).toBe(worker ? "worker" : "api");
    }
  });
});

describe("AC-45 and AC-54 what the daily purge removes", () => {
  beforeEach(async () => {
    await sql`truncate staff_audit`.execute(db);
    for (const table of ["heartbeats", "job_stats_hourly", "limit_hits", "jobs"] as const) await db.deleteFrom(table).execute();
    await db.deleteFrom("accounts").execute();
  });

  const purge = () => handlers["jobs.purge"]!({}, { mailer: new MemoryMailer() }, null);

  it("keeps heartbeats and hourly history for ninety days", async () => {
    await sql`
      insert into heartbeats (service, minute, ok) values
        ('core-api', date_trunc('minute', now() - interval '91 days'), true),
        ('core-api', date_trunc('minute', now() - interval '89 days'), true)`.execute(db);
    await sql`
      insert into job_stats_hourly (hour, kind, outcome, count) values
        (date_trunc('hour', now() - interval '91 days'), 'dump.answer', 'done', 3),
        (date_trunc('hour', now() - interval '89 days'), 'dump.answer', 'done', 4)`.execute(db);
    await purge();
    expect(await db.selectFrom("heartbeats").select("service").execute()).toHaveLength(1);
    expect(await db.selectFrom("job_stats_hourly").select("count").execute()).toEqual([{ count: 4 }]);
  });

  it("keeps limit hits for thirty days", async () => {
    const account = await db.insertInto("accounts").values({ email: `${uuidv7()}@example.test`, state: "active" }).returning("id").executeTakeFirstOrThrow();
    await sql`
      insert into limit_hits (account_id, cap, scope, day) values
        (${account.id}, 'cap.turns', 'account', (now() - interval '31 days')::date),
        (${account.id}, 'cap.turns', 'account', (now() - interval '29 days')::date)`.execute(db);
    await purge();
    expect(await db.selectFrom("limit_hits").select("cap").execute()).toHaveLength(1);
  });

  it("removes an audit entry once it is two years old, and nothing newer", async () => {
    const staff = uuidv7();
    await db
      .insertInto("staff_audit")
      .values([
        { staff_account_id: staff, kind: "invited", at: sql`now() - interval '2 years 2 days'` },
        { staff_account_id: staff, kind: "resent", at: sql`now() - interval '700 days'` },
      ])
      .execute();
    await purge();
    expect(await db.selectFrom("staff_audit").select("kind").execute()).toEqual([{ kind: "resent" }]);
  });

  it("leaves the hourly history a plot reads untouched by the job table's own thirty days", async () => {
    await sql`insert into job_stats_hourly (hour, kind, outcome, count) values (date_trunc('hour', now() - interval '60 days'), 'dump.answer', 'done', 9)`.execute(db);
    await db
      .insertInto("jobs")
      .values({ kind: "dump.answer", payload: "{}", state: "done", run_after: new Date(), updated_at: sql`now() - interval '60 days'` })
      .execute();
    const before = await db.selectFrom("job_stats_hourly").selectAll().execute();
    await purge();
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "dump.answer").execute()).toEqual([]);
    expect(await db.selectFrom("job_stats_hourly").selectAll().execute()).toEqual(before);
  });
});
