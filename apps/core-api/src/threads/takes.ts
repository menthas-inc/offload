// What a delete takes with it.
//
// **What you delete is deleted** (the owner, 2026-10-05). A row deleted takes
// every file it carries, of any kind, and the message it came from once
// nothing else alive came from that message: the words, the photos and the
// voice note on it, the transcript, which is a column of the message, and
// offload's reply under it, which names what is gone. One dump can make
// several rows and notes, so the message stays while any of them lives. A
// thread deleted by its last member does the same for everything in it.
//
// Everything rides the delete's own clock, `deleted_at` and `purge_after`
// stamped from the row or the thread, so Undo finds exactly what that delete
// took, and the purge destroys it once the window has passed: `content.purge`
// the rows and messages, `blob.purge` the files in R2.
//
// **Whose files go** (036, the owner 2026-10-04). What somebody left in a
// thread is the thread's. A row's delete takes a file, and a message, when the
// deleter dumped it or when its author is no longer in the row's thread. While
// the author is in the thread nobody else can delete the row at all (OFF-3),
// so the only person whose delete takes a file there is the one who dumped it.
// A thread's delete happens only when its last member leaves, so by then all
// of it is the thread's.

import { sql, type RawBuilder } from "kysely";
import type { Executor } from "./access.js";

type Clock = { deletedAt: Date; purgeAfter: Date };

/** A file a live row in a live thread still carries. A thread's delete leaves
 *  its rows live until the thread is purged, so the thread is checked too. */
const carried = sql<boolean>`exists (
  select 1 from content_blobs cb
  join content c on c.id = cb.content_id
  join threads t on t.id = c.thread_id
  where cb.blob_id = b.id and c.deleted_at is null and t.deleted_at is null
)`;

/** A message something alive still came from: a live row in a live thread, or
 *  a note that is neither deleted, folded, nor in a deleted thread. */
const fedFrom = sql<boolean>`(
  exists (
    select 1 from content c
    join threads t on t.id = c.thread_id
    where c.derived_from_message_id = m.id and c.deleted_at is null and t.deleted_at is null
  )
  or exists (
    select 1 from notes n
    where n.derived_from_message_id = m.id and n.deleted_at is null and n.superseded_at is null
      and not exists (select 1 from threads t where n.scope = 'thread' and t.id = n.subject_id and t.deleted_at is not null)
  )
)`;

/** The files a row carries, onto the row's clock, when its deleter dumped them
 *  or their uploader has left the row's thread, unless a live row elsewhere
 *  still carries them. */
