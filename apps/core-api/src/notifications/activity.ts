// Activity: everything offload told somebody, in order, and what it decided
// quietly and never told them about. 024.
//
// A row is written at the moment the thing happens, by the code that decides
// it, with the words it used or would have used, never reconstructed later
// from rows that may have changed. A sent row and an unsent row are the same
// row with a different lead. Thirty days, then it purges; a row that names
// another member's words goes sooner, when the viewer's membership ends,
// when the row it names is destroyed, and when that member deletes their
// account, which the foreign keys and the callers of `purgeAbout` carry.
//
// Readable by its own account only, and nothing the worker may read.

import { sql, type Kysely, type Transaction } from "kysely";
import { db } from "../db.js";
import type { ActivityTable, Database } from "../schema.js";
import { clamp } from "./copy.js";
import { mailUndoOpen } from "../mail-in/activity.js";

type Executor = Kysely<Database> | Transaction<Database>;

export const ACTIVITY_DAYS = 30;
export const ACTIVITY_PAGE = 50;
/** A request's record lives as long as its source row: 022 keeps who asked
 *  whom for seven days and no longer, and this table must not outlive it. */
export const REQUEST_RECORD_DAYS = 7;

/** What a writer hands in: the words, the kind, and whichever ids the kind
 *  carries. `sent` false needs a reason. */
export interface ActivityRow {
  kind: ActivityTable["kind"];
  sent: boolean;
  reason?: ActivityTable["reason"] | undefined;
  title: string;
  body: string | null;
  send?: ActivityTable["send"];
  threadId?: string | null;
  contentId?: string | null;
  aboutAccountId?: string | null;
  memberId?: string | null;
  requestId?: string | null;
  /** Whose words the row carries and from which thread, beyond the one pair
   *  the columns hold: a digest names rows across threads and members. */
  mentions?: { threadId: string; aboutAccountId: string }[];
}

/** Write one row, inside the caller's transaction where there is one. The
 *  title and body are clamped to what the columns hold, so a writer that
 *  hands in a whole paragraph stores a bounded one rather than failing. */
