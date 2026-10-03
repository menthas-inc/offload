// What Health reads that is not a heartbeat (034, section E): migrations, the
// queue, the scheduled jobs, the stuck and the dead, the model calls and the
// vendors.
//
// Of a job this reads its kind, state, times, attempts and error code. Never
// `payload`, never `last_error`.

import { sql } from "kysely";
import { db } from "../db.js";
import { PRIORITY, STALE_AFTER_SECONDS } from "../jobs/queue.js";
import { bucketOf, series, type Range } from "./range.js";

/** How many migrations this database has applied, and the newest by name. */
export async function migrations(): Promise<{ count: number; latest: string | null }> {
  const row = await db
    .selectFrom("schema_migrations")
    .select(({ fn }) => [fn.countAll<string>().as("n"), fn.max("name").as("latest")])
    .executeTakeFirstOrThrow();
  return { count: Number(row.n), latest: row.latest ?? null };
}

export interface QueueNow {
  /** Due and not yet taken. A job booked for later is on the schedule, not
   *  waiting. */
  waiting: Array<{ priority: keyof typeof PRIORITY; count: number }>;
  /** How long the oldest waiting job has been due. Null when none is. */
  oldestSeconds: number | null;
  running: number;
}

export async function queueNow(): Promise<QueueNow> {
  const result = await sql<{ priority: number; waiting: string; running: string; oldest: string | null }>`
    select priority,
           count(*) filter (where state = 'queued') as waiting,
           count(*) filter (where state = 'running') as running,
           extract(epoch from (now() - min(run_after) filter (where state = 'queued'))) as oldest
    from jobs
    where (state = 'queued' and run_after <= now()) or state = 'running'
    group by priority`.execute(db);

  // Three names for the three priorities the queue has. Anything booked at
  // another number is counted with the nearest one below it.
  const names = Object.entries(PRIORITY) as Array<[keyof typeof PRIORITY, number]>;
  const nameOf = (priority: number) => (names.find(([, value]) => priority <= value) ?? names[names.length - 1]!)[0];
  const waiting = names.map(([priority]) => ({ priority, count: 0 }));
  let oldest: number | null = null;
  let running = 0;
  for (const row of result.rows) {
    waiting.find((one) => one.priority === nameOf(row.priority))!.count += Number(row.waiting);
    running += Number(row.running);
    if (row.oldest !== null) oldest = Math.max(oldest ?? 0, Math.round(Number(row.oldest)));
  }
  return { waiting, oldestSeconds: oldest, running };
}

export interface QueuePoint {
  at: Date;
  finished: number;
  failed: number;
  dead: number;
  /** Over the jobs that finished: a failed attempt's wait is not known. */
  waitMsSum: number;
  /** The worst hour's 95th in the bucket: percentiles do not add up. */
  waitMsP95: number;
}

export async function queueHistory(range: Range): Promise<{ points: QueuePoint[]; historyStarts: Date | null }> {
  const points = await sql<{ at: Date; finished: string; failed: string; dead: string; wait_sum: string; wait_p95: number }>`
    select buckets.at,
           coalesce(sum(s.count) filter (where s.outcome = 'done'), 0) as finished,
           coalesce(sum(s.count) filter (where s.outcome = 'failed'), 0) as failed,
           coalesce(sum(s.count) filter (where s.outcome = 'dead'), 0) as dead,
           coalesce(sum(s.wait_ms_sum) filter (where s.outcome = 'done'), 0) as wait_sum,
           coalesce(max(s.wait_ms_p95) filter (where s.outcome = 'done'), 0) as wait_p95
    from ${series(range)} as buckets(at)
    left join job_stats_hourly s on ${bucketOf(range, sql`s.hour`)} = buckets.at
    group by buckets.at order by buckets.at`.execute(db);
  const starts = await sql<{ at: Date | null }>`select min(hour) as at from job_stats_hourly`.execute(db);
  return {
    points: points.rows.map((row) => ({
      at: row.at,
      finished: Number(row.finished),
      failed: Number(row.failed),
      dead: Number(row.dead),
      waitMsSum: Number(row.wait_sum),
      waitMsP95: Number(row.wait_p95),
    })),
    historyStarts: starts.rows[0]?.at ?? null,
  };
}

/** How long a kind may run before it is listed as stuck, where that is
 *  shorter than the figure at which a runner takes the lock for abandoned.
 *  These send one message or make one short read. */
const STUCK_AFTER_SECONDS: Record<string, number> = {
  "email.waitlist_joined": 120,
  "email.invited": 120,
  "email.alert": 120,
  "push.receipts": 120,
  "health.rollup": 300,
};

export function stuckAfter(kind: string): number {
  return STUCK_AFTER_SECONDS[kind] ?? STALE_AFTER_SECONDS;
}

export interface JobAccount {
  id: string;
  name: string | null;
}

export interface StuckJob {
  id: string;
  kind: string;
  since: Date;
  seconds: number;
  attempts: number;
  account: JobAccount | null;
}

/** Jobs that have been running longer than their kind should take. */
export async function stuckJobs(): Promise<StuckJob[]> {
  const result = await sql<{ id: string; kind: string; locked_at: Date; seconds: string; attempts: number; account_id: string | null; name: string | null }>`
    select j.id, j.kind, j.locked_at, extract(epoch from (now() - j.locked_at)) as seconds, j.attempts,
           j.account_id::text as account_id, a.display_name as name
    from jobs j left join accounts a on a.id = j.account_id
    where j.state = 'running' and j.locked_at is not null
    order by j.locked_at`.execute(db);
  return result.rows
    .filter((row) => Number(row.seconds) > stuckAfter(row.kind))
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      since: row.locked_at,
      seconds: Math.round(Number(row.seconds)),
      attempts: row.attempts,
      account: row.account_id ? { id: row.account_id, name: row.name } : null,
    }));
}

export interface DeadJob {
  id: string;
  kind: string;
  at: Date;
  attempts: number;
  errorCode: string | null;
  /** It has had its one retry, and died again. */
  retried: boolean;
  account: JobAccount | null;
}

export const DEAD_PAGE = 50;

/** Every job that ran out of attempts and has not been dismissed, newest
 *  first by id, which is UUIDv7. One more than the page, so the caller knows
 *  whether there is another. */
export async function deadJobs(after: string | null): Promise<DeadJob[]> {
  let query = db
    .selectFrom("jobs")
    .leftJoin("accounts", "accounts.id", "jobs.account_id")
    .select(["jobs.id", "jobs.kind", "jobs.updated_at", "jobs.attempts", "jobs.error_code", "jobs.retried_at", "jobs.account_id", "accounts.display_name"])
    .where("jobs.state", "=", "dead")
    .where("jobs.dismissed_at", "is", null)
    .orderBy("jobs.id", "desc")
    .limit(DEAD_PAGE + 1);
  if (after) query = query.where("jobs.id", "<", after);
  const rows = await query.execute();
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    at: row.updated_at as Date,
    attempts: row.attempts,
    errorCode: row.error_code,
    retried: row.retried_at !== null,
    account: row.account_id ? { id: row.account_id, name: row.display_name } : null,
  }));
}
