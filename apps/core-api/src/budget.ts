// What one account may spend on the model in a day.
//
// Every dump, typed row and typed answer is a model call, and until the
// security review of 2026-09-22 (M6) nothing bounded how many an account could
// make: photos and voice notes had daily caps and text had none, so an invited
// account, or a stolen session, could run a bill. The ledger already prices
// every call in `llm_usage`; this reads it before another is enqueued.
//
// Read at the moment a person asks, never enforced on the worker: a turn that
// has started is finished, and the cap is on starting the next one. The
// number is a constant here until the admin panel's Limits page exists, which
// is the screen the kits draw for it.

import { sql } from "kysely";
import { db } from "./db.js";
import type { Executor } from "./threads/access.js";

/** Five dollars a day, in millionths. Well past what a person does by hand
 *  and well short of what a script does. */
export const DAILY_MODEL_BUDGET_MICROS = 5_000_000;

export class OverBudget extends Error {
  constructor() {
    super("daily_limit");
  }
}

/** What the ledger says the account has spent in the last twenty four hours. */
export async function spentToday(accountId: string, trx: Executor = db): Promise<number> {
  const row = await trx
    .selectFrom("llm_usage")
    .select(({ fn }) => fn.coalesce(fn.sum<number>("cost_micros"), sql<number>`0`).as("spent"))
    .where("account_id", "=", accountId)
    .where(sql<boolean>`created_at > now() - interval '24 hours'`)
    .executeTakeFirstOrThrow();
  return Number(row.spent);
}

/** Refuse the next model call once the day's budget is spent. */
export async function requireBudget(accountId: string, trx: Executor = db): Promise<void> {
  if ((await spentToday(accountId, trx)) >= DAILY_MODEL_BUDGET_MICROS) throw new OverBudget();
}
