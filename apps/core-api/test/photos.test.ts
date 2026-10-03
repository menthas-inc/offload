// 020. Photos: the bytes in, the claim, the renditions, the row, the wraps,
// the question, the purge.
//
// AC-5   the server refuses by bytes and by header, whatever the name says.
// AC-6   the daily ceiling.
// AC-9   nothing is written until the photos are claimed; an unclaimed one
//        is swept after an hour.
// AC-10  a repeated client key stores nothing twice.
// AC-13  the event carries counts and never a name.
// AC-14  encrypted before the store, renditions under the same key.
// AC-15  no route serves the original to a person.
// AC-16  a photo the turn did not file is filed by the server.
// AC-19  metadata stored, the row's sentence, the coordinate never on the wire.
// AC-26  the thread question's condition, checked by the server.
// AC-28  Undo of the dump takes the photos.
// AC-34  members read through the thread, nobody else does.
// AC-35  a move takes the wrap with it.
// AC-37  purge destroys the object and not before.
//
// Through the built app where the property is a property of the request, and
// through the exported functions where it is a property of the transaction.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { clearSettingsCache } from "../src/settings.js";
import { answerQuestion, takeDump, undoTurn, UnknownBlob } from "../src/routes/dumps.js";
import { deleteThread, moveContent } from "../src/routes/threads.js";
import { objectKey, objectStore, resetObjectStore } from "../src/blobs/store.js";
import { NoKey, objectKeyOf, threadKey } from "../src/blobs/keys.js";
import { takeOut } from "../src/threads/sharing.js";
import { deleteAccount } from "../src/accounts/delete.js";
import { unwrap } from "../src/crypto/keys.js";
import { handlers } from "../src/jobs/handlers.js";
import { applyAnswer } from "../src/questions.js";
import { locateBlob } from "../src/places/reverse.js";

await migrate(() => {});

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/photos");
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

let app: App;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  resetObjectStore();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("place_reverse").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

/** An account the way promotion makes one: a key, a default thread with its
 *  key, an accepted membership. */
async function person(): Promise<{ id: string; defaultThreadId: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  // Past first run, as anybody who dumps is: an invited account's writes are
  // refused (033).
  await db.updateTable("accounts").set({ state: "active" }).where("id", "=", outcome.accountId).execute();
  const row = await db
    .selectFrom("accounts")
    .select("default_thread_id")
    .where("id", "=", outcome.accountId)
    .executeTakeFirstOrThrow();
  return { id: outcome.accountId, defaultThreadId: row.default_thread_id! };
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function thread(accountId: string, name: string, state: "accepted" | "pending" = "accepted"): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state }).execute();
  return row.id;
}

async function addMember(accountId: string, threadId: string): Promise<void> {
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state: "accepted" }).execute();
}

function form(file: Buffer, filename: string, type: string, clientKey = uuidv7(), name: string | null = filename): FormData {
  const data = new FormData();
  data.append("clientKey", clientKey);
  if (name !== null) data.append("name", name);
  data.append("file", new Blob([new Uint8Array(file)], { type }), filename);
  return data;
}

async function upload(cookie: string, file: Buffer, filename = "photo.jpg", type = "image/jpeg", clientKey = uuidv7()) {
  return app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: form(file, filename, type, clientKey) });
}

/** The job a dump enqueued, marked running the way a claim would. */
async function jobOf(messageId: string): Promise<string> {
  const rows = await db.selectFrom("jobs").select(["id", "payload"]).where("kind", "=", "dump.answer").execute();
  const job = rows.find((row) => (row.payload as { messageId?: string }).messageId === messageId);
  if (!job) throw new Error("no job");
  await db
    .updateTable("jobs")
    .set({ state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 })
    .where("id", "=", job.id)
    .execute();
  return job.id;
}

