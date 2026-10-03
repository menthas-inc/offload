// 036. A storage limit per account, and deleting a photo gives its room back.
//
// AC-1   an upload past the limit is refused, stores nothing, and is recorded.
// AC-2   the limit is a cap: a default, a setting, a per-person value.
// AC-3   what counts: kept originals of every kind, claimed or not.
// AC-5   a photo in a shared thread counts against its uploader only.
// AC-6   deleting a photo row as its uploader takes the photo, Undo brings it back.
// AC-7   deleting a thread you are alone in takes the photos you dumped there.
// AC-8   every other path does to the photo what it did before.
// AC-9   a deleted photo is never filed again.
// AC-10  GET /api/me/storage.

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
import { clearSettingsCache, settingDef } from "../src/settings.js";
import { takeDump } from "../src/routes/dumps.js";
import { deleteContent, deleteThread, restoreThread, setArchived } from "../src/routes/threads.js";
import { objectKey, objectStore, resetObjectStore } from "../src/blobs/store.js";
import { storageUsed } from "../src/blobs/storage.js";
import { handlers } from "../src/jobs/handlers.js";
import { takeOut } from "../src/threads/sharing.js";

await migrate(() => {});

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/photos");
const fixture = (name: string) => readFileSync(join(FIXTURES, name));
const GIB = 1024 * 1024 * 1024;

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
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("limit_hits").execute();
  await db.deleteFrom("account_limits").execute();
  await db.deleteFrom("app_settings").where("key", "like", "cap.%").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
  clearSettingsCache();
});

async function person(): Promise<{ id: string; defaultThreadId: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
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

async function thread(accountId: string, name: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

async function addMember(accountId: string, threadId: string): Promise<void> {
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state: "accepted" }).execute();
}

async function upload(cookie: string, file = fixture("plain.jpg")) {
  const data = new FormData();
  data.append("clientKey", uuidv7());
  data.append("file", new Blob([new Uint8Array(file)], { type: "image/jpeg" }), "photo.jpg");
  return app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: data });
}

/** A header the audio sniff recognises, then padding. */
function m4a(size = 4096): Buffer {
  const bytes = Buffer.alloc(size, 0x11);
  bytes.writeUInt32BE(24, 0);
  bytes.write("ftypM4A ", 4, "latin1");
  return bytes;
}

async function uploadVoice(cookie: string) {
  const data = new FormData();
  data.append("clientKey", uuidv7());
  data.append("durationMs", "14000");
  data.append("waveform", JSON.stringify(Array.from({ length: 32 }, () => 10)));
  data.append("file", new Blob([new Uint8Array(m4a())], { type: "audio/mp4" }), "note.m4a");
  return app.inject({ method: "POST", url: "/v1/blobs/audio", headers: { cookie }, payload: data });
}

/** The account's own value for the cap, which is how a test sets it small. */
async function limitOf(accountId: string, bytes: number): Promise<void> {
  await db.insertInto("account_limits").values({ account_id: accountId, key: "cap.storage_bytes", value: bytes }).execute();
  clearSettingsCache();
}

/** Bytes already kept, written straight in. */
async function kept(accountId: string, bytes: number, opts: { kind?: "image" | "audio"; deleted?: boolean } = {}): Promise<void> {
  const audio = opts.kind === "audio";
  await db
    .insertInto("blobs")
    .values({
      account_id: accountId,
      client_key: uuidv7(),
      kind: audio ? "audio" : "image",
      content_type: audio ? "audio/mp4" : "image/jpeg",
      byte_size: bytes,
      width: audio ? null : 1,
      height: audio ? null : 1,
      duration_ms: audio ? 1000 : null,
      waveform: audio ? Array.from({ length: 32 }, () => 0) : null,
      sha256: Buffer.alloc(32),
      // A day old, so the daily caps never stand in for this one.
      created_at: sql`now() - interval '2 days'`,
      ...(opts.deleted ? { deleted_at: sql`now()`, purge_after: sql`now()` } : {}),
    })
    .execute();
}

