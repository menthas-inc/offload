/** 026. The Activity rows a forwarded email writes. Never sent: no words from
 *  an email ever reach a push service. */

import { sql } from "kysely";
import { db } from "../db.js";

/** Anybody can write a From line, so this row carries fixed words and no id:
 *  nothing a stranger wrote reaches somebody else's record. One an hour and
 *  three a day, so a stranger who knows an address cannot fill it. */
export async function recordRefused(accountId: string): Promise<void> {
  const [counts] = (
    await sql<{ hour: string; day: string }>`
      select count(*) filter (where occurred_at > now() - interval '1 hour') as hour,
             count(*) as day
      from activity
      where account_id = ${accountId} and kind = 'mail' and mail_outcome = 'refused'
        and occurred_at > now() - interval '1 day'
    `.execute(db)
  ).rows;
  if (Number(counts?.hour ?? 0) > 0 || Number(counts?.day ?? 0) >= 3) return;
  await db
    .insertInto("activity")
    .values({
      account_id: accountId,
      kind: "mail",
      mail_outcome: "refused",
      sent: false,
      title: "An email couldn't be added",
      body: "Couldn't confirm it came from you, so it wasn't kept.",
    })
    .execute();
}
