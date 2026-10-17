// 038. Memories: what offload knows about a person across their threads.
//
// A memory is a `notes` row with scope 'account' and subject_id the account.
// These tests hold the storage, the gates and the one write path.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "kysely";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import {
  addMemory,
  answerMemory,
  forget,
  memoriesForPrompt,
  MEMORY_PROMPT_BUDGET,
  remember,
  restoreForgotten,
  settleByMemory,
  sweepMemories,
  undoAnswered,
} from "../src/memories/store.js";
import { handlers } from "../src/jobs/handlers.js";
import { MemoryMailer } from "../src/mail/mailer.js";
import { pendingEmbeds } from "../src/search/sweep.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("memory_forgotten").execute();
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

export async function account(name = "Jo Alves"): Promise<string> {
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

describe("the table holds a memory", () => {
  it("takes the five classes (040) and three origins at account scope, and nothing of the thread's", async () => {
    const me = await account();
    for (const kind of ["people", "things", "about", "rules", "patterns"] as const) {
      await db
        .insertInto("notes")
        .values({ account_id: me, scope: "account", subject_id: me, kind, text: `A ${kind} memory.`, origin: "answered" })
        .execute();
    }
    // A thread kind at account scope, and a class at thread scope, are refused.
    await expect(
      db.insertInto("notes").values({ account_id: me, scope: "account", subject_id: me, kind: "preference", text: "x", origin: "stated" }).execute()
    ).rejects.toThrow();
    await expect(
      db.insertInto("notes").values({ account_id: me, scope: "thread", subject_id: uuidv7(), kind: "people", text: "y", origin: "stated" }).execute()
    ).rejects.toThrow();
    // And answered is a memory's origin only.
    await expect(
      db.insertInto("notes").values({ account_id: me, scope: "thread", subject_id: uuidv7(), kind: "preference", text: "z", origin: "answered" }).execute()
    ).rejects.toThrow();
  });

  it("holds one active memory per text per account, and a set-aside one does not count", async () => {
    const me = await account();
    const write = () =>
      db
        .insertInto("notes")
        .values({ account_id: me, scope: "account", subject_id: me, kind: "people", text: "Their wife is Meera.", origin: "stated" })
        .onConflict((oc) => oc.doNothing())
        .returning("id")
        .executeTakeFirst();
    const first = await write();
    expect(first).toBeDefined();
    expect(await write()).toBeUndefined();
    await db.updateTable("notes").set({ superseded_at: new Date() }).where("id", "=", first!.id).execute();
    expect(await write()).toBeDefined();
  });

  it("has a calendar link, a pass stamp and a list of forgotten sources", async () => {
    const me = await account();
    const cols = await sql<{ table_name: string; column_name: string }>`
      select table_name, column_name from information_schema.columns
       where (table_name = 'notes' and column_name = 'calendar_id')
          or (table_name = 'accounts' and column_name = 'memories_at')
          or (table_name = 'memory_forgotten' and column_name = 'message_id')`.execute(db);
    expect(cols.rows.map((r) => `${r.table_name}.${r.column_name}`).sort()).toEqual([
      "accounts.memories_at",
      "memory_forgotten.message_id",
      "notes.calendar_id",
    ]);
    expect(me).toBeTruthy();
  });

  it("keeps readable_notes to thread scope", async () => {
    const me = await account();
    await db
      .insertInto("notes")
      .values({ account_id: me, scope: "account", subject_id: me, kind: "people", text: "Their wife is Meera.", origin: "stated" })
      .execute();
    const seen = await sql<{ n: string }>`select count(*) as n from readable_notes`.execute(db);
    expect(Number(seen.rows[0]!.n)).toBe(0);
  });
});

async function message(accountId: string, text = "remember that Meera is my wife"): Promise<string> {
  const conversation = await db.insertInto("conversations").values({ account_id: accountId }).returning("id").executeTakeFirstOrThrow();
  const row = await db
    .insertInto("messages")
    .values({ conversation_id: conversation.id, account_id: accountId, role: "person", type: "text", turn_id: uuidv7(), text, state: "seen" })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function learned(accountId: string, text: string, fromMessageId: string | null, at = new Date()): Promise<string> {
  const row = await db
    .insertInto("notes")
    .values({
      account_id: accountId,
      scope: "account",
      subject_id: accountId,
      kind: "about",
      text,
      origin: "learned",
      derived_from_message_id: fromMessageId,
      created_at: at,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

describe("the one write path", () => {
  it("remembers what was asked, once, at account scope, from the message", async () => {
    const me = await account();
    const said = await message(me);
    const first = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "Their wife is Meera.", kind: "people" }));
    const again = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "their wife is meera.", kind: "people" }));
    expect(first.ok && again.ok && first.id === again.id).toBe(true);
    const row = await db.selectFrom("notes").selectAll().executeTakeFirstOrThrow();
    expect(row).toMatchObject({ scope: "account", subject_id: me, account_id: me, origin: "stated", kind: "people", derived_from_message_id: said });
  });

  it("refuses what no memory may hold, and what is too long", async () => {
    const me = await account();
    const said = await message(me);
    const card = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "Their card is 4111 1111 1111 1111.", kind: "things" }));
    expect(card).toEqual({ ok: false, error: "never_list" });
    const long = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "x".repeat(201), kind: "about" }));
    expect(long).toEqual({ ok: false, error: "too_long" });
    expect(await db.selectFrom("notes").select("id").execute()).toEqual([]);
  });

  it("forgets without taking the message it came from, and Undo puts it back", async () => {
    const me = await account();
    const said = await message(me);
    const kept = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "Their wife is Meera.", kind: "people" }));
    if (!kept.ok) throw new Error("not kept");
    const asking = await message(me, "forget that Meera is my wife");

    const gone = await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: asking, memoryId: kept.id }));
    expect(gone).toEqual({ ok: true, id: kept.id });
    expect(await memoriesForPrompt(me)).toEqual([]);
    // The conversation stays; only the sentence goes, on a short clock.
    const source = await db.selectFrom("messages").select(["deleted_at"]).where("id", "=", said).executeTakeFirstOrThrow();
    expect(source.deleted_at).toBeNull();
    const row = await db.selectFrom("notes").select(["deleted_at", "purge_after"]).where("id", "=", kept.id).executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.purge_after!.getTime() - Date.now()).toBeLessThan(11 * 60 * 1000);
    // And the words it came from cannot teach it again.
    expect(await db.selectFrom("memory_forgotten").select("message_id").execute()).toEqual([{ message_id: said }]);

    await db.transaction().execute((trx) => restoreForgotten(trx, me, [asking]));
    expect((await memoriesForPrompt(me)).map((m) => m.text)).toEqual(["Their wife is Meera."]);
    expect(await db.selectFrom("memory_forgotten").select("message_id").execute()).toEqual([]);
  });

  it("Undo on a forget leaves one copy when the same words were said again since", async () => {
    const me = await account();
    const said = await message(me);
    const kept = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "Their wife is Meera.", kind: "people" }));
    if (!kept.ok) throw new Error("not kept");
    const asking = await message(me, "forget that Meera is my wife");
    await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: asking, memoryId: kept.id }));
    const again = await message(me, "remember Meera is my wife");
    const readded = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: again, text: "Their wife is Meera.", kind: "people" }));
    expect(readded.ok).toBe(true);

    await db.transaction().execute((trx) => restoreForgotten(trx, me, [asking]));
    expect((await memoriesForPrompt(me)).map((m) => m.text)).toEqual(["Their wife is Meera."]);
  });

  it("Undo on a forget never makes a twenty-first rule", async () => {
    const me = await account();
    const rules: string[] = [];
    for (let i = 0; i < 20; i += 1) rules.push(await learned(me, `Rule ${i}.`, null));
    await db.updateTable("notes").set({ kind: "rules", origin: "stated" }).where("id", "in", rules).execute();
    const asking = await message(me, "forget that rule");
    await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: asking, memoryId: rules[0]! }));
    const added = await db.transaction().execute((trx) => addMemory(trx, { accountId: me, text: "Work things go in Work.", kind: "rules" }));
    expect(added.ok).toBe(true);

    expect(await db.transaction().execute((trx) => restoreForgotten(trx, me, [asking]))).toBe(0);
    expect((await memoriesForPrompt(me)).filter((m) => m.kind === "rules")).toHaveLength(20);
  });

  it("never forgets another account's memory", async () => {
    const me = await account();
    const other = await account("Sam Ibekwe");
    const theirs = await learned(other, "They live in Montreal.", null);
    const said = await message(me, "forget that");
    const tried = await db.transaction().execute((trx) => forget(trx, { accountId: me, messageId: said, memoryId: theirs }));
    expect(tried).toEqual({ ok: false, error: "unknown_memory" });
    expect(await memoriesForPrompt(other)).toHaveLength(1);
  });
});

