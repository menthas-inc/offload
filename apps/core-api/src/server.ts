import { buildApp } from "./app.js";
import { migrate } from "./migrate.js";
import { port } from "./env.js";
import { closeDb } from "./db.js";
import { createJobRunner } from "./jobs/runner.js";
import { startDaily, enqueue, PRIORITY } from "./jobs/queue.js";

// Migrate before serving. A deploy that starts answering requests against a
// schema older than its code is the failure this avoids, and the advisory lock
// inside makes it safe when more than one instance boots at once.
const app = await buildApp();
const applied = await migrate((msg) => app.log.info({ migration: msg }, "migrate"));
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
app.log.info("job runner started");

// The two chains that have to keep running on their own. Both re-enqueue
// themselves for tomorrow before doing any work, and the key is the day, so a
// restart or a second instance collapses into one row rather than stacking.
await startDaily("calendar.supervise");
await startDaily("jobs.purge");
await startDaily("account.daily");

// 013's sweep books its own successor, so this only has to start the chain.
// Enqueued rather than run inline: boot should not wait on three index scans.
await enqueue({
  kind: "embed.sweep",
  payload: {},
  priority: PRIORITY.background,
  idempotencyKey: `embed.sweep:boot:${Math.floor(Date.now() / 60_000)}`,
  maxAttempts: 3,
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
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
