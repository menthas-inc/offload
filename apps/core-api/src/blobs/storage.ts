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

import { sql } from "kysely";
import { db } from "../db.js";

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
