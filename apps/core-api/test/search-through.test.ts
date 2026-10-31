// 049. A thread's content read back to one row, so Search can open at it.
//
// AC-8   a row further back than the first page is in the read.
// AC-9   an archived row, read with archived on.
// AC-12  a row that is not there falls back to the first page.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { env } from "../src/env.js";
import { buildApp, type App } from "../src/app.js";
import { THREAD_LIMITS } from "../src/routes/threads.js";
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
  await wipe();
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

async function thread(accountId: string): Promise<string> {
  const row = await db.insertInto("threads").values({ created_by_account_id: accountId, name: "Long" }).returning("id").executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

/** `count` rows, oldest first; their ids in that order. */
async function rows(threadId: string, accountId: string, count: number, extra: Record<string, unknown> = {}): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const row = await db
      .insertInto("content")
      .values({ id: uuidv7(), thread_id: threadId, account_id: accountId, title: `Row ${i}`, type: "task", ...extra })
      .returning("id")
      .executeTakeFirstOrThrow();
    ids.push(row.id);
  }
  return ids;
}

type Page = { rows: { id: string }[]; nextCursor: string | null };
const read = async (cookie: string, threadId: string, query: string): Promise<Page> =>
  (await app.inject({ method: "GET", url: `/v1/threads/${threadId}/content?${query}`, headers: { cookie } })).json() as Page;

describe("content read through a row", () => {
  it("reads back to a row past the first page, and pages on from it", async () => {
    const me = await account();
    const t = await thread(me);
    const ids = await rows(t, me, 100);
    const cookie = await signIn(me);
    const target = ids[100 - 60]!; // sixty back from the newest
    const page = await read(cookie, t, `through=${target}`);
    expect(page.rows).toHaveLength(60);
    expect(page.rows.at(-1)!.id).toBe(target);
    expect(page.nextCursor).toBe(target);
    const next = await read(cookie, t, `cursor=${page.nextCursor}`);
    expect(next.rows[0]!.id).toBe(ids[100 - 61]);
  });

  it("falls back to the first page for a row too far back, another thread's, deleted or in the other pile", async () => {
    const me = await account();
    const t = await thread(me);
    const other = await thread(me);
    const ids = await rows(t, me, 120);
    const [elsewhere] = await rows(other, me, 1);
    const [deleted] = await rows(t, me, 1, { deleted_at: sql`now()` });
    const cookie = await signIn(me);
    for (const through of [ids[0]!, elsewhere!, deleted!]) {
      const page = await read(cookie, t, `through=${through}`);
      expect(page.rows, through).toHaveLength(THREAD_LIMITS.PAGE);
    }
    const live = ids.at(-1)!;
    const archived = await read(cookie, t, `through=${live}&archived=true`);
    expect(archived.rows).toEqual([]);
  });

  it("reads an archived row with archived on", async () => {
    const me = await account();
    const t = await thread(me);
    const old = await rows(t, me, 40, { archived_at: sql`now()` });
    await rows(t, me, 5);
    const cookie = await signIn(me);
    const page = await read(cookie, t, `through=${old[2]}&archived=true`);
    expect(page.rows).toHaveLength(38);
    expect(page.rows.at(-1)!.id).toBe(old[2]);
  });

  it("is not hidden by a label filter", async () => {
    const me = await account();
    const t = await thread(me);
    const ids = await rows(t, me, 3);
    const cookie = await signIn(me);
    const page = await read(cookie, t, `through=${ids[0]}&unlabelled=false&labels=${uuidv7()}`);
    expect(page.rows.map((r) => r.id)).toContain(ids[0]);
  });

  it("is still the member's read only", async () => {
    const me = await account();
    const stranger = await account();
    const t = await thread(me);
    const ids = await rows(t, me, 3);
    const response = await app.inject({ method: "GET", url: `/v1/threads/${t}/content?through=${ids[0]}`, headers: { cookie: await signIn(stranger) } });
    expect(response.statusCode).toBe(404);
  });

  it("reads Not in a thread back to a row too", async () => {
    const me = await account();
    const own = await thread(me);
    await db.updateTable("accounts").set({ default_thread_id: own }).where("id", "=", me).execute();
    const ids = await rows(own, me, 70);
    const cookie = await signIn(me);
    const target = ids[70 - 50]!;
    type Loose = { rows: { kind: string; row?: { id: string } }[] };
    const idsOf = (page: Loose) => page.rows.map((entry) => entry.row?.id);
    const first = (await app.inject({ method: "GET", url: "/v1/loose", headers: { cookie } })).json() as Loose;
    expect(idsOf(first)).not.toContain(target);
    const page = (await app.inject({ method: "GET", url: `/v1/loose?through=${target}`, headers: { cookie } })).json() as Loose;
    expect(idsOf(page)).toContain(target);
    const elsewhere = await rows(await thread(me), me, 1);
    const fallback = (await app.inject({ method: "GET", url: `/v1/loose?through=${elsewhere[0]}`, headers: { cookie } })).json() as Loose;
    expect(fallback.rows).toHaveLength(first.rows.length);
  });
});
