// The two digests: Due today in the morning, Tomorrow in the evening. 024.
//
// An hourly job places each account's two sends on the jobs table at the
// account's own hours in its own zone. Each digest job resolves its rows
// through the membership predicate for that account at that moment, composes
// the copy, sends to every token the account holds, records what it did or
// did not do, and reads the receipts fifteen minutes later to drop tokens
// the service reports gone. A digest at the wrong hour is worse than none: a
// job more than two hours late is dropped with a log line and no record.
//
// A date is not announced; a reminder is. Only `content` rows with
// `is_reminder` and a date are read: no notes, no calendar's own events,
// nothing at the moment a date passes.

import { addUtcDays, dayIn, instantIn, occurrencesIn, parseRule, whenDayOf, type Rule } from "@offload/widgets";
import { sql } from "kysely";
import { emit } from "../analytics.js";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { record } from "./activity.js";
import { digestCopy, skippedTitle, type DigestRow, type Send } from "./copy.js";
import { GONE, PushFailed, push, type PushMessage } from "./push.js";

export type { Send };

/** Overdue is announced for seven days, then goes quiet. */
export const OVERDUE_DAYS = 7;
/** More than this past its hour, a digest is dropped rather than sent late. */
export const LATE_MS = 2 * 3_600_000;
/** Rule rows are few; past this the cap is the signal to add a column. */
export const RULE_ROWS_CAP = 200;
/** The receipts are read this long after the send. */
export const RECEIPTS_AFTER_SECONDS = 15 * 60;

export const VERBS_CATEGORY = "digest_verbs";
export const PLAIN_CATEGORY = "digest";
export const CHANNELS: Record<Send, string> = { morning: "due_today", evening: "coming_tomorrow" };

export interface Placement {
  accountId: string;
  send: Send;
  /** The local date the send is for. */
  day: string;
  runAfter: Date;
}

interface Clocked {
  id: string;
  zone: string | null;
  morningAt: string;
  eveningAt: string;
}

/** Which sends fall inside the coming hour, for accounts with a clock. Both
 *  switches are placed regardless: the job decides, so a switch turned off
 *  has a record only when there was something to say. Pure, so the hour
 *  arithmetic across a clock change is tested rather than trusted. */
export function placements(accounts: Clocked[], now: Date, horizonMs = 3_600_000): Placement[] {
  const out: Placement[] = [];
  for (const account of accounts) {
    if (!account.zone) continue;
    const today = dayIn(now, account.zone);
    for (const day of [addUtcDays(today, -1), today, addUtcDays(today, 1)]) {
      for (const [send, hour] of [["morning", account.morningAt], ["evening", account.eveningAt]] as const) {
        const at = instantIn(`${day}T${hour.slice(0, 5)}:00`, account.zone);
        if (!at) continue;
        if (at.getTime() >= now.getTime() && at.getTime() < now.getTime() + horizonMs) {
          out.push({ accountId: account.id, send, day, runAfter: at });
        }
      }
    }
  }
  return out;
}

/** The hourly pass: every active account's sends inside the coming hour, as
 *  jobs keyed on the account, the local day and the send, so a second
 *  instance or a restart collapses into the row that exists. */
export async function scheduleDigests(now = new Date()): Promise<number> {
  const accounts = await db
    .selectFrom("accounts")
    .select(["id", "time_zone", "notify_due_today_at", "notify_coming_tomorrow_at"])
    .where("state", "=", "active")
    .where("deleted_at", "is", null)
    .where("time_zone", "is not", null)
    .execute();
  const placed = placements(
    accounts.map((account) => ({
      id: account.id,
      zone: account.time_zone,
      morningAt: String(account.notify_due_today_at),
      eveningAt: String(account.notify_coming_tomorrow_at),
    })),
    now,
  );
  for (const one of placed) {
    await enqueue({
      kind: "account.digest",
      accountId: one.accountId,
      payload: { send: one.send, day: one.day, at: one.runAfter.toISOString() },
      priority: PRIORITY.scheduled,
      runAfter: one.runAfter,
      idempotencyKey: `account.digest:${one.accountId}:${one.day}:${one.send}`,
      maxAttempts: 2,
    });
  }
  return placed.length;
}

export interface Composed {
  zone: string | null;
  today: string;
  rows: DigestRow[];
  overdue: DigestRow[];
  /** The ids landing today, for the evening's identical-set skip. */
  landingToday: string[];
  /** The one task a one-task digest carries verbs for. */
  single: { contentId: string } | null;
}

