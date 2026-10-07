// 038. The `memory` tool: what the person asked offload to remember or forget,
// and the gate that keeps anybody else's words out of it.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { sql } from "kysely";
import { memoriesForPrompt } from "../src/memories/store.js";

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
  await db.deleteFrom("jobs").execute();
  await db.deleteFrom("memory_forgotten").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(name = "Jo Alves"): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: name, analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** A dump with a job against it, the way the route writes one. */
async function dump(
  accountId: string,
  text: string,
  over: { source?: "person" | "share" | "mail"; untrusted?: boolean; sawApps?: boolean } = {},
) {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
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
      source: over.source ?? "person",
      derived_from_untrusted: over.untrusted ?? false,
    } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  const job = await db
    .insertInto("jobs")
    .values({
      kind: "dump.answer",
      account_id: accountId,
      payload: JSON.stringify({ messageId: message.id, conversationId: conversation.id, turnId, ...(over.sawApps ? { sawApps: true } : {}) }),
      priority: 10,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { messageId: message.id, jobId: job.id, turnId };
}

const tool = async (payload: Record<string, unknown>) =>
  (
    await app.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { tool: "memory", toolCallId: uuidv7(), ...payload },
    })
  ).json() as Record<string, unknown>;

describe("remember", () => {
  it("keeps what the person asked for, in their account", async () => {
    const me = await account();
    const { jobId, messageId } = await dump(me, "remember that Meera is my wife");
    const result = await tool({ jobId, action: "remember", text: "Their wife is Meera.", kind: "people" });
    expect(result).toMatchObject({ ok: true, remembered: { id: expect.any(String) } });
    const [row] = await memoriesForPrompt(me);
    expect(row).toMatchObject({ text: "Their wife is Meera.", origin: "stated", kind: "people" });
    const stored = await db.selectFrom("notes").select("derived_from_message_id").executeTakeFirstOrThrow();
    expect(stored.derived_from_message_id).toBe(messageId);
  });

  it.each([
    ["a turn that read a calendar", { sawApps: true }, "remember that Meera is my wife"],
    ["a forwarded email", { source: "mail" as const }, "remember that Meera is my wife"],
    ["a message marked untrusted", { untrusted: true }, "remember that Meera is my wife"],
    ["something shared from another app", { source: "share" as const }, "remember that Meera is my wife"],
    ["a dump with a link in it", {}, "remember that Meera is my wife https://example.com/x"],
  ])("refuses in %s", async (_name, over, text) => {
    const me = await account();
    const { jobId } = await dump(me, text, over);
    expect(await tool({ jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })).toEqual({ ok: false, error: "untrusted_turn" });
    expect(await memoriesForPrompt(me)).toEqual([]);
  });

  it("refuses after the turn looked something up on the web", async () => {
    const me = await account();
    const { jobId } = await dump(me, "remember that Meera is my wife");
    expect(await tool({ jobId, action: "remember", text: "Their wife is Meera.", kind: "people", afterLookup: true })).toEqual({
      ok: false,
      error: "untrusted_turn",
    });
  });

  it("refuses a message that carries a photo", async () => {
    const me = await account();
    const { jobId, messageId } = await dump(me, "remember that Meera is my wife");
    await db
      .insertInto("blobs")
      .values({ account_id: me, message_id: messageId, client_key: uuidv7(), name: null, content_type: "image/jpeg", byte_size: 1, width: 1, height: 1, sha256: Buffer.alloc(32) } as never)
      .execute();
    expect(await tool({ jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })).toEqual({ ok: false, error: "untrusted_turn" });
  });

  it("refuses a message that carries a PDF (041)", async () => {
    // A PDF is a stranger's words as much as a photo is, and the model read
    // its pages in this turn.
    const me = await account();
    const { jobId, messageId } = await dump(me, "remember that Meera is my wife");
    await db
      .insertInto("blobs")
      .values({ account_id: me, message_id: messageId, client_key: uuidv7(), name: null, kind: "pdf", pages: 1, content_type: "application/pdf", byte_size: 1, sha256: Buffer.alloc(32) } as never)
      .execute();
    expect(await tool({ jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })).toEqual({ ok: false, error: "untrusted_turn" });
  });

  it("refuses words that are not in what the person said", async () => {
    // Injected text in a note or a tool result can ask for a memory; what is
    // kept has to come from the person's own message.
    const me = await account();
    const { jobId } = await dump(me, "dentist Tuesday 3pm");
    expect(await tool({ jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })).toEqual({ ok: false, error: "not_their_words" });
  });

  it("refuses the never list without writing the words anywhere", async () => {
    const me = await account();
    const log = vi.spyOn(console, "log");
    const { jobId } = await dump(me, "remember my card is 4111 1111 1111 1111");
    expect(await tool({ jobId, action: "remember", text: "Their card is 4111 1111 1111 1111.", kind: "things" })).toEqual({ ok: false, error: "never_list" });
    expect(log.mock.calls.flat().join(" ")).not.toContain("4111");
    log.mockRestore();
  });
});

