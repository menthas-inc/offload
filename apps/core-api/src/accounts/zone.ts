// The account's clock. 023.
//
// One zone per account, set once from the first device that names one and
// changed only by the person, in Settings or on the strip. Every writer goes
// through `resolveTimeZone`, as 0051's header does, and stores the name ICU
// returned: the value reaches a prompt and an `at time zone` bind, so it is
// checked at every door and never stored as sent.

import type { Kysely, Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { resolveTimeZone } from "../time-zone.js";

type Executor = Kysely<Database> | Transaction<Database>;

/** Give an account its clock, if it has none yet. First run and the first
 *  dump both call this; a later zone never overwrites, because a person who
 *  travelled has not changed their mind, and the strip is where that is
 *  asked. An unknown name is dropped, not refused: nothing that carries a
 *  zone should fail because of it. */
export async function adoptZone(accountId: string, raw: string | null | undefined, trx: Executor = db): Promise<void> {
  if (!raw) return;
  const zone = resolveTimeZone(raw);
  if (!zone) return;
  await trx
    .updateTable("accounts")
    .set({ time_zone: zone, updated_at: new Date() })
    .where("id", "=", accountId)
    .where("time_zone", "is", null)
    .execute();
}

/** The clock, or null while the account has none, in which case everything
 *  reads as it did before 023: a wall time is UTC and a day is a day. */
export async function zoneOf(accountId: string, trx: Executor = db): Promise<string | null> {
  const row = await trx.selectFrom("accounts").select("time_zone").where("id", "=", accountId).executeTakeFirst();
  return row?.time_zone ?? null;
}
