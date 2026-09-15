// Filing, and taking it back.
//
// AC-1  a dump becomes content in threads, pointing back at the message.
// AC-2  a piece always has a thread; the default is found by id, not by name.
// AC-4  one refusal reason, so a failure cannot probe for other accounts.
// AC-5  membership on every call, through thread_members, state accepted.
// AC-7  the account comes from the job row and there is no field for one.
// AC-9  Undo reverses the whole turn under one purge_after.
// AC-10 nothing is destroyed while Undo is available.
// AC-11 Undo is idempotent.
// AC-12 the purge job deletes only what is due, and halts past its ceiling.
// AC-14 a tool that fails answers rather than erroring.
// AC-16 a partial turn can be resumed, and only a partial one.
// AC-17 a retried tool call files one row.
// AC-18 the bound is enforced by the API, not only by the loop.
// AC-20 every model call writes a usage row.
//
// Through the built app rather than the functions underneath: the properties
// asserted here are properties of the request, and the transaction boundary is
// the thing most likely to be got wrong.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { buildApp, type App } from "../src/app.js";
import { env } from "../src/env.js";
import { streamStep } from "../src/routes/dumps.js";
import { handlers, PURGE_CEILING } from "../src/jobs/handlers.js";
import { undoTurn } from "../src/routes/dumps.js";
import { MAX_TOOL_CALLS } from "../src/routes/tools.js";
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
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
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