export async function record(accountId: string, row: ActivityRow, trx: Executor = db): Promise<string> {
  const inserted = await trx
    .insertInto("activity")
    .values({
      account_id: accountId,
      kind: row.kind,
      sent: row.sent,
      reason: row.sent ? null : (row.reason ?? "design"),
      title: clamp(row.title).slice(0, 200),
      body: row.body === null ? null : clamp(row.body).slice(0, 600),
      send: row.send ?? null,
      thread_id: row.threadId ?? null,
      content_id: row.contentId ?? null,
      about_account_id: row.aboutAccountId ?? null,
      member_id: row.memberId ?? null,
      request_id: row.requestId ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const pairs = new Map((row.mentions ?? []).map((one) => [`${one.threadId}:${one.aboutAccountId}`, one]));
  if (pairs.size > 0) {
    await trx
      .insertInto("activity_mentions")
      .values([...pairs.values()].map((one) => ({ activity_id: inserted.id, thread_id: one.threadId, about_account_id: one.aboutAccountId })))
      .execute();
  }
  return inserted.id;
}

export interface ActivityEntry {
  id: string;
  kind: ActivityTable["kind"];
  sent: boolean;
  reason: ActivityTable["reason"];
  title: string;
  body: string | null;
  send: ActivityTable["send"];
  threadId: string | null;
  contentId: string | null;
  memberId: string | null;
  requestId: string | null;
  /** 025. Offered on a labelled row whose sort can still be taken back.
   *  026: and on a filed email's row for a day. */
  undoable: boolean;
  undone: boolean;
  occurredAt: string;
  mailOutcome: ActivityTable["mail_outcome"];
  messageId: string | null;
}

/** A page, newest first by when it happened, the cursor the last row's id.
 *  The comparison is done in Postgres against that row's own `occurred_at`,
 *  as a row value, so nothing loses the microseconds on the way through a
 *  Date and a row written in the same millisecond is never skipped. */
export async function listActivity(accountId: string, cursor: string | null): Promise<{ rows: ActivityEntry[]; next: string | null }> {
  let query = db
    .selectFrom("activity")
    .selectAll()
    .where("account_id", "=", accountId)
    .orderBy("occurred_at", "desc")
    .orderBy("id", "desc")
    .limit(ACTIVITY_PAGE + 1);
  if (cursor && /^[0-9a-f-]{36}$/.test(cursor)) {
    query = query.where(
      sql<boolean>`(activity.occurred_at, activity.id) < (select a.occurred_at, a.id from activity a where a.id = ${cursor} and a.account_id = ${accountId})`,
    );
  }
  const rows = await query.execute();
  const page = rows.slice(0, ACTIVITY_PAGE);
  const last = page[page.length - 1];
  return {
    rows: page.map((row) => ({
      id: row.id,
      kind: row.kind,
      sent: row.sent,
      reason: row.reason,
      title: row.title,
      body: row.body,
      send: row.send,
      threadId: row.thread_id,
      contentId: row.content_id,
      memberId: row.member_id,
      requestId: row.request_id,
      undoable:
        row.undone_at === null &&
        ((row.kind === "labelled" && row.label_run_id !== null) ||
          (row.kind === "mail" && row.mail_outcome === "filed" && mailUndoOpen(row.occurred_at))),
      undone: row.undone_at !== null,
      occurredAt: row.occurred_at.toISOString(),
      mailOutcome: row.mail_outcome,
      messageId: row.message_id,
    })),
    next: rows.length > ACTIVITY_PAGE && last ? last.id : null,
  };
}

/** Opening Activity: everything up to now has been seen. */
export async function markSeen(accountId: string): Promise<void> {
  await db.updateTable("accounts").set({ activity_seen_at: sql`now()` }).where("id", "=", accountId).execute();
}

/** The dot: a row newer than the last opening, of any kind but a connection
 *  request, which keeps 022's gear dot and dots nothing else. */
export async function activityNew(accountId: string): Promise<boolean> {
  const row = await db
    .selectFrom("activity")
    .innerJoin("accounts", "accounts.id", "activity.account_id")
    .select("activity.id")
    .where("activity.account_id", "=", accountId)
    .where("activity.kind", "<>", "request")
    .where((eb) => eb.or([eb("accounts.activity_seen_at", "is", null), eb("activity.occurred_at", ">", eb.ref("accounts.activity_seen_at"))]))
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}

/** The daily purge: thirty days, then gone; a request's rows at seven, with
 *  the request row they were derived from. */
export async function purgeActivity(): Promise<number> {
  const result = await db
    .deleteFrom("activity")
    .where((eb) =>
      eb.or([
        eb("occurred_at", "<", sql<Date>`now() - make_interval(days => ${ACTIVITY_DAYS})`),
        eb.and([
          eb("kind", "in", ["request", "expired"]),
          eb("occurred_at", "<", sql<Date>`now() - make_interval(days => ${REQUEST_RECORD_DAYS})`),
        ]),
      ]),
    )
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** The earlier purges: when a viewer's membership of a thread ends, every row
 *  of theirs that names that thread's words goes, whether the thread is the
 *  row's own column or one of its mentions; when a member's words are no
 *  longer theirs to have named, every row about them goes the same way. */
export async function purgeAbout(
  options: { viewerId: string; threadId: string } | { aboutAccountId: string; threadId?: string },
  trx: Executor = db,
): Promise<void> {
  if ("viewerId" in options) {
    const { viewerId, threadId } = options;
    await trx
      .deleteFrom("activity")
      .where("account_id", "=", viewerId)
      .where((eb) =>
        eb.or([
          eb("thread_id", "=", threadId),
          eb.exists(
            eb.selectFrom("activity_mentions").select("activity_mentions.activity_id").whereRef("activity_mentions.activity_id", "=", "activity.id").where("activity_mentions.thread_id", "=", threadId),
          ),
        ]),
      )
      .execute();
    return;
  }
  const { aboutAccountId, threadId } = options;
  await trx
    .deleteFrom("activity")
    .where((eb) =>
      eb.or([
        threadId
          ? eb.and([eb("about_account_id", "=", aboutAccountId), eb("thread_id", "=", threadId)])
          : eb("about_account_id", "=", aboutAccountId),
        eb.exists(
          (() => {
            let mention = eb
              .selectFrom("activity_mentions")
              .select("activity_mentions.activity_id")
              .whereRef("activity_mentions.activity_id", "=", "activity.id")
              .where("activity_mentions.about_account_id", "=", aboutAccountId);
            if (threadId) mention = mention.where("activity_mentions.thread_id", "=", threadId);
            return mention;
          })(),
        ),
      ]),
    )
    .execute();
}
