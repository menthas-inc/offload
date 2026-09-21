// 022. Sharing by saying it: the mention, the tool, the proposal, the tap.
//
// AC-24 a said share is proposed with the line, never done; the tap does
//       what the sheet does, after every check; Not now leaves nothing.
// AC-25 the name is resolved on the server; two matches ask, none says so.
// AC-26 the proposal survives a reload and is answerable once.
// AC-27 a mention is kept only for an accepted connection.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { answerQuestion, takeDump } from "../src/routes/dumps.js";
import { waitingSharesFor } from "../src/threads/proposals.js";
import { memberOf } from "../src/threads/access.js";

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
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("pending_shares").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_keys").execute();
  await db.deleteFrom("account_keys").execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("connections").execute();
  await db.deleteFrom("accounts").execute();
});

async function person(name: string): Promise<{ id: string; defaultThreadId: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  await db.updateTable("accounts").set({ state: "active", display_name: name }).where("id", "=", outcome.accountId).execute();
  const row = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", outcome.accountId).executeTakeFirstOrThrow();
  return { id: outcome.accountId, defaultThreadId: row.default_thread_id! };
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function connect(a: string, b: string) {
  await db.insertInto("connections").values(a < b ? { account_a: a, account_b: b } : { account_a: b, account_b: a }).execute();
}

async function thread(accountId: string, name = "Lisbon trip"): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

/** A dump through the real path, and the job the worker would hold. */
async function dump(accountId: string, text: string, mentions: { accountId: string; name: string }[] = []) {
  const sent = await takeDump(accountId, text, undefined, undefined, undefined, null, mentions);
  const job = await db.selectFrom("jobs").select("id").where("kind", "=", "dump.answer").orderBy("id", "desc").executeTakeFirstOrThrow();
  await db.updateTable("jobs").set({ state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 }).where("id", "=", job.id).execute();
  return { messageId: sent.messageId, conversationId: sent.conversationId, turnId: sent.turnId, jobId: job.id };
}

const tool = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/tool-call",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: payload as Record<string, unknown>,
  });

async function state(threadId: string, accountId: string) {
  const row = await db.selectFrom("thread_members").select("state").where("thread_id", "=", threadId).where("account_id", "=", accountId).executeTakeFirst();
  return row?.state ?? null;
}

describe("the mention (AC-27)", () => {
  it("keeps a mention that names an accepted connection and drops the rest, words intact", async () => {
    const jo = await person("Jo Martins");
    const sam = await person("Sam Ibekwe");
    const stranger = await person("Stranger");
    await connect(jo.id, sam.id);
    const { messageId } = await dump(jo.id, "share Lisbon trip with @Sam Ibekwe and @Stranger", [
      { accountId: sam.id, name: "Sam Ibekwe" },
      { accountId: stranger.id, name: "Stranger" },
      { accountId: sam.id, name: "Sam Ibekwe" },
    ]);
    const row = await db.selectFrom("messages").select(["text", "attrs"]).where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(row.text).toBe("share Lisbon trip with @Sam Ibekwe and @Stranger");
    expect(row.attrs).toEqual({ mentions: [{ accountId: sam.id, name: "Sam Ibekwe" }] });
  });

  it("writes no attrs when nothing survives", async () => {
    const jo = await person("Jo Martins");
    const stranger = await person("Stranger");
    const { messageId } = await dump(jo.id, "hello @Stranger", [{ accountId: stranger.id, name: "Stranger" }]);
    const row = await db.selectFrom("messages").select("attrs").where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(row.attrs).toEqual({});
  });
});

