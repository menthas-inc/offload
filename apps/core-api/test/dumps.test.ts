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
import { sql } from "kysely";
import { makeSignature } from "better-auth/crypto";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { DAILY_MODEL_BUDGET_MICROS } from "../src/budget.js";
import {
  answerQuestion,
  cancelTurn,
  sourcesForAll,
  streamStep,
  takeDump,
  threadsForAll,
} from "../src/routes/dumps.js";
import { foundFor } from "../src/search/found.js";
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
        // The route's window, thirty minutes since 30 September 2026.
        new Date(Date.now() - 30 * 60 * 1000)
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
  it("joins the newest when it is inside the window", async () => {
    const id = await account();
    const first = await dump(id, "dentist after the 20th");
    const second = await dump(id, "and oak brackets");
    expect(second.conversationId).toBe(first.conversationId);
  });

  it("starts a new one when the newest is outside the window", async () => {
    const id = await account();
    const first = await dump(id, "yesterday", 7);
    const second = await dump(id, "today");
    expect(second.conversationId).not.toBe(first.conversationId);
  });

  // Thirty minutes since 30 September 2026, on every surface: the phones end a
  // conversation put away that long, and the web had nothing but this window.
  // Through `takeDump`, which runs the route's own lookup.
  it("starts a new one after thirty minutes of silence, through the route's own lookup", async () => {
    const id = await account();
    const first = await takeDump(id, "the brackets", uuidv7());
    await db
      .updateTable("conversations")
      .set({ last_message_at: sql`now() - interval '31 minutes'` })
      .where("id", "=", first.conversationId)
      .execute();
    const second = await takeDump(id, "the paint", uuidv7());
    expect(second.conversationId).not.toBe(first.conversationId);
  });

  it("keeps one inside thirty minutes", async () => {
    const id = await account();
    const first = await takeDump(id, "the brackets", uuidv7());
    await db
      .updateTable("conversations")
      .set({ last_message_at: sql`now() - interval '29 minutes'` })
      .where("id", "=", first.conversationId)
      .execute();
    const second = await takeDump(id, "the paint", uuidv7());
    expect(second.conversationId).toBe(first.conversationId);
  });

  // Closing the composer is a statement, not a tidy-up. Silence
  // used to be the only thing that ended a conversation, so the close cleared
  // the screen and the next dump landed in the same conversation anyway, with
  // offload still holding the last subject.
  // Through `takeDump` rather than the fixture above, on purpose. That helper
  // reimplements the window lookup instead of calling it, so the two tests
  // above assert the fixture's own logic and would pass whatever the route
  // did. Worth knowing before adding a third that way.
  it("keeps the lines a dump was typed with", async () => {
    const id = await account();
    const text = "milk\neggs\n\nbasil, the fresh kind";
    const sent = await takeDump(id, text);
    const stored = await db
      .selectFrom("messages")
      .select("text")
      .where("id", "=", sent.messageId)
      .executeTakeFirstOrThrow();
    expect(stored.text).toBe(text);
  });

  it("starts a new one when the last was closed, however soon the next arrives", async () => {
    const id = await account();
    const first = await takeDump(id, "dentist after the 20th");

    await db
      .updateTable("conversations")
      .set({ ended_at: new Date() })
      .where("id", "=", first.conversationId)
      .execute();

    const second = await takeDump(id, "and oak brackets");
    expect(second.conversationId).not.toBe(first.conversationId);
  });

  it("still joins an open one, so the close is what changed and not the window", async () => {
    const id = await account();
    const first = await takeDump(id, "dentist after the 20th");
    const second = await takeDump(id, "and oak brackets");
    expect(second.conversationId).toBe(first.conversationId);
  });

  // Ended is not deleted, and the distinction is the whole reason this is not
  // a `deleted_at`. Everything said in a closed conversation stays readable,
  // stays reachable by a turn's Undo, and stays subject to the same retention.
  it("leaves everything in a closed conversation exactly where it was", async () => {
    const id = await account();
    const first = await takeDump(id, "dentist after the 20th");

    await db
      .updateTable("conversations")
      .set({ ended_at: new Date() })
      .where("id", "=", first.conversationId)
      .execute();

    const messages = await db
      .selectFrom("messages")
      .select(["id", "text", "deleted_at"])
      .where("conversation_id", "=", first.conversationId)
      .execute();

    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe("dentist after the 20th");
    expect(messages[0]?.deleted_at).toBeNull();
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

    // 034. The turn failed and its job is closed `done`, so the reason is
    // written as the job's error code: that is how a failed dump shows on a
    // person's timeline in the admin panel.
    const job = await db.selectFrom("jobs").select(["state", "error_code"]).where("id", "=", jobId).executeTakeFirstOrThrow();
    expect(job).toEqual({ state: "done", error_code: "model_error" });

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
    // 021: the in-flight answers carry the transcript, null until one exists.
    expect(await streamStep(messageId, id)).toEqual({ do: "wait", transcript: null });
  });

  it("delivers the answer once it lands", async () => {
    const id = await account();
    const { messageId, jobId } = await dump(id, "hello");
    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });
    // `threads` is empty rather than absent, and that is the honest answer: the
    // turn filed nothing, so there is nowhere for the composer to link to. It
    // is populated from the content rows, never from the reply.
    const step = await streamStep(messageId, id);
    expect(step).toEqual({
      do: "answered",
      reply: "Noted.",
      // The reply is its own row, and the rows an answer showed hang off it
      // rather than off the message being watched.
      replyId: expect.any(String),
      threads: [],
      changed: [],
      // 028. Filed nothing.
      filed: false,
      // 016. Empty on a turn that read nothing, which is nearly every turn.
      sources: [],
      labels: [],
      // 052. The reply's parts: an answer that read nothing draws no slice.
      parts: { slices: [], also: [], pills: [], summary: null, resultAt: expect.any(String) },
    });
    expect(step.do === "answered" ? step.replyId : null).not.toBe(messageId);
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


