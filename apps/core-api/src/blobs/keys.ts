// The object layer of the key hierarchy: root -> account -> thread -> object.
//
// `crypto/keys.ts` implements the first two links. This module adds the
// third and uses it: one object key per photo, sealed over the bytes, and
// wrapped once per place entitled to open it. The account wrap is what makes
// the dump readable in its conversation; a thread wrap exists only where a
// row carries the picture, and is created by the filing that put it there.
//
// **Authorization is not decided here.** Every function takes a blob the
// caller has already established the requester may read, and answers the
// narrower question of which key opens it. The Core API holds the root, so
// it can always walk down to an object key from any surviving wrap; what the
// wraps encode is which places still have one, which is what account
// deletion and leaving a thread destroy.

import type { Transaction } from "kysely";
import { generateKey, unwrap, wrap } from "../crypto/keys.js";
import type { Database } from "../schema.js";

type Trx = Transaction<Database>;

export class NoKey extends Error {
  constructor(what: string) {
    super(`No key: ${what}`);
  }
}

/** An account's data key, unwrapped from the root. */
export async function accountKey(trx: Trx, accountId: string): Promise<Buffer> {
  const row = await trx
    .selectFrom("account_keys")
    .select("wrapped_dek")
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!row) throw new NoKey(`account ${accountId}`);
  return unwrap(Buffer.from(row.wrapped_dek));
}

/** A thread's key, through any accepted member's wrapped copy.
 *
 *  Promotion wrote a key for the default thread and nothing has written one
 *  for any thread since, because nothing needed one until a photo landed.
 *  So a thread with no key at all gets one here, wrapped for every accepted
 *  member, which today is one person. Accepting an invitation writes no copy
 *  either, so a member who joined after the key existed holds none; every
 *  read here wraps the key for any accepted member still without one, off
 *  a copy that exists, so the key outlives the members who first held it.
 *  A thread whose every holder has gone is refused rather than papered over:
 *  minting a second thread key would make two threads out of one. */
export async function threadKey(trx: Trx, threadId: string): Promise<Buffer> {
  const held = await trx
    .selectFrom("thread_keys")
    .innerJoin("thread_members", (join) =>
      join
        .onRef("thread_members.thread_id", "=", "thread_keys.thread_id")
        .onRef("thread_members.account_id", "=", "thread_keys.account_id"),
    )
    .select(["thread_keys.account_id as account_id", "thread_keys.wrapped_tk as wrapped_tk"])
    .where("thread_keys.thread_id", "=", threadId)
    .where("thread_members.state", "=", "accepted")
    .executeTakeFirst();

  if (held) {
    const holder = await accountKey(trx, held.account_id);
    const key = unwrap(Buffer.from(held.wrapped_tk), holder);
    await wrapForMembersWithout(trx, threadId, key);
    return key;
  }

  const anyRow = await trx
    .selectFrom("thread_keys")
    .select("thread_id")
    .where("thread_id", "=", threadId)
    .executeTakeFirst();
  if (anyRow) throw new NoKey(`thread ${threadId} has keys but no accepted holder`);

  const members = await trx
    .selectFrom("thread_members")
    .select("account_id")
    .where("thread_id", "=", threadId)
    .where("state", "=", "accepted")
    .execute();
  if (members.length === 0) throw new NoKey(`thread ${threadId} has no members`);

  const key = generateKey();
  for (const member of members) {
    const holder = await accountKey(trx, member.account_id);
    await trx
      .insertInto("thread_keys")
      .values({ thread_id: threadId, account_id: member.account_id, wrapped_tk: wrap(key, holder) })
      .onConflict((oc) => oc.columns(["thread_id", "account_id"]).doNothing())
      .execute();
  }
  return key;
}

/** A wrapped copy for every accepted member who holds none. Exported for the
 *  day sharing's accept path exists: it should call this rather than wait
 *  for the next filing into the thread to do it. */
export async function wrapForMembersWithout(trx: Trx, threadId: string, key: Buffer): Promise<void> {
  const without = await trx
    .selectFrom("thread_members")
    .select("thread_members.account_id")
    .where("thread_members.thread_id", "=", threadId)
    .where("thread_members.state", "=", "accepted")
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("thread_keys")
            .select("thread_keys.thread_id")
            .whereRef("thread_keys.thread_id", "=", "thread_members.thread_id")
            .whereRef("thread_keys.account_id", "=", "thread_members.account_id"),
        ),
      ),
    )
    .execute();
  for (const member of without) {
    const holder = await accountKey(trx, member.account_id);
    await trx
      .insertInto("thread_keys")
      .values({ thread_id: threadId, account_id: member.account_id, wrapped_tk: wrap(key, holder) })
      .onConflict((oc) => oc.columns(["thread_id", "account_id"]).doNothing())
      .execute();
  }
}

