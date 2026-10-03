// 021. Voice notes: the bytes in, the claim, the transcript, the wire, the
// playback, the forget, and the one thing every 020 reader had to learn.
//
// AC-5   a message carrying a voice note is of type voice.
// AC-6   the server refuses by bytes and by header, and the day's ceiling.
// AC-9   nothing is written until the note is claimed.
// AC-10  a repeated client key stores nothing twice.
// AC-11  the waveform is stored, bounded, and drawn from the wire.
// AC-12  the event carries the kind, the seconds and the bytes, never the words.
// AC-13  the transcript is a field beside the words; search reads both.
// AC-16  the provider's reference is held from submission.
// AC-18  a failed turn resumes with the open question.
// AC-22  a voice note is never a photo to the end-of-turn filing, and has no wrap.
// AC-24  the dumper alone hears it, with Range; a thread member does not.
// AC-27  the delete at the provider is asked for, and asked again by the sweep.
//
// The server never decodes audio, so a fixture is a header and padding.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { clearSettingsCache } from "../src/settings.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { takeDump, BadBlobMix } from "../src/routes/dumps.js";
import { objectKey, objectStore, resetObjectStore } from "../src/blobs/store.js";
import { objectKeyOf } from "../src/blobs/keys.js";
import { unwrap } from "../src/crypto/keys.js";
import { handlers } from "../src/jobs/handlers.js";
import { pendingEmbeds } from "../src/search/sweep.js";
import { MAX_AUDIO_BYTES, parseWaveform, sniffAudio } from "../src/blobs/audio.js";

await migrate(() => {});

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
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("message_chunks").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

/** A header the sniff recognises, then padding, since nothing decodes it. */
function audio(kind: "m4a" | "webm" | "ogg" | "heic" | "jpeg", size = 4096): Buffer {
  const bytes = Buffer.alloc(size, 0x11);
  if (kind === "m4a") {
    bytes.writeUInt32BE(24, 0);
    bytes.write("ftypM4A ", 4, "latin1");
  } else if (kind === "heic") {
    bytes.writeUInt32BE(24, 0);
    bytes.write("ftypheic", 4, "latin1");
  } else if (kind === "webm") {
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(bytes, 0);
  } else if (kind === "ogg") {
    bytes.write("OggS", 0, "latin1");
  } else {
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(bytes, 0);
  }
  return bytes;
}

const BARS = Array.from({ length: 32 }, (_, i) => (i * 8) % 256);

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

function voiceForm(file: Buffer, opts: { clientKey?: string; durationMs?: unknown; waveform?: unknown; type?: string } = {}): FormData {
  const data = new FormData();
  data.append("clientKey", opts.clientKey ?? uuidv7());
  data.append("durationMs", String(opts.durationMs ?? 14_000));
  data.append("waveform", typeof opts.waveform === "string" ? opts.waveform : JSON.stringify(opts.waveform ?? BARS));
  data.append("file", new Blob([new Uint8Array(file)], { type: opts.type ?? "audio/mp4" }), "note.m4a");
  return data;
}

async function uploadVoice(cookie: string, file: Buffer, opts: Parameters<typeof voiceForm>[1] = {}) {
  return app.inject({ method: "POST", url: "/v1/blobs/audio", headers: { cookie }, payload: voiceForm(file, opts) });
}

function photoForm(clientKey = uuidv7()): FormData {
  const data = new FormData();
  data.append("clientKey", clientKey);
  data.append("file", new Blob([new Uint8Array(PHOTO)], { type: "image/png" }), "shot.png");
  return data;
}

/** A 1 by 1 PNG, the smallest photo the photo route takes. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function uploadPhoto(cookie: string) {
  return app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: photoForm() });
}

async function jobOf(messageId: string, kind = "dump.answer"): Promise<string> {
  const rows = await db.selectFrom("jobs").select(["id", "payload"]).where("kind", "=", kind as "dump.answer").execute();
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
const turnResult = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/turn-result", headers: internal, payload });
const goodUsage = [{ model: "claude-sonnet-5", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, costMicros: 1, latencyMs: 1 }];

/** A voice note uploaded and claimed by a dump. The common start. */
async function spoken(me: { id: string; defaultThreadId: string }, text = "", opts: { threadId?: string; photo?: boolean } = {}) {
  const cookie = await signIn(me.id);
  const res = await uploadVoice(cookie, audio("m4a"));
  expect(res.statusCode).toBe(201);
  const voiceId = res.json().blobId as string;
  const blobIds = [voiceId];
  if (opts.photo) {
    const shot = await uploadPhoto(cookie);
    expect(shot.statusCode).toBe(201);
    blobIds.push(shot.json().blobId);
  }
  const sent = await takeDump(me.id, text, uuidv7(), opts.threadId, { blobIds, viaShare: false });
  const jobId = await jobOf(sent.messageId);
  return { cookie, voiceId, blobIds, ...sent, jobId };
}

