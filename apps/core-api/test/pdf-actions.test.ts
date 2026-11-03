// 044. PDF actions on the file row: the Core API reads the worker's resolved
// {label, url} list off the envelope, re-checks the scheme and label bounds,
// keeps at most two, drops a failing entry, and writes content.attrs.actions.
// The model never sets an action; only the worker's envelope does (SEC-2).

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
const pdfBytes = readFileSync(join(HERE, "fixtures/pdfs", "boarding.pdf"));

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
  const row = await db
    .selectFrom("accounts")
    .select("default_thread_id")
    .where("id", "=", outcome.accountId)
    .executeTakeFirstOrThrow();
  return { id: outcome.accountId, defaultThreadId: row.default_thread_id! };
}

async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3600_000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

async function upload(cookie: string): Promise<string> {
  const data = new FormData();
  data.append("clientKey", uuidv7());
  data.append("name", "Boarding pass.pdf");
  data.append("file", new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" }), "boarding.pdf");
  const res = await app.inject({ method: "POST", url: "/v1/blobs", headers: { cookie }, payload: data });
  return res.json().blobId as string;
}

async function runningJob(messageId: string): Promise<string> {
  const rows = await db.selectFrom("jobs").select(["id", "payload"]).where("kind", "=", "dump.answer").execute();
  const job = rows.find((r) => (r.payload as { messageId?: string }).messageId === messageId);
  if (!job) throw new Error("no job");
  await db
    .updateTable("jobs")
    .set({ state: "running", locked_at: new Date(), locked_by: "test", attempts: 1 })
    .where("id", "=", job.id)
    .execute();
  return job.id;
}

const tool = (payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/tool-call",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload,
  });

interface Filed {
  attrs: unknown;
  status: number;
  cookie: string;
  blobId: string;
  messageId: string;
  contentId: string | undefined;
}

/** File the dumped PDF as a `file` row, with the worker's resolved actions on
 *  the envelope, and return the written content row and the dump's handles. */
async function fileWithActions(
  me: { id: string; defaultThreadId: string },
  actions: unknown,
): Promise<Filed> {
  const cookie = await signIn(me.id);
  const blobId = await upload(cookie);
  const sent = await takeDump(me.id, "", uuidv7(), undefined, { blobIds: [blobId], viaShare: false });
  const jobId = await runningJob(sent.messageId);
  const res = await tool({
    tool: "add_content",
    jobId,
    toolCallId: "f1",
    threadId: me.defaultThreadId,
    title: "Boarding pass, Lisbon to London",
    type: "file",
    pdf: 1,
    worker: { actions },
  });
  const row = await db
    .selectFrom("content")
    .select(["id", "attrs"])
    .where("account_id", "=", me.id)
    .where("type", "=", "file")
    .executeTakeFirst();
  return { attrs: row?.attrs, status: res.statusCode, cookie, blobId, messageId: sent.messageId, contentId: row?.id };
}

const TWO = [
  { label: "Check in", url: "https://checkin.example-air.com/LX3K9Q" },
  { label: "Manage booking", url: "https://manage.example-air.com/LX3K9Q" },
];

// 050: stored entries carry their kind and source; a 044 worker's entry is
// written as an open action from a PDF, and the wire adds a null sender.
const A = (attrs: unknown): { label: string; url: string }[] =>
  ((attrs as { actions?: { label: string; url: string }[] })?.actions ?? []).map(({ label, url }) => ({ label, url }));
const wire = (list: { label: string; url: string }[]) =>
  list.map((a) => ({ ...a, kind: "open", source: "pdf", sender: null }));

describe("044 the Core API persists a PDF's actions", () => {
  it("writes the worker's resolved label and url to content.attrs.actions", async () => {
    const me = await person();
    const { attrs, status } = await fileWithActions(me, [
      { label: "Check in", url: "https://checkin.example-air.com/LX3K9Q" },
      { label: "Manage booking", url: "https://manage.example-air.com/LX3K9Q" },
    ]);
    expect(status).toBe(200);
    expect(A(attrs)).toEqual([
      { label: "Check in", url: "https://checkin.example-air.com/LX3K9Q" },
      { label: "Manage booking", url: "https://manage.example-air.com/LX3K9Q" },
    ]);
  });

  it("drops an action whose scheme is not http or https", async () => {
    const me = await person();
    const { attrs } = await fileWithActions(me, [
      { label: "Open", url: "javascript:alert(1)" },
      { label: "Check in", url: "https://checkin.example-air.com/LX3K9Q" },
    ]);
    expect(A(attrs)).toEqual([{ label: "Check in", url: "https://checkin.example-air.com/LX3K9Q" }]);
  });

  it("drops an action whose label is too long", async () => {
    const me = await person();
    const { attrs } = await fileWithActions(me, [
      { label: "x".repeat(25), url: "https://a.example/one" },
      { label: "Check in", url: "https://a.example/two" },
    ]);
    expect(A(attrs)).toEqual([{ label: "Check in", url: "https://a.example/two" }]);
  });

  it("keeps at most two, even if the worker sent more", async () => {
    const me = await person();
    const { attrs } = await fileWithActions(me, [
      { label: "One", url: "https://a.example/1" },
      { label: "Two", url: "https://a.example/2" },
      { label: "Three", url: "https://a.example/3" },
    ]);
    expect(A(attrs)).toHaveLength(2);
  });

  it("writes no actions when there are none", async () => {
    const me = await person();
    const { attrs } = await fileWithActions(me, []);
    expect(A(attrs)).toEqual([]);
  });
});