/** A thread the account is an accepted member of, unless told otherwise. */
async function thread(
  accountId: string,
  name: string,
  state: "accepted" | "pending" = "accepted"
): Promise<string> {
  const row = await db
    .insertInto("threads")
    // The database's clock, not Node's. `touchThread` writes `now()`, and
    // comparing that against `new Date()` compares two clocks: Node runs on the
    // host and Postgres in a Docker VM, and they drift by a millisecond or two
    // in either direction. That is what made this file flaky.
    .values({
      created_by_account_id: accountId,
      name,
      last_activity_at: sql`now()`,
      updated_at: sql`now()`,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("thread_members")
    .values({ thread_id: row.id, account_id: accountId, state })
    .execute();
  return row.id;
}

/** A dump with a job against it, the way the route writes one. */
async function dump(accountId: string, text = "dentist after the 20th") {
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
      text,
      state: "seen",
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const job = await db
    .insertInto("jobs")
    .values({
      kind: "dump.answer",
      account_id: accountId,
      payload: JSON.stringify({
        messageId: message.id,
        conversationId: conversation.id,
        turnId,
      }),
      priority: 10,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return { conversationId: conversation.id, messageId: message.id, turnId, jobId: job.id };
}

const tool = (payload: unknown, token = env.INTERNAL_SERVICE_TOKEN) =>
  app.inject({
    method: "POST",
    url: "/internal/v1/tool-call",
    headers: { authorization: `Bearer ${token}` },
    payload: payload as Record<string, unknown>,
  });

const turnResult = (payload: unknown) =>
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

describe("the tool endpoint is not trusted with an identity", () => {
  it("refuses without a token, and with the wrong one", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId } = await dump(accountId);

    const call = { tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "x" };

    const none = await app.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      payload: call,
    });
    expect(none.statusCode).toBe(401);

    expect((await tool(call, "wrong-token-entirely")).statusCode).toBe(401);
    expect((await tool(call)).statusCode).toBe(200);
  });

  it("takes the account from the job row, and a job of another kind is unknown", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");

    // A job carrying a messageId, of a kind this endpoint does not serve. The
    // scoping is what stops the next job kind being written into silently.
    const other = await db
      .insertInto("jobs")
      .values({
        kind: "email.invited",
        account_id: accountId,
        payload: JSON.stringify({ messageId: uuidv7() }),
        run_after: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const response = await tool({
      tool: "add_content", type: "task",
      jobId: other.id,
      toolCallId: "t1",
      threadId,
      title: "x",
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects a body that tries to name an account (AC-7)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId } = await dump(accountId);

    // There is no accountId field, and the union is strict, so naming one is a
    // schema failure rather than something quietly ignored.
    const response = await tool({
      tool: "add_content", type: "task",
      jobId,
      toolCallId: "t1",
      threadId,
      title: "x",
      accountId: uuidv7(),
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("authority over a thread", () => {
  it("files into a thread the account is an accepted member of (AC-1)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, messageId } = await dump(accountId);

    const response = await tool({
      tool: "add_content", type: "task",
      jobId,
      toolCallId: "t1",
      threadId,
      title: "Dentist after the 20th",
      body: "",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, threadName: "Flat admin" });

    const rows = await db
      .selectFrom("content")
      .selectAll()
      .where("derived_from_message_id", "=", messageId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Dentist after the 20th");
    expect(rows[0]!.thread_id).toBe(threadId);
    expect(rows[0]!.account_id).toBe(accountId);
  });

  it("refuses a pending membership, an absent thread and somebody else's, identically (AC-4, AC-5)", async () => {
    const mine = await account();
    const theirs = await account();
    const pending = await thread(mine, "Not yet", "pending");
    const other = await thread(theirs, "Theirs");
    const { jobId } = await dump(mine);

    const bodies: string[] = [];
    for (const [i, threadId] of [pending, other, uuidv7()].entries()) {
      const response = await tool({
        tool: "add_content", type: "task",
        jobId,
        toolCallId: `t${i}`,
        threadId,
        title: "x",
      });
      expect(response.statusCode).toBe(200);
      bodies.push(response.body);
    }

    // Byte-identical. Two reasons would make this a membership oracle for any
    // thread id a caller could guess.
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!)).toEqual({ ok: false, error: "unknown_thread" });

    expect(await db.selectFrom("content").selectAll().execute()).toHaveLength(0);
  });

  it("creates a thread with its first membership, and can file into it (AC-2)", async () => {
    const accountId = await account();
    const { jobId } = await dump(accountId);

    const created = await tool({
      tool: "create_thread",
      jobId,
      toolCallId: "c1",
      name: "Bookshelf build",
    });
    expect(created.json()).toMatchObject({ ok: true, threadName: "Bookshelf build" });
    const threadId = created.json().threadId;

    const members = await db
      .selectFrom("thread_members")
      .selectAll()
      .where("thread_id", "=", threadId)
      .execute();
    expect(members).toHaveLength(1);
    expect(members[0]!.state).toBe("accepted");

    // The membership query add_content runs is the one that has to find it.
    const filed = await tool({
      tool: "add_content", type: "task",
      jobId,
      toolCallId: "t1",
      threadId,
      title: "Oak brackets, 30cm, matte black",
    });
    expect(filed.json().ok).toBe(true);
  });
});

describe("bounds and repeats", () => {
  it("files one row for a repeated tool call (AC-17)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, messageId } = await dump(accountId);

    const call = {
      tool: "add_content", type: "task",
      jobId,
      toolCallId: "toolu_same",
      threadId,
      title: "Dentist",
    };

    const first = await tool(call);
    const second = await tool(call);

    expect(first.json().contentId).toBe(second.json().contentId);

    const rows = await db
      .selectFrom("content")
      .selectAll()
      .where("derived_from_message_id", "=", messageId)
      .execute();
    expect(rows).toHaveLength(1);

    // And the counter moved once, not twice.
    const t = await db
      .selectFrom("threads")
      .select("content_count")
      .where("id", "=", threadId)
      .executeTakeFirstOrThrow();
    expect(t.content_count).toBe(1);
  });

  it("stops at the bound, with the loop's own counter bypassed (AC-18)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, messageId } = await dump(accountId);

    for (let i = 0; i < MAX_TOOL_CALLS; i++) {
      const response = await tool({
        tool: "add_content", type: "task",
        jobId,
        toolCallId: `t${i}`,
        threadId,
        title: `piece ${i}`,
      });
      expect(response.json().ok).toBe(true);
    }

    const over = await tool({
      tool: "add_content", type: "task",
      jobId,
      toolCallId: "one-too-many",
      threadId,
      title: "nope",
    });
    expect(over.statusCode).toBe(200);
    expect(over.json()).toEqual({ ok: false, error: "limit_reached" });

    const rows = await db
      .selectFrom("content")
      .selectAll()
      .where("derived_from_message_id", "=", messageId)
      .execute();
    expect(rows).toHaveLength(MAX_TOOL_CALLS);
  });

  it("files an eleven-item list without refusing any of it", async () => {
    // The bound is a bound on a runaway loop, not on a list somebody wrote.
    // Eleven items is what "Todos each: repellent, clean litter, duggies,
    // shave, brush, grocery, sandwiches, water plants, eye mask, trash bag,
    // bottles" was, reported from production on 2026-09-11: eight landed, three
    // were refused, and the retry could not file them either because this
    // counter is per message. Written as eleven rather than as MAX_TOOL_CALLS
    // so that lowering the constant fails here rather than quietly truncating
    // somebody's shopping again.
    const accountId = await account();
    const threadId = await thread(accountId, "sustain/release");
    const { jobId, messageId } = await dump(accountId);

    for (let i = 0; i < 11; i++) {
      const response = await tool({
        tool: "add_content",
        type: "task",
        jobId,
        toolCallId: `list${i}`,
        threadId,
        title: `item ${i}`,
      });
      expect(response.json()).toMatchObject({ ok: true });
    }

    const rows = await db
      .selectFrom("content")
      .select("id")
      .where("derived_from_message_id", "=", messageId)
      .execute();
    expect(rows).toHaveLength(11);
  });

  it("bumps the thread's count and activity in the same write (AC-1)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId } = await dump(accountId);

    const before = await db
      .selectFrom("threads")
      .select(["content_count", "last_activity_at"])
      .where("id", "=", threadId)
      .executeTakeFirstOrThrow();

    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "a" });
    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t2", threadId, title: "b" });

    const after = await db
      .selectFrom("threads")
      .select(["content_count", "last_activity_at"])
      .where("id", "=", threadId)
      .executeTakeFirstOrThrow();

    expect(after.content_count).toBe(before.content_count + 2);
    expect(after.last_activity_at.getTime()).toBeGreaterThanOrEqual(
      before.last_activity_at.getTime()
    );
  });
});

describe("a turn that stopped partway", () => {
  it("writes the reply, marks the message partial, and keeps the content (AC-15)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, messageId, turnId } = await dump(accountId);

    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "Dentist" });

    const response = await turnResult({
      outcome: "partial",
      jobId,
      replyText: "Added to Flat admin. There was more in that one than offload got through.",
      usage: [usage, usage],
    });
    expect(response.json()).toEqual({ status: "written" });

    const person = await db
      .selectFrom("messages")
      .select("state")
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(person.state).toBe("partial");

    const reply = await db
      .selectFrom("messages")
      .selectAll()
      .where("turn_id", "=", turnId)
      .where("role", "=", "offload")
      .execute();
    expect(reply).toHaveLength(1);

    // Nothing already filed is touched by a partial outcome.
    expect(await db.selectFrom("content").selectAll().execute()).toHaveLength(1);

    // One row per model call, not per turn (AC-20).
    expect(await db.selectFrom("llm_usage").selectAll().execute()).toHaveLength(2);
  });

  it("accepts the single-object usage shape for one release (AC-20)", async () => {
    const accountId = await account();
    const { jobId } = await dump(accountId);

    await turnResult({ outcome: "answered", jobId, replyText: "Done.", usage });
    expect(await db.selectFrom("llm_usage").selectAll().execute()).toHaveLength(1);
  });

  it("resumes a partial turn, and refuses to resume an answered one (AC-16)", async () => {
    const accountId = await account();
    const { jobId, messageId } = await dump(accountId);

    await turnResult({ outcome: "partial", jobId, replyText: "Added to Flat admin.", usage: [usage] });

    // Unauthenticated here: the route's session check is covered with the rest
    // of the session-scoped routes. What this asserts is the state machine.
    const before = await db
      .selectFrom("messages")
      .select("state")
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(before.state).toBe("partial");

    // A resumed turn's result arrives against a `partial` message and must not
    // be discarded as a duplicate.
    const resumeJob = await db
      .insertInto("jobs")
      .values({
        kind: "dump.answer",
        account_id: accountId,
        payload: JSON.stringify({
          messageId,
          conversationId: (
            await db
              .selectFrom("messages")
              .select("conversation_id")
              .where("id", "=", messageId)
              .executeTakeFirstOrThrow()
          ).conversation_id,
          turnId: (
            await db
              .selectFrom("messages")
              .select("turn_id")
              .where("id", "=", messageId)
              .executeTakeFirstOrThrow()
          ).turn_id,
        }),
        run_after: new Date(),
        state: "running",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const finished = await turnResult({
      outcome: "answered",
      jobId: resumeJob.id,
      replyText: "And the brackets went in Bookshelf build.",
      usage: [usage],
    });
    expect(finished.json()).toEqual({ status: "written" });

    const after = await db
      .selectFrom("messages")
      .select("state")
      .where("id", "=", messageId)
      .executeTakeFirstOrThrow();
    expect(after.state).toBe("answered");

    // A third result against an answered message changes nothing.
    const again = await turnResult({
      outcome: "answered",
      jobId: resumeJob.id,
      replyText: "again",
      usage: [usage],
    });
    expect(again.json()).toEqual({ status: "already" });
  });
});

