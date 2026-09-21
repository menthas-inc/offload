// Sharing a thread: the sheet, the share, the invitation, and taking
// somebody out.
//
// **A share is `thread_members` in `pending`, as 001 built it**, and nothing
// else: no key, no content, no name beyond the thread's reaches the other
// person until they accept. What the invitation shows of the thread is
// `preview`, the count and two of the sharer's own titles, taken here and
// read from the row, so a person who has not accepted never reads the thread.
//
// **Taking somebody out is leaving done to them.** Membership, key and
// calendar picks go in one transaction that locks both rows in a fixed order,
// so two members doing it to each other at once cannot both succeed and the
// second finds the first gone. What they left becomes the thread's through
// `unowned`, which already reads accepted membership, so nothing here touches
// a content row.
//
// Every check runs again at the tap: the sheet calls `shareThread` and so
// does the said share's confirm, which is what makes the model's proposal a
// proposal and not an act.

import { sql, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database, SharePreview } from "../schema.js";
import { initialsOf } from "../accounts/initials.js";
import { threadKey } from "../blobs/keys.js";
import { connected, blockedEitherWay, connectionsOf, type Executor } from "../people/access.js";
import { dropPicksOf } from "./calendars.js";
import { NotYours, memberOf, requireMember } from "./access.js";

export const SHARE_DAYS = 30;
/** Waiting shares from one person to another, across threads. */
export const WAITING_PER_PAIR = 3;
export const PREVIEW_TITLES = 2;
const PREVIEW_CHARS = 120;

type Trx = Transaction<Database>;

interface Face {
  accountId: string;
  displayName: string | null;
  initials: string;
}

function faceOf(row: { id: string; display_name: string | null }): Face {
  return { accountId: row.id, displayName: row.display_name, initials: initialsOf(row.display_name ?? "") };
}

async function isDefaultThread(accountId: string, threadId: string, trx: Executor): Promise<boolean> {
  const account = await trx.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  return account?.default_thread_id === threadId;
}

export interface ShareSheet {
  members: (Face & { since: Date; added: { count: number; titles: string[] } })[];
  waiting: (Face & { memberId: string })[];
  connections: Face[];
}

/** What the sheet draws, for a member. Not the default thread, which cannot
 *  be shared and answers as if it were not there. */
export async function shareSheet(accountId: string, threadId: string): Promise<ShareSheet> {
  await requireMember(accountId, threadId);
  if (await isDefaultThread(accountId, threadId, db)) throw new NotYours();

  const rows = await db
    .selectFrom("thread_members")
    .innerJoin("accounts", "accounts.id", "thread_members.account_id")
    .select([
      "thread_members.id as memberId",
      "thread_members.state as state",
      "thread_members.created_at as created_at",
      "thread_members.responded_at as responded_at",
      "accounts.id as id",
      "accounts.display_name as display_name",
    ])
    .where("thread_members.thread_id", "=", threadId)
    .where("thread_members.state", "in", ["accepted", "pending"])
    .where("accounts.deleted_at", "is", null)
    .orderBy("thread_members.created_at")
    .execute();

  // What each other member added, for the Take out sheet: a count and two
  // titles per author. Two queries for the thread, not two per member, and
  // the titles are the two most recent **per author**, so a quiet member's
  // are found however loud the others were.
  const added = await db
    .selectFrom("content")
    .select(["account_id", (eb) => eb.fn.countAll<string>().as("n")])
    .where("thread_id", "=", threadId)
    .where("deleted_at", "is", null)
    .groupBy("account_id")
    .execute();
  const counts = new Map(added.map((row) => [row.account_id, Number(row.n)]));
  const titles = await sql<{ account_id: string; title: string }>`
    select account_id, title
      from (
        select account_id, title,
               row_number() over (partition by account_id order by updated_at desc) as n
          from content
         where thread_id = ${threadId} and deleted_at is null
      ) ranked
     where n <= ${PREVIEW_TITLES}
     order by account_id, n
  `.execute(db);
  const twoOf = (author: string) =>
    titles.rows.filter((row) => row.account_id === author).map((row) => row.title.slice(0, PREVIEW_CHARS));

  const members = rows
    .filter((row) => row.state === "accepted")
    .map((row) => ({
      ...faceOf(row),
      since: row.responded_at ?? row.created_at,
      added: { count: counts.get(row.id) ?? 0, titles: twoOf(row.id) },
    }));
  const waiting = rows.filter((row) => row.state === "pending").map((row) => ({ ...faceOf(row), memberId: row.memberId }));
  const inSheet = new Set(rows.map((row) => row.id));
  const connections = (await connectionsOf(accountId))
    .filter((c) => !inSheet.has(c.accountId))
    .map((c) => ({ accountId: c.accountId, displayName: c.displayName, initials: initialsOf(c.displayName ?? "") }));
  return { members, waiting, connections };
}