interface Candidate {
  id: string;
  title: string;
  type: string;
  due_at: Date | null;
  occurs_at: Date | null;
  attrs: unknown;
  rrule: string | null;
  account_id: string | null;
  source_ref: string | null;
  author_name: string | null;
}

function ruleOf(text: string | null): Rule | null {
  if (!text) return null;
  const parsed = parseRule(text);
  return parsed.ok ? parsed.rule : null;
}

/** The day a row lands on, in the account's zone: a bare day by its UTC
 *  date, a timed row by the zone. */
function dayOf(row: Candidate, zone: string | null): string | null {
  return whenDayOf(
    {
      type: row.type,
      dueAt: row.due_at ? row.due_at.toISOString() : null,
      occursAt: row.occurs_at ? row.occurs_at.toISOString() : null,
      allDay: (row.attrs as Record<string, unknown> | null)?.["all_day"] === true,
      doneAt: null,
      rrule: row.rrule,
    },
    zone,
  );
}

function landsOn(row: Candidate, zone: string | null, day: string): boolean {
  const anchor = dayOf(row, zone);
  if (!anchor) return false;
  const rule = ruleOf(row.rrule);
  if (!rule) return anchor === day;
  return anchor <= day && occurrencesIn(rule, anchor, day, day).length > 0;
}

function toDigestRow(row: Candidate, zone: string | null, accountId: string, day: string): DigestRow {
  const rule = ruleOf(row.rrule);
  const at = row.type === "event" ? row.occurs_at : row.due_at;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    at: at ? at.toISOString() : null,
    allDay: (row.attrs as Record<string, unknown> | null)?.["all_day"] === true,
    day,
    author: row.account_id === accountId ? null : (row.author_name ?? ""),
    repeating: rule !== null,
    daily: rule !== null && rule.freq === "DAILY" && rule.interval === 1,
  };
}

/** The reminders the send names, resolved for the account now. */
export async function composeDigest(accountId: string, send: Send, day: string): Promise<Composed> {
  const account = await db.selectFrom("accounts").select("time_zone").where("id", "=", accountId).executeTakeFirst();
  const zone = account?.time_zone ?? null;
  const target = send === "morning" ? day : addUtcDays(day, 1);
  const from = new Date(`${addUtcDays(day, -(OVERDUE_DAYS + 1))}T00:00:00Z`);
  const to = new Date(`${addUtcDays(target, 2)}T00:00:00Z`);

  const candidates: Candidate[] = await db
    .selectFrom("readable_content as content")
    .innerJoin("threads", "threads.id", "content.thread_id")
    .leftJoin("accounts as author", "author.id", "content.account_id")
    .select([
      "content.id",
      "content.title",
      "content.type",
      "content.due_at",
      "content.occurs_at",
      "content.attrs",
      "content.rrule",
      "content.account_id",
      "content.source_ref",
      "author.display_name as author_name",
    ])
    .where("content.viewer_account_id", "=", accountId)
    .where("content.is_reminder", "=", true)
    .where("content.deleted_at", "is", null)
    .where("content.done_at", "is", null)
    .where("content.archived_at", "is", null)
    .where("threads.deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb.and([eb("content.type", "=", "event"), eb("content.occurs_at", ">=", from), eb("content.occurs_at", "<", to)]),
        eb.and([eb("content.type", "<>", "event"), eb("content.due_at", ">=", from), eb("content.due_at", "<", to)]),
        eb("content.rrule", "is not", null),
      ]),
    )
    .limit(RULE_ROWS_CAP + 500)
    .execute();

  const rows = candidates.filter((row) => landsOn(row, zone, target)).map((row) => toDigestRow(row, zone, accountId, target));
  const overdue: DigestRow[] = [];
  if (send === "morning") {
    for (const row of candidates) {
      if (row.rrule) continue;
      const landed = dayOf(row, zone);
      if (!landed || landed >= day) continue;
      if (landed < addUtcDays(day, -OVERDUE_DAYS)) continue;
      overdue.push(toDigestRow(row, zone, accountId, landed));
    }
  }
  const landingToday = candidates.filter((row) => landsOn(row, zone, day)).map((row) => row.id);
  const only = rows.length === 1 && overdue.length === 0 ? rows[0]! : null;
  const single =
    only && only.type === "task" && !only.repeating && !candidates.find((row) => row.id === only.id)?.source_ref ? { contentId: only.id } : null;
  return { zone, today: day, rows, overdue, landingToday, single };
}

export type Outcome = "sent" | "skipped_setting" | "skipped_permission" | "empty" | "same" | "late";

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const held = new Set(a);
  return b.every((id) => held.has(id));
}