const internal = { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` };

async function renditions(jobId: string, blobId: string, meta: Record<string, string> = {}) {
  const data = new FormData();
  data.append("thumb", new Blob([new Uint8Array(fixture("plain.jpg"))], { type: "image/jpeg" }), "thumb.jpg");
  data.append("large", new Blob([new Uint8Array(fixture("receipt.jpg"))], { type: "image/jpeg" }), "large.jpg");
  for (const [k, v] of Object.entries(meta)) data.append(k, v);
  return app.inject({
    method: "POST",
    url: `/internal/v1/blobs/${blobId}/renditions?jobId=${jobId}`,
    headers: internal,
    payload: data,
  });
}

const tool = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/tool-call", headers: internal, payload });
const turnResult = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/turn-result", headers: internal, payload });

const goodUsage = [{ model: "claude-sonnet-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, costMicros: 1, latencyMs: 1 }];

/** A photo uploaded, claimed by a dump, renditions posted. The common start. */
async function dumped(me: { id: string; defaultThreadId: string }, text = "", opts: { threadId?: string | undefined; files?: string[] } = {}) {
  const cookie = await signIn(me.id);
  const blobIds: string[] = [];
  for (const file of opts.files ?? ["receipt.jpg"]) {
    const res = await upload(cookie, fixture(file), file, "image/jpeg");
    expect(res.statusCode).toBe(201);
    blobIds.push(res.json().blobId);
  }
  const sent = await takeDump(me.id, text, uuidv7(), opts.threadId, { blobIds, viaShare: false });
  const jobId = await jobOf(sent.messageId);
  for (const blobId of blobIds) {
    const res = await renditions(jobId, blobId, { takenAt: "2026-08-11T14:03:00Z", latitude: "38.7169", longitude: "-9.1399", device: "Apple iPhone 15 Pro" });
    expect(res.statusCode).toBe(200);
  }
  return { cookie, blobIds, ...sent, jobId };
}

describe("the upload", () => {
  it("stores a JPEG encrypted, and only the id and a word reach the store", async () => {
    const me = await person();
    const res = await upload(await signIn(me.id), fixture("receipt.jpg"), "IMG_4821 at home.jpg");
    expect(res.statusCode).toBe(201);
    const { blobId, width, height } = res.json();
    expect([width, height]).toEqual([640, 480]);

    const store = objectStore()!;
    const sealed = await store.get(objectKey(blobId, "original"));
    expect(sealed).not.toBeNull();
    // Ciphertext, not the file: the JPEG marker is not at the front.
    expect(sealed!.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
    // And it opens with the object key, to the bytes that arrived.
    const key = await db.transaction().execute((trx) => objectKeyOf(trx, blobId));
    expect(unwrap(sealed!, key).equals(fixture("receipt.jpg"))).toBe(true);

    const row = await db.selectFrom("blobs").selectAll().where("id", "=", blobId).executeTakeFirstOrThrow();
    expect(row.message_id).toBeNull();
    expect(row.content_type).toBe("image/jpeg");
    expect(row.name).toBe("IMG_4821 at home.jpg");
    // Metadata is the worker's to read; the upload knows the bytes only.
    expect(row.taken_at).toBeNull();
  });

  it("refuses by the bytes, whatever the name and the declared type say", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const pdf = await upload(cookie, fixture("not-a-photo.pdf"), "photo.jpg", "image/jpeg");
    expect(pdf.statusCode).toBe(415);
    const gif = await upload(cookie, fixture("animated.gif"), "photo.jpg", "image/jpeg");
    expect(gif.statusCode).toBe(415);
    expect(await db.selectFrom("blobs").selectAll().execute()).toHaveLength(0);
  });

  it("takes HEIC, WebP and PNG with their dimensions from the header", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const heic = await upload(cookie, fixture("sideways.heic"), "IMG_1.HEIC", "image/heic");
    expect(heic.statusCode).toBe(201);
    expect(heic.json().width).toBe(480);
    const webp = await upload(cookie, fixture("tiny.webp"), "a.webp", "image/webp");
    expect(webp.statusCode).toBe(201);
    const png = await upload(cookie, fixture("list.png"), "Screenshot.png", "image/png");
    expect(png.statusCode).toBe(201);
  });

  it("refuses a body over the limit before anything is written", async () => {
    const me = await person();
    const big = Buffer.concat([fixture("receipt.jpg"), Buffer.alloc(20 * 1024 * 1024)]);
    const res = await upload(await signIn(me.id), big);
    expect(res.statusCode).toBe(413);
    expect(await db.selectFrom("blobs").selectAll().execute()).toHaveLength(0);
  }, 60_000);

  it("returns the same blob for the same client key and writes nothing twice", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const key = uuidv7();
    const first = await upload(cookie, fixture("plain.jpg"), "a.jpg", "image/jpeg", key);
    const second = await upload(cookie, fixture("plain.jpg"), "a.jpg", "image/jpeg", key);
    expect(second.json().blobId).toBe(first.json().blobId);
    expect(await db.selectFrom("blobs").selectAll().execute()).toHaveLength(1);
  });

  it("holds the daily ceiling", async () => {
    const me = await person();
    // Two hundred rows of a byte each, written straight in.
    await db
      .insertInto("blobs")
      .values(
        Array.from({ length: 200 }, () => ({
          account_id: me.id,
          client_key: uuidv7(),
          content_type: "image/jpeg",
          byte_size: 1,
          width: 1,
          height: 1,
          sha256: Buffer.alloc(32),
        })),
      )
      .execute();
    const res = await upload(await signIn(me.id), fixture("plain.jpg"));
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("daily_limit");
  });

  // 034. The ceiling is its setting, a refusal says whose cap it was, and it
  // is written down.
  it("holds the ceiling an owner set, by count and by bytes, and records each refusal", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    await db.insertInto("app_settings").values({ key: "cap.photos", value: "1", updated_by_account_id: null }).execute();
    clearSettingsCache();
    expect((await upload(cookie, fixture("plain.jpg"))).statusCode).toBe(201);
    const second = await upload(cookie, fixture("plain.jpg"));
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: "daily_limit", scope: "account" });

    await db.deleteFrom("app_settings").execute();
    await db.insertInto("account_limits").values({ account_id: me.id, key: "cap.photo_bytes", value: 1024 * 1024 }).execute();
    clearSettingsCache();
    await db.updateTable("blobs").set({ byte_size: 1024 * 1024 }).where("account_id", "=", me.id).execute();
    expect((await upload(cookie, fixture("plain.jpg"))).statusCode).toBe(429);

    const hits = await db.selectFrom("limit_hits").select(["cap", "scope", "count"]).where("account_id", "=", me.id).orderBy("cap").execute();
    expect(hits).toEqual([
      { cap: "cap.photo_bytes", scope: "account", count: 1 },
      { cap: "cap.photos", scope: "account", count: 1 },
    ]);
    await db.deleteFrom("account_limits").execute();
    clearSettingsCache();
  });
});

describe("the claim", () => {
  it("writes the message and claims the photos in one transaction, or neither", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await upload(cookie, fixture("plain.jpg"))).json().blobId as string;

    await expect(takeDump(me.id, "", uuidv7(), undefined, { blobIds: [a, uuidv7()], viaShare: false })).rejects.toBeInstanceOf(UnknownBlob);
    expect(await db.selectFrom("messages").selectAll().execute()).toHaveLength(0);
    expect((await db.selectFrom("blobs").select("message_id").where("id", "=", a).executeTakeFirstOrThrow()).message_id).toBeNull();

    const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [a], viaShare: true });
    const message = await db.selectFrom("messages").selectAll().where("id", "=", sent.messageId).executeTakeFirstOrThrow();
    expect(message.type).toBe("image");
    expect(message.text).toBeNull();
    expect(message.source).toBe("share");
    expect((await db.selectFrom("blobs").select("message_id").where("id", "=", a).executeTakeFirstOrThrow()).message_id).toBe(sent.messageId);

    // Somebody else's photo is not claimable, and neither is one already claimed.
    const other = await person();
    await expect(takeDump(other.id, "mine", uuidv7(), undefined, { blobIds: [a], viaShare: false })).rejects.toBeInstanceOf(UnknownBlob);
    await expect(takeDump(me.id, "again", uuidv7(), undefined, { blobIds: [a], viaShare: false })).rejects.toBeInstanceOf(UnknownBlob);
  });

  it("answers an overlapping retry with the first attempt's message, never unknown_blob", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await upload(cookie, fixture("plain.jpg"), "plain.jpg")).json().blobId as string;
    const key = uuidv7();
    // The first attempt, by hand and held open: the lock takeDump takes on
    // the key, the photo's row lock, the message and the claim, with the
    // retry started in the middle. Two takeDump calls at once would race
    // for real and pass or fail on timing; this makes the overlap certain.
    let retry: Promise<Awaited<ReturnType<typeof takeDump>>> | undefined;
    const first = await db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${me.id}), hashtext(${key}))`.execute(trx);
      await trx.selectFrom("blobs").select("id").where("id", "=", a).forUpdate().execute();
      retry = takeDump(me.id, "shelf", key, undefined, { blobIds: [a], viaShare: false });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const conversation = await trx.insertInto("conversations").values({ account_id: me.id }).returning("id").executeTakeFirstOrThrow();
      const message = await trx
        .insertInto("messages")
        .values({ conversation_id: conversation.id, account_id: me.id, role: "person", type: "text", turn_id: uuidv7(), text: "shelf", state: "seen", client_key: key })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx.updateTable("blobs").set({ message_id: message.id }).where("id", "=", a).execute();
      return message.id;
    });
    const second = await retry!;
    expect(second.messageId).toBe(first);
    const messages = await db.selectFrom("messages").select("id").where("account_id", "=", me.id).execute();
    expect(messages).toHaveLength(1);
  });

  it("does not re-claim on a retried client key, and the event carries counts only", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await upload(cookie, fixture("plain.jpg"), "Very Personal Name.jpg")).json().blobId as string;
    const key = uuidv7();
    const first = await takeDump(me.id, "shelf", key, undefined, { blobIds: [a], viaShare: false });
    const second = await takeDump(me.id, "shelf", key, undefined, { blobIds: [a], viaShare: false });
    expect(second.messageId).toBe(first.messageId);

    const events = await db.selectFrom("analytics_events").selectAll().where("name", "=", "dump_sent").execute();
    expect(events).toHaveLength(1);
    const props = events[0]!.properties as Record<string, unknown>;
    expect(props).toEqual({ photos: 1, photo_bytes: fixture("plain.jpg").length, via_share: false });
    expect(JSON.stringify(events[0])).not.toContain("Very Personal");
  });

  it("refuses a dump with neither words nor photos at the route", async () => {
    const me = await person();
    const res = await app.inject({ method: "POST", url: "/v1/dumps", headers: { cookie: await signIn(me.id) }, payload: { text: "   " } });
    expect(res.statusCode).toBe(400);
  });

  it("answers 409 unknown_blob at the route for a blob that is not theirs", async () => {
    const me = await person();
    const res = await app.inject({
      method: "POST",
      url: "/v1/dumps",
      headers: { cookie: await signIn(me.id) },
      payload: { text: "", clientKey: uuidv7(), blobIds: [uuidv7()] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "unknown_blob" });
  });
});

