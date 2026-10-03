/** 026. An email's images, filtered hard before any model looks at them.
 *
 *  Most images in an email are a logo, a signature, a banner, a social icon
 *  or a spacer. The rules here are the cheap first pass; the look in the turn
 *  is the second. Candidates are sealed as unclaimed image blobs, exactly as
 *  a photo uploaded and not yet sent is, so 020's hourly sweep removes any
 *  the turn never claims. */

import { sql } from "kysely";
import { db } from "../db.js";
import { wrap } from "../crypto/keys.js";
import { mintObjectKey } from "../blobs/keys.js";
import { objectKey, objectStore } from "../blobs/store.js";
import { recordHit } from "../budget.js";
import { limitFor, type CapKey } from "../settings.js";
import { MAX_PHOTO_BYTES, MAX_PIXELS, dimensions, photosToday, sha256, sniff, type PhotoType } from "../blobs/photos.js";
import { storageUsed } from "../blobs/storage.js";
import type { ParsedImage } from "./parse.js";

export const MIN_BYTES = 20 * 1024;
export const MIN_SIDE = 300;
export const MAX_ASPECT = 4;
/** How many go on to the look. */
export const MAX_CANDIDATES = 20;

export type Candidate = { bytes: Buffer; type: PhotoType; width: number; height: number };

export function candidatesOf(images: ParsedImage[]): Candidate[] {
  const out: Candidate[] = [];
  for (const image of images) {
    if (out.length === MAX_CANDIDATES) break;
    const bytes = Buffer.from(image.bytes);
    if (bytes.length < MIN_BYTES || bytes.length > MAX_PHOTO_BYTES) continue;
    const type = sniff(bytes);
    if (!type) continue;
    const size = dimensions(bytes);
    if (!size || size.width * size.height > MAX_PIXELS) continue;
    if (Math.min(size.width, size.height) < MIN_SIDE) continue;
    if (Math.max(size.width, size.height) > MAX_ASPECT * Math.min(size.width, size.height)) continue;
    // The size the email draws it at, when it says: a signature image is
    // often a large file drawn small.
    const drawn = image.drawn;
    if (drawn && ((drawn.width !== null && drawn.width < MIN_SIDE) || (drawn.height !== null && drawn.height < MIN_SIDE))) continue;
    out.push({ bytes, type, ...size });
  }
  return out;
}

/** Seal each candidate as an unclaimed image blob of the account's, under
 *  020's daily limits, and return their ids in the email's order. The same
 *  email sealed twice returns the same ids. */
export async function sealCandidates(accountId: string, messageKey: string, candidates: Candidate[]): Promise<string[]> {
  const store = objectStore();
  if (!store || candidates.length === 0) return [];
  const today = await photosToday(accountId);
  let count = today.n;
  let bytesToday = today.bytes;
  const maxPhotos = await limitFor(accountId, "cap.photos");
  const maxBytes = await limitFor(accountId, "cap.photo_bytes");
  // 036. And what the account keeps, which this email's pictures add to.
  let kept = await storageUsed(accountId);
  const maxKept = await limitFor(accountId, "cap.storage_bytes");

  const ids: string[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const clientKey = `mail:${messageKey}:${index}`;
    const existing = await db
      .selectFrom("blobs")
      .select("id")
      .where("account_id", "=", accountId)
      .where("client_key", "=", clientKey)
      .where("kind", "=", "image")
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    // 034. The settings' ceilings, and a picture left out by one is a refusal
    // like any other: written down, once for the email.
    const over: CapKey | null =
      count >= maxPhotos
        ? "cap.photos"
        : bytesToday + candidate.bytes.length > maxBytes
          ? "cap.photo_bytes"
          : kept + candidate.bytes.length > maxKept
            ? "cap.storage_bytes"
            : null;
    if (over) {
      await recordHit(accountId, over, "account");
      break;
    }
    let put: string | null = null;
    const blob = await db
      .transaction()
      .execute(async (trx) => {
        const inserted = await trx
          .insertInto("blobs")
          .values({
            account_id: accountId,
            message_id: null,
            client_key: clientKey,
            name: null,
            content_type: candidate.type,
            byte_size: candidate.bytes.length,
            width: candidate.width,
            height: candidate.height,
            sha256: sha256(candidate.bytes),
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const key = await mintObjectKey(trx, inserted.id, accountId);
        await store.put(objectKey(inserted.id, "original"), wrap(candidate.bytes, key));
        put = inserted.id;
        return inserted;
      })
      .catch(async (error: unknown) => {
        if (put) await store.remove([objectKey(put, "original")]).catch(() => undefined);
        throw error;
      });
    ids.push(blob.id);
    count += 1;
    bytesToday += candidate.bytes.length;
    kept += candidate.bytes.length;
  }
  return ids;
}
