// 050. Found actions on any row: the Core API re-checks every entry the worker
// resolved (scheme and shape, label, kind against the url, source, sender),
// writes it on whatever row the turn files, serves kind, source and sender on
// the wire, keeps a survivor whole when its neighbour is removed, and leaks no
// label or destination (SEC-2, OFF-1, OFF-3).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSignature } from "better-auth/crypto";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { uuidv7 } from "../src/uuid.js";
import { promote } from "../src/admin/promote.js";
import { takeDump } from "../src/routes/dumps.js";
import { resetObjectStore } from "../src/blobs/store.js";

await migrate(() => {});

const HERE = dirname(fileURLToPath(import.meta.url));
const png = readFileSync(join(HERE, "fixtures/photos", "list.png"));

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
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function person(): Promise<{ id: string; defaultThreadId: string }> {
  const outcome = await promote(`${uuidv7()}@example.test`);
  if (outcome.status !== "invited") throw new Error(outcome.status);
  await db.updateTable("accounts").set({ state: "active" }).where("id", "=", outcome.accountId).execute();
  const row = await db.selectFrom("accounts").select("default_thread_id").where("id", "=", outcome.accountId).executeTakeFirstOrThrow();
  return { id: outcome.accountId, defaultThreadId: row.default_thread_id! };
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) }).execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function runningJob(messageId: string): Promise<string> {
  const rows = await db.selectFrom("jobs").select(["id", "payload"]).where("kind", "=", "dump.answer").execute();
  const job = rows.find((r) => (r.payload as { messageId?: string }).messageId === messageId);
  if (!job) throw new Error("no job");
  await db.updateTable("jobs").set({ state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 }).where("id", "=", job.id).execute();
  return job.id;
}

const tool = (payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/internal/v1/tool-call", headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` }, payload });

interface Filed {
  cookie: string;
  messageId: string;
  contentId: string;
  attrs: unknown;
}

/** File one row from a dump, with the worker's resolved actions on the
 *  envelope. With `picture`, the dump carries a screenshot and the row is
 *  filed carrying it. */
async function fileWith(me: { id: string; defaultThreadId: string }, actions: unknown, picture = false): Promise<Filed> {
  const cookie = await signIn(me.id);
  const blobIds: string[] = [];
  if (picture) {
    const data = new FormData();
    data.append("clientKey", uuidv7());
    data.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "Screenshot.png");
    const res = await app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: data });
    blobIds.push(res.json().blobId as string);
  }
  const sent = await takeDump(me.id, picture ? "" : "call Dana 212 555 0142", uuidv7(), undefined, { blobIds, viaShare: false });
  const jobId = await runningJob(sent.messageId);
  const res = await tool({
    tool: "add_content",
    jobId,
    toolCallId: "f1",
    threadId: me.defaultThreadId,
    title: "Call Dana about the venue",
    type: "task",
    ...(picture ? { photo: 1, body: "A message\nText: Dana R. 212 555 0142" } : {}),
    worker: { actions },
  });
  expect(res.json().ok).toBe(true);
  const row = await db.selectFrom("content").select(["id", "attrs"]).where("id", "=", res.json().contentId).executeTakeFirstOrThrow();
  return { cookie, messageId: sent.messageId, contentId: row.id, attrs: row.attrs };
}

type Entry = { label: string; url: string; kind?: string; source?: string; sender?: string | null };
const A = (attrs: unknown): Entry[] => (attrs as { actions?: Entry[] })?.actions ?? [];

const CALL = { label: "Call Dana", url: "tel:+12125550142", kind: "call", source: "typed" };
const MAIL = { label: "Email Ana", url: "mailto:ana@flat.co", kind: "email", source: "mail", sender: "dhl.com" };

describe("050 the Core API persists found actions on any row (T9)", () => {
  it("writes a call and an email on a task row, with kind, source and sender", async () => {
    const me = await person();
    const { attrs } = await fileWith(me, [CALL, MAIL]);
    expect(A(attrs)).toEqual([CALL, MAIL]);
  });

  it("drops every refused tel and mailto form", async () => {
    const me = await person();
    const refused = [
      "tel:*21*12125550142#",
      "tel:+12125550142;ext=1",
      "tel:+12125550142,1",
      "tel:%2B12125550142",
      "mailto:a@b.co?bcc=x@y.zz",
      "mailto:a@b.co%0Abcc:x@y.zz",
      "sms:+12125550142",
    ].map((url) => ({ label: "Go", url, kind: url.startsWith("tel:") ? "call" : "email", source: "typed" }));
    const { attrs } = await fileWith(me, [...refused, CALL]);
    expect(A(attrs)).toEqual([CALL]);
  });

  it("drops a label carrying a destination, a kind that does not match the url, and a bad source or sender", async () => {
    const me = await person();
    const { attrs } = await fileWith(me, [
      { ...CALL, label: "Call 212 555 0142" },
      { ...CALL, kind: "open" },
      { ...CALL, source: "model" },
      { ...MAIL, sender: "x".repeat(300) },
      MAIL,
    ]);
    expect(A(attrs)).toEqual([MAIL]);
  });

  it("keeps at most two", async () => {
    const me = await person();
    const { attrs } = await fileWith(me, [CALL, MAIL, { label: "Track", url: "https://dhl.com/t", kind: "open", source: "mail", sender: "dhl.com" }]);
    expect(A(attrs)).toHaveLength(2);
  });

  it("reads an older worker's label and url as an open action from a PDF", async () => {
    const me = await person();
    const { attrs } = await fileWith(me, [{ label: "Check in", url: "https://checkin.example-air.com/X" }]);
    expect(A(attrs)).toEqual([{ label: "Check in", url: "https://checkin.example-air.com/X", kind: "open", source: "pdf" }]);
  });
});

