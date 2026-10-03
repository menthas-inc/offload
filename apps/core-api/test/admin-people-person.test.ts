// 034 section A. A person: one account, for troubleshooting, with nothing
// they wrote on it (AC-18, AC-19, AC-20, AC-22, and OFF-1 for these reads).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { limitReached, spentToday, turnsToday } from "../src/budget.js";
import { limitFor, setting } from "../src/settings.js";
import { photosToday } from "../src/blobs/photos.js";
import { voiceToday } from "../src/blobs/audio.js";
import { mailToday } from "../src/mail-in/receive.js";
import { uuidv7 } from "../src/uuid.js";
import { activeAccount, neverSignedIn, adminRoutesOf, auditEntries, fill, signIn, staffMember, wipeAdmin } from "./admin-kit.js";
import { leaks, seedMarked, wipeMarked } from "./admin-off1-kit.js";

await migrate(() => {});

let app: App;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await wipeMarked();
  await wipeAdmin();
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  await wipeMarked();
  await wipeAdmin();
});

async function person(email: string, name: string | null = null): Promise<string> {
  const id = await activeAccount(email);
  await db.updateTable("accounts").set({ first_signed_in_at: new Date(), display_name: name }).where("id", "=", id).execute();
  return id;
}

const get = (cookie: string, url: string) => app.inject({ method: "GET", url: `/v1/admin${url}`, headers: { cookie } });
const post = (cookie: string, url: string) => app.inject({ method: "POST", url: `/v1/admin${url}`, headers: { cookie } });
const limits = (cookie: string, id: string, payload: unknown) =>
  app.inject({ method: "PATCH", url: `/v1/admin/people/${id}/limits`, headers: { cookie }, payload: payload as Record<string, unknown> });

const photo = (accountId: string, bytes: number) =>
  sql`insert into blobs (account_id, client_key, content_type, byte_size, width, height, sha256)
      values (${accountId}, ${uuidv7()}, 'image/jpeg', ${bytes}, 10, 10, ${Buffer.alloc(32)})`.execute(db);
const voice = (accountId: string, deviceMs: number, measuredMs: number | null = null) =>
  sql`insert into blobs (account_id, client_key, content_type, byte_size, kind, duration_ms, measured_ms, sha256)
      values (${accountId}, ${uuidv7()}, 'audio/mp4', 2048, 'audio', ${deviceMs}, ${measuredMs}, ${Buffer.alloc(32)})`.execute(db);

async function mail(accountId: string, n: number, ago = "10 minutes"): Promise<void> {
  const conversation = await sql<{ id: string }>`insert into conversations (account_id) values (${accountId}) returning id`.execute(db);
  for (let i = 0; i < n; i += 1) {
    await sql`insert into messages (conversation_id, account_id, role, turn_id, source, created_at)
              values (${conversation.rows[0]!.id}, ${accountId}, 'person', ${uuidv7()}, 'mail', now() - ${ago}::interval)`.execute(db);
  }
}

/** A job of theirs. Ids are UUIDv7 and order only to the millisecond, so
 *  each waits one out: the timeline's order is the order they were made in. */
const job = async (accountId: string, values: { kind?: string; state?: string; attempts?: number; errorCode?: string | null; ago?: string }) => {
  await new Promise((resolve) => setTimeout(resolve, 2));
  return (
    await sql<{ id: string }>`
      insert into jobs (kind, account_id, payload, state, run_after, attempts, max_attempts, last_error, error_code, created_at, updated_at)
      values (${values.kind ?? "dump.answer"}, ${accountId}, '{"secret":"payload-text"}'::jsonb, ${values.state ?? "done"},
              now() - ${values.ago ?? "1 hour"}::interval, ${values.attempts ?? 1}, 2,
              ${values.errorCode ? "free text nobody may read" : null}, ${values.errorCode ?? null},
              now() - ${values.ago ?? "1 hour"}::interval, now() - ${values.ago ?? "1 hour"}::interval + interval '3 seconds')
      returning id`.execute(db)
  ).rows[0]!.id;
};

