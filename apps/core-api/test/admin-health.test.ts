// 034 AC-37 and AC-44. Health's Now view, read from our own Postgres: each
// service up, late or down from its heartbeats, uptime as the share of
// minutes with one, each gap of two minutes or more as an incident, and the
// backup's last run.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { staffMember, wipeAdmin } from "./admin-kit.js";

await migrate(() => {});

let app: App;
let cookie: string;
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
});

const get = async (path: string) => {
  const response = await app.inject({ method: "GET", url: `/v1/admin${path}`, headers: { cookie } });
  expect(response.statusCode, path).toBe(200);
  return response.json();
};

/** Beats for a service, as minutes before this one. */
async function beats(service: string, minutesAgo: number[], about: { ok?: boolean; commit?: string; startedAt?: string } = {}): Promise<void> {
  for (const ago of minutesAgo) {
    await sql`
      insert into heartbeats (service, minute, ok, commit, started_at)
      values (${service}, date_trunc('minute', now()) - make_interval(mins => ${ago}), ${about.ok ?? true}, ${about.commit ?? null}, ${about.startedAt ?? null})`.execute(db);
  }
}

const range = (from: number, to: number) => Array.from({ length: from - to + 1 }, (_unused, index) => from - index);
const minute = async (ago: number) =>
  (await sql<{ at: Date }>`select date_trunc('minute', now()) - make_interval(mins => ${ago}) as at`.execute(db)).rows[0]!.at.toISOString();

type ServiceRow = { service: string; status: string; uptime: number | null; startedAt: string | null; commit: string | null; reportedBy: string; migrations: { count: number; latest: string } | null };
const one = (body: { services: ServiceRow[] }, service: string) => body.services.find((row) => row.service === service)!;

describe("AC-37 services", () => {
  it("says no heartbeat yet for a service that has never reported, not down", async () => {
    const body = await get("/health/services?range=24h");
    expect(body.services.map((row: ServiceRow) => row.service)).toEqual(["core-api", "worker", "web", "database"]);
    for (const row of body.services as ServiceRow[]) {
      expect(row.status, row.service).toBe("none");
      expect(row.uptime, row.service).toBeNull();
    }
  });

  it("reads up inside two minutes, late between two and three, and down past three", async () => {
    await beats("core-api", [1]);
    await beats("worker", [2]);
    await beats("web", [3]);
    const body = await get("/health/services?range=24h");
    expect(one(body, "core-api").status).toBe("up");
    expect(one(body, "worker").status).toBe("late");
    expect(one(body, "web").status).toBe("down");
  });

  it("reads down for a service whose checks have only ever failed", async () => {
    await beats("web", [3, 2, 1], { ok: false });
    const body = await get("/health/services?range=24h");
    expect(one(body, "web").status).toBe("down");
    expect(one(body, "web").uptime).toBe(0);
  });

  it("gives uptime as the share of minutes with a heartbeat, since the first one", async () => {
    // A hundred minutes of history with ten missing.
    await beats("core-api", [...range(100, 51), ...range(40, 1)]);
    const body = await get("/health/services?range=24h");
    // 90 of 100 minutes, or of 101 when the clock crosses a minute between the
    // insert and the read (CI, 2026-10-30).
    const uptime = one(body, "core-api").uptime!;
    expect(uptime).toBeGreaterThanOrEqual(90 / 101 - 1e-9);
    expect(uptime).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it("measures uptime over the range asked for when history is longer", async () => {
    // Up for the last day, and one beat three days ago: over 24 hours that
    // earlier beat is outside the range, over 7 days it starts the clock.
    await sql`
      insert into heartbeats (service, minute, ok)
      select 'worker', minute, true
      from generate_series(date_trunc('minute', now()) - interval '24 hours', date_trunc('minute', now()) - interval '1 minute', interval '1 minute') as minute`.execute(db);
    await sql`insert into heartbeats (service, minute, ok) values ('worker', date_trunc('minute', now()) - interval '72 hours', true)`.execute(db);
    expect(one(await get("/health/services?range=24h"), "worker").uptime).toBe(1);
    const week = one(await get("/health/services?range=7d"), "worker").uptime!;
    expect(week).toBeGreaterThan(0.33);
    expect(week).toBeLessThan(0.34);
  });

  it("carries the last start and the commit from the newest row", async () => {
    await beats("core-api", [5], { commit: "old1111", startedAt: "2026-10-01T08:00:00.000Z" });
    await beats("core-api", [1], { commit: "new2222", startedAt: "2026-10-03T09:00:00.000Z" });
    const row = one(await get("/health/services"), "core-api");
    expect(row.commit).toBe("new2222");
    expect(row.startedAt).toBe("2026-10-03T09:00:00.000Z");
  });

  it("says which rows are the Core API's own checks", async () => {
    const body = await get("/health/services");
    expect(body.services.map((row: ServiceRow) => [row.service, row.reportedBy])).toEqual([
      ["core-api", "itself"],
      ["worker", "itself"],
      ["web", "core-api"],
      ["database", "core-api"],
    ]);
  });

  it("counts the migrations on the Core API's row and names the latest", async () => {
    const applied = await db.selectFrom("schema_migrations").select("name").orderBy("name", "desc").execute();
    const body = await get("/health/services");
    expect(one(body, "core-api").migrations).toEqual({ count: applied.length, latest: applied[0]!.name });
    expect(one(body, "worker").migrations).toBeNull();
  });

  it("refuses a range it does not offer", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/admin/health/services?range=1y", headers: { cookie } });
    expect(response.statusCode).toBe(400);
  });
});

describe("AC-37 incidents", () => {
  it("lists a gap with its start, end and duration", async () => {
    await beats("core-api", [...range(100, 51), ...range(40, 1)]);
    const body = await get("/health/incidents?range=24h");
    expect(body.incidents).toEqual([
      { service: "core-api", began: await minute(50), ended: await minute(40), seconds: 600 },
    ]);
  });

  it("does not call a gap under two minutes an incident", async () => {
    // One minute missing: a restart.
    await beats("core-api", [...range(30, 21), ...range(19, 1)]);
    expect((await get("/health/incidents?range=24h")).incidents).toEqual([]);
  });

  it("calls two missing minutes one", async () => {
    await beats("worker", [...range(30, 21), ...range(18, 1)]);
    const body = await get("/health/incidents?range=24h");
    expect(body.incidents).toEqual([{ service: "worker", began: await minute(20), ended: await minute(18), seconds: 120 }]);
  });

  it("leaves the end open while the service is still down", async () => {
    await beats("database", range(30, 10));
    const body = await get("/health/incidents?range=24h");
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0]).toMatchObject({ service: "database", began: await minute(9), ended: null });
    expect(body.incidents[0].seconds).toBeGreaterThanOrEqual(9 * 60);
  });

  it("has nothing for a service that never reported, and newest first otherwise", async () => {
    await beats("core-api", [...range(100, 91), ...range(80, 61), ...range(50, 1)]);
    const body = await get("/health/incidents?range=24h");
    expect(body.incidents.map((row: { began: string }) => row.began)).toEqual([await minute(60), await minute(90)]);
  });

  it("keeps to the range", async () => {
    await sql`
      insert into heartbeats (service, minute, ok) values
        ('web', date_trunc('minute', now()) - interval '72 hours', true),
        ('web', date_trunc('minute', now()) - interval '71 hours', true),
        ('web', date_trunc('minute', now()) - interval '1 minute', true)`.execute(db);
    // The first gap closed 71 hours ago; the second is still inside a day.
    expect((await get("/health/incidents?range=24h")).incidents).toHaveLength(1);
    expect((await get("/health/incidents?range=7d")).incidents).toHaveLength(2);
  });
});