describe("what a prompt is given", () => {
  it("is the account's own, asked and answered before learned, newest first, at most fifty", async () => {
    const me = await account();
    const other = await account("Sam Ibekwe");
    await learned(other, "Not mine.", null);
    for (let i = 0; i < 60; i += 1) await learned(me, `Learned ${i}.`, null, new Date(Date.now() - (60 - i) * 1000));
    const said = await message(me);
    await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "Their wife is Meera.", kind: "people" }));

    const shown = await memoriesForPrompt(me);
    expect(shown).toHaveLength(MEMORY_PROMPT_BUDGET);
    expect(shown[0]!.text).toBe("Their wife is Meera.");
    expect(shown[1]!.text).toBe("Learned 59.");
    expect(shown.some((m) => m.text === "Not mine.")).toBe(false);
  });
});

async function calendarRow(accountId: string): Promise<string> {
  const n = await db
    .insertInto("connector_connections")
    .values({ account_id: accountId, provider: "google", external_account_email: `${uuidv7()}@g.com` })
    .returning("id")
    .executeTakeFirstOrThrow();
  const c = await db
    .insertInto("connector_calendars")
    .values({ connection_id: n.id, external_id: `cal-${uuidv7()}`, summary: "P**B", access_role: "owner", selected: true, participants: 2 })
    .returning("id")
    .executeTakeFirstOrThrow();
  return c.id;
}

