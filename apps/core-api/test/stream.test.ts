// The stream, over a real socket.
//
// **This file exists because the stream failed in production and no test could
// have caught it.** `streamStep` has been unit tested since 003 and the wire
// never was: `app.inject` buffers a response and returns it whole, which is
// exactly the behaviour a broken stream has, so injecting proves nothing about
// streaming. A dump was answered, the answer sat in the database, and the
// composer showed a thinking indicator until somebody reloaded the page.
//
// So this starts a real server on a real port and reads the body as it
// arrives, which is the only shape of test that can tell a stream from a
// response that happens to contain the right bytes.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { stopListening, waiterCount } from "../src/dumps/answers.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env, webOrigins } from "../src/env.js";
import { uuidv7 } from "../src/uuid.js";

await migrate(() => {});

let app: App;
let origin: string;

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  await stopListening();
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function signedIn() {
  const account = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      display_name: "Ana Duarte",
      analytics_subject_id: uuidv7(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const token = uuidv7();
  await db
    .insertInto("sessions")
    .values({ account_id: account.id, token, expires_at: new Date(Date.now() + 3_600_000) })
    .execute();

  const cookie = `better-auth.session_token=${token}.${await makeSignature(
    token,
    env.BETTER_AUTH_SECRET
  )}`;
  return { accountId: account.id, cookie };
}

async function dump(accountId: string) {
  const conversation = await db
    .insertInto("conversations")
    .values({ account_id: accountId })
    .returning("id")
    .executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({
      conversation_id: conversation.id,
      account_id: accountId,
      role: "person",
      type: "text",
      turn_id: turnId,
      text: "book a stay in Istanbul",
      state: "seen",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { messageId: message.id, conversationId: conversation.id, turnId };
}

/** Open the stream and read frames as they arrive, never waiting for the body
 *  to finish. A test that awaits `response.text()` is a test that passes on a
 *  stream and on a buffered response alike. */
function openStream(url: string, cookie: string) {
  const controller = new AbortController();
  const frames: string[] = [];
  let notify: (() => void) | null = null;

  // The abort has to be caught here, not by the caller.
  //
  // `controller.abort()` rejects the in-flight fetch, and an uncaught rejection
  // fails the whole run even when every assertion passed: vitest reports it as
  // an error and the pre-commit gate treats that as a failure, correctly. It is
  // also the same class of bug the SSE handler itself was fixed for in 003, and
  // it would be embarrassing to leave one in the test that exists to prove that
  // handler is sound.
  const started = fetch(url, { headers: { cookie }, signal: controller.signal })
    .then(async (response) => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split >= 0) {
          frames.push(buffer.slice(0, split));
          buffer = buffer.slice(split + 2);
          notify?.();
          split = buffer.indexOf("\n\n");
        }
      }
      return response;
    })
    .catch((error: unknown) => {
      // Closing a stream is the ordinary end of one, not a failure.
      if (error instanceof Error && error.name === "AbortError") return null;
      throw error;
    });

  const waitForFrame = (match: RegExp, timeoutMs = 8_000) =>
    new Promise<string>((resolve, reject) => {
      const check = () => {
        const found = frames.find((frame) => match.test(frame));
        if (found) {
          clearTimeout(timer);
          notify = null;
          resolve(found);
        }
      };
      const timer = setTimeout(() => {
        notify = null;
        reject(new Error(`no frame matching ${match} in ${frames.length}: ${frames.join(" | ")}`));
      }, timeoutMs);
      notify = check;
      check();
    });

  return { frames, waitForFrame, close: () => controller.abort(), started };
}

const post = (payload: unknown) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/turn-result",
    headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    payload: payload as Record<string, unknown>,
  });

const usage = {
  model: "claude-sonnet-5",
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 0,
  costMicros: 0,
  latencyMs: 500,
};