describe("044 the wire carries actions (T8)", () => {
  const content = (cookie: string, threadId: string) =>
    app.inject({ method: "GET", url: `/v1/threads/${threadId}/content`, headers: { cookie } });

  it("puts the row's actions on the content-row envelope, for the dumper", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    const page = (await content(filed.cookie, me.defaultThreadId)).json();
    const row = page.rows.find((r: { id: string }) => r.id === filed.contentId);
    expect(row.actions).toEqual(wire(TWO));
  });

  it("carries the same actions on the PDF in the filing reply's photos", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    const tail = (await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie: filed.cookie } })).json();
    const message = tail.messages.find((m: { id: string }) => m.id === filed.messageId);
    const pdf = message.photos.find((p: { kind: string }) => p.kind === "pdf");
    expect(pdf.actions).toEqual(wire(TWO));
  });

  it("sends no actions field for a PDF that carries none, so an older client sees nothing new", async () => {
    const me = await person();
    const filed = await fileWithActions(me, []);
    const page = (await content(filed.cookie, me.defaultThreadId)).json();
    const row = page.rows.find((r: { id: string }) => r.id === filed.contentId);
    expect(row.actions).toBeNull();
  });

  it("does not let a non-member read the row or its actions", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    const stranger = await person();
    const res = await content(await signIn(stranger.id), me.defaultThreadId);
    expect(res.statusCode).toBe(404);
  });
});

describe("044 Remove a wrong action, provenance-safe (AC-15)", () => {
  const forget = (cookie: string, id: string, url: string) =>
    app.inject({ method: "POST", url: `/v1/content/${id}/actions/forget`, headers: { cookie }, payload: { url } });
  const restore = (cookie: string, id: string, url: string) =>
    app.inject({ method: "POST", url: `/v1/content/${id}/actions/restore`, headers: { cookie }, payload: { url } });
  const rowActions = async (id: string): Promise<{ label: string; url: string }[]> => {
    const row = await db.selectFrom("content").select("attrs").where("id", "=", id).executeTakeFirstOrThrow();
    return A(row.attrs);
  };
  const CHECKIN = "https://checkin.example-air.com/LX3K9Q";
  const MANAGE = "https://manage.example-air.com/LX3K9Q";

  it("the author removes one action and the row keeps the other", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    const res = await forget(filed.cookie, filed.contentId!, "https://checkin.example-air.com/LX3K9Q");
    expect(res.statusCode).toBe(200);
    expect(await rowActions(filed.contentId!)).toEqual([{ label: "Manage booking", url: MANAGE }]);
  });

  it("a non-member gets a 404, not a removal", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    const stranger = await person();
    const res = await forget(await signIn(stranger.id), filed.contentId!, CHECKIN);
    expect(res.statusCode).toBe(404);
    expect(await rowActions(filed.contentId!)).toHaveLength(2);
  });

  it("restore brings a removed action back", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    await forget(filed.cookie, filed.contentId!, CHECKIN);
    const res = await restore(filed.cookie, filed.contentId!, CHECKIN);
    expect(res.statusCode).toBe(200);
    const urls = (await rowActions(filed.contentId!)).map((a) => a.url).sort();
    expect(urls).toEqual([CHECKIN, MANAGE].sort());
  });

  it("refuses to restore a url that was never a harvested action (no injection)", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    const res = await restore(filed.cookie, filed.contentId!, "https://evil.example/injected");
    expect(res.statusCode).toBe(200);
    const urls = (await rowActions(filed.contentId!)).map((a) => a.url);
    expect(urls).not.toContain("https://evil.example/injected");
    expect(urls).toHaveLength(2);
  });

  it("never lets restore push the row past two actions", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    // Remove one, then restore it while the row already has its two back is a
    // no-op; here remove then restore keeps it at two, never three.
    await forget(filed.cookie, filed.contentId!, CHECKIN);
    await restore(filed.cookie, filed.contentId!, CHECKIN);
    await restore(filed.cookie, filed.contentId!, CHECKIN);
    expect(await rowActions(filed.contentId!)).toHaveLength(2);
  });

  it("keeps the tombstone out of the wire", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);
    await forget(filed.cookie, filed.contentId!, CHECKIN);
    const page = (
      await app.inject({ method: "GET", url: `/v1/threads/${me.defaultThreadId}/content`, headers: { cookie: filed.cookie } })
    ).json();
    const row = page.rows.find((r: { id: string }) => r.id === filed.contentId);
    expect(row.actions).toEqual(wire([{ label: "Manage booking", url: MANAGE }]));
    expect(JSON.stringify(row)).not.toContain("actions_removed");
  });
});

describe("044 no label or destination leaks (T10)", () => {
  const NEEDLES = ["checkin.example-air.com", "manage.example-air.com", "Manage booking"];

  it("keeps labels and urls out of analytics and the search index", async () => {
    const me = await person();
    const filed = await fileWithActions(me, TWO);

    // AC-17: nothing an action carries reaches an analytics event.
    const events = await db.selectFrom("analytics_events").selectAll().execute();
    const emitted = JSON.stringify(events);
    for (const needle of NEEDLES) expect(emitted).not.toContain(needle);

    // AC-16: the search column is generated from title and body only, so no
    // label or destination is indexed. (The content embedding is built from the
    // same two columns, and the embed job carries only the row id.)
    const row = await db
      .selectFrom("content")
      .select(sql<string>`search_text::text`.as("txt"))
      .where("id", "=", filed.contentId!)
      .executeTakeFirstOrThrow();
    for (const needle of NEEDLES) expect(row.txt.toLowerCase()).not.toContain(needle.toLowerCase());
    const jobs = await db.selectFrom("jobs").select("payload").where("kind", "=", "embed.content").execute();
    for (const needle of NEEDLES) expect(JSON.stringify(jobs)).not.toContain(needle);
  });
});