describe("AC-11 a retried send", () => {
  it("creates one message, not two", async () => {
    const id = await account();
    const key = uuidv7();

    const first = await takeDump(id, "dentist after the 20th", key);
    const second = await takeDump(id, "dentist after the 20th", key);

    expect(second.messageId).toBe(first.messageId);
    const rows = await db.selectFrom("messages").selectAll().where("account_id", "=", id).execute();
    expect(rows).toHaveLength(1);
  });

  it("survives two concurrent sends of the same key", async () => {
    // The case the key exists for is a device that never heard the response,
    // which is exactly when two requests can be in flight together. Both pass a
    // check-then-insert, the second hits the unique index, and somebody whose
    // network hiccuped gets a 500 for asking twice.
    const id = await account();
    const key = uuidv7();

    const [a, b] = await Promise.all([
      takeDump(id, "oak brackets", key),
      takeDump(id, "oak brackets", key),
    ]);

    expect(a.messageId).toBe(b.messageId);
    const rows = await db.selectFrom("messages").selectAll().where("account_id", "=", id).execute();
    expect(rows).toHaveLength(1);
    // And exactly one job, because the loser of the race must not enqueue one.
    const jobs = await db.selectFrom("jobs").selectAll().where("account_id", "=", id).execute();
    expect(jobs).toHaveLength(1);
  });

  it("gives an interactive job one retry, not the email default of five", async () => {
    const id = await account();
    await takeDump(id, "hello", uuidv7());
    const job = await db
      .selectFrom("jobs")
      .select("max_attempts")
      .where("account_id", "=", id)
      .executeTakeFirstOrThrow();

    // AC-5 asks for one retry. The column defaults to 5, which suits an email
    // nobody is waiting on and is a long silence to call thinking.
    expect(job.max_attempts).toBe(2);
  });
});


describe("AC-1 the conversation survives a reload", () => {
  it("returns the tail of the current conversation", async () => {
    const id = await account();
    await takeDump(id, "dentist after the 20th", uuidv7());
    await takeDump(id, "oak brackets", uuidv7());

    const response = await app.inject({ method: "GET", url: "/v1/conversations/current" });
    // Unauthenticated here; the write path is what this asserts, through the
    // same query the route runs.
    expect(response.statusCode).toBe(401);

    const rows = await db
      .selectFrom("messages")
      .select(["text", "state"])
      .where("account_id", "=", id)
      .orderBy("created_at")
      .execute();

    // Both dumps are there and both are waiting, which is what a reload has to
    // be able to rebuild. Before the tail endpoint existed the row was safe and
    // unreachable: the only routes were send, fetch one message by an id the
    // browser had forgotten, and a stream.
    expect(rows.map((r) => r.text)).toEqual(["dentist after the 20th", "oak brackets"]);
    expect(rows.every((r) => r.state === "seen")).toBe(true);
  });

  it("keeps both dumps in one conversation inside the window", async () => {
    const id = await account();
    const first = await takeDump(id, "one", uuidv7());
    const second = await takeDump(id, "two", uuidv7());
    expect(second.conversationId).toBe(first.conversationId);
  });
});