const internal = { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` };
const tool = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/tool-call", headers: internal, payload });
const turnResult = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/turn-result", headers: internal, payload });
const goodUsage = [{ model: "claude-sonnet-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, costMicros: 1, latencyMs: 1 }];

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

/** A photo dumped and filed as a row in the thread given. */
async function filed(me: { id: string }, threadId: string) {
  const cookie = await signIn(me.id);
  const res = await upload(cookie);
  expect(res.statusCode).toBe(201);
  const blobId = res.json().blobId as string;
  const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [blobId], viaShare: false });
  const jobId = await jobOf(sent.messageId);
  const added = await tool({ tool: "add_content", jobId, toolCallId: "c1", threadId, title: "Receipt", type: "image", photo: 1 });
  expect(added.json().ok).toBe(true);
  return { blobId, contentId: added.json().contentId as string, jobId, messageId: sent.messageId };
}

const blobRow = (id: string) => db.selectFrom("blobs").select(["deleted_at", "purge_after"]).where("id", "=", id).executeTakeFirst();

/** Past the eight seconds, the way the purge sees them. */
async function pastTheWindow(): Promise<void> {
  await db.updateTable("content").set({ purge_after: sql`now() - interval '1 second'` }).where("deleted_at", "is not", null).execute();
  await db.updateTable("threads").set({ purge_after: sql`now() - interval '1 second'` }).where("deleted_at", "is not", null).execute();
  await db.updateTable("blobs").set({ purge_after: sql`now() - interval '1 second'` }).where("deleted_at", "is not", null).execute();
  await handlers["content.purge"]!({}, { mailer: null as never }, null);
  await handlers["blob.purge"]!({}, { mailer: null as never }, null);
}

describe("the limit", () => {
  it("is a cap of 1 GiB by default", () => {
    expect(settingDef("cap.storage_bytes")).toMatchObject({ kind: "int", default: GIB });
  });

  it("refuses a photo that would pass it, stores nothing, and writes the refusal down", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const size = fixture("plain.jpg").length;
    await limitOf(me.id, 2 * 1024 * 1024);
    await kept(me.id, 2 * 1024 * 1024 - size);

    // Exactly at the limit fits.
    expect((await upload(cookie)).statusCode).toBe(201);
    const before = await db.selectFrom("blobs").select("id").execute();

    const refused = await upload(cookie);
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: "storage_full" });
    expect(await db.selectFrom("blobs").select("id").execute()).toHaveLength(before.length);
    const hits = await db.selectFrom("limit_hits").select(["cap", "scope", "count"]).where("account_id", "=", me.id).execute();
    expect(hits).toEqual([{ cap: "cap.storage_bytes", scope: "account", count: 1 }]);
  });

  it("refuses a voice note the same way", async () => {
    const me = await person();
    await limitOf(me.id, 1024 * 1024);
    await kept(me.id, 1024 * 1024 - 100);
    const res = await uploadVoice(await signIn(me.id));
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "storage_full" });
  });

  it("holds the owner's setting for everyone without their own value", async () => {
    const me = await person();
    await db.insertInto("app_settings").values({ key: "cap.storage_bytes", value: String(1024 * 1024), updated_by_account_id: null }).execute();
    clearSettingsCache();
    await kept(me.id, 1024 * 1024);
    expect((await upload(await signIn(me.id))).statusCode).toBe(429);
  });

  it("answers a retried client key as before, without counting it twice", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const size = fixture("plain.jpg").length;
    await limitOf(me.id, 1024 * 1024);
    await kept(me.id, 1024 * 1024 - size);
    const data = () => {
      const form = new FormData();
      form.append("clientKey", "same");
      form.append("file", new Blob([new Uint8Array(fixture("plain.jpg"))], { type: "image/jpeg" }), "photo.jpg");
      return form;
    };
    const first = await app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: data() });
    const again = await app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: data() });
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.json().blobId).toBe(first.json().blobId);
  });
});

describe("what counts", () => {
  it("is every kept original of the account's, claimed or not, and nothing deleted", async () => {
    const me = await person();
    const other = await person();
    await kept(me.id, 1000);
    await kept(me.id, 200, { kind: "audio" });
    await kept(me.id, 5000, { deleted: true });
    await kept(other.id, 7000);
    const cookie = await signIn(me.id);
    const unclaimed = await upload(cookie);
    expect(unclaimed.statusCode).toBe(201);
    expect(await storageUsed(me.id)).toBe(1200 + fixture("plain.jpg").length);
  });

  it("counts a photo in a shared thread against its uploader only", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    await filed(me, shared);
    expect(await storageUsed(me.id)).toBe(fixture("plain.jpg").length);
    expect(await storageUsed(bob.id)).toBe(0);
  });
});

describe("leaving a shared thread", () => {
  it("stops what you left there counting against you, and Undo puts it back", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    await filed(me, shared);
    const size = fixture("plain.jpg").length;
    expect(await storageUsed(me.id)).toBe(size);

    await deleteThread(me.id, shared);
    expect(await storageUsed(me.id)).toBe(0);
    expect(await storageUsed(bob.id)).toBe(0);
    await restoreThread(me.id, shared);
    expect(await storageUsed(me.id)).toBe(size);
  });

  it("does the same when you are taken out", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    await filed(me, shared);
    await takeOut(bob.id, shared, me.id);
    expect(await storageUsed(me.id)).toBe(0);
  });

  it("still counts a photo you also filed in a thread you are in", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    const { blobId } = await filed(me, shared);
    const mine = await thread(me.id, "Mine");
    const row = await db
      .insertInto("content")
      .values({ account_id: me.id, thread_id: mine, type: "image", title: "Copy", source: "person", updated_at: sql`now()` })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("content_blobs").values({ content_id: row.id, blob_id: blobId }).execute();
    await deleteThread(me.id, shared);
    expect(await storageUsed(me.id)).toBe(fixture("plain.jpg").length);
  });
});

describe("GET /api/me/storage", () => {
  it("is the signed-in account's used and limit, and 401 without a session", async () => {
    const me = await person();
    await kept(me.id, 1234);
    await limitOf(me.id, 5 * 1024 * 1024);
    const res = await app.inject({ method: "GET", url: "/api/me/storage", headers: { cookie: await signIn(me.id) } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ usedBytes: 1234, limitBytes: 5 * 1024 * 1024 });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ method: "GET", url: "/api/me/storage" })).statusCode).toBe(401);
  });
});

describe("deleting a photo row", () => {
  it("takes the photo on the row's clock, gives the room back at once, and destroys the file after", async () => {
    const me = await person();
    const { blobId, contentId } = await filed(me, me.defaultThreadId);
    expect(await deleteContent(me.id, contentId)).toBe(true);

    const row = await blobRow(blobId);
    expect(row!.deleted_at).not.toBeNull();
    const content = await db.selectFrom("content").select("purge_after").where("id", "=", contentId).executeTakeFirstOrThrow();
    expect(row!.purge_after!.getTime()).toBe(content.purge_after!.getTime());
    expect(await storageUsed(me.id)).toBe(0);

    await pastTheWindow();
    expect(await blobRow(blobId)).toBeUndefined();
    expect(await objectStore()!.get(objectKey(blobId, "original"))).toBeNull();
  });

  it("leaves a photo-only dump nothing to draw, so its turn leaves the conversation", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const { contentId, messageId, jobId } = await filed(me, me.defaultThreadId);
    // The reply under it, which names the photo that is going.
    expect((await turnResult({ outcome: "answered", jobId, replyText: "Saved the receipt.", usage: goodUsage })).statusCode).toBe(200);
    const reply = await db.selectFrom("messages").select("id").where("role", "=", "offload").executeTakeFirstOrThrow();
    const words = await takeDump(me.id, "shelf brackets", uuidv7());
    const before = (await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie } })).json();
    expect(before.messages.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining([messageId, reply.id]));

    await deleteContent(me.id, contentId);
    const after = (await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie } })).json();
    const ids = after.messages.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(messageId);
    expect(ids).not.toContain(reply.id);
    expect(ids).toContain(words.messageId);
  });

  it("is put back by Undo", async () => {
    const me = await person();
    const { blobId, contentId } = await filed(me, me.defaultThreadId);
    await deleteContent(me.id, contentId);
    await setArchived(me.id, contentId, false);
    expect(await blobRow(blobId)).toEqual({ deleted_at: null, purge_after: null });
    expect(await storageUsed(me.id)).toBe(fixture("plain.jpg").length);
  });

  // The owner, 2026-10-04: what somebody left in a thread is the thread's,
  // so a member deleting it frees the file, as any delete does.
  it("takes the photo when a member deletes a row its uploader left behind", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    const { blobId, contentId } = await filed(me, shared);
    // I leave; the row is the thread's now (OFF-3), and Bob may delete it.
    await deleteThread(me.id, shared);
    await db.updateTable("thread_members").set({ left_at: sql`now() - interval '1 hour'` }).where("account_id", "=", me.id).execute();
    expect(await deleteContent(bob.id, contentId)).toBe(true);
    expect((await blobRow(blobId))!.deleted_at).not.toBeNull();
  });

  it("leaves the photo alone when the uploader is still in the thread", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    const { blobId, contentId } = await filed(me, shared);
    // Not Bob's to delete while I am here (OFF-3), and nothing moves.
    await expect(deleteContent(bob.id, contentId)).rejects.toThrow();
    expect((await blobRow(blobId))!.deleted_at).toBeNull();
  });

  it("does not touch the photo on archive", async () => {
    const me = await person();
    const { blobId, contentId } = await filed(me, me.defaultThreadId);
    await setArchived(me.id, contentId, true);
    expect((await blobRow(blobId))!.deleted_at).toBeNull();
  });

  it("is never filed again by the settle", async () => {
    const me = await person();
    const { contentId, jobId, messageId } = await filed(me, me.defaultThreadId);
    await deleteContent(me.id, contentId);
    await pastTheWindow();
    const res = await turnResult({ outcome: "answered", jobId, usage: goodUsage });
    expect(res.statusCode).toBe(200);
    const rows = await db.selectFrom("content").select("id").where("derived_from_message_id", "=", messageId).execute();
    expect(rows).toHaveLength(0);
  });
});

describe("the purge", () => {
  // Security review of the spec: the delete's decision is advisory, and a
  // live row carrying the photo at purge time is the authority.
  it("never destroys a photo a live row still carries, and puts it back", async () => {
    const me = await person();
    const { blobId } = await filed(me, me.defaultThreadId);
    await db.updateTable("blobs").set({ deleted_at: sql`now()`, purge_after: sql`now() - interval '1 second'` }).where("id", "=", blobId).execute();
    await handlers["blob.purge"]!({}, { mailer: null as never }, null);
    expect(await blobRow(blobId)).toEqual({ deleted_at: null, purge_after: null });
    expect(await objectStore()!.get(objectKey(blobId, "original"))).not.toBeNull();
  });
});

describe("deleting a thread you are alone in", () => {
  it("takes the photos you dumped there, and Undo brings them back", async () => {
    const me = await person();
    const build = await thread(me.id, "Bookshelf build");
    const { blobId } = await filed(me, build);
    expect(await deleteThread(me.id, build)).toEqual({ left: true, deleted: true });
    expect((await blobRow(blobId))!.deleted_at).not.toBeNull();
    expect(await storageUsed(me.id)).toBe(0);

    expect(await restoreThread(me.id, build)).toBe(true);
    expect(await blobRow(blobId)).toEqual({ deleted_at: null, purge_after: null });
  });

  it("destroys them once the thread is purged", async () => {
    const me = await person();
    const build = await thread(me.id, "Bookshelf build");
    const { blobId } = await filed(me, build);
    await deleteThread(me.id, build);
    await pastTheWindow();
    expect(await blobRow(blobId)).toBeUndefined();
    expect(await objectStore()!.get(objectKey(blobId, "original"))).toBeNull();
  });

  it("takes a photo somebody who left dumped there, which is the thread's now", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    const { blobId } = await filed(bob, shared);
    await deleteThread(bob.id, shared);
    await db.updateTable("thread_members").set({ left_at: sql`now() - interval '1 hour'` }).where("account_id", "=", bob.id).execute();
    expect(await deleteThread(me.id, shared)).toEqual({ left: true, deleted: true });
    expect((await blobRow(blobId))!.deleted_at).not.toBeNull();
  });

  // Security review of the build: a blob.purge that runs before the purge
  // that takes the thread's rows must not put the photos back, or nothing
  // ever destroys them.
  it("destroys them even when the photo purge runs before the thread's rows go", async () => {
    const me = await person();
    const build = await thread(me.id, "Bookshelf build");
    const { blobId } = await filed(me, build);
    await deleteThread(me.id, build);
    await db.updateTable("blobs").set({ purge_after: sql`now() - interval '1 second'` }).where("id", "=", blobId).execute();
    await handlers["blob.purge"]!({}, { mailer: null as never }, null);
    expect(await blobRow(blobId)).toBeUndefined();
    expect(await objectStore()!.get(objectKey(blobId, "original"))).toBeNull();
  });

  it("keeps the thread itself for as long as its Undo is offered", async () => {
    const me = await person();
    const build = await thread(me.id, "Bookshelf build");
    await deleteThread(me.id, build);
    const row = await db.selectFrom("threads").select(["deleted_at", "purge_after"]).where("id", "=", build).executeTakeFirstOrThrow();
    expect(row.purge_after!.getTime() - row.deleted_at!.getTime()).toBeGreaterThanOrEqual(15_000);
  });

  it("does nothing to the photos when others are still in it", async () => {
    const me = await person();
    const bob = await person();
    const shared = await thread(me.id, "Flat admin");
    await addMember(bob.id, shared);
    const { blobId } = await filed(me, shared);
    expect(await deleteThread(me.id, shared)).toEqual({ left: true, deleted: false });
    expect((await blobRow(blobId))!.deleted_at).toBeNull();
  });
});
