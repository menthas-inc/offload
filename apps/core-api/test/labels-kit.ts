// What every 025 test file needs: accounts, threads, members, a signed
// session, a dump turn the tool endpoint will accept, and the two injectors.
// One copy rather than one per file, because five files hold 025's tests.

import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db } from "../src/db.js";
import { env } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";
import type { App } from "../src/app.js";

export async function account(name = "Ana Duarte"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      display_name: name,
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function thread(accountId: string, name = "Europe, October"): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await join(row.id, accountId);
  return row.id;
}

export async function join(threadId: string, accountId: string, state: "accepted" | "removed" | "left" = "accepted"): Promise<void> {
  await db.insertInto("thread_members").values({ thread_id: threadId, account_id: accountId, state }).execute();
}

export async function row(accountId: string, threadId: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const inserted = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, type: "task", title, updated_at: new Date(), ...extra } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

export async function note(accountId: string, threadId: string, text: string, scope: "thread" | "account" = "thread"): Promise<string> {
  const inserted = await db
    .insertInto("notes")
    .values({
      account_id: accountId,
      scope,
      subject_id: scope === "thread" ? threadId : accountId,
      text,
      kind: "going_on",
      origin: "stated",
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

export async function signIn(accountId: string): Promise<string> {
  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: accountId, token, expires_at: new Date(Date.now() + 60 * 60 * 1000) })
    .execute();
  return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
}

/** A dump turn in flight, so the tool endpoint has a job to resolve. */
export async function dump(accountId: string, text = "ferry to the islands on Tuesday") {
  const conversation = await db
    .insertInto("conversations").values({ account_id: accountId })
    .returning("id").executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({
      conversation_id: conversation.id, account_id: accountId, role: "person", type: "text",
      turn_id: turnId, text, state: "seen",
    })
    .returning("id").executeTakeFirstOrThrow();
  const job = await db
    .insertInto("jobs")
    .values({
      kind: "dump.answer", account_id: accountId,
      payload: JSON.stringify({ messageId: message.id, conversationId: conversation.id, turnId }),
      priority: 10, run_after: new Date(), state: "running", locked_at: new Date(),
      locked_by: "test", attempts: 1,
    })
    .returning("id").executeTakeFirstOrThrow();
  return { messageId: message.id, jobId: job.id, turnId, conversationId: conversation.id };
}

export const tool = (app: App, payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/tool-call",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: payload as Record<string, unknown>,
  });

export const as = (app: App, cookie: string) => ({
  get: (url: string) => app.inject({ method: "GET", url, headers: { cookie } }),
  post: (url: string, payload?: unknown) =>
    app.inject({ method: "POST", url, headers: { cookie }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) }),
  patch: (url: string, payload: unknown) =>
    app.inject({ method: "PATCH", url, headers: { cookie }, payload: payload as Record<string, unknown> }),
  put: (url: string, payload: unknown) =>
    app.inject({ method: "PUT", url, headers: { cookie }, payload: payload as Record<string, unknown> }),
  delete: (url: string) => app.inject({ method: "DELETE", url, headers: { cookie } }),
});

/** Every table 025 writes to, and the ones they hang off, emptied in an order
 *  the foreign keys accept. */
export async function wipe(): Promise<void> {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("activity").execute();
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
}