export type ShareRefusal = "unknown_thread" | "default_thread" | "not_connected" | "already_in" | "waiting" | "too_many";

/** One share, every check, inside the caller's transaction. The sheet and
 *  the said share's confirm both come here. */
export async function shareThread(
  trx: Trx,
  callerId: string,
  threadId: string,
  targetId: string,
): Promise<{ ok: true; memberId: string } | { ok: false; error: ShareRefusal }> {
  if (!(await memberOf(callerId, threadId, trx))) return { ok: false, error: "unknown_thread" };
  if (await isDefaultThread(callerId, threadId, trx)) return { ok: false, error: "default_thread" };
  if (callerId === targetId || !(await connected(callerId, targetId, trx)) || (await blockedEitherWay(callerId, targetId, trx))) {
    return { ok: false, error: "not_connected" };
  }
  const existing = await trx
    .selectFrom("thread_members")
    .select(["id", "state"])
    .where("thread_id", "=", threadId)
    .where("account_id", "=", targetId)
    .executeTakeFirst();
  if (existing?.state === "accepted") return { ok: false, error: "already_in" };
  if (existing?.state === "pending") return { ok: false, error: "waiting" };
  // Live waiting shares only: unexpired, on a thread that still exists. A
  // row a deleted thread or a sweep has not reached yet is not a strip.
  const waiting = await trx
    .selectFrom("thread_members")
    .innerJoin("threads", "threads.id", "thread_members.thread_id")
    .select(({ fn }) => fn.countAll<string>().as("n"))
    .where("thread_members.invited_by", "=", callerId)
    .where("thread_members.account_id", "=", targetId)
    .where("thread_members.state", "=", "pending")
    .where("thread_members.expires_at", ">", sql<Date>`now()`)
    .where("threads.deleted_at", "is", null)
    .executeTakeFirstOrThrow();
  if (Number(waiting.n) >= WAITING_PER_PAIR) return { ok: false, error: "too_many" };

  // The preview: the thread's count and the caller's own two most recent
  // titles, taken now. Never another member's row.
  const thread = await trx.selectFrom("threads").select("content_count").where("id", "=", threadId).executeTakeFirstOrThrow();
  const mine = await trx
    .selectFrom("content")
    .select("title")
    .where("thread_id", "=", threadId)
    .where("account_id", "=", callerId)
    .where("deleted_at", "is", null)
    .where("archived_at", "is", null)
    .orderBy("updated_at", "desc")
    .limit(PREVIEW_TITLES)
    .execute();
  const preview = { count: thread.content_count, titles: mine.map((row) => row.title.slice(0, PREVIEW_CHARS)) };

  const values = {
    thread_id: threadId,
    account_id: targetId,
    invited_by: callerId,
    state: "pending" as const,
    created_at: new Date(),
    responded_at: null,
    expires_at: new Date(Date.now() + SHARE_DAYS * 86_400_000),
    preview: sql<SharePreview>`${JSON.stringify(preview)}::jsonb`,
    removed_by_account_id: null,
    removed_at: null,
  };
  const row = await writePending(trx, values);
  if (row) return { ok: true, memberId: row.id };
  const now = await trx
    .selectFrom("thread_members")
    .select("state")
    .where("thread_id", "=", threadId)
    .where("account_id", "=", targetId)
    .executeTakeFirstOrThrow();
  return { ok: false, error: now.state === "accepted" ? "already_in" : "waiting" };
}