describe("undo", () => {
  it("refuses the route without a session", async () => {
    const accountId = await account();
    const { turnId } = await dump(accountId);
    const response = await app.inject({
      method: "POST",
      url: `/v1/turns/${turnId}/undo`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("reverses the dump, the content and the reply together (AC-9)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, messageId, turnId } = await dump(accountId);

    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "Dentist" });
    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t2", threadId, title: "Brackets" });
    await turnResult({ outcome: "answered", jobId, replyText: "Added to Flat admin.", usage: [usage] });

    expect(await undoTurn(accountId, turnId)).toEqual({ undone: true });

    const messages = await db
      .selectFrom("messages")
      .select(["role", "deleted_at", "purge_after"])
      .where("turn_id", "=", turnId)
      .execute();
    const rows = await db
      .selectFrom("content")
      .select(["deleted_at", "purge_after"])
      .where("derived_from_message_id", "=", messageId)
      .execute();

    // The person's dump, offload's reply, and both pieces of content.
    expect(messages).toHaveLength(2);
    expect(rows).toHaveLength(2);

    const all = [...messages, ...rows];
    for (const row of all) {
      expect(row.deleted_at).not.toBeNull();
      expect(row.purge_after).not.toBeNull();
    }

    // One deletion, one purge window, for the whole turn. Two would mean two
    // purges, and half a turn surviving the other half.
    expect(new Set(all.map((r) => r.deleted_at!.getTime())).size).toBe(1);
    expect(new Set(all.map((r) => r.purge_after!.getTime())).size).toBe(1);

    // Eight seconds, not eight minutes and not zero.
    const gap = all[0]!.purge_after!.getTime() - all[0]!.deleted_at!.getTime();
    expect(gap).toBe(8_000);
  });

  it("destroys nothing while Undo is available (AC-10)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, messageId, turnId } = await dump(accountId);
    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "Dentist" });
    await turnResult({ outcome: "answered", jobId, replyText: "Added.", usage: [usage] });

    await undoTurn(accountId, turnId);

    // Still selectable with the deleted_at filter dropped, which is the whole
    // difference between an undo and a delete.
    expect(
      await db.selectFrom("content").selectAll().where("derived_from_message_id", "=", messageId).execute()
    ).toHaveLength(1);
    expect(
      await db.selectFrom("messages").selectAll().where("turn_id", "=", turnId).execute()
    ).toHaveLength(2);
  });

  it("is idempotent, and enqueues one purge per undo (AC-11)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, turnId } = await dump(accountId);
    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "Dentist" });

    expect(await undoTurn(accountId, turnId)).toEqual({ undone: true });

    const after = await db.selectFrom("content").select("deleted_at").execute();

    expect(await undoTurn(accountId, turnId)).toEqual({ undone: false });

    // Unchanged by the second press, including the timestamps: a second undo
    // that re-stamped purge_after would extend the window every time somebody
    // pressed it twice.
    expect(await db.selectFrom("content").select("deleted_at").execute()).toEqual(after);

    const purges = await db
      .selectFrom("jobs")
      .selectAll()
      .where("kind", "=", "content.purge")
      .execute();
    expect(purges).toHaveLength(1);
    // Enqueued by the delete, not a timer, and set to run after the window.
    expect(purges[0]!.run_after.getTime()).toBeGreaterThan(Date.now() + 5_000);
  });

  it("refuses another account's turn (AC-9)", async () => {
    const mine = await account();
    const theirs = await account();
    const { turnId } = await dump(mine);

    expect(await undoTurn(theirs, turnId)).toBeNull();
    expect(
      await db.selectFrom("messages").select("deleted_at").where("turn_id", "=", turnId).execute()
    ).toEqual([{ deleted_at: null }]);
  });
});

