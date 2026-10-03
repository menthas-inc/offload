// What offload really costs, month by month (034, section 4.1).
//
// One row per company a month, and each says where its number came from,
// because the three kinds are not equally true:
//
//   billed   the company's own figure, stored by the daily pull
//   fixed    a subscription an owner typed on Limits
//   metered  the ledger's estimate, summed here at read time
//
// A bill wins over a typed amount, and either wins over the ledger. Where a
// row is not the ledger's and the ledger has a figure too, the row carries
// both and the difference, which is the finding: the ledger is mispricing a
// call, or something is spending that it never sees.
//
// Nothing is written here and nothing about a person is read: the ledger is
// summed by month with no account in the query.

import { sql } from "kysely";
import { db } from "../db.js";
import { setting } from "../settings.js";
import { monthOf, monthStart } from "./pull.js";
import { VENDORS, vendor, type LedgerPart } from "./vendors.js";

export interface BillingRow {
  vendor: string;
  name: string;
  source: "billed" | "metered" | "fixed";
  micros: number;
  /** The ledger's figure, beside a bill or a typed amount. */
  metered?: number;
  /** The row's figure less the ledger's. */
  difference?: number;
  /** When a bill was read from the company. */
  readAt?: string;
  final: boolean;
  /** False when there is no bill, no amount and no ledger row: the company is
   *  paid, and nothing here says how much. */
  recorded: boolean;
}

export interface BillingMonth {
  /** A UTC month, `YYYY-MM`. */
  month: string;
  final: boolean;
  total: number;
  rows: BillingRow[];
}

type Ledger = Map<string, Partial<Record<LedgerPart, number>>>;

/** The ledger by UTC month and part, as Costs splits a vendor: `assemblyai`
 *  is transcription, a lookup is a search or a read, the rest is the model. */
async function ledgerSince(from: Date): Promise<Ledger> {
  const [usage, lookups] = await Promise.all([
    sql<{ month: string; transcription: boolean; micros: number }>`
      select to_char(date_trunc('month', created_at at time zone 'UTC'), 'YYYY-MM') as month,
             (model = 'assemblyai') as transcription,
             sum(cost_micros)::bigint as micros
      from llm_usage where created_at >= ${from} group by 1, 2`.execute(db),
    sql<{ month: string; kind: "search" | "read"; micros: number }>`
      select to_char(date_trunc('month', created_at at time zone 'UTC'), 'YYYY-MM') as month,
             kind,
             sum(cost_micros)::bigint as micros
      from lookups where created_at >= ${from} group by 1, 2`.execute(db),
  ]);
  const ledger: Ledger = new Map();
  const put = (month: string, part: LedgerPart, micros: number): void => {
    const parts = ledger.get(month) ?? {};
    parts[part] = (parts[part] ?? 0) + Number(micros);
    ledger.set(month, parts);
  };
  for (const row of usage.rows) put(row.month, row.transcription ? "transcription" : "model", row.micros);
  for (const row of lookups.rows) put(row.month, row.kind, row.micros);
  return ledger;
}

interface Stored {
  micros: number;
  final: boolean;
  readAt: Date;
}

export async function billingMonths(count: number, now = new Date()): Promise<BillingMonth[]> {
  const from = monthStart(now, count - 1);
  const current = monthOf(now);

  const [ledger, costs, fixedNow] = await Promise.all([
    ledgerSince(from),
    db
      .selectFrom("vendor_costs")
      .select([sql<string>`to_char(month, 'YYYY-MM')`.as("month"), "vendor", "source", "amount_micros", "final", "read_at"])
      .where("month", ">=", from.toISOString().slice(0, 10))
      .execute(),
    setting("costs.fixed"),
  ]);

  const stored = new Map<string, Stored>();
  for (const row of costs) {
    // This month's subscriptions are the setting as it stands, below: the
    // daily job's copy may be a day behind a change.
    if (row.source === "fixed" && row.month === current) continue;
    stored.set(`${row.month}|${row.vendor}|${row.source}`, { micros: Number(row.amount_micros), final: row.final, readAt: row.read_at });
  }

  // The companies the table knows, in its order, then any it does not.
  const known = new Set(VENDORS.map((one) => one.slug));
  const extra = [...new Set([...costs.map((row) => row.vendor), ...Object.keys(fixedNow)])].filter((slug) => !known.has(slug)).sort();
  const slugs = [...VENDORS.map((one) => one.slug), ...extra];

  return Array.from({ length: count }, (_, index) => {
    const month = monthOf(monthStart(now, count - 1 - index));
    const closed = month !== current;
    const parts = ledger.get(month) ?? {};

    const rows = slugs.map((slug): BillingRow => {
      const about = vendor(slug);
      const base = { vendor: slug, name: about?.name ?? slug };
      const mine = (about?.ledger ?? []).filter((part) => parts[part] !== undefined);
      const metered = mine.length > 0 ? mine.reduce((sum, part) => sum + parts[part]!, 0) : undefined;
      const beside = metered === undefined ? {} : { metered };

      const billed = stored.get(`${month}|${slug}|billed`);
      if (billed) {
        return {
          ...base,
          source: "billed",
          micros: billed.micros,
          ...beside,
          ...(metered === undefined ? {} : { difference: billed.micros - metered }),
          readAt: billed.readAt.toISOString(),
          final: closed && billed.final,
          recorded: true,
        };
      }

      const typed = closed ? stored.get(`${month}|${slug}|fixed`)?.micros : fixedNow[slug];
      if (typed !== undefined && typed > 0) {
        return { ...base, source: "fixed", micros: typed, ...beside, ...(metered === undefined ? {} : { difference: typed - metered }), final: closed, recorded: true };
      }

      return { ...base, source: "metered", micros: metered ?? 0, final: closed, recorded: metered !== undefined };
    });

    return { month, final: closed && rows.every((row) => row.final), total: rows.reduce((sum, row) => sum + row.micros, 0), rows };
  });
}
