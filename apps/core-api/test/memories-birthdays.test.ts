// 051. A birthday is a memory, written without "remember", and only from the
// person's own words.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { buildApp, type App } from "../src/app.js";
import { db, closeDb } from "../src/db.js";
import { env } from "../src/env.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { MEMORY_CAP } from "@offload/widgets";

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
  await db.deleteFrom("reminder_labels").execute();
  await db.deleteFrom("memory_forgotten").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("blobs").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(): Promise<string> {
  const row = await db
    .insertInto("accounts")
    .values({ email: `${uuidv7()}@example.com`, state: "active", email_verified: true, display_name: "Jo Alves", analytics_subject_id: uuidv7() })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function dump(accountId: string, text: string) {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: turnId, text, state: "seen", source: "person" } as never)
    .returning("id")
    .executeTakeFirstOrThrow();
  const job = await db
    .insertInto("jobs")
    .values({
      kind: "dump.answer",
      account_id: accountId,
      payload: JSON.stringify({ messageId: message.id, conversationId: conversation.id, turnId }),
      priority: 10,
      run_after: new Date(),
      state: "running",
      locked_at: new Date(),
      locked_by: "test",
      attempts: 1,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { messageId: message.id, jobId: job.id };
}

const tool = async (payload: Record<string, unknown>) =>
  (
    await app.inject({
      method: "POST",
      url: "/internal/v1/tool-call",
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
      payload: { tool: "memory", toolCallId: uuidv7(), action: "remember", afterMembers: false, ...payload },
    })
  ).json() as Record<string, unknown>;

const KRISTINA = { text: "Kristina's birthday is 1 February.", kind: "people", on: "02-01", name: "Kristina's birthday" };

const active = (accountId: string) =>
  db
    .selectFrom("notes")
    .select(["id", "text", "kind", "origin"])
    .where("account_id", "=", accountId)
    .where("scope", "=", "account")
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .execute();

const labelOf = (noteId: string) =>
  sql<{ kind: string; lead: string; yearly_on: string | null; name: string | null; fresh: boolean }>`
    select l.kind, l.lead, l.yearly_on, l.name, l.fingerprint = note_fingerprint(n) as fresh
      from reminder_labels l join notes n on n.id = l.note_id where l.note_id = ${noteId}::uuid`
    .execute(db)
    .then((r) => r.rows[0]);

describe("the unasked remember", () => {
  it("keeps a birthday said without remember, with its label from the turn", async () => {
    const me = await account();
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st, save it on my personal calendar for every year");
    const result = await tool({ jobId, ...KRISTINA });
    expect(result).toMatchObject({ ok: true, remembered: { id: expect.any(String) } });
    const [memory] = await active(me);
    expect(memory).toMatchObject({ text: "Kristina's birthday is 1 February.", kind: "people", origin: "stated" });
    expect(await labelOf(memory!.id)).toEqual({ kind: "occasion", lead: "days", yearly_on: "02-01", name: "Kristina's birthday", fresh: true });
  });

  it("is not offered to the next memory pass until its words change", async () => {
    const me = await account();
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    const offered = await sql`select id from memories_to_date(${me}::uuid)`.execute(db);
    expect(offered.rows).toEqual([]);
  });

  it.each([
    ["a word they did not say", { text: "Their sister Kristina's birthday is 1 February." }, "Kristina's birthday is Feb 1st", "not_their_words"],
    ["a day the call does not carry", { on: "02-02" }, "Kristina's birthday is Feb 1st", "bad_date"],
    ["a day they did not say", { text: "Kristina's birthday is 2 February.", on: "02-02" }, "Kristina's birthday is Feb 1st", "bad_date"],
    ["a day in numbers", {}, "Kristina's birthday is 1/2", "bad_date"],
    ["a day that is not one", { text: "Kristina's birthday is 30 February.", on: "02-30" }, "Kristina's birthday is Feb 30", "bad_date"],
    ["a year they did not say", { text: "Kristina's birthday is 1 February 1990." }, "Kristina's birthday is Feb 1st", "not_their_words"],
    ["a thing, not a person", { kind: "things" }, "Kristina's birthday is Feb 1st", "not_their_words"],
    ["no day at all", { on: undefined }, "Kristina's birthday is Feb 1st", "not_their_words"],
  ])("refuses %s", async (_name, over, said, error) => {
    const me = await account();
    const { jobId } = await dump(me, said);
    expect(await tool({ jobId, ...KRISTINA, ...over })).toEqual({ ok: false, error });
    expect(await active(me)).toEqual([]);
  });

  it("refuses in a turn that read another member's words", async () => {
    const me = await account();
    const { jobId } = await dump(me, "did Kristina say anything about Feb 1st?");
    // The words are all theirs and the day is theirs; the turn read a member's note.
    expect(await tool({ jobId, text: "Kristina's birthday is 1 February.", kind: "people", on: "02-01", name: "Kristina's birthday", afterMembers: true })).toEqual({
      ok: false,
      error: "untrusted_turn",
    });
  });

  it("refuses when the worker does not say whether the turn read another member's words", async () => {
    const me = await account();
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    expect(await tool({ jobId, ...KRISTINA, afterMembers: undefined })).toEqual({ ok: false, error: "untrusted_turn" });
  });

  it("keeps a year they said", async () => {
    const me = await account();
    const { jobId } = await dump(me, "Sam was born on 3 May 2019");
    const result = await tool({ jobId, text: "Sam's birthday is 3 May 2019.", kind: "people", on: "05-03", name: "Sam's birthday" });
    expect(result).toMatchObject({ ok: true });
  });

  it("keeps their own birthday as About, with no reminder", async () => {
    const me = await account();
    const { jobId } = await dump(me, "my birthday is May 3rd");
    const result = await tool({ jobId, text: "Their birthday is 3 May.", kind: "about", on: "05-03", name: null });
    expect(result).toMatchObject({ ok: true });
    const [memory] = await active(me);
    expect(memory).toMatchObject({ kind: "about" });
    expect(await labelOf(memory!.id)).toBeUndefined();
  });

  it("keeps a memory whose name is not its own words, with no name", async () => {
    const me = await account();
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA, name: "Kristina's big day" });
    const [memory] = await active(me);
    expect((await labelOf(memory!.id))?.name).toBeNull();
  });

  it("leaves the asked path as it was", async () => {
    const me = await account();
    const { jobId } = await dump(me, "remember that Meera is my wife");
    expect(await tool({ jobId, text: "Their wife is Meera.", kind: "people" })).toMatchObject({ ok: true });
  });
});