describe("the purge job", () => {
  const purge = handlers["content.purge"]!;
  const deps = { mailer: { send: async () => {} } } as never;

  it("leaves a row that is inside its window, and takes it after (AC-10, AC-12)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId, messageId } = await dump(accountId);
    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "Dentist" });

    // Soft-deleted, purge eight seconds out, exactly as undo writes it.
    await db
      .updateTable("content")
      .set({ deleted_at: new Date(), purge_after: new Date(Date.now() + 8_000) })
      .where("derived_from_message_id", "=", messageId)
      .execute();

    await purge({}, deps);
    expect(await db.selectFrom("content").selectAll().execute()).toHaveLength(1);

    await db
      .updateTable("content")
      .set({ purge_after: new Date(Date.now() - 1_000) })
      .execute();

    await purge({}, deps);
    expect(await db.selectFrom("content").selectAll().execute()).toHaveLength(0);
  });

  it("never takes a row that was not soft-deleted, however old its purge_after (AC-12)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId } = await dump(accountId);
    await tool({ tool: "add_content", type: "task", jobId, toolCallId: "t1", threadId, title: "Dentist" });

    // The dangerous shape: due, and never deleted. Both predicates are stated
    // in the handler precisely so this row survives.
    await db
      .updateTable("content")
      .set({ deleted_at: null, purge_after: new Date(Date.now() - 60_000) })
      .execute();

    await purge({}, deps);
    expect(await db.selectFrom("content").selectAll().execute()).toHaveLength(1);
  });

  it("halts rather than deleting past its ceiling (AC-12)", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { messageId } = await dump(accountId);

    const past = new Date(Date.now() - 60_000);
    const rows = Array.from({ length: PURGE_CEILING + 1 }, (_, i) => ({
      account_id: accountId,
      thread_id: threadId,
      derived_from_message_id: messageId,
      type: "task" as const,
      title: `piece ${i}`,
      updated_at: new Date(),
      deleted_at: past,
      purge_after: past,
    }));
    await db.insertInto("content").values(rows).execute();

    await expect(purge({}, deps)).rejects.toThrow(/ceiling/);

    // Nothing deleted. A run that wants to destroy an absurd number of rows is
    // a bug, and the right response to a bug in a delete is to stop.
    expect(await db.selectFrom("content").selectAll().execute()).toHaveLength(
      PURGE_CEILING + 1
    );
  });
});


