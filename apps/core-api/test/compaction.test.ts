// The daily fold, and what it is not allowed to do.
//
// The model proposes and this decides, so every test here is about the
// deciding. What the prompt says is a request; what `applyCompaction` enforces
// is the feature.
//
// AC-8   a thread over the budget comes back under it, or is all person-typed.
// AC-9   folding sets aside rather than destroys.
// AC-10  a person's words are never rewritten and never deleted.
// AC-13  offload deletes only what it wrote.
// AC-14a a fold never crosses authors.
// AC-6   what reaches a prompt is bounded, and carried once per turn.

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import {
  NOTE_PROMPT_BUDGET,
  addNote,
  applyCompaction,
  notesForPrompt,
  notesForTurn,
  readableNotes,
} from "../src/threads/notes.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("notes").execute();
  await db.deleteFrom("content").execute();
  await db.deleteFrom("messages").execute();
  await db.deleteFrom("conversations").execute();
  await db.updateTable("accounts").set({ default_thread_id: null }).execute();
  await db.deleteFrom("thread_members").execute();
  await db.deleteFrom("threads").execute();
  await db.deleteFrom("accounts").execute();
});

async function account(name = "Ana Duarte"): Promise<string> {
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

async function thread(accountId: string, name = "Flat renovation"): Promise<string> {
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

function add(
  threadId: string,
  accountId: string,
  text: string,
  origin: "stated" | "learned" = "stated",
  extra: { derivedFromUntrusted?: boolean } = {},
) {
  return addNote({ threadId, accountId, text, origin, ...extra });
}

describe("AC-9 folding sets aside rather than destroys", () => {
  it("supersedes what it folded and writes what the set says now", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "Ana is doing the electrics", "learned");
    const second = await add(flat, ana, "the electrician stuff is Ana's", "learned");

    const outcome = await applyCompaction(flat, {
      supersede: [],
      remove: [],
      add: [{ text: "Ana handles the electrics", foldedFrom: [first.id, second.id] }],
    });

    expect(outcome).toMatchObject({ added: 1, superseded: 2, ignored: 0 });

    const active = await readableNotes(ana, flat);
    expect(active.map((note) => note.text)).toEqual(["Ana handles the electrics"]);

    // Still there, off the section and off the prompt.
    const folded = await db
      .selectFrom("notes")
      .select(["text", "superseded_at", "deleted_at"])
      .where("id", "in", [first.id, second.id])
      .execute();
    expect(folded.every((row) => row.superseded_at !== null)).toBe(true);
    expect(folded.every((row) => row.deleted_at === null)).toBe(true);
  });

  it("writes the replacement before setting anything aside", async () => {
    // A fold that cannot produce its replacement must not take away what it
    // was replacing. The only source is untouchable, so nothing moves.
    const ana = await account();
    const flat = await thread(ana);
    const fromApp = await add(flat, ana, "dentist on Thursday", "learned", {
      derivedFromUntrusted: true,
    });

    const outcome = await applyCompaction(flat, {
      supersede: [],
      remove: [],
      add: [{ text: "the dentist is Thursday", foldedFrom: [fromApp.id] }],
    });

    expect(outcome.added).toBe(0);
    expect(await readableNotes(ana, flat)).toHaveLength(1);
  });
});