describe("the worker's routes", () => {
  it("streams the original decrypted to the job that holds the message, and nobody else", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await upload(cookie, fixture("receipt.jpg"))).json().blobId as string;
    const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [a], viaShare: false });
    const jobId = await jobOf(sent.messageId);

    const res = await app.inject({ method: "GET", url: `/internal/v1/blobs/${a}/original?jobId=${jobId}`, headers: internal });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(Buffer.from(res.rawPayload).equals(fixture("receipt.jpg"))).toBe(true);

    // Another job, another message: not this photo.
    const other = await takeDump(me.id, "words", uuidv7());
    const otherJob = await jobOf(other.messageId);
    const wrong = await app.inject({ method: "GET", url: `/internal/v1/blobs/${a}/original?jobId=${otherJob}`, headers: internal });
    expect(wrong.statusCode).toBe(404);
    const noToken = await app.inject({ method: "GET", url: `/internal/v1/blobs/${a}/original?jobId=${jobId}` });
    expect(noToken.statusCode).toBe(401);
  });

  it("stores renditions under the same object key with their own nonces, and the metadata once", async () => {
    const me = await person();
    const { blobIds } = await dumped(me);
    const [a] = blobIds;
    const store = objectStore()!;
    const key = await db.transaction().execute((trx) => objectKeyOf(trx, a!));
    const thumb = (await store.get(objectKey(a!, "thumb")))!;
    const large = (await store.get(objectKey(a!, "large")))!;
    expect(thumb.subarray(0, 12).equals(large.subarray(0, 12))).toBe(false);
    expect(unwrap(thumb, key).equals(fixture("plain.jpg"))).toBe(true);
    expect(unwrap(large, key).equals(fixture("receipt.jpg"))).toBe(true);

    const row = await db.selectFrom("blobs").selectAll().where("id", "=", a!).executeTakeFirstOrThrow();
    expect(row.renditions_at).not.toBeNull();
    expect(row.taken_at?.toISOString()).toBe("2026-08-11T14:03:00.000Z");
    expect(row.latitude).toBeCloseTo(38.7169, 4);
    expect(row.device).toBe("Apple iPhone 15 Pro");
    // No key, no locate job.
    expect(await db.selectFrom("jobs").selectAll().where("kind", "=", "blob.locate").execute()).toHaveLength(0);
  });

  it("refuses a rendition that is not our JPEG", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await upload(cookie, fixture("plain.jpg"))).json().blobId as string;
    const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [a], viaShare: false });
    const jobId = await jobOf(sent.messageId);
    const data = new FormData();
    data.append("thumb", new Blob([new Uint8Array(fixture("list.png"))], { type: "image/png" }), "thumb.png");
    data.append("large", new Blob([new Uint8Array(fixture("plain.jpg"))], { type: "image/jpeg" }), "large.jpg");
    const res = await app.inject({ method: "POST", url: `/internal/v1/blobs/${a}/renditions?jobId=${jobId}`, headers: internal, payload: data });
    expect(res.statusCode).toBe(415);
  });
});

