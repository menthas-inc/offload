// What a photo is, before anything is stored.
//
// The declared type and the name are never trusted: the bytes say what they
// are, and a PDF called photo.jpg is a PDF. The limits here are the server's
// own; the clients check the same things first as a courtesy, so the ordinary
// refusal never costs a request (SEC-2).

import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import { sql } from "kysely";
import { db } from "../db.js";

/** The most a photo may be. An iPhone's 48 megapixel HEIC is about eight. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
/** Bounds every decoder downstream. An 8064 by 6048 photo is 49 megapixels. */
export const MAX_PIXELS = 60_000_000;
/** Per message. */
export const MAX_PHOTOS = 10;
/** Per account per day. A ceiling for an invited alpha, not a product limit. */
export const DAILY_PHOTOS = 200;
export const DAILY_BYTES = 500 * 1024 * 1024;

/** The photos an account has stored in the last 24 hours, and their bytes:
 *  what `cap.photos` and `cap.photo_bytes` are measured against. One
 *  statement, read by the upload, by mail in, and by the admin panel's page
 *  for a person, so the page and the cap cannot disagree (034 AC-18). */
export async function photosToday(accountId: string): Promise<{ n: number; bytes: number }> {
  const today = await db
    .selectFrom("blobs")
    .select(({ fn }) => [fn.countAll<string>().as("n"), fn.sum<string>("byte_size").as("bytes")])
    .where("account_id", "=", accountId)
    .where("kind", "=", "image")
    .where("created_at", ">", sql<Date>`now() - interval '24 hours'`)
    .executeTakeFirstOrThrow();
  return { n: Number(today.n), bytes: Number(today.bytes ?? 0) };
}

export type PhotoType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"]);

/** The type the bytes declare, or null for anything the product does not take.
 *  GIF is not here on purpose: a GIF is usually an animation, and the product
 *  takes still photos. */
export function sniff(bytes: Buffer): PhotoType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("latin1").toLowerCase();
    if (HEIF_BRANDS.has(brand)) return brand.startsWith("hei") && brand !== "heif" ? "image/heic" : "image/heif";
    // Compatible brands follow the major one; a file whose major brand is
    // something else may still be HEIF-compatible.
    for (let at = 16; at + 4 <= Math.min(bytes.length, 64); at += 4) {
      if (HEIF_BRANDS.has(bytes.subarray(at, at + 4).toString("latin1").toLowerCase())) return "image/heic";
    }
  }
  return null;
}

/** Width and height from the header, without decoding pixels. Null when the
 *  header cannot be read, which is refused as not a photo. */
export function dimensions(bytes: Buffer): { width: number; height: number } | null {
  try {
    const size = imageSize(bytes);
    if (!size.width || !size.height) return null;
    return { width: size.width, height: size.height };
  } catch {
    return null;
  }
}

export function sha256(bytes: Buffer): Buffer {
  return createHash("sha256").update(bytes).digest();
}

/** The one sentence the row carries about where and when. A day and a town,
 *  never a coordinate and never a device. Empty when the photo knows neither. */
export function takenSentence(takenAt: Date | null, town: string | null): string {
  if (!takenAt && !town) return "";
  const day = takenAt
    ? takenAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
    : null;
  if (day && town) return `Taken on ${day} in ${town}.`;
  if (day) return `Taken on ${day}.`;
  return `Taken in ${town}.`;
}
