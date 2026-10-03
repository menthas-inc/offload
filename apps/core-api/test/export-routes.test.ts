// 035 part B. Asking for a copy, and what the row says afterwards.
//
// AC-13 refused from another origin.
// AC-15 the row walks idle, making, ready, with failed, waiting and expired.
// AC-20 a second request inside 7 days is refused by the server.
// AC-23 a notice email when a copy is asked for, carrying no content.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { env } from "../src/env.js";
import { buildApp, type App } from "../src/app.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { promote } from "../src/admin/promote.js";
import { wipe } from "./labels-kit.js";

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
  await db.deleteFrom("exports").execute();
  await db.deleteFrom("sessions").execute();
  await wipe();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("analytics_events").execute();
});

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

/** Through promotion, as a real account arrives: that is what mints its key. */
async function account(): Promise<string> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  await db.updateTable("accounts").set({ state: "active" }).where("id", "=", outcome.accountId).execute();
  return outcome.accountId;
}

function jobs(kind: string) {
  return db.selectFrom("jobs").select(["account_id", "payload"]).where("kind", "=", kind as "export.build").execute();
}

async function ask(cookie: string, headers: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: "/api/me/export", headers: { cookie, ...headers } });
}

async function read(cookie: string) {
  const response = await app.inject({ method: "GET", url: "/api/me/export", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response.json() as { state: string; readyAt: string | null; expiresAt: string | null; nextAt: string | null };
}

describe("asking for a copy", () => {
  it("needs a session", async () => {
    expect((await app.inject({ method: "POST", url: "/api/me/export" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/me/export" })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: "/api/me/export" })).statusCode).toBe(401);
  });

  it("is refused from another origin", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const response = await ask(cookie, { origin: "https://elsewhere.example" });
    expect(response.statusCode).toBe(403);
    expect(await db.selectFrom("exports").select("id").execute()).toEqual([]);
  });

  it("starts one, books the build and the notice, and says making", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const response = await ask(cookie);
    expect(response.statusCode).toBe(202);
    expect(response.json().state).toBe("making");

    const row = await db.selectFrom("exports").selectAll().where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(row.state).toBe("making");
    // A key of its own, wrapped: 32 bytes would be the key itself.
    expect(row.wrapped_key.length).toBeGreaterThan(32);

    const build = await jobs("export.build");
    expect(build).toEqual([{ account_id: me, payload: { exportId: row.id } }]);
    const notice = await jobs("email.export_requested");
    expect(notice).toHaveLength(1);
    expect(notice[0]!.account_id).toBe(me);

    const events = await db.selectFrom("analytics_events").select(["name", "properties"]).where("name", "=", "export_requested").execute();
    expect(events).toEqual([{ name: "export_requested", properties: {} }]);
    expect((await read(cookie)).state).toBe("making");
  });

  it("refuses a second inside seven days, whatever state the first is in", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await ask(cookie);
    const again = await ask(cookie);
    expect(again.statusCode).toBe(409);
    const body = again.json() as { error: string; nextAt: string };
    expect(body.error).toBe("too_soon");
    const row = await db.selectFrom("exports").select("requested_at").executeTakeFirstOrThrow();
    expect(new Date(body.nextAt).getTime()).toBe(row.requested_at!.getTime() + 7 * 86_400_000);

    for (const state of ["ready", "gone"] as const) {
      await db.updateTable("exports").set({ state }).execute();
      expect((await ask(cookie)).statusCode).toBe(409);
    }
    expect(await jobs("export.build")).toHaveLength(1);
  });

  it("starts another once seven days have passed, and the old parts are handed to destroy", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await ask(cookie);
    const old = await db
      .updateTable("exports")
      .set({ state: "ready", parts: 3, requested_at: sql`now() - interval '8 days'`, expires_at: sql`now() - interval '1 day'` })
      .returning("id")
      .executeTakeFirstOrThrow();
    expect((await ask(cookie)).statusCode).toBe(202);
    const row = await db.selectFrom("exports").select(["id", "state"]).executeTakeFirstOrThrow();
    expect(row.id).not.toBe(old.id);
    expect(row.state).toBe("making");
    expect((await jobs("export.destroy")).map((job) => job.payload)).toEqual([{ id: old.id, parts: 3 }]);
  });

  it("does not hold the clock for a build that failed", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await ask(cookie);
    await db.updateTable("exports").set({ state: "failed", requested_at: null, expires_at: null }).execute();
    expect(await read(cookie)).toEqual({ state: "failed", readyAt: null, expiresAt: null, nextAt: null });
    expect((await ask(cookie)).statusCode).toBe(202);
  });
});

describe("what the row says", () => {
  it("is idle with nothing asked for", async () => {
    const me = await account();
    expect(await read(await signIn(me))).toEqual({ state: "idle", readyAt: null, expiresAt: null, nextAt: null });
  });

  it("is ready with the day it was made and the day it goes", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await ask(cookie);
    const row = await db
      .updateTable("exports")
      .set({ state: "ready", ready_at: sql`now()` })
      .returning(["ready_at", "expires_at"])
      .executeTakeFirstOrThrow();
    expect(await read(cookie)).toEqual({
      state: "ready",
      readyAt: row.ready_at!.toISOString(),
      expiresAt: row.expires_at!.toISOString(),
      nextAt: null,
    });
  });

  it("is waiting once the copy is deleted, until the seven days are up", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await ask(cookie);
    await db.updateTable("exports").set({ state: "ready", parts: 2, ready_at: sql`now()` }).execute();

    const gone = await app.inject({ method: "DELETE", url: "/api/me/export", headers: { cookie } });
    expect(gone.statusCode).toBe(204);
    const row = await db.selectFrom("exports").select(["id", "state", "requested_at"]).executeTakeFirstOrThrow();
    expect(row.state).toBe("gone");
    expect((await jobs("export.destroy")).map((job) => job.payload)).toEqual([{ id: row.id, parts: 2 }]);

    const waiting = await read(cookie);
    expect(waiting.state).toBe("waiting");
    expect(new Date(waiting.nextAt!).getTime()).toBe(row.requested_at!.getTime() + 7 * 86_400_000);

    await db.updateTable("exports").set({ requested_at: sql`now() - interval '8 days'` }).execute();
    expect((await read(cookie)).state).toBe("idle");
  });

  it("is idle again once a ready copy is past its seven days", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await ask(cookie);
    await db
      .updateTable("exports")
      .set({ state: "ready", requested_at: sql`now() - interval '8 days'`, expires_at: sql`now() - interval '1 day'` })
      .execute();
    expect((await read(cookie)).state).toBe("idle");
  });

  it("is refused from another origin when deleting, and deleting nothing is fine", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const none = await app.inject({ method: "DELETE", url: "/api/me/export", headers: { cookie } });
    expect(none.statusCode).toBe(204);
    await ask(cookie);
    const crossed = await app.inject({
      method: "DELETE",
      url: "/api/me/export",
      headers: { cookie, origin: "https://elsewhere.example" },
    });
    expect(crossed.statusCode).toBe(403);
    expect((await db.selectFrom("exports").select("state").executeTakeFirstOrThrow()).state).toBe("making");
  });
});

describe("the notice", () => {
  it("goes to the account's address and says when, with nothing of what the copy holds", async () => {
    const me = await account();
    const cookie = await signIn(me);
    await ask(cookie);
    const [job] = await jobs("email.export_requested");
    const mailer = new MemoryMailer();
    await handlers["email.export_requested"]!(job!.payload as Record<string, unknown>, { mailer }, me);
    const address = await db.selectFrom("accounts").select("email").where("id", "=", me).executeTakeFirstOrThrow();
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe(address.email);
    expect(mailer.sent[0]!.subject).toBe("A copy of your offload was asked for");
    expect(mailer.sent[0]!.slots.body).toMatch(/ at \d\d:\d\d /);
    expect(mailer.sent[0]!.slots.body).toContain("hello@offload.club");
  });
});