describe("already known", () => {
  it("is not written twice", async () => {
    const me = await account();
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    const a = await tool({ jobId: first.jobId, ...KRISTINA });
    const second = await dump(me, "kristina's birthday is the 1st of February");
    const b = await tool({ jobId: second.jobId, ...KRISTINA, text: "Kristina's birthday is 1 February." });
    expect(b).toEqual(a);
    expect(await active(me)).toHaveLength(1);
  });

  it("is corrected by a new day", async () => {
    const me = await account();
    const first = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId: first.jobId, ...KRISTINA });
    const second = await dump(me, "actually Kristina's birthday is Feb 2nd");
    await tool({ jobId: second.jobId, ...KRISTINA, text: "Kristina's birthday is 2 February.", on: "02-02" });
    const now = await active(me);
    expect(now.map((m) => m.text)).toEqual(["Kristina's birthday is 2 February."]);
  });
});

describe("full", () => {
  it("says so", async () => {
    const me = await account();
    for (let i = 0; i < MEMORY_CAP; i += 1) {
      await db
        .insertInto("notes")
        .values({ account_id: me, scope: "account", subject_id: me, kind: "about", text: `Fact ${i}.`, origin: "stated" } as never)
        .execute();
    }
    const { jobId } = await dump(me, "Kristina's birthday is Feb 1st");
    expect(await tool({ jobId, ...KRISTINA })).toEqual({ ok: false, error: "memories_full" });
  });
});

describe("the turn's Done", () => {
  it("is drawn for a turn that only remembered a birthday", async () => {
    const { threadsFor, threadsForAll } = await import("../src/routes/dumps.js");
    const me = await account();
    const { jobId, messageId } = await dump(me, "Kristina's birthday is Feb 1st");
    await tool({ jobId, ...KRISTINA });
    expect(await threadsFor(messageId, me)).toEqual({ landed: [], changed: [], filed: true });
    expect((await threadsForAll([messageId], me)).get(messageId)).toEqual([]);
  });

  it("is not drawn for a turn that remembered something asked", async () => {
    // 038's asked memories keep their own reply and no Done: unchanged here.
    const { threadsFor } = await import("../src/routes/dumps.js");
    const me = await account();
    const { jobId, messageId } = await dump(me, "remember that Meera is my wife");
    await tool({ jobId, text: "Their wife is Meera.", kind: "people" });
    expect((await threadsFor(messageId, me)).filed).toBe(false);
  });
});