describe("AC-18 a person", () => {
  it("returns who they are, and who invited them when the audit log knows", async () => {
    const owner = await staffMember("owner", "boss@example.test");
    await db.updateTable("accounts").set({ display_name: "Hana Ito" }).where("id", "=", owner.id).execute();
    const invited = await app.inject({ method: "POST", url: "/v1/admin/waitlist/invite-address", headers: { cookie: owner.cookie }, payload: { email: "ana@example.test" } });
    const ana = invited.json().accountId as string;
    await db
      .updateTable("accounts")
      .set({ state: "active", first_signed_in_at: new Date("2026-09-02T10:00:00Z"), display_name: "Ana Duarte", country: "PT", time_zone: "Europe/Lisbon", consent_version: "2026-09-20" })
      .where("id", "=", ana)
      .execute();
    await sql`insert into account_identities (account_id, provider, subject) values (${ana}, 'apple', 'sub-ana')`.execute(db);
    await signIn(ana);

    const res = await get(owner.cookie, `/people/${ana}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual([
      "can", "consentVersion", "country", "disabledAt", "email", "firstSignedInAt", "has", "id", "invitedBy", "joined",
      "lastActive", "limits", "name", "providers", "state", "timeZone", "today",
    ]);
    expect(body).toMatchObject({
      id: ana,
      name: "Ana Duarte",
      email: "ana@example.test",
      state: "active",
      firstSignedInAt: "2026-09-02T10:00:00.000Z",
      providers: ["apple"],
      country: "PT",
      timeZone: "Europe/Lisbon",
      consentVersion: "2026-09-20",
      disabledAt: null,
      invitedBy: { id: owner.id, name: "Hana Ito" },
      can: { disable: true, enable: false, limits: true },
    });
    expect(Date.parse(body.lastActive)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("leaves the inviter out when nobody in the log invited them, and tells support it cannot set a limit", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    const body = (await get(support.cookie, `/people/${ana}`)).json();
    expect(body.invitedBy).toBeNull();
    expect(body.name).toBeNull();
    expect(body.can).toEqual({ disable: true, enable: false, limits: false });
  });

  it("answers 404 for an account that never signed in, and for nobody", async () => {
    const support = await staffMember("support");
    const never = await neverSignedIn("never@example.test");
    for (const path of ["", "/usage", "/timeline", "/hits"]) {
      expect((await get(support.cookie, `/people/${never}${path}`)).statusCode, path).toBe(404);
      expect((await get(support.cookie, `/people/${uuidv7()}${path}`)).statusCode, path).toBe(404);
    }
  });

  it("measures today against each cap with the figures the cap itself uses", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    await db.deleteFrom("jobs").execute();
    await sql`insert into llm_usage (account_id, job_kind, category, model, cost_micros) values (${ana}, 'dump.answer', 'interactive', 'claude-sonnet-5', 420000)`.execute(db);
    await sql`insert into llm_usage (account_id, job_kind, category, model, cost_micros, created_at)
              values (${ana}, 'dump.answer', 'interactive', 'claude-sonnet-5', 9000000, now() - interval '30 hours')`.execute(db);
    await sql`insert into lookups (account_id, label, kind, outcome, cost_micros) values (${ana}, 'search', 'search', 'used', 10000)`.execute(db);
    await job(ana, {});
    await job(ana, {});
    await job(ana, { kind: "thread.nightly" });
    await job(ana, { ago: "30 hours" });
    await photo(ana, 1000);
    await photo(ana, 3000);
    await voice(ana, 5000);
    await voice(ana, 5000, 7000);
    await mail(ana, 3);
    await mail(ana, 2, "3 hours");

    const body = (await get(support.cookie, `/people/${ana}`)).json();
    const used = Object.fromEntries((body.today.caps as Array<{ key: string; used: number }>).map((cap) => [cap.key, cap.used]));
    expect(used).toEqual({
      "cap.spend_micros": 430_000,
      "cap.turns": 2,
      "cap.photos": 2,
      "cap.photo_bytes": 4000,
      "cap.voice_notes": 2,
      "cap.voice_ms": 12_000,
      "cap.mail_day": 5,
      "cap.mail_hour": 3,
    });
    // The same numbers the caps read.
    expect(used["cap.spend_micros"]).toBe(await spentToday(ana));
    expect(used["cap.turns"]).toBe(await turnsToday(ana));
    // And the other six, from the functions the caps themselves call.
    expect({ n: used["cap.photos"], bytes: used["cap.photo_bytes"] }).toEqual(await photosToday(ana));
    expect({ n: used["cap.voice_notes"], ms: used["cap.voice_ms"] }).toEqual(await voiceToday(ana));
    expect({ day: used["cap.mail_day"], hour: used["cap.mail_hour"] }).toEqual(await mailToday(ana));
    for (const cap of body.today.caps as Array<{ key: string; limit: number; reached: boolean }>) {
      expect(cap.limit, cap.key).toBe(await limitFor(ana, cap.key as "cap.turns"));
      expect(cap.reached, cap.key).toBe(false);
    }
    expect(body.today.refused).toBeNull();
    expect(await limitReached(ana)).toBeNull();
  });

  it("says when they are at a limit now, and which", async () => {
    const owner = await staffMember("owner");
    const ana = await person("ana@example.test");
    await db.deleteFrom("jobs").execute();
    await job(ana, {});
    await limits(owner.cookie, ana, { key: "cap.turns", value: 1 });

    const body = (await get(owner.cookie, `/people/${ana}`)).json();
    expect(body.today.refused).toEqual({ cap: "cap.turns", scope: "account" });
    expect(body.today.refused).toEqual(await limitReached(ana));
    expect((body.today.caps as Array<{ key: string; reached: boolean; limit: number }>).find((cap) => cap.key === "cap.turns")).toMatchObject({ limit: 1, reached: true });
  });

  it("counts what they have, and returns nothing but counts", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    const tom = await person("tom@example.test");
    const home = (await db.selectFrom("accounts").select("default_thread_id").where("id", "=", ana).executeTakeFirstOrThrow()).default_thread_id!;
    // One thread alone (promotion's), one shared with Tom.
    const shared = await sql<{ id: string }>`insert into threads (created_by_account_id, name) values (${ana}, 'a name nobody may read') returning id`.execute(db);
    for (const member of [ana, tom]) {
      await sql`insert into thread_members (thread_id, account_id, state) values (${shared.rows[0]!.id}, ${member}, 'accepted')`.execute(db);
    }
    await mail(ana, 2);
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin) values (${ana}, 'thread', ${home}, 'going_on', 'words', 'stated')`.execute(db);
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin, deleted_at) values (${ana}, 'thread', ${home}, 'going_on', 'gone', 'stated', now())`.execute(db);
    const [a, b] = [ana, tom].sort();
    await sql`insert into connections (account_a, account_b) values (${a}, ${b})`.execute(db);
    await photo(ana, 1000);
    await voice(ana, 5000);
    await sql`insert into connector_connections (account_id, provider, external_account_email, last_sync_at) values (${ana}, 'google', 'second@example.test', now())`.execute(db);
    await sql`insert into push_tokens (account_id, token, platform) values (${ana}, 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios')`.execute(db);
    await sql`insert into push_tokens (account_id, token, platform) values (${ana}, 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', 'android')`.execute(db);
    await sql`insert into push_tokens (account_id, token, platform) values (${ana}, 'ExponentPushToken[cccccccccccccccccccccc]', 'android')`.execute(db);
    await signIn(ana);
    await signIn(ana);
    await sql`insert into sessions (account_id, token, expires_at) values (${ana}, 'expired', now() - interval '1 day')`.execute(db);

    const res = await get(support.cookie, `/people/${ana}`);
    const has = res.json().has;
    expect(has).toMatchObject({
      threadsAlone: 1,
      threadsShared: 1,
      dumped: 2,
      notes: 1,
      connections: 1,
      files: 2,
      fileBytes: 3048,
      calendars: 1,
      calendarSync: "ok",
      devices: { ios: 1, android: 2 },
      sessions: 2,
    });
    expect(Date.parse(has.sessionLastUsed)).toBeGreaterThan(Date.now() - 60_000);
    expect(Object.keys(has).sort()).toEqual([
      "calendarSync", "calendars", "connections", "devices", "dumped", "fileBytes", "files", "notes", "sessionLastUsed", "sessions", "threadsAlone", "threadsShared",
    ]);
    // No calendar's name, no second address, no token.
    expect(res.payload).not.toContain("second@example.test");
    expect(res.payload).not.toContain("ExponentPushToken");
    expect(res.payload).not.toContain("a name nobody may read");

    await sql`update connector_connections set last_error_at = now() + interval '1 minute' where account_id = ${ana}`.execute(db);
    expect((await get(support.cookie, `/people/${ana}`)).json().has.calendarSync).toBe("failed");
  });

  it("returns one point per UTC day for cost and activity", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    await db.deleteFrom("jobs").execute();
    await sql`insert into llm_usage (account_id, job_kind, category, model, cost_micros) values (${ana}, 'dump.answer', 'interactive', 'claude-sonnet-5', 5000)`.execute(db);
    await sql`insert into lookups (account_id, label, kind, outcome, cost_micros) values (${ana}, 'search', 'search', 'used', 10000)`.execute(db);
    await job(ana, { ago: "0 seconds" });
    await photo(ana, 1000);
    await voice(ana, 5000);
    await mail(ana, 2, "0 seconds");

    for (const [range, days] of [["24h", 2], ["7d", 7], ["30d", 30], ["90d", 90]] as const) {
      const res = await get(support.cookie, `/people/${ana}/usage?range=${range}`);
      expect(res.statusCode).toBe(200);
      const points = res.json().days as Array<Record<string, unknown>>;
      expect(points, range).toHaveLength(days);
      expect(points[points.length - 1]).toEqual({ day: new Date().toISOString().slice(0, 10), costMicros: 15_000, turns: 1, photos: 1, voiceNotes: 1, mail: 2 });
      expect(points[0]).toMatchObject({ costMicros: 0, turns: 0, photos: 0, voiceNotes: 0, mail: 0 });
    }
    expect((await get(support.cookie, `/people/${ana}/usage`)).json().days).toHaveLength(30);
  });

  it("lists each time a cap refused them, for 30 days", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    await sql`insert into limit_hits (account_id, cap, scope, day, count) values (${ana}, 'cap.turns', 'account', current_date, 3)`.execute(db);
    await sql`insert into limit_hits (account_id, cap, scope, day) values (${ana}, 'platform.spend_micros', 'platform', current_date - 2)`.execute(db);
    await sql`insert into limit_hits (account_id, cap, scope, day) values (${ana}, 'cap.photos', 'account', current_date - 40)`.execute(db);

    const res = await get(support.cookie, `/people/${ana}/hits`);
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toMatchObject([
      { cap: "cap.turns", scope: "account", count: 3 },
      { cap: "platform.spend_micros", scope: "platform", count: 1 },
    ]);
    expect(Object.keys(res.json().rows[0]).sort()).toEqual(["cap", "count", "day", "lastAt", "scope"]);
  });
});

