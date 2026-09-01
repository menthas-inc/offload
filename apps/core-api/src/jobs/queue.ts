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

export type JobKind = "email.waitlist_joined" | "email.invited" | "email.download_app";

/** Interactive work outranks scheduled work. Lower number wins, which is how
 *  a nightly sweep is stopped from starving something a person is waiting on. */
export const PRIORITY = { interactive: 10, scheduled: 100 } as const;

export interface EnqueueOptions {
  kind: JobKind;
  payload: Record<string, unknown>;
  accountId?: string | null;
  priority?: number;
  runAfter?: Date;
  /** Makes the enqueue safe to retry. A repeated key is silently ignored. */
  idempotencyKey?: string;
  /** Enqueue inside the caller's transaction. Almost always what you want. */
  tx?: Transaction<Database> | Kysely<Database>;
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
      run_after: options.runAfter ?? new Date(),
      state: "queued",
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

/** Claim one runnable job. SKIP LOCKED means many workers can drain the same
 *  table without blocking on each other or handing out the same row twice. */
export async function claim(workerId: string): Promise<ClaimedJob | undefined> {
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