describe("a calendar shared with somebody, answered once", () => {
  it("is remembered by name, without the calendar's name, and the next answer replaces it", async () => {
    const me = await account();
    const first = await calendarRow(me);
    const second = await calendarRow(me);
    await db.transaction().execute((trx) => answerMemory(trx, { accountId: me, name: "Meera", calendarId: first }));
    let rows = await memoriesForPrompt(me);
    expect(rows.map((m) => [m.text, m.origin, m.kind])).toEqual([["They share a calendar with Meera.", "answered", "things"]]);

    expect((await settleByMemory(me, "meera", [{ id: first }, { id: second }]))?.id).toBe(first);
    expect(await settleByMemory(me, "Anoushka", [{ id: first }])).toBeNull();

    await db.transaction().execute((trx) => answerMemory(trx, { accountId: me, name: "MEERA", calendarId: second }));
    rows = await memoriesForPrompt(me);
    expect(rows).toHaveLength(1);
    expect((await settleByMemory(me, "Meera", [{ id: first }, { id: second }]))?.id).toBe(second);
    // A calendar no longer among the candidates settles nothing.
    expect(await settleByMemory(me, "Meera", [{ id: first }])).toBeNull();
  });
});

describe("the daily sweep", () => {
  it("removes a learned memory whose message is gone, and keeps one whose message is there", async () => {
    const me = await account();
    const kept = await message(me, "we moved to Montreal");
    const gone = await message(me, "my car is a civic");
    await learned(me, "They live in Montreal.", kept);
    await learned(me, "Their car is a Civic.", gone);
    await db.updateTable("messages").set({ deleted_at: new Date() }).where("id", "=", gone).execute();
    await sweepMemories();
    expect((await memoriesForPrompt(me)).map((m) => m.text)).toEqual(["They live in Montreal."]);
  });

  it("puts a learned memory superseded a month ago on the purge clock", async () => {
    const me = await account();
    const old = await learned(me, "They live in Toronto.", null);
    await db.updateTable("notes").set({ superseded_at: new Date(Date.now() - 31 * 86400_000) }).where("id", "=", old).execute();
    await sweepMemories();
    const row = await db.selectFrom("notes").select(["deleted_at", "purge_after"]).where("id", "=", old).executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.purge_after).not.toBeNull();
  });
});

