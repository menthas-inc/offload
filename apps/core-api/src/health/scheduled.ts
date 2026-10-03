// The scheduled jobs as Health lists them (034, section E): one row per entry
// of `SCHEDULED`, with its last run, its next run, its counts over the range
// and whether it is late.
//
// **Late**, two ways:
//   - a booked run is past due by more than the kind's grace and has still
//     not been taken;
//   - a chain has nothing booked and nothing running. A chain books its own
//     successor before it works, so one with no row has stopped. Only once it
//     is known to have run: a chain nothing ever started is not late, it is
//     not there.
// A kind that is booked when there is something to do (a purge, a digest, a
// sync per connection) is late only the first way: nothing waiting is its
// ordinary state.

import { sql } from "kysely";
import { db } from "../db.js";
import { SCHEDULED, type Scheduled } from "../jobs/schedule.js";
import { bucketOf, series, type Range } from "./range.js";

/** The kinds that re-arm themselves forever: started at boot, and each run
 *  books the next. `test/admin-health-jobs.test.ts` holds this to the
 *  registry. */
export const CHAINS: ReadonlySet<string> = new Set([
  "calendar.supervise",
  "jobs.purge",
  "account.daily",
  "blob.daily",
  "places.age",
  "people.daily",
  "analytics.ship",
  "digest.schedule",
  "embed.sweep",
  "health.rollup",
  "billing.pull",
]);

export interface ScheduledRow extends Scheduled {
  last: { at: Date; outcome: "done" | "failed" | "dead"; durationMs: number | null } | null;
  next: Date | null;
  runs: number;
  failures: number;
  late: boolean;
}

/** Where a range's first bucket starts, so a count over the range and the
 *  plot of it cover the same hours. */
function firstBucket(range: Range) {
  return sql<Date>`(select min(at) from ${series(range)} as buckets(at))`;
}

export async function scheduledJobs(range: Range): Promise<ScheduledRow[]> {
  const kinds = SCHEDULED.map((one) => one.kind);

  const [last, booked, history, clock] = await Promise.all([
    // The newest job of each kind that has an outcome. Duration only where
    // the row still says when it was claimed; see rollup.ts.
    sql<{ kind: string; at: Date; outcome: "done" | "failed" | "dead"; duration_ms: string | null }>`
      select distinct on (kind)
        kind,
        updated_at as at,
        case when state = 'dead' then 'dead' when error_code is not null or state = 'failed' then 'failed' else 'done' end as outcome,
        case when locked_at is null then null else greatest(0, extract(epoch from (updated_at - locked_at)) * 1000) end as duration_ms
      from jobs
      where kind = any(${sql.val(kinds)})
        and state <> 'running'
        and (state in ('done', 'dead', 'failed') or (error_code is not null and retried_at is null))
      order by kind, updated_at desc`.execute(db),
    sql<{ kind: string; next: Date | null; running: string }>`
      select kind, min(run_after) filter (where state = 'queued') as next, count(*) filter (where state = 'running') as running
      from jobs
      where kind = any(${sql.val(kinds)}) and state in ('queued', 'running')
      group by kind`.execute(db),
    sql<{ kind: string; runs: string; failures: string }>`
      select
        kind,
        coalesce(sum(count) filter (where hour >= ${firstBucket(range)}), 0) as runs,
        coalesce(sum(count) filter (where hour >= ${firstBucket(range)} and outcome in ('failed', 'dead')), 0) as failures
      from job_stats_hourly
      where kind = any(${sql.val(kinds)})
      group by kind`.execute(db),
    sql<{ now: Date }>`select now() as now`.execute(db),
  ]);

  const now = clock.rows[0]!.now.getTime();
  return SCHEDULED.map((entry) => {
    const ran = last.rows.find((row) => row.kind === entry.kind);
    const queue = booked.rows.find((row) => row.kind === entry.kind);
    const stats = history.rows.find((row) => row.kind === entry.kind);
    const next = queue?.next ?? null;
    const running = Number(queue?.running ?? 0);

    const overdue = next !== null && now > next.getTime() + entry.graceMinutes * 60_000;
    const stopped = CHAINS.has(entry.kind) && next === null && running === 0 && (ran !== undefined || stats !== undefined);

    return {
      ...entry,
      last: ran ? { at: ran.at, outcome: ran.outcome, durationMs: ran.duration_ms === null ? null : Math.round(Number(ran.duration_ms)) } : null,
      next,
      runs: Number(stats?.runs ?? 0),
      failures: Number(stats?.failures ?? 0),
      late: overdue || stopped,
    };
  });
}

/** The kinds that are late now. For the alert. */
export async function lateKinds(): Promise<string[]> {
  return (await scheduledJobs("24h")).filter((row) => row.late).map((row) => row.kind);
}

export interface Volume {
  points: Array<{ at: Date; runs: number; failures: number }>;
  /** The nightly pass only: per UTC day, how many passes were booked, how
   *  many finished and how many failed. Booked is every pass that reached an
   *  outcome that day plus those still waiting or running. */
  nights: Array<{ at: Date; booked: number; finished: number; failed: number }> | null;
  historyStarts: Date | null;
}

export async function volume(kind: string, range: Range): Promise<Volume> {
  const points = await sql<{ at: Date; runs: string; failures: string }>`
    select buckets.at,
           coalesce(sum(s.count), 0) as runs,
           coalesce(sum(s.count) filter (where s.outcome in ('failed', 'dead')), 0) as failures
    from ${series(range)} as buckets(at)
    left join job_stats_hourly s on s.kind = ${kind} and ${bucketOf(range, sql`s.hour`)} = buckets.at
    group by buckets.at order by buckets.at`.execute(db);

  const starts = await sql<{ at: Date | null }>`select min(hour) as at from job_stats_hourly where kind = ${kind}`.execute(db);

  let nights: Volume["nights"] = null;
  if (kind === "thread.nightly") {
    // Always per UTC day, whatever the plot above is bucketed by.
    const days = range === "24h" ? "7d" : range;
    const rows = await sql<{ at: Date; finished: string; failed: string; pending: string }>`
      select buckets.at,
             coalesce((select sum(s.count) from job_stats_hourly s
                        where s.kind = ${kind} and s.outcome = 'done' and date_trunc('day', s.hour, 'UTC') = buckets.at), 0) as finished,
             coalesce((select sum(s.count) from job_stats_hourly s
                        where s.kind = ${kind} and s.outcome in ('failed', 'dead') and date_trunc('day', s.hour, 'UTC') = buckets.at), 0) as failed,
             (select count(*) from jobs j
               where j.kind = ${kind} and j.state in ('queued', 'running') and date_trunc('day', j.created_at, 'UTC') = buckets.at) as pending
      from ${series(days)} as buckets(at)
      order by buckets.at`.execute(db);
    nights = rows.rows.map((row) => ({
      at: row.at,
      finished: Number(row.finished),
      failed: Number(row.failed),
      booked: Number(row.finished) + Number(row.failed) + Number(row.pending),
    }));
  }

  return {
    points: points.rows.map((row) => ({ at: row.at, runs: Number(row.runs), failures: Number(row.failures) })),
    nights,
    historyStarts: starts.rows[0]?.at ?? null,
  };
}
