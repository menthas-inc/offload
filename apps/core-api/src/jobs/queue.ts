// The job queue: a Postgres table drained with FOR UPDATE SKIP LOCKED.
//
// Not Redis, and not a broker. The reason is correctness before simplicity: the
// product's core flow writes a row and enqueues work about it, and in Postgres
// those are one transaction. With an external broker they are a dual write, and
// both failure directions are real (decisions.md).

import { sql } from "kysely";
import { db } from "./../db.js";
import type { Database } from "./../schema.js";
import type { Kysely, Transaction } from "kysely";

/** Every kind anything enqueues, across both runners.
 *
 *  The email kinds are drained by this service; `dump.answer` is drained by the
 *  Python worker. They share one type because they share one table, and because
 *  a kind that exists in neither runner's registry is the failure `kinds.ts`
 *  and its test exist to catch. */
export type JobKind =
  | "email.waitlist_joined"
  | "email.invited"
  | "email.download_app"
  | "dump.answer"
  | "thread.quick_add"
  | "content.purge"
  | "location.resolve"
  | "calendar.sync"
  | "calendar.supervise"
  | "jobs.purge"
  // 013. The sweep runs here and finds what needs embedding; the three embed
  // kinds are drained by the Python worker, which is where the client lives.
  | "embed.sweep"
  | "embed.content"
  | "embed.memory"
  | "embed.message";

/** Interactive work outranks scheduled work. Lower number wins, which is how
 *  a nightly sweep is stopped from starving something a person is waiting on. */
export const PRIORITY = { interactive: 10, scheduled: 100, background: 200 } as const;

export interface EnqueueOptions {
  kind: JobKind;
  payload: Record<string, unknown>;
  accountId?: string | null;
  priority?: number;
  runAfter?: Date;
  /** Same thing, relative, and against the database's clock rather than Node's.
   *  See the note on `run_after` below for why that distinction is not
   *  pedantry. */
  runAfterSeconds?: number;
  /** Makes the enqueue safe to retry. A repeated key is silently ignored. */
  idempotencyKey?: string;
  /** Enqueue inside the caller's transaction. Almost always what you want. */
  tx?: Transaction<Database> | Kysely<Database>;
  /** How many times this may be attempted before it is given up on.
   *
   *  The column defaults to 5, which suits an email: nobody is waiting and a
   *  transient SMTP failure deserves patience. An interactive job is the
   *  opposite case, and 003 asks for exactly one retry, so it passes 2 rather
   *  than inheriting a default chosen for a different kind of work. Without
   *  this a failing dump was retried four times before the person was told
   *  anything, which is a long silence to call thinking.
   */
  maxAttempts?: number;
}

export async function enqueue(options: EnqueueOptions): Promise<void> {
  const executor = options.tx ?? db;
  await executor
    .insertInto("jobs")
    .values({
      kind: options.kind,
      account_id: options.accountId ?? null,
      payload: JSON.stringify(options.payload),
      priority: options.priority ?? PRIORITY.scheduled,
        // The database's clock, not Node's.
        //
        // `new Date()` here is measurably ahead of `now()` inside Postgres, by
        // one or two milliseconds on this machine, and the claim query asks for
        // `run_after <= now()`. So a job enqueued with no explicit time was
        // briefly in the queue's own future and invisible to a tick that ran
        // straight after it. The running server polls, so it only ever cost a
        // poll interval, but it made a test that ticks once fail about one run
        // in three. One clock is the fix.
        run_after:
          options.runAfter ??
          (options.runAfterSeconds === undefined
            ? sql<Date>`now()`
            : sql<Date>`now() + make_interval(secs => ${options.runAfterSeconds})`),
      state: "queued",
      ...(options.maxAttempts === undefined ? {} : { max_attempts: options.maxAttempts }),
      idempotency_key: options.idempotencyKey ?? null,
    })
    .onConflict((oc) => oc.column("idempotency_key").doNothing())
    .execute();
}

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

