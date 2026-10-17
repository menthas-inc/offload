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
  /** 041. A PDF's page count; null for a photo. */
  pages: number | null;
}

/** The photos a message carries, in the order they were attached, or with
 *  `kind` "pdf" its PDFs (041), each counted among its own kind: PDF 2 is the
 *  second PDF, whatever photos sit between. 021: the voice note on the same
 *  message is never one of them, to this or to anything built on it. */
export async function photosOf(trx: Trx, messageId: string, kind: "image" | "pdf" = "image"): Promise<MessagePhoto[]> {
  const rows = await trx
    .selectFrom("blobs")
    .select(["id", "taken_at", "town", "unreadable_at", "pages"])
    .where("message_id", "=", messageId)
    .where("kind", "=", kind)
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
    pages: row.pages,
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

/** The rows a photo can be: a picture of its own, or since 2026-10-17 the one
 *  event, stay, place or to-do it became, which carries it as a voice note's
 *  row carries nothing beside it. */
const PHOTO_ROWS = new Set(["image", "screenshot", "event", "location", "task"]);

/** The photo an `add_content` names, or null for any reason: a row that
 *  cannot carry one, an index past the end, or a photo this turn already
 *  filed. */
export async function photoForRow(
  trx: Trx,
  messageId: string | null,
  index: number,
  type: string,
): Promise<MessagePhoto | null> {
  if (!messageId) return null;
  if (!PHOTO_ROWS.has(type)) return null;
  const photos = await photosOf(trx, messageId);
  const photo = photos[index - 1];
  if (!photo) return null;
  const filed = await filedIds(trx, messageId);
  if (filed.has(photo.id)) return null;
  return photo;
}

/** 041. The PDF that `add_content` names by `pdf`, on a `file` row only; null
 *  for an index past the PDFs or a PDF this turn already filed. */
export async function pdfForRow(
  trx: Trx,
  messageId: string | null,
  index: number,
  type: string,
): Promise<MessagePhoto | null> {
  if (!messageId || type !== "file") return null;
  const pdf = (await photosOf(trx, messageId, "pdf"))[index - 1];
  if (!pdf) return null;
  if ((await filedIds(trx, messageId)).has(pdf.id)) return null;
  return pdf;
}

/** 041. "1 page." or "12 pages.", the server's own sentence on a PDF's row. */
export function pagesSentence(pages: number | null): string {
  if (!pages) return "";
  return pages === 1 ? "1 page." : `${pages} pages.`;
}

/** The body with the photo's own sentence about when and where at the end,
 *  or a PDF's page count. */
export function withTaken(body: string | null | undefined, photo: MessagePhoto | null): string | null {
  const sentence = !photo ? "" : photo.pages !== null ? pagesSentence(photo.pages) : takenSentence(photo.taken_at, photo.town);
  const joined = [(body ?? "").trim(), sentence].filter(Boolean).join("\n\n");
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
  // 041. Photos as "A photo", PDFs as "A PDF" on a file row: never one as
  // the other.
  const photos = [
    ...(await photosOf(trx, messageId)).map((photo) => ({ photo, type: "image" as const, title: "A photo", key: "photo" })),
    ...(await photosOf(trx, messageId, "pdf")).map((photo) => ({ photo, type: "file" as const, title: "A PDF", key: "pdf" })),
  ];
  if (photos.length === 0) return 0;
  const filed = await filedIds(trx, messageId);
  let count = 0;
  for (const { photo, type, title, key } of photos) {
    if (filed.has(photo.id)) continue;
    const inserted = await trx
      .insertInto("content")
      .values({
        account_id: accountId,
        thread_id: threadId,
        derived_from_message_id: messageId,
        type,
        title,
        body: withTaken("", photo),
        source: "person",
        // One per file per message, so a retried settle files nothing twice.
        tool_call_id: `${key}:${photo.id}`,
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
