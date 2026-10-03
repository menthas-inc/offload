// 034 AC-38 to AC-42 and AC-45. Health's Jobs view and the queue on Now: the
// queue as the job table has it, hourly history that outlives the job table,
// one row per scheduled kind, the stuck and the dead, and what Retry and
// Dismiss do to a dead job.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { SCHEDULED } from "../src/jobs/schedule.js";
import { STALE_AFTER_SECONDS } from "../src/jobs/queue.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { rollup } from "../src/health/rollup.js";
import { CHAINS } from "../src/health/scheduled.js";
import { startHealthJobs } from "../src/health/jobs.js";
import { MARK } from "./admin-off1-kit.js";
import { activeAccount, auditEntries, staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
let owner: { id: string; cookie: string };
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await wipeAdmin();
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await wipeAdmin();
  owner = await staffMember("owner");
  // Letting the owner in booked their invite email. This file counts jobs.
  await db.deleteFrom("jobs").execute();
});

const get = async (path: string, cookie = owner.cookie) => {
  const response = await app.inject({ method: "GET", url: `/v1/admin${path}`, headers: { cookie } });
  expect(response.statusCode, path).toBe(200);
  return response.json();
};
const post = (path: string, cookie = owner.cookie) => app.inject({ method: "POST", url: `/v1/admin${path}`, headers: { cookie } });

interface Seed {
  kind: string;
  state?: "queued" | "running" | "done" | "dead";
  account?: string | null;
  priority?: number;
  /** Minutes ago it was due. Negative is still to come. */
  due?: number;
  /** Minutes ago it was claimed. */
  locked?: number | null;
  /** Minutes ago it last changed. */
  updated?: number;
  attempts?: number;
  max?: number;
  code?: string | null;
}

async function job(seed: Seed): Promise<string> {
  const row = await sql<{ id: string }>`
    insert into jobs (kind, account_id, payload, priority, state, run_after, locked_at, attempts, max_attempts, error_code, last_error, created_at, updated_at)
    values (
      ${seed.kind}, ${seed.account ?? null}, ${JSON.stringify({ mark: MARK })}::jsonb, ${seed.priority ?? 100}, ${seed.state ?? "queued"},
      now() - make_interval(mins => ${seed.due ?? 0}),
      ${seed.locked === undefined || seed.locked === null ? null : sql`now() - make_interval(mins => ${seed.locked})`},
      ${seed.attempts ?? 0}, ${seed.max ?? 5}, ${seed.code ?? null}, ${seed.code ? MARK : null},
      now() - make_interval(mins => ${Math.max(seed.due ?? 0, seed.updated ?? 0)}),
      now() - make_interval(mins => ${seed.updated ?? 0})
    ) returning id`.execute(db);
  return row.rows[0]!.id;
}

const stat = (hoursAgo: number, kind: string, outcome: string, count: number, wait = 0, p95 = 0) =>
  sql`
    insert into job_stats_hourly (hour, kind, outcome, count, wait_ms_sum, wait_ms_p95)
    values (date_trunc('hour', now(), 'UTC') - make_interval(hours => ${hoursAgo}), ${kind}, ${outcome}, ${count}, ${wait}, ${p95})`.execute(db);

describe("AC-38 the queue now", () => {
  it("counts what is waiting by priority, how old the oldest is, and what is running", async () => {
    await job({ kind: "dump.answer", priority: 10, due: 3 });
    await job({ kind: "calendar.sync", priority: 100, due: 1 });
    await job({ kind: "calendar.sync", priority: 100, due: 2 });
    await job({ kind: "embed.sweep", priority: 200, due: 9 });
    // Booked for tomorrow: on the schedule, not waiting.
    await job({ kind: "jobs.purge", priority: 200, due: -600 });
    await job({ kind: "thread.nightly", state: "running", locked: 1, due: 2 });
    await job({ kind: "email.invited", state: "done", due: 5, updated: 5 });

    const { now } = await get("/health/queue?range=24h");
    expect(now.waiting).toEqual([
      { priority: "interactive", count: 1 },
      { priority: "scheduled", count: 2 },
      { priority: "background", count: 1 },
    ]);
    expect(now.running).toBe(1);
    expect(now.oldestSeconds).toBeGreaterThanOrEqual(9 * 60);
    expect(now.oldestSeconds).toBeLessThan(10 * 60);
  });

  it("has no oldest age when nothing is waiting", async () => {
    const { now } = await get("/health/queue");
    expect(now).toEqual({
      waiting: [
        { priority: "interactive", count: 0 },
        { priority: "scheduled", count: 0 },
        { priority: "background", count: 0 },
      ],
      oldestSeconds: null,
      running: 0,
    });
  });
});