/** Claim one runnable job of a kind this runner handles.
 *
 *  SKIP LOCKED means many workers can drain the same table without blocking on
 *  each other or handing out the same row twice.
 *
 *  **Scoped by kind, which it did not used to be.** Two runners now drain this
 *  table: this one for email, and the Python worker for model jobs. Unscoped,
 *  whichever polled first would claim the other's work, and this one would then
 *  mark it dead on the spot, because an unknown kind is treated as a deploy
 *  problem rather than a transient one. Every dump would have been answered with
 *  a dead job.
 *
 *  **The per-account cap is the other runner's concern and deliberately absent
 *  here.** Email jobs are not interactive and nobody is waiting on one.
 */
export async function claim(workerId: string, kinds: string[]): Promise<ClaimedJob | undefined> {
  const result = await sql<ClaimedJob>`
    update jobs set
      state = 'running',
      locked_at = now(),
      locked_by = ${workerId},
      attempts = attempts + 1,
      updated_at = now()
    where id = (
      select id from jobs
      where state = 'queued' and run_after <= now()
        and kind = any(${sql.val(kinds)})
      order by priority, run_after
      for update skip locked
      limit 1
    )
    returning id, kind, payload, attempts, max_attempts
  `.execute(db);

  return result.rows[0];
}

export async function complete(id: string): Promise<void> {
  await db.updateTable("jobs")
    .set({ state: "done", locked_at: null, locked_by: null, updated_at: new Date() })
    .where("id", "=", id).execute();
}

/** Fail a job, retrying with backoff until max_attempts, then parking it dead.
 *
 *  The error text is truncated and never carries the payload. An email
 *  provider's rejection quotes the recipient address, and a recipient address
 *  in a log is an OFF-1 violation. */
export async function fail(job: ClaimedJob, error: unknown): Promise<void> {
  const terminal = job.attempts >= job.max_attempts;
  const message = scrub(error);
  const backoffSeconds = Math.min(2 ** job.attempts, 3600);

  await db.updateTable("jobs")
    .set({
      state: terminal ? "dead" : "queued",
      last_error: message,
      locked_at: null,
      locked_by: null,
      run_after: new Date(Date.now() + backoffSeconds * 1000),
      updated_at: new Date(),
    })
    .where("id", "=", job.id).execute();
}

/** Keep the shape of a failure and none of its content. */
function scrub(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw
    .replace(/[\w.+-]+@[\w.-]+/g, "[email]")
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .slice(0, 200);
}

/** A job that runs once a day, forever.
 *
 *  **There is no cron in this product**, and adding one would be a second thing
 *  that has to be running. The jobs table already does this: a daily job
 *  re-enqueues itself for tomorrow, and the key carries the day so a boot on a
 *  second instance, or a restart, collapses into the same row rather than
 *  stacking duplicates.
 *
 *  **Enqueued before the work, never after.** A handler that schedules its own
 *  next run only on success stops forever the first time it fails, silently,
 *  which is the trap `connectors/sync.ts` documents at length. */
export async function scheduleDaily(kind: JobKind, at = new Date()): Promise<void> {
  const tomorrow = new Date(at.getTime() + 24 * 60 * 60 * 1000);
  const day = tomorrow.toISOString().slice(0, 10);
  await enqueue({
    kind,
    payload: {},
    runAfter: tomorrow,
    priority: PRIORITY.background,
    idempotencyKey: `${kind}:${day}`,
    maxAttempts: 3,
  });
}

/** Kick the daily chain off at boot, for today rather than tomorrow.
 *
 *  Safe to call on every instance and every restart: the key is the day. */
export async function startDaily(kind: JobKind, at = new Date()): Promise<void> {
  await enqueue({
    kind,
    payload: {},
    priority: PRIORITY.background,
    idempotencyKey: `${kind}:${at.toISOString().slice(0, 10)}`,
    maxAttempts: 3,
  });
}
