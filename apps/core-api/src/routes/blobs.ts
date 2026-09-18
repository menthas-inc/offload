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
  DAILY_BYTES,
  DAILY_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_PIXELS,
  dimensions,
  sha256,
  sniff,
} from "../blobs/photos.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { reverseGeocodingOn } from "../places/reverse.js";

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
}

async function readUpload(request: FastifyRequest): Promise<Upload> {
  const upload: Upload = { clientKey: null, name: null, bytes: null, tooBig: false };
  for await (const part of request.parts()) {
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
    }
  }
  return upload;
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
          429: refused,
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
        .executeTakeFirst();
      if (existing && existing.deleted_at === null) {
        return reply.code(201).send({ blobId: existing.id, width: existing.width, height: existing.height });
      }
      if (existing) {
        await store.remove(RENDITIONS.map((rendition) => objectKey(existing.id, rendition)));
        await db.deleteFrom("blobs").where("id", "=", existing.id).where("deleted_at", "is not", null).execute();
      }

      const today = await db
        .selectFrom("blobs")
        .select(({ fn }) => [fn.countAll<string>().as("n"), fn.sum<string>("byte_size").as("bytes")])
        .where("account_id", "=", accountId)
        .where("created_at", ">", sql<Date>`now() - interval '24 hours'`)
        .executeTakeFirstOrThrow();
      if (Number(today.n) >= DAILY_PHOTOS || Number(today.bytes ?? 0) + upload.bytes.length > DAILY_BYTES) {
        return reply.code(429).send({ error: "daily_limit" });
      }

      const bytes = upload.bytes;

      const blob = await db.transaction().execute(async (trx) => {
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
        // so a store that refuses leaves no row pointing at nothing; the
        // orphan object a rollback can leave behind is bytes nobody can open.
        const key = await mintObjectKey(trx, inserted.id, accountId);
        await storeSealed(inserted.id, "original", key, bytes);
        return inserted;
      });

      request.log.info({ blobId: blob.id, bytes: bytes.length, type }, "photo stored");
      return reply.code(201).send({ blobId: blob.id, width: size.width, height: size.height });
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
        .header("Cache-Control", "private, max-age=3600")
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
      .select(["payload"])
      .where("id", "=", jobId)
      .where("kind", "=", "dump.answer")
      .executeTakeFirst();
    const messageId = (job?.payload as { messageId?: string } | undefined)?.messageId;
    if (!messageId) return null;
    const blob = await db
      .selectFrom("blobs")
      .select(["id", "content_type"])
      .where("id", "=", blobId)
      .where("message_id", "=", messageId)
      .where("deleted_at", "is", null)
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