async function transcribe(jobId: string, messageId: string, text: string, durationMs = 14_000) {
  return app.inject({
    method: "POST",
    url: `/internal/v1/messages/${messageId}/transcript`,
    headers: internal,
    payload: { jobId, text, durationMs, costMicros: 35, latencyMs: 2100 },
  });
}

describe("the sniff", () => {
  it("names the three containers and nothing else, without decoding", () => {
    expect(sniffAudio(audio("m4a"))).toBe("audio/mp4");
    expect(sniffAudio(audio("webm"))).toBe("audio/webm");
    expect(sniffAudio(audio("ogg"))).toBe("audio/ogg");
    expect(sniffAudio(audio("heic"))).toBeNull();
    expect(sniffAudio(audio("jpeg"))).toBeNull();
    expect(sniffAudio(Buffer.alloc(4))).toBeNull();
  });

  it("takes exactly thirty two bars in range", () => {
    expect(parseWaveform(JSON.stringify(BARS))).toEqual(BARS);
    expect(parseWaveform(JSON.stringify([...BARS, 1]))).toBeNull();
    expect(parseWaveform(JSON.stringify(BARS.map(() => 300)))).toBeNull();
    expect(parseWaveform("not json")).toBeNull();
    expect(parseWaveform(undefined)).toBeNull();
  });
});