describe("AC-38 the queue over the range", () => {
  it("gives finishes, failures, deaths and waits per hour over a day, zero where nothing ran", async () => {
    await stat(2, "dump.answer", "done", 7, 7000, 1900);
    await stat(2, "calendar.sync", "done", 3, 600, 400);
    await stat(2, "calendar.sync", "failed", 2);
    await stat(5, "email.invited", "dead", 1);
    const body = await get("/health/queue?range=24h");
    expect(body.points).toHaveLength(24);
    const at = (hoursAgo: number) => body.points[23 - hoursAgo];
    expect(at(2)).toMatchObject({ finished: 10, failed: 2, dead: 0, waitMsSum: 7600, waitMsP95: 1900 });
    expect(at(5)).toMatchObject({ finished: 0, failed: 0, dead: 1 });
    expect(at(0)).toMatchObject({ finished: 0, failed: 0, dead: 0, waitMsSum: 0, waitMsP95: 0 });
    expect(new Date(at(0).at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("gives one point per UTC day over longer ranges, and says when history starts", async () => {
    await stat(30, "dump.answer", "done", 4);
    await stat(31, "dump.answer", "done", 5);
    const body = await get("/health/queue?range=7d");
    expect(body.points).toHaveLength(7);
    expect(body.points.reduce((sum: number, point: { finished: number }) => sum + point.finished, 0)).toBe(9);
    expect(body.points.every((point: { at: string }) => point.at.endsWith("T00:00:00.000Z"))).toBe(true);
    expect(Date.now() - new Date(body.historyStarts).getTime()).toBeGreaterThan(31 * 3_600_000);
    expect((await get("/health/queue?range=90d")).points).toHaveLength(90);
  });

  it("says history has not started when there is none", async () => {
    expect((await get("/health/queue")).historyStarts).toBeNull();
  });
});

describe("health.rollup", () => {
  const rows = () => db.selectFrom("job_stats_hourly").select(["kind", "outcome", "count", "wait_ms_sum", "wait_ms_p95", "run_ms_sum"]).orderBy("kind").orderBy("outcome").execute();

  it("closes each finished hour into counts per kind and outcome, with waits", async () => {
    // All in the hour before this one. Due one minute before each finished,
    // except one that waited three.
    const finished = 61;
    await job({ kind: "dump.answer", state: "done", due: finished + 1, updated: finished });
    await job({ kind: "dump.answer", state: "done", due: finished + 3, updated: finished });
    // A turn the worker closed as done with why it failed.
    await job({ kind: "dump.answer", state: "done", due: finished + 1, updated: finished, code: "model_error" });
    // A failed attempt waiting for its next one.
    await job({ kind: "calendar.sync", state: "queued", due: -5, updated: finished, attempts: 1, code: "vendor_error" });
    await job({ kind: "email.invited", state: "dead", due: finished, updated: finished, attempts: 5, code: "mail_failed" });
    // Not finished: nothing to count.
    await job({ kind: "embed.sweep", state: "queued", due: finished, updated: finished });
    await job({ kind: "thread.nightly", state: "running", locked: finished, due: finished, updated: finished });

    await rollup();
    const all = await rows();
    expect(all.map((row) => [row.kind, row.outcome, row.count])).toEqual([
      ["calendar.sync", "failed", 1],
      ["dump.answer", "done", 2],
      ["dump.answer", "failed", 1],
      ["email.invited", "dead", 1],
    ]);
    const done = all.find((row) => row.kind === "dump.answer" && row.outcome === "done")!;
    // One and three minutes, give or take the insert.
    expect(Number(done.wait_ms_sum)).toBeGreaterThan(239_000);
    expect(Number(done.wait_ms_sum)).toBeLessThan(241_000);
    expect(done.wait_ms_p95).toBeGreaterThan(170_000);
    expect(done.wait_ms_p95).toBeLessThanOrEqual(180_100);
  });

  it("splits wait from run when the row still says when it was claimed", async () => {
    await job({ kind: "dump.answer", state: "done", due: 70, locked: 68, updated: 65 });
    await rollup();
    const [row] = await rows();
    expect(Math.round(Number(row!.wait_ms_sum) / 1000)).toBe(120);
    expect(Math.round(Number(row!.run_ms_sum) / 1000)).toBe(180);
  });

  it("leaves the hour in progress alone", async () => {
    await sql`
      insert into jobs (kind, payload, state, run_after, updated_at)
      values ('dump.answer', '{}'::jsonb, 'done', date_trunc('hour', now()), date_trunc('hour', now()))`.execute(db);
    await rollup();
    expect(await rows()).toEqual([]);
  });

  it("is the same after a second run, and does not count an hour twice", async () => {
    await job({ kind: "dump.answer", state: "done", due: 62, updated: 61 });
    await rollup();
    const first = await rows();
    await rollup();
    expect(await rows()).toEqual(first);
    expect(first[0]!.count).toBe(1);
  });

  it("goes back 48 hours and no further", async () => {
    await job({ kind: "dump.answer", state: "done", due: 47 * 60, updated: 47 * 60 });
    await job({ kind: "dump.answer", state: "done", due: 50 * 60, updated: 50 * 60 });
    await rollup();
    expect((await rows()).map((row) => row.count)).toEqual([1]);
  });

  it("has no account in it", async () => {
    const columns = await sql<{ column_name: string }>`
      select column_name from information_schema.columns where table_name = 'job_stats_hourly'`.execute(db);
    expect(columns.rows.map((row) => row.column_name).filter((name) => name.includes("account"))).toEqual([]);
  });

  it("re-arms itself on the hour before it does the work, and starts at boot", async () => {
    await startHealthJobs();
    await startHealthJobs();
    const booted = await db.selectFrom("jobs").select(["kind", "state"]).where("kind", "=", "health.rollup").execute();
    expect(booted).toEqual([{ kind: "health.rollup", state: "queued" }]);

    await handlers["health.rollup"]!({}, { mailer: new MemoryMailer() }, null);
    const next = await sql<{ ahead: boolean; on_the_hour: boolean }>`
      select run_after > now() as ahead, run_after = date_trunc('hour', run_after) as on_the_hour
      from jobs where kind = 'health.rollup' order by run_after desc limit 1`.execute(db);
    expect(next.rows[0]).toEqual({ ahead: true, on_the_hour: true });
  });

  it("AC-45 leaves a 90 day plot the same after the purge takes the jobs", async () => {
    for (const hour of [2, 3, 20]) {
      await job({ kind: "thread.nightly", state: "done", due: hour * 60 + 2, updated: hour * 60 });
      await job({ kind: "thread.nightly", state: "dead", due: hour * 60, updated: hour * 60, attempts: 3, max: 3, code: "nightly_error" });
      await job({ kind: "dump.answer", state: "done", due: hour * 60 + 1, updated: hour * 60 });
    }
    await rollup();
    const before = [await get("/health/queue?range=90d"), await get("/health/scheduled/thread.nightly?range=90d")];
    expect(before[0].points.reduce((sum: number, point: { finished: number }) => sum + point.finished, 0)).toBe(6);
    expect(before[0].points.reduce((sum: number, point: { dead: number }) => sum + point.dead, 0)).toBe(3);

    // A month on: the purge removes every one of those jobs.
    await sql`update jobs set updated_at = updated_at - interval '31 days' where kind in ('thread.nightly', 'dump.answer')`.execute(db);
    await handlers["jobs.purge"]!({}, { mailer: new MemoryMailer() }, null);
    expect(await db.selectFrom("jobs").select("id").where("kind", "in", ["thread.nightly", "dump.answer"]).execute()).toEqual([]);

    const after = [await get("/health/queue?range=90d"), await get("/health/scheduled/thread.nightly?range=90d")];
    expect(after[0].points).toEqual(before[0].points);
    expect(after[1].points).toEqual(before[1].points);
    expect(after[1].nights).toEqual(before[1].nights);
  });
});

type ScheduledRow = {
  kind: string;
  does: string;
  cadence: string;
  runner: string;
  last: { at: string; outcome: string; durationMs: number | null } | null;
  next: string | null;
  runs: number;
  failures: number;
  late: boolean;
};

describe("AC-39 and AC-40 scheduled jobs", () => {
  const row = (body: { jobs: ScheduledRow[] }, kind: string) => body.jobs.find((one) => one.kind === kind)!;

  it("has one row for every scheduled kind in the registry, as the registry describes it", async () => {
    const body = await get("/health/scheduled?range=7d");
    expect(body.jobs.map((one: ScheduledRow) => one.kind)).toEqual(SCHEDULED.map((one) => one.kind));
    for (const entry of SCHEDULED) {
      expect(row(body, entry.kind)).toMatchObject({ does: entry.does, cadence: entry.cadence, runner: entry.runner, last: null, next: null, runs: 0, failures: 0, late: false });
    }
  });

  it("gives the last run, the next run and the range's counts", async () => {
    await job({ kind: "jobs.purge", state: "done", due: 30 * 60, updated: 30 * 60 });
    await job({ kind: "jobs.purge", state: "done", due: 6 * 60 + 2, updated: 6 * 60 });
    await job({ kind: "jobs.purge", state: "queued", due: -18 * 60, priority: 200 });
    await stat(6, "jobs.purge", "done", 1);
    await stat(30, "jobs.purge", "done", 1);
    await stat(54, "jobs.purge", "failed", 1);
    await stat(24 * 20, "jobs.purge", "dead", 1);

    const purge = row(await get("/health/scheduled?range=7d"), "jobs.purge");
    expect(purge.last).toMatchObject({ outcome: "done" });
    expect(Math.round((Date.now() - new Date(purge.last!.at).getTime()) / 60_000)).toBe(6 * 60);
    expect(Math.round((new Date(purge.next!).getTime() - Date.now()) / 60_000)).toBe(18 * 60);
    expect(purge).toMatchObject({ runs: 3, failures: 1, late: false });
    expect(row(await get("/health/scheduled?range=30d"), "jobs.purge")).toMatchObject({ runs: 4, failures: 2 });
  });

  it("says how the last run ended when it failed or died", async () => {
    await job({ kind: "analytics.ship", state: "dead", due: 10, updated: 10, attempts: 3, max: 3, code: "handler_error" });
    await job({ kind: "people.daily", state: "queued", due: -10, updated: 5, attempts: 1, code: "handler_error" });
    const body = await get("/health/scheduled");
    expect(row(body, "analytics.ship").last).toMatchObject({ outcome: "dead" });
    expect(row(body, "people.daily").last).toMatchObject({ outcome: "failed" });
  });

  it("takes the earliest queued row as the next run of a kind booked per account", async () => {
    await job({ kind: "calendar.sync", due: -14 });
    await job({ kind: "calendar.sync", due: -3 });
    const sync = row(await get("/health/scheduled"), "calendar.sync");
    expect(Math.round((new Date(sync.next!).getTime() - Date.now()) / 60_000)).toBe(3);
    expect(sync.late).toBe(false);
  });

  it("marks a job late once it is past due by more than its grace, and not before", async () => {
    const hourly = SCHEDULED.find((one) => one.kind === "digest.schedule")!;
    const id = await job({ kind: "digest.schedule", due: hourly.graceMinutes - 1 });
    expect(row(await get("/health/scheduled"), "digest.schedule").late).toBe(false);
    await sql`update jobs set run_after = run_after - interval '2 minutes' where id = ${id}`.execute(db);
    expect(row(await get("/health/scheduled"), "digest.schedule").late).toBe(true);
  });

  it("marks a chain late when it has run before and nothing is booked", async () => {
    expect(CHAINS.has("jobs.purge")).toBe(true);
    await job({ kind: "jobs.purge", state: "done", due: 26 * 60, updated: 26 * 60 });
    // Booked on demand: nothing waiting is its ordinary state.
    await job({ kind: "content.purge", state: "done", due: 26 * 60, updated: 26 * 60 });
    const body = await get("/health/scheduled");
    expect(row(body, "jobs.purge").late).toBe(true);
    expect(row(body, "content.purge").late).toBe(false);
  });

  it("does not call a chain late while its run is in hand", async () => {
    await job({ kind: "jobs.purge", state: "done", due: 26 * 60, updated: 26 * 60 });
    await job({ kind: "jobs.purge", state: "running", locked: 0, due: 1, attempts: 1 });
    expect(row(await get("/health/scheduled"), "jobs.purge").late).toBe(false);
  });

  it("names only chains the registry has", () => {
    const kinds = new Set(SCHEDULED.map((one) => one.kind));
    expect([...CHAINS].filter((kind) => !kinds.has(kind))).toEqual([]);
  });
});

describe("AC-39 one scheduled job's volume", () => {
  it("returns runs and failures per day, zero on a day with nothing", async () => {
    await stat(1, "calendar.sync", "done", 40);
    await stat(1, "calendar.sync", "failed", 2);
    await stat(1, "dump.answer", "done", 99);
    const body = await get("/health/scheduled/calendar.sync?range=7d");
    expect(body.points).toHaveLength(7);
    const total = (key: "runs" | "failures") => body.points.reduce((sum: number, point: Record<string, number>) => sum + point[key]!, 0);
    expect(total("runs")).toBe(42);
    expect(total("failures")).toBe(2);
    expect(body.nights).toBeNull();
  });

  it("shows the nightly pass per night: booked, finished and failed", async () => {
    await stat(1, "thread.nightly", "done", 12);
    await stat(1, "thread.nightly", "dead", 1);
    await stat(1, "thread.nightly", "failed", 2);
    const body = await get("/health/scheduled/thread.nightly?range=7d");
    expect(body.nights).toHaveLength(7);
    const night = body.nights.find((one: { finished: number }) => one.finished > 0);
    expect(night).toMatchObject({ booked: 15, finished: 12, failed: 3 });
  });

  it("counts a pass still waiting as booked", async () => {
    await job({ kind: "thread.nightly", state: "queued", due: 0 });
    const body = await get("/health/scheduled/thread.nightly?range=7d");
    expect(body.nights[6]).toMatchObject({ booked: 1, finished: 0, failed: 0 });
  });

  it("answers 404 for a kind that is not scheduled", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/admin/health/scheduled/dump.answer", headers: { cookie: owner.cookie } });
    expect(response.statusCode).toBe(404);
  });
});

describe("AC-40 stuck", () => {
  it("lists a job that has been running past its kind's limit, and no other", async () => {
    const account = await activeAccount();
    await db.updateTable("accounts").set({ display_name: "Jo Alves" }).where("id", "=", account).execute();
    const limit = Math.ceil(STALE_AFTER_SECONDS / 60);
    const stuck = await job({ kind: "dump.answer", state: "running", account, locked: limit + 1, due: limit + 2, attempts: 1 });
    await job({ kind: "dump.answer", state: "running", locked: limit - 2, due: limit, attempts: 1 });
    await job({ kind: "dump.answer", state: "queued", due: 200 });

    const body = await get("/health/stuck");
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({ id: stuck, kind: "dump.answer", attempts: 1, account: { id: account, name: "Jo Alves" } });
    expect(body.jobs[0].seconds).toBeGreaterThanOrEqual((limit + 1) * 60);
    expect(Object.keys(body.jobs[0]).sort()).toEqual(["account", "attempts", "id", "kind", "seconds", "since"]);
  });
});

describe("AC-41 dead jobs", () => {
  it("lists each with its kind, when, attempts, error code and whose it was", async () => {
    const account = await activeAccount();
    await db.updateTable("accounts").set({ display_name: "Jo Alves" }).where("id", "=", account).execute();
    const first = await job({ kind: "dump.answer", state: "dead", account, due: 10, updated: 9, attempts: 2, max: 2, code: "model_error" });
    const second = await job({ kind: "jobs.purge", state: "dead", due: 5, updated: 4, attempts: 3, max: 3, code: "handler_error" });
    await job({ kind: "dump.answer", state: "done", account, due: 3, updated: 3 });

    const body = await get("/health/dead");
    expect(body.nextCursor).toBeNull();
    expect(body.jobs.map((one: { id: string }) => one.id)).toEqual([first, second].sort().reverse());
    const of = (id: string) => body.jobs.find((one: { id: string }) => one.id === id);
    expect(of(first)).toMatchObject({ kind: "dump.answer", attempts: 2, errorCode: "model_error", retried: false, account: { id: account, name: "Jo Alves" } });
    expect(of(second)).toMatchObject({ kind: "jobs.purge", errorCode: "handler_error", account: null });
    expect(Math.round((Date.now() - new Date(of(first).at).getTime()) / 60_000)).toBe(9);
    expect(Object.keys(body.jobs[0]).sort()).toEqual(["account", "at", "attempts", "errorCode", "id", "kind", "retried"]);
  });

  it("never carries the error text or the payload", async () => {
    await job({ kind: "dump.answer", state: "dead", due: 1, updated: 1, attempts: 2, max: 2, code: "model_error" });
    const response = await app.inject({ method: "GET", url: "/v1/admin/health/dead", headers: { cookie: owner.cookie } });
    expect(response.payload).not.toContain(MARK);
  });

  it("pages by cursor, fifty at a time, newest first", async () => {
    for (let index = 0; index < 52; index += 1) await job({ kind: "email.invited", state: "dead", due: 1, updated: 1, attempts: 5, code: "mail_failed" });
    const first = await get("/health/dead");
    expect(first.jobs).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const second = await get(`/health/dead?cursor=${first.nextCursor}`);
    expect(second.jobs).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.jobs, ...second.jobs].map((one: { id: string }) => one.id);
    expect(new Set(ids).size).toBe(52);
    expect([...ids].sort().reverse()).toEqual(ids);
  });
});

describe("AC-42 retry", () => {
  const dead = (account: string | null, extra: Partial<Seed> = {}) =>
    job({ kind: "dump.answer", state: "dead", account, due: 10, updated: 9, attempts: 2, max: 2, code: "model_error", ...extra });
  const read = (id: string) =>
    db.selectFrom("jobs").select(["state", "attempts", "max_attempts", "retried_at", "error_code", "run_after", "dismissed_at"]).where("id", "=", id).executeTakeFirstOrThrow();

  it("gives a dead job exactly one more attempt, now, and records who did it", async () => {
    const account = await activeAccount();
    const id = await dead(account);
    const response = await post(`/jobs/${id}/retry`);
    expect(response.statusCode).toBe(200);
    const row = await read(id);
    expect(row).toMatchObject({ state: "queued", attempts: 2, max_attempts: 3, error_code: "model_error" });
    expect(row.retried_at).not.toBeNull();
    expect(Math.abs(Date.now() - (row.run_after as Date).getTime())).toBeLessThan(5_000);
    expect(await auditEntries()).toEqual([
      expect.objectContaining({ kind: "job.retried", staff_account_id: owner.id, target_account_id: account, job_id: id }),
    ]);
  });

  it("works once per job: a second call changes nothing, and neither does one after it dies again", async () => {
    const account = await activeAccount();
    const id = await dead(account);
    expect((await post(`/jobs/${id}/retry`)).statusCode).toBe(200);
    const once = await read(id);
    const again = await post(`/jobs/${id}/retry`);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "not_dead" });
    expect(await read(id)).toEqual(once);

    await db.updateTable("jobs").set({ state: "dead", attempts: 3 }).where("id", "=", id).execute();
    const third = await post(`/jobs/${id}/retry`);
    expect(third.statusCode).toBe(409);
    expect(third.json()).toEqual({ error: "already_retried" });
    expect((await read(id)).max_attempts).toBe(3);
    expect(await auditEntries()).toHaveLength(1);
  });

  it("is refused for a disabled account, and nothing changes", async () => {
    const account = await activeAccount();
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", account).execute();
    const id = await dead(account);
    const response = await post(`/jobs/${id}/retry`);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "account_off" });
    expect(await read(id)).toMatchObject({ state: "dead", max_attempts: 2, retried_at: null });
    expect(await auditEntries()).toEqual([]);
  });

  it("is refused for an account at its cap", async () => {
    const account = await activeAccount();
    await sql`insert into account_limits (account_id, key, value) values (${account}, 'cap.turns', 1)`.execute(db);
    await job({ kind: "dump.answer", state: "done", account, due: 5, updated: 5 });
    const id = await dead(account, { kind: "email.invited", code: "mail_failed" });
    const response = await post(`/jobs/${id}/retry`);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "at_limit" });
    expect((await read(id)).state).toBe("dead");
  });

  it("answers 404 for a job that does not exist, and for one that is not a job id at all", async () => {
    expect((await post("/jobs/018f0000-0000-7000-8000-000000000000/retry")).statusCode).toBe(404);
    expect((await post("/jobs/nonsense/retry")).statusCode).toBe(400);
  });

  it("refuses a job that is not dead", async () => {
    const id = await job({ kind: "dump.answer", state: "queued", account: await activeAccount() });
    const response = await post(`/jobs/${id}/retry`);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "not_dead" });
  });

  it("lets support retry a person's job, and only an owner retry one that is nobody's", async () => {
    const support = await staffMember("support");
    const theirs = await dead(await activeAccount());
    const nobodys = await dead(null, { kind: "jobs.purge", code: "handler_error" });

    expect((await post(`/jobs/${theirs}/retry`, support.cookie)).statusCode).toBe(200);
    const refused = await post(`/jobs/${nobodys}/retry`, support.cookie);
    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toEqual({ error: "not-found" });
    expect((await read(nobodys)).state).toBe("dead");

    expect((await post(`/jobs/${nobodys}/retry`)).statusCode).toBe(200);
    expect((await read(nobodys)).state).toBe("queued");
  });
});

