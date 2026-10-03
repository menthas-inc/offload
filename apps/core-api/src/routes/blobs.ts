// Photos: the bytes in, the renditions out.
//
// Four routes. A person uploads one photo to `POST /v1/blobs` and gets an id
// held unclaimed until the dump that claims it; a person reads a rendition
// from `GET /v1/blobs/:id/:rendition`, authorised on every fetch through the
// message or a thread; and the worker, holding a job, pulls the original and
// pushes the renditions over the internal routes. No route serves the
// original to a person: screens draw renditions, which are our own JPEG
// output and carry nothing the file arrived with.
//
// The log line for every one of these is method, path, status, bytes and
// duration. The file's name is a multipart field, stored on the row for the
// dumper alone, and it appears nowhere else (OFF-1).

import { timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { env } from "../env.js";
import { unwrap, wrap } from "../crypto/keys.js";
import { mintObjectKey, objectKeyOf } from "../blobs/keys.js";
import { objectKey, objectStore, RENDITIONS, type Rendition } from "../blobs/store.js";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MAX_PIXELS,
  dimensions,
  sha256,
  sniff,
} from "../blobs/photos.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { recordHit } from "../budget.js";
import { dailyLimit } from "./dumps.js";
import { limitFor, type CapKey } from "../settings.js";
import { MAX_CANDIDATES } from "../mail-in/images.js";
import { reverseGeocodingOn } from "../places/reverse.js";
import {
  audioFilename,
  MAX_AUDIO_BYTES,
  parseDurationMs,
  parseWaveform,
  sniffAudio,
} from "../blobs/audio.js";

function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

function tokenMatches(presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(env.INTERNAL_SERVICE_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearer(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

const unauthenticated = z.object({ error: z.literal("unauthenticated") });
const refused = z.object({ error: z.string() });
const uploaded = z.object({ blobId: z.string(), width: z.number(), height: z.number() });

/** The multipart fields of an upload, read from the parts as they arrive. */
interface Upload {
  clientKey: string | null;
  name: string | null;
  bytes: Buffer | null;
  tooBig: boolean;
  /** 021. The other string fields, bounded: a voice note's duration and
   *  bars ride here. */
  fields: Record<string, string>;
}

async function readUpload(request: FastifyRequest, fileSize?: number): Promise<Upload> {
  const upload: Upload = { clientKey: null, name: null, bytes: null, tooBig: false, fields: {} };
  // A route's own byte cap, where it is under the plugin's: the body stops
  // being read at the cap rather than buffered to the larger one.
  for await (const part of request.parts(fileSize ? { limits: { fileSize } } : undefined)) {
    if (part.type === "file") {
      if (upload.bytes) {
        // One photo per request. A second file is drained and ignored.
        await part.toBuffer();
        continue;
      }
      try {
        upload.bytes = await part.toBuffer();
      } catch (error) {
        if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
          upload.tooBig = true;
          continue;
        }
        throw error;
      }
      if (part.file.truncated) upload.tooBig = true;
    } else if (part.fieldname === "clientKey" && typeof part.value === "string") {
      upload.clientKey = part.value.slice(0, 200);
    } else if (part.fieldname === "name" && typeof part.value === "string") {
      upload.name = part.value.slice(0, 255) || null;
    } else if (typeof part.value === "string" && Object.keys(upload.fields).length < 8) {
      upload.fields[part.fieldname] = part.value.slice(0, 400);
    }
  }
  return upload;
}

/** 021. May this account hear this voice note? Its dumper, through the
 *  message, and nobody else: a conversation is never shared (013), and this
 *  is the one route that serves a blob as it arrived, so 020's second arm
 *  through a thread's rows is deliberately not here. */
async function hearable(blobId: string, accountId: string): Promise<{ content_type: string } | null> {
  const row = await db
    .selectFrom("blobs as b")
    .innerJoin("messages as m", "m.id", "b.message_id")
    .select("b.content_type")
    .where("b.id", "=", blobId)
    .where("b.kind", "=", "audio")
    .where("b.deleted_at", "is", null)
    .where("m.account_id", "=", accountId)
    .where("m.deleted_at", "is", null)
    .executeTakeFirst();
  return row ?? null;
}

/** One byte range, or null for none or for anything but a single range. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start = match[1] === "" ? NaN : Number(match[1]);
  let end = match[2] === "" ? size - 1 : Number(match[2]);
  if (Number.isNaN(start)) {
    // A suffix range: the last N bytes.
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}

/** May this account read this blob? The dumper through the message, a
 *  member through a live row in a thread they are in. Never a column on the
 *  blob (001). */
async function readable(blobId: string, accountId: string): Promise<boolean> {
  const row = await db
    .selectFrom("blobs as b")
    .select("b.id")
    .where("b.id", "=", blobId)
    .where("b.deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("messages as m")
            .select("m.id")
            .whereRef("m.id", "=", "b.message_id")
            .where("m.account_id", "=", accountId)
            .where("m.deleted_at", "is", null),
        ),
        eb.exists(
          eb
            .selectFrom("content_blobs as cb")
            .innerJoin("content as c", "c.id", "cb.content_id")
            .innerJoin("thread_members as tm", "tm.thread_id", "c.thread_id")
            .select("cb.blob_id")
            .whereRef("cb.blob_id", "=", "b.id")
            .where("c.deleted_at", "is", null)
            .where("tm.account_id", "=", accountId)
            .where("tm.state", "=", "accepted"),
        ),
      ]),
    )
    .executeTakeFirst();
  return Boolean(row);
}

