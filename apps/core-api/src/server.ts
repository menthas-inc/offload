import { migrate } from "./migrate.js";
import { env, isProduction, port } from "./env.js";
import { closeDb } from "./db.js";
import { createJobRunner } from "./jobs/runner.js";
import { chooseMailer } from "./mail/index.js";
import { startDaily, startHourly, enqueue, PRIORITY } from "./jobs/queue.js";
import { mapsConfig } from "./places/resolve.js";
import { startHeartbeat } from "./health/heartbeat.js";
import { startHealthJobs } from "./health/jobs.js";
import { startBillingJobs } from "./billing/jobs.js";

// Migrate before anything else is even imported. A deploy that starts
// answering requests against a schema older than its code is the failure this
// avoids, and the advisory lock inside makes it safe when more than one
// instance boots at once.
//
// **Before the app is built, not merely before it listens.** Building the app
// imports `auth.ts`, and Better Auth 1.7.5 compares the database to its model
// as it initialises and keeps the verdict: on 2026-09-22 the first deploy that
// carried migration 0055 checked the schema a few hundred milliseconds before
// the migration ran, found a required column its model no longer had, and
// answered every session read with a 500 until the container was restarted.
// The log line was "Database schema mismatch". So the app is imported only
// once the schema is the one this build was written for.
const applied = await migrate((msg) => console.log(JSON.stringify({ level: "info", msg: "migrate", migration: msg })));
const { buildApp } = await import("./app.js");
const app = await buildApp();
app.log.info({ applied }, "migrations up to date");

// The job runner runs in the API process, not a separate service.
//
// Nothing was draining the jobs table before this. Enqueueing worked, the
// transaction boundaries were right, the handlers were tested, and no email
// had ever been sent: every test builds its own runner and drains it by hand,
// so the suite could not see that production builds none. Found by review, and
// it is the exact shape of "a test that passes only in your shell".
//
// One process rather than a worker service because the queue is claimed with
// SKIP LOCKED, so a second instance is a scaling decision and not a
// correctness one. When email volume justifies it, this moves behind
// OFFLOAD_SERVICE=worker in scripts/start.mjs and nothing else changes.
const runner = createJobRunner((level, fields, msg) => app.log[level](fields, msg));
runner.start();
// Which mailer, in the first line anyone reads: a local server that says
// "resend" here is one that was asked to.
app.log.info({ mail: chooseMailer({ ...env, production: isProduction }) }, "job runner started");

// The two chains that have to keep running on their own. Both re-enqueue
// themselves for tomorrow before doing any work, and the key is the day, so a
// restart or a second instance collapses into one row rather than stacking.
await startDaily("calendar.supervise");
await startDaily("jobs.purge");
await startDaily("account.daily");
await startDaily("blob.daily");
// 035. The hourly pass over people's copies.
await startHourly("export.sweep");
// 030. Google's thirty days on place coordinates, and the Undo records
// nothing can use any more. SQL only; it asks Google nothing.
await startDaily("places.age");
// 2026-10-17. What has passed archives itself, on the hour.
await startHourly("content.passed");
// 030. The one pass over what existed before the map, at the first boot with
// the map on. The pass marks itself as run (backfill.ts), since this key
// lasts only as long as the job row; every row it books is marked as well.
if (mapsConfig().on) {
  await enqueue({ kind: "maps.backfill", payload: {}, priority: PRIORITY.background, idempotencyKey: "maps.backfill:030" });
}
await startDaily("people.daily");
// 024. The hourly placer of the two digests.
await startHourly("digest.schedule");
await startDaily("analytics.ship");
// 034. The hourly rollup behind Health's plots, and the daily read of each
// company's bill. Each section owns its own chain.
await startHealthJobs();
await startBillingJobs();

// 013's sweep books its own successor, so this only has to start the chain.
// Enqueued rather than run inline: boot should not wait on three index scans.
await enqueue({
  kind: "embed.sweep",
  payload: {},
  priority: PRIORITY.background,
  idempotencyKey: `embed.sweep:boot:${Math.floor(Date.now() / 60_000)}`,
  maxAttempts: 3,
});

// 034. One row a minute for this service, the database and the web. Started
// here and nowhere else, so no test runs under a timer; unref'd, so it never
// holds the process open on its own.
const heartbeats = startHeartbeat((fields, msg) => app.log.error(fields, msg));
heartbeats.unref();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  clearInterval(heartbeats);
  // The runner first: it holds claimed rows, and stopping it before the pool
  // closes lets the job in flight finish against a live connection.
  runner.stop();
  await app.close();
  await closeDb();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port, host: "0.0.0.0" });