describe("050 the wire (T10)", () => {
  const rowOf = async (cookie: string, threadId: string, id: string) =>
    (await app.inject({ method: "GET", url: `/v1/threads/${threadId}/content`, headers: { cookie } })).json().rows.find((r: { id: string }) => r.id === id);

  it("serves kind, source and sender", async () => {
    const me = await person();
    const filed = await fileWith(me, [CALL, MAIL]);
    const row = await rowOf(filed.cookie, me.defaultThreadId, filed.contentId);
    expect(row.actions).toEqual([
      { ...CALL, sender: null },
      { ...MAIL },
    ]);
  });

  it("gives a 044 row the open and pdf defaults, and drops a stale entry that fails the rule", async () => {
    const me = await person();
    const filed = await fileWith(me, []);
    await db
      .updateTable("content")
      .set({ attrs: sql`attrs || ${JSON.stringify({ actions: [{ label: "Check in", url: "https://a.example/x" }, { label: "Dial", url: "tel:*21*1#" }] })}::jsonb` })
      .where("id", "=", filed.contentId)
      .execute();
    const row = await rowOf(filed.cookie, me.defaultThreadId, filed.contentId);
    expect(row.actions).toEqual([{ label: "Check in", url: "https://a.example/x", kind: "open", source: "pdf", sender: null }]);
  });

  it("carries a picture's row's actions on the picture in the conversation", async () => {
    const me = await person();
    const picked = { label: "Call Dana", url: "tel:+12125550142", kind: "call", source: "picture" };
    const filed = await fileWith(me, [picked], true);
    const tail = (await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie: filed.cookie } })).json();
    const message = tail.messages.find((m: { id: string }) => m.id === filed.messageId);
    const photo = message.photos.find((p: { kind: string }) => p.kind === "image");
    expect(photo.actions).toEqual([{ ...picked, sender: null }]);
  });

  it("offers nothing under a picture whose row was deleted", async () => {
    const me = await person();
    const picked = { label: "Call Dana", url: "tel:+12125550142", kind: "call", source: "picture" };
    const filed = await fileWith(me, [picked], true);
    await db.updateTable("content").set({ deleted_at: new Date() }).where("id", "=", filed.contentId).execute();
    const tail = (await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie: filed.cookie } })).json();
    const message = tail.messages.find((m: { id: string }) => m.id === filed.messageId);
    expect(message.photos.find((p: { kind: string }) => p.kind === "image").actions).toBeUndefined();
  });

  it("does not let a non-member read the row", async () => {
    const me = await person();
    await fileWith(me, [CALL]);
    const stranger = await person();
    const res = await app.inject({ method: "GET", url: `/v1/threads/${me.defaultThreadId}/content`, headers: { cookie: await signIn(stranger.id) } });
    expect(res.statusCode).toBe(404);
  });
});

describe("050 Remove keeps the survivor whole (T11)", () => {
  const forget = (cookie: string, id: string, url: string) =>
    app.inject({ method: "POST", url: `/v1/content/${id}/actions/forget`, headers: { cookie }, payload: { url } });
  const restore = (cookie: string, id: string, url: string) =>
    app.inject({ method: "POST", url: `/v1/content/${id}/actions/restore`, headers: { cookie }, payload: { url } });
  const stored = async (id: string) => A((await db.selectFrom("content").select("attrs").where("id", "=", id).executeTakeFirstOrThrow()).attrs);

  it("removing one of two leaves the other's kind, source and sender", async () => {
    const me = await person();
    const filed = await fileWith(me, [CALL, MAIL]);
    expect((await forget(filed.cookie, filed.contentId, CALL.url)).statusCode).toBe(200);
    expect(await stored(filed.contentId)).toEqual([MAIL]);
  });

  it("removing one keeps a neighbour today's rules would refuse, as it was stored", async () => {
    const me = await person();
    const filed = await fileWith(me, [CALL]);
    const legacy = { label: "Open lufthansa.com", url: "https://a.example/x" };
    await db
      .updateTable("content")
      .set({ attrs: sql`jsonb_set(attrs, '{actions}', (attrs->'actions') || ${JSON.stringify([legacy])}::jsonb)` })
      .where("id", "=", filed.contentId)
      .execute();
    await forget(filed.cookie, filed.contentId, CALL.url);
    expect(await stored(filed.contentId)).toEqual([legacy]);
  });

  it("restore brings the whole entry back", async () => {
    const me = await person();
    const filed = await fileWith(me, [CALL, MAIL]);
    await forget(filed.cookie, filed.contentId, CALL.url);
    await restore(filed.cookie, filed.contentId, CALL.url);
    expect(await stored(filed.contentId)).toEqual([MAIL, CALL]);
  });
});

describe("050 no label or destination leaks (T12)", () => {
  it("keeps them out of analytics, the search column and the embed jobs", async () => {
    const me = await person();
    const filed = await fileWith(me, [CALL, MAIL]);
    const needles = ["2125550142", "ana@flat.co", "Email Ana"];
    const events = JSON.stringify(await db.selectFrom("analytics_events").selectAll().execute());
    for (const needle of needles) expect(events).not.toContain(needle);
    const row = await db.selectFrom("content").select(sql<string>`search_text::text`.as("txt")).where("id", "=", filed.contentId).executeTakeFirstOrThrow();
    for (const needle of ["ana@flat.co", "email ana"]) expect(row.txt.toLowerCase()).not.toContain(needle);
    const jobs = JSON.stringify(await db.selectFrom("jobs").select("payload").where("kind", "=", "embed.content").execute());
    for (const needle of needles) expect(jobs).not.toContain(needle);
  });
});