describe("reading a rendition", () => {
  it("is the dumper's before any row exists, a member's through a row, and nobody else's", async () => {
    const me = await person();
    const { cookie, blobIds, jobId } = await dumped(me);
    const [a] = blobIds;

    const mine = await app.inject({ method: "GET", url: `/v1/blobs/${a}/thumb`, headers: { cookie } });
    expect(mine.statusCode).toBe(200);
    expect(mine.headers["content-type"]).toBe("image/jpeg");
    expect(mine.headers["cache-control"]).toBe("private, max-age=300");
    expect(mine.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(mine.rawPayload).equals(fixture("plain.jpg"))).toBe(true);

    // No route for the original, for anyone.
    const original = await app.inject({ method: "GET", url: `/v1/blobs/${a}/original`, headers: { cookie } });
    expect(original.statusCode).toBe(400);

    const bob = await person();
    const bobCookie = await signIn(bob.id);
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${a}/thumb`, headers: { cookie: bobCookie } })).statusCode).toBe(404);

    // Filed into a thread Bob is in: readable, through the row.
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    const filed = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: shared, title: "Receipt", type: "image", photo: 1 });
    expect(filed.json()).toMatchObject({ ok: true });
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${a}/large`, headers: { cookie: bobCookie } })).statusCode).toBe(200);

    // Moved out again: not readable, and the wrap is gone with it.
    const elsewhere = await thread(me.id, "Private");
    await moveContent(me.id, filed.json().contentId, elsewhere);
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${a}/large`, headers: { cookie: bobCookie } })).statusCode).toBe(404);
    const wraps = await db.selectFrom("blob_keys").select(["scope", "scope_id"]).where("blob_id", "=", a!).execute();
    expect(wraps.map((w) => w.scope_id).sort()).toEqual([me.id, elsewhere].sort());
  });

  it("is 404 until the renditions exist", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await upload(cookie, fixture("plain.jpg"))).json().blobId as string;
    await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [a], viaShare: false });
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${a}/thumb`, headers: { cookie } })).statusCode).toBe(404);
  });
});