describe("AC-19 an override", () => {
  it("is set by an owner, used by the account's next check, and cleared back to the global value", async () => {
    const owner = await staffMember("owner");
    await db.updateTable("accounts").set({ display_name: "Hana Ito" }).where("id", "=", owner.id).execute();
    const ana = await person("ana@example.test");
    expect(await limitFor(ana, "cap.turns")).toBe(100);

    const set = await limits(owner.cookie, ana, { key: "cap.turns", value: 7 });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({ key: "cap.turns", value: 7 });
    // At once on this instance; the cache's 15 seconds on any other.
    expect(await limitFor(ana, "cap.turns")).toBe(7);

    const row = ((await get(owner.cookie, `/people/${ana}`)).json().limits as Array<Record<string, unknown>>).find((one) => one["key"] === "cap.turns")!;
    expect(row).toMatchObject({ key: "cap.turns", kind: "int", global: 100, override: 7, min: 1, max: 10_000, setBy: { id: owner.id, name: "Hana Ito" } });
    expect(Date.parse(String(row["setAt"]))).not.toBeNaN();

    // Nothing else is forgotten for it: a setting changed underneath is still
    // read from the cache, as it would be had no override been set.
    expect(await setting("cap.photos")).toBe(200);
    await sql`insert into app_settings (key, value) values ('cap.photos', '3'::jsonb)`.execute(db);
    await limits(owner.cookie, ana, { key: "cap.turns", value: 9 });
    expect(await limitFor(ana, "cap.turns")).toBe(9);
    expect(await setting("cap.photos")).toBe(200);
    const cleared = await limits(owner.cookie, ana, { key: "cap.turns", value: null });
    expect(cleared.json()).toEqual({ key: "cap.turns", value: null });
    expect(await limitFor(ana, "cap.turns")).toBe(100);
    expect(await db.selectFrom("account_limits").select("key").where("account_id", "=", ana).execute()).toEqual([]);

    // Clearing what is not set changes nothing and records nothing.
    await limits(owner.cookie, ana, { key: "cap.turns", value: null });
    expect(await auditEntries()).toEqual([
      { kind: "override.set", staff_account_id: owner.id, target_account_id: ana, setting_key: "cap.turns", old_value: null, new_value: 7, job_id: null },
      { kind: "override.set", staff_account_id: owner.id, target_account_id: ana, setting_key: "cap.turns", old_value: 7, new_value: 9, job_id: null },
      { kind: "override.cleared", staff_account_id: owner.id, target_account_id: ana, setting_key: "cap.turns", old_value: 9, new_value: null, job_id: null },
    ]);
  });

  it("refuses a value outside the setting's bounds, a key that is not a per-person cap, and nobody", async () => {
    const owner = await staffMember("owner");
    const ana = await person("ana@example.test");

    const out = await limits(owner.cookie, ana, { key: "cap.turns", value: 0 });
    expect(out.statusCode).toBe(400);
    expect(out.json()).toEqual({ error: "out_of_bounds", key: "cap.turns", min: 1, max: 10_000 });
    expect((await limits(owner.cookie, ana, { key: "cap.turns", value: 1.5 })).statusCode).toBe(400);
    for (const key of ["platform.spend_micros", "switch.maps", "cap.everything"]) {
      const res = await limits(owner.cookie, ana, { key, value: 5_000_000 });
      expect(res.statusCode, key).toBe(400);
      expect(res.json(), key).toMatchObject({ error: "unknown_key", key });
    }
    expect((await limits(owner.cookie, uuidv7(), { key: "cap.turns", value: 5 })).statusCode).toBe(404);
    expect(await db.selectFrom("account_limits").select("key").execute()).toEqual([]);
    expect(await auditEntries()).toEqual([]);
  });

  it("is not support's to set", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    const res = await limits(support.cookie, ana, { key: "cap.turns", value: 7 });
    expect(res.statusCode).toBe(404);
    expect(await db.selectFrom("account_limits").select("key").execute()).toEqual([]);
  });
});