/** One digest, decided and done. */
export async function runDigest(accountId: string, send: Send, day: string, runAfter: Date, now = new Date()): Promise<Outcome> {
  if (now.getTime() - runAfter.getTime() > LATE_MS) {
    console.log(JSON.stringify({ level: "warn", msg: "digest dropped, late", send, lateMs: now.getTime() - runAfter.getTime() }));
    return "late";
  }
  const account = await db
    .selectFrom("accounts")
    .select(["notify_due_today", "notify_coming_tomorrow"])
    .where("id", "=", accountId)
    .where("state", "=", "active")
    .executeTakeFirst();
  if (!account) return "empty";

  const composed = await composeDigest(accountId, send, day);
  if (composed.rows.length + composed.overdue.length === 0) return "empty";
  if (send === "evening" && sameSet(composed.rows.map((row) => row.id), composed.landingToday)) return "same";

  const copy = digestCopy(send, composed.rows, composed.overdue, composed.zone, day);
  const counts = { send, rows: composed.rows.length, overdue: composed.overdue.length };
  const on = send === "morning" ? account.notify_due_today : account.notify_coming_tomorrow;
  if (!on) {
    await record(accountId, { kind: "digest", sent: false, reason: "setting", title: skippedTitle(send), body: copy.body, send });
    await emit({ name: "digest_skipped", subjectId: accountId, properties: { ...counts, reason: "setting" } });
    return "skipped_setting";
  }

  const tokens = await db.selectFrom("push_tokens").select(["token", "platform"]).where("account_id", "=", accountId).execute();
  if (tokens.length === 0) {
    await record(accountId, { kind: "digest", sent: false, reason: "permission", title: copy.title, body: copy.body, send });
    await emit({ name: "digest_skipped", subjectId: accountId, properties: { ...counts, reason: "permission" } });
    return "skipped_permission";
  }

  const data = { kind: "digest", send, ...(composed.single ? { contentId: composed.single.contentId } : {}) };
  const messages: PushMessage[] = tokens.map((one) => ({
    to: one.token,
    title: copy.title,
    body: copy.body,
    data,
    categoryId: composed.single ? VERBS_CATEGORY : PLAIN_CATEGORY,
    channelId: CHANNELS[send],
  }));
  let tickets;
  try {
    tickets = await push().send(messages);
  } catch (error) {
    if (error instanceof PushFailed) {
      await emit({ name: "notification_failed", subjectId: accountId, properties: { kind: "digest", status: error.status, code: error.code } });
    }
    throw error;
  }
  const gone = tickets.filter((ticket) => !ticket.ok && ticket.code === GONE).map((ticket) => ticket.token);
  if (gone.length > 0) await db.deleteFrom("push_tokens").where("token", "in", gone).execute();
  const delivered = tickets.flatMap((ticket) => (ticket.ok ? [{ id: ticket.id, token: ticket.token }] : []));
  if (delivered.length > 0) {
    await enqueue({
      kind: "push.receipts",
      accountId,
      payload: { tickets: delivered },
      priority: PRIORITY.background,
      runAfterSeconds: RECEIPTS_AFTER_SECONDS,
      idempotencyKey: `push.receipts:${accountId}:${day}:${send}`,
    });
  }
  await record(accountId, {
    kind: "digest",
    sent: true,
    title: copy.title,
    body: copy.body,
    send,
    contentId: composed.single?.contentId ?? null,
  });
  await emit({ name: "digest_sent", subjectId: accountId, properties: counts });
  return "sent";
}

/** Fifteen minutes on: a token the service reports gone is dropped. */
export async function readReceipts(tickets: { id: string; token: string }[]): Promise<void> {
  if (tickets.length === 0) return;
  const receipts = await push().receipts(tickets.map((ticket) => ticket.id));
  const gone = tickets.filter((ticket) => {
    const receipt = receipts[ticket.id];
    return receipt && !receipt.ok && receipt.code === GONE;
  });
  if (gone.length > 0) {
    await db
      .deleteFrom("push_tokens")
      .where("token", "in", gone.map((ticket) => ticket.token))
      .execute();
  }
}

/** For a test: the jobs queued ahead for an account. */
export async function queuedDigests(accountId: string): Promise<{ send: string; day: string }[]> {
  const rows = await db
    .selectFrom("jobs")
    .select("payload")
    .where("kind", "=", "account.digest")
    .where("account_id", "=", accountId)
    .where("state", "=", "queued")
    .where("run_after", ">", sql<Date>`now()`)
    .execute();
  return rows.map((row) => row.payload as { send: string; day: string });
}