describe("a turn that changes what is already there says so", () => {
  // The bug: `threads` on an answer came from `content.derived_from_message_id`,
  // which only ever matches `add_content`. A move produces no content, so the
  // list came back empty, and the screen reads an empty list as "this turn did
  // nothing": no Done mark on a move that worked, and no reload of either
  // thread, so the row stayed on screen in a thread it had left.
  it("reports both ends of a move, and only the destination as where it went", async () => {
    const accountId = await account();
    const from = await thread(accountId, "Flat admin");
    const to = await thread(accountId, "Bookshelf build");

    // Filed by one turn and moved by a later one, which is the case that broke.
    // Move it inside the turn that filed it and the old query answers correctly
    // by accident: the content is derived from that message either way, so it
    // reports whichever thread the row ended up in.
    const { jobId: filing } = await dump(accountId);
    const added = await tool({
      tool: "add_content", type: "task",
      jobId: filing,
      toolCallId: "a1",
      threadId: from,
      title: "Oak brackets",
    });
    const contentId = (added.json() as { contentId: string }).contentId;
    await turnResult({ outcome: "answered", jobId: filing, replyText: "Saved.", usage });

    const { jobId, messageId } = await dump(accountId, "move the brackets to the bookshelf one");
    const moved = await tool({
      tool: "move_content",
      jobId,
      toolCallId: "m1",
      contentId,
      threadId: to,
    });
    expect(moved.statusCode).toBe(200);
    await turnResult({ outcome: "answered", jobId, replyText: "Moved the brackets.", usage });

    const step = await streamStep(messageId, accountId);
    expect(step.do).toBe("answered");
    if (step.do !== "answered") throw new Error("unreachable");

    // Where it went: the destination alone. The thread it left must never be a
    // pill, which says where things went, and saying it went somewhere it just
    // came out of is the one thing that surface must not do.
    expect(step.threads.map((t) => t.id)).toEqual([to]);

    // What changed: both. The source has to reload or it goes on showing a row
    // that is not in it.
    expect([...step.changed].sort()).toEqual([from, to].sort());
  });

  it("earns the Done mark for a tick, which files nothing at all", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { jobId: first, messageId: firstMessage } = await dump(accountId);

    const added = await tool({
      tool: "add_content", type: "task",
      jobId: first,
      toolCallId: "a1",
      threadId,
      title: "Chase the deposit",
    });
    const contentId = (added.json() as { contentId: string }).contentId;
    await turnResult({ outcome: "answered", jobId: first, replyText: "Saved.", usage });
    void firstMessage;

    // A second turn that only ticks it off. Nothing is filed, so before this
    // the answer carried an empty list and the turn wore no Done mark.
    const { jobId, messageId } = await dump(accountId, "tick the deposit off");
    const ticked = await tool({
      tool: "complete_content",
      jobId,
      toolCallId: "c1",
      contentId,
      done: true,
    });
    expect(ticked.statusCode).toBe(200);
    await turnResult({ outcome: "answered", jobId, replyText: "Ticked it off.", usage });

    const step = await streamStep(messageId, accountId);
    if (step.do !== "answered") throw new Error("unreachable");
    // Non-empty is the whole assertion: the client reads this as "the turn did
    // something", which is what draws Done and what reloads the thread.
    expect(step.threads.map((t) => t.id)).toEqual([threadId]);
    expect(step.changed).toEqual([threadId]);
  });
});