describe("AC-20 the timeline", () => {
  it("lists their jobs newest first with the code and never the text", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    const tom = await person("tom@example.test");
    await db.deleteFrom("jobs").execute();
    const done = await job(ana, { ago: "3 hours" });
    const dead = await job(ana, { state: "dead", attempts: 2, errorCode: "model_error", ago: "2 hours" });
    const queued = await job(ana, { kind: "thread.nightly", state: "queued", attempts: 0, ago: "1 hour" });
    await job(tom, {});

    const res = await get(support.cookie, `/people/${ana}/timeline`);
    expect(res.statusCode).toBe(200);
    const rows = res.json().rows as Array<Record<string, unknown>>;
    expect(rows.map((row) => row["id"])).toEqual([queued, dead, done]);
    expect(Object.keys(rows[0]!).sort()).toEqual(
      ["at", "attempts", "canRetry", "costMicros", "durationMs", "errorCode", "id", "kind", "model", "state", "tokensIn", "tokensOut"].sort(),
    );
    expect(rows[1]).toMatchObject({ kind: "dump.answer", state: "dead", attempts: 2, durationMs: 3000, errorCode: "model_error", canRetry: true });
    expect(rows[2]).toMatchObject({ state: "done", attempts: 1, durationMs: 3000, errorCode: null, canRetry: false });
    expect(rows[0]).toMatchObject({ kind: "thread.nightly", state: "queued", durationMs: null, canRetry: false });
    expect(res.payload).not.toContain("free text nobody may read");
    expect(res.payload).not.toContain("payload-text");

    // A dead job already retried once is not offered again.
    await sql`update jobs set retried_at = now() where id = ${dead}`.execute(db);
    expect(((await get(support.cookie, `/people/${ana}/timeline`)).json().rows as Array<Record<string, unknown>>)[1]!["canRetry"]).toBe(false);
  });

  it("says what each job cost: its models, its tokens in and out, and its spend, from the ledger rows that name it", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    await db.deleteFrom("jobs").execute();
    const quiet = await job(ana, { kind: "account.digest", ago: "3 hours" });
    const turn = await job(ana, { ago: "2 hours" });
    const other = await job(ana, { ago: "1 hour" });
    const call = (jobId: string | null, model: string, input: number, output: number, cost: number) =>
      sql`insert into llm_usage (account_id, job_kind, category, model, input_tokens, output_tokens, cache_read_tokens, cost_micros, job_id)
          values (${ana}, 'dump.answer', 'interactive', ${model}, ${input}, ${output}, 9000, ${cost}, ${jobId})`.execute(db);
    // A planner turn is several calls, and a voice note adds the provider's.
    await call(turn, "claude-sonnet-5", 1200, 80, 4200);
    await call(turn, "claude-sonnet-5", 300, 20, 800);
    await call(turn, "claude-haiku-4-5", 100, 10, 150);
    await call(turn, "assemblyai", 0, 0, 35);
    await call(other, "claude-haiku-4-5", 40, 4, 60);
    // Written before the ledger named its job: it is nobody's row here.
    await call(null, "claude-sonnet-5", 999_999, 999_999, 999_999);

    const rows = (await get(support.cookie, `/people/${ana}/timeline`)).json().rows as Array<Record<string, unknown>>;
    expect(rows.map((row) => row["id"])).toEqual([other, turn, quiet]);
    expect(rows[1]).toMatchObject({ model: "assemblyai, claude-haiku-4-5, claude-sonnet-5", tokensIn: 1600, tokensOut: 110, costMicros: 5185 });
    expect(rows[0]).toMatchObject({ model: "claude-haiku-4-5", tokensIn: 40, tokensOut: 4, costMicros: 60 });
    // A job that called no model has none of the three, and never a zero.
    expect(rows[2]).toMatchObject({ model: null, tokensIn: null, tokensOut: null, costMicros: null });
  });

  it("filters to failures, which is any job with a code", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    await db.deleteFrom("jobs").execute();
    await job(ana, { ago: "3 hours" });
    const dead = await job(ana, { state: "dead", errorCode: "timeout", ago: "2 hours" });
    // A failed turn closes done, with its reason.
    const closed = await job(ana, { state: "done", errorCode: "invalid_output", ago: "1 hour" });

    const res = await get(support.cookie, `/people/${ana}/timeline?failed=1`);
    expect((res.json().rows as Array<{ id: string }>).map((row) => row.id)).toEqual([closed, dead]);
  });

  it("pages by cursor, 50 at a time", async () => {
    const support = await staffMember("support");
    const ana = await person("ana@example.test");
    await db.deleteFrom("jobs").execute();
    await db
      .insertInto("jobs")
      .values(Array.from({ length: 120 }, () => ({ kind: "embed.content", account_id: ana, run_after: new Date() })))
      .execute();

    const seen = new Set<string>();
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const res = await get(support.cookie, `/people/${ana}/timeline${cursor ? `?cursor=${cursor}` : ""}`);
      const body = res.json() as { rows: Array<{ id: string }>; nextCursor: string | null };
      sizes.push(body.rows.length);
      for (const row of body.rows) seen.add(row.id);
      cursor = body.nextCursor;
    } while (cursor);
    expect(sizes).toEqual([50, 50, 20]);
    expect(seen.size).toBe(120);
  });
});

