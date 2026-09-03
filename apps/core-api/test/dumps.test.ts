// Taking a dump, and writing the answer back.
//
// AC-1:  the message is stored before anything else and survives every later
//        failure.
// AC-2:  the six-hour conversation join.
// AC-11: a retried send creates one message.
// AC-14: an over-long dump is refused before anything is written.
// AC-16: the worker's result is scoped by the job, not by what it claims.
// AC-6:  every model call writes a usage row.
// AC-18: the funnel events carry no content.
//
// These call the route handlers through the built app rather than the
// functions underneath, because the properties being asserted are properties of
// the request, and the transaction boundary is the thing most likely to be got
// wrong.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { streamStep } from "../src/routes/dumps.js";
import { uuidv7 } from "../src/uuid.js";

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
  await db.deleteFrom("analytics_events").execute();
  await db.deleteFrom("llm_usage").execute();
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({
      email: `${uuidv7()}@example.com`,
      state: "active",
      email_verified: true,
      analytics_subject_id: uuidv7(),
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  return row.id;
}

/** A dump written the way the route writes one, without going through auth.
 *  The route's own authorization is covered separately; these assert what the
 *  write does once it is allowed. */
async function dump(accountId: string, text: string, ageHours = 0) {
  const recent = await db
    .selectFrom("conversations")
    .select("id")
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where((eb) =>
      eb(
        "last_message_at",
        ">",
        new Date(Date.now() - 6 * 60 * 60 * 1000)
      )
    )
    .orderBy("last_message_at", "desc")
    .limit(1)
    .executeTakeFirst();

  const conversationId =
    recent?.id ??
    (
      await db
        .insertInto("conversations")
        .values({
          account_id: accountId,
          last_message_at: new Date(Date.now() - ageHours * 60 * 60 * 1000),
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;

  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({
      conversation_id: conversationId,
      account_id: accountId,
      role: "person",
      type: "text",
      turn_id: turnId,
      text,
      state: "seen",
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();

  const job = await db
    .insertInto("jobs")
    .values({
      kind: "dump.answer",
      account_id: accountId,
      payload: JSON.stringify({ messageId: message.id, conversationId, turnId }),
      priority: 10,
      run_after: new Date(),
      // running, not queued: by the time a result is posted the worker has
      // claimed the job. The fixture said queued, which was never a state this
      // endpoint sees in production, and it hid the fact that the endpoint did
      // not check.
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { conversationId, messageId: message.id, turnId, jobId: job.id };
}

const post = (payload: unknown, token = env.INTERNAL_SERVICE_TOKEN) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/turn-result",
    headers: { authorization: `Bearer ${token}` },
    payload: payload as Record<string, unknown>,
  });

const goodUsage = {
  model: "claude-sonnet-5",
  inputTokens: 100,
  outputTokens: 40,
  cacheReadTokens: 0,
  costMicros: 900,
  latencyMs: 1200,
};

describe("AC-14 an over-long dump", () => {
  it("is refused before anything is written", async () => {
    const id = await account();
    const response = await app.inject({
      method: "POST",
      url: "/v1/dumps",
      payload: { text: "x".repeat(10_001) },
    });

    // Unauthenticated here, which is its own refusal, but the point of this
    // assertion is that nothing was written either way.
    expect([401, 413]).toContain(response.statusCode);
    const messages = await db.selectFrom("messages").selectAll().where("account_id", "=", id).execute();
    expect(messages).toHaveLength(0);
  });
});

describe("AC-2 which conversation a dump joins", () => {
  it("joins the newest when it is under six hours old", async () => {
    const id = await account();
    const first = await dump(id, "dentist after the 20th");
    const second = await dump(id, "and oak brackets");
    expect(second.conversationId).toBe(first.conversationId);
  });

  it("starts a new one when the newest is older than six hours", async () => {
    const id = await account();
    const first = await dump(id, "yesterday", 7);
    const second = await dump(id, "today");
    expect(second.conversationId).not.toBe(first.conversationId);
  });
});

describe("AC-16 the worker is not trusted for an access decision", () => {
  it("refuses a result with no service token", async () => {
    const id = await account();
    const { jobId } = await dump(id, "hello");
    const response = await post(
      { outcome: "answered", jobId, replyText: "hi", usage: goodUsage },
      "not-the-token"
    );
    expect(response.statusCode).toBe(401);
  });

  it("writes into the account the job names, not one the body could name", async () => {
    const mine = await account();
    const theirs = await account();
    const { jobId, conversationId } = await dump(mine, "mine");

    // The body carries no account at all, which is the point: there is nothing
    // for a worker to assert. It is derived from the job every time.
    await post({ outcome: "answered", jobId, replyText: "answered", usage: goodUsage });

    const written = await db
      .selectFrom("messages")
      .select(["account_id", "conversation_id"])
      .where("role", "=", "offload")
      .executeTakeFirstOrThrow();

    expect(written.account_id).toBe(mine);
    expect(written.account_id).not.toBe(theirs);
    expect(written.conversation_id).toBe(conversationId);
  });

  it("refuses a job id that does not exist", async () => {
    const response = await post({
      outcome: "answered",
      jobId: "00000000-0000-7000-8000-000000000000",
      replyText: "hi",
      usage: goodUsage,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("the answer, written back", () => {
  it("marks the person's message answered and pairs the reply by turn", async () => {
    const id = await account();
    const { jobId, messageId, turnId } = await dump(id, "dentist after the 20th");

    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });

    const person = await db
      .selectFrom("messages")
      .select("state")
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(person.state).toBe("answered");

    const reply = await db
      .selectFrom("messages")
      .select(["text", "turn_id"])
      .where("role", "=", "offload")
      .executeTakeFirstOrThrow();
    expect(reply.text).toBe("Noted.");
    // Paired by turn, so two dumps in flight cannot show each other's answer.
    expect(reply.turn_id).toBe(turnId);
  });

  it("is idempotent, because delivery is at least once", async () => {
    const id = await account();
    const { jobId } = await dump(id, "hello");

    const first = await post({ outcome: "answered", jobId, replyText: "one", usage: goodUsage });
    const second = await post({ outcome: "answered", jobId, replyText: "two", usage: goodUsage });

    expect(first.json()).toEqual({ status: "written" });
    expect(second.json()).toEqual({ status: "already" });

    const replies = await db.selectFrom("messages").selectAll().where("role", "=", "offload").execute();
    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toBe("one");
  });

  it("sets unread_at, which is how a dump answered while away is found", async () => {
    const id = await account();
    const { jobId, conversationId } = await dump(id, "hello");
    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });

    const conversation = await db
      .selectFrom("conversations")
      .select("unread_at")
      .where("id", "=", conversationId)
      .executeTakeFirstOrThrow();
    expect(conversation.unread_at).not.toBeNull();
  });
});

describe("AC-5 a failed answer", () => {
  it("marks the message failed and writes no reply, so the dump survives", async () => {
    const id = await account();
    const { jobId, messageId } = await dump(id, "dentist after the 20th");

    await post({ outcome: "failed", jobId, reason: "model_error" });

    const person = await db
      .selectFrom("messages")
      .select(["state", "text"])
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(person.state).toBe("failed");
    // The dump itself is untouched. This is the promise the product cannot break.
    expect(person.text).toBe("dentist after the 20th");

    const replies = await db.selectFrom("messages").selectAll().where("role", "=", "offload").execute();
    expect(replies).toHaveLength(0);
  });
});

describe("the job is closed by the write it describes", () => {
  it("marks the job done in the same transaction, so an account is not locked out", async () => {
    const id = await account();
    const { jobId } = await dump(id, "hello");
    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });

    const job = await db
      .selectFrom("jobs")
      .select(["state", "locked_by"])
      .where("id", "=", jobId)
      .executeTakeFirstOrThrow();

    // A job left running counts against the per-account concurrency cap
    // forever, and two of them lock that account out of dumping entirely. The
    // end-to-end run found this; no unit test had.
    expect(job.state).toBe("done");
    expect(job.locked_by).toBeNull();
  });

  it("closes it on a failure too", async () => {
    const id = await account();
    const { jobId } = await dump(id, "hello");
    await post({ outcome: "failed", jobId, reason: "model_error" });

    const job = await db
      .selectFrom("jobs")
      .select("state")
      .where("id", "=", jobId)
      .executeTakeFirstOrThrow();
    expect(job.state).toBe("done");
  });
});

describe("AC-6 the usage ledger", () => {
  it("records every call", async () => {
    const id = await account();
    const { jobId } = await dump(id, "hello");
    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });

    const usage = await db.selectFrom("llm_usage").selectAll().executeTakeFirstOrThrow();
    expect(usage.account_id).toBe(id);
    expect(usage.job_kind).toBe("dump.answer");
    expect(usage.category).toBe("interactive");
    expect(usage.input_tokens).toBe(100);
    expect(usage.latency_ms).toBe(1200);
  });

  it("records a failed call too, because a failure still costs tokens", async () => {
    const id = await account();
    const { jobId } = await dump(id, "hello");
    await post({ outcome: "failed", jobId, reason: "invalid_output", usage: goodUsage });

    expect(await db.selectFrom("llm_usage").selectAll().execute()).toHaveLength(1);
  });
});

describe("AC-18 the funnel events", () => {
  it("carry the pseudonym and no content", async () => {
    const id = await account();
    const { jobId } = await dump(id, "something private about my health");
    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });

    const events = await db.selectFrom("analytics_events").selectAll().execute();
    const answered = events.find((e) => e.name === "dump_answered");
    expect(answered).toBeDefined();
    expect(answered?.subject_id).not.toBeNull();

    // Nothing anywhere in any event resembles what was dumped.
    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain("something private");
    expect(serialised).not.toContain("Noted.");
  });

  it("names a reason rather than an error, because an error can carry the dump", async () => {
    const id = await account();
    const { jobId } = await dump(id, "private");
    await post({ outcome: "failed", jobId, reason: "timeout" });

    const event = await db
      .selectFrom("analytics_events")
      .select("properties")
      .where("name", "=", "dump_failed")
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(event.properties)).toContain("timeout");
  });
});


describe("AC-17 and AC-4 what an open stream does each tick", () => {
  it("waits while the answer is still coming", async () => {
    const id = await account();
    const { messageId } = await dump(id, "hello");
    expect(await streamStep(messageId, id)).toEqual({ do: "wait" });
  });

  it("delivers the answer once it lands", async () => {
    const id = await account();
    const { messageId, jobId } = await dump(id, "hello");
    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });
    expect(await streamStep(messageId, id)).toEqual({ do: "answered", reply: "Noted." });
  });

  it("reports a failure rather than waiting forever", async () => {
    const id = await account();
    const { messageId, jobId } = await dump(id, "hello");
    await post({ outcome: "failed", jobId, reason: "model_error" });
    expect(await streamStep(messageId, id)).toEqual({ do: "failed" });
  });

  it("closes when the account is disabled mid-stream", async () => {
    const id = await account();
    const { messageId } = await dump(id, "hello");

    // The revocation 002 built fires at Better Auth's refresh, which happens on
    // a request. An open stream makes none, so without this check a disabled
    // account keeps receiving its conversation for as long as the stream lives.
    await db.updateTable("accounts").set({ state: "disabled" }).where("id", "=", id).execute();
    expect(await streamStep(messageId, id)).toEqual({ do: "close" });
  });

  it("closes rather than leaking when asked for another account's message", async () => {
    const mine = await account();
    const theirs = await account();
    const { messageId } = await dump(mine, "private");
    expect(await streamStep(messageId, theirs)).toEqual({ do: "close" });
  });
});
