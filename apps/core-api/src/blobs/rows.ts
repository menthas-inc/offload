// A photo becomes a row.
//
// The model files a photo by naming its index on the message it arrived with,
// never by id, so it can only ever file what it was handed. The server
// resolves the index, links the row to the blob, and makes the thread wrap
// that lets the thread's members open it. And when a turn ends with a photo
// nobody filed, the server files it, because "the photo lands in Files,
// always" is a promise the code keeps rather than the prompt (020).

import type { Transaction } from "kysely";
import { sql } from "kysely";
import { ensureThreadWrap } from "./keys.js";
import { takenSentence } from "./photos.js";
import type { Database } from "../schema.js";

type Trx = Transaction<Database>;

export interface MessagePhoto {
  id: string;
  index: number;
  taken_at: Date | null;
  town: string | null;
  unreadable: boolean;
}

/** The photos a message carries, in the order they were attached. */
export async function photosOf(trx: Trx, messageId: string): Promise<MessagePhoto[]> {
  const rows = await trx
    .selectFrom("blobs")
    .select(["id", "taken_at", "town", "unreadable_at"])
    .where("message_id", "=", messageId)
    .where("deleted_at", "is", null)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .execute();
  return rows.map((row, at) => ({
    id: row.id,
    index: at + 1,
    taken_at: row.taken_at,
    town: row.town,
    unreadable: row.unreadable_at !== null,
  }));
}

/** Which of the message's photos already have a live row from this message. */
async function filedIds(trx: Trx, messageId: string): Promise<Set<string>> {
  const rows = await trx
    .selectFrom("content_blobs")
    .innerJoin("content", "content.id", "content_blobs.content_id")
    .select("content_blobs.blob_id")
    .where("content.derived_from_message_id", "=", messageId)
    .where("content.deleted_at", "is", null)
    .execute();
  return new Set(rows.map((row) => row.blob_id));
}

/** The photo an `add_content` names, or null for any reason: not a picture
 *  row, an index past the end, or a photo this turn already filed. */
export async function photoForRow(
  trx: Trx,
  messageId: string | null,
  index: number,
  type: string,
): Promise<MessagePhoto | null> {
  if (!messageId) return null;
  if (type !== "image" && type !== "screenshot") return null;
  const photos = await photosOf(trx, messageId);
  const photo = photos[index - 1];
  if (!photo) return null;
  const filed = await filedIds(trx, messageId);
  if (filed.has(photo.id)) return null;
  return photo;
}

/** The body with the photo's own sentence about when and where at the end. */
export function withTaken(body: string, photo: MessagePhoto | null): string | null {
  const sentence = photo ? takenSentence(photo.taken_at, photo.town) : "";
  const joined = [body.trim(), sentence].filter(Boolean).join("\n\n");
  return joined === "" ? null : joined;
}

/** Link a row to its photo and give the row's thread a wrap. */
export async function linkPhoto(trx: Trx, contentId: string, blobId: string, threadId: string): Promise<void> {
  await trx
    .insertInto("content_blobs")
    .values({ content_id: contentId, blob_id: blobId })
    .onConflict((oc) => oc.columns(["content_id", "blob_id"]).doNothing())
    .execute();
  await ensureThreadWrap(trx, blobId, threadId);
}

/** File every photo on the message that has no row yet, with a plain title,
 *  in the thread given. Returns how many it filed, so the reply can say the
 *  picture could not be made out. */
export async function fileUnfiled(
  trx: Trx,
  messageId: string,
  accountId: string,
  threadId: string,
): Promise<number> {
  const photos = await photosOf(trx, messageId);
  if (photos.length === 0) return 0;
  const filed = await filedIds(trx, messageId);
  let count = 0;
  for (const photo of photos) {
    if (filed.has(photo.id)) continue;
    const inserted = await trx
      .insertInto("content")
      .values({
        account_id: accountId,
        thread_id: threadId,
        derived_from_message_id: messageId,
        type: "image",
        title: "A photo",
        body: withTaken("", photo),
        source: "person",
        // One per photo per message, so a retried settle files nothing twice.
        tool_call_id: `photo:${photo.id}`,
        updated_at: sql`now()`,
      })
      .onConflict((oc) =>
        oc
          .columns(["derived_from_message_id", "tool_call_id"])
          .where("tool_call_id", "is not", null)
          .doNothing(),
      )
      .returning("id")
      .executeTakeFirst();
    if (!inserted) continue;
    await linkPhoto(trx, inserted.id, photo.id, threadId);
    await trx
      .updateTable("threads")
      .set({
        content_count: sql`content_count + 1`,
        last_activity_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where("id", "=", threadId)
      .execute();
    count += 1;
  }
  return count;
}