describe("the tool (AC-24, AC-25)", () => {
  it("proposes for one match, with the line rendered from the rows", async () => {
    const jo = await person("Jo Martins");
    const sam = await person("Sam Ibekwe");
    await connect(jo.id, sam.id);
    const lisbon = await thread(jo.id);
    const { messageId, jobId } = await dump(jo.id, "share Lisbon trip with Sam");
    const response = await tool({ tool: "share_thread", jobId, toolCallId: "t1", threadId: lisbon, person: "sam" });
    expect(response.json()).toEqual({ ok: true, waitingForThem: true, because: "Share Lisbon trip with Sam Ibekwe?" });
    // Nothing shared.
    expect(await state(lisbon, sam.id)).toBeNull();
    const waiting = await waitingSharesFor([messageId]);
    expect(waiting.get(messageId)).toMatchObject({ because: "Share Lisbon trip with Sam Ibekwe?", kind: "share" });
    // The whole name and the initials match too; a mention's id does.
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t2", threadId: lisbon, person: "Sam Ibekwe" })).json().ok).toBe(true);
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t3", threadId: lisbon, person: "SO" })).json().ok).toBe(true);
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t4", threadId: lisbon, person: sam.id })).json().ok).toBe(true);
  });

  it("refuses a stranger, a substring, the default thread, a thread they are not in, and a quick add", async () => {
    const jo = await person("Jo Martins");
    const sam = await person("Sam Ibekwe");
    const samira = await person("Samira Lee");
    const ana = await person("Ana Duarte");
    await connect(jo.id, samira.id);
    await connect(jo.id, ana.id);
    const lisbon = await thread(jo.id);
    const theirs = await thread(ana.id, "Ana's");
    const { jobId } = await dump(jo.id, "share it with Sam");
    // Sam is not a connection; Samira is, and "Sam" is not her.
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t1", threadId: lisbon, person: "Sam" })).json()).toEqual({ ok: false, error: "unknown_person" });
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t2", threadId: lisbon, person: sam.id })).json()).toEqual({ ok: false, error: "unknown_person" });
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t3", threadId: jo.defaultThreadId, person: "Samira" })).json()).toEqual({ ok: false, error: "default_thread" });
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t4", threadId: theirs, person: "Samira" })).json()).toEqual({ ok: false, error: "unknown_thread" });
    // Already in.
    await db.insertInto("thread_members").values({ thread_id: lisbon, account_id: ana.id, state: "accepted" }).execute();
    expect((await tool({ tool: "share_thread", jobId, toolCallId: "t5", threadId: lisbon, person: "Ana" })).json()).toEqual({ ok: false, error: "already_in" });
    expect(await db.selectFrom("pending_shares").select("id").execute()).toHaveLength(0);
    // A quick add may not share.
    const quick = await db
      .insertInto("jobs")
      .values({ kind: "thread.quick_add", account_id: jo.id, payload: JSON.stringify({ threadId: lisbon }), priority: 10, run_after: new Date(), state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 })
      .returning("id")
      .executeTakeFirstOrThrow();
    expect((await tool({ tool: "share_thread", jobId: quick.id, toolCallId: "t6", threadId: lisbon, person: "Samira" })).json()).toEqual({ ok: false, error: "unknown_thread" });
  });

  it("asks which, from the database, when two connections match, and the tap is the share", async () => {
    const jo = await person("Jo Martins");
    const ibekwe = await person("Sam Ibekwe");
    const lee = await person("Sam Lee");
    await connect(jo.id, ibekwe.id);
    await connect(jo.id, lee.id);
    const lisbon = await thread(jo.id);
    const { jobId, turnId } = await dump(jo.id, "share Lisbon trip with Sam");
    const response = await tool({ tool: "share_thread", jobId, toolCallId: "t1", threadId: lisbon, person: "Sam" });
    expect(response.json()).toEqual({ ok: true, asked: true });
    const q = await db.selectFrom("questions").selectAll().where("turn_id", "=", turnId).executeTakeFirstOrThrow();
    expect(q.field).toBe("person");
    expect(q.state).toBe("open");
    expect(q.text).toBe('Share "Lisbon trip" with which Sam?');
    const options = q.options as { label: string; value: string | null }[];
    expect(options.map((o) => o.label)).toEqual(["Sam Lee", "Sam Ibekwe", "Not that"]);
    expect(q.previous_value).toEqual({ share: lisbon });
    expect(await db.selectFrom("pending_shares").select("id").execute()).toHaveLength(0);

    const answered = await answerQuestion(jo.id, q.id, 1);
    expect(answered?.applied).toBe(true);
    expect(await state(lisbon, ibekwe.id)).toBe("pending");
    expect(await state(lisbon, lee.id)).toBeNull();
    expect(await answerQuestion(jo.id, q.id, 0)).toBeNull();
  });

  it("the way out shares nobody", async () => {
    const jo = await person("Jo Martins");
    const ibekwe = await person("Sam Ibekwe");
    const lee = await person("Sam Lee");
    await connect(jo.id, ibekwe.id);
    await connect(jo.id, lee.id);
    const lisbon = await thread(jo.id);
    const { jobId, turnId } = await dump(jo.id, "share Lisbon trip with Sam");
    await tool({ tool: "share_thread", jobId, toolCallId: "t1", threadId: lisbon, person: "Sam" });
    const q = await db.selectFrom("questions").select(["id", "options"]).where("turn_id", "=", turnId).executeTakeFirstOrThrow();
    const last = (q.options as unknown[]).length - 1;
    const out = await answerQuestion(jo.id, q.id, last);
    expect(out?.applied).toBe(false);
    expect(await state(lisbon, ibekwe.id)).toBeNull();
    expect(await state(lisbon, lee.id)).toBeNull();
  });
});