describe("a row typed straight into a thread", () => {
  /** A quick-add job, the way the route writes one. */
  async function typed(accountId: string, threadId: string, text: string) {
    const row = await db
      .insertInto("content")
      .values({
        account_id: accountId,
        thread_id: threadId,
        type: "task",
        title: text,
        source: "person",
        filing_at: new Date(),
        updated_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    const job = await db
      .insertInto("jobs")
      .values({
        kind: "thread.quick_add",
        account_id: accountId,
        payload: JSON.stringify({ contentId: row.id, threadId }),
        priority: 10,
        run_after: new Date(),
        state: "running",
        locked_at: new Date(),
        locked_by: "test",
        attempts: 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return { contentId: row.id, jobId: job.id };
  }

  it("may tidy the row it was given", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const { contentId, jobId } = await typed(accountId, threadId, "call plumber tues");

    const response = await tool({
      tool: "edit_content",
      jobId,
      toolCallId: "e1",
      contentId,
      title: "Call the plumber",
    });
    expect(response.json()).toEqual({ ok: true, done: true });
  });

  // The person picked the thread by typing into it, so the model has no choice
  // to make and must not be given one. The prompt says so and the narrow tool
  // list says so; this is the half that does not depend on either, because a
  // shared thread can hold text somebody else wrote.
  it("may not write to any other thread, whatever it asks for", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Flat admin");
    const elsewhere = await thread(accountId, "Lisbon trip");
    const { jobId } = await typed(accountId, threadId, "brackets");

    const intoAnother = await tool({
      tool: "add_content", type: "task",
      jobId,
      toolCallId: "a1",
      threadId: elsewhere,
      title: "Sneaked in",
    });
    expect(intoAnother.json()).toEqual({ ok: false, error: "unknown_thread" });

    const started = await tool({
      tool: "create_thread",
      jobId,
      toolCallId: "c1",
      name: "A thread of my own",
    });
    expect(started.json()).toEqual({ ok: false, error: "unknown_thread" });

    // Nothing landed anywhere it should not have.
    const rows = await db
      .selectFrom("content")
      .select("id")
      .where("thread_id", "=", elsewhere)
      .execute();
    expect(rows).toHaveLength(0);
  });

  it("may add a second piece to its own thread, for text that was several things", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "Bookshelf build");
    const { jobId } = await typed(accountId, threadId, "brackets, screws, timber");

    const second = await tool({
      tool: "add_content", type: "task",
      jobId,
      toolCallId: "a1",
      threadId,
      title: "Screws",
    });
    expect(second.statusCode).toBe(200);
    expect((second.json() as { ok: boolean }).ok).toBe(true);
  });
});