export async function takeFilesOfRow(trx: Executor, contentId: string, accountId: string, clock: Clock): Promise<void> {
  await sql`
    update blobs b
    set deleted_at = ${clock.deletedAt}, purge_after = ${clock.purgeAfter}
    where b.deleted_at is null
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

/** Undo of that: the files the delete took, by its exact stamp. */
export async function restoreFilesOfRow(trx: Executor, contentId: string, deletedAt: Date): Promise<void> {
  await sql`
    update blobs b
    set deleted_at = null, purge_after = null
    where b.deleted_at = ${deletedAt}
      and exists (select 1 from content_blobs cb where cb.blob_id = b.id and cb.content_id = ${contentId})
  `.execute(trx);
}

/** The files in a thread its last member is deleting, carried by its live
 *  rows and by no live row anywhere else. */
export async function takeFilesOfThread(trx: Executor, threadId: string, clock: Clock): Promise<void> {
  await sql`
    update blobs b
    set deleted_at = ${clock.deletedAt}, purge_after = ${clock.purgeAfter}
    where b.deleted_at is null
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
export async function restoreFilesOfThread(trx: Executor, threadId: string, deletedAt: Date): Promise<void> {
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

/** The message a row or a note came from, onto its clock, once nothing alive
 *  came from it, when the deleter wrote it or its author has left the thread.
 *  Call it after the row's own delete, which is what makes it not alive. */
export async function takeSourceOfRow(
  trx: Executor,
  source: { messageId: string | null; threadId: string | null },
  accountId: string,
  clock: Clock,
): Promise<void> {
  if (!source.messageId) return;
  const theirs = source.threadId
    ? sql<boolean>`(m.account_id = ${accountId} or not exists (
        select 1 from thread_members tm
        where tm.thread_id = ${source.threadId} and tm.account_id = m.account_id and tm.state = 'accepted'
      ))`
    : sql<boolean>`m.account_id = ${accountId}`;
  await takeMessages(trx, sql`m.id = ${source.messageId} and ${theirs}`, clock);
}

/** Undo of that. The row or note is alive again, so the message it came from
 *  is too, whichever delete took it: two rows from one dump deleted one after
 *  the other leave the message on the second's stamp, and Undo of the first
 *  still brings it back. */
export async function restoreSourceOfRow(trx: Executor, messageId: string | null): Promise<void> {
  if (!messageId) return;
  await restoreMessages(trx, sql`m.id = ${messageId}`);
}

/** The messages a thread's rows and notes came from, onto the thread's clock,
 *  once nothing alive outside it came from them. Call it after the thread's
 *  own delete, which is what makes its rows not alive. */
export async function takeSourcesOfThread(trx: Executor, threadId: string, clock: Clock): Promise<void> {
  await takeMessages(trx, sql`m.id in (${sourcesIn(threadId)})`, clock);
}

/** Undo of that, once the thread is back. */
export async function restoreSourcesOfThread(trx: Executor, threadId: string): Promise<void> {
  await restoreMessages(trx, sql`m.id in (${sourcesIn(threadId)})`);
}

function sourcesIn(threadId: string): RawBuilder<unknown> {
  return sql`
    select c.derived_from_message_id from content c
    where c.thread_id = ${threadId} and c.deleted_at is null and c.derived_from_message_id is not null
    union
    select n.derived_from_message_id from notes n
    where n.scope = 'thread' and n.subject_id = ${threadId} and n.deleted_at is null and n.derived_from_message_id is not null
  `;
}

/** The messages matching `which` that nothing alive came from, the files they
 *  carry that no live row does, and offload's reply in the same turn once the
 *  turn has no message of the person's left. One statement: a data-modifying
 *  CTE reads the snapshot from before it, so the reply's check names the
 *  messages just taken rather than reading their new stamp. */
async function takeMessages(trx: Executor, which: RawBuilder<boolean>, clock: Clock): Promise<void> {
  await sql`
    with taken as (
      update messages m
      set deleted_at = ${clock.deletedAt}, purge_after = ${clock.purgeAfter}
      where m.deleted_at is null and ${which} and not ${fedFrom}
      returning m.id, m.turn_id, m.account_id
    ),
    files as (
      update blobs b
      set deleted_at = ${clock.deletedAt}, purge_after = ${clock.purgeAfter}
      from taken
      where b.message_id = taken.id and b.deleted_at is null and not ${carried}
      returning b.id
    )
    update messages r
    set deleted_at = ${clock.deletedAt}, purge_after = ${clock.purgeAfter}
    from taken
    where r.turn_id = taken.turn_id and r.account_id = taken.account_id
      and r.role = 'offload' and r.deleted_at is null
      and not exists (
        select 1 from messages p
        where p.turn_id = r.turn_id and p.account_id = r.account_id and p.role = 'person'
          and p.deleted_at is null and p.id not in (select id from taken)
      )
  `.execute(trx);
}

/** The deleted messages matching `which`, with the files and the reply their
 *  delete took on the same stamp. */
async function restoreMessages(trx: Executor, which: RawBuilder<boolean>): Promise<void> {
  await sql`
    with back as (
      select m.id, m.turn_id, m.account_id, m.deleted_at from messages m
      where m.deleted_at is not null and ${which}
    ),
    files as (
      update blobs b
      set deleted_at = null, purge_after = null
      from back
      where b.message_id = back.id and b.deleted_at = back.deleted_at
      returning b.id
    ),
    replies as (
      update messages r
      set deleted_at = null, purge_after = null
      from back
      where r.turn_id = back.turn_id and r.account_id = back.account_id
        and r.role = 'offload' and r.deleted_at = back.deleted_at
      returning r.id
    )
    update messages m
    set deleted_at = null, purge_after = null
    from back
    where m.id = back.id
  `.execute(trx);
}