describe("the tap (AC-24, AC-26)", () => {
  async function proposal(jo: { id: string }, sam: { id: string }, lisbon: string) {
    const { messageId, jobId } = await dump(jo.id, "share Lisbon trip with Sam");
    const response = await tool({ tool: "share_thread", jobId, toolCallId: "t1", threadId: lisbon, person: "Sam" });
    expect(response.json().waitingForThem).toBe(true);
    const waiting = (await waitingSharesFor([messageId])).get(messageId)!;
    return { messageId, pendingId: waiting.id };
  }

  it("Share creates the pending membership as the sheet would, once", async () => {
    const jo = await person("Jo Martins");
    const sam = await person("Sam Ibekwe");
    await connect(jo.id, sam.id);
    const lisbon = await thread(jo.id);
    const { messageId, pendingId } = await proposal(jo, sam, lisbon);
    const cookie = await signIn(jo.id);
    // On the page, before the tap.
    const page = await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie } });
    expect(page.statusCode).toBe(200);
    const mine = page.json().messages.find((m: { id: string }) => m.id === messageId);
    expect(mine.waiting).toEqual({ id: pendingId, because: "Share Lisbon trip with Sam Ibekwe?", kind: "share" });

    const confirmed = await app.inject({ method: "POST", url: `/v1/shares/${pendingId}/confirm`, headers: { cookie } });
    expect(confirmed.statusCode).toBe(200);
    expect(await state(lisbon, sam.id)).toBe("pending");
    expect(await memberOf(sam.id, lisbon)).toBe(false);
    const row = await db.selectFrom("thread_members").select(["invited_by", "preview"]).where("thread_id", "=", lisbon).where("account_id", "=", sam.id).executeTakeFirstOrThrow();
    expect(row.invited_by).toBe(jo.id);
    expect(row.preview).toEqual({ count: 0, titles: [] });
    // Gone from the page, and a second tap is not found.
    expect((await waitingSharesFor([messageId])).size).toBe(0);
    const again = await app.inject({ method: "POST", url: `/v1/shares/${pendingId}/confirm`, headers: { cookie } });
    expect(again.statusCode).toBe(404);
    // Somebody else's is not found either.
    const other = await signIn(sam.id);
    const theirs = await app.inject({ method: "POST", url: `/v1/shares/${pendingId}/decline`, headers: { cookie: other } });
    expect(theirs.statusCode).toBe(404);
  });

  it("Not now, expiry, and a fact that changed each leave nothing behind", async () => {
    const jo = await person("Jo Martins");
    const sam = await person("Sam Ibekwe");
    await connect(jo.id, sam.id);
    const lisbon = await thread(jo.id);
    const cookie = await signIn(jo.id);

    const a = await proposal(jo, sam, lisbon);
    expect((await app.inject({ method: "POST", url: `/v1/shares/${a.pendingId}/decline`, headers: { cookie } })).statusCode).toBe(200);
    expect(await state(lisbon, sam.id)).toBeNull();
    expect((await waitingSharesFor([a.messageId])).size).toBe(0);

    const b = await proposal(jo, sam, lisbon);
    await db.updateTable("pending_shares").set({ expires_at: sql`now() - interval '1 minute'` }).where("id", "=", b.pendingId).execute();
    expect((await waitingSharesFor([b.messageId])).size).toBe(0);
    expect((await app.inject({ method: "POST", url: `/v1/shares/${b.pendingId}/confirm`, headers: { cookie } })).statusCode).toBe(404);

    const c = await proposal(jo, sam, lisbon);
    await db.deleteFrom("connections").execute();
    expect((await app.inject({ method: "POST", url: `/v1/shares/${c.pendingId}/confirm`, headers: { cookie } })).statusCode).toBe(404);
    expect(await state(lisbon, sam.id)).toBeNull();
    const dead = await db.selectFrom("pending_shares").select("declined_at").where("id", "=", c.pendingId).executeTakeFirstOrThrow();
    expect(dead.declined_at).not.toBeNull();
  });
});
