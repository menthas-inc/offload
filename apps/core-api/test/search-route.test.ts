// 049. POST /v1/search.
//
// AC-17  the session's account only; signed out is 401.
// AC-27  the query is in no address and no log line.
// AC-6   meaning only when asked and from four letters; Voyage down is the words.
//        A timeout is the empty answer, never a 500.

import { Writable } from "node:stream";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { env } from "../src/env.js";
import { buildApp, type App } from "../src/app.js";
import * as embed from "../src/search/embed.js";
import * as page from "../src/search/page.js";
import { wipe } from "./labels-kit.js";

await migrate(() => {});

const lines: string[] = [];
let app: App;
beforeAll(async () => {
  app = await buildApp({
    logStream: new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    }),
  });
});
afterAll(async () => {
  await app.close();
  await closeDb();
});
beforeEach(async () => {
  lines.length = 0;
  await wipe();
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.test`, display_name: "Ana", state: "active" } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function lisbon(accountId: string): Promise<string> {
  const thread = await db.insertInto("threads").values({ created_by_account_id: accountId, name: "Lisbon trip" }).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: thread.id, account_id: accountId, state: "accepted" }).execute();
  await db.insertInto("content").values({ thread_id: thread.id, account_id: accountId, title: "Flight to Lisbon", type: "event" }).execute();
  return thread.id;
}

const search = (cookie: string | null, payload: object) =>
  app.inject({ method: "POST", url: "/v1/search", headers: cookie ? { cookie } : {}, payload });

describe("POST /v1/search", () => {
  it("needs a session, and takes the query only in its body", async () => {
    expect((await search(null, { q: "lisb" })).statusCode).toBe(401);
    const me = await signIn(await account());
    expect((await app.inject({ method: "GET", url: "/v1/search?q=lisb", headers: { cookie: me } })).statusCode).toBe(404);
  });

  it("answers the four groups for the session's account", async () => {
    const id = await account();
    const thread = await lisbon(id);
    const answer = await search(await signIn(id), { q: "lisb" });
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toMatchObject({
      threads: [{ id: thread, name: "Lisbon trip" }],
      loose: false,
      rows: [{ threadId: thread, title: "Flight to Lisbon", type: "event", archived: false, loose: false, dueAt: null, occursAt: null, allDay: false }],
      notes: [],
      memories: [],
    });
  });

  it("never writes the query into a log line", async () => {
    const id = await account();
    await lisbon(id);
    await search(await signIn(id), { q: "lisbon secret words" });
    await search(await signIn(id), { q: "lisbon secret words", meaning: true });
    expect(lines.join("\n")).not.toMatch(/secret words/);
    expect(lines.join("\n")).toMatch(/\/v1\/search/);
  });

  it("asks for meaning only when told to", async () => {
    const id = await account();
    await lisbon(id);
    const spy = vi.spyOn(embed, "embedQuery").mockResolvedValue(null);
    await search(await signIn(id), { q: "lisbon" });
    expect(spy).not.toHaveBeenCalled();
    await search(await signIn(id), { q: "lisbon", meaning: true });
    expect(spy).toHaveBeenCalledWith(id, "lisbon");
  });

  it("is the words answer when meaning finds no vector", async () => {
    const id = await account();
    await lisbon(id);
    vi.spyOn(embed, "embedQuery").mockResolvedValue(null);
    const cookie = await signIn(id);
    expect((await search(cookie, { q: "lisb", meaning: true })).json()).toEqual((await search(cookie, { q: "lisb" })).json());
  });

  it("answers a statement timeout as the empty answer", async () => {
    const id = await account();
    await lisbon(id);
    const cancelled = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    vi.spyOn(page, "searchPage").mockRejectedValue(cancelled);
    const answer = await search(await signIn(id), { q: "lisb" });
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({ threads: [], loose: false, rows: [], notes: [], memories: [] });
  });

  it("cuts, never refuses, a long query", async () => {
    const id = await account();
    await lisbon(id);
    expect((await search(await signIn(id), { q: "lisb " + "x".repeat(5_000) })).statusCode).toBe(200);
  });

  it("refuses a cross-site request by its Fetch Metadata", async () => {
    const id = await account();
    const answer = await app.inject({ method: "POST", url: "/v1/search", headers: { cookie: await signIn(id), "sec-fetch-site": "cross-site" }, payload: { q: "lisb" } });
    expect(answer.statusCode).toBe(403);
  });

  it("holds at most three searches in flight per account", async () => {
    const id = await account();
    await lisbon(id);
    const cookie = await signIn(id);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const real = page.searchPage;
    vi.spyOn(page, "searchPage").mockImplementation(async (...args) => {
      await held;
      return real(...args);
    });
    const four = [1, 2, 3, 4].map(() => search(cookie, { q: "lisb" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    const codes = (await Promise.all(four)).map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 200, 200, 429]);
    expect((await search(cookie, { q: "lisb" })).statusCode).toBe(200);
  });
});