describe("the upload", () => {
  // 034. The day's ceiling is its setting, and a refusal is written down.
  it("holds the ceiling an owner set, by count and by length, and records each refusal", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    await db.insertInto("app_settings").values({ key: "cap.voice_notes", value: "1", updated_by_account_id: null }).execute();
    clearSettingsCache();
    expect((await uploadVoice(cookie, audio("m4a"))).statusCode).toBe(201);
    const second = await uploadVoice(cookie, audio("m4a"));
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: "daily_limit", scope: "account" });

    await db.deleteFrom("app_settings").execute();
    await db.insertInto("app_settings").values({ key: "cap.voice_ms", value: "60000", updated_by_account_id: null }).execute();
    clearSettingsCache();
    expect((await uploadVoice(cookie, audio("m4a"), { durationMs: 50_000 })).statusCode).toBe(429);

    const hits = await db.selectFrom("limit_hits").select(["cap", "scope", "count"]).where("account_id", "=", me.id).orderBy("cap").execute();
    expect(hits).toEqual([
      { cap: "cap.voice_ms", scope: "account", count: 1 },
      { cap: "cap.voice_notes", scope: "account", count: 1 },
    ]);
    await db.deleteFrom("app_settings").execute();
    clearSettingsCache();
  });

  it("stores an M4A encrypted as a voice note with no dimensions, its length and its bars", async () => {
    const me = await person();
    const res = await uploadVoice(await signIn(me.id), audio("m4a"));
    expect(res.statusCode).toBe(201);
    const { blobId } = res.json();
    expect(Object.keys(res.json())).toEqual(["blobId"]);

    const sealed = await objectStore()!.get(objectKey(blobId, "original"));
    expect(sealed).not.toBeNull();
    expect(sealed!.subarray(4, 8).toString("latin1")).not.toBe("ftyp");
    const key = await db.transaction().execute((trx) => objectKeyOf(trx, blobId));
    expect(unwrap(sealed!, key).equals(audio("m4a"))).toBe(true);

    const row = await db.selectFrom("blobs").selectAll().where("id", "=", blobId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ kind: "audio", content_type: "audio/mp4", width: null, height: null, duration_ms: 14_000, message_id: null, name: null });
    expect(row.waveform).toEqual(BARS);
  });

  it("takes WebM and Ogg by their headers, and refuses a JPEG named note.m4a and a HEIC by its brand", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    expect((await uploadVoice(cookie, audio("webm"), { type: "audio/webm" })).statusCode).toBe(201);
    expect((await uploadVoice(cookie, audio("ogg"), { type: "audio/ogg" })).statusCode).toBe(201);
    const jpeg = await uploadVoice(cookie, audio("jpeg"));
    expect(jpeg.statusCode).toBe(415);
    expect(jpeg.json()).toEqual({ error: "not_a_voice_note" });
    expect((await uploadVoice(cookie, audio("heic"))).statusCode).toBe(415);
    expect(await db.selectFrom("blobs").select("id").execute()).toHaveLength(2);
  });

  it("refuses over ten megabytes, a long declared length and a wrong waveform, writing nothing", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    expect((await uploadVoice(cookie, audio("m4a", MAX_AUDIO_BYTES + 1))).statusCode).toBe(413);
    expect((await uploadVoice(cookie, audio("m4a"), { durationMs: 600_001 })).statusCode).toBe(400);
    expect((await uploadVoice(cookie, audio("m4a"), { waveform: [...BARS, 1] })).statusCode).toBe(400);
    expect(await db.selectFrom("blobs").select("id").execute()).toHaveLength(0);
    expect(await objectStore()!.get(objectKey("any", "original"))).toBeNull();
  });

  it("returns the same id for a repeated key and stores nothing twice", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const clientKey = uuidv7();
    const first = await uploadVoice(cookie, audio("m4a"), { clientKey });
    const second = await uploadVoice(cookie, audio("m4a"), { clientKey });
    expect(second.json().blobId).toBe(first.json().blobId);
    expect(await db.selectFrom("blobs").select("id").execute()).toHaveLength(1);
  });

  it("holds the day's ceiling by count, by declared length, and by measured length once there is one", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    // Sixty minutes declared across six notes at the ten-minute cap.
    for (let i = 0; i < 6; i += 1) {
      expect((await uploadVoice(cookie, audio("m4a"), { durationMs: 10 * 60_000 })).statusCode).toBe(201);
    }
    const over = await uploadVoice(cookie, audio("m4a"), { durationMs: 1000 });
    expect(over.statusCode).toBe(429);
    expect(over.json()).toEqual({ error: "daily_limit", scope: "account" });

    // The provider measured them shorter than declared: room again.
    await db.updateTable("blobs").set({ measured_ms: 60_000 }).where("account_id", "=", me.id).execute();
    expect((await uploadVoice(cookie, audio("m4a"), { durationMs: 1000 })).statusCode).toBe(201);

    // And by count.
    await db.updateTable("blobs").set({ measured_ms: 10, duration_ms: 10 }).where("account_id", "=", me.id).execute();
    for (let i = 7; i < 100; i += 1) {
      await db
        .insertInto("blobs")
        .values({ account_id: me.id, client_key: uuidv7(), kind: "audio", content_type: "audio/mp4", byte_size: 10, duration_ms: 10, waveform: BARS, sha256: Buffer.alloc(32) })
        .execute();
    }
    expect((await uploadVoice(cookie, audio("m4a"), { durationMs: 10 })).statusCode).toBe(429);
  });

  it("does not count against the photo ceiling, and a photo does not count against this one", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    for (let i = 0; i < 200; i += 1) {
      await db
        .insertInto("blobs")
        .values({ account_id: me.id, client_key: uuidv7(), kind: "image", content_type: "image/png", byte_size: 10, width: 1, height: 1, sha256: Buffer.alloc(32) })
        .execute();
    }
    expect((await uploadPhoto(cookie)).statusCode).toBe(429);
    expect((await uploadVoice(cookie, audio("m4a"))).statusCode).toBe(201);
  });
});

