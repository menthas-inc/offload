// The store demo: the fictional person the App Store screenshots are taken as,
// from seeds/store-demo.sql. `pnpm seed:store-demo <cookie-file>` loads it and
// signs in as Sam Rivera, writing the session as the phones' Expo plugin keeps
// it (`{"better-auth.session_token":{"value","expires"}}`), and keeps that
// session across a reseed so a build that carries it stays signed in.
//
// `--zone <tz>` sets the zone every time is wall-clock in (New York without
// it): pick one where it is about 9:41 and launch the app with TZ set to it, and
// the day matches the status bar. `--newcomer` points the same session at an
// invited account that has not done first run. `--photo <jpeg>` also files a photo row in Garden, through the API's own
// upload and rendition routes, so the running API (API_URL) holds the bytes.
// Renditions are made with `sips`, so that step is macOS only.
//
// Local only. The script refuses a database that is not on this machine.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { linkPhoto } from "./blobs/rows.js";
import { layoutMemories } from "./memories/layout.js";
import { generateKey, ROOT_NAME, wrap } from "./crypto/keys.js";
import { closeDb, db } from "./db.js";
import { env } from "./env.js";
import { uuidv7 } from "./uuid.js";

const SEED = join(dirname(fileURLToPath(import.meta.url)), "../seeds/store-demo.sql");
const PEOPLE = "0de70000-0000-4000-a000-%";
export const SAM = "0de70000-0000-4000-a000-000000000001";
/** Invited, first run not done: the first-run screenshot signs in as them. */
export const NEWCOMER = "0de70000-0000-4000-a000-000000000004";
const GARDEN = "0de70000-0000-4000-a001-000000000006";
const CONVERSATION = "0de70000-0000-4000-a002-000000000001";
const PHOTO_MESSAGE = "0de70000-0000-4000-a003-000000000010";
const PHOTO_REPLY = "0de70000-0000-4000-a003-000000000011";
const PHOTO_ROW = "0de70000-0000-4000-a005-000000000602";

/** `zone` is the one every time is wall-clock in; New York without it. */
export async function seedStoreDemo(zone?: string): Promise<void> {
  const set = zone ? `select set_config('demo.zone', '${zone.replace(/[^A-Za-z0-9_/+-]/g, "")}', false);\n` : "";
  await sql.raw(set + readFileSync(SEED, "utf8")).execute(db);
  const people = await db.selectFrom("accounts").select("id").where(sql<boolean>`id::text like ${PEOPLE}`).execute();
  for (const { id } of people) {
    await db
      .insertInto("account_keys")
      .values({ account_id: id, wrapped_dek: wrap(generateKey()), wrapped_by: ROOT_NAME })
      .onConflict((oc) => oc.column("account_id").doNothing())
      .execute();
  }
  await placeMemories();
}

/** What each memory is about, by its number in the seed: the topic its
 *  made-up vector leans towards, so related memories gather on the map. */
const TOPICS: Record<number, string> = {
  1: "family", 2: "lisbon", 3: "work", 4: "home",
  5: "outdoors", 6: "home", 7: "family", 8: "lisbon",
  9: "home", 10: "lisbon", 11: "health", 12: "lisbon",
  13: "home", 14: "work", 15: "outdoors",
  16: "lisbon", 17: "work", 18: "family", 19: "health",
};

/** A deterministic unit vector from a word: no randomness, the same map each time. */
function direction(word: string, dims = 1024): number[] {
  let state = [...word].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32 - 0.5;
  };
  const v = Array.from({ length: dims }, next);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

/** Made-up embeddings for Sam's memories, then the real nightly layout over
 *  them. Each vector is its kind, its topic and a little of itself, so the
 *  map spreads by kind and gathers by topic. No model is called. */
async function placeMemories(): Promise<void> {
  const rows = await db
    .selectFrom("notes")
    .select(["id", "kind"])
    .where("scope", "=", "account")
    .where("subject_id", "=", SAM)
    .where(sql<boolean>`id::text like '0de70000-0000-4000-a004-%'`)
    .execute();
  for (const row of rows) {
    const n = Number(row.id.slice(-2));
    const [kind, topic, own] = [direction(row.kind), direction(TOPICS[n] ?? "other"), direction(row.id)];
    const mixed = kind.map((k, i) => 0.55 * k + 0.6 * topic[i]! + 0.35 * own[i]!);
    const norm = Math.hypot(...mixed);
    const vector = `[${mixed.map((x) => (x / norm).toFixed(5)).join(",")}]`;
    await db
      .updateTable("notes")
      .set({ embedding: vector, embedding_model: "store-demo", embedded_at: sql`now()` })
      .where("id", "=", row.id)
      .execute();
  }
  // The worker would embed them again with a real model; nothing to do here.
  await db.deleteFrom("jobs").where("kind", "=", "embed.memory").where("account_id", "=", SAM).where("state", "=", "queued").execute();
  await layoutMemories(SAM);
}

/** Everything with a demo id gone, the people too: the file's own clear block
 *  and then the accounts, which a reseed keeps. */
export async function clearStoreDemo(): Promise<void> {
  const file = readFileSync(SEED, "utf8");
  const block = file.slice(file.indexOf("-- ---------------------------------------------------------------- clear"), file.indexOf("-- ---------------------------------------------------------------- people"));
  await sql.raw(block).execute(db);
  await db.deleteFrom("sessions").where(sql<boolean>`account_id::text like ${PEOPLE}`).execute();
  await db.deleteFrom("account_keys").where(sql<boolean>`account_id::text like ${PEOPLE}`).execute();
  await db.deleteFrom("analytics_events").where(sql<boolean>`subject_id in (select analytics_subject_id from accounts where id::text like ${PEOPLE})`).execute();
  await db.deleteFrom("accounts").where(sql<boolean>`id::text like ${PEOPLE}`).execute();
}

