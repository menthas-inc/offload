/** 026. What happens to an email the mail Worker hands in: the sender check,
 *  then everything an accepted email becomes. The route answers the Worker
 *  from the outcome and nothing else. */

import { checkSender, type Resolver, type SenderOutcome } from "./sender.js";

export type ReceiveOutcome = SenderOutcome;

export async function receiveMail(raw: Buffer, opts: { resolver?: Resolver; now?: Date } = {}): Promise<ReceiveOutcome> {
  const checked = await checkSender(raw, opts);
  return checked.outcome;
}