describe("the row", () => {
  it("links the photo by index, wraps the thread, and appends the sentence", async () => {
    const me = await person();
    const { jobId, blobIds } = await dumped(me, "shelf brackets", { files: ["receipt.jpg", "plain.jpg"] });
    const build = await thread(me.id, "Bookshelf build");

    const first = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: build, title: "Receipt from IKEA", body: "84 euros.", type: "image", photo: 1 });
    expect(first.json().ok).toBe(true);
    const row = await db.selectFrom("content").selectAll().where("id", "=", first.json().contentId).executeTakeFirstOrThrow();
    expect(row.body).toBe("84 euros.\n\nTaken on 11 August.");
    const link = await db.selectFrom("content_blobs").selectAll().where("content_id", "=", row.id).executeTakeFirstOrThrow();
    expect(link.blob_id).toBe(blobIds[0]);
    const wrap = await db.selectFrom("blob_keys").selectAll().where("blob_id", "=", blobIds[0]!).where("scope", "=", "thread").executeTakeFirstOrThrow();
    expect(wrap.scope_id).toBe(build);

    // The same photo twice, an index past the end, and a task with a photo.
    expect((await tool({ tool: "add_content", jobId, toolCallId: "c2", threadId: build, title: "Again", type: "image", photo: 1 })).json()).toEqual({ ok: false, error: "unknown_photo" });
    expect((await tool({ tool: "add_content", jobId, toolCallId: "c3", threadId: build, title: "Third", type: "image", photo: 3 })).json()).toEqual({ ok: false, error: "unknown_photo" });
    expect((await tool({ tool: "add_content", jobId, toolCallId: "c4", threadId: build, title: "Buy", type: "task", photo: 2 })).json()).toEqual({ ok: false, error: "unknown_photo" });

    // The page carries the photo, ready, and never the coordinate.
    const page = await app.inject({ method: "GET", url: `/v1/threads/${build}/content`, headers: { cookie: await signIn(me.id) } });
    const shaped = page.json().rows.find((r: { id: string }) => r.id === row.id);
    expect(shaped.photo).toEqual({ blobId: blobIds[0], width: 640, height: 480, ready: true });
    expect(JSON.stringify(page.json())).not.toContain("38.71");
  });

  it("files what the turn did not, with a plain title, before the turn settles", async () => {
    const me = await person();
    const { jobId, blobIds, messageId } = await dumped(me, "", { files: ["receipt.jpg", "plain.jpg"] });
    const build = await thread(me.id, "Bookshelf build");
    await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: build, title: "Receipt", type: "screenshot", photo: 1 });

    const res = await turnResult({ outcome: "answered", jobId, usage: goodUsage });
    expect(res.statusCode).toBe(200);
    const rows = await db.selectFrom("content").select(["title", "thread_id", "type"]).where("derived_from_message_id", "=", messageId).orderBy("created_at").execute();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ title: "A photo", thread_id: me.defaultThreadId, type: "image" });
    const links = await db.selectFrom("content_blobs").select("blob_id").execute();
    expect(links.map((l) => l.blob_id).sort()).toEqual([...blobIds].sort());

    // A second settle, the retry, files nothing more.
    await db.updateTable("messages").set({ state: "seen" }).where("id", "=", messageId).execute();
    await turnResult({ outcome: "answered", jobId, usage: goodUsage });
    expect(await db.selectFrom("content").selectAll().where("derived_from_message_id", "=", messageId).execute()).toHaveLength(2);
  });

  it("files the photos of a failed turn too", async () => {
    const me = await person();
    const { jobId, messageId } = await dumped(me);
    await turnResult({ outcome: "failed", jobId, reason: "invalid_output" });
    const rows = await db.selectFrom("content").select("title").where("derived_from_message_id", "=", messageId).execute();
    expect(rows).toEqual([{ title: "A photo" }]);
  });
});

describe("the one question", () => {
  async function askThread(me: { id: string; defaultThreadId: string }, opts: { text?: string; threadId?: string; extraRow?: boolean; options?: string[] }) {
    const { jobId, messageId } = await dumped(me, opts.text ?? "", { threadId: opts.threadId });
    const trip = await thread(me.id, "Lisbon trip");
    const filed = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: me.defaultThreadId, title: "The beach", type: "image", photo: 1 });
    if (opts.extraRow) {
      await tool({ tool: "add_content", jobId, toolCallId: "c2", threadId: me.defaultThreadId, title: "Buy sunscreen", type: "task" });
    }
    const res = await turnResult({
      outcome: "answered",
      jobId,
      usage: goodUsage,
      questions: [{ field: "thread", title: "The beach", contentId: filed.json().contentId, options: (opts.options ?? [trip]).map((value) => ({ value })) }],
    });
    expect(res.statusCode).toBe(200);
    const question = await db.selectFrom("questions").selectAll().where("message_id", "=", messageId).executeTakeFirst();
    return { question, trip, contentId: filed.json().contentId as string, messageId };
  }

  it("is asked when the condition holds, with the thread's own name", async () => {
    const me = await person();
    const { question, trip } = await askThread(me, {});
    expect(question?.state).toBe("open");
    expect(question?.text).toBe('Kept "The beach". Which thread?');
    expect(question?.options).toEqual([{ label: "Lisbon trip", value: trip }, { label: "Not that", value: null }]);
  });

  it("is refused when there were words, a thread on screen, or a second row", async () => {
    const me = await person();
    expect((await askThread(me, { text: "beach day" })).question).toBeUndefined();
    const home = await thread(me.id, "Flat admin");
    expect((await askThread(me, { threadId: home })).question).toBeUndefined();
    expect((await askThread(me, { extraRow: true })).question).toBeUndefined();
  });

  it("drops an option the person is not an accepted member of", async () => {
    const me = await person();
    const bob = await person();
    const bobs = await thread(bob.id, "Bob's thread");
    const pending = await thread(me.id, "Invited", "pending");
    const { question } = await askThread(me, { options: [bobs, pending] });
    expect(question).toBeUndefined();
  });

  it("moves the row and its wrap on a tap, and Undo moves it back", async () => {
    const me = await person();
    const { question, trip, contentId } = await askThread(me, {});
    const answerTurn = uuidv7();
    const applied = await db.transaction().execute((trx) =>
      applyAnswer(trx, question!.id, me.id, { thread: trip }, { answeredMessageId: null, answerTurnId: answerTurn, option: 0 }),
    );
    expect(applied).toMatchObject({ applied: true, threadId: trip });
    expect((await db.selectFrom("content").select("thread_id").where("id", "=", contentId).executeTakeFirstOrThrow()).thread_id).toBe(trip);
    const wraps = await db.selectFrom("blob_keys").select("scope_id").where("scope", "=", "thread").execute();
    expect(wraps.map((w) => w.scope_id)).toEqual([trip]);

    // The answer's turn is undone through the same restore every answer has.
    await db.insertInto("messages").values({ conversation_id: (await db.selectFrom("conversations").select("id").executeTakeFirstOrThrow()).id, account_id: me.id, role: "person", type: "text", turn_id: answerTurn, text: "Lisbon trip", state: "answered" }).execute();
    await undoTurn(me.id, answerTurn);
    expect((await db.selectFrom("content").select("thread_id").where("id", "=", contentId).executeTakeFirstOrThrow()).thread_id).toBe(me.defaultThreadId);
  });

  it("moves the row on a tap through the answer route's own parser", async () => {
    // Found by 022: `optionAsValue` in the answer path carried its own switch
    // over five fields and no `thread`, so a tapped chip fell through to
    // null, closed the question and moved nothing. The test above calls
    // `applyAnswer` with the value already parsed and never saw it.
    const me = await person();
    const { question, trip, contentId } = await askThread(me, {});
    const answered = await answerQuestion(me.id, question!.id, 0);
    if (!answered || !("envelope" in answered)) throw new Error("no envelope");
    expect(answered.applied).toBe(true);
    expect((await db.selectFrom("content").select("thread_id").where("id", "=", contentId).executeTakeFirstOrThrow()).thread_id).toBe(trip);
  });
});

