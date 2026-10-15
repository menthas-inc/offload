// 027, 2026-10-15: a question on Today that only typing can answer. Answer
// makes the conversation that asked the current one again, so the composer
// opens on it and the next dump is read against the question first.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { account, message, question, signIn } from "./today-kit.js";

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
  await db.deleteFrom("accounts").execute();
});

const resume = (cookie: string, id: string) =>
  app.inject({ method: "POST", url: `/v1/questions/${id}/resume`, headers: { cookie } });

async function current(cookie: string): Promise<{ conversationId: string | null; messages: { question?: { id: string } | null }[] }> {
  const response = await app.inject({ method: "GET", url: "/v1/conversations/current", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response.json();
}

async function conversationOf(questionId: string): Promise<string> {
  const row = await db.selectFrom("questions").select("conversation_id").where("id", "=", questionId).executeTakeFirstOrThrow();
  return row.conversation_id;
}

/** The email arrived hours ago and the composer was closed since. */
async function putAway(conversationId: string): Promise<void> {
  await db
    .updateTable("conversations")
    .set({ last_message_at: sql`now() - interval '3 hours'`, ended_at: sql`now() - interval '2 hours'` })
    .where("id", "=", conversationId)
    .execute();
}

describe("Answer on a question card", () => {
  it("makes the conversation that asked the current one, with its question", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const id = await question(me, { source: "mail", untrusted: true, field: "time" });
    await putAway(await conversationOf(id));

    expect((await resume(cookie, id)).statusCode).toBe(200);

    const now = await current(cookie);
    expect(now.conversationId).toBe(await conversationOf(id));
    expect(now.messages.some((m) => m.question?.id === id)).toBe(true);
  });

  it("reads the next dump against that question", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const id = await question(me, { source: "mail", untrusted: true, field: "time" });
    await putAway(await conversationOf(id));
    await resume(cookie, id);

    const sent = await app.inject({ method: "POST", url: "/v1/dumps", headers: { cookie }, payload: { text: "Friday at 7pm", clientKey: uuidv7() } });
    expect(sent.statusCode).toBe(202);
    const { messageId } = sent.json() as { messageId: string };
    const job = await db
      .selectFrom("jobs")
      .select("payload")
      .where("account_id", "=", me)
      .where("kind", "=", "dump.answer")
      .where(sql<boolean>`payload->>'messageId' = ${messageId}`)
      .executeTakeFirstOrThrow();
    expect((job.payload as Record<string, unknown>)["openQuestionId"]).toBe(id);
    const open = await db.selectFrom("questions").select("state").where("id", "=", id).executeTakeFirstOrThrow();
    expect(open.state).toBe("open");
  });

  it("ends the conversation that was live, as closing the composer does", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const id = await question(me, { source: "mail", untrusted: true, field: "time" });
    await putAway(await conversationOf(id));
    const live = await message(me);
    const theirs = await question(me);
    await db.updateTable("questions").set({ conversation_id: live.conversationId }).where("id", "=", theirs).execute();

    await resume(cookie, id);

    const ended = await db.selectFrom("conversations").select("ended_at").where("id", "=", live.conversationId).executeTakeFirstOrThrow();
    expect(ended.ended_at).not.toBeNull();
    const closed = await db.selectFrom("questions").select("state").where("id", "=", theirs).executeTakeFirstOrThrow();
    expect(closed.state).toBe("closed");
    expect((await current(cookie)).conversationId).toBe(await conversationOf(id));
  });

  it("finds nothing for a question already settled, or another account's", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const answered = await question(me, { state: "answered" });
    const theirs = await question(await account());
    const before = (await current(cookie)).conversationId;

    expect((await resume(cookie, answered)).statusCode).toBe(404);
    expect((await resume(cookie, theirs)).statusCode).toBe(404);
    expect((await current(cookie)).conversationId).toBe(before);
  });

  it("never reopens a conversation of another account, whatever the question row says", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const id = await question(me, { field: "time" });
    const theirs = await message(await account());
    await putAway(theirs.conversationId);
    await db.updateTable("questions").set({ conversation_id: theirs.conversationId }).where("id", "=", id).execute();

    expect((await resume(cookie, id)).statusCode).toBe(404);
    const untouched = await db.selectFrom("conversations").select("ended_at").where("id", "=", theirs.conversationId).executeTakeFirstOrThrow();
    expect(untouched.ended_at).not.toBeNull();
  });

  it("takes only a question typing answers: a date, span or time", async () => {
    const me = await account();
    const cookie = await signIn(me);
    const thread = await question(me, { field: "thread" });
    expect((await resume(cookie, thread)).statusCode).toBe(404);
  });
});