describe("AC-44 backups", () => {
  it("is late when no backup has ever been recorded", async () => {
    expect(await get("/health/backups")).toEqual({ last: null, late: true });
  });

  it("gives the last run's finish and size", async () => {
    await sql`insert into backup_runs (finished_at, bytes, ok) values (now() - interval '1 hour', 123456789, true)`.execute(db);
    const body = await get("/health/backups");
    expect(body.late).toBe(false);
    expect(body.last).toMatchObject({ bytes: 123456789, ok: true });
    expect(Date.now() - new Date(body.last.finishedAt).getTime()).toBeLessThan(3_700_000);
  });

  it("reads late once the newest good run is past 26 hours, whatever failed since", async () => {
    await sql`
      insert into backup_runs (finished_at, bytes, ok) values
        (now() - interval '27 hours', 1000, true),
        (now() - interval '1 hour', 0, false)`.execute(db);
    const body = await get("/health/backups");
    expect(body.late).toBe(true);
    expect(body.last).toMatchObject({ bytes: 0, ok: false });
  });

  it("is not late at 25 hours", async () => {
    await sql`insert into backup_runs (finished_at, bytes, ok) values (now() - interval '25 hours', 1000, true)`.execute(db);
    expect((await get("/health/backups")).late).toBe(false);
  });
});

describe("S27 grants offload could not hand back", () => {
  it("counts each one kept for a revoke by hand, with its age, to the owner and nobody else", async () => {
    await db.deleteFrom("pending_revocations").execute();
    await sql`
      insert into pending_revocations (provider, sealed_token, created_at, unopenable_at) values
        ('google', '\\x00', now() - interval '3 days', now()),
        ('google', '\\x00', now() - interval '1 hour', now())`.execute(db);
    // Waiting on Google, not on a person: not counted here.
    await sql`insert into pending_revocations (provider, sealed_token) values ('google', '\\x00')`.execute(db);
    try {
      const body = await get("/health/revocations");
      expect(body.unopenable).toHaveLength(2);
      const days = (body.unopenable as { since: string }[]).map((one) => Math.round((Date.now() - new Date(one.since).getTime()) / 86_400_000));
      expect(days).toEqual([3, 0]);
      const support = (await staffMember("support")).cookie;
      expect((await app.inject({ method: "GET", url: "/v1/admin/health/revocations", headers: { cookie: support } })).statusCode).toBe(404);
    } finally {
      await db.deleteFrom("pending_revocations").execute();
    }
  });
});
