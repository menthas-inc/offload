// The daily pull (034, section 4.1): each company's own bill for the month,
// and the subscriptions an owner typed on Limits.
//
// **The registry is empty, on purpose.** A puller is written against a
// response somebody recorded from the real interface, never against its
// documentation: 016 shipped a field taken from a docs page, the API refused
// it, and every pasted link failed silently. No billing key exists in any
// session that has built this, so no interface has been called and no puller
// has been written. The impl-spec's appendix lists what to try. Until then
// every company is metered or fixed, and says so.
//
// A puller is handed a date range and nothing else (AC-59). It reads its own
// key from the environment, and runs only when that key is set, so a local
// server never calls out.

import { sql } from "kysely";
import { db } from "../db.js";
import { JobError } from "../jobs/errors.js";
import { clearSettingsCache, setting } from "../settings.js";

export interface Pulled {
  /** A UTC month, `YYYY-MM`. */
  month: string;
  micros: number;
  /** Whether the company has closed the month. */
  final: boolean;
}

export interface Puller {
  /** A slug from `vendors.ts`. */
  vendor: string;
  pull(from: Date, to: Date): Promise<Pulled[]>;
}

interface Registered {
  /** The environment variable holding the puller's key. Unset, it never runs. */
  env: string;
  puller: Puller;
}

export const PULLERS: Registered[] = [];

/** Add a puller. Returns what takes it out again, which is what a test needs. */
export function registerPuller(env: string, puller: Puller): () => void {
  const entry = { env, puller };
  PULLERS.push(entry);
  return () => {
    const at = PULLERS.indexOf(entry);
    if (at !== -1) PULLERS.splice(at, 1);
  };
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The UTC month a moment falls in, `YYYY-MM`. */
export function monthOf(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/** The first moment of the month `back` months before the one `at` is in. */
export function monthStart(at: Date, back = 0): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - back, 1));
}

function valid(rows: unknown): rows is Pulled[] {
  return (
    Array.isArray(rows) &&
    rows.every(
      (row: Pulled) =>
        row !== null &&
        typeof row === "object" &&
        typeof row.month === "string" &&
        MONTH.test(row.month) &&
        Number.isSafeInteger(row.micros) &&
        row.micros >= 0 &&
        typeof row.final === "boolean",
    )
  );
}

/** This month's subscriptions, as Limits has them now.
 *
 *  Only the month the job runs in is written, so an amount changed today
 *  applies from this month and the months before keep what they were charged
 *  (AC-58). An amount taken away stops from this month the same way. */
async function writeFixed(now: Date): Promise<void> {
  // Read fresh: a daily job should not act on a value fifteen seconds stale
  // in one direction and a day stale in the other.
  clearSettingsCache();
  const amounts = Object.entries(await setting("costs.fixed")).filter(([, micros]) => micros > 0);
  const month = `${monthOf(now)}-01`;
  await db.transaction().execute(async (tx) => {
    const kept = amounts.map(([slug]) => slug);
    await tx
      .deleteFrom("vendor_costs")
      .where("source", "=", "fixed")
      .where("month", "=", month)
      .$if(kept.length > 0, (query) => query.where("vendor", "not in", kept))
      .execute();
    for (const [slug, micros] of amounts) {
      await tx
        .insertInto("vendor_costs")
        .values({ vendor: slug, month, source: "fixed", amount_micros: micros, final: false, read_at: sql`now()` })
        .onConflict((oc) => oc.columns(["vendor", "month", "source"]).doUpdateSet({ amount_micros: micros, read_at: sql`now()` }))
        .execute();
    }
  });
}

/** One run: the fixed amounts, then every registered puller whose key is set.
 *
 *  A pull that throws, or answers something that is not a month and a whole
 *  amount, writes nothing: the last figure stays with the time it was read.
 *  The others still run, and the run then fails as `vendor_error` naming the
 *  companies and nothing else. **What a pull threw is never kept**: an HTTP
 *  client's error can quote the request, and the request carries the key. */
export async function pullBilling(now = new Date()): Promise<void> {
  await writeFixed(now);

  const from = monthStart(now, 1);
  const failed: string[] = [];
  for (const { env, puller } of PULLERS) {
    if (!process.env[env]) continue;
    try {
      const rows: unknown = await puller.pull(from, now);
      if (!valid(rows)) throw new Error("unreadable");
      await db.transaction().execute(async (tx) => {
        for (const row of rows) {
          await tx
            .insertInto("vendor_costs")
            .values({ vendor: puller.vendor, month: `${row.month}-01`, source: "billed", amount_micros: row.micros, final: row.final, read_at: sql`now()` })
            .onConflict((oc) => oc.columns(["vendor", "month", "source"]).doUpdateSet({ amount_micros: row.micros, final: row.final, read_at: sql`now()` }))
            .execute();
        }
      });
    } catch {
      failed.push(puller.vendor);
    }
  }
  if (failed.length > 0) throw new JobError("vendor_error", `billing pull failed for ${failed.join(", ")}`);
}
