// 024 C3: Activity, the record the bell opens. (AC-17 to AC-21)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { activityNew, purgeActivity, record } from "../src/notifications/activity.js";
import { uuidv7 } from "../src/uuid.js";

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
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, analytics_subject_id: uuidv7(), display_name: "Ana" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

describe("024 AC-17 and AC-21 a row", () => {
  it("carries the words that were sent, or would have been, and the reason when they were not", async () => {
    const me = await account();
    await record(me, { kind: "digest", sent: true, title: "Due today", body: "Pay the rent.", send: "morning" });
    await record(me, { kind: "digest", sent: false, reason: "setting", title: "Tomorrow was off", body: "Two were due on Saturday.", send: "evening" });
    const rows = await db.selectFrom("activity").selectAll().where("account_id", "=", me).orderBy("occurred_at", "asc").execute();
    expect(rows.map((row) => [row.kind, row.sent, row.reason, row.title, row.body, row.send])).toEqual([
      ["digest", true, null, "Due today", "Pay the rent.", "morning"],
      ["digest", false, "setting", "Tomorrow was off", "Two were due on Saturday.", "evening"],
    ]);
  });

  it("clamps a title and a body it is handed, so the stored words are bounded", async () => {
    const me = await account();
    await record(me, { kind: "shared_activity", sent: true, title: "x".repeat(400), body: "y".repeat(900) });
    const row = await db.selectFrom("activity").select(["title", "body"]).where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(row.title.length).toBeLessThanOrEqual(200);
    expect(row.body?.length).toBeLessThanOrEqual(600);
  });

  // Found in review, 2026-09-30: the words went through the 120 character
  // clamp for a person's single string, so a digest naming four rows and
  // what is still open was stored cut mid-word, and Activity draws it now.
  it("keeps the words as sent up to what the columns hold, on one line", async () => {
    const me = await account();
    const body = `${"Pay the rent, ".repeat(20)}and Call the clinic.`;
    const title = `Ana shared ${"Lisbon trip ".repeat(12)}`.trim();
    await record(me, { kind: "share", sent: true, title: `${title}\n`, body: `${body}\n` });
    const row = await db.selectFrom("activity").select(["title", "body"]).where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(row.title).toBe(title);
    expect(row.body).toBe(body);
  });
});

describe("024 AC-18 the list, and AC-20 who may read it", () => {
  it("pages newest first, fifty at a time, for the account alone", async () => {
    const me = await account();
    const other = await account();
    for (let i = 0; i < 55; i += 1) await record(me, { kind: "digest", sent: true, title: `Due today ${i}`, body: null, send: "morning" });
    await record(other, { kind: "digest", sent: true, title: "Not yours", body: null, send: "morning" });
    const cookie = await signIn(me);
    const first = await app.inject({ method: "GET", url: "/v1/activity", headers: { cookie } });
    expect(first.statusCode).toBe(200);
    const page = first.json() as { rows: { title: string }[]; next: string | null };
    expect(page.rows).toHaveLength(50);
    expect(page.rows[0]?.title).toBe("Due today 54");
    expect(page.next).not.toBeNull();
    const second = await app.inject({ method: "GET", url: `/v1/activity?cursor=${encodeURIComponent(page.next!)}`, headers: { cookie } });
    const rest = second.json() as { rows: { title: string }[]; next: string | null };
    expect(rest.rows).toHaveLength(5);
    expect(rest.rows.map((row) => row.title)).not.toContain("Not yours");
    expect(rest.next).toBeNull();
    expect((await app.inject({ method: "GET", url: "/v1/activity" })).statusCode).toBe(401);
  });

  it("orders by when it happened, not by when the row was written", async () => {
    const me = await account();
    await record(me, { kind: "digest", sent: true, title: "Now", body: null, send: "morning" });
    await record(me, { kind: "expired", sent: false, reason: "design", title: "Then", body: null });
    await sql`update activity set occurred_at = now() - interval '2 days' where title = 'Then'`.execute(db);
    const page = (await app.inject({ method: "GET", url: "/v1/activity", headers: { cookie: await signIn(me) } })).json() as { rows: { title: string }[] };
    expect(page.rows.map((row) => row.title)).toEqual(["Now", "Then"]);
  });
});

describe("024 AC-19 the dot", () => {
  it("is a row newer than the last opening, of any kind but a request, and opening clears it", async () => {
    const me = await account();
    expect(await activityNew(me)).toBe(false);
    await record(me, { kind: "request", sent: true, title: "Sam wants to connect", body: "Answer in My people." });
    expect(await activityNew(me)).toBe(false);
    await record(me, { kind: "share", sent: true, title: "Sam shared Lisbon trip", body: "Waiting in Threads." });
    expect(await activityNew(me)).toBe(true);
    const cookie = await signIn(me);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json()).toMatchObject({ activityNew: true });
    expect((await app.inject({ method: "POST", url: "/v1/activity/seen", headers: { cookie } })).statusCode).toBe(200);
    expect(await activityNew(me)).toBe(false);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json()).toMatchObject({ activityNew: false });
  });
});

describe("024 AC-20 the purges", () => {
  it("drops rows past thirty days and keeps the rest", async () => {
    const me = await account();
    await record(me, { kind: "digest", sent: true, title: "Old", body: null, send: "morning" });
    await sql`update activity set occurred_at = now() - interval '31 days' where title = 'Old'`.execute(db);
    await record(me, { kind: "digest", sent: true, title: "New", body: null, send: "morning" });
    await purgeActivity();
    const titles = (await db.selectFrom("activity").select("title").where("account_id", "=", me).execute()).map((row) => row.title);
    expect(titles).toEqual(["New"]);
  });

  it("drops a request's rows with the request, at seven days, since 022 keeps who asked whom no longer than that", async () => {
    const me = await account();
    await record(me, { kind: "request", sent: true, title: "Sam wants to connect", body: "Answer in My people." });
    await record(me, { kind: "expired", sent: false, reason: "design", title: "Your request to Sam expired", body: "Thirty days, no answer." });
    await record(me, { kind: "digest", sent: true, title: "Due today", body: null, send: "morning" });
    await sql`update activity set occurred_at = now() - interval '8 days'`.execute(db);
    await purgeActivity();
    const titles = (await db.selectFrom("activity").select("title").where("account_id", "=", me).execute()).map((row) => row.title);
    expect(titles).toEqual(["Due today"]);
  });
});