const sign = async (token: string) => `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;

/** A month's session for Sam, as the signed cookie the API reads. Reuses
 *  `token` while its session is live. */
export async function signInAsSam(token?: string): Promise<string> {
  if (token) {
    const live = await db.selectFrom("sessions").select("id").where("token", "=", token).where("expires_at", ">", new Date()).executeTakeFirst();
    if (live) return sign(token);
  }
  const fresh = uuidv7();
  await db.insertInto("sessions").values({ account_id: SAM, token: fresh, expires_at: new Date(Date.now() + 30 * 86400_000) }).execute();
  return sign(fresh);
}

/** A photo row in Garden, filed the way a dump files one: uploaded, given its
 *  renditions against a finished dump job, and linked to the row. */
async function filePhoto(file: string, cookie: string): Promise<void> {
  const form = new FormData();
  form.append("clientKey", `store-demo-${basename(file)}`);
  form.append("file", new Blob([readFileSync(file)], { type: "image/jpeg" }), basename(file));
  const uploaded = await fetch(`${env.API_URL}/v1/blobs`, { method: "POST", headers: { cookie }, body: form });
  if (!uploaded.ok) throw new Error(`upload refused: ${uploaded.status}`);
  const { blobId } = (await uploaded.json()) as { blobId: string };

  const turn = uuidv7();
  await db
    .insertInto("messages")
    .values([
      { id: PHOTO_MESSAGE, conversation_id: CONVERSATION, account_id: SAM, role: "person", type: "image", turn_id: turn, text: "Something like this for the front bed", state: "answered", created_at: sql`now() - interval '1 day'` },
      { id: PHOTO_REPLY, conversation_id: CONVERSATION, account_id: SAM, role: "offload", type: "text", turn_id: turn, text: "Added the photo to Garden.", state: "answered", created_at: sql`now() - interval '1 day' + interval '4 seconds'` },
    ])
    .execute();
  await db.updateTable("blobs").set({ message_id: PHOTO_MESSAGE }).where("id", "=", blobId).execute();
  const job = await db
    .insertInto("jobs")
    .values({ kind: "dump.answer", account_id: SAM, payload: JSON.stringify({ messageId: PHOTO_MESSAGE }), state: "done", run_after: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();

  const dir = mkdtempSync(join(tmpdir(), "store-demo-"));
  const rendition = (size: number, name: string) => {
    const out = join(dir, name);
    execFileSync("sips", ["-s", "format", "jpeg", "-Z", String(size), file, "--out", out], { stdio: "ignore" });
    return new Blob([readFileSync(out)], { type: "image/jpeg" });
  };
  const parts = new FormData();
  parts.append("thumb", rendition(480, "thumb.jpg"), "thumb.jpg");
  parts.append("large", rendition(1600, "large.jpg"), "large.jpg");
  const rendered = await fetch(`${env.API_URL}/internal/v1/blobs/${blobId}/renditions?jobId=${job.id}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    body: parts,
  });
  if (!rendered.ok) throw new Error(`renditions refused: ${rendered.status}`);

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("content")
      .values({ id: PHOTO_ROW, thread_id: GARDEN, account_id: SAM, derived_from_message_id: PHOTO_MESSAGE, type: "image", title: "Flowers for the front bed", created_at: sql`now() - interval '1 day'`, updated_at: sql`now() - interval '1 day'` })
      .execute();
    await linkPhoto(trx, PHOTO_ROW, blobId, GARDEN);
    await trx.updateTable("threads").set({ content_count: sql`content_count + 1` }).where("id", "=", GARDEN).execute();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = new URL(env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.error("seed:store-demo is for a local database only.");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at >= 0 ? args.splice(at, 2)[1] : undefined;
  };
  const newcomer = args.includes("--newcomer");
  if (newcomer) args.splice(args.indexOf("--newcomer"), 1);
  const photo = option("--photo");
  const zone = option("--zone");
  const [file] = args;

  await seedStoreDemo(zone);
  let previous: string | undefined;
  if (file && existsSync(file)) {
    const stored = JSON.parse(readFileSync(file, "utf8")) as Record<string, { value: string }>;
    previous = stored["better-auth.session_token"]?.value.split(".")[0];
  }
  const cookie = await signInAsSam(previous);
  if (file) {
    const value = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
    const expires = new Date(Date.now() + 30 * 86400_000).toISOString();
    writeFileSync(file, JSON.stringify({ "better-auth.session_token": { value, expires } }));
  }
  // `--newcomer` moves the session to the newcomer, so a build that carries
  // Sam's cookie opens on first run without being rebuilt; a reseed without
  // the flag moves it back, first, so the photo is uploaded as Sam.
  const token = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)).split(".")[0]!;
  const sessionFor = (accountId: string) => db.updateTable("sessions").set({ account_id: accountId }).where("token", "=", token).execute();
  await sessionFor(SAM);
  if (photo) await filePhoto(photo, cookie);
  if (newcomer) await sessionFor(NEWCOMER);
  console.log(`The store demo is in${file ? `; signed in as Sam, the session is in ${file}` : ""}${photo ? ", with the photo" : ""}.`);
  await closeDb();
}
