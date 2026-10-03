// Health's Calls view (034, section E): model calls per job from the ledger,
// and each company offload calls from what offload already records.
//
// Volume and latency live here; what the calls cost lives on Costs. Nothing
// here names an account.

import { sql } from "kysely";
import { db } from "../db.js";
import { bucketOf, series, type Range } from "./range.js";

export interface CallsOfKind {
  kind: string;
  calls: number;
  failures: number;
  /** Latency over the whole range, in milliseconds. */
  p50: number;
  p95: number;
  points: Array<{ at: Date; calls: number; failures: number; p50: number | null; p95: number | null }>;
}

/** Calls and latency per job kind per bucket from `llm_usage`, and failures
 *  per kind per bucket from the job history (failed and dead together).
 *  Busiest first. Every model call the ledger has, transcription included:
 *  the ledger keeps both under the job that made them. */
export async function modelCalls(range: Range): Promise<CallsOfKind[]> {
  const result = await sql<{ kind: string; at: Date; calls: string; p50: number | null; p95: number | null; failures: string }>`
    with buckets as (
      select at from ${series(range)} as buckets(at)
    ), calls as (
      select job_kind as kind, ${bucketOf(range, sql`created_at`)} as at, count(*) as calls,
             percentile_cont(0.5) within group (order by latency_ms) as p50,
             percentile_cont(0.95) within group (order by latency_ms) as p95
      from llm_usage
      where created_at >= (select min(at) from buckets)
      group by 1, 2
    ), failures as (
      select kind, ${bucketOf(range, sql`hour`)} as at, sum(count) as failures
      from job_stats_hourly
      where outcome in ('failed', 'dead') and hour >= (select min(at) from buckets)
      group by 1, 2
    )
    select kinds.kind, buckets.at,
           coalesce(calls.calls, 0) as calls, calls.p50, calls.p95,
           coalesce(failures.failures, 0) as failures
    from (select distinct kind from calls) kinds
    cross join buckets
    left join calls on calls.kind = kinds.kind and calls.at = buckets.at
    left join failures on failures.kind = kinds.kind and failures.at = buckets.at
    order by kinds.kind, buckets.at`.execute(db);

  // A percentile over the range is not a sum of its days', so it is asked for.
  const overall = await sql<{ kind: string; p50: number; p95: number }>`
    select job_kind as kind,
           percentile_cont(0.5) within group (order by latency_ms) as p50,
           percentile_cont(0.95) within group (order by latency_ms) as p95
    from llm_usage
    where created_at >= (select min(at) from ${series(range)} as buckets(at))
    group by 1`.execute(db);
  const latency = new Map(overall.rows.map((row) => [row.kind, row]));

  const kinds = new Map<string, CallsOfKind>();
  for (const row of result.rows) {
    const kind = kinds.get(row.kind) ?? {
      kind: row.kind,
      calls: 0,
      failures: 0,
      p50: Math.round(Number(latency.get(row.kind)?.p50 ?? 0)),
      p95: Math.round(Number(latency.get(row.kind)?.p95 ?? 0)),
      points: [],
    };
    const calls = Number(row.calls);
    const failures = Number(row.failures);
    kind.calls += calls;
    kind.failures += failures;
    kind.points.push({
      at: row.at,
      calls,
      failures,
      p50: row.p50 === null ? null : Math.round(Number(row.p50)),
      p95: row.p95 === null ? null : Math.round(Number(row.p95)),
    });
    kinds.set(row.kind, kind);
  }
  return [...kinds.values()].sort((a, b) => b.calls - a.calls || a.kind.localeCompare(b.kind));
}

export const VENDORS = ["model", "transcription", "embeddings", "search", "reads", "maps", "calendar", "mail", "push", "storage"] as const;
export type Vendor = (typeof VENDORS)[number];

export interface VendorRow {
  vendor: Vendor;
  /** False when offload has no row about this company at all, in which case
   *  the two figures are null: not recorded is not zero. */
  recorded: boolean;
  calls: number | null;
  failures: number | null;
}

/** What the worker writes when the model let a job down, and when the
 *  transcription company did. From the closed set in `jobs/errors.ts`. */
const MODEL_CODES = ["model_error", "invalid_output", "timeout", "nightly_error", "nightly_unparseable", "link_place_error"];
const TRANSCRIPTION_CODES = ["transcription_failed", "forget_error"];

/** The companies with no ledger of their own, and the jobs that call them.
 *  A call is a job of that kind with an outcome; a failure is one that failed
 *  or died. `embed.sweep` is not here: it finds work and calls nobody. */
const JOB_KINDS: Partial<Record<Vendor, string[]>> = {
  embeddings: ["embed.content", "embed.note", "embed.message"],
  maps: ["location.resolve", "blob.locate"],
  calendar: ["calendar.sync"],
  mail: ["email.waitlist_joined", "email.invited", "email.download_app", "email.alert"],
  push: ["account.digest", "push.receipts"],
  storage: ["blob.purge"],
};

interface Counted {
  recorded: boolean;
  calls: string;
  failures: string;
}

/** Calls and failures per company over the range.
 *
 *  - The model and transcription: calls from `llm_usage`, which is never
 *    purged; failures from job error codes, which go back the 30 days jobs
 *    are kept.
 *  - Search and reading links: `lookups`, a failure being `outcome = failed`.
 *  - The rest: `job_stats_hourly` for the kinds that call them, which goes
 *    back 90 days and holds closed hours only. */
export async function vendors(range: Range): Promise<VendorRow[]> {
  const start = sql<Date>`(select min(at) from ${series(range)} as buckets(at))`;

  const ledger = (transcription: boolean, codes: string[]) => sql<Counted>`
    select
      exists (select 1 from llm_usage where (model = 'assemblyai') = ${transcription}) as recorded,
      (select count(*) from llm_usage where (model = 'assemblyai') = ${transcription} and created_at >= ${start}) as calls,
      (select count(*) from jobs where error_code = any(${sql.val(codes)}) and updated_at >= ${start}) as failures`.execute(db);

  const lookups = (kind: "search" | "read") => sql<Counted>`
    select
      exists (select 1 from lookups where kind = ${kind}) as recorded,
      (select count(*) from lookups where kind = ${kind} and created_at >= ${start}) as calls,
      (select count(*) from lookups where kind = ${kind} and outcome = 'failed' and created_at >= ${start}) as failures`.execute(db);

  const history = (kinds: string[]) => sql<Counted>`
    select
      exists (select 1 from job_stats_hourly where kind = any(${sql.val(kinds)}))
        or exists (select 1 from jobs where kind = any(${sql.val(kinds)}) and state in ('done', 'dead')) as recorded,
      (select coalesce(sum(count), 0) from job_stats_hourly where kind = any(${sql.val(kinds)}) and hour >= ${start}) as calls,
      (select coalesce(sum(count), 0) from job_stats_hourly
        where kind = any(${sql.val(kinds)}) and outcome in ('failed', 'dead') and hour >= ${start}) as failures`.execute(db);

  const read = (vendor: Vendor) => {
    if (vendor === "model") return ledger(false, MODEL_CODES);
    if (vendor === "transcription") return ledger(true, TRANSCRIPTION_CODES);
    if (vendor === "search") return lookups("search");
    if (vendor === "reads") return lookups("read");
    return history(JOB_KINDS[vendor]!);
  };

  return Promise.all(
    VENDORS.map(async (vendor) => {
      const row = (await read(vendor)).rows[0]!;
      return row.recorded
        ? { vendor, recorded: true, calls: Number(row.calls), failures: Number(row.failures) }
        : { vendor, recorded: false, calls: null, failures: null };
    })
  );
}