describe("AC-22 opening the page", () => {
  it("is recorded once per staff member, person and day, by a POST", async () => {
    const support = await staffMember("support");
    const owner = await staffMember("owner");
    const ana = await person("ana@example.test");
    const tom = await person("tom@example.test");

    // The reads record nothing.
    await get(support.cookie, `/people/${ana}`);
    await get(support.cookie, `/people/${ana}/timeline`);
    expect(await auditEntries()).toEqual([]);

    expect((await post(support.cookie, `/people/${ana}/viewed`)).statusCode).toBe(200);
    await post(support.cookie, `/people/${ana}/viewed`);
    await post(support.cookie, `/people/${tom}/viewed`);
    await post(owner.cookie, `/people/${ana}/viewed`);
    const entries = await auditEntries();
    expect(entries.every((entry) => entry.kind === "person.viewed")).toBe(true);
    expect(entries.map((entry) => `${entry.staff_account_id} ${entry.target_account_id}`).sort()).toEqual(
      [`${support.id} ${ana}`, `${support.id} ${tom}`, `${owner.id} ${ana}`].sort(),
    );

    expect((await post(support.cookie, `/people/${uuidv7()}/viewed`)).statusCode).toBe(404);
    expect(await auditEntries()).toHaveLength(3);
  });
});

