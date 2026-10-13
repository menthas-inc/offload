// 018 AC-16 (2026-10-13). A turn never asks the same question twice, and one
// answer reaches every row it was asked about. Three places it had slipped:
// a second server-raised question in a turn took ordinal 1 and was dropped
// on conflict; a second "which Sam" in a turn overwrote the first share's
// thread; and two identical asks about two rows were two questions.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { applyAnswer, raisePersonQuestion, restoreAnswers, storeQuestions } from "../src/questions.js";

await migrate(() => {});
afterAll(async () => {
  await closeDb();
});
beforeEach(async () => {
  await db.deleteFrom("questions").execute();
  await db.deleteFrom("connections").execute();
  await db.deleteFrom("content").execute();
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

async function thread(accountId: string, name: string): Promise<string> {
  const row = await db
    .insertInto("threads")
    .values({ created_by_account_id: accountId, name, last_activity_at: sql`now()`, updated_at: sql`now()` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("thread_members").values({ thread_id: row.id, account_id: accountId, state: "accepted" }).execute();
  return row.id;
}

async function connect(a: string, b: string) {
  await db.insertInto("connections").values(a < b ? { account_a: a, account_b: b } : { account_a: b, account_b: a }).execute();
}

async function turn(accountId: string) {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const turnId = uuidv7();
  const message = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: turnId, text: "x", state: "seen" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { accountId, conversationId: conversation.id, messageId: message.id, turnId, derivedFromUntrusted: false };
}

async function row(accountId: string, threadId: string, title: string, messageId: string): Promise<string> {
  const r = await db
    .insertInto("content")
    .values({ account_id: accountId, thread_id: threadId, type: "task", title, derived_from_message_id: messageId })
    .returning("id")
    .executeTakeFirstOrThrow();
  return r.id;
}

const dateOptions = [
  { label: "Fri 16 Oct", value: "2026-10-16" },
  { label: "Mon 19 Oct", value: "2026-10-19" },
  { label: "Not that", value: null },
];

describe("one question at a time, every question kept", () => {
  it("a second question raised in a turn takes the next ordinal and waits behind the first", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon trip");
    const ctx = await turn(me);
    const a = await row(me, t, "Dentist", ctx.messageId);
    const b = await row(me, t, "Haircut", ctx.messageId);
    await db.transaction().execute(async (trx) => {
      await storeQuestions(trx, [{ field: "date", text: 'Filed "Dentist". By when?', options: dateOptions, targetContentId: a, targetNoteId: null }], ctx);
      await storeQuestions(trx, [{ field: "time", text: 'Filed "Haircut". Which day and time?', options: [{ label: "Not that", value: null }], targetContentId: b, targetNoteId: null }], ctx);
    });
    const stored = await db.selectFrom("questions").select(["ordinal", "state", "field"]).where("turn_id", "=", ctx.turnId).orderBy("ordinal").execute();
    expect(stored).toEqual([
      { ordinal: 1, state: "open", field: "date" },
      { ordinal: 2, state: "pending", field: "time" },
    ]);
  });
});

describe("one question at a time, every question kept", () => {
  it("a third question in a turn is dropped, not thrown: the table takes two", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon trip");
    const ctx = await turn(me);
    const rows = await Promise.all(["Dentist", "Haircut", "Rent"].map((title) => row(me, t, title, ctx.messageId)));
    await db.transaction().execute(async (trx) => {
      for (const [i, id] of rows.entries()) {
        await storeQuestions(trx, [{ field: "date", text: `Filed "${["Dentist", "Haircut", "Rent"][i]}". By when?`, options: dateOptions, targetContentId: id, targetNoteId: null }], ctx);
      }
    });
    const stored = await db.selectFrom("questions").select("ordinal").where("turn_id", "=", ctx.turnId).orderBy("ordinal").execute();
    expect(stored.map((q) => q.ordinal)).toEqual([1, 2]);
  });
});

describe("the same question about several rows is one question", () => {
  it("three identical asks are one question that counts two more", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon trip");
    const ctx = await turn(me);
    const ids = await Promise.all([1, 2, 3].map(() => row(me, t, "Glass blowing class", ctx.messageId)));
    await db.transaction().execute(async (trx) => {
      await storeQuestions(
        trx,
        ids.map((id) => ({ field: "date" as const, text: 'Filed "Glass blowing class". By when?', options: dateOptions, targetContentId: id, targetNoteId: null })),
        ctx,
      );
    });
    const stored = await db.selectFrom("questions").select(["text", "previous_value"]).where("turn_id", "=", ctx.turnId).execute();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.text).toBe('Filed "Glass blowing class" and 2 more. By when?');
    expect(stored[0]!.previous_value).toEqual({ also: [ids[1], ids[2]] });
  });

  it("two identical asks join, the tap fills both rows, and Undo puts both back", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon trip");
    const ctx = await turn(me);
    const a = await row(me, t, "Glass blowing class", ctx.messageId);
    const b = await row(me, t, "Glass blowing class", ctx.messageId);
    await db.transaction().execute(async (trx) => {
      await storeQuestions(
        trx,
        [
          { field: "date", text: 'Filed "Glass blowing class". By when?', options: dateOptions, targetContentId: a, targetNoteId: null },
          { field: "date", text: 'Filed "Glass blowing class". By when?', options: dateOptions, targetContentId: b, targetNoteId: null },
        ],
        ctx,
      );
    });
    const stored = await db.selectFrom("questions").selectAll().where("turn_id", "=", ctx.turnId).execute();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.text).toBe('Filed "Glass blowing class" and 1 more. By when?');
    expect(stored[0]!.target_content_id).toBe(a);

    const answerTurn = uuidv7();
    const applied = await db.transaction().execute((trx) =>
      applyAnswer(trx, stored[0]!.id, me, { day: "2026-10-16" }, { answeredMessageId: null, answerTurnId: answerTurn, option: 0 }),
    );
    expect(applied).toMatchObject({ applied: true, field: "date" });
    const filled = await db.selectFrom("content").select(["id", "due_at"]).where("id", "in", [a, b]).execute();
    expect(filled.every((r) => r.due_at?.toISOString().startsWith("2026-10-16"))).toBe(true);

    await db.transaction().execute((trx) => restoreAnswers(trx, me, answerTurn));
    const back = await db.selectFrom("content").select(["id", "due_at"]).where("id", "in", [a, b]).execute();
    expect(back.every((r) => r.due_at === null)).toBe(true);
  });

  it("two different asks stay two questions", async () => {
    const me = await account();
    const t = await thread(me, "Lisbon trip");
    const ctx = await turn(me);
    const a = await row(me, t, "Dentist", ctx.messageId);
    const b = await row(me, t, "Haircut", ctx.messageId);
    await db.transaction().execute(async (trx) => {
      await storeQuestions(
        trx,
        [
          { field: "date", text: 'Filed "Dentist". By when?', options: dateOptions, targetContentId: a, targetNoteId: null },
          { field: "date", text: 'Filed "Haircut". By when?', options: dateOptions, targetContentId: b, targetNoteId: null },
        ],
        ctx,
      );
    });
    const stored = await db.selectFrom("questions").select("ordinal").where("turn_id", "=", ctx.turnId).execute();
    expect(stored).toHaveLength(2);
  });

  it("the same 'which Sam' for two threads in a turn is one question, and the tap shares both", async () => {
    const me = await account();
    const sam1 = await account("Sam Reilly");
    const sam2 = await account("Sam Ibekwe");
    await connect(me, sam1);
    await connect(me, sam2);
    const lisbon = await thread(me, "Lisbon trip");
    const flat = await thread(me, "Flat admin");
    const ctx = await turn(me);
    const candidates = [
      { accountId: sam1, name: "Sam Reilly" },
      { accountId: sam2, name: "Sam Ibekwe" },
    ];
    await db.transaction().execute(async (trx) => {
      expect(await raisePersonQuestion(trx, { accountId: me, messageId: ctx.messageId, threadId: lisbon, threadName: "Lisbon trip", word: "Sam", candidates })).toBe(true);
      expect(await raisePersonQuestion(trx, { accountId: me, messageId: ctx.messageId, threadId: flat, threadName: "Flat admin", word: "Sam", candidates })).toBe(true);
    });
    const stored = await db.selectFrom("questions").selectAll().where("turn_id", "=", ctx.turnId).execute();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.text).toBe('Share "Lisbon trip" and 1 more with which Sam?');
    expect(stored[0]!.previous_value).toEqual({ share: lisbon, also: [flat] });

    const answerTurn = uuidv7();
    const applied = await db.transaction().execute((trx) =>
      applyAnswer(trx, stored[0]!.id, me, { person: sam2 }, { answeredMessageId: null, answerTurnId: answerTurn, option: 1 }),
    );
    expect(applied).toMatchObject({ applied: true, field: "person" });
    const shared = await db
      .selectFrom("thread_members")
      .select(["thread_id", "state"])
      .where("account_id", "=", sam2)
      .orderBy("thread_id")
      .execute();
    expect(shared.map((m) => m.thread_id).sort()).toEqual([lisbon, flat].sort());
    expect(shared.every((m) => m.state === "pending")).toBe(true);

    await db.transaction().execute((trx) => restoreAnswers(trx, me, answerTurn));
    const undone = await db.selectFrom("thread_members").select("state").where("account_id", "=", sam2).execute();
    expect(undone.map((m) => m.state)).toEqual(["expired", "expired"]);
  });
});
