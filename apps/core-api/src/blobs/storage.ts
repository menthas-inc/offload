// 036. How much an account keeps in R2, and the room a delete gives back.
//
// The figure is the files as they arrived, `blobs.byte_size`, for every blob
// the account uploaded that is not deleted: photos, screenshots, pictures from
// forwarded email and voice notes, claimed or still waiting for their dump.
// The renditions are offload's own and are not counted. One statement, read by
// the uploads, by mail in, by Settings and by the admin panel's page for a
// person, so none of them can disagree with the refusal.
//
// **What somebody left in a thread is the thread's** (the owner, 2026-10-04,
// and the privacy page's own words). A photo whose every live row is in a
// thread its uploader is no longer in stops counting against them, at read
// time, so the leave's Undo puts it back with nothing to rewrite. And a member
// deleting such a row frees the file as any delete does. While the uploader is
// still in the thread nobody else can delete the row at all (OFF-3), so the
// only person whose delete takes a photo there is the one who dumped it.

import { sql, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";

type Trx = Transaction<Database>;

/** 1 GiB, until Limits says otherwise. */
export const STORAGE_BYTES = 1024 * 1024 * 1024;

export async function storageUsed(accountId: string): Promise<number> {
  const { rows } = await sql<{ bytes: string | null }>`
    select sum(b.byte_size) as bytes
    from blobs b
    where b.account_id = ${accountId}
      and b.deleted_at is null
      and not (
        exists (
          select 1 from content_blobs cb
          join content c on c.id = cb.content_id
          where cb.blob_id = b.id and c.deleted_at is null
        )
        and not exists (
          select 1 from content_blobs cb
          join content c on c.id = cb.content_id
          join thread_members tm on tm.thread_id = c.thread_id
          where cb.blob_id = b.id and c.deleted_at is null
            and tm.account_id = b.account_id and tm.state = 'accepted'
        )
      )
  `.execute(db);
  return Number(rows[0]?.bytes ?? 0);
}

/** The photo a row carries, onto the row's own clock, when its deleter dumped
 *  it or its uploader has left the row's thread, unless a live row elsewhere
 *  still carries it. Somebody deleting a row of a leaver's is permitted by
 *  OFF-3 before this is reached. */
export async function takePhotosOfRow(
  trx: Trx,
  contentId: string,
  accountId: string,
  clock: { deletedAt: Date; purgeAfter: Date },
): Promise<void> {
  await sql`
    update blobs b
    set deleted_at = ${clock.deletedAt}, purge_after = ${clock.purgeAfter}
    where b.deleted_at is null
      and b.kind = 'image'
      and (
        b.account_id = ${accountId}
        or not exists (
          select 1 from content c
          join thread_members tm on tm.thread_id = c.thread_id
          where c.id = ${contentId} and tm.account_id = b.account_id and tm.state = 'accepted'
        )
      )
      and exists (select 1 from content_blobs cb where cb.blob_id = b.id and cb.content_id = ${contentId})
      and not exists (
        select 1 from content_blobs cb
        join content c on c.id = cb.content_id
        where cb.blob_id = b.id and c.id <> ${contentId} and c.deleted_at is null
      )
  `.execute(trx);
}

/** Undo of that: the photos the delete took, by its exact stamp. */
export async function restorePhotosOfRow(trx: Trx, contentId: string, deletedAt: Date): Promise<void> {
  await sql`
    update blobs b
    set deleted_at = null, purge_after = null
    where b.deleted_at = ${deletedAt}
      and exists (select 1 from content_blobs cb where cb.blob_id = b.id and cb.content_id = ${contentId})
  `.execute(trx);
}

/** The photos in a thread its last member is deleting, carried by its live
 *  rows and by no live row anywhere else. Every uploader has left it by now,
 *  the last one a moment ago, so all of them are the thread's. */
export async function takePhotosOfThread(
  trx: Trx,
  threadId: string,
  clock: { deletedAt: Date; purgeAfter: Date },
): Promise<void> {
  await sql`
    update blobs b
    set deleted_at = ${clock.deletedAt}, purge_after = ${clock.purgeAfter}
    where b.deleted_at is null
      and b.kind = 'image'
      and exists (
        select 1 from content_blobs cb
        join content c on c.id = cb.content_id
        where cb.blob_id = b.id and c.thread_id = ${threadId} and c.deleted_at is null
      )
      and not exists (
        select 1 from content_blobs cb
        join content c on c.id = cb.content_id
        where cb.blob_id = b.id and c.thread_id <> ${threadId} and c.deleted_at is null
      )
  `.execute(trx);
}

/** Undo of that, by the thread's exact stamp. */
export async function restorePhotosOfThread(trx: Trx, threadId: string, deletedAt: Date): Promise<void> {
  await sql`
    update blobs b
    set deleted_at = null, purge_after = null
    where b.deleted_at = ${deletedAt}
      and exists (
        select 1 from content_blobs cb
        join content c on c.id = cb.content_id
        where cb.blob_id = b.id and c.thread_id = ${threadId} and c.deleted_at is null
      )
  `.execute(trx);
}