describe("the stream, over a real socket", () => {
  it("carries CORS, because hijacking bypasses the plugin that would (AC-4)", async () => {
    // **The reason the composer never received an answer in a browser.**
    // `reply.hijack()` takes the socket away from Fastify and
    // `reply.raw.writeHead` writes exactly what it is given, so the header
    // @fastify/cors sets on the reply object never reached the wire. Every test
    // in this repo is same-origin and none of them noticed; a browser on
    // another origin blocked the response and the person watched a thinking
    // indicator until they reloaded.
    const { accountId, cookie } = await signedIn();
    const { messageId } = await dump(accountId);
    const site = webOrigins[0]!;

    const allowed = await fetch(`${origin}/v1/messages/${messageId}/stream`, {
      headers: { cookie, origin: site },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(site);
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
    expect(allowed.headers.get("vary")).toContain("Origin");
    await allowed.body!.cancel();

    // And it is not a way around the allowlist.
    const refused = await fetch(`${origin}/v1/messages/${messageId}/stream`, {
      headers: { cookie, origin: "https://not-us.example" },
    });
    expect(refused.headers.get("access-control-allow-origin")).toBeNull();
    await refused.body!.cancel();
  });

  it("sends the right headers and does not buffer", async () => {
    const { accountId, cookie } = await signedIn();
    const { messageId } = await dump(accountId);

    const response = await fetch(`${origin}/v1/messages/${messageId}/stream`, {
      headers: { cookie },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    // no-transform is what stops a proxy compressing, and compression is what
    // turns a stream into one response delivered at the end.
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    // A stream must not announce a length. One that does is not a stream.
    expect(response.headers.get("content-length")).toBeNull();

    await response.body!.cancel();
  });

  it("delivers an answer the moment it lands", async () => {
    // The production failure exactly, and **the timeout is the assertion**. The
    // stream was never broken: it polled every fifteen seconds, so a reply sat
    // in the database while the composer showed a thinking indicator, and
    // somebody reloaded before it arrived. A test that waits patiently would
    // have passed all the way through that.
    //
    // Nothing polls now: the transaction that writes the reply notifies, and
    // this wakes. Two seconds is generous for a round trip through Postgres.
    const { accountId, cookie } = await signedIn();
    const { messageId, conversationId, turnId } = await dump(accountId);

    const stream = openStream(`${origin}/v1/messages/${messageId}/stream`, cookie);
    // Let the connection establish before the answer lands, which is the real
    // ordering: somebody is already waiting when the worker finishes.
    await new Promise((r) => setTimeout(r, 300));

    const job = await db
      .insertInto("jobs")
      .values({
        kind: "dump.answer",
        account_id: accountId,
        payload: JSON.stringify({ messageId, conversationId, turnId }),
        run_after: new Date(),
        state: "running",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await post({
      outcome: "answered",
      jobId: job.id,
      replyText: "Added to EU with fam.",
      usage: [usage],
    });

    const frame = await stream.waitForFrame(/event: done/, 2_000);
    expect(frame).toContain("Added to EU with fam.");
    const data = JSON.parse(frame.split("data: ")[1]!) as { state: string };
    expect(data.state).toBe("answered");

    stream.close();
  });

  it("says a turn filed something when what it filed draws no pill", async () => {
    // What lands where no thread is named has no pill, so `threads` is empty
    // and `filed` is the only thing that draws Done. The settlement dropped
    // it: an appointment added from Today wore no Done mark until a reload,
    // because the tail and the single read both carried it and this did not.
    const { accountId, cookie } = await signedIn();
    const { messageId, conversationId, turnId } = await dump(accountId);
    const loose = await db
      .insertInto("threads")
      .values({ created_by_account_id: accountId, name: "Loose", last_activity_at: new Date(), updated_at: new Date() })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("thread_members").values({ thread_id: loose.id, account_id: accountId, state: "accepted" }).execute();
    await db.updateTable("accounts").set({ default_thread_id: loose.id }).where("id", "=", accountId).execute();
    await db
      .insertInto("content")
      .values({ account_id: accountId, thread_id: loose.id, type: "event", title: "Dentist", derived_from_message_id: messageId })
      .execute();

    const stream = openStream(`${origin}/v1/messages/${messageId}/stream`, cookie);
    await new Promise((r) => setTimeout(r, 300));
    const job = await db
      .insertInto("jobs")
      .values({
        kind: "dump.answer",
        account_id: accountId,
        payload: JSON.stringify({ messageId, conversationId, turnId }),
        run_after: new Date(),
        state: "running",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await post({ outcome: "answered", jobId: job.id, usage: [usage] });

    const frame = await stream.waitForFrame(/event: done/, 2_000);
    const data = JSON.parse(frame.split("data: ")[1]!) as { threads: unknown[]; filed?: boolean; photos?: unknown[] };
    expect(data.threads).toEqual([]);
    expect(data.filed).toBe(true);
    // 041. The message's files ride the settlement, so a PDF sent a moment
    // ago learns it can be opened without a reload.
    expect(data.photos).toEqual([]);

    stream.close();
  });

  it("delivers a partial turn too, so the composer can offer to finish it", async () => {
    const { accountId, cookie } = await signedIn();
    const { messageId, conversationId, turnId } = await dump(accountId);

    const stream = openStream(`${origin}/v1/messages/${messageId}/stream`, cookie);
    await new Promise((r) => setTimeout(r, 300));

    const job = await db
      .insertInto("jobs")
      .values({
        kind: "dump.answer",
        account_id: accountId,
        payload: JSON.stringify({ messageId, conversationId, turnId }),
        run_after: new Date(),
        state: "running",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await post({
      outcome: "partial",
      jobId: job.id,
      replyText: "Started EU with fam. There was more in that one.",
      usage: [usage],
    });

    const data = JSON.parse(
      (await stream.waitForFrame(/event: done/, 2_000)).split("data: ")[1]!
    ) as { state: string };
    expect(data.state).toBe("partial");

    stream.close();
  });

  it("delivers a failure rather than waiting forever", async () => {
    const { accountId, cookie } = await signedIn();
    const { messageId, conversationId, turnId } = await dump(accountId);

    const stream = openStream(`${origin}/v1/messages/${messageId}/stream`, cookie);
    await new Promise((r) => setTimeout(r, 300));

    const job = await db
      .insertInto("jobs")
      .values({
        kind: "dump.answer",
        account_id: accountId,
        payload: JSON.stringify({ messageId, conversationId, turnId }),
        run_after: new Date(),
        state: "running",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await post({ outcome: "failed", jobId: job.id, reason: "model_error" });

    expect(await stream.waitForFrame(/event: failed/, 2_000)).toContain("failed");
    stream.close();
  });

  it("answers immediately when the reply landed before the stream opened", async () => {
    // A browser that reconnects after the answer has already been written must
    // not wait a full tick for it.
    const { accountId, cookie } = await signedIn();
    const { messageId, conversationId, turnId } = await dump(accountId);

    const job = await db
      .insertInto("jobs")
      .values({
        kind: "dump.answer",
        account_id: accountId,
        payload: JSON.stringify({ messageId, conversationId, turnId }),
        run_after: new Date(),
        state: "running",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await post({ outcome: "answered", jobId: job.id, replyText: "Done.", usage: [usage] });

    const stream = openStream(`${origin}/v1/messages/${messageId}/stream`, cookie);
    expect(await stream.waitForFrame(/event: done/, 3_000)).toContain("Done.");
    stream.close();
  });
});

describe("nobody polls, and nobody is left behind", () => {
  it("is woken by the write rather than by a clock", async () => {
    // The whole point. If this ever starts failing by timing out at exactly the
    // session interval, somebody has reintroduced a poll and it is hiding the
    // fact that the notification path is broken.
    const { accountId, cookie } = await signedIn();
    const { messageId, conversationId, turnId } = await dump(accountId);

    // Relative, not absolute: `waiterCount` is process-wide and an earlier
    // test's socket may not have finished closing. What matters is that this
    // stream is waiting, not how many others are.
    const before = waiterCount();
    const stream = openStream(`${origin}/v1/messages/${messageId}/stream`, cookie);
    await new Promise((r) => setTimeout(r, 300));
    expect(waiterCount()).toBe(before + 1);

    const job = await db
      .insertInto("jobs")
      .values({
        kind: "dump.answer", account_id: accountId,
        payload: JSON.stringify({ messageId, conversationId, turnId }),
        run_after: new Date(), state: "running",
      })
      .returning("id").executeTakeFirstOrThrow();

    const at = Date.now();
    await post({ outcome: "answered", jobId: job.id, replyText: "Done.", usage: [usage] });
    await stream.waitForFrame(/event: done/, 2_000);

    // Well inside the session interval, which is the only clock left.
    expect(Date.now() - at).toBeLessThan(2_000);
    stream.close();
  });

  it("stops waiting when the client goes away", async () => {
    // A stream that unsubscribes on close is the difference between a map that
    // holds people currently waiting and one that grows for the life of the
    // process.
    const { accountId, cookie } = await signedIn();
    const { messageId } = await dump(accountId);

    const before = waiterCount();
    const stream = openStream(`${origin}/v1/messages/${messageId}/stream`, cookie);
    await new Promise((r) => setTimeout(r, 300));
    expect(waiterCount()).toBe(before + 1);

    stream.close();
    await new Promise((r) => setTimeout(r, 800));
    expect(waiterCount()).toBe(before);
  });
});