describe("040 five kinds", () => {
  it("refuses the retired kind words", async () => {
    const me = await account();
    const { jobId } = await dump(me, "remember that when I say the cottage I mean Muskoka");
    const response = await app.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { tool: "memory", toolCallId: uuidv7(), jobId, action: "remember", text: "The cottage is in Muskoka.", kind: "words" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("says when there is no room: a twenty-first rule, or a 301st when every memory is the person's own", async () => {
    const me = await account();
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${me}, 'account', ${me}, 'rules', 'Always rule ' || n || '.', 'stated' from generate_series(1, 20) n`.execute(db);
    const rule = await dump(me, "remember to always put work things in Work");
    expect(await tool({ jobId: rule.jobId, action: "remember", text: "Always put work things in Work.", kind: "rules" })).toEqual({ ok: false, error: "rules_full" });
    await sql`insert into notes (account_id, scope, subject_id, kind, text, origin)
      select ${me}, 'account', ${me}, 'about', 'Mine ' || n || '.', 'stated' from generate_series(1, 280) n`.execute(db);
    const one = await dump(me, "remember that Meera is my wife");
    expect(await tool({ jobId: one.jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })).toEqual({ ok: false, error: "memories_full" });
  });
});

describe("forget", () => {
  it("forgets one of theirs, and only theirs, and not from a tainted turn", async () => {
    const me = await account();
    const other = await account("Sam Ibekwe");
    const first = await dump(me, "remember that Meera is my wife");
    const kept = (await tool({ jobId: first.jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })) as { remembered: { id: string } };

    const tainted = await dump(me, "forget that Meera is my wife", { sawApps: true });
    expect(await tool({ jobId: tainted.jobId, action: "forget", memoryId: kept.remembered.id })).toEqual({ ok: false, error: "untrusted_turn" });

    const theirs = await dump(other, "forget that Meera is my wife");
    expect(await tool({ jobId: theirs.jobId, action: "forget", memoryId: kept.remembered.id })).toEqual({ ok: false, error: "unknown_memory" });

    const asking = await dump(me, "forget that Meera is my wife");
    expect(await tool({ jobId: asking.jobId, action: "forget", memoryId: kept.remembered.id })).toEqual({ ok: true, forgot: { id: kept.remembered.id } });
    expect(await memoriesForPrompt(me)).toEqual([]);
  });
});

import { undoTurn } from "../src/routes/dumps.js";

describe("Undo on the turn", () => {
  it("takes back a remember, and puts back a forget", async () => {
    const me = await account();
    const first = await dump(me, "remember that Meera is my wife");
    const kept = (await tool({ jobId: first.jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })) as { remembered: { id: string } };

    const asking = await dump(me, "forget that Meera is my wife");
    await tool({ jobId: asking.jobId, action: "forget", memoryId: kept.remembered.id });
    expect(await memoriesForPrompt(me)).toEqual([]);
    await undoTurn(me, asking.turnId);
    expect((await memoriesForPrompt(me)).map((m) => m.text)).toEqual(["Their wife is Meera."]);

    await undoTurn(me, first.turnId);
    expect(await memoriesForPrompt(me)).toEqual([]);
  });
});

describe("038 security review: the ask is checked in code", () => {
  it("refuses a remember when their message did not ask for one", async () => {
    // Half the words match and the turn is clean, but nothing in what they
    // said asks offload to remember anything: words like these can come from
    // another member's note or a tool result in the same turn.
    const me = await account();
    const { jobId } = await dump(me, "dinner with Meera friday, she's my wife");
    expect(await tool({ jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })).toEqual({ ok: false, error: "not_their_words" });
  });

  it("holds a rule to every word they said and an always, never or from now on", async () => {
    const me = await account();
    const loose = await dump(me, "remember to always put work things in Work");
    expect(await tool({ jobId: loose.jobId, action: "remember", text: "Always skip the calendar question for work things.", kind: "rules" })).toEqual({
      ok: false,
      error: "not_their_words",
    });
    const plain = await dump(me, "remember to put work things in Work");
    expect(await tool({ jobId: plain.jobId, action: "remember", text: "Work things go in Work.", kind: "rules" })).toEqual({ ok: false, error: "not_their_words" });
    const ok = await dump(me, "from now on always put work things in Work");
    expect(await tool({ jobId: ok.jobId, action: "remember", text: "Always put work things in Work.", kind: "rules" })).toMatchObject({ ok: true });
  });

  it("refuses a forget their message did not ask for", async () => {
    const me = await account();
    const first = await dump(me, "remember that Meera is my wife");
    const kept = (await tool({ jobId: first.jobId, action: "remember", text: "Their wife is Meera.", kind: "people" })) as { remembered: { id: string } };
    const other = await dump(me, "buy bin bags");
    expect(await tool({ jobId: other.jobId, action: "forget", memoryId: kept.remembered.id })).toEqual({ ok: false, error: "not_their_words" });
  });
});
