// The rows an answer showed, resolved when the conversation is read.
//
// **Ids are stored; rows are resolved.** 005 settled the same question for
// thread links, that they come from the ids and never from parsing the reply,
// and the reason is identical here: a row ticked or edited somewhere else must
// not sit stale inside a conversation from last week.
//
// Read through `readable_content`, so an answer written while somebody was in a
// thread stops showing its rows if they ever leave it.

import { fileToWire, type FileOnRow } from "../blobs/wire.js";
import { sql } from "kysely";
import { db } from "../db.js";
import { ANSWER_ROW_CHARS } from "./read.js";

export interface FoundResult {
  threadId: string;
  /** 028. Null for the default thread, which no surface names. */
  threadName: string | null;
  /** 037. Null with the name. */
  threadIcon: string | null;
  threadHue: number | null;
  /** The read hit its page. The tail becomes the thread rather than a Show more
   *  that would expand into rows nobody fetched. */
  truncated: boolean;
  rows: {
    contentId: string;
    threadId: string;
    threadName: string | null;
    threadIcon: string | null;
    threadHue: number | null;
    type: string;
    title: string;
    body: string | null;
    done: boolean;
    /** 020. The row's photo, when it has one, as the thread page sends it. */
    photo: FileOnRow | null;
  }[];
}

/** Every answer's rows for a page of messages, in one query.
 *
 *  Takes the whole tail rather than one message, because `waitingFor` already
 *  proved the shape: `dumps.ts` calls it once with all fifty rows of a
 *  conversation page. Per message this is fifty queries on every open, which
 *  looks fine until an account has more than four messages in it.
 */
export async function foundFor(
  messageIds: string[],
  accountId: string,
): Promise<Map<string, FoundResult[]>> {
  const byMessage = new Map<string, FoundResult[]>();
  if (messageIds.length === 0) return byMessage;

  const rows = await sql<{
    message_id: string;
    ord: number;
    truncated: boolean;
    id: string;
    thread_id: string;
    thread_name: string | null;
    thread_icon: string | null;
    thread_hue: number | null;
    type: string;
    title: string;
    body: string | null;
    done_at: Date | null;
    blob_id: string | null;
    blob_kind: "image" | "audio" | "pdf" | null;
    blob_width: number | null;
    blob_height: number | null;
    blob_pages: number | null;
    blob_renditions_at: Date | null;
    blob_clean_at: Date | null;
    blob_unreadable_at: Date | null;
  }>`
    select mc.message_id::text as message_id, mc.ord as ord, mc.truncated as truncated,
           c.id::text as id, c.thread_id::text as thread_id,
           -- 028. The default thread is never named: the card says Not in a thread.
           case when t.id = (select a.default_thread_id from accounts a where a.id = ${accountId}::uuid) then null else t.name end as thread_name,
           case when t.id = (select a.default_thread_id from accounts a where a.id = ${accountId}::uuid) then null else t.icon end as thread_icon,
           case when t.id = (select a.default_thread_id from accounts a where a.id = ${accountId}::uuid) then null else t.hue end as thread_hue,
           c.type as type, c.title as title, c.body as body, c.done_at as done_at,
           p.id::text as blob_id, p.kind as blob_kind, p.width as blob_width, p.height as blob_height,
           p.pages as blob_pages, p.renditions_at as blob_renditions_at, p.clean_at as blob_clean_at,
           p.unreadable_at as blob_unreadable_at
    from message_content mc
    join readable_content c on c.id = mc.content_id
    join threads t on t.id = c.thread_id
      and t.deleted_at is null
    -- 020. The row's photo, so an answer draws the picture where a thread
    -- page would. The viewer already passed readable_content, so the blob
    -- needs no check of its own.
    left join lateral (
      select b.id, b.kind, b.width, b.height, b.pages, b.renditions_at, b.clean_at, b.unreadable_at
      from content_blobs cb
      join blobs b on b.id = cb.blob_id and b.deleted_at is null
      where cb.content_id = c.id
      order by cb.created_at asc
      limit 1
    ) p on true
    -- Bound as one array parameter. An earlier version built this list by
    -- interpolating the ids into the string, and one caller passes a route
    -- param straight in, which is untrusted input reaching a query (SEC-1).
    where mc.message_id = any(${messageIds}::uuid[])
      and c.viewer_account_id = ${accountId}::uuid
      and c.deleted_at is null
    order by mc.message_id, mc.ord
  `.execute(db);

  for (const row of rows.rows) {
    const results = byMessage.get(row.message_id) ?? [];
    // Grouped by thread, in the order the reads returned them. One read was one
    // result, and the grouping is what the answer draws: a card per thread with
    // its own header, never one blended list.
    let result = results.find((r) => r.threadId === row.thread_id);
    if (!result) {
      result = {
        threadId: row.thread_id,
        threadName: row.thread_name, threadIcon: row.thread_icon, threadHue: row.thread_hue,
        truncated: row.truncated,
        rows: [],
      };
      results.push(result);
    }
    result.rows.push({
      contentId: row.id,
      threadId: row.thread_id,
      threadName: row.thread_name, threadIcon: row.thread_icon, threadHue: row.thread_hue,
      type: row.type,
      title: row.title,
      body: row.body ? row.body.slice(0, ANSWER_ROW_CHARS) : null,
      done: row.done_at !== null,
      photo: row.blob_id
        ? fileToWire({
            id: row.blob_id,
            kind: row.blob_kind!,
            width: row.blob_width,
            height: row.blob_height,
            pages: row.blob_pages,
            renditions_at: row.blob_renditions_at,
            clean_at: row.blob_clean_at,
            unreadable_at: row.blob_unreadable_at,
          })
        : null,
    });
    byMessage.set(row.message_id, results);
  }

  return byMessage;
}