/** The pending row, written or reused. A row that ended, expired, declined
 *  or removed, is reused: the unique index is on the pair and the person can
 *  be shared with again. **Only such a row**: the state was read a moment
 *  ago, and a share or an accept that committed in between must not be
 *  written back to pending by an unconditional update. The guard is on the
 *  update itself; undefined means the row is live and the caller reads it
 *  again to say which it became. Exported for the test of that guard. */
export async function writePending(
  trx: Trx,
  values: {
    thread_id: string;
    account_id: string;
    invited_by: string;
    state: "pending";
    created_at: Date;
    responded_at: null;
    expires_at: Date;
    preview: ReturnType<typeof sql<SharePreview>>;
    removed_by_account_id: null;
    removed_at: null;
  },
): Promise<{ id: string } | undefined> {
  return trx
    .insertInto("thread_members")
    .values(values)
    .onConflict((oc) =>
      oc
        .columns(["thread_id", "account_id"])
        .doUpdateSet(values)
        .where("thread_members.state", "in", ["expired", "declined", "removed"]),
    )
    .returning("id")
    .executeTakeFirst();
}

/** The x on a lifted row: withdraw a waiting share, or take a member out. */
export async function takeOut(
  callerId: string,
  threadId: string,
  targetId: string,
): Promise<{ withdrew: boolean; removed: boolean; died: boolean }> {
  return db.transaction().execute(async (trx) => {
    if (callerId === targetId) throw new NotYours();
    // Both rows, locked in one order whoever calls, so two members taking
    // each other out serialise and the second sees the first's work.
    const rows = await trx
      .selectFrom("thread_members")
      .innerJoin("threads", "threads.id", "thread_members.thread_id")
      .select(["thread_members.id as id", "thread_members.account_id as account_id", "thread_members.state as state"])
      .where("thread_members.thread_id", "=", threadId)
      .where("thread_members.account_id", "in", [callerId, targetId])
      .where("threads.deleted_at", "is", null)
      .orderBy("thread_members.account_id")
      .forUpdate()
      .execute();
    const caller = rows.find((row) => row.account_id === callerId);
    const target = rows.find((row) => row.account_id === targetId);
    if (caller?.state !== "accepted" || !target) throw new NotYours();

    if (target.state === "pending") {
      await trx
        .updateTable("thread_members")
        .set({ state: "expired", responded_at: sql`now()`, preview: null })
        .where("id", "=", target.id)
        .execute();
      return { withdrew: true, removed: false, died: false };
    }
    if (target.state !== "accepted") throw new NotYours();

    await trx
      .updateTable("thread_members")
      .set({ state: "removed", removed_by_account_id: callerId, removed_at: sql`now()`, responded_at: sql`now()` })
      .where("id", "=", target.id)
      .execute();
    await trx.deleteFrom("thread_keys").where("thread_id", "=", threadId).where("account_id", "=", targetId).execute();
    await dropPicksOf(targetId, threadId, trx);
    // Their own waiting shares on this thread were theirs to make.
    await trx
      .updateTable("thread_members")
      .set({ state: "expired", responded_at: sql`now()`, preview: null })
      .where("thread_id", "=", threadId)
      .where("state", "=", "pending")
      .where("invited_by", "=", targetId)
      .execute();

    // Defensive: nobody takes themselves out, so a thread reaches zero only
    // if the lock above let it, which it does not. Kept because a thread
    // with nobody in and content nobody can read is the one state the
    // product must never hold.
    const remaining = await trx
      .selectFrom("thread_members")
      .select(({ fn }) => fn.countAll<string>().as("n"))
      .where("thread_id", "=", threadId)
      .where("state", "=", "accepted")
      .executeTakeFirstOrThrow();
    let died = false;
    if (Number(remaining.n) === 0) {
      await trx
        .updateTable("threads")
        .set({ deleted_at: sql`now()`, purge_after: sql`now() + interval '8 seconds'`, updated_at: sql`now()` })
        .where("id", "=", threadId)
        .where("deleted_at", "is", null)
        .execute();
      died = true;
    }
    return { withdrew: false, removed: true, died };
  });
}

