// Who may do what, in one place.
//
// Every read and every write in the thread feature goes through these. Written
// once rather than repeated per endpoint, because the failure mode of a
// repeated authorization check is that one copy is subtly different and nobody
// can tell which one is right (QUAL-2).
//
// Two predicates, and the difference between them is the whole permission
// model:
//
//   memberOf   you are in the thread, so you can add to it and help with what
//              is in it. Everything co-owned resolves through here.
//   authorOf   you put this row there. Only you may delete it or move it
//              somewhere else, because both of those change who can see it.
//              One exception: once the author is gone from the thread, every
//              member may. See `unowned`.
//
// OFF-3 states the first half of that in the constitution and the product says
// it identically everywhere: they can add to it, and they can never delete what
// is yours. Move joins delete because moving content out of a thread its author
// is in, into one they are not, is a delete performed by somebody else.

import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";

export type Executor = Kysely<Database> | Transaction<Database>;

/** Accepted membership, per call, never cached.
 *
 *  `accepted` specifically. A pending invitation is not a thread you can write
 *  into, and a declined one is not a thread at all as far as you are concerned.
 */
export async function memberOf(
  accountId: string,
  threadId: string,
  trx: Executor = db,
): Promise<boolean> {
  const row = await trx
    .selectFrom("thread_members")
    .innerJoin("threads", "threads.id", "thread_members.thread_id")
    .select("thread_members.id")
    .where("thread_members.thread_id", "=", threadId)
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted")
    .where("threads.deleted_at", "is", null)
    .executeTakeFirst();
  return row !== undefined;
}

export interface ContentRef {
  id: string;
  threadId: string;
  /** Null once the author deleted their account. Their content stays in the
   *  threads they shared, per OFF-3, and the name comes off it. */
  authorId: string | null;
  /** Whether the author is still an accepted member of this thread.
   *
   *  False when they deleted their account or left. Either way nobody is left
   *  to protect, which is what `unowned` below turns into a permission. */
  authorIsMember: boolean;
}

/** Nobody current owns this, so everybody in the thread does.
 *
 *  **The exception to OFF-3, and the reason it is one.** The principle gives
 *  delete to the author so a shared thread cannot become a place where somebody
 *  else destroys what you put in. Once the author is gone there is no
 *  contribution left to protect and the rule protects nothing; what it produces
 *  instead is a thread carrying somebody's leftovers that no remaining member
 *  can clear. Archive was the answer while the author was still there to ask.
 *
 *  **Reachable by taking somebody out, since 022, and on purpose.** Any member
 *  may remove any other, and what the removed person left becomes the thread's
 *  exactly as when they leave. The privacy page says so, and OFF-3's 2026-09-22
 *  amendment records why the alternatives were worse: a member who cannot be
 *  removed is a role, and a contribution nobody can tidy is the leftover this
 *  predicate exists to prevent. What bounds it is that everybody in a thread
 *  was brought in by a member, and that taking somebody out is confirmed on a
 *  sheet listing what stays. */
export function unowned(ref: ContentRef): boolean {
  return ref.authorId === null || !ref.authorIsMember;
}

/** The row, if this account can see it at all.
 *
 *  Resolved through membership rather than through `content.account_id`, which
 *  is the mistake 001 names explicitly: filtering reads by author would hide
 *  content other members wrote in a shared thread, and the instinct on
 *  discovering that is to loosen the filter rather than narrow it.
 */
export async function readableContent(
  accountId: string,
  contentId: string,
  trx: Executor = db,
  /** Include a row inside its eight second delete window.
   *
   *  Off by default, because a deleted row must not be editable, archivable or
   *  readable on the page. On for exactly one caller: restore, which is the
   *  Undo for delete and therefore has to find the thing it is undoing.
   *
   *  Found by a test. Without it `deleteContent` twice raised instead of
   *  returning false, and restoring a deleted row was impossible, which meant
   *  the Undo the whole delete story rests on did not work at all. */
  includeDeleted = false,
): Promise<ContentRef | null> {
  let query = trx
    // `readable_content` from 0026, aliased to `content` so the membership
    // join disappears and nothing else moves. The rule is the view's now; what
    // is left here is which row and which lifecycle, which are this caller's
    // business and were never the predicate.
    .selectFrom("readable_content as content")
    .select((eb) => [
      "content.id as id",
      "content.thread_id as threadId",
      "content.account_id as authorId",
      // Resolved in the same statement, so a permission decision never costs a
      // second round trip and can never read a membership from a moment other
      // than this one.
      eb
        .exists(
          eb
            .selectFrom("thread_members as author_member")
            .select("author_member.id")
            .whereRef("author_member.thread_id", "=", "content.thread_id")
            .whereRef("author_member.account_id", "=", "content.account_id")
            .where("author_member.state", "=", "accepted"),
        )
        .as("authorIsMember"),
    ])
    .where("content.id", "=", contentId)
    .where("content.viewer_account_id", "=", accountId);

  if (!includeDeleted) query = query.where("content.deleted_at", "is", null);

  const row = await query.executeTakeFirst();
  if (!row) return null;
  // Kysely types `exists` as SqlBool, which is `boolean | number` because some
  // dialects answer 0 and 1. Postgres answers a real boolean; normalised here
  // so nothing downstream has to know that.
  return { ...row, authorIsMember: Boolean(row.authorIsMember) };
}

/** One refusal, whatever the reason.
 *
 *  A thread that does not exist, a thread you are not in, and a row you did not
 *  author are one answer. Distinguishing them turns every endpoint here into an
 *  oracle: ask about an id, learn whether it exists and whether somebody else
 *  can see it. 004's tool endpoint made the same choice for the same reason.
 */
export class NotYours extends Error {
  constructor() {
    super("not_found");
  }
}

/** Read access to a thread, or a refusal. */
export async function requireMember(
  accountId: string,
  threadId: string,
  trx: Executor = db,
): Promise<void> {
  if (!(await memberOf(accountId, threadId, trx))) throw new NotYours();
}

/** Access to a row for anything co-owned: edit, archive, restore. */
export async function requireReadable(
  accountId: string,
  contentId: string,
  trx: Executor = db,
  includeDeleted = false,
): Promise<ContentRef> {
  const row = await readableContent(accountId, contentId, trx, includeDeleted);
  if (!row) throw new NotYours();
  return row;
}

/** Access to a row for the two actions that change who can see it.
 *
 *  Membership first, then authorship, so somebody outside the thread entirely
 *  and somebody inside it who did not write the row get the same answer. */
export async function requireAuthor(
  accountId: string,
  contentId: string,
  trx: Executor = db,
  includeDeleted = false,
): Promise<ContentRef> {
  const row = await requireReadable(accountId, contentId, trx, includeDeleted);
  if (row.authorId !== accountId && !unowned(row)) throw new NotYours();
  return row;
}

/** Bump a thread's activity clock. Its own function because three writes want
 *  it and a missed one makes My threads order by a lie. */
export async function touchThread(threadId: string, trx: Executor): Promise<void> {
  await trx
    .updateTable("threads")
    .set({ last_activity_at: sql`now()`, updated_at: sql`now()` })
    .where("id", "=", threadId)
    .execute();
}
