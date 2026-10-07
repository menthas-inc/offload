// 040 part A. The Memories tab's routes.
//
// AC-2 to AC-5 through HTTP; AC-7 every route is the session's account only,
// and a thread note's id or another account's memory is not found; AC-8 JSON
// bodies only, and no memory's words in any log line.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { env } from "../src/env.js";
import { buildApp, type App } from "../src/app.js";
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
  await db.deleteFrom("memory_forgotten").execute();
  await wipe();
});

async function account(name = "Ana"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.test`, display_name: name, state: "active" } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

const call = (cookie: string, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

describe("the session's memories", () => {
  it("needs a session", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/memories" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/memories", payload: { text: "Hi." } })).statusCode).toBe(401);
  });

  it("adds, lists, changes, forgets and puts back", async () => {
    const me = await signIn(await account());
    const added = await call(me, "POST", "/v1/memories", { text: "My sister is Rina.", kind: "people" });
    expect(added.statusCode).toBe(200);
    const { id } = added.json() as { ok: true; id: string };

    const listed = (await call(me, "GET", "/v1/memories")).json();
    expect(listed).toMatchObject({ full: false, rulesFull: false, memories: [{ id, kind: "people", text: "My sister is Rina.", origin: "stated", source: { type: "none" } }] });

    expect((await call(me, "PATCH", `/v1/memories/${id}`, { text: "My sister is Rina Sen." })).json()).toEqual({ ok: true, id });
    expect((await call(me, "PATCH", `/v1/memories/${id}`, {})).statusCode).toBe(400);

    expect((await call(me, "DELETE", `/v1/memories/${id}`)).json()).toEqual({ ok: true, id });
    expect((await call(me, "GET", "/v1/memories")).json()).toMatchObject({ memories: [] });
    expect((await call(me, "POST", `/v1/memories/${id}/restore`)).json()).toEqual({ ok: true, id });
    expect((await call(me, "GET", "/v1/memories")).json()).toMatchObject({ memories: [{ id, text: "My sister is Rina Sen.", changed: true }] });
  });

  it("refuses in a 200 the editor can show under the field", async () => {
    const me = await signIn(await account());
    await call(me, "POST", "/v1/memories", { text: "My sister is Rina." });
    expect((await call(me, "POST", "/v1/memories", { text: "my sister is rina." })).json()).toEqual({ ok: false, error: "duplicate" });
    expect((await call(me, "POST", "/v1/memories", { text: "x".repeat(201) })).json()).toEqual({ ok: false, error: "too_long" });
    expect((await call(me, "POST", "/v1/memories", { text: "Meera's email is p@x.com.", kind: "people" })).json()).toEqual({ ok: false, error: "never_list" });
    expect((await call(me, "POST", "/v1/memories", { text: "Hi.", kind: "words" })).statusCode).toBe(400);
  });

  it("is not found for another account's memory, a thread note's id, or one gone past its Undo", async () => {
    const ana = await account();
    const sam = await signIn(await account("Sam"));
    const theirs = (await call(await signIn(ana), "POST", "/v1/memories", { text: "My sister is Rina." })).json() as { id: string };
    const t = await db.insertInto("threads").values({ created_by_account_id: ana, name: "Trip", last_activity_at: new Date() } as never).returning("id").executeTakeFirstOrThrow();
    const threadNote = await db
      .insertInto("notes")
      .values({ account_id: ana, scope: "thread", subject_id: t.id, kind: "going_on", text: "Flights are booked.", origin: "stated" } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    const anaCookie = await signIn(ana);
    for (const id of [theirs.id]) {
      expect((await call(sam, "PATCH", `/v1/memories/${id}`, { text: "Mine now." })).statusCode).toBe(404);
      expect((await call(sam, "DELETE", `/v1/memories/${id}`)).statusCode).toBe(404);
      expect((await call(sam, "POST", `/v1/memories/${id}/restore`)).statusCode).toBe(404);
    }
    expect((await call(sam, "GET", "/v1/memories")).json()).toMatchObject({ memories: [] });
    expect((await call(anaCookie, "PATCH", `/v1/memories/${threadNote.id}`, { text: "Changed." })).statusCode).toBe(404);
    expect((await call(anaCookie, "DELETE", `/v1/memories/${threadNote.id}`)).statusCode).toBe(404);
    expect((await call(anaCookie, "POST", `/v1/memories/${theirs.id}/restore`)).statusCode).toBe(404);
  });

  it("takes JSON only, and refuses a write from another origin", async () => {
    const me = await signIn(await account());
    const form = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: me, "content-type": "application/x-www-form-urlencoded" },
      payload: "text=Hi.",
    });
    expect(form.statusCode).toBe(415);
    const foreign = await app.inject({ method: "POST", url: "/v1/memories", headers: { cookie: me, origin: "https://elsewhere.example" }, payload: { text: "Hi." } });
    expect(foreign.statusCode).toBe(403);
  });

  it("logs the route, the outcome and the kind, never the words", async () => {
    const me = await signIn(await account());
    const log = vi.spyOn(console, "log");
    const writes = vi.spyOn(process.stdout, "write");
    const { id } = (await call(me, "POST", "/v1/memories", { text: "My sister is Rinalda.", kind: "people" })).json() as { id: string };
    await call(me, "POST", "/v1/memories", { text: "my sister is rinalda." });
    await call(me, "PATCH", `/v1/memories/${id}`, { text: "My sister is Rinaldina." });
    await call(me, "GET", "/v1/memories");
    await call(me, "DELETE", `/v1/memories/${id}`);
    const said = [...log.mock.calls.flat(), ...writes.mock.calls.flat()].map(String).join(" ");
    log.mockRestore();
    writes.mockRestore();
    expect(said).toContain('"outcome":"duplicate"');
    expect(said.toLowerCase()).not.toContain("rinald");
  });
});
