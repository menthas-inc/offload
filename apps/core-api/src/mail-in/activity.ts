/** 026. The Activity rows a forwarded email writes. Never sent: no words from
 *  an email ever reach a push service. */

import { sql } from "kysely";
import type { Executor } from "../threads/access.js";
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
      reason: "design",
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
      reason: "design",
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
      reason: "design",
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


/** The one row a processed email writes, from what its turn left behind:
 *  what landed and where, a question it stopped on, or nothing. Written in
 *  the turn result's own transaction, and rewritten rather than added when a
 *  resumed turn posts again, since one email is one record. */
export async function recordMailTurn(trx: Executor, accountId: string, messageId: string, turnId: string): Promise<void> {
  const message = await trx
    .selectFrom("messages")
    .select(["source", "attrs"])
    .where("id", "=", messageId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (message?.source !== "mail") return;
  const mail = (message.attrs as { mail?: { subject?: string; leftOut?: Record<string, number> } } | null)?.mail ?? {};
  const subject = mail.subject ? `“${clamp(mail.subject)}”.` : "";
  const leftOut = leftOutSentences(mail.leftOut ?? {});

  const content = await trx
    .selectFrom("content")
    .innerJoin("threads", "threads.id", "content.thread_id")
    .select(["content.id", "content.title", "content.thread_id", "threads.name as threadName"])
    .where("content.derived_from_message_id", "=", messageId)
    .where("content.account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    .execute();
  const notes = await trx
    .selectFrom("notes")
    .innerJoin("threads", "threads.id", "notes.subject_id")
    .select(["notes.text as title", "notes.subject_id as thread_id", "threads.name as threadName"])
    .where("notes.derived_from_message_id", "=", messageId)
    .where("notes.account_id", "=", accountId)
    .where("notes.scope", "=", "thread")
    .where("notes.deleted_at", "is", null)
    .execute();
  const landed = [...content.map((c) => ({ ...c })), ...notes.map((n) => ({ id: null as string | null, ...n }))];
  const asked = await trx
    .selectFrom("questions")
    .select("id")
    .where("turn_id", "=", turnId)
    .where("account_id", "=", accountId)
    .where("state", "in", ["pending", "open"])
    .executeTakeFirst();

  let row: { mail_outcome: "filed" | "asked" | "nothing"; title: string; body: string | null; thread_id: string | null; content_id: string | null };
  if (asked) {
    row = { mail_outcome: "asked", title: "A question about an email", body: subject || null, thread_id: null, content_id: null };
  } else if (landed.length === 0) {
    row = { mail_outcome: "nothing", title: "Nothing filed from an email", body: [subject, ...leftOut].filter(Boolean).join(" ") || null, thread_id: null, content_id: null };
  } else {
    const threads = new Set(landed.map((l) => l.thread_id));
    const one = landed.length === 1 ? landed[0]! : null;
    const title = one
      ? `${clamp(one.title ?? "")}, in ${clamp(one.threadName)}`
      : threads.size === 1
        ? `${capital(count(landed.length))} into ${clamp(landed[0]!.threadName)}, from an email`
        : `${capital(count(landed.length))} from an email`;
    const lead = one && subject ? `From an email, ${subject}` : subject;
    row = {
      mail_outcome: "filed",
      title,
      body: [lead, ...leftOut].filter(Boolean).join(" ") || null,
      thread_id: threads.size === 1 ? landed[0]!.thread_id : null,
      content_id: one?.id ?? null,
    };
  }

  const existing = await trx
    .selectFrom("activity")
    .select("id")
    .where("account_id", "=", accountId)
    .where("kind", "=", "mail")
    .where("message_id", "=", messageId)
    .executeTakeFirst();
  if (existing) {
    await trx.updateTable("activity").set({ ...row, turn_id: turnId }).where("id", "=", existing.id).execute();
  } else {
    await trx
      .insertInto("activity")
      .values({ account_id: accountId, kind: "mail", sent: false, reason: "design", turn_id: turnId, message_id: messageId, ...row })
      .execute();
  }
}


/** A filed email's Undo is offered for a day: a filing is noticed the day it
 *  lands, where a label sort nobody asked for may not be, which is why 025's
 *  window is longer. */
export const MAIL_UNDO_HOURS = 24;

export function mailUndoOpen(occurredAt: Date, now = Date.now()): boolean {
  return now - occurredAt.getTime() < MAIL_UNDO_HOURS * 60 * 60 * 1000;
}

/** Undo from a filed email's row: the turn's filing taken back, the email
 *  kept, a row somebody changed since left, calendar events removed first. */
export async function undoMailRow(accountId: string, activityId: string): Promise<"undone" | "not_found" | "not_undoable"> {
  const row = await db
    .selectFrom("activity")
    .select(["id", "turn_id", "message_id", "occurred_at", "undone_at", "mail_outcome"])
    .where("id", "=", activityId)
    .where("account_id", "=", accountId)
    .where("kind", "=", "mail")
    .executeTakeFirst();
  if (!row || row.mail_outcome !== "filed" || !row.turn_id || !row.message_id) return "not_found";
  if (row.undone_at !== null || !mailUndoOpen(row.occurred_at)) return "not_undoable";
  const { undoTurn } = await import("../routes/dumps.js");
  await undoTurn(accountId, row.turn_id, { keepMessageId: row.message_id, since: row.occurred_at });
  // The row it opened goes with the purge, and `content_id` cascades on
  // delete; the record stays, pointing at nothing, as Undone.
  await db.updateTable("activity").set({ undone_at: sql`now()`, content_id: null }).where("id", "=", row.id).execute();
  return "undone";
}