describe("AC-10 and AC-13 whose words these are", () => {
  it("sets aside a note a person typed, and leaves the words in place", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const stated = await add(flat, ana, "we are staying in Alfama");

    await applyCompaction(flat, { supersede: [stated.id], remove: [], add: [] });

    const row = await db
      .selectFrom("notes")
      .select(["text", "superseded_at", "deleted_at"])
      .where("id", "=", stated.id)
      .executeTakeFirstOrThrow();
    expect(row.text).toBe("we are staying in Alfama");
    expect(row.superseded_at).not.toBeNull();
    expect(row.deleted_at).toBeNull();
  });

  it("refuses to delete a note a person typed, however the plan asks", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const stated = await add(flat, ana, "we are staying in Alfama");

    const outcome = await applyCompaction(flat, { supersede: [], remove: [stated.id], add: [] });

    expect(outcome.removed).toBe(0);
    expect(outcome.ignored).toBe(1);
    expect(await readableNotes(ana, flat)).toHaveLength(1);
  });

  it("deletes a note offload wrote", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const learned = await add(flat, ana, "offload noticed something", "learned");

    const outcome = await applyCompaction(flat, { supersede: [], remove: [learned.id], add: [] });

    expect(outcome.removed).toBe(1);
    expect(await readableNotes(ana, flat)).toHaveLength(0);
  });

  it("ignores an id the thread does not hold rather than raising", async () => {
    // A model naming a uuid that is not there is not a validation failure, and
    // retrying would not fix it.
    const ana = await account();
    const flat = await thread(ana);
    await add(flat, ana, "we are staying in Alfama");

    const outcome = await applyCompaction(flat, { supersede: [uuidv7()], remove: [], add: [] });
    expect(outcome).toMatchObject({ superseded: 0, ignored: 1 });
  });

  it("never touches a note derived from a connected app", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const fromApp = await add(flat, ana, "dentist on Thursday", "learned", {
      derivedFromUntrusted: true,
    });

    const outcome = await applyCompaction(flat, {
      supersede: [fromApp.id],
      remove: [fromApp.id],
      add: [],
    });

    expect(outcome).toMatchObject({ superseded: 0, removed: 0 });
    expect(await readableNotes(ana, flat)).toHaveLength(1);
  });
});

describe("AC-14a a fold never crosses authors", () => {
  it("refuses to merge two people's notes into one row", async () => {
    // OFF-3 has no answer for a row two people wrote: either somebody can
    // delete a synthesis of another person's notes, or it is authorless from
    // birth and everybody can.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await db
      .insertInto("thread_members")
      .values({ thread_id: flat, account_id: john, state: "accepted" })
      .execute();

    const hers = await add(flat, ana, "Ana is doing the electrics", "learned");
    const his = await add(flat, john, "John is doing the plumbing", "learned");

    const outcome = await applyCompaction(flat, {
      supersede: [],
      remove: [],
      add: [{ text: "they split the trades", foldedFrom: [hers.id, his.id] }],
    });

    expect(outcome).toMatchObject({ added: 0, superseded: 0, ignored: 1 });
    expect(await readableNotes(ana, flat)).toHaveLength(2);
  });

  it("keeps the author of what it folded", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await db
      .insertInto("thread_members")
      .values({ thread_id: flat, account_id: john, state: "accepted" })
      .execute();

    const first = await add(flat, john, "the boiler man comes Tuesdays", "learned");
    const second = await add(flat, john, "boiler visits are on a Tuesday", "learned");

    await applyCompaction(flat, {
      supersede: [],
      remove: [],
      add: [{ text: "the boiler man comes on Tuesdays", foldedFrom: [first.id, second.id] }],
    });

    const active = await readableNotes(ana, flat);
    expect(active).toHaveLength(1);
    expect(active[0]?.authorId).toBe(john);
  });
});