describe("013 an answering turn carries rows and files nothing", () => {
  // Through `streamStep` and `foundFor` rather than the HTTP route, which is
  // what the rest of this file does: Better Auth signs its session cookie, so
  // driving the endpoint would mean replicating that signing and the test would
  // then break when the library changes rather than when this behaviour does.

  async function thread(accountId: string, name: string) {
    const row = await db
      .insertInto("threads")
      .values({ created_by_account_id: accountId, name })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("thread_members")
      .values({ thread_id: row.id, account_id: accountId, state: "accepted" })
      .execute();
    return row.id;
  }

  async function task(threadId: string, accountId: string, title: string) {
    const row = await db
      .insertInto("content")
      .values({ thread_id: threadId, account_id: accountId, title, type: "task" })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  it("returns the rows it showed and no filed threads", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    const first = await task(lisbon, ana, "Book the flat");
    const second = await task(lisbon, ana, "Find a restaurant");
    const { jobId, messageId } = await dump(ana, "what is left to do from Lisbon");

    await post({
      outcome: "answered",
      jobId,
      replyText: "Two left.",
      usage: goodUsage,
      found: [{ threadId: lisbon, truncated: false, contentIds: [first, second] }],
    });

    // **The thing that would be wrong by default.** `threads` drives the filed
    // chips and the Done tick, and both answer "where did this go", which is a
    // question about a write. An answering turn wrote nothing, so a chip beside
    // a result would name one thread twice and a tick would claim something
    // happened.
    const step = await streamStep(messageId, ana);
    expect(step.do).toBe("answered");
    expect(step.do === "answered" ? step.threads : null).toEqual([]);

    const reply = await db
      .selectFrom("messages")
      .select("id")
      .where("role", "=", "offload")
      .executeTakeFirstOrThrow();
    const found = (await foundFor([reply.id], ana)).get(reply.id) ?? [];
    expect(found).toHaveLength(1);
    expect(found[0]!.threadName).toBe("Lisbon trip");
    expect(found[0]!.truncated).toBe(false);
    expect(found[0]!.rows.map((r) => r.title)).toEqual(["Book the flat", "Find a restaurant"]);
  });

  it("carries each row's dates, so rows that share a title can be told apart (2026-10-13)", async () => {
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    const stay = await db
      .insertInto("content")
      .values({
        thread_id: lisbon,
        account_id: ana,
        title: "Glass blowing class",
        type: "event",
        occurs_at: new Date("2026-11-30T12:00:00Z"),
        occurs_end_at: new Date("2026-12-01T12:00:00Z"),
        attrs: { all_day: true },
        rrule: "FREQ=WEEKLY;COUNT=8",
      } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    const due = await db
      .insertInto("content")
      .values({ thread_id: lisbon, account_id: ana, title: "Book the flat", type: "task", due_at: new Date("2026-12-05T18:00:00Z") } as never)
      .returning("id")
      .executeTakeFirstOrThrow();
    const { jobId } = await dump(ana, "when are the classes");
    await post({
      outcome: "answered",
      jobId,
      replyText: "Eight of them.",
      usage: goodUsage,
      found: [{ threadId: lisbon, truncated: false, contentIds: [stay.id, due.id] }],
    });
    const reply = await db.selectFrom("messages").select("id").where("role", "=", "offload").executeTakeFirstOrThrow();
    const rows = ((await foundFor([reply.id], ana)).get(reply.id) ?? [])[0]!.rows;
    expect(rows.map((r) => [r.title, r.occursAt, r.occursEndAt, r.allDay, r.rrule, r.dueAt])).toEqual([
      ["Glass blowing class", "2026-11-30T12:00:00.000Z", "2026-12-01T12:00:00.000Z", true, "FREQ=WEEKLY;COUNT=8", null],
      ["Book the flat", null, null, false, null, "2026-12-05T18:00:00.000Z"],
    ]);
  });

  it("resolves the rows against the reply, not the message being watched", async () => {
    // **The bug this exists for.** A client watches the message it sent and
    // holds that id. The reply is a different row, and the rows an answer
    // showed are recorded against the reply, so resolving them for the watched
    // id asks about the question and never about the answer.
    //
    // It came back empty every time on the live path, on every surface, while
    // the sentence arrived normally, because the sentence is looked up by turn.
    // Reloading fixed it, because the conversation tail asks for every message
    // in the page and the reply is one of them. It read exactly like the model
    // choosing to summarise instead of listing.
    //
    // The test above passed throughout, because it asks `foundFor` for the
    // reply's id directly. This one goes through what the routes go through.
    const ana = await account();
    const lisbon = await thread(ana, "Lisbon trip");
    const first = await task(lisbon, ana, "Book the flat");
    const { jobId, messageId } = await dump(ana, "what is left to do from Lisbon");

    await post({
      outcome: "answered",
      jobId,
      replyText: "One left.",
      usage: goodUsage,
      found: [{ threadId: lisbon, truncated: false, contentIds: [first] }],
    });

    const reply = await db
      .selectFrom("messages")
      .select("id")
      .where("role", "=", "offload")
      .where("account_id", "=", ana)
      .executeTakeFirstOrThrow();

    const step = await streamStep(messageId, ana);
    expect(step.do).toBe("answered");
    const replyId = step.do === "answered" ? step.replyId : null;

    // Not the id the caller was watching.
    expect(replyId).toBe(reply.id);
    expect(replyId).not.toBe(messageId);

    // And resolving against it actually yields the rows, which is the part a
    // person sees.
    const found = (await foundFor([replyId!], ana)).get(replyId!) ?? [];
    expect(found.flatMap((r) => r.rows.map((row) => row.title))).toEqual(["Book the flat"]);

    // The watched id carries nothing, which is correct and is why asking it
    // was silent rather than loud.
    expect((await foundFor([messageId], ana)).get(messageId) ?? []).toEqual([]);
  });

  it("carries whether the read was cut short, so the tail can differ", async () => {
    const ana = await account();
    const groceries = await thread(ana, "Groceries");
    const butter = await task(groceries, ana, "buy butter");
    const { jobId } = await dump(ana, "what is on the list");

    await post({
      outcome: "answered",
      jobId,
      replyText: "More than twenty.",
      usage: goodUsage,
      found: [{ threadId: groceries, truncated: true, contentIds: [butter] }],
    });

    const reply = await db
      .selectFrom("messages")
      .select("id")
      .where("role", "=", "offload")
      .executeTakeFirstOrThrow();
    // Without this the reply offers to expand into rows nobody fetched.
    expect((await foundFor([reply.id], ana)).get(reply.id)?.[0]!.truncated).toBe(true);
  });

  it("refuses to show a row the asker cannot read", async () => {
    // The ids came from a read that was already scoped. Re-checked on the way
    // in anyway, because one query is cheaper than trusting that.
    const ana = await account();
    const stranger = await account();
    const theirs = await thread(stranger, "Their trip");
    const hidden = await task(theirs, stranger, "Not yours");
    const { jobId } = await dump(ana, "what is left");

    await post({
      outcome: "answered",
      jobId,
      replyText: "Nothing.",
      usage: goodUsage,
      found: [{ threadId: theirs, truncated: false, contentIds: [hidden] }],
    });

    const reply = await db
      .selectFrom("messages")
      .select("id")
      .where("role", "=", "offload")
      .executeTakeFirstOrThrow();
    expect((await foundFor([reply.id], ana)).get(reply.id) ?? []).toEqual([]);

    // And nothing was stored either, so it cannot leak on a later read.
    const stored = await db.selectFrom("message_content").select("content_id").execute();
    expect(stored).toEqual([]);
  });

  it("a dump carries no rows at all", async () => {
    const ana = await account();
    const { jobId } = await dump(ana, "milk and bread");
    await post({ outcome: "answered", jobId, replyText: "Filed.", usage: goodUsage });

    const reply = await db
      .selectFrom("messages")
      .select("id")
      .where("role", "=", "offload")
      .executeTakeFirstOrThrow();
    expect((await foundFor([reply.id], ana)).get(reply.id) ?? []).toEqual([]);
  });
});

// 015: the thread on screen, as a filing default.
//
// The value of this is entirely in the two halves being separate: the id is
// stored because they can see the thread, and the model is told it is a default
// rather than a destination. This file owns the first half. The second is the
// prompt's, and the block that carries it is asserted in the agent's tests.
describe("the thread a dump was typed in front of", () => {
  async function thread(accountId: string, name: string): Promise<string> {
    const row = await db
      .insertInto("threads")
      .values({ created_by_account_id: accountId, name })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("thread_members")
      .values({ thread_id: row.id, account_id: accountId, state: "accepted" })
      .execute();
    return row.id;
  }

  it("is stored on the message when they are a member", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Sustain");

    const { messageId } = await takeDump(accountId, "oat milk", undefined, threadId);

    const row = await db
      .selectFrom("messages")
      .select("looking_at_thread_id")
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(row.looking_at_thread_id).toBe(threadId);
  });

  it("is dropped when they are not, without refusing the dump", async () => {
    const mine = await account();
    const theirs = await account();
    const notMine = await thread(theirs, "Their thread");

    const { messageId } = await takeDump(mine, "oat milk", undefined, notMine);

    const row = await db
      .selectFrom("messages")
      .select(["looking_at_thread_id", "text"])
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    // The dump is the part that matters. Losing the default costs a
    // convenience, refusing the write costs what somebody wrote.
    expect(row.text).toBe("oat milk");
    expect(row.looking_at_thread_id).toBeNull();
  });

  it("is null when the dump came from outside a thread", async () => {
    const accountId = await account();

    const { messageId } = await takeDump(accountId, "oat milk");

    const row = await db
      .selectFrom("messages")
      .select("looking_at_thread_id")
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(row.looking_at_thread_id).toBeNull();
  });
});