describe("the dump", () => {
  it("types the message voice with the words kept as text, and refuses a second voice note or an eleventh photo", async () => {
    const me = await person();
    const { messageId, voiceId } = await spoken(me, "the brackets");
    const message = await db.selectFrom("messages").selectAll().where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(message).toMatchObject({ type: "voice", text: "the brackets", transcript: null, transcribed_at: null });
    const blob = await db.selectFrom("blobs").select("message_id").where("id", "=", voiceId).executeTakeFirstOrThrow();
    expect(blob.message_id).toBe(messageId);

    const cookie = await signIn(me.id);
    const a = (await uploadVoice(cookie, audio("m4a"))).json().blobId;
    const b = (await uploadVoice(cookie, audio("m4a"))).json().blobId;
    await expect(takeDump(me.id, "", uuidv7(), undefined, { blobIds: [a, b], viaShare: false })).rejects.toBeInstanceOf(BadBlobMix);
    expect(await db.selectFrom("messages").select("id").where("account_id", "=", me.id).execute()).toHaveLength(1);
  });

  it("refuses two voice notes on the route as 409, and a body of nothing but a voice note is a dump", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const a = (await uploadVoice(cookie, audio("m4a"))).json().blobId;
    const b = (await uploadVoice(cookie, audio("m4a"))).json().blobId;
    const two = await app.inject({ method: "POST", url: "/v1/dumps", headers: { cookie }, payload: { text: "", blobIds: [a, b] } });
    expect(two.statusCode).toBe(409);
    expect(two.json()).toEqual({ error: "one_voice_note" });
    const one = await app.inject({ method: "POST", url: "/v1/dumps", headers: { cookie }, payload: { text: "", blobIds: [a] } });
    expect(one.statusCode).toBe(202);
  });

  it("puts the voice note on the wire apart from the words, with photos empty for it, and the event carries no bars", async () => {
    const me = await person();
    const { messageId, voiceId, cookie } = await spoken(me, "the brackets");
    const read = await app.inject({ method: "GET", url: `/v1/messages/${messageId}`, headers: { cookie } });
    expect(read.statusCode).toBe(200);
    expect(read.json().text).toBe("the brackets");
    expect(read.json().photos).toEqual([]);
    expect(read.json().voice).toEqual({ blobId: voiceId, durationMs: 14_000, waveform: BARS, transcript: null, transcribed: false });

    const tail = await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie } });
    const mine = tail.json().messages.find((m: { id: string }) => m.id === messageId);
    expect(mine.voice.blobId).toBe(voiceId);

    const event = await db.selectFrom("analytics_events").select("properties").where("name", "=", "dump_sent").executeTakeFirstOrThrow();
    expect(event.properties).toEqual({ photos: 0, photo_bytes: 0, via_share: false, voice: true, voice_seconds: 14, voice_bytes: 4096 });
    expect(JSON.stringify(event.properties)).not.toContain("waveform");
  });
});

