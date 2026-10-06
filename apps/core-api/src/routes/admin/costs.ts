// 034, section B. Costs: what the ledger says offload spent.
//
// Registered by the admin plugin in the owner scope, so every path here is
// relative to `/v1/admin` and already behind the owner check. Every route is
// a GET and writes nothing.
//
// **Money is `llm_usage.cost_micros` plus `lookups.cost_micros`**, the same
// two sums the caps read (`budget.ts`). A row whose account has gone (0076)
// counts in every total and never appears beside a person. Everything is
// computed live: at the volumes the impl-spec gives, a 90 day group-by on an
// indexed `created_at` is tens of milliseconds.
//
// Days are UTC days and the clock is the database's, so a figure and the
// bucket it lands in are decided in one place.

import { sql, type RawBuilder } from "kysely";
import { z } from "zod";
import type { App } from "../../app.js";
import { db } from "../../db.js";
import { setting } from "../../settings.js";
import { signedIn } from "../../accounts/active.js";

const RANGES = {
  "24h": { unit: "hour", steps: 24 },
  "7d": { unit: "day", steps: 7 },
  "30d": { unit: "day", steps: 30 },
  "90d": { unit: "day", steps: 90 },
} as const;

type Range = keyof typeof RANGES;

const range = z.enum(["24h", "7d", "30d", "90d"]).default("30d");
const unit = z.enum(["hour", "day"]);
const notFound = z.object({ error: z.literal("not-found") });

/** How long jobs are kept once done, in days: past it, who was active is read
 *  from the ledger, which is never purged. */
const JOBS_KEPT_DAYS = 30;

/** How many keys a trend is split into. Small multiples stop being small. */
const TREND_KEYS = 4;

/** What each job pays for, in the panel's words. A kind with no name here
 *  shows its kind. The two `lookup.` keys are not job kinds: they are the
 *  fees in `lookups`, which belong to no model call. */
const JOB_NAMES: Record<string, string> = {
  "dump.answer": "Filing and answering",
  "thread.nightly": "Nightly pass",
  "account.memories": "Memory pass",
  "lookup.search": "Web search",
  "lookup.read": "Reading links",
};

/** Every company the ledger could name, and whether anything writes a row
 *  for it. One that writes none reads as not recorded, never as zero. */
const VENDORS: ReadonlyArray<{ key: string; name: string; recorded: boolean }> = [
  { key: "model", name: "The model", recorded: true },
  { key: "transcription", name: "Transcription", recorded: true },
  { key: "search", name: "Web search", recorded: true },
  { key: "reads", name: "Reading links", recorded: true },
  { key: "embeddings", name: "Embeddings", recorded: false },
  { key: "maps", name: "Maps", recorded: false },
];

const DIMS = { job: "job", model: "model", vendor: "vendor" } as const;

const nameOf = (key: string): string => JOB_NAMES[key] ?? key;

/** The range as the database sees it: where it starts, and one row per
 *  bucket. Steps are whole hours added to a UTC boundary, so no session time
 *  zone and no clock change can move one. */
function span(of: Range) {
  const { unit, steps } = RANGES[of];
  const hours = unit === "hour" ? 1 : 24;
  const from = sql<Date>`(date_trunc(${sql.lit(unit)}, now(), 'UTC') - make_interval(hours => ${sql.lit((steps - 1) * hours)}))`;
  const buckets = sql`select ${from} + make_interval(hours => n * ${sql.lit(hours)}) as at from generate_series(0, ${sql.lit(steps - 1)}) as n`;
  const bucketOf = (column: string) => sql`date_trunc(${sql.lit(unit)}, ${sql.ref(column)}, 'UTC')`;
  return { unit, from, buckets, bucketOf };
}

/** Both halves of the ledger since `from`, as one set of rows. A lookup has
 *  no job and no model, so it is keyed by what it was. */
function ledger(from: RawBuilder<Date>) {
  return sql`
    select created_at, account_id, job_kind as job, model, false as fee,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_micros,
           case when model = 'assemblyai' then 'transcription' else 'model' end as vendor
      from llm_usage
     where created_at >= ${from}
    union all
    select created_at, account_id, 'lookup.' || kind, 'lookup.' || kind, true,
           0, 0, 0, 0, cost_micros,
           case when kind = 'search' then 'search' else 'reads' end
      from lookups
     where created_at >= ${from}`;
}