export interface Invitation {
  memberId: string;
  threadId: string;
  threadName: string;
  from: Face;
  preview: { count: number; titles: string[] };
  members: string[];
}

/** The strips: waiting shares whose thread is live, whose sharer is still in
 *  it, and whose sharer and invitee are still connected. Nothing here reads
 *  `content`. */
export async function invitationsFor(accountId: string, trx: Executor = db): Promise<Invitation[]> {
  const rows = await trx
    .selectFrom("thread_members as tm")
    .innerJoin("threads", "threads.id", "tm.thread_id")
    .innerJoin("accounts", "accounts.id", "tm.invited_by")
    .innerJoin("thread_members as sharer", (join) =>
      join.onRef("sharer.thread_id", "=", "tm.thread_id").onRef("sharer.account_id", "=", "tm.invited_by").on("sharer.state", "=", "accepted"),
    )
    .innerJoin("connections", (join) =>
      join.on((eb) =>
        eb.or([
          eb.and([eb("connections.account_a", "=", accountId), eb("connections.account_b", "=", eb.ref("tm.invited_by"))]),
          eb.and([eb("connections.account_b", "=", accountId), eb("connections.account_a", "=", eb.ref("tm.invited_by"))]),
        ]),
      ),
    )
    .select([
      "tm.id as memberId",
      "tm.thread_id as threadId",
      "tm.preview as preview",
      "threads.name as threadName",
      "accounts.id as id",
      "accounts.display_name as display_name",
    ])
    .where("tm.account_id", "=", accountId)
    .where("tm.state", "=", "pending")
    .where("tm.expires_at", ">", sql<Date>`now()`)
    .where("threads.deleted_at", "is", null)
    .where("accounts.deleted_at", "is", null)
    .orderBy("tm.created_at", "desc")
    .execute();
  const out: Invitation[] = [];
  for (const row of rows) {
    const members = await trx
      .selectFrom("thread_members")
      .innerJoin("accounts", "accounts.id", "thread_members.account_id")
      .select("accounts.display_name")
      .where("thread_members.thread_id", "=", row.threadId)
      .where("thread_members.state", "=", "accepted")
      .orderBy("thread_members.created_at")
      .execute();
    out.push({
      memberId: row.memberId,
      threadId: row.threadId,
      threadName: row.threadName,
      from: faceOf(row),
      preview: row.preview ?? { count: 0, titles: [] },
      members: members.map((m) => m.display_name ?? "Someone"),
    });
  }
  return out;
}

/** Add it to my threads. Every fact checked again at the tap, in one
 *  transaction, and the key wrapped through `threadKey`, which already
 *  wraps for an accepted member without one. */
export async function acceptInvitation(accountId: string, memberId: string): Promise<{ threadId: string } | null> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("thread_members")
      .innerJoin("threads", "threads.id", "thread_members.thread_id")
      .select(["thread_members.id as id", "thread_members.thread_id as threadId", "thread_members.invited_by as invitedBy"])
      .where("thread_members.id", "=", memberId)
      .where("thread_members.account_id", "=", accountId)
      .where("thread_members.state", "=", "pending")
      .where("thread_members.expires_at", ">", sql<Date>`now()`)
      .where("threads.deleted_at", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!row || !row.invitedBy) return null;
    if (!(await memberOf(row.invitedBy, row.threadId, trx))) return null;
    if (!(await connected(accountId, row.invitedBy, trx))) return null;
    await trx
      .updateTable("thread_members")
      .set({ state: "accepted", responded_at: sql`now()`, preview: null })
      .where("id", "=", row.id)
      .execute();
    await threadKey(trx, row.threadId);
    return { threadId: row.threadId };
  });
}