describe("016 what a turn read", () => {
  it("records the sources against the turn, and the tally against nobody", async () => {
    const accountId = await account();
    const threadId = await thread(accountId, "EU with fam");
    const { jobId, turnId } = await dump(accountId);

    // **Scoped to today's row, because the tally is keyed by (domain, day).**
    // Without the day filter this reads whichever row the planner happens to
    // return, and the assertion at the bottom reads the other one: it passed for
    // as long as the suite ran inside one day and failed the first time midnight
    // landed between two runs (22 where it wanted 23). Same class as the job
    // test that asserted against whichever row was first in the table.
    const existing = await db
      .selectFrom("domain_reads")
      .select("count")
      .where("domain", "=", "timeanddate.com")
      .where("day", "=", sql`current_date`)
      .executeTakeFirst();
    const before = existing?.count ?? 0;

    await tool({
      tool: "add_content",
      type: "task",
      jobId,
      toolCallId: "web1",
      threadId,
      title: "Book the flat",
    });

    const posted = await turnResult({
      outcome: "answered",
      jobId,
      usage: [usage],
      sources: [{ domain: "timeanddate.com", url: "https://timeanddate.com/holidays" }],
      lookups: [
        { label: "when_is", kind: "search", outcome: "used", costMicros: 10000 },
        // A label nobody defined. It becomes `other` rather than becoming a
        // free text column, which is the whole design of this table.
        {
          label: "whatever the model felt like",
          kind: "search",
          outcome: "unused",
          costMicros: 0,
        },
      ],
    });
    expect(posted.statusCode).toBe(200);

    const sources = await db
      .selectFrom("turn_sources")
      .selectAll()
      .where("turn_id", "=", turnId)
      .execute();
    expect(sources).toHaveLength(1);
    expect(sources[0]!.domain).toBe("timeanddate.com");
    expect(sources[0]!.account_id).toBe(accountId);

    const labels = await db
      .selectFrom("lookups")
      .select(["label", "outcome"])
      .where("account_id", "=", accountId)
      .orderBy("created_at")
      .execute();
    expect(labels.map((l) => l.label)).toEqual(["when_is", "other"]);

    // The tally has no account id at all. Not "we do not query it by account":
    // there is no column to query it by, which is the difference between
    // aggregate by construction and aggregate by policy.
    //
    // **Asserted as an increment rather than as a count**, because the tally
    // has no account to cascade from and therefore survives `beforeEach`
    // deleting every account. That is the design working: a tally that
    // disappeared when an account did would be a tally joined to one.
    const tally = await db
      .selectFrom("domain_reads")
      .selectAll()
      .where("domain", "=", "timeanddate.com")
      .where("day", "=", sql`current_date`)
      .executeTakeFirstOrThrow();
    expect(tally.count).toBe(before + 1);
    expect(Object.keys(tally)).toEqual(["domain", "day", "count"]);
  });

  it("holds no query and no page text anywhere", async () => {
    // The one that would hurt. Nothing about what was asked, or what came
    // back, may be reconstructible from any of the three tables (OFF-1).
    const accountId = await account();
    const { jobId } = await dump(accountId, "when is memorial day and will it rain in lisbon");

    await turnResult({
      outcome: "answered",
      jobId,
      usage: [usage],
      sources: [{ domain: "timeanddate.com", url: "https://timeanddate.com/holidays" }],
      lookups: [{ label: "when_is", kind: "search", outcome: "used", costMicros: 10000 }],
    });

    const rows = await db.selectFrom("lookups").selectAll().where("account_id", "=", accountId).execute();
    const written = JSON.stringify(rows);
    expect(written).not.toContain("memorial");
    expect(written).not.toContain("lisbon");
  });
});
