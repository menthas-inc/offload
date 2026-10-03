// 024 B2 and B3: a push token is bound to the session, and the account's
// switches and hours travel on /api/me. (AC-11, AC-14, AC-1)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { enqueue } from "../src/jobs/queue.js";
import { migrate } from "../src/migrate.js";
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
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(state: "active" | "invited" = "active"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state, email_verified: true, analytics_subject_id: uuidv7(), display_name: "Ana" })
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

const TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

async function tokensOf(accountId: string) {
  return db.selectFrom("push_tokens").select(["token", "platform", "account_id"]).where("account_id", "=", accountId).execute();
}

describe("024 AC-11 a push token", () => {
  it("is registered through a route that takes no account id and binds it to the session's", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const registered = await app.inject({
      method: "POST",
      url: "/v1/push-tokens",
      headers: { cookie, "content-type": "application/json" },
      payload: { token: TOKEN, platform: "ios", accountId: "someone-else" },
    });
    expect(registered.statusCode).toBe(200);
    expect(await tokensOf(me)).toEqual([{ token: TOKEN, platform: "ios", account_id: me }]);

    // Again from the same phone: one row, seen again.
    expect((await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie, "content-type": "application/json" }, payload: { token: TOKEN, platform: "ios" } })).statusCode).toBe(200);
    expect(await tokensOf(me)).toHaveLength(1);
  });

  it("is re-bound when another account registers the same token, so a phone that changes hands never hears the last account's words", async () => {
    const first = await account();
    const second = await account();
    await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie: await signIn(first), "content-type": "application/json" }, payload: { token: TOKEN, platform: "android" } });
    await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie: await signIn(second), "content-type": "application/json" }, payload: { token: TOKEN, platform: "android" } });
    expect(await tokensOf(first)).toEqual([]);
    expect(await tokensOf(second)).toHaveLength(1);
  });

  it("is refused when it is not one, and needs a session", async () => {
    const me = await account();
    const cookie = await signIn(me);
    expect((await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie, "content-type": "application/json" }, payload: { token: "abc", platform: "ios" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie, "content-type": "application/json" }, payload: { token: TOKEN, platform: "web" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { "content-type": "application/json" }, payload: { token: TOKEN, platform: "ios" } })).statusCode).toBe(401);
  });

  it("is deleted by its own session and by nobody else's", async () => {
    const me = await account();
    const other = await account();
    const mine = await signIn(me);
    await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie: mine, "content-type": "application/json" }, payload: { token: TOKEN, platform: "ios" } });
    expect((await app.inject({ method: "DELETE", url: "/v1/push-tokens", headers: { cookie: await signIn(other), "content-type": "application/json" }, payload: { token: TOKEN } })).statusCode).toBe(200);
    expect(await tokensOf(me)).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: "/v1/push-tokens", headers: { cookie: mine, "content-type": "application/json" }, payload: { token: TOKEN } })).statusCode).toBe(200);
    expect(await tokensOf(me)).toEqual([]);
  });

  it("is never returned by a read", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await app.inject({ method: "POST", url: "/v1/push-tokens", headers: { cookie, "content-type": "application/json" }, payload: { token: TOKEN, platform: "ios" } });
    const me2 = await app.inject({ method: "GET", url: "/api/me", headers: { cookie } });
    expect(me2.body).not.toContain("PushToken");
  });
});

describe("024 AC-14 the switches and hours on /api/me", () => {
  it("come back on by default at 8:00 and 19:00, with nothing to see in Activity", async () => {
    const me = await account();
    const response = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: await signIn(me) } });
    expect(response.json()).toMatchObject({
      notifyDueToday: true,
      notifyDueTodayAt: "08:00",
      notifyComingTomorrow: true,
      notifyComingTomorrowAt: "19:00",
      notifyPeopleRequests: true,
      notifySharedActivity: true,
      activityNew: false,
    });
  });

  it("take an hour as HH:MM and refuse one that is not, one field at a time", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const patch = (payload: Record<string, unknown>) =>
      app.inject({ method: "PATCH", url: "/api/me", headers: { cookie, "content-type": "application/json" }, payload });
    expect((await patch({ notifyDueTodayAt: "07:30" })).json()).toMatchObject({ notifyDueTodayAt: "07:30", notifyComingTomorrowAt: "19:00" });
    expect((await patch({ notifyComingTomorrow: false })).json()).toMatchObject({ notifyComingTomorrow: false, notifyDueToday: true });
    expect((await patch({ notifyDueTodayAt: "25:00" })).statusCode).toBe(400);
    expect((await patch({ notifyDueTodayAt: "7am" })).statusCode).toBe(400);
    expect((await patch({ notifyPeopleRequests: false, notifySharedActivity: false })).json()).toMatchObject({ notifyPeopleRequests: false, notifySharedActivity: false });
  });

  it("a changed hour, switch or zone deletes the account's queued digests still ahead, and the next pass re-enqueues", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await enqueue({ kind: "account.digest", accountId: me, payload: { send: "morning", day: "2026-09-23" }, runAfterSeconds: 3600, idempotencyKey: `account.digest:${me}:2026-09-23:morning` });
    await enqueue({ kind: "account.digest", accountId: me, payload: { send: "evening", day: "2026-09-22" }, runAfter: new Date(Date.now() - 60_000), idempotencyKey: `account.digest:${me}:2026-09-22:evening` });
    const other = await account();
    await enqueue({ kind: "account.digest", accountId: other, payload: { send: "morning", day: "2026-09-23" }, runAfterSeconds: 3600, idempotencyKey: `account.digest:${other}:2026-09-23:morning` });

    await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie, "content-type": "application/json" }, payload: { notifyDueTodayAt: "09:00" } });
    const left = await db.selectFrom("jobs").select(["account_id", "payload", "state"]).where("kind", "=", "account.digest").execute();
    // The one already due stays, the other account's stays, and mine ahead is gone.
    expect(left.map((job) => `${job.account_id === me ? "me" : "other"}:${(job.payload as { send: string }).send}`).sort()).toEqual(["me:evening", "other:morning"]);

    await enqueue({ kind: "account.digest", accountId: me, payload: { send: "morning", day: "2026-09-24" }, runAfterSeconds: 3600, idempotencyKey: `account.digest:${me}:2026-09-24:morning` });
    await app.inject({ method: "PATCH", url: "/api/me", headers: { cookie, "content-type": "application/json" }, payload: { timeZone: "Asia/Tokyo" } });
    expect((await db.selectFrom("jobs").select("id").where("kind", "=", "account.digest").where("account_id", "=", me).where("run_after", ">", sql<Date>`now()`).execute())).toEqual([]);
  });
});

describe("033 AC-20 a phone registers only for an active account", () => {
  it("refuses an account still in first run", async () => {
    const id = await account("invited");
    const response = await app.inject({
      method: "POST",
      url: "/v1/push-tokens",
      headers: { cookie: await signIn(id), "content-type": "application/json" },
      payload: { token: TOKEN, platform: "ios" },
    });
    expect(response.statusCode).toBe(403);
    expect(await tokensOf(id)).toHaveLength(0);
  });
});
