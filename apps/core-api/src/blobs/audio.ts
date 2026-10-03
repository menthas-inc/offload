// What a voice note is, before anything is stored.
//
// The same posture as photos.ts: the bytes say what they are, the name and
// the declared type are never read, and the server never decodes audio. A
// container is recognised by its first bytes and nothing more, so nothing
// here puts an untrusted file anywhere near a decoder or a shell (SEC-1).
// The kind is the route's, never a shared sniff: `ftyp` is also how HEIF
// begins, and a HEIC sent to the audio route is refused here regardless.

import { sql } from "kysely";
import { db } from "../db.js";

/** Ten minutes at our own 64 kbps is about five megabytes. This is for a
 *  client that is not ours. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
/** The recorders stop themselves here; the server refuses past it. */
export const MAX_DURATION_MS = 600_000;
/** The stored waveform, over the whole note. */
export const WAVEFORM_BARS = 32;
/** Per account per day. A ceiling for an invited alpha, not a product limit.
 *  Counted by the device's declared length until the provider has measured
 *  the note, and by the measurement after. */
export const DAILY_VOICE_NOTES = 100;
export const DAILY_VOICE_MS = 60 * 60 * 1000;

/** The voice notes an account has stored in the last 24 hours, and their
 *  length: the provider's measurement where it exists, the device's count
 *  where it does not yet. What `cap.voice_notes` and `cap.voice_ms` are
 *  measured against, read by the upload and by the admin panel's page for a
 *  person (034 AC-18). */
export async function voiceToday(accountId: string): Promise<{ n: number; ms: number }> {
  const today = await db
    .selectFrom("blobs")
    .select(({ fn }) => [fn.countAll<string>().as("n"), fn.sum<string>(sql`coalesce(measured_ms, duration_ms)`).as("ms")])
    .where("account_id", "=", accountId)
    .where("kind", "=", "audio")
    .where("created_at", ">", sql<Date>`now() - interval '24 hours'`)
    .executeTakeFirstOrThrow();
  return { n: Number(today.n), ms: Number(today.ms ?? 0) };
}

export type AudioType = "audio/mp4" | "audio/webm" | "audio/ogg";

/** The MP4 family brands the two phones and Safari write. */
const MP4_BRANDS = new Set(["m4a ", "isom", "iso2", "mp42", "dash", "mp41"]);

/** The container the bytes declare, or null for anything the product does
 *  not record. */
export function sniffAudio(bytes: Buffer): AudioType | null {
  if (bytes.length < 12) return null;
  if (bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("latin1").toLowerCase();
    return MP4_BRANDS.has(brand) ? "audio/mp4" : null;
  }
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "audio/webm";
  if (bytes.subarray(0, 4).toString("latin1") === "OggS") return "audio/ogg";
  return null;
}

/** The device's bars, as the multipart field carries them: a JSON array of
 *  exactly WAVEFORM_BARS integers from 0 to 255. Anything else is null and
 *  the upload is refused, since a waveform is the one thing here the server
 *  cannot make for itself. */
export function parseWaveform(field: string | undefined): number[] | null {
  if (!field || field.length > 400) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(field);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== WAVEFORM_BARS) return null;
  const bars = parsed.map((value) => (Number.isInteger(value) && value >= 0 && value <= 255 ? (value as number) : -1));
  return bars.includes(-1) ? null : bars;
}

/** The device's own count of the note's length, bounded. */
export function parseDurationMs(field: string | undefined): number | null {
  const value = Number(field);
  if (!Number.isInteger(value) || value < 1 || value > MAX_DURATION_MS) return null;
  return value;
}

/** The file name a browser or a player is told, by container. */
export function audioFilename(type: string): string {
  return type === "audio/webm" ? "voice-note.webm" : type === "audio/ogg" ? "voice-note.ogg" : "voice-note.m4a";
}