/** On pace for: the month so far, over the days gone, times the days in the
 *  month. Two days is too few to say. */
export function onPace(monthMicros: number, day: number, daysInMonth: number): { tooEarly: boolean; onPaceMicros: number | null } {
  if (day <= 2) return { tooEarly: true, onPaceMicros: null };
  return { tooEarly: false, onPaceMicros: Math.round((monthMicros / day) * daysInMonth) };
}

/** One cell of the export. A cell a spreadsheet would run as a formula is
 *  made text with a leading quote, and one that would break the row is
 *  quoted. Job kinds and model names are the only strings in the file, and
 *  both are an open set. */
export function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const CSV_HEAD = ["day", "job", "model", "calls", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "cost_usd"];

interface Sums {
  micros: number;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const NOTHING: Sums = { micros: 0, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const trendPoint = z.object({
  at: z.string(),
  micros: z.number().int(),
  calls: z.number().int(),
  input: z.number().int(),
  output: z.number().int(),
  cacheRead: z.number().int(),
  cacheWrite: z.number().int(),
});
const trendSeries = z.object({ key: z.string(), name: z.string(), points: z.array(trendPoint) });

/** Spend and calls by one column of the ledger, dearest first. */
async function splitBy(dim: keyof typeof DIMS, from: RawBuilder<Date>): Promise<Array<{ key: string; micros: number; calls: number }>> {
  const rows = await sql<{ key: string; micros: string; calls: string }>`
    with l as (${ledger(from)})
    select ${sql.ref(DIMS[dim])} as key, coalesce(sum(cost_micros), 0) as micros, count(*) as calls
      from l
     group by ${sql.ref(DIMS[dim])}
     order by 2 desc, ${sql.ref(DIMS[dim])} collate "C"`.execute(db);
  return rows.rows.map((row) => ({ key: row.key, micros: Number(row.micros), calls: Number(row.calls) }));
}

export async function costsAdminRoutes(app: App): Promise<void> {
  // The stats row: this month, last month, per account and the pace, in UTC
  // months. The budget is a figure from Limits that nothing enforces, and the
  // platform cap is here so the daily plot can say when it is off.
  app.get(
    "/costs/summary",
    {
      schema: {
        response: {
          200: z.object({
            monthStart: z.string(),
            monthMicros: z.number().int(),
            lastMonthMicros: z.number().int(),
            /** Every account People lists: signed in at least once, active
             *  or disabled, not removed. */
            accounts: z.number().int(),
            perAccountMicros: z.number().int(),
            tooEarly: z.boolean(),
            onPaceMicros: z.number().int().nullable(),
            /** Null when no budget is set. */
            budgetMicros: z.number().int().nullable(),
            /** Null when the platform cap is off. */
            platformCapMicros: z.number().int().nullable(),
          }),
          404: notFound,
        },
      },
    },
    async (_request, reply) => {
      const result = await sql<{ month_start: Date; day: number; days: number; month: string; last: string; accounts: string }>`
        with m as (
          select date_trunc('month', now(), 'UTC') as this,
                 date_trunc('month', date_trunc('month', now(), 'UTC') - interval '1 day', 'UTC') as last
        )
        select m.this as month_start,
               extract(day from now() at time zone 'UTC')::int as day,
               extract(day from date_trunc('month', now() at time zone 'UTC') + interval '1 month' - interval '1 day')::int as days,
               coalesce((select sum(cost_micros) from llm_usage where created_at >= m.this), 0)
                 + coalesce((select sum(cost_micros) from lookups where created_at >= m.this), 0) as month,
               coalesce((select sum(cost_micros) from llm_usage where created_at >= m.last and created_at < m.this), 0)
                 + coalesce((select sum(cost_micros) from lookups where created_at >= m.last and created_at < m.this), 0) as last,
               (select count(*) from accounts where ${signedIn("accounts")}) as accounts
          from m`.execute(db);
      const row = result.rows[0]!;
      const monthMicros = Number(row.month);
      const accounts = Number(row.accounts);
      return reply.send({
        monthStart: row.month_start.toISOString(),
        monthMicros,
        lastMonthMicros: Number(row.last),
        accounts,
        perAccountMicros: accounts > 0 ? Math.round(monthMicros / accounts) : 0,
        ...onPace(monthMicros, row.day, row.days),
        budgetMicros: await setting("budget.month_micros"),
        platformCapMicros: await setting("platform.spend_micros"),
      });
    }
  );

  // Spend per UTC day, or per hour for 24 hours: one point for every bucket
  // in the range, zero where nothing was spent. A day the platform's cap
  // refused somebody is marked, from `limit_hits`.
  app.get(
    "/costs/daily",
    {
      schema: {
        querystring: z.object({ range }),
        response: {
          200: z.object({
            unit,
            totalMicros: z.number().int(),
            totalCalls: z.number().int(),
            points: z.array(z.object({ at: z.string(), micros: z.number().int(), calls: z.number().int(), capReached: z.boolean() })),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const { unit, from, buckets, bucketOf } = span(request.query.range);
      const rows = await sql<{ at: Date; micros: string; calls: string; cap_reached: boolean }>`
        with b as (${buckets}), l as (${ledger(from)})
        select b.at,
               coalesce(sum(l.cost_micros), 0) as micros,
               count(l.created_at) as calls,
               exists (select 1 from limit_hits h
                        where h.scope = 'platform' and h.day = (b.at at time zone 'UTC')::date) as cap_reached
          from b
          left join l on ${bucketOf("l.created_at")} = b.at
         group by b.at
         order by b.at`.execute(db);
      const points = rows.rows.map((row) => ({
        at: row.at.toISOString(),
        micros: Number(row.micros),
        calls: Number(row.calls),
        capReached: row.cap_reached,
      }));
      return reply.send({
        unit,
        totalMicros: points.reduce((total, point) => total + point.micros, 0),
        totalCalls: points.reduce((total, point) => total + point.calls, 0),
        points,
      });
    }
  );

  // Where it goes: spend and calls by the job being paid for, by model, or
  // by vendor. Each sums to the range's total. The vendor is derived: a call
  // to `assemblyai` is transcription, a lookup is search or a read, and
  // everything else in `llm_usage` is the model.
  app.get(
    "/costs/by",
    {
      schema: {
        querystring: z.object({ dim: z.enum(["job", "model", "vendor"]).default("job"), range }),
        response: {
          200: z.object({
            dim: z.enum(["job", "model", "vendor"]),
            totalMicros: z.number().int(),
            totalCalls: z.number().int(),
            rows: z.array(
              z.object({
                key: z.string(),
                name: z.string(),
                /** False for a vendor nothing writes a ledger row for. Its
                 *  figures are null, which is not zero. */
                recorded: z.boolean(),
                micros: z.number().int().nullable(),
                calls: z.number().int().nullable(),
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const { dim } = request.query;
      const found = await splitBy(dim, span(request.query.range).from);
      const totals = {
        totalMicros: found.reduce((total, row) => total + row.micros, 0),
        totalCalls: found.reduce((total, row) => total + row.calls, 0),
      };
      if (dim !== "vendor") {
        return reply.send({ dim, ...totals, rows: found.map((row) => ({ ...row, name: nameOf(row.key), recorded: true })) });
      }
      const byKey = new Map(found.map((row) => [row.key, row]));
      return reply.send({
        dim,
        ...totals,
        rows: VENDORS.map((vendor) => ({
          key: vendor.key,
          name: vendor.name,
          recorded: vendor.recorded,
          micros: vendor.recorded ? (byKey.get(vendor.key)?.micros ?? 0) : null,
          calls: vendor.recorded ? (byKey.get(vendor.key)?.calls ?? 0) : null,
        })),
      });
    }
  );

  // Trends: spend, calls and tokens per bucket, for everything together and
  // for the few jobs or models that cost most in the range. One point per
  // bucket in every series, zero where there was nothing.
  app.get(
    "/costs/trends",
    {
      schema: {
        querystring: z.object({ dim: z.enum(["job", "model"]).default("job"), range }),
        response: {
          200: z.object({ unit, dim: z.enum(["job", "model"]), total: trendSeries, series: z.array(trendSeries) }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const { dim } = request.query;
      const { unit, from, buckets, bucketOf } = span(request.query.range);
      const [times, cells, split] = await Promise.all([
        sql<{ at: Date }>`with b as (${buckets}) select at from b order by at`.execute(db),
        sql<{ at: Date; key: string; micros: string; calls: string; input: string; output: string; cache_read: string; cache_write: string }>`
          with l as (${ledger(from)})
          select ${bucketOf("created_at")} as at, ${sql.ref(DIMS[dim])} as key,
                 coalesce(sum(cost_micros), 0) as micros, count(*) as calls,
                 coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output,
                 coalesce(sum(cache_read_tokens), 0) as cache_read, coalesce(sum(cache_write_tokens), 0) as cache_write
            from l
           group by 1, 2`.execute(db),
        splitBy(dim, from),
      ]);

      const at = times.rows.map((row) => row.at.toISOString());
      const total = new Map<string, Sums>();
      const byKey = new Map<string, Map<string, Sums>>();
      for (const cell of cells.rows) {
        const when = cell.at.toISOString();
        const sums: Sums = {
          micros: Number(cell.micros),
          calls: Number(cell.calls),
          input: Number(cell.input),
          output: Number(cell.output),
          cacheRead: Number(cell.cache_read),
          cacheWrite: Number(cell.cache_write),
        };
        if (!byKey.has(cell.key)) byKey.set(cell.key, new Map());
        byKey.get(cell.key)!.set(when, sums);
        const so = total.get(when) ?? NOTHING;
        total.set(when, {
          micros: so.micros + sums.micros,
          calls: so.calls + sums.calls,
          input: so.input + sums.input,
          output: so.output + sums.output,
          cacheRead: so.cacheRead + sums.cacheRead,
          cacheWrite: so.cacheWrite + sums.cacheWrite,
        });
      }
      const points = (of: Map<string, Sums> | undefined) => at.map((when) => ({ at: when, ...(of?.get(when) ?? NOTHING) }));

      return reply.send({
        unit,
        dim,
        total: { key: "all", name: "Everything", points: points(total) },
        series: split.slice(0, TREND_KEYS).map((row) => ({ key: row.key, name: nameOf(row.key), points: points(byKey.get(row.key)) })),
      });
    }
  );

  // Usage: how many accounts did anything, and how much, per bucket. Each
  // count is read from the table its cap counts from: turns from `dump.answer`
  // jobs, photos and voice notes from `blobs`, mail from `messages`.
  //
  // Jobs are purged at thirty days, so who was active before that is read
  // from the ledger, and turns before that are not known: `turnsFrom` says
  // where they start when the range reaches further back.
  app.get(
    "/costs/usage",
    {
      schema: {
        querystring: z.object({ range }),
        response: {
          200: z.object({
            unit,
            turnsFrom: z.string().nullable(),
            points: z.array(
              z.object({
                at: z.string(),
                accounts: z.number().int(),
                turns: z.number().int(),
                photos: z.number().int(),
                voiceNotes: z.number().int(),
                mailIn: z.number().int(),
              })
            ),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const { unit, from, buckets, bucketOf } = span(request.query.range);
      const rows = await sql<{ at: Date; kept: boolean; accounts: string; turns: string; photos: string; voice: string; mail: string }>`
        with b as (${buckets}),
        kept as (select date_trunc('day', now(), 'UTC') - make_interval(hours => ${sql.lit((JOBS_KEPT_DAYS - 1) * 24)}) as since),
        turns as (
          select ${bucketOf("created_at")} as at, count(*) as n, count(distinct account_id) as accounts
            from jobs where kind = 'dump.answer' and created_at >= ${from} group by 1
        ),
        paid as (
          select ${bucketOf("created_at")} as at, count(distinct account_id) as accounts
            from llm_usage where job_kind = 'dump.answer' and account_id is not null and created_at >= ${from} group by 1
        ),
        files as (
          select ${bucketOf("created_at")} as at,
                 count(*) filter (where kind = 'image') as photos,
                 count(*) filter (where kind = 'audio') as voice
            from blobs where created_at >= ${from} group by 1
        ),
        mail as (
          select ${bucketOf("created_at")} as at, count(*) as n
            from messages where source = 'mail' and created_at >= ${from} group by 1
        )
        select b.at,
               b.at >= kept.since as kept,
               case when b.at >= kept.since then coalesce(turns.accounts, 0) else coalesce(paid.accounts, 0) end as accounts,
               coalesce(turns.n, 0) as turns,
               coalesce(files.photos, 0) as photos,
               coalesce(files.voice, 0) as voice,
               coalesce(mail.n, 0) as mail
          from b
         cross join kept
          left join turns on turns.at = b.at
          left join paid on paid.at = b.at
          left join files on files.at = b.at
          left join mail on mail.at = b.at
         order by b.at`.execute(db);
      const first = rows.rows[0];
      const firstKept = rows.rows.find((row) => row.kept);
      return reply.send({
        unit,
        turnsFrom: first && !first.kept && firstKept ? firstKept.at.toISOString() : null,
        points: rows.rows.map((row) => ({
          at: row.at.toISOString(),
          accounts: Number(row.accounts),
          turns: Number(row.turns),
          photos: Number(row.photos),
          voiceNotes: Number(row.voice),
          mailIn: Number(row.mail),
        })),
      });
    }
  );

  // The twenty accounts that spent most in the range. A person is their name
  // and their address, and a row with nobody attached is nobody's.
  app.get(
    "/costs/heaviest",
    {
      schema: {
        querystring: z.object({ range }),
        response: {
          200: z.object({
            rows: z.array(z.object({ id: z.string(), name: z.string().nullable(), email: z.string(), micros: z.number().int() })),
          }),
          404: notFound,
        },
      },
    },
    async (request, reply) => {
      const rows = await sql<{ id: string; display_name: string | null; email: string; micros: string }>`
        with l as (${ledger(span(request.query.range).from)})
        select a.id, a.display_name, a.email, sum(l.cost_micros) as micros
          from l
          join accounts a on a.id = l.account_id
         where ${signedIn("a")}
         group by a.id, a.display_name, a.email
         order by 4 desc, a.id
         limit 20`.execute(db);
      return reply.send({
        rows: rows.rows.map((row) => ({ id: row.id, name: row.display_name, email: row.email, micros: Number(row.micros) })),
      });
    }
  );

  // The export: one row per UTC day, job and model. No account in it, by
  // construction: the query never selects one. No response schema, because
  // the answer is a file and not JSON.
  app.get("/costs/export.csv", { schema: { querystring: z.object({ range }) } }, async (request, reply) => {
    const rows = await sql<{ day: string; job: string; model: string; calls: string; input: string; output: string; cache_read: string; cache_write: string; micros: string }>`
      with l as (${ledger(span(request.query.range).from)}), g as (
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day,
             job,
             case when fee then '' else model end as model,
             count(*) as calls,
             coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output,
             coalesce(sum(cache_read_tokens), 0) as cache_read, coalesce(sum(cache_write_tokens), 0) as cache_write,
             coalesce(sum(cost_micros), 0) as micros
        from l
       group by 1, 2, 3)
      select day, job, model, calls, input, output, cache_read, cache_write, micros
        from g
       order by day, job collate "C", model collate "C"`.execute(db);
    const lines = [
      CSV_HEAD.join(","),
      ...rows.rows.map((row) =>
        [
          csvCell(row.day),
          csvCell(row.job),
          csvCell(row.model),
          Number(row.calls),
          Number(row.input),
          Number(row.output),
          Number(row.cache_read),
          Number(row.cache_write),
          (Number(row.micros) / 1_000_000).toFixed(6),
        ].join(",")
      ),
    ];
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="offload-costs-${request.query.range}.csv"`)
      .send(`${lines.join("\r\n")}\r\n`);
  });
}
