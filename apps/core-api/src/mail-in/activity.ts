/** 026. The Activity rows a forwarded email writes. Never sent: no words from
 *  an email ever reach a push service. */

import { sql } from "kysely";
import { db } from "../db.js";
import { capital, clamp, count } from "../notifications/copy.js";

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

/** An email that held nothing offload could keep, or that could not be read:
 *  its subject, since it passed the sender check, and what was left out. */
export async function recordNothing(accountId: string, subject: string, leftOut: Partial<Record<string, number>>): Promise<void> {
  const quoted = subject ? `“${clamp(subject)}”.` : "";
  await db
    .insertInto("activity")
    .values({
      account_id: accountId,
      kind: "mail",
      mail_outcome: "nothing",
      sent: false,
      title: "Nothing filed from an email",
      body: [quoted, ...leftOutSentences(leftOut)].filter(Boolean).join(" ") || null,
    })
    .execute();
}

/** Past the hourly or daily cap, or the model budget: one row a day. */
export async function recordOverLimit(accountId: string): Promise<void> {
  const [row] = (
    await sql<{ n: string }>`
      select count(*) as n from activity
      where account_id = ${accountId} and kind = 'mail' and mail_outcome = 'over_limit'
        and occurred_at > now() - interval '1 day'
    `.execute(db)
  ).rows;
  if (Number(row?.n ?? 0) > 0) return;
  await db
    .insertInto("activity")
    .values({
      account_id: accountId,
      kind: "mail",
      mail_outcome: "over_limit",
      sent: false,
      title: "Too many emails today",
      body: "Some weren't added. Forward them again tomorrow.",
    })
    .execute();
}

const KIND_WORDS: Record<string, [string, string]> = {
  pdf: ["A PDF", "PDFs"],
  spreadsheet: ["A spreadsheet", "spreadsheets"],
  document: ["A document", "documents"],
  calendar: ["A calendar invitation", "calendar invitations"],
  archive: ["A zip file", "zip files"],
  other: ["An attachment", "attachments"],
};

/** *A PDF was left out.*, *Two spreadsheets were left out.* */
export function leftOutSentences(leftOut: Partial<Record<string, number>>): string[] {
  const out: string[] = [];
  for (const kind of ["pdf", "spreadsheet", "document", "calendar", "archive", "other"]) {
    const n = leftOut[kind] ?? 0;
    if (n <= 0) continue;
    const [one, many] = KIND_WORDS[kind]!;
    out.push(n === 1 ? `${one} was left out.` : `${capital(count(n))} ${many} were left out.`);
  }
  return out;
}
