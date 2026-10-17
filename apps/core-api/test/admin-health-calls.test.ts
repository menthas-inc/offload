// 034 AC-43. Health's Calls view: model calls and latency per job per day from
// the ledger, failures from the job history, and each company offload calls
// with what offload already records about it. A company it records nothing
// about reads as not recorded, never as zero.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { activeAccount, staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
let cookie: string;
let account: string;
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
  cookie = (await staffMember("owner")).cookie;
  account = await activeAccount();
  // Letting those two in booked their invite emails. This file counts jobs.
  await db.deleteFrom("jobs").execute();
});

const get = async (path: string) => {
  const response = await app.inject({ method: "GET", url: `/v1/admin${path}`, headers: { cookie } });
  expect(response.statusCode, path).toBe(200);
  return response.json();
};

const call = (kind: string, latency: number, hoursAgo = 1, model = "claude-sonnet-5") =>
  sql`
    insert into llm_usage (account_id, job_kind, category, model, input_tokens, output_tokens, cost_micros, latency_ms, created_at)
    values (${account}, ${kind}, 'interactive', ${model}, 100, 10, 500, ${latency}, now() - make_interval(hours => ${hoursAgo}))`.execute(db);

const stat = (hoursAgo: number, kind: string, outcome: string, count: number) =>
  sql`
    insert into job_stats_hourly (hour, kind, outcome, count)
    values (date_trunc('hour', now(), 'UTC') - make_interval(hours => ${hoursAgo}), ${kind}, ${outcome}, ${count})`.execute(db);

const lookup = (kind: "search" | "read", outcome: string) =>
  sql`insert into lookups (account_id, label, kind, outcome) values (${account}, ${kind}, ${kind}, ${outcome})`.execute(db);

const failedJob = (kind: string, code: string, daysAgo = 0) =>
  sql`
    insert into jobs (kind, payload, state, run_after, attempts, error_code, updated_at)
    values (${kind}, '{}'::jsonb, 'dead', now(), 2, ${code}, now() - make_interval(days => ${daysAgo}))`.execute(db);

type Kind = { kind: string; calls: number; failures: number; p50: number; p95: number; points: Array<{ at: string; calls: number; failures: number; p50: number | null; p95: number | null }> };

describe("AC-43 model calls", () => {
  it("counts calls per job and gives the median and the 95th of their latency", async () => {
    for (const latency of [100, 200, 300, 400, 1000]) await call("dump.answer", latency);
    await call("thread.nightly", 5000);
    await stat(1, "dump.answer", "failed", 2);
    await stat(1, "dump.answer", "dead", 1);
    await stat(1, "dump.answer", "done", 40);

    const body = await get("/health/calls?range=7d");
    expect(body.kinds.map((one: Kind) => [one.kind, one.calls, one.failures])).toEqual([
      ["dump.answer", 5, 3],
      ["thread.nightly", 1, 0],
    ]);
    const answer = body.kinds[0] as Kind;
    // Over the whole range, for the table.
    expect(answer).toMatchObject({ p50: 300, p95: 880 });
    expect(answer.points).toHaveLength(7);
    const busy = answer.points.filter((point) => point.calls > 0);
    expect(busy.reduce((sum, point) => sum + point.calls, 0)).toBe(5);
    // All five landed in one UTC day, or straddle midnight; only assert the
    // percentiles when they are together.
    if (busy.length === 1) {
      expect(busy[0]).toMatchObject({ calls: 5, p50: 300, p95: 880 });
    }
    const quiet = answer.points.find((point) => point.calls === 0)!;
    expect(quiet).toMatchObject({ calls: 0, p50: null, p95: null });
  });

  it("matches the ledger over the range, and leaves out what is older", async () => {
    await call("dump.answer", 100, 2);
    await call("dump.answer", 100, 24 * 10);
    await call("dump.answer", 100, 24 * 40);
    const total = async (range: string) => ((await get(`/health/calls?range=${range}`)).kinds as Kind[]).reduce((sum, one) => sum + one.calls, 0);
    expect(await total("7d")).toBe(1);
    expect(await total("30d")).toBe(2);
    expect(await total("90d")).toBe(3);
  });

  it("buckets a day by the hour", async () => {
    await call("dump.answer", 250, 1);
    const body = await get("/health/calls?range=24h");
    expect(body.kinds[0].points).toHaveLength(24);
    expect(body.kinds[0].points[22]).toMatchObject({ calls: 1, p50: 250, p95: 250 });
  });

  it("lists a ledger kind whose calls all failed, with its failures", async () => {
    await stat(1, "thread.nightly", "failed", 3);
    const body = await get("/health/calls?range=7d");
    expect(body.kinds.map((one: Kind) => [one.kind, one.calls, one.failures])).toEqual([["thread.nightly", 0, 3]]);
  });

  it("is empty when no model was called", async () => {
    expect((await get("/health/calls")).kinds).toEqual([]);
  });

  it("names no account", async () => {
    await call("dump.answer", 100);
    const response = await app.inject({ method: "GET", url: "/v1/admin/health/calls", headers: { cookie } });
    expect(response.payload).not.toContain(account);
  });
});

