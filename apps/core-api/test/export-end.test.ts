// 035 part B. Getting the copy, and every way one ends.
//
// AC-18 only its owner, only through a session, only while it is ready.
// AC-19 gone at seven days, on Delete copy, when the person leaves or is taken
//       out of a thread it holds, and with the account.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { env } from "../src/env.js";
import { buildApp, type App } from "../src/app.js";
import { promote } from "../src/admin/promote.js";
import { objectStore, resetObjectStore } from "../src/blobs/store.js";
import { requestCopy } from "../src/exports/copy.js";
import { buildCopy } from "../src/exports/build.js";
import { deleteAccount } from "../src/accounts/delete.js";
import { takeOut } from "../src/threads/sharing.js";
import { deleteThread } from "../src/routes/threads.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
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
  resetObjectStore();
  await db.deleteFrom("exports").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("pending_revocations").execute();
  await wipe();
  await db.deleteFrom("staff").execute();
  await db.deleteFrom("jobs").execute();
});

async function person(name: string): Promise<string> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  await db.updateTable("accounts").set({ state: "active", display_name: name }).where("id", "=", outcome.accountId).execute();
  return outcome.accountId;
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function thread(name: string, ...members: string[]): Promise<string> {
  const row = await db.insertInto("threads").values({ name, created_by_account_id: members[0]! }).returning("id").executeTakeFirstOrThrow();
  for (const accountId of members) {
    await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  }
  return row.id;
}

/** A copy, made, in a few parts. */
async function copyFor(accountId: string): Promise<{ id: string; parts: number }> {
  const asked = await requestCopy(accountId);
  if (!asked.ok) throw new Error("refused");
  const { id } = await db.selectFrom("exports").select("id").where("account_id", "=", accountId).executeTakeFirstOrThrow();
  await buildCopy(id, { partBytes: 256 });
  const made = await db.selectFrom("exports").select(["state", "parts"]).where("id", "=", id).executeTakeFirstOrThrow();
  expect(made.state).toBe("ready");
  expect(made.parts).toBeGreaterThan(1);
  return { id, parts: made.parts };
}

const kept = (): string[] =>
  [...(objectStore() as unknown as { objects: Map<string, Buffer> }).objects.keys()].filter((key) => key.startsWith("exports/"));

/** Run every queued job of a kind, as the runner would. */
async function run(kind: string): Promise<number> {
  const jobs = await db.selectFrom("jobs").select(["id", "payload", "account_id"]).where("kind", "=", kind as "export.destroy").where("state", "=", "queued").execute();
  for (const job of jobs) {
    await handlers[kind]!(job.payload as Record<string, unknown>, { mailer: new MemoryMailer() }, job.account_id);
    await db.deleteFrom("jobs").where("id", "=", job.id).execute();
  }
  return jobs.length;
}

const file = (cookie?: string) =>
  app.inject({ method: "GET", url: "/api/me/export/file", headers: cookie ? { cookie } : {} });