describe("deletion", () => {
  it("Undo of the dump takes the photos onto the purge clock", async () => {
    const me = await person();
    const { blobIds, turnId } = await dumped(me);
    await undoTurn(me.id, turnId);
    const row = await db.selectFrom("blobs").selectAll().where("id", "=", blobIds[0]!).executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.purge_after).not.toBeNull();
  });

  it("sweeps an unclaimed upload at an hour and not before, then destroys the object", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const young = (await upload(cookie, fixture("plain.jpg"))).json().blobId as string;
    const old = (await upload(cookie, fixture("tiny.webp"))).json().blobId as string;
    await db.updateTable("blobs").set({ created_at: sql`now() - interval '61 minutes'` }).where("id", "=", old).execute();

    await handlers["content.purge"]!({}, { mailer: null as never }, null);
    const rows = await db.selectFrom("blobs").select(["id", "deleted_at"]).execute();
    expect(rows.find((r) => r.id === young)!.deleted_at).toBeNull();
    expect(rows.find((r) => r.id === old)!.deleted_at).not.toBeNull();
    expect(await db.selectFrom("jobs").selectAll().where("kind", "=", "blob.purge").execute()).toHaveLength(1);

    await handlers["blob.purge"]!({}, { mailer: null as never }, null);
    expect(await db.selectFrom("blobs").select("id").where("id", "=", old).execute()).toHaveLength(0);
    expect(await objectStore()!.get(objectKey(old, "original"))).toBeNull();
    expect(await objectStore()!.get(objectKey(young, "original"))).not.toBeNull();
  });

  it("leaves a photo a shared thread still carries when its message purges, and its account wrap goes", async () => {
    const me = await person();
    const bob = await person();
    const { jobId, blobIds, messageId } = await dumped(me);
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: shared, title: "Receipt", type: "image", photo: 1 });

    // The message goes the way the purge takes one, without its rows.
    await db.deleteFrom("messages").where("id", "=", messageId).execute();
    await handlers["content.purge"]!({}, { mailer: null as never }, null);
    const row = await db.selectFrom("blobs").selectAll().where("id", "=", blobIds[0]!).executeTakeFirstOrThrow();
    expect(row.deleted_at).toBeNull();
    expect(row.message_id).toBeNull();
    // Bob still reads it through the thread.
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${blobIds[0]}/thumb`, headers: { cookie: await signIn(bob.id) } })).statusCode).toBe(200);
  });

  it("a member who joined after the key existed gets a copy on the next use, and reads on alone", async () => {
    const me = await person();
    const bob = await person();
    const { jobId, blobIds } = await dumped(me, "", { files: ["receipt.jpg", "plain.jpg"] });
    const shared = await thread(me.id, "Flat admin");
    // The first filing mints the thread key for the one member there is.
    await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: shared, title: "Receipt", type: "image", photo: 1 });
    // Bob joins afterwards, which writes him no copy: sharing's accept path
    // is not built, and this is the net under it.
    await addMember(bob.id, shared);
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", shared).execute()).toHaveLength(1);
    // The next use of the key wraps it for him.
    await tool({ tool: "add_content", jobId, toolCallId: "c2", threadId: shared, title: "Shelf", type: "image", photo: 2 });
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", shared).execute()).toHaveLength(2);
    // The dumper goes, account wrap, thread copy and membership with them,
    // and Bob still opens both through his own copy.
    await db.deleteFrom("blob_keys").where("scope", "=", "account").execute();
    await db.deleteFrom("thread_keys").where("thread_id", "=", shared).where("account_id", "=", me.id).execute();
    await db.deleteFrom("thread_members").where("thread_id", "=", shared).where("account_id", "=", me.id).execute();
    const cookie = await signIn(bob.id);
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${blobIds[0]}/thumb`, headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${blobIds[1]}/thumb`, headers: { cookie } })).statusCode).toBe(200);
  });

  // 035 AC-5. A shared thread's photos outlive whoever happened to hold its
  // key. `addMember` writes no copy, which is the state a restored leave is in
  // until the next use of the key.
  async function sharedPhoto(): Promise<{ me: { id: string }; bob: { id: string }; shared: string; blobId: string }> {
    const me = await person();
    const bob = await person();
    const { jobId, blobIds } = await dumped(me, "", { files: ["receipt.jpg"] });
    const shared = await thread(me.id, "Flat admin");
    await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: shared, title: "Receipt", type: "image", photo: 1 });
    await addMember(bob.id, shared);
    return { me, bob, shared, blobId: blobIds[0]! };
  }

  async function opensFor(accountId: string, blobId: string): Promise<number> {
    // With the dumper's account wrap gone, only the thread's key opens it.
    await db.deleteFrom("blob_keys").where("scope", "=", "account").execute();
    const cookie = await signIn(accountId);
    return (await app.inject({ method: "GET", url: `/v1/blobs/${blobId}/thumb`, headers: { cookie } })).statusCode;
  }

  it("keeps a shared thread's photos open when the only holder of its key leaves", async () => {
    const { me, bob, shared, blobId } = await sharedPhoto();
    expect(await deleteThread(me.id, shared)).toEqual({ left: true, deleted: false });
    expect(await opensFor(bob.id, blobId)).toBe(200);
  });

  it("keeps them open when the only holder is taken out", async () => {
    const { me, bob, shared, blobId } = await sharedPhoto();
    expect((await takeOut(bob.id, shared, me.id)).removed).toBe(true);
    expect(await opensFor(bob.id, blobId)).toBe(200);
  });

  it("never mints a second key over a thread whose photos are wrapped under the first", async () => {
    const { me, shared } = await sharedPhoto();
    await db.deleteFrom("thread_keys").where("thread_id", "=", shared).where("account_id", "=", me.id).execute();
    await db.deleteFrom("thread_members").where("thread_id", "=", shared).where("account_id", "=", me.id).execute();
    await expect(db.transaction().execute((trx) => threadKey(trx, shared))).rejects.toBeInstanceOf(NoKey);
    expect(await db.selectFrom("thread_keys").select("account_id").where("thread_id", "=", shared).execute()).toHaveLength(0);
  });

  it("survives its dumper's account in a shared thread, and goes from storage where nothing carries it", async () => {
    const me = await person();
    const bob = await person();
    const { jobId, blobIds } = await dumped(me, "", { files: ["receipt.jpg", "plain.jpg"] });
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: shared, title: "Receipt", type: "image", photo: 1 });
    await tool({ tool: "add_content", jobId, toolCallId: "c2", threadId: me.defaultThreadId, title: "Shelf", type: "image", photo: 2 });
    const [kept, gone] = blobIds as [string, string];
    const store = objectStore()!;
    expect(await store.get(objectKey(gone, "original"))).not.toBeNull();

    await deleteAccount(me.id);

    // The shared thread's photo opens for the member who stayed, with no dumper.
    const cookie = await signIn(bob.id);
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${kept}/thumb`, headers: { cookie } })).statusCode).toBe(200);
    expect((await db.selectFrom("blobs").select("account_id").where("id", "=", kept).executeTakeFirstOrThrow()).account_id).toBeNull();
    // The other was only ever theirs: on the purge clock at once, then gone.
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "blob.purge").execute()).not.toHaveLength(0);
    await handlers["blob.purge"]!({}, { mailer: null as never }, null);
    expect(await db.selectFrom("blobs").select("id").where("id", "=", gone).execute()).toHaveLength(0);
    expect(await store.get(objectKey(gone, "original"))).toBeNull();
    expect(await store.get(objectKey(kept, "original"))).not.toBeNull();
    expect(await db.selectFrom("blob_keys").select("scope").where("scope", "=", "account").where("scope_id", "=", me.id).execute()).toHaveLength(0);
  });

  it("keeps the row when the store refuses the delete", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await upload(cookie, fixture("plain.jpg"))).json().blobId as string;
    await db.updateTable("blobs").set({ deleted_at: sql`now()`, purge_after: sql`now() - interval '1 second'` }).where("id", "=", a).execute();
    const store = objectStore()!;
    const remove = store.remove;
    store.remove = async () => {
      throw new Error("r2 down");
    };
    await expect(handlers["blob.purge"]!({}, { mailer: null as never }, null)).rejects.toThrow("r2 down");
    store.remove = remove;
    expect(await db.selectFrom("blobs").select("id").where("id", "=", a).execute()).toHaveLength(1);
  });
});