describe("038 security review: any replaced memory goes after 30 days", () => {
  it("purges an asked or answered memory replaced a month ago, as a learned one", async () => {
    const me = await account();
    const said = await message(me);
    const asked = await db.transaction().execute((trx) => remember(trx, { accountId: me, messageId: said, text: "They live in Toronto.", kind: "about" }));
    if (!asked.ok) throw new Error("not kept");
    await db.updateTable("notes").set({ superseded_at: new Date(Date.now() - 31 * 86400_000) }).where("id", "=", asked.id).execute();
    await sweepMemories();
    const row = await db.selectFrom("notes").select(["deleted_at"]).where("id", "=", asked.id).executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
  });
});

describe("040 privacy: a replaced memory goes after thirty days, on any account", () => {
  it("puts an answer the next answer replaced on the thirty-day clock, and its Undo takes it off", async () => {
    const me = await account();
    const [one, two] = [uuidv7(), uuidv7()];
    const first = await calendarRow(me);
    const second = await calendarRow(me);
    await db.transaction().execute((trx) => answerMemory(trx, { accountId: me, name: "Meera", calendarId: first, answeredIn: one }));
    await db.transaction().execute((trx) => answerMemory(trx, { accountId: me, name: "Meera", calendarId: second, answeredIn: two }));
    const old = await db.selectFrom("notes").select(["id", "purge_after"]).where("subject_id", "=", me).where("superseded_at", "is not", null).executeTakeFirstOrThrow();
    expect(old.purge_after).not.toBeNull();
    const days = (old.purge_after!.getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    await db.transaction().execute((trx) => undoAnswered(trx, me, [two]));
    const back = await db.selectFrom("notes").select(["superseded_at", "purge_after"]).where("id", "=", old.id).executeTakeFirstOrThrow();
    expect(back).toEqual({ superseded_at: null, purge_after: null });
  });

  it("removes a learned memory whose message was purged in the daily run, on an account with no activity", async () => {
    const started = new Date();
    const me = await account();
    const said = await message(me, "my car is a civic");
    const id = await learned(me, "Their car is a Civic.", said);
    await db.deleteFrom("messages").where("id", "=", said).execute();

    await handlers["account.daily"]!({}, { mailer: new MemoryMailer() }, null);
    await handlers["content.purge"]!({}, { mailer: new MemoryMailer() }, null);
    expect(await db.selectFrom("notes").select("id").where("id", "=", id).execute()).toEqual([]);
    // The daily run books itself for tomorrow; this test's booking goes.
    await db.deleteFrom("jobs").where("kind", "=", "account.daily").where("created_at", ">=", started).execute();
  });
});

describe("memories are not searched", () => {
  it("are never booked into the search index (040 embeds them on their own row instead)", async () => {
    const me = await account();
    const id = await learned(me, "Their wife is Meera.", null);
    expect((await pendingEmbeds()).some((pending) => pending.rowId === id && pending.kind !== "embed.memory")).toBe(false);
  });
});

describe("two answers for one name at once", () => {
  it("leave one memory, pointing at the calendar answered last", async () => {
    const me = await account();
    const n = await db
      .insertInto("connector_connections")
      .values({ account_id: me, provider: "google", external_account_email: `${uuidv7()}@g.com` })
      .returning("id")
      .executeTakeFirstOrThrow();
    const cal = async () =>
      (
        await db
          .insertInto("connector_calendars")
          .values({ connection_id: n.id, external_id: `cal-${uuidv7()}`, summary: "x", access_role: "owner", selected: true, participants: 2 })
          .returning("id")
          .executeTakeFirstOrThrow()
      ).id;
    const [a, b] = [await cal(), await cal()];

    // The first holds its transaction open while the second arrives.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let written!: () => void;
    const firstWrote = new Promise<void>((resolve) => (written = resolve));
    const first = db.transaction().execute(async (trx) => {
      await answerMemory(trx, { accountId: me, name: "Meera", calendarId: a });
      written();
      await held;
    });
    // The second arrives while the first has written and not committed.
    await firstWrote;
    const second = db.transaction().execute((trx) => answerMemory(trx, { accountId: me, name: "Meera", calendarId: b }));
    await new Promise((r) => setTimeout(r, 100));
    release();
    await Promise.all([first, second]);

    const rows = await db
      .selectFrom("notes")
      .select("calendar_id")
      .where("scope", "=", "account")
      .where("subject_id", "=", me)
      .where("deleted_at", "is", null)
      .where("superseded_at", "is", null)
      .execute();
    expect(rows).toEqual([{ calendar_id: b }]);
  });
});