/** Seal bytes under a blob's object key and store them at the rendition's
 *  key. The same shape as a wrapped key: nonce || ciphertext || tag. */
async function storeSealed(blobId: string, rendition: Rendition, key: Buffer, bytes: Buffer): Promise<void> {
  const store = objectStore();
  if (!store) throw new Error("No object store.");
  await store.put(objectKey(blobId, rendition), wrap(bytes, key));
}

async function openStored(blobId: string, rendition: Rendition, key: Buffer): Promise<Buffer | null> {
  const store = objectStore();
  if (!store) return null;
  const sealed = await store.get(objectKey(blobId, rendition));
  return sealed ? unwrap(sealed, key) : null;
}

export async function blobRoutes(app: App): Promise<void> {
  // ------------------------------------------------------------ a person

  app.post(
    "/v1/blobs",
    {
      schema: {
        response: {
          201: uploaded,
          401: unauthenticated,
          413: refused,
          415: refused,
          429: dailyLimit,
          503: refused,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const store = objectStore();
      if (!store) return reply.code(503).send({ error: "photos_unavailable" });

      const upload = await readUpload(request);
      if (upload.tooBig) return reply.code(413).send({ error: "too_big" });
      if (!upload.bytes || !upload.clientKey) return reply.code(415).send({ error: "not_a_photo" });
      if (upload.bytes.length > MAX_PHOTO_BYTES) return reply.code(413).send({ error: "too_big" });

      const type = sniff(upload.bytes);
      if (!type) return reply.code(415).send({ error: "not_a_photo" });
      const size = dimensions(upload.bytes);
      if (!size || size.width * size.height > MAX_PIXELS) return reply.code(415).send({ error: "not_a_photo" });

      // Idempotency first, so a retry reads nothing and counts nothing. A
      // row the sweep already took, an upload nobody sent for an hour, is
      // not the answer: the draft is being sent now, so the dead row and
      // whatever of its objects remain go, and this upload is a fresh one
      // under the same key.
      const existing = await db
        .selectFrom("blobs")
        .select(["id", "width", "height", "deleted_at"])
        .where("account_id", "=", accountId)
        .where("client_key", "=", upload.clientKey)
        .where("kind", "=", "image")
        .executeTakeFirst();
      if (existing && existing.deleted_at === null) {
        // A photo's dimensions are not null by the kind constraint.
        return reply.code(201).send({ blobId: existing.id, width: existing.width!, height: existing.height! });
      }
      if (existing) {
        await store.remove(RENDITIONS.map((rendition) => objectKey(existing.id, rendition)));
        await db.deleteFrom("blobs").where("id", "=", existing.id).where("deleted_at", "is not", null).execute();
      }

      const today = await db
        .selectFrom("blobs")
        .select(({ fn }) => [fn.countAll<string>().as("n"), fn.sum<string>("byte_size").as("bytes")])
        .where("account_id", "=", accountId)
        .where("kind", "=", "image")
        .where("created_at", ">", sql<Date>`now() - interval '24 hours'`)
        .executeTakeFirstOrThrow();
      // 034. Each ceiling is its setting, or this account's own value for it.
      const overPhotos: CapKey | null =
        Number(today.n) >= (await limitFor(accountId, "cap.photos"))
          ? "cap.photos"
          : Number(today.bytes ?? 0) + upload.bytes.length > (await limitFor(accountId, "cap.photo_bytes"))
            ? "cap.photo_bytes"
            : null;
      if (overPhotos) {
        await recordHit(accountId, overPhotos, "account");
        return reply.code(429).send({ error: "daily_limit", scope: "account" });
      }

      const bytes = upload.bytes;

      // The object that was put, so a commit that fails after the put can
      // take it back rather than leave ciphertext nothing can open sitting in
      // the bucket for good.
      let put: string | null = null;
      const blob = await db
        .transaction()
        .execute(async (trx) => {
          const inserted = await trx
            .insertInto("blobs")
            .values({
              account_id: accountId,
              message_id: null,
              client_key: upload.clientKey!,
              name: upload.name,
              content_type: type,
              byte_size: bytes.length,
              width: size.width,
              height: size.height,
              sha256: sha256(bytes),
            })
            .returning(["id"])
            .executeTakeFirstOrThrow();

          // The key, its account wrap, then the object. Inside the transaction
          // so a store that refuses leaves no row pointing at nothing.
          const key = await mintObjectKey(trx, inserted.id, accountId);
          await storeSealed(inserted.id, "original", key, bytes);
          put = inserted.id;
          return inserted;
        })
        .catch(async (error: unknown) => {
          if (put) await objectStore()?.remove([objectKey(put, "original")]).catch(() => undefined);
          throw error;
        });

      request.log.info({ blobId: blob.id, bytes: bytes.length, type }, "photo stored");
      return reply.code(201).send({ blobId: blob.id, width: size.width, height: size.height });
    },
  );

  // ------------------------------------------------------------ 021, a voice note

  app.post(
    "/v1/blobs/audio",
    {
      schema: {
        response: {
          201: z.object({ blobId: z.string() }),
          400: refused,
          401: unauthenticated,
          413: refused,
          415: refused,
          429: dailyLimit,
          503: refused,
        },
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const store = objectStore();
      if (!store) return reply.code(503).send({ error: "voice_unavailable" });

      const upload = await readUpload(request, MAX_AUDIO_BYTES);
      if (upload.tooBig) return reply.code(413).send({ error: "too_big" });
      if (!upload.bytes || !upload.clientKey) return reply.code(415).send({ error: "not_a_voice_note" });
      if (upload.bytes.length > MAX_AUDIO_BYTES) return reply.code(413).send({ error: "too_big" });

      // The kind is this route's. A HEIC begins with the same four bytes an
      // M4A does and is refused here by its brand, never by a shared sniff.
      const type = sniffAudio(upload.bytes);
      if (!type) return reply.code(415).send({ error: "not_a_voice_note" });
      const durationMs = parseDurationMs(upload.fields["durationMs"]);
      const waveform = parseWaveform(upload.fields["waveform"]);
      if (!durationMs || !waveform) return reply.code(400).send({ error: "bad_voice_note" });

      const existing = await db
        .selectFrom("blobs")
        .select(["id", "deleted_at"])
        .where("account_id", "=", accountId)
        .where("client_key", "=", upload.clientKey)
        .where("kind", "=", "audio")
        .executeTakeFirst();
      if (existing && existing.deleted_at === null) {
        return reply.code(201).send({ blobId: existing.id });
      }
      if (existing) {
        await store.remove([objectKey(existing.id, "original")]);
        await db.deleteFrom("blobs").where("id", "=", existing.id).where("deleted_at", "is not", null).execute();
      }

      // The day's ceiling, by count and by length: the provider's measurement
      // where it exists, the device's count where it does not yet. Outside
      // the insert's transaction, as 020's is: a cost bound, not a bill.
      const today = await db
        .selectFrom("blobs")
        .select(({ fn }) => [
          fn.countAll<string>().as("n"),
          fn.sum<string>(sql`coalesce(measured_ms, duration_ms)`).as("ms"),
        ])
        .where("account_id", "=", accountId)
        .where("kind", "=", "audio")
        .where("created_at", ">", sql<Date>`now() - interval '24 hours'`)
        .executeTakeFirstOrThrow();
      const overVoice: CapKey | null =
        Number(today.n) >= (await limitFor(accountId, "cap.voice_notes"))
          ? "cap.voice_notes"
          : Number(today.ms ?? 0) + durationMs > (await limitFor(accountId, "cap.voice_ms"))
            ? "cap.voice_ms"
            : null;
      if (overVoice) {
        await recordHit(accountId, overVoice, "account");
        return reply.code(429).send({ error: "daily_limit", scope: "account" });
      }

      const bytes = upload.bytes;
      const blob = await db.transaction().execute(async (trx) => {
        const inserted = await trx
          .insertInto("blobs")
          .values({
            account_id: accountId,
            message_id: null,
            client_key: upload.clientKey!,
            name: null,
            kind: "audio",
            content_type: type,
            byte_size: bytes.length,
            width: null,
            height: null,
            duration_ms: durationMs,
            waveform,
            sha256: sha256(bytes),
          })
          .returning(["id"])
          .executeTakeFirstOrThrow();
        const key = await mintObjectKey(trx, inserted.id, accountId);
        await storeSealed(inserted.id, "original", key, bytes);
        return inserted;
      });

      // Bytes, a type and a length. Never the bars.
      request.log.info({ blobId: blob.id, bytes: bytes.length, type, durationMs }, "voice note stored");
      return reply.code(201).send({ blobId: blob.id });
    },
  );

  app.get(
    "/v1/blobs/:id/audio",
    { schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const { id } = request.params;
      const blob = await hearable(id, accountId);
      if (!blob) return reply.code(404).send({ error: "not_found" });

      // Whole, then sliced: AES-GCM is not seekable and the cap is 10 MB.
      const bytes = await db.transaction().execute(async (trx) => openStored(id, "original", await objectKeyOf(trx, id)));
      if (!bytes) return reply.code(404).send({ error: "not_found" });

      const range = parseRange(request.headers.range, bytes.length);
      if (range === "unsatisfiable") {
        return reply.code(416).header("Content-Range", `bytes */${bytes.length}`).send();
      }

      // `no-store`: the phones keep the one copy they control and delete
      // it on pause; a platform cache holding a second decrypted copy would
      // be one nothing here can reach.
      void reply
        .header("Accept-Ranges", "bytes")
        .header("Content-Type", blob.content_type)
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Disposition", `inline; filename="${audioFilename(blob.content_type)}"`);
      if (!range) {
        return reply.code(200).header("Content-Length", String(bytes.length)).send(bytes);
      }
      const slice = bytes.subarray(range.start, range.end + 1);
      return reply
        .code(206)
        .header("Content-Range", `bytes ${range.start}-${range.end}/${bytes.length}`)
        .header("Content-Length", String(slice.length))
        .send(slice);
    },
  );

  app.get(
    "/v1/blobs/:id/:rendition",
    {
      schema: {
        params: z.object({ id: z.string().uuid(), rendition: z.enum(["thumb", "large"]) }),
      },
    },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const { id, rendition } = request.params;
      // One answer for "not yours" and "not there": a 404 says nothing about
      // which, so an id cannot be probed for existence.
      if (!(await readable(id, accountId))) return reply.code(404).send({ error: "not_found" });

      const blob = await db
        .selectFrom("blobs")
        .select(["renditions_at"])
        .where("id", "=", id)
        .executeTakeFirst();
      if (!blob?.renditions_at) return reply.code(404).send({ error: "not_found" });

      const bytes = await db.transaction().execute(async (trx) => openStored(id, rendition, await objectKeyOf(trx, id)));
      if (!bytes) return reply.code(404).send({ error: "not_found" });

      return reply
        .code(200)
        .header("Content-Type", "image/jpeg")
        // Minutes, not an hour: the server refuses on the next uncached read
        // once somebody is taken out of a thread, and the browser's copy is
        // the only thing that outlives that.
        .header("Cache-Control", "private, max-age=300")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Disposition", 'inline; filename="photo.jpg"')
        .send(bytes);
    },
  );

  // ------------------------------------------------------------ the worker

  /** The job is the authority on which message, and the message on which
   *  blobs, exactly as `turn-step` has it. The worker never names a blob it
   *  was not handed. */
  async function blobForJob(jobId: string, blobId: string): Promise<{ id: string; content_type: string } | null> {
    const job = await db
      .selectFrom("jobs")
      .select(["payload", "account_id"])
      .where("id", "=", jobId)
      .where("kind", "=", "dump.answer")
      .executeTakeFirst();
    const payload = job?.payload as { messageId?: string; mailLook?: string[] } | undefined;
    const messageId = payload?.messageId;
    if (!messageId || !job?.account_id) return null;
    // 026. Or one of the email's image candidates the job names, still
    // unclaimed and the job's account's, for the look to see.
    const candidate = (payload.mailLook ?? []).includes(blobId);
    const blob = await db
      .selectFrom("blobs")
      .select(["id", "content_type"])
      .where("id", "=", blobId)
      .where("deleted_at", "is", null)
      .where((eb) =>
        candidate
          ? eb.or([eb("message_id", "=", messageId), eb.and([eb("message_id", "is", null), eb("account_id", "=", job.account_id!)])])
          : eb("message_id", "=", messageId),
      )
      .executeTakeFirst();
    return blob ?? null;
  }

  app.get(
    "/internal/v1/blobs/:id/original",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ jobId: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      if (!tokenMatches(bearer(request))) return reply.code(401).send({ error: "unauthorised" });
      const blob = await blobForJob(request.query.jobId, request.params.id);
      if (!blob) return reply.code(404).send({ error: "unknown_blob" });

      const bytes = await db
        .transaction()
        .execute(async (trx) => openStored(blob.id, "original", await objectKeyOf(trx, blob.id)));
      if (!bytes) return reply.code(404).send({ error: "unknown_blob" });

      return reply.code(200).header("Content-Type", blob.content_type).header("Cache-Control", "no-store").send(bytes);
    },
  );

  const renditionsBody = z.object({ jobId: z.string().uuid() });

  app.post(
    "/internal/v1/blobs/:id/renditions",
    { schema: { params: z.object({ id: z.string().uuid() }), querystring: renditionsBody } },
    async (request, reply) => {
      if (!tokenMatches(bearer(request))) return reply.code(401).send({ error: "unauthorised" });
      const blob = await blobForJob(request.query.jobId, request.params.id);
      if (!blob) return reply.code(404).send({ error: "unknown_blob" });

      // The renditions, and what the file said about itself. The worker is
      // the one reader of metadata, because it is the process that opens the
      // file: one parser for JPEG, PNG, WebP and HEIC alike, and one answer.
      const files: Partial<Record<"thumb" | "large", Buffer>> = {};
      const fields: Record<string, string> = {};
      for await (const part of request.parts()) {
        if (part.type !== "file") {
          if (typeof part.value === "string") fields[part.fieldname] = part.value.slice(0, 80);
          continue;
        }
        if (part.fieldname !== "thumb" && part.fieldname !== "large") {
          await part.toBuffer();
          continue;
        }
        const bytes = await part.toBuffer();
        // Our own JPEG output, by sniff, or it is not a rendition.
        if (sniff(bytes) !== "image/jpeg") return reply.code(415).send({ error: "not_a_rendition" });
        files[part.fieldname] = bytes;
      }
      if (!files.thumb || !files.large) return reply.code(400).send({ error: "missing_rendition" });

      const meta = readMetadataFields(fields);
      await db.transaction().execute(async (trx) => {
        const key = await objectKeyOf(trx, blob.id);
        await storeSealed(blob.id, "thumb", key, files.thumb!);
        await storeSealed(blob.id, "large", key, files.large!);
        await trx
          .updateTable("blobs")
          .set({
            renditions_at: sql`now()`,
            unreadable_at: null,
            // Filled once and never overwritten: a retry of the same job
            // carries the same answer, and nothing else writes these.
            taken_at: sql`coalesce(taken_at, ${meta.takenAt})`,
            latitude: sql`coalesce(latitude, ${meta.latitude})`,
            longitude: sql`coalesce(longitude, ${meta.longitude})`,
            device: sql`coalesce(device, ${meta.device})`,
          })
          .where("id", "=", blob.id)
          .execute();

        // The town, when a resolver exists to name it. A key set later has
        // `blob.daily`'s backfill, which shares this key so the two never
        // queue one photo twice in a day.
        if (meta.latitude !== null && meta.longitude !== null && reverseGeocodingOn()) {
          await enqueue({
            kind: "blob.locate",
            payload: { blobId: blob.id },
            priority: PRIORITY.background,
            idempotencyKey: `blob.locate:${blob.id}:${new Date().toISOString().slice(0, 10)}`,
            tx: trx,
          });
        }
      });
      request.log.info({ blobId: blob.id, thumbBytes: files.thumb.length, largeBytes: files.large.length }, "renditions stored");
      return reply.code(200).send({ ok: true });
    },
  );

  app.post(
    "/internal/v1/blobs/:id/unreadable",
    { schema: { params: z.object({ id: z.string().uuid() }), body: renditionsBody } },
    async (request, reply) => {
      if (!tokenMatches(bearer(request))) return reply.code(401).send({ error: "unauthorised" });
      const blob = await blobForJob(request.body.jobId, request.params.id);
      if (!blob) return reply.code(404).send({ error: "unknown_blob" });
      await db.updateTable("blobs").set({ unreadable_at: sql`now()` }).where("id", "=", blob.id).execute();
      request.log.info({ blobId: blob.id }, "photo unreadable");
      return reply.code(200).send({ ok: true });
    },
  );

  // ------------------------------------------------------------ 021, the worker and a voice note

  /** The transcript's reference at the provider, held from submission until
   *  the delete after the read lands, so a retry polls it rather than sending
   *  the audio a second time. Never logged. */
  app.post(
    "/internal/v1/blobs/:id/submitted",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ jobId: z.string().uuid(), providerRef: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) }),
      },
    },
    async (request, reply) => {
      if (!tokenMatches(bearer(request))) return reply.code(401).send({ error: "unauthorised" });
      const blob = await blobForJob(request.body.jobId, request.params.id);
      if (!blob) return reply.code(404).send({ error: "unknown_blob" });
      await db
        .updateTable("blobs")
        .set({ provider_ref: request.body.providerRef })
        .where("id", "=", blob.id)
        .where("kind", "=", "audio")
        .execute();
      request.log.info({ blobId: blob.id }, "voice note submitted");
      return reply.code(200).send({ ok: true });
    },
  );

  /** The transcript, once. Sets the message's words as heard, the measured
   *  length, one ledger row for what it cost, and enqueues the delete of the
   *  provider's copy. A validation error here names the field and never the
   *  text. */
  app.post(
    "/internal/v1/messages/:id/transcript",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          jobId: z.string().uuid(),
          text: z.string().max(20_000),
          durationMs: z.number().int().min(0).max(36_000_000),
          costMicros: z.number().int().min(0).default(0),
          latencyMs: z.number().int().min(0).default(0),
        }),
      },
    },
    async (request, reply) => {
      if (!tokenMatches(bearer(request))) return reply.code(401).send({ error: "unauthorised" });
      const { jobId, text, durationMs, costMicros, latencyMs } = request.body;
      const job = await db
        .selectFrom("jobs")
        .select(["payload", "account_id"])
        .where("id", "=", jobId)
        .where("kind", "=", "dump.answer")
        .executeTakeFirst();
      const messageId = (job?.payload as { messageId?: string } | undefined)?.messageId;
      if (!messageId || messageId !== request.params.id || !job?.account_id) {
        return reply.code(404).send({ error: "unknown_message" });
      }
      const accountId = job.account_id;

      const written = await db.transaction().execute(async (trx) => {
        // Soft-deleted rows included: a turn undone while the worker was
        // listening still holds a reference at the provider, and the forget
        // below is the only thing that clears it (OFF-1's egress promise).
        const voice = await trx
          .selectFrom("blobs")
          .select(["id", "deleted_at"])
          .where("message_id", "=", messageId)
          .where("kind", "=", "audio")
          .executeTakeFirst();
        if (!voice) return false;

        await trx
          .updateTable("messages")
          .set({ transcript: text, transcribed_at: sql`now()` })
          .where("id", "=", messageId)
          .where("account_id", "=", accountId)
          .execute();
        await trx
          .updateTable("blobs")
          .set({ measured_ms: durationMs })
          .where("id", "=", voice.id)
          .execute();
        // The admin Costs page counts what the provider charged, beside the
        // model calls of the same turn. Tokens are zero: minutes are what it
        // bills by, and the cost column already carries the answer.
        await trx
          .insertInto("llm_usage")
          .values({
            account_id: accountId,
            job_kind: "dump.answer",
            category: "interactive",
            model: "assemblyai",
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cost_micros: costMicros,
            latency_ms: latencyMs,
          })
          .execute();
        await enqueue({
          kind: "voice.forget",
          accountId,
          payload: { blobId: voice.id },
          priority: PRIORITY.background,
          tx: trx,
        });
        // The stream on this message wakes to draw the words, ahead of the
        // reply, on the same channel the reply itself uses.
        await sql`select pg_notify(${"offload_answer"}, ${messageId})`.execute(trx);
        return true;
      });
      if (!written) return reply.code(404).send({ error: "unknown_message" });

      // A length and a flag. Never the words.
      request.log.info({ messageId, durationMs, empty: text.trim().length === 0 }, "transcript written");
      return reply.code(200).send({ ok: true });
    },
  );

  /** 026. The look's verdict on a forwarded email's image candidates. Every
   *  id must be one the job named, so the worker can keep only what core-api
   *  sealed for this email; the kept are claimed in the email's order, at
   *  most ten, and the rest go. A second call changes nothing. */
  app.post(
    "/internal/v1/messages/:id/look",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ jobId: z.string().uuid(), keep: z.array(z.string().uuid()).max(MAX_CANDIDATES) }),
      },
    },
    async (request, reply) => {
      if (!tokenMatches(bearer(request))) return reply.code(401).send({ error: "unauthorised" });
      const job = await db
        .selectFrom("jobs")
        .select(["payload", "account_id"])
        .where("id", "=", request.body.jobId)
        .where("kind", "=", "dump.answer")
        .executeTakeFirst();
      const payload = job?.payload as { messageId?: string; mailLook?: string[] } | undefined;
      if (!job?.account_id || payload?.messageId !== request.params.id) return reply.code(404).send({ error: "unknown_message" });
      const named = payload.mailLook ?? [];
      if (request.body.keep.some((id) => !named.includes(id))) return reply.code(400).send({ error: "not_a_candidate" });
      const accountId = job.account_id;
      const messageId = request.params.id;

      const kept = await db.transaction().execute(async (trx) => {
        const keep = named.filter((id) => request.body.keep.includes(id)).slice(0, MAX_PHOTOS);
        const live = await trx
          .selectFrom("blobs")
          .select(["id", "message_id"])
          .where("id", "in", named)
          .where("account_id", "=", accountId)
          .where("deleted_at", "is", null)
          .forUpdate()
          .execute();
        const claimable = keep.filter((id) => live.some((b) => b.id === id && (b.message_id === null || b.message_id === messageId)));
        if (claimable.length > 0) {
          await trx.updateTable("blobs").set({ message_id: messageId }).where("id", "in", claimable).execute();
          await trx
            .updateTable("messages")
            .set({ type: "image" })
            .where("id", "=", messageId)
            .where("account_id", "=", accountId)
            .where("text", "is", null)
            .execute();
        }
        const drop = live.filter((b) => b.message_id === null && !claimable.includes(b.id)).map((b) => b.id);
        if (drop.length > 0) {
          await trx.updateTable("blobs").set({ deleted_at: sql`now()`, purge_after: sql`now()` }).where("id", "in", drop).execute();
        }
        return claimable;
      });
      request.log.info({ messageId, kept: kept.length, candidates: named.length }, "mail look applied");
      return reply.code(200).send({ kept });
    },
  );

  /** The provider's copy is gone; the reference goes with it. */
  app.post(
    "/internal/v1/blobs/:id/forgotten",
    { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ jobId: z.string().uuid() }) } },
    async (request, reply) => {
      if (!tokenMatches(bearer(request))) return reply.code(401).send({ error: "unauthorised" });
      // A voice.forget job names its blob in its own payload; the message is
      // not the authority here, since the blob may outlive it.
      const job = await db
        .selectFrom("jobs")
        .select("payload")
        .where("id", "=", request.body.jobId)
        .where("kind", "=", "voice.forget")
        .executeTakeFirst();
      const blobId = (job?.payload as { blobId?: string } | undefined)?.blobId;
      if (!blobId || blobId !== request.params.id) return reply.code(404).send({ error: "unknown_blob" });
      await db.updateTable("blobs").set({ provider_ref: null }).where("id", "=", blobId).execute();
      request.log.info({ blobId }, "voice note forgotten at the provider");
      return reply.code(200).send({ ok: true });
    },
  );
}

/** What the worker read out of the file, as multipart fields. Absent or
 *  malformed is null; a coordinate off the globe is null. */
function readMetadataFields(fields: Record<string, string>): {
  takenAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  device: string | null;
} {
  const takenAt = fields["takenAt"] ? new Date(fields["takenAt"]) : null;
  const lat = fields["latitude"] !== undefined ? Number(fields["latitude"]) : NaN;
  const lng = fields["longitude"] !== undefined ? Number(fields["longitude"]) : NaN;
  const okPair = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
    latitude: okPair ? lat : null,
    longitude: okPair ? lng : null,
    device: fields["device"]?.trim() || null,
  };
}

/** For the tests: the renditions a person may read, opened. */
export { openStored, readable, storeSealed };