describe("AC-6 what one turn carries", () => {
  it("hands a thread's notes over once, however often the turn files into it", async () => {
    const ana = await account();
    const flat = await thread(ana);
    await add(flat, ana, "Todo names in three words");

    const conversation = await db
      .insertInto("conversations")
      .values({ account_id: ana })
      .returning("id")
      .executeTakeFirstOrThrow();
    const message = await db
      .insertInto("messages")
      .values({
        conversation_id: conversation.id,
        account_id: ana,
        turn_id: uuidv7(),
        role: "person",
        text: "a dump",
        state: "seen",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // The first call in the turn gets them.
    const first = await notesForTurn(message.id, flat, ana, "call-1");
    expect(first?.yours).toHaveLength(1);

    // That call files something, which is the record the second call reads.
    await db
      .insertInto("content")
      .values({
        account_id: ana,
        thread_id: flat,
        derived_from_message_id: message.id,
        tool_call_id: "call-1",
        type: "task",
        title: "Chase the electrician",
        updated_at: new Date(),
      })
      .execute();

    const second = await notesForTurn(message.id, flat, ana, "call-2");
    expect(second).toBeNull();

    // And a retry of the first call is given what it never received.
    const retry = await notesForTurn(message.id, flat, ana, "call-1");
    expect(retry?.yours).toHaveLength(1);
  });

  it("is bounded by the budget however many the thread holds", async () => {
    const ana = await account();
    const flat = await thread(ana);
    for (let i = 0; i < NOTE_PROMPT_BUDGET + 25; i += 1) {
      await add(flat, ana, `note number ${i}`);
    }

    const carried = await notesForPrompt(flat, ana);
    expect(carried.yours).toHaveLength(NOTE_PROMPT_BUDGET);
    // The newest survive the budget, and they are handed over oldest first.
    expect(carried.yours[carried.yours.length - 1]?.text).toBe(
      `note number ${NOTE_PROMPT_BUDGET + 24}`
    );
  });
});

describe("what the review found", () => {
  it("never deletes a note it has just folded", async () => {
    // A plan naming one id in both `foldedFrom` and `remove` would set it
    // aside and then destroy it eight seconds later, so the history loses the
    // note it was standing in for. Folding promises the opposite.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "the boiler man comes Tuesdays", "learned");

    const outcome = await applyCompaction(flat, {
      supersede: [],
      remove: [first.id],
      add: [{ text: "the boiler man comes on Tuesdays", foldedFrom: [first.id] }],
    });

    expect(outcome.removed).toBe(0);
    const row = await db
      .selectFrom("notes")
      .select(["superseded_at", "deleted_at"])
      .where("id", "=", first.id)
      .executeTakeFirstOrThrow();
    expect(row.superseded_at).not.toBeNull();
    expect(row.deleted_at).toBeNull();
  });

  it("counts an untouchable source once, not twice", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const fromApp = await add(flat, ana, "dentist on Thursday", "learned", {
      derivedFromUntrusted: true,
    });

    const outcome = await applyCompaction(flat, {
      supersede: [],
      remove: [],
      add: [{ text: "the dentist is Thursday", foldedFrom: [fromApp.id] }],
    });
    expect(outcome.ignored).toBe(1);
  });

  it("gives offload's folded notes thirty days and a person's none", async () => {
    // The folded list is the one thing on a thread with no ceiling, and a
    // sentence a person typed is never purged by us.
    const ana = await account();
    const flat = await thread(ana);
    const mine = await add(flat, ana, "we are staying in Alfama");
    const theirs = await add(flat, ana, "offload worked this out", "learned");

    await applyCompaction(flat, { supersede: [mine.id, theirs.id], remove: [], add: [] });

    const rows = await db
      .selectFrom("notes")
      .select(["id", "purge_after"])
      .where("id", "in", [mine.id, theirs.id])
      .execute();
    expect(rows.find((row) => row.id === mine.id)?.purge_after).toBeNull();
    expect(rows.find((row) => row.id === theirs.id)?.purge_after).not.toBeNull();
  });
});

describe("a fold of one sentence a person typed", () => {
  it("is a rewrite of their words, so it is skipped and the note stays", async () => {
    // Folding one note into one note is rewriting it, with offload's text
    // credited to the person. The nightly pass refuses this in Python; this is
    // the side that enforces it.
    const ana = await account();
    const flat = await thread(ana);
    const typed = await add(flat, ana, "the plumber comes Tuesdays");

    const outcome = await applyCompaction(flat, {
      supersede: [],
      remove: [],
      add: [{ text: "Plumber visits weekly on Tuesday", foldedFrom: [typed.id] }],
    });

    expect(outcome).toMatchObject({ added: 0, superseded: 0, ignored: 1 });
    const active = await readableNotes(ana, flat);
    expect(active.map((note) => note.text)).toEqual(["the plumber comes Tuesdays"]);
  });
});