describe("naming the town", () => {
  it("rounds, caches on the rounded pair, and rewrites the row's sentence", async () => {
    const me = await person();
    const { jobId, blobIds } = await dumped(me, "", { files: ["receipt.jpg", "plain.jpg"] });
    // Two photos thirty metres apart.
    await db.updateTable("blobs").set({ latitude: 38.7169, longitude: -9.1399 }).where("id", "=", blobIds[0]!).execute();
    await db.updateTable("blobs").set({ latitude: 38.71705, longitude: -9.13985 }).where("id", "=", blobIds[1]!).execute();
    const build = await thread(me.id, "Bookshelf build");
    const filed = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId: build, title: "Receipt", type: "image", photo: 1 });

    const calls: [number, number][] = [];
    const reverse = async (lat: number, lng: number) => {
      calls.push([lat, lng]);
      return "Alfama, Lisbon";
    };
    expect(await locateBlob(blobIds[0]!, reverse)).toBe("named");
    expect(await locateBlob(blobIds[1]!, reverse)).toBe("hit");
    expect(calls).toEqual([[38.717, -9.14]]);

    const row = await db.selectFrom("content").select("body").where("id", "=", filed.json().contentId).executeTakeFirstOrThrow();
    expect(row.body).toBe("Taken on 11 August in Alfama, Lisbon.");
    const cache = await db.selectFrom("place_reverse").selectAll().execute();
    expect(cache).toHaveLength(1);
    expect(JSON.stringify(cache)).not.toContain(me.id);
  });

  it("backfills a key set later, once a day per photo, and never a pair already known", async () => {
    const me = await person();
    const { blobIds } = await dumped(me, "", { files: ["receipt.jpg", "plain.jpg", "list.png"] });
    // Uploaded while the key was unset: coordinates and no town, no job.
    await db.updateTable("blobs").set({ latitude: 38.7169, longitude: -9.1399 }).where("id", "=", blobIds[0]!).execute();
    await db.updateTable("blobs").set({ latitude: 41.1579, longitude: -8.6291 }).where("id", "=", blobIds[1]!).execute();
    // And one with no coordinate at all.
    await db.updateTable("blobs").set({ latitude: null, longitude: null }).where("id", "=", blobIds[2]!).execute();
    // A pair the provider already could not name stays quiet.
    await db.insertInto("place_reverse").values({ lat: "41.158", lng: "-8.629", town: null }).execute();
    const daily = handlers["blob.daily"]!;

    // No key: the sweep is booked, nothing is located.
    await daily({}, { mailer: null as never }, null);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "blob.locate").execute()).toHaveLength(0);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "content.purge").execute()).toHaveLength(1);

    const before = { key: env.GOOGLE_MAPS_API_KEY, towns: env.PHOTO_TOWNS };
    const mutable = env as { GOOGLE_MAPS_API_KEY?: string | undefined; PHOTO_TOWNS: "on" | "off" };
    try {
      // The key alone is 006's place names, and starts nothing here.
      mutable.GOOGLE_MAPS_API_KEY = "test-key";
      await daily({}, { mailer: null as never }, null);
      expect(await db.selectFrom("jobs").select("id").where("kind", "=", "blob.locate").execute()).toHaveLength(0);
      mutable.PHOTO_TOWNS = "on";
      await daily({}, { mailer: null as never }, null);
      await daily({}, { mailer: null as never }, null);
    } finally {
      mutable.GOOGLE_MAPS_API_KEY = before.key;
      mutable.PHOTO_TOWNS = before.towns;
    }
    const jobs = await db.selectFrom("jobs").select("payload").where("kind", "=", "blob.locate").execute();
    // One photo, once, however many times the day ticks.
    expect(jobs.map((job) => (job.payload as { blobId: string }).blobId)).toEqual([blobIds[0]]);
  });
});

