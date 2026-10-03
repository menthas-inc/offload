// 034 AC-36. Each service says it is alive once a minute, in a table the
// panel can read. The Core API reports itself and records what it found of
// the web and the database; the worker reports through an internal route,
// which cannot be reached by the public name.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { BOOTED_AT, HEARTBEAT_SECONDS, heartbeat } from "../src/health/heartbeat.js";

await migrate(() => {});

let app: App;
let guarded: App;
beforeAll(async () => {
  app = await buildApp();
  guarded = await buildApp({ internalHost: "core-api.railway.internal" });
});
afterAll(async () => {
  await db.deleteFrom("heartbeats").execute();
  await app.close();
  await guarded.close();
  await closeDb();
});

const commit = process.env["RAILWAY_GIT_COMMIT_SHA"];
beforeEach(async () => {
  await db.deleteFrom("heartbeats").execute();
  process.env["RAILWAY_GIT_COMMIT_SHA"] = "abc1234";
});
afterEach(() => {
  if (commit === undefined) delete process.env["RAILWAY_GIT_COMMIT_SHA"];
  else process.env["RAILWAY_GIT_COMMIT_SHA"] = commit;
});

const beats = () => db.selectFrom("heartbeats").select(["service", "ok", "commit", "started_at", "minute"]).orderBy("service").execute();

const webUp = (async (url: string | URL | Request) => {
  expect(String(url)).toBe(`${env.WEB_URL}/healthz`);
  return new Response(JSON.stringify({ ok: true, commit: "web5678", startedAt: "2026-10-03T09:00:00.000Z" }), { status: 200 });
}) as typeof fetch;

describe("the Core API's minute", () => {
  it("writes itself, the database and the web, each once for the minute", async () => {
    await heartbeat(webUp);
    await heartbeat(webUp);
    const rows = await beats();
    expect(rows.map((row) => [row.service, row.ok, row.commit])).toEqual([
      ["core-api", true, "abc1234"],
      ["database", true, null],
      ["web", true, "web5678"],
    ]);
    const own = rows.find((row) => row.service === "core-api")!;
    expect(own.started_at?.getTime()).toBe(BOOTED_AT.getTime());
    // The row is the minute, not the moment.
    expect(own.minute.getUTCSeconds()).toBe(0);
    expect(rows.find((row) => row.service === "web")!.started_at?.toISOString()).toBe("2026-10-03T09:00:00.000Z");
  });

  it("records the web as not ok when it does not answer, and still writes the rest", async () => {
    await heartbeat((async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch);
    expect((await beats()).map((row) => [row.service, row.ok])).toEqual([
      ["core-api", true],
      ["database", true],
      ["web", false],
    ]);

    await db.deleteFrom("heartbeats").execute();
    await heartbeat((async () => new Response("no", { status: 503 })) as typeof fetch);
    expect((await beats()).find((row) => row.service === "web")!.ok).toBe(false);
  });

  it("keeps an ok a second instance wrote for the same minute", async () => {
    await heartbeat(webUp);
    await heartbeat((async () => new Response("no", { status: 503 })) as typeof fetch);
    expect((await beats()).find((row) => row.service === "web")!.ok).toBe(true);
  });

  it("reads the commit as unknown when the platform does not say", async () => {
    delete process.env["RAILWAY_GIT_COMMIT_SHA"];
    await heartbeat(webUp);
    expect((await beats()).find((row) => row.service === "core-api")!.commit).toBeNull();
  });

  it("is a timer the server starts, every sixty seconds, and no test does", () => {
    expect(HEARTBEAT_SECONDS).toBe(60);
    const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/server.ts"), "utf8");
    expect(server).toMatch(/startHeartbeat\(/);
  });
});

describe("the worker's minute", () => {
  const post = (target: App, headers: Record<string, string>, payload: unknown = { commit: "wrk9999", startedAt: "2026-10-03T08:00:00.000Z" }) =>
    target.inject({ method: "POST", url: "/internal/v1/heartbeat", headers, payload: payload as Record<string, unknown> });
  const bearer = { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` };

  it("is written by the worker's post, with its commit and when it started", async () => {
    const res = await post(app, bearer);
    expect(res.statusCode).toBe(200);
    await post(app, bearer);
    const rows = await beats();
    expect(rows.map((row) => [row.service, row.ok, row.commit, row.started_at?.toISOString()])).toEqual([
      ["worker", true, "wrk9999", "2026-10-03T08:00:00.000Z"],
    ]);
  });

  it("takes a worker that does not know its commit", async () => {
    expect((await post(app, bearer, { startedAt: "2026-10-03T08:00:00.000Z" })).statusCode).toBe(200);
    expect((await beats())[0]!.commit).toBeNull();
  });

  it("is refused without the token, and a body naming anything else is refused", async () => {
    expect((await post(app, {})).statusCode).toBe(401);
    expect((await post(app, { authorization: "Bearer nothing" })).statusCode).toBe(401);
    expect((await post(app, bearer, { startedAt: "2026-10-03T08:00:00.000Z", service: "core-api" })).statusCode).toBe(400);
    expect(await beats()).toEqual([]);
  });

  it("cannot be written from the public address", async () => {
    const open = await post(guarded, { ...bearer, host: "api.offload.club" });
    expect(open.statusCode).toBe(404);
    expect(await beats()).toEqual([]);
    const inside = await post(guarded, { ...bearer, host: "core-api.railway.internal" });
    expect(inside.statusCode).toBe(200);
  });
});