describe("017 stopping a turn", () => {
  it("marks the job, clears the step, and says it stopped", async () => {
    const id = await account();
    const { messageId, turnId, jobId } = await dump(id, "when does the tip close");
    await db
      .updateTable("messages")
      .set({ step: "Checking when the tip closes", step_at: new Date() })
      .where("id", "=", messageId)
      .execute();

    expect(await cancelTurn(id, turnId)).toEqual({ state: "cancelled", stopped: true });

    const job = await db
      .selectFrom("jobs")
      .select("cancelled_at")
      .where("id", "=", jobId)
      .executeTakeFirstOrThrow();
    expect(job.cancelled_at).not.toBeNull();

    // A progress line surviving a cancel would be the screen still saying
    // offload is working on something nobody is working on.
    const message = await db
      .selectFrom("messages")
      .select(["step", "state"])
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(message.step).toBeNull();
    // **Still `seen`.** The worker posts `cancelled` and the turn settles
    // through the one path every other outcome takes, so a cancel cannot leave a
    // message in a state no `turn-result` produced.
    expect(message.state).toBe("seen");
  });

  it("does not undo a turn that already finished, and says what it really is", async () => {
    const id = await account();
    const { turnId, jobId } = await dump(id, "hello");
    await post({ outcome: "answered", jobId, replyText: "Noted.", usage: goodUsage });

    // AC-13. The press raced the answer and lost, which is the common case for a
    // turn that took just over ten seconds.
    expect(await cancelTurn(id, turnId)).toEqual({ state: "answered", stopped: false });
  });

  it("is idempotent, because a second press is a person pressing twice", async () => {
    const id = await account();
    const { turnId } = await dump(id, "hello");
    expect(await cancelTurn(id, turnId)).toEqual({ state: "cancelled", stopped: true });
    expect(await cancelTurn(id, turnId)).toEqual({ state: "cancelled", stopped: true });
  });

  it("will not stop somebody else's turn, and does not confirm it exists", async () => {
    const mine = await account();
    const theirs = await account();
    const { turnId } = await dump(theirs, "hello");
    // Null, which the route makes a 404: a 403 would confirm the row.
    expect(await cancelTurn(mine, turnId)).toBeNull();
  });

  it("sends the step on a turn still in flight, and stops sending it once settled", async () => {
    const id = await account();
    const { messageId, jobId } = await dump(id, "when does the tip close");

    await db
      .updateTable("messages")
      .set({ step: "Checking when the tip closes", step_at: new Date() })
      .where("id", "=", messageId)
      .execute();
    expect(await streamStep(messageId, id)).toEqual({
      do: "step",
      transcript: null,
      text: "Checking when the tip closes",
    });

    // **The settlement wins.** A worker can post its last step and its result
    // close enough together that one wake sees both, and a step drawn in
    // preference to the answer it preceded is a progress line that outlives the
    // thing it was describing.
    await post({ outcome: "answered", jobId, replyText: "Half four.", usage: goodUsage });
    const settled = await streamStep(messageId, id);
    expect(settled.do).toBe("answered");
  });

  it("ignores a step left behind by a worker that died", async () => {
    const id = await account();
    const { messageId } = await dump(id, "hello");
    await db
      .updateTable("messages")
      .set({
        step: "Looking something up",
        // Older than the staleness window. The message stays `seen` until the
        // job's own timeout reaps it, and without this a client reconnecting
        // would be told offload is still working by a process that is gone.
        step_at: new Date(Date.now() - 10 * 60 * 1000),
      })
      .where("id", "=", messageId)
      .execute();

    // 021: the in-flight answers carry the transcript, null until one exists.
    expect(await streamStep(messageId, id)).toEqual({ do: "wait", transcript: null });
  });
});