describe("AC-42 dismiss", () => {
  it("takes the job off the list and keeps its row", async () => {
    const account = await activeAccount();
    const id = await job({ kind: "dump.answer", state: "dead", account, due: 10, updated: 9, attempts: 2, max: 2, code: "model_error" });
    const response = await post(`/jobs/${id}/dismiss`);
    expect(response.statusCode).toBe(200);

    expect((await get("/health/dead")).jobs).toEqual([]);
    const row = await db.selectFrom("jobs").select(["state", "dismissed_at"]).where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.state).toBe("dead");
    expect(row.dismissed_at).not.toBeNull();
    expect(await auditEntries()).toEqual([
      expect.objectContaining({ kind: "job.dismissed", staff_account_id: owner.id, target_account_id: account, job_id: id }),
    ]);
  });

  it("changes nothing the second time", async () => {
    const id = await job({ kind: "jobs.purge", state: "dead", due: 10, updated: 9, attempts: 3, max: 3, code: "handler_error" });
    expect((await post(`/jobs/${id}/dismiss`)).statusCode).toBe(200);
    const again = await post(`/jobs/${id}/dismiss`);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "already_dismissed" });
    expect(await auditEntries()).toHaveLength(1);
  });

  it("is an owner's: support does not see it", async () => {
    const support = await staffMember("support");
    const id = await job({ kind: "dump.answer", state: "dead", account: await activeAccount(), due: 10, updated: 9, attempts: 2, max: 2, code: "model_error" });
    const response = await post(`/jobs/${id}/dismiss`, support.cookie);
    expect(response.statusCode).toBe(404);
    expect((await db.selectFrom("jobs").select("dismissed_at").where("id", "=", id).executeTakeFirstOrThrow()).dismissed_at).toBeNull();
  });

  it("answers 404 for a job that does not exist", async () => {
    expect((await post("/jobs/018f0000-0000-7000-8000-000000000000/dismiss")).statusCode).toBe(404);
  });
});
