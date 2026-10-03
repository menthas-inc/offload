// `health.rollup`: the job table's finished hours, kept as counts (034).
//
// `jobs` is purged at 30 days and Health plots 90, so each closed hour is
// written to `job_stats_hourly` as one row per kind and outcome, with no
// account in it. Hourly, and each run looks back 48 hours, so a missed run is
// made up by the next.
//
// **What counts, and in which hour.** A job is counted in the hour of its
// `updated_at`, once it has an outcome:
//   - `done`: it finished, with no error code.
//   - `failed`: it carries an error code and is not dead. That is a turn the
//     worker closed as done with the reason it failed, or an attempt that
//     failed and is waiting for its next one.
//   - `dead`: it ran out of attempts.
// A running job has no outcome yet, and a dead job put back by Retry is not
// counted again as a failure while it waits.
//
// **Wait and run time, exactly.** Where the row still says when it was
// claimed, wait is `locked_at - run_after` and run is `updated_at -
// locked_at`. Both runners clear `locked_at` when a job ends, so today that
// is no finished row: wait is then `updated_at - run_after`, which is the
// time from due to finished, waiting and running together, and run is 0. A
// failed attempt's `run_after` has been moved to its retry, so its wait
// reads 0; the waits worth plotting are the `done` rows'.
//
// **Idempotent.** An hour that is closed never gains a row, so an hour that
// already has history is skipped, and the upsert makes two instances writing
// the same hour write the same thing.

import { sql } from "kysely";
import { db } from "../db.js";

export const ROLLUP_LOOKBACK_HOURS = 48;

export async function rollup(): Promise<number> {
  const result = await sql`
    insert into job_stats_hourly (hour, kind, outcome, count, wait_ms_sum, wait_ms_p95, run_ms_sum, run_ms_p95)
    select
      hour, kind, outcome, count(*),
      coalesce(sum(wait_ms), 0)::bigint,
      coalesce(percentile_cont(0.95) within group (order by wait_ms), 0)::int,
      coalesce(sum(run_ms), 0)::bigint,
      coalesce(percentile_cont(0.95) within group (order by run_ms), 0)::int
    from (
      select
        date_trunc('hour', updated_at, 'UTC') as hour,
        kind,
        case when state = 'dead' then 'dead' when error_code is not null or state = 'failed' then 'failed' else 'done' end as outcome,
        least(2000000000, greatest(0, extract(epoch from (coalesce(locked_at, updated_at) - run_after)) * 1000)) as wait_ms,
        case when locked_at is null then 0
             else least(2000000000, greatest(0, extract(epoch from (updated_at - locked_at)) * 1000)) end as run_ms
      from jobs
      where updated_at >= date_trunc('hour', now(), 'UTC') - make_interval(hours => ${ROLLUP_LOOKBACK_HOURS})
        and updated_at < date_trunc('hour', now(), 'UTC')
        and state <> 'running'
        and (state in ('done', 'dead', 'failed') or (error_code is not null and retried_at is null))
        and not exists (select 1 from job_stats_hourly done where done.hour = date_trunc('hour', jobs.updated_at, 'UTC'))
    ) finished
    group by hour, kind, outcome
    on conflict (hour, kind, outcome) do update set
      count = excluded.count,
      wait_ms_sum = excluded.wait_ms_sum,
      wait_ms_p95 = excluded.wait_ms_p95,
      run_ms_sum = excluded.run_ms_sum,
      run_ms_p95 = excluded.run_ms_p95`.execute(db);
  return Number(result.numAffectedRows ?? 0);
}