describe("the transcript", () => {
  it("is written beside the words, measures the note, writes the ledger and asks for the forget", async () => {
    const me = await person();
    const { messageId, voiceId, jobId, cookie } = await spoken(me, "these ones");
    const submitted = await app.inject({
      method: "POST",
      url: `/internal/v1/blobs/${voiceId}/submitted`,
      headers: internal,
      payload: { jobId, providerRef: "tr_abc123" },
    });
    expect(submitted.statusCode).toBe(200);
    expect((await db.selectFrom("blobs").select("provider_ref").where("id", "=", voiceId).executeTakeFirstOrThrow()).provider_ref).toBe("tr_abc123");

    const res = await transcribe(jobId, messageId, "for the shelves in the hallway", 13_400);
    expect(res.statusCode).toBe(200);
    const message = await db.selectFrom("messages").selectAll().where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(message.transcript).toBe("for the shelves in the hallway");
    expect(message.transcribed_at).not.toBeNull();
    expect(message.text).toBe("these ones");
    expect((await db.selectFrom("blobs").select("measured_ms").where("id", "=", voiceId).executeTakeFirstOrThrow()).measured_ms).toBe(13_400);

    const ledger = await db.selectFrom("llm_usage").selectAll().where("account_id", "=", me.id).execute();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ model: "assemblyai", latency_ms: 2100, input_tokens: 0, job_kind: "dump.answer" });
    expect(Number(ledger[0]!.cost_micros)).toBe(35);

    const forgets = await db.selectFrom("jobs").select("payload").where("kind", "=", "voice.forget").execute();
    expect(forgets).toEqual([{ payload: { blobId: voiceId } }]);

    // The wire draws both apart, and search reads both.
    const read = await app.inject({ method: "GET", url: `/v1/messages/${messageId}`, headers: { cookie } });
    expect(read.json().voice).toMatchObject({ transcript: "for the shelves in the hallway", transcribed: true, durationMs: 13_400 });
    const found = await db
      .selectFrom("messages")
      .select("id")
      .where("id", "=", messageId)
      .where(sql<boolean>`search_text @@ plainto_tsquery('simple', 'hallway')`)
      .execute();
    expect(found).toHaveLength(1);
    const both = await db
      .selectFrom("messages")
      .select("id")
      .where("id", "=", messageId)
      .where(sql<boolean>`search_text @@ plainto_tsquery('simple', 'these hallway')`)
      .execute();
    expect(both).toHaveLength(1);

    // The forget lands and the reference goes.
    const forgetJob = (await db.selectFrom("jobs").select("id").where("kind", "=", "voice.forget").executeTakeFirstOrThrow()).id;
    const forgotten = await app.inject({
      method: "POST",
      url: `/internal/v1/blobs/${voiceId}/forgotten`,
      headers: internal,
      payload: { jobId: forgetJob },
    });
    expect(forgotten.statusCode).toBe(200);
    expect((await db.selectFrom("blobs").select("provider_ref").where("id", "=", voiceId).executeTakeFirstOrThrow()).provider_ref).toBeNull();
  });

  it("refuses a transcript past its bound with a reply that does not echo it, and one for a message with no voice note", async () => {
    const me = await person();
    const { messageId, jobId } = await spoken(me);
    const long = "x".repeat(20_001);
    const res = await transcribe(jobId, messageId, long);
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain(long);
    expect(res.body).not.toContain("xxxxxxxxxx");

    const other = await app.inject({
      method: "POST",
      url: `/internal/v1/messages/${uuidv7()}/transcript`,
      headers: internal,
      payload: { jobId, text: "hello", durationMs: 1000 },
    });
    expect(other.statusCode).toBe(404);
  });

  it("is what the embed sweep indexes: not before it exists, again after it lands beside typed words", async () => {
    const me = await person();
    const { messageId, jobId } = await spoken(me);
    // A voice-only message waits for its words.
    expect((await pendingEmbeds()).map((p) => p.rowId)).not.toContain(messageId);
    await transcribe(jobId, messageId, "call the plumber");
    const after = (await pendingEmbeds()).find((p) => p.rowId === messageId);
    expect(after?.kind).toBe("embed.message");

    // Typed words with a note: swept at send, and again once the transcript lands.
    const { messageId: withWords, jobId: job2 } = await spoken(me, "also");
    const first = (await pendingEmbeds()).find((p) => p.rowId === withWords);
    expect(first?.kind).toBe("embed.message");
    await db
      .insertInto("message_chunks")
      .values({ message_id: withWords, account_id: me.id, role: "person", ord: 0, text: "also", model: "voyage-4", embedded_at: sql`now() - interval '1 minute'` })
      .execute();
    await transcribe(job2, withWords, "ask about the boiler");
    const again = (await pendingEmbeds()).find((p) => p.rowId === withWords);
    expect(again).toBeDefined();
    const transcribedAt = (await db.selectFrom("messages").select("transcribed_at").where("id", "=", withWords).executeTakeFirstOrThrow()).transcribed_at!;
    // Postgres rounds the epoch to a bigint; so does this.
    expect(again?.version).toBe(String(Math.round(transcribedAt.getTime() / 1000)));
  });
});

describe("never a photo", () => {
  it("files exactly one photo row for a message with a photo and a voice note, and the audio gets no row and no wrap", async () => {
    const me = await person();
    const { messageId, voiceId, jobId, blobIds } = await spoken(me, "", { photo: true });
    const photoId = blobIds.find((id) => id !== voiceId)!;
    const res = await turnResult({ outcome: "answered", jobId, usage: goodUsage });
    expect(res.statusCode).toBe(200);
    const rows = await db.selectFrom("content").select(["title", "type"]).where("derived_from_message_id", "=", messageId).execute();
    expect(rows).toEqual([{ title: "A photo", type: "image" }]);
    const links = await db.selectFrom("content_blobs").select("blob_id").execute();
    expect(links).toEqual([{ blob_id: photoId }]);
    const wraps = await db.selectFrom("blob_keys").select("scope").where("blob_id", "=", voiceId).execute();
    expect(wraps).toEqual([{ scope: "account" }]);
  });
});

