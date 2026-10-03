// What one account may spend on the model in a day.
//
// Every dump, typed row and typed answer is a model call, and until the
// security review of 2026-09-22 (M6) nothing bounded how many an account could
// make: photos and voice notes had daily caps and text had none, so an invited
// account, or a stolen session, could run a bill. The ledger already prices
// every call in `llm_usage`; this reads it before another is enqueued.
//
// Read at the moment a person asks, never enforced on the worker: a turn that
// has started is finished, and the cap is on starting the next one.
//
// **The numbers are settings since 034.** The constants below are the
// defaults behind `cap.spend_micros` and `cap.turns` (`settings.ts`), read
// through `limitFor` so one account can carry its own. The platform has a cap
// too, off until an owner sets it, and every refusal is written to
// `limit_hits` with whose cap it was.
//
// **Priced since 2026-10-02.** Until then every token row said zero, because
// the worker sent the price and always sent 0, so only voice ever counted and
// the budget could not trip. core-api prices each call from its tokens now
// (pricing.ts), web search fees count with it, and a count of turns bounds an
// account whose turns are cheap but endless.

import { sql } from "kysely";
import { db } from "./db.js";
import type { Executor } from "./threads/access.js";
import { limitFor, setting, type CapKey } from "./settings.js";

/** Five dollars a day, in millionths. Well past what a person does by hand
 *  and well short of what a script does. */
export const DAILY_MODEL_BUDGET_MICROS = 5_000_000;

/** Which cap refused, and whose it was: the account's own, or the one every
 *  account shares. */
export interface Hit {
  cap: CapKey | "platform.spend_micros";
  scope: "account" | "platform";
}

export class OverBudget extends Error {
  constructor(
    readonly scope: Hit["scope"] = "account",
    readonly cap: Hit["cap"] = "cap.spend_micros",
  ) {
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

/** How long the platform's sum is trusted, the settings' own fifteen seconds:
 *  it is read on every dump, and a cap that lands twenty seconds late is the
 *  promise Limits makes. */
const PLATFORM_CACHE_MS = 15_000;
let platform: { spent: number; at: number } | null = null;

/** Forget the platform's sum. For tests. */
export function clearPlatformSpent(): void {
  platform = null;
}

/** What every account together has spent in the last twenty four hours,
 *  including rows whose account has gone. One indexed sum per table (0076). */
export async function platformSpent(): Promise<number> {
  if (platform && Date.now() - platform.at < PLATFORM_CACHE_MS) return platform.spent;
  const row = await sql<{ spent: string }>`
    select coalesce((select sum(cost_micros) from llm_usage where created_at > now() - interval '24 hours'), 0)
         + coalesce((select sum(cost_micros) from lookups where created_at > now() - interval '24 hours'), 0) as spent`.execute(db);
  const spent = Number(row.rows[0]!.spent);
  platform = { spent, at: Date.now() };
  return spent;
}

/** Whether the platform's cap is set and reached. Off is not zero: unset, it
 *  refuses nobody. Scheduled model work asks this before it is booked. */
export async function platformCapReached(): Promise<boolean> {
  const cap = await setting("platform.spend_micros");
  return cap !== null && (await platformSpent()) >= cap;
}

/** The cap that would refuse this account's next turn, if any. The platform's
 *  first: when both are reached it is the one refusing everybody. */
export async function limitReached(accountId: string, trx: Executor = db): Promise<Hit | null> {
  if (await platformCapReached()) return { cap: "platform.spend_micros", scope: "platform" };
  if ((await spentToday(accountId, trx)) >= (await limitFor(accountId, "cap.spend_micros"))) {
    return { cap: "cap.spend_micros", scope: "account" };
  }
  if ((await turnsToday(accountId, trx)) >= (await limitFor(accountId, "cap.turns"))) {
    return { cap: "cap.turns", scope: "account" };
  }
  return null;
}

/** Whether the account has used the day: its budget spent, its turns started,
 *  or the platform's cap reached. The composer closes on this, so nobody
 *  types into a refusal. */
export async function atDailyLimit(accountId: string, trx: Executor = db): Promise<boolean> {
  return (await limitReached(accountId, trx)) !== null;
}

/** Write a refusal down: one row per account, cap, scope and UTC day, counted.
 *
 *  **On the pool, never in the caller's transaction.** A refusal usually ends
 *  with a throw, and a hit written inside the transaction that throw rolls
 *  back is a hit nobody ever sees. */
export async function recordHit(accountId: string, cap: Hit["cap"], scope: Hit["scope"]): Promise<void> {
  await sql`
    insert into limit_hits (account_id, cap, scope, day)
    values (${accountId}, ${cap}, ${scope}, (now() at time zone 'UTC')::date)
    on conflict (account_id, cap, scope, day)
    do update set count = limit_hits.count + 1, last_at = now()`.execute(db);
}

/** Refuse the next turn once the day is used, and record that it was. */
export async function requireBudget(accountId: string, trx: Executor = db): Promise<void> {
  const hit = await limitReached(accountId, trx);
  if (!hit) return;
  await recordHit(accountId, hit.cap, hit.scope);
  throw new OverBudget(hit.scope, hit.cap);
}