describe("the conversation's footer survives a reload", () => {
  /** A thread with one row filed into it by this message, and one source read
   *  by its turn. Written directly rather than through the tool endpoint,
   *  because what is under test is the two resolvers and not the write path. */
  async function filed(accountId: string, messageId: string, turnId: string, name: string) {
    const t = await db
      .insertInto("threads")
      .values({ created_by_account_id: accountId, name, last_activity_at: new Date() })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("thread_members")
      .values({ thread_id: t.id, account_id: accountId, state: "accepted" })
      .execute();
    await db
      .insertInto("content")
      .values({
        thread_id: t.id,
        account_id: accountId,
        type: "task",
        title: "Go to the tip",
        derived_from_message_id: messageId,
      })
      .execute();
    await db
      .insertInto("turn_sources")
      .values({
        turn_id: turnId,
        account_id: accountId,
        domain: "timeanddate.com",
        url: "https://timeanddate.com/x",
      })
      .execute();
    return t.id;
  }

  it("resolves where a page of turns filed, and what they read", async () => {
    const id = await account();
    const { messageId, turnId } = await dump(id, "when does the tip close");
    const threadId = await filed(id, messageId, turnId, "The tip");

    // **This is what a cold start used to lose.** The tail carried the text and
    // the state and nothing else, so every settled turn came back with no Done
    // mark, no thread pill and no source chip: the whole footer, gone on the
    // first reload, on the surface most likely to be reloaded.
    expect((await threadsForAll([messageId], id)).get(messageId)).toEqual([
      { id: threadId, name: "The tip", icon: "lasso", hue: 1 },
    ]);
    expect((await sourcesForAll([turnId], id)).get(turnId)).toEqual([
      { domain: "timeanddate.com", url: "https://timeanddate.com/x" },
    ]);
  });

  it("does not hand one account's threads or sources to another", async () => {
    const mine = await account();
    const theirs = await account();
    const { messageId, turnId } = await dump(theirs, "hello");
    await filed(theirs, messageId, turnId, "Theirs");

    expect((await threadsForAll([messageId], mine)).get(messageId)).toBeUndefined();
    expect((await sourcesForAll([turnId], mine)).get(turnId)).toBeUndefined();
  });

  it("asks nothing when the page is empty", async () => {
    const id = await account();
    expect((await threadsForAll([], id)).size).toBe(0);
    expect((await sourcesForAll([], id)).size).toBe(0);
  });
});