describe("downloading the copy", () => {
  it("hands its owner one zip, as a download nothing caches", async () => {
    const me = await person("Ana Duarte");
    await copyFor(me);
    const response = await file(await signIn(me));
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="offload.zip"');
    expect(response.headers["cache-control"]).toBe("no-store");
    const row = await db.selectFrom("exports").select("byte_size").executeTakeFirstOrThrow();
    expect(response.rawPayload.length).toBe(Number(row.byte_size));
    expect(response.headers["content-length"]).toBe(String(row.byte_size));
    expect(response.rawPayload.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("is there for nobody else, and not without a session", async () => {
    const me = await person("Ana Duarte");
    const sam = await person("Sam Ibekwe");
    await copyFor(me);
    expect((await file()).statusCode).toBe(401);
    expect((await file(await signIn(sam))).statusCode).toBe(404);
  });

  it("is not there for a request another site made", async () => {
    const me = await person("Ana Duarte");
    await copyFor(me);
    const cookie = await signIn(me);
    const crossed = await app.inject({ method: "GET", url: "/api/me/export/file", headers: { cookie, "sec-fetch-site": "cross-site" } });
    expect(crossed.statusCode).toBe(404);
    const own = await app.inject({ method: "GET", url: "/api/me/export/file", headers: { cookie, "sec-fetch-site": "same-site" } });
    expect(own.statusCode).toBe(200);
  });

  it("is not there while making, once deleted, or past its seven days", async () => {
    const me = await person("Ana Duarte");
    const cookie = await signIn(me);
    expect((await file(cookie)).statusCode).toBe(404);
    await copyFor(me);
    for (const state of ["making", "failed", "gone"] as const) {
      await db.updateTable("exports").set({ state }).execute();
      expect((await file(cookie)).statusCode).toBe(404);
    }
    await db.updateTable("exports").set({ state: "ready", expires_at: sql`now() - interval '1 minute'` }).execute();
    expect((await file(cookie)).statusCode).toBe(404);
  });
});

describe("how a copy ends", () => {
  it("on Delete copy: the parts leave storage", async () => {
    const me = await person("Ana Duarte");
    await copyFor(me);
    expect(kept().length).toBeGreaterThan(1);
    const gone = await app.inject({ method: "DELETE", url: "/api/me/export", headers: { cookie: await signIn(me) } });
    expect(gone.statusCode).toBe(204);
    expect(await run("export.destroy")).toBe(1);
    expect(kept()).toEqual([]);
  });

  it("at seven days: the sweep ends it, and books itself for the next hour", async () => {
    const me = await person("Ana Duarte");
    const sam = await person("Sam Ibekwe");
    await copyFor(me);
    const fresh = await copyFor(sam);
    await db.updateTable("exports").set({ expires_at: sql`now() - interval '1 minute'` }).where("account_id", "=", me).execute();

    await handlers["export.sweep"]!({}, { mailer: new MemoryMailer() }, null);
    const mine = await db.selectFrom("exports").select("state").where("account_id", "=", me).executeTakeFirstOrThrow();
    expect(mine.state).toBe("gone");
    expect((await db.selectFrom("exports").select("state").where("id", "=", fresh.id).executeTakeFirstOrThrow()).state).toBe("ready");
    expect(await run("export.destroy")).toBe(1);
    expect(kept().every((key) => key.startsWith(`exports/${fresh.id}/`))).toBe(true);
    expect(kept()).toHaveLength(fresh.parts);

    const next = await db.selectFrom("jobs").select("run_after").where("kind", "=", "export.sweep").execute();
    expect(next).toHaveLength(1);
    const minutes = (next[0]!.run_after.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(0);
    expect(minutes).toBeLessThanOrEqual(61);
    // A second run in the same hour books nothing more.
    await handlers["export.sweep"]!({}, { mailer: new MemoryMailer() }, null);
    expect(await db.selectFrom("jobs").select("id").where("kind", "=", "export.sweep").execute()).toHaveLength(1);
  });

  it("a build that never finished is failed by the sweep, and the clock given back", async () => {
    const me = await person("Ana Duarte");
    await requestCopy(me);
    // Three parts had landed when the worker went.
    const { id } = await db
      .updateTable("exports")
      .set({ requested_at: sql`now() - interval '3 hours'`, parts: 3 })
      .returning("id")
      .executeTakeFirstOrThrow();
    await handlers["export.sweep"]!({}, { mailer: new MemoryMailer() }, null);
    const row = await db.selectFrom("exports").select(["state", "requested_at"]).executeTakeFirstOrThrow();
    expect(row).toEqual({ state: "failed", requested_at: null });
    // Every one of them is booked for removal, not the first alone.
    const booked = await db.selectFrom("jobs").select("payload").where("kind", "=", "export.destroy").execute();
    expect(booked.map((job) => job.payload)).toEqual([{ id, parts: 3 }]);
  });

  it("with the account", async () => {
    const me = await person("Ana Duarte");
    const { id, parts } = await copyFor(me);
    await deleteAccount(me);
    expect(await db.selectFrom("exports").select("id").execute()).toEqual([]);
    const jobs = await db.selectFrom("jobs").select(["payload", "account_id"]).where("kind", "=", "export.destroy").execute();
    expect(jobs).toEqual([{ payload: { id, parts }, account_id: null }]);
    await run("export.destroy");
    expect(kept()).toEqual([]);
  });

  it("when the person is taken out of a thread it holds, and not for one it does not", async () => {
    const me = await person("Ana Duarte");
    const sam = await person("Sam Ibekwe");
    const flat = await thread("The flat", sam, me);
    await copyFor(me);
    await copyFor(sam);
    const later = await thread("Made afterwards", sam, me);

    await takeOut(sam, later, me);
    expect((await db.selectFrom("exports").select("state").where("account_id", "=", me).executeTakeFirstOrThrow()).state).toBe("ready");

    await takeOut(sam, flat, me);
    expect((await db.selectFrom("exports").select("state").where("account_id", "=", me).executeTakeFirstOrThrow()).state).toBe("gone");
    // Sam is still in it, so Sam's copy stays.
    expect((await db.selectFrom("exports").select("state").where("account_id", "=", sam).executeTakeFirstOrThrow()).state).toBe("ready");
    expect(await run("export.destroy")).toBe(1);
  });

  it("when the person is taken out while the copy is still being made", async () => {
    const me = await person("Ana Duarte");
    const sam = await person("Sam Ibekwe");
    const flat = await thread("The flat", sam, me);
    await requestCopy(me);
    const { id } = await db.selectFrom("exports").select("id").where("account_id", "=", me).executeTakeFirstOrThrow();
    await takeOut(sam, flat, me);
    expect((await db.selectFrom("exports").select("state").where("id", "=", id).executeTakeFirstOrThrow()).state).toBe("gone");
    // The build finds it is no longer wanted and leaves nothing.
    await buildCopy(id, { partBytes: 256 });
    expect((await db.selectFrom("exports").select("state").where("id", "=", id).executeTakeFirstOrThrow()).state).toBe("gone");
    await run("export.destroy");
    expect(kept()).toEqual([]);
  });

  it("when the person leaves a thread it holds", async () => {
    const me = await person("Ana Duarte");
    const sam = await person("Sam Ibekwe");
    const flat = await thread("The flat", sam, me);
    await copyFor(me);
    await deleteThread(me, flat);
    expect((await db.selectFrom("exports").select("state").where("account_id", "=", me).executeTakeFirstOrThrow()).state).toBe("gone");
    expect(await run("export.destroy")).toBe(1);
    expect(kept()).toEqual([]);
  });
});