describe("hearing it back", () => {
  it("serves the bytes to the dumper with Range, and to nobody else, and never a photo on this route", async () => {
    const me = await person();
    const { voiceId, cookie, blobIds, messageId, jobId } = await spoken(me, "", { photo: true });
    const whole = await app.inject({ method: "GET", url: `/v1/blobs/${voiceId}/audio`, headers: { cookie } });
    expect(whole.statusCode).toBe(200);
    expect(whole.headers["content-type"]).toBe("audio/mp4");
    expect(whole.headers["accept-ranges"]).toBe("bytes");
    // `no-store`: the phones keep the one copy they control.
    expect(whole.headers["cache-control"]).toBe("no-store");
    expect(whole.headers["x-content-type-options"]).toBe("nosniff");
    expect(whole.rawPayload.equals(audio("m4a"))).toBe(true);

    const part = await app.inject({ method: "GET", url: `/v1/blobs/${voiceId}/audio`, headers: { cookie, range: "bytes=0-99" } });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 0-99/4096");
    expect(part.rawPayload.length).toBe(100);
    const past = await app.inject({ method: "GET", url: `/v1/blobs/${voiceId}/audio`, headers: { cookie, range: "bytes=99999999-" } });
    expect(past.statusCode).toBe(416);

    // A photo's id on the audio route is nothing, even for its dumper.
    const photoId = blobIds.find((id) => id !== voiceId)!;
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${photoId}/audio`, headers: { cookie } })).statusCode).toBe(404);

    // A member of the thread a row from this message landed in hears nothing.
    const other = await person();
    const shared = await thread(me.id, "Bookshelf build");
    await addMember(other.id, shared);
    await db
      .insertInto("content")
      .values({ account_id: me.id, thread_id: shared, type: "task", title: "Buy brackets", derived_from_message_id: messageId })
      .execute();
    await turnResult({ outcome: "answered", jobId, usage: goodUsage });
    const theirs = await signIn(other.id);
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${voiceId}/audio`, headers: { cookie: theirs } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/v1/blobs/${voiceId}/audio` })).statusCode).toBe(401);
  });
});

describe("the resume", () => {
  it("carries the conversation's open question, so a spoken answer is still judged as one", async () => {
    const me = await person();
    const { messageId, jobId, cookie, conversationId } = await spoken(me, "", { photo: true });
    // A question left open by this turn, in 020's shape.
    const trip = await thread(me.id, "Lisbon trip");
    const filed = await app.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      headers: internal,
      payload: { tool: "add_content", jobId, toolCallId: "c1", threadId: me.defaultThreadId, title: "The beach", type: "image", photo: 1 },
    });
    expect(filed.statusCode).toBe(200);
    await turnResult({
      outcome: "answered",
      jobId,
      usage: goodUsage,
      questions: [{ field: "thread", title: "The beach", contentId: filed.json().contentId, options: [{ value: trip }] }],
    });
    const question = await db.selectFrom("questions").select("id").where("conversation_id", "=", conversationId).where("state", "=", "open").executeTakeFirstOrThrow();

    await db.updateTable("messages").set({ state: "failed" }).where("id", "=", messageId).execute();
    const res = await app.inject({ method: "POST", url: `/v1/dumps/${messageId}/resume`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const jobs = await db.selectFrom("jobs").select("payload").where("kind", "=", "dump.answer").where("state", "=", "queued").execute();
    expect(jobs.map((j) => (j.payload as { openQuestionId?: string }).openQuestionId)).toEqual([question.id]);
  });
});

describe("the sweep", () => {
  it("asks for the forget again for a reference held over an hour, and not for a fresh one", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const stale = (await uploadVoice(cookie, audio("m4a"))).json().blobId as string;
    const fresh = (await uploadVoice(cookie, audio("m4a"))).json().blobId as string;
    await db.updateTable("blobs").set({ provider_ref: "tr_old", created_at: sql`now() - interval '61 minutes'` }).where("id", "=", stale).execute();
    await db.updateTable("blobs").set({ provider_ref: "tr_new", created_at: sql`now() - interval '59 minutes'` }).where("id", "=", fresh).execute();
    await handlers["blob.daily"]!({}, { mailer: null as never }, null);
    const forgets = await db.selectFrom("jobs").select("payload").where("kind", "=", "voice.forget").execute();
    expect(forgets.map((j) => (j.payload as { blobId: string }).blobId)).toEqual([stale]);
  });

  it("purges a voice note with its one object", async () => {
    const me = await person();
    const cookie = await signIn(me.id);
    const id = (await uploadVoice(cookie, audio("m4a"))).json().blobId as string;
    await db.updateTable("blobs").set({ deleted_at: sql`now()`, purge_after: sql`now() - interval '1 second'` }).where("id", "=", id).execute();
    await handlers["blob.purge"]!({}, { mailer: null as never }, null);
    expect(await db.selectFrom("blobs").select("id").where("id", "=", id).execute()).toHaveLength(0);
    expect(await objectStore()!.get(objectKey(id, "original"))).toBeNull();
  });
});