describe("a turn's state holds under two presses and a used day", () => {
  async function signIn(accountId: string): Promise<string> {
    const token = uuidv7();
    await db.insertInto("sessions").values({ account_id: accountId, token, expires_at: new Date(Date.now() + 3_600_000) }).execute();
    return `better-auth.session_token=${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`;
  }

  async function spendTheDay(accountId: string): Promise<void> {
    await db
      .insertInto("llm_usage")
      .values({ account_id: accountId, job_kind: "dump.answer", category: "interactive", model: "claude-sonnet-5", cost_micros: DAILY_MODEL_BUDGET_MICROS })
      .execute();
  }

  const queuedFor = (messageId: string) =>
    db
      .selectFrom("jobs")
      .select("id")
      .where("kind", "=", "dump.answer")
      .where("state", "=", "queued")
      .where(sql<string>`payload ->> 'messageId'`, "=", messageId)
      .execute();

  const resume = (messageId: string, cookie: string) =>
    app.inject({ method: "POST", url: `/v1/dumps/${messageId}/resume`, headers: { cookie } });

  it("starts one planner when a partial turn is resumed twice at once", async () => {
    const id = await account();
    const { messageId, jobId } = await dump(id, "dentist and the boiler");
    await post({ outcome: "partial", jobId, replyText: "Added the dentist.", usage: goodUsage });
    const cookie = await signIn(id);

    const both = await Promise.all([resume(messageId, cookie), resume(messageId, cookie)]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await queuedFor(messageId)).toHaveLength(1);
  });

  it("refuses a resume once the day is used, and leaves the turn as it was", async () => {
    const id = await account();
    const { messageId, jobId } = await dump(id, "dentist and the boiler");
    await post({ outcome: "partial", jobId, replyText: "Added the dentist.", usage: goodUsage });
    await spendTheDay(id);

    const res = await resume(messageId, await signIn(id));
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "daily_limit", scope: "account" });
    expect(await queuedFor(messageId)).toHaveLength(0);
    const message = await db.selectFrom("messages").select("state").where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(message.state).toBe("partial");
  });

  it("refuses the country re-run once the day is used, and leaves the question open", async () => {
    const id = await account();
    await db.updateTable("accounts").set({ country: "US" }).where("id", "=", id).execute();
    const { jobId, turnId } = await dump(id, "when is the next bank holiday");
    await post({
      outcome: "answered",
      jobId,
      replyText: "Which country?",
      usage: goodUsage,
      found: [],
      questions: [{ field: "country", title: "x", options: [{ label: "US", value: "US" }, { label: "TR", value: "TR" }] }],
    });
    const question = await db.selectFrom("questions").select("id").where("turn_id", "=", turnId).executeTakeFirstOrThrow();
    await spendTheDay(id);

    const res = await app.inject({
      method: "POST",
      url: `/v1/questions/${question.id}/answer`,
      headers: { cookie: await signIn(id) },
      payload: { option: 1 },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "daily_limit", scope: "account" });
    const after = await db.selectFrom("questions").select("state").where("id", "=", question.id).executeTakeFirstOrThrow();
    expect(after.state).toBe("open");
  });

  it("Stop ends a turn whose job has already gone dead", async () => {
    const id = await account();
    const { messageId, turnId, jobId } = await dump(id, "when does the tip close");
    // Reaped by the worker: no process will ever post this turn's result.
    await db.updateTable("jobs").set({ state: "dead" }).where("id", "=", jobId).execute();

    expect(await cancelTurn(id, turnId)).toEqual({ state: "cancelled", stopped: true });
    const message = await db.selectFrom("messages").select("state").where("id", "=", messageId).executeTakeFirstOrThrow();
    expect(message.state).toBe("cancelled");
  });

  it("closes a stream watching a cancelled turn", async () => {
    const id = await account();
    const { messageId } = await dump(id, "hello");
    await db.updateTable("messages").set({ state: "cancelled" }).where("id", "=", messageId).execute();
    expect(await streamStep(messageId, id)).toEqual({ do: "close" });
  });

  it("answering a date on a loose row names no thread and says it filed", async () => {
    const id = await account();
    const loose = await db
      .insertInto("threads")
      .values({ created_by_account_id: id, name: "Miscellaneous", always_on: true, updated_at: new Date() })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("thread_members").values({ thread_id: loose.id, account_id: id, state: "accepted" }).execute();
    await db.updateTable("accounts").set({ default_thread_id: loose.id }).where("id", "=", id).execute();

    const { jobId, turnId } = await dump(id, "renew the passport");
    const filed = await app.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId: loose.id, title: "Renew the passport" },
    });
    const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    await post({
      outcome: "answered",
      jobId,
      usage: goodUsage,
      questions: [{ field: "date", title: "Renew the passport", contentId: filed.json().contentId, options: [{ value: soon(3) }, { value: soon(9) }] }],
    });
    const question = await db.selectFrom("questions").select("id").where("turn_id", "=", turnId).executeTakeFirstOrThrow();

    const answered = await answerQuestion(id, question.id, 0);
    if (!answered || !("envelope" in answered)) throw new Error("no envelope");
    expect(answered.applied).toBe(true);
    expect(answered.envelope.threads).toEqual([]);
    expect(answered.envelope).toMatchObject({ filed: true });
  });
});