describe("OFF-1 for a person who has signed in", () => {
  it("returns no content and no credential from any People read or write", async () => {
    // The shared walk's seeded account never signed in, so these routes answer
    // it with 404 and prove nothing. Here it has, and each must answer.
    const marked = await seedMarked();
    await db.updateTable("accounts").set({ first_signed_in_at: new Date() }).where("id", "=", marked.accountId).execute();
    const owner = await staffMember("owner");

    const reads = adminRoutesOf(app).filter((route) => route.method === "GET" && route.url.startsWith("/v1/admin/people"));
    expect(reads.map((route) => route.url).sort()).toEqual([
      "/v1/admin/people",
      "/v1/admin/people/:id",
      "/v1/admin/people/:id/hits",
      "/v1/admin/people/:id/timeline",
      "/v1/admin/people/:id/usage",
      "/v1/admin/people/stats",
    ]);
    for (const route of reads) {
      for (const query of ["", "?range=90d", "?failed=1", "?sort=spend", "?q=example"]) {
        const url = `${fill(route.url, marked.params)}${query}`;
        const res = await app.inject({ method: "GET", url, headers: { cookie: owner.cookie } });
        expect(res.statusCode, url).toBe(200);
        expect(leaks(res.payload, marked), url).toEqual([]);
      }
    }
    for (const [method, path, payload] of [
      ["POST", "viewed", undefined],
      ["PATCH", "limits", { key: "cap.turns", value: 5 }],
      ["POST", "sign-out", undefined],
      ["POST", "disable", undefined],
      ["POST", "enable", undefined],
    ] as const) {
      const res = await app.inject({ method, url: `/v1/admin/people/${marked.accountId}/${path}`, headers: { cookie: owner.cookie }, ...(payload ? { payload } : {}) });
      expect(res.statusCode, path).toBe(200);
      expect(leaks(res.payload, marked), path).toEqual([]);
    }
    expect(leaks(JSON.stringify(await db.selectFrom("staff_audit").selectAll().execute()), marked)).toEqual([]);
  });
});