// The device's time zone rides on the request as a header and lands on the
// message, so the worker reads "today" and "3pm" in it. Here rather than in
// its own file because the helpers that sign in and post are here.
describe("the device's time zone on a request", () => {
  async function postDump(cookie: string, timeZone: string | undefined): Promise<string> {
    const headers: Record<string, string> = { cookie };
    if (timeZone !== undefined) headers["x-time-zone"] = timeZone;
    const res = await app.inject({
      method: "POST",
      url: "/v1/dumps",
      headers,
      payload: { text: "dentist tuesday 3pm", clientKey: uuidv7() },
    });
    expect(res.statusCode).toBe(202);
    return res.json().messageId as string;
  }

  async function zoneOf(messageId: string): Promise<string | null> {
    const row = await db.selectFrom("messages").select("time_zone").where("id", "=", messageId).executeTakeFirstOrThrow();
    return row.time_zone;
  }

  it("lands on the message as the name ICU resolves it to", async () => {
    const cookie = await signIn((await person()).id);
    expect(await zoneOf(await postDump(cookie, "Europe/Lisbon"))).toBe("Europe/Lisbon");
    // Chrome on some platforms still says Calcutta and ICU itself resolves
    // Kolkata to it; since 023 both are stored under the city's current name,
    // so the clock a phone sets and the phone's own word cannot differ by
    // spelling alone.
    expect(await zoneOf(await postDump(cookie, "Asia/Calcutta"))).toBe("Asia/Kolkata");
    expect(await zoneOf(await postDump(cookie, "Asia/Kolkata"))).toBe("Asia/Kolkata");
    expect(await zoneOf(await postDump(cookie, "utc"))).toBe("UTC");
    // A retired alias is stored as what it is now.
    expect(await zoneOf(await postDump(cookie, "US/Pacific-New"))).toBe("America/Los_Angeles");
  });

  it("is dropped, not refused, when the name is not one", async () => {
    const cookie = await signIn((await person()).id);
    expect(await zoneOf(await postDump(cookie, "Mars/Olympus"))).toBeNull();
    expect(await zoneOf(await postDump(cookie, "Europe/Lisbon; drop table messages"))).toBeNull();
    // ICU accepts an offset and resolves it to +05:00; Postgres reads that
    // sign the other way, so it never reaches the row.
    expect(await zoneOf(await postDump(cookie, "+0500"))).toBeNull();
    expect(await zoneOf(await postDump(cookie, undefined))).toBeNull();
  });

});