type Vendor = { vendor: string; recorded: boolean; calls: number | null; failures: number | null };

describe("AC-43 vendors", () => {
  const vendors = async (range = "7d") => (await get(`/health/vendors?range=${range}`)).vendors as Vendor[];
  const one = (all: Vendor[], vendor: string) => all.find((row) => row.vendor === vendor)!;

  it("lists every company offload calls, and says not recorded where it has nothing", async () => {
    const all = await vendors();
    expect(all.map((row) => row.vendor)).toEqual(["model", "transcription", "embeddings", "search", "reads", "maps", "calendar", "mail", "push", "storage"]);
    for (const row of all) {
      expect(row, row.vendor).toMatchObject({ recorded: false, calls: null, failures: null });
    }
  });

  it("counts the model and transcription from the ledger, and their failures from job error codes", async () => {
    await call("dump.answer", 100);
    await call("dump.answer", 100);
    await call("dump.answer", 900, 1, "assemblyai");
    await failedJob("dump.answer", "model_error");
    await failedJob("dump.answer", "invalid_output");
    await failedJob("dump.answer", "transcription_failed");
    await failedJob("dump.answer", "model_error", 20);
    const all = await vendors();
    expect(one(all, "model")).toEqual({ vendor: "model", recorded: true, calls: 2, failures: 2 });
    expect(one(all, "transcription")).toEqual({ vendor: "transcription", recorded: true, calls: 1, failures: 1 });
    expect(one(await vendors("30d"), "model").failures).toBe(3);
  });

  it("does not count a link place failure against the model, which it never calls", async () => {
    await call("dump.answer", 100);
    await failedJob("link.place", "link_place_error");
    expect(one(await vendors(), "model")).toEqual({ vendor: "model", recorded: true, calls: 1, failures: 0 });
  });

  it("counts search and reads from the lookups and their outcomes", async () => {
    await lookup("search", "used");
    await lookup("search", "empty");
    await lookup("search", "failed");
    await lookup("read", "used");
    const all = await vendors();
    expect(one(all, "search")).toEqual({ vendor: "search", recorded: true, calls: 3, failures: 1 });
    expect(one(all, "reads")).toEqual({ vendor: "reads", recorded: true, calls: 1, failures: 0 });
  });

  it("counts the rest from the history of the jobs that call them", async () => {
    await stat(1, "email.invited", "done", 9);
    await stat(1, "email.alert", "dead", 1);
    await stat(2, "account.digest", "done", 4);
    await stat(2, "push.receipts", "failed", 1);
    await stat(3, "calendar.sync", "done", 50);
    await stat(3, "calendar.sync", "failed", 5);
    await stat(4, "embed.content", "done", 7);
    await stat(4, "embed.note", "dead", 1);
    await stat(4, "embed.sweep", "done", 60);
    await stat(5, "blob.purge", "done", 2);
    await stat(6, "location.resolve", "done", 3);
    await stat(6, "blob.locate", "failed", 1);
    const all = await vendors();
    expect(one(all, "mail")).toMatchObject({ recorded: true, calls: 10, failures: 1 });
    expect(one(all, "push")).toMatchObject({ recorded: true, calls: 5, failures: 1 });
    expect(one(all, "calendar")).toMatchObject({ recorded: true, calls: 55, failures: 5 });
    // The sweep finds work and calls nobody.
    expect(one(all, "embeddings")).toMatchObject({ recorded: true, calls: 8, failures: 1 });
    expect(one(all, "storage")).toMatchObject({ recorded: true, calls: 2, failures: 0 });
    expect(one(all, "maps")).toMatchObject({ recorded: true, calls: 4, failures: 1 });
  });

  it("reads zero, not unrecorded, for a company with history outside the range", async () => {
    await stat(24 * 20, "calendar.sync", "done", 50);
    expect(one(await vendors("7d"), "calendar")).toEqual({ vendor: "calendar", recorded: true, calls: 0, failures: 0 });
  });
});
