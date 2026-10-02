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
//
// **Priced since 2026-10-02.** Until then every token row said zero, because
// the worker sent the price and always sent 0, so only voice ever counted and
// the budget could not trip. core-api prices each call from its tokens now
// (pricing.ts), web search fees count with it, and a count of turns bounds an
// account whose turns are cheap but endless.

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

/** Turns an account may start in a day: dumps, answers and typed rows
 *  together. The heaviest real profile on the cost sheet starts about fifty;
 *  a hundred leaves it room and stops a script well short of the budget. */
export const DAILY_TURNS = 100;

/** What the account has spent in the last twenty four hours: every model call
 *  in the ledger and every web search fee. */
export async function spentToday(accountId: string, trx: Executor = db): Promise<number> {
  const row = await sql<{ spent: string }>`
    select coalesce((select sum(cost_micros) from llm_usage
                      where account_id = ${accountId} and created_at > now() - interval '24 hours'), 0)
         + coalesce((select sum(cost_micros) from lookups
                      where account_id = ${accountId} and created_at > now() - interval '24 hours'), 0) as spent`.execute(trx);
  return Number(row.rows[0]!.spent);
}

/** Turns the account started in the last twenty four hours. */
export async function turnsToday(accountId: string, trx: Executor = db): Promise<number> {
  const row = await trx
    .selectFrom("jobs")
    .select(({ fn }) => fn.countAll<number>().as("n"))
    .where("account_id", "=", accountId)
    .where("kind", "=", "dump.answer")
    .where(sql<boolean>`created_at > now() - interval '24 hours'`)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/** Whether the account has used the day: its budget spent or its turns
 *  started. The composer closes on this, so nobody types into a refusal. */
export async function atDailyLimit(accountId: string, trx: Executor = db): Promise<boolean> {
  return (await spentToday(accountId, trx)) >= DAILY_MODEL_BUDGET_MICROS || (await turnsToday(accountId, trx)) >= DAILY_TURNS;
}

/** Refuse the next turn once the day is used. */
export async function requireBudget(accountId: string, trx: Executor = db): Promise<void> {
  if (await atDailyLimit(accountId, trx)) throw new OverBudget();
}