/** The blob's object key, from whichever wrap survives.
 *
 *  The account wrap first, because it is the cheap one and it exists for as
 *  long as the dumper does. Then any thread wrap, through that thread's key.
 *  A blob with no wrap at all is a blob nothing can open, which the purge
 *  should already have taken. */
export async function objectKeyOf(trx: Trx, blobId: string): Promise<Buffer> {
  const wraps = await trx
    .selectFrom("blob_keys")
    .select(["scope", "scope_id", "wrapped_object_key"])
    .where("blob_id", "=", blobId)
    .execute();

  const byAccount = wraps.find((w) => w.scope === "account");
  if (byAccount) {
    try {
      return unwrap(Buffer.from(byAccount.wrapped_object_key), await accountKey(trx, byAccount.scope_id));
    } catch (error) {
      // The account is gone and its key with it. Fall through to the threads.
      if (!(error instanceof NoKey)) throw error;
    }
  }

  for (const w of wraps) {
    if (w.scope !== "thread") continue;
    try {
      return unwrap(Buffer.from(w.wrapped_object_key), await threadKey(trx, w.scope_id));
    } catch (error) {
      if (!(error instanceof NoKey)) throw error;
    }
  }

  throw new NoKey(`blob ${blobId} has no surviving wrap`);
}

/** Mint an object key and its account wrap for a new blob. Returns the key
 *  so the caller can seal the bytes without a round trip. */
export async function mintObjectKey(trx: Trx, blobId: string, accountId: string): Promise<Buffer> {
  const key = generateKey();
  await trx
    .insertInto("blob_keys")
    .values({
      blob_id: blobId,
      scope: "account",
      scope_id: accountId,
      wrapped_object_key: wrap(key, await accountKey(trx, accountId)),
    })
    .execute();
  return key;
}

/** A thread wrap where one is missing. Called by the filing that links a row
 *  in that thread to the blob, and by a move on its destination. */
export async function ensureThreadWrap(trx: Trx, blobId: string, threadId: string): Promise<void> {
  const existing = await trx
    .selectFrom("blob_keys")
    .select("blob_id")
    .where("blob_id", "=", blobId)
    .where("scope", "=", "thread")
    .where("scope_id", "=", threadId)
    .executeTakeFirst();
  if (existing) return;

  const key = await objectKeyOf(trx, blobId);
  await trx
    .insertInto("blob_keys")
    .values({
      blob_id: blobId,
      scope: "thread",
      scope_id: threadId,
      wrapped_object_key: wrap(key, await threadKey(trx, threadId)),
    })
    .onConflict((oc) => oc.columns(["blob_id", "scope", "scope_id"]).doNothing())
    .execute();
}

/** Drop a thread's wrap once no live row in that thread carries the blob.
 *
 *  Never the last wrap: the purge job removes that one, after it has decided
 *  the object is going too. A wrap dropped here can always be rebuilt from
 *  another, which is what makes Undo of a move an eight-second operation
 *  rather than a re-upload. */
export async function dropThreadWrapIfUnused(trx: Trx, blobId: string, threadId: string): Promise<void> {
  const stillCarried = await trx
    .selectFrom("content_blobs")
    .innerJoin("content", "content.id", "content_blobs.content_id")
    .select("content.id")
    .where("content_blobs.blob_id", "=", blobId)
    .where("content.thread_id", "=", threadId)
    .where("content.deleted_at", "is", null)
    .executeTakeFirst();
  if (stillCarried) return;

  const others = await trx
    .selectFrom("blob_keys")
    .select("scope")
    .where("blob_id", "=", blobId)
    .where((eb) => eb.not(eb.and([eb("scope", "=", "thread"), eb("scope_id", "=", threadId)])))
    .executeTakeFirst();
  if (!others) return;

  await trx
    .deleteFrom("blob_keys")
    .where("blob_id", "=", blobId)
    .where("scope", "=", "thread")
    .where("scope_id", "=", threadId)
    .execute();
}
