/** 026. What happens to an email the mail Worker hands in: the sender check,
 *  the caps, the parse, the image rules, and the dump. The route answers the
 *  Worker from the outcome and nothing else. */

import { createHash } from "node:crypto";
import { sql } from "kysely";
import { db } from "../db.js";
import { emit, subjectOf } from "../analytics.js";
import { OverBudget, limitReached, recordHit, type Hit } from "../budget.js";
import { limitFor } from "../settings.js";
import { takeDump } from "../routes/dumps.js";
import { checkSender, spendSignature, type Resolver, type SenderOutcome } from "./sender.js";
import { recordNothing, recordOverLimit, recordRefused } from "./activity.js";
import { parseMail } from "./parse.js";
import { candidatesOf, sealCandidates } from "./images.js";
import { mailAttrs } from "./attrs.js";
import { clampTo as clamp } from "../notifications/copy.js";

import { DAILY_MAIL, HOURLY_MAIL } from "./caps.js";

export { DAILY_MAIL, HOURLY_MAIL };

export type ReceiveOutcome = SenderOutcome | "over_limit" | "nothing";

/** Refusals that write the account's one row. Not a replay, which is the same
 *  email delivered twice and already handled, and not a key that could not
 *  be fetched, which is retried. */
const TOLD: ReadonlySet<SenderOutcome> = new Set(["unsigned", "unaligned", "length_tag", "unsigned_from", "unsigned_recipient", "stale"]);

/** The cap that refuses this email, if one does: the two mail caps, then
 *  whatever would refuse the turn it becomes. Each is its setting (034). */
async function overCap(accountId: string): Promise<Hit | null> {
  const [counts] = (
    await sql<{ hour: string; day: string }>`
      select count(*) filter (where created_at > now() - interval '1 hour') as hour, count(*) as day
      from messages
      where account_id = ${accountId} and source = 'mail' and created_at > now() - interval '1 day'
    `.execute(db)
  ).rows;
  if (Number(counts?.hour ?? 0) >= (await limitFor(accountId, "cap.mail_hour"))) return { cap: "cap.mail_hour", scope: "account" };
  if (Number(counts?.day ?? 0) >= (await limitFor(accountId, "cap.mail_day"))) return { cap: "cap.mail_day", scope: "account" };
  return limitReached(accountId);
}

async function received(accountId: string | null, outcome: ReceiveOutcome, counts: Record<string, number> = {}) {
  await emit({
    name: "mail_received",
    subjectId: accountId ? await subjectOf(accountId) : null,
    properties: { outcome, ...counts },
  });
}

export async function receiveMail(
  raw: Buffer,
  opts: { resolver?: Resolver | undefined; now?: Date | undefined } = {},
): Promise<ReceiveOutcome> {
  const checked = await checkSender(raw, opts);
  if (checked.outcome !== "accepted" || !checked.accountId || !checked.signature) {
    if (checked.accountId && TOLD.has(checked.outcome)) await recordRefused(checked.accountId);
    await received(checked.accountId, checked.outcome);
    return checked.outcome;
  }
  const accountId = checked.accountId;
  const signature = checked.signature;

  // Dropped, told once a day, and not retried: the signature is spent.
  const overLimit = async (): Promise<ReceiveOutcome> => {
    await recordOverLimit(accountId);
    await spendSignature(signature);
    await received(accountId, "over_limit");
    return "over_limit";
  };

  const hit = await overCap(accountId);
  if (hit) {
    await recordHit(accountId, hit.cap, hit.scope);
    return overLimit();
  }

  const parsed = await parseMail(raw);
  const candidates = "refused" in parsed ? [] : candidatesOf(parsed.images);
  if ("refused" in parsed || (parsed.text.length === 0 && candidates.length === 0)) {
    const subject = "refused" in parsed ? "" : parsed.subject;
    await recordNothing(accountId, subject, "refused" in parsed ? {} : parsed.leftOut);
    await spendSignature(signature);
    await received(accountId, "nothing");
    return "nothing";
  }

  // The client key is the signature's own hash, so the same email delivered
  // twice at once collapses into one message by the dump's own lock.
  const messageKey = createHash("sha256").update(signature).digest("hex").slice(0, 32);
  const sealed = await sealCandidates(accountId, messageKey, candidates);
  const attrs = mailAttrs.parse({
    subject: clamp(parsed.subject, 300),
    fromName: parsed.fromName ? clamp(parsed.fromName, 120) : null,
    fromAddress: clamp(parsed.fromAddress, 320),
    sentAt: parsed.sentAt,
    noteLength: parsed.noteLength,
    historyAt: parsed.historyAt,
    leftOut: parsed.leftOut,
    cc: parsed.cc,
  });
  try {
    await takeDump(accountId, parsed.text, `mail:${messageKey}`, undefined, undefined, null, [], [], { attrs, candidates: sealed });
  } catch (error) {
    // The dump checks the day again as it starts, and a cap reached between
    // the check above and here used to leave this handler answering 500 and
    // the Worker retrying an email that would never be taken. The dump has
    // already recorded the hit.
    if (!(error instanceof OverBudget)) throw error;
    return overLimit();
  }
  await spendSignature(signature);
  await received(accountId, "accepted", { images_candidates: sealed.length });
  return "accepted";
}
