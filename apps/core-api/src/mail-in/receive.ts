/** 026. What happens to an email the mail Worker hands in: the sender check,
 *  then everything an accepted email becomes. The route answers the Worker
 *  from the outcome and nothing else. */

import { checkSender, type Resolver, type SenderOutcome } from "./sender.js";
import { recordRefused } from "./activity.js";

/** Refusals that write the account's one row. Not a replay, which is the same
 *  email delivered twice and already filed, and not a key that could not be
 *  fetched, which is retried. */
const TOLD: ReadonlySet<SenderOutcome> = new Set(["unsigned", "unaligned", "length_tag", "unsigned_from", "unsigned_recipient", "stale"]);

export type ReceiveOutcome = SenderOutcome;

export async function receiveMail(raw: Buffer, opts: { resolver?: Resolver; now?: Date } = {}): Promise<ReceiveOutcome> {
  const checked = await checkSender(raw, opts);
  if (checked.outcome !== "accepted") {
    if (checked.accountId && TOLD.has(checked.outcome)) await recordRefused(checked.accountId);
    return checked.outcome;
  }
  return checked.outcome;
}
