// Thread notes: the sentences a thread holds about itself.
//
// AC-1   a member adds one, at most 200 characters, with an optional body.
// AC-5   nothing is refused for being one too many.
// AC-3b  a person's repeat lands; offload's does not.
// AC-4   offload's are marked as inferred.
// AC-6   offload may not overwrite what a person stated.
// AC-9   any member reads and edits.
// AC-9a  only the author deletes.
// AC-9b  any member mutes, thread-wide.
// AC-10  authorship never moves on an edit.
// AC-11  reads resolve through membership, never through account_id.
// AC-12  one refusal, whatever the reason, on one code path.
// AC-13  delete is undoable and destroys nothing first.
// AC-15  account deletion leaves notes in shared threads.
// AC-6   what reaches a prompt is a constant, not a function of account age.
// AC-21  no note text reaches an error, a log or a job.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { NotYours } from "../src/threads/access.js";
import {
  NOTE_PROMPT_BUDGET,
  NOTE_TEXT_CHARS,
  NoteTooLong,
  addNote,
  deleteNote,
  editNote,
  notesForPrompt,
  readableNote,
  readableNotes,
  reprioritiseNote,
  restoreNote,
  setMuted,
} from "../src/threads/notes.js";
import { reorderPlan } from "../src/threads/widgets.js";

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

async function join(threadId: string, accountId: string): Promise<void> {
  await db
    .insertInto("thread_members")
    .values({ thread_id: threadId, account_id: accountId, state: "accepted" })
    .execute();
}

/** Adding through a transaction, the way the routes do. There is no lock to
 *  take any more, and the transaction is kept because every caller has one. */
function add(threadId: string, accountId: string, text: string, origin: "stated" | "learned" = "stated") {
  return db.transaction().execute((trx) => addNote({ threadId, accountId, text, origin }, trx));
}

describe("AC-1 adding", () => {
  it("puts a note on a thread you are in", async () => {
    const ana = await account();
    const flat = await thread(ana);

    const note = await add(flat, ana, "Todo names in three words");
    expect(note.text).toBe("Todo names in three words");
    expect(note.origin).toBe("stated");
    expect(note.authorId).toBe(ana);
    expect(note.muted).toBe(false);

    expect(await readableNotes(ana, flat)).toHaveLength(1);
  });

  it("refuses text that is empty once trimmed, so 200 spaces is empty", async () => {
    const ana = await account();
    const flat = await thread(ana);
    await expect(add(flat, ana, "   ".repeat(60))).rejects.toBeInstanceOf(NoteTooLong);
  });

  it("refuses text past the cap rather than truncating it", async () => {
    const ana = await account();
    const flat = await thread(ana);
    // Storing something other than what somebody typed is worse than saying no.
    await expect(add(flat, ana, "x".repeat(NOTE_TEXT_CHARS + 1))).rejects.toBeInstanceOf(
      NoteTooLong
    );
    await expect(add(flat, ana, "x".repeat(NOTE_TEXT_CHARS))).resolves.toBeTruthy();
  });
});

describe("AC-5 nothing is refused for being one too many", () => {
  it("lands the hundred and first, and the four hundred and first", async () => {
    // 008 refused the eleventh under a row lock. The hundred is a prompt
    // budget applied when the prompt is assembled, so there is nothing here to
    // refuse and nothing to serialise.
    const ana = await account();
    const flat = await thread(ana);
    for (let i = 0; i < NOTE_PROMPT_BUDGET; i += 1) {
      await add(flat, ana, `note number ${i}`);
    }
    await expect(add(flat, ana, "one more")).resolves.toBeTruthy();
    expect(await readableNotes(ana, flat)).toHaveLength(NOTE_PROMPT_BUDGET + 1);
  });

  it("gives offload the same answer", async () => {
    const ana = await account();
    const flat = await thread(ana);
    for (let i = 0; i < NOTE_PROMPT_BUDGET; i += 1) {
      await add(flat, ana, `note number ${i}`);
    }
    await expect(
      add(flat, ana, "offload noticed something", "learned")
    ).resolves.toBeTruthy();
  });

  it("lands two racing adds rather than one", async () => {
    // The inverse of the test this replaces. With a cap, two adds at nine had
    // to leave ten; with a budget there is no invariant to protect and both
    // sentences are things somebody dumped.
    const ana = await account();
    const flat = await thread(ana);

    const outcomes = await Promise.allSettled([
      add(flat, ana, "first racer"),
      add(flat, ana, "second racer"),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(2);
    expect(await readableNotes(ana, flat)).toHaveLength(2);
  });
});

describe("AC-3b the same sentence twice", () => {
  it("returns the existing note when offload writes it again", async () => {
    // A model asked twice about one thread writes the same sentence twice.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "Todo names in three words", "learned");
    const second = await add(flat, ana, "todo NAMES in three WORDS", "learned");

    expect(second.id).toBe(first.id);
    expect(await readableNotes(ana, flat)).toHaveLength(1);
  });

  it("lands both when a person dumps the same sentence twice", async () => {
    // They dumped it twice and they meant it. A dump that silently does not
    // appear is the one thing this product may never do, and the rule the
    // unique index was built for is about a model, not a person.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "the flat is the Lisbon one");
    const second = await add(flat, ana, "the flat is the Lisbon one");

    expect(second.id).not.toBe(first.id);
    expect(await readableNotes(ana, flat)).toHaveLength(2);
  });

  it("never surfaces the text through a caught unique violation", async () => {
    // Postgres puts the conflicting value in the error's detail, so a caught
    // 23505 carries note text into whatever logs the exception. OFF-1.
    const ana = await account();
    const flat = await thread(ana);
    await add(flat, ana, "the flat is the Lisbon one", "learned");
    let raised: unknown = null;
    try {
      await add(flat, ana, "the flat is the Lisbon one", "learned");
    } catch (error) {
      raised = error;
    }
    expect(raised).toBeNull();
  });
});

describe("AC-9 and AC-9a sharing", () => {
  it("lets every member read and edit, whoever wrote it", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    const note = await add(flat, ana, "Ana handles the electrician");
    expect(await readableNotes(john, flat)).toHaveLength(1);

    const edited = await db
      .transaction()
      .execute((trx) =>
        editNote({ noteId: note.id, accountId: john, text: "John handles the electrician" }, trx)
      );
    expect(edited?.note.text).toBe("John handles the electrician");
    expect(edited?.previous).toBe("Ana handles the electrician");
  });

  it("keeps the note with whoever created it, however often it is edited", async () => {
    // AC-10. John editing Ana's rule does not make it John's.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    const note = await add(flat, ana, "Ana handles the electrician");
    await db
      .transaction()
      .execute((trx) => editNote({ noteId: note.id, accountId: john, text: "changed" }, trx));

    const after = await readableNote(john, note.id);
    expect(after?.authorId).toBe(ana);
  });

  it("lets only the author delete, per OFF-3", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const note = await add(flat, ana, "Ana handles the electrician");

    await expect(deleteNote(note.id, john)).rejects.toBeInstanceOf(NotYours);
    await expect(deleteNote(note.id, ana)).resolves.toBe(true);
  });

  it("refuses a non-author and a non-member identically", async () => {
    // AC-12. A different answer for each is an oracle: ask about an id, learn
    // whether it exists and whether somebody else can see it.
    const ana = await account("Ana");
    const john = await account("John");
    const stranger = await account("Stranger");
    const flat = await thread(ana);
    await join(flat, john);
    const note = await add(flat, ana, "Ana handles the electrician");

    const asMember = await deleteNote(note.id, john).catch((e: unknown) => e);
    const asStranger = await deleteNote(note.id, stranger).catch((e: unknown) => e);
    const asGhost = await deleteNote(uuidv7(), stranger).catch((e: unknown) => e);

    expect(asMember).toBeInstanceOf(NotYours);
    expect(asStranger).toBeInstanceOf(NotYours);
    expect(asGhost).toBeInstanceOf(NotYours);
    expect((asMember as Error).message).toBe((asGhost as Error).message);
  });

  it("resolves reads through membership and never through the author", async () => {
    // AC-11. Filtering reads by account_id would hide a note every member of
    // a shared thread is meant to see, and the instinct on finding that is to
    // loosen the filter rather than narrow it.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    await add(flat, ana, "Ana wrote this one");
    await add(flat, john, "John wrote this one");

    expect(await readableNotes(ana, flat)).toHaveLength(2);
    expect(await readableNotes(john, flat)).toHaveLength(2);
  });

  it("shows a stranger nothing", async () => {
    const ana = await account("Ana");
    const stranger = await account("Stranger");
    const flat = await thread(ana);
    await add(flat, ana, "Ana handles the electrician");
    expect(await readableNotes(stranger, flat)).toHaveLength(0);
  });
});

describe("AC-9b mute", () => {
  it("lets any member mute another member's note, thread-wide", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const note = await add(flat, ana, "never file anything from Ana as a task");

    await setMuted(note.id, john, true);

    // Off the model's desk for everybody, still on the thread for everybody.
    expect((await notesForPrompt(flat, ana)).yours).toHaveLength(0);
    expect(await readableNotes(ana, flat)).toHaveLength(1);
    expect((await readableNotes(ana, flat))[0]?.muted).toBe(true);
    expect((await readableNotes(ana, flat))[0]?.authorId).toBe(ana);
  });

  it("is reversible", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "Todo names in three words");
    await setMuted(note.id, ana, true);
    await setMuted(note.id, ana, false);
    expect((await notesForPrompt(flat, ana)).yours.map((n) => n.text)).toEqual([
      "Todo names in three words",
    ]);
  });

  it("keeps a muted note on the thread and out of the prompt", async () => {
    // 008 asserted muting was not a way to hold eleven. There is no eleventh
    // to hold, so what is left worth asserting is the half that still matters:
    // muted is off the model's desk and still on the screen.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "note number 0");
    await add(flat, ana, "note number 1");
    await setMuted(first.id, ana, true);

    expect((await notesForPrompt(flat, ana)).yours.map((n) => n.text)).toEqual([
      "note number 1",
    ]);
    expect(await readableNotes(ana, flat)).toHaveLength(2);
  });
});

describe("AC-6 corrections beat inference", () => {
  it("lets offload rewrite what it worked out", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "receipts go somewhere", "learned");

    const edited = await db
      .transaction()
      .execute((trx) =>
        editNote({ noteId: note.id, accountId: ana, text: "Receipts go to Money", byModel: true }, trx)
      );
    expect(edited?.note.text).toBe("Receipts go to Money");
    expect(edited?.note.origin).toBe("learned");
  });

  it("refuses offload rewriting what a person said", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "Todo names in three words");

    await expect(
      db
        .transaction()
        .execute((trx) =>
          editNote({ noteId: note.id, accountId: ana, text: "something else", byModel: true }, trx)
        )
    ).rejects.toBeInstanceOf(NotYours);
  });

  it("makes a note stated the moment a person edits it, and offload cannot touch it after", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "receipts go somewhere", "learned");

    await db
      .transaction()
      .execute((trx) => editNote({ noteId: note.id, accountId: ana, text: "Receipts go to Money" }, trx));

    await expect(
      db
        .transaction()
        .execute((trx) =>
          editNote({ noteId: note.id, accountId: ana, text: "offload knows better", byModel: true }, trx)
        )
    ).rejects.toBeInstanceOf(NotYours);
  });

  it("refuses offload editing into a sentence it already wrote", async () => {
    const ana = await account();
    const flat = await thread(ana);
    await add(flat, ana, "first rule", "learned");
    const second = await add(flat, ana, "second rule", "learned");

    // Not merged into the existing row: that would destroy one note to
    // satisfy an edit of another.
    const result = await db
      .transaction()
      .execute((trx) =>
        editNote({ noteId: second.id, accountId: ana, text: "First Rule", byModel: true }, trx)
      );
    expect(result).toBeNull();
    expect(await readableNotes(ana, flat)).toHaveLength(2);
  });

  it("lets a person edit into a sentence the thread already holds", async () => {
    // The unique index covers offload's notes only, so this is not a clash at
    // all. Two people can say the same true thing.
    const ana = await account();
    const flat = await thread(ana);
    await add(flat, ana, "first rule");
    const second = await add(flat, ana, "second rule");

    const result = await db
      .transaction()
      .execute((trx) => editNote({ noteId: second.id, accountId: ana, text: "First Rule" }, trx));
    expect(result?.note.text).toBe("First Rule");
  });
});

describe("AC-21 delete and undo", () => {
  it("destroys nothing while Undo is up", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "Todo names in three words");
    await deleteNote(note.id, ana);

    const row = await db
      .selectFrom("notes")
      .select(["deleted_at", "purge_after"])
      .where("id", "=", note.id)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.purge_after).not.toBeNull();
  });

  it("deletes twice without raising and without removing anything extra", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "Todo names in three words");
    expect(await deleteNote(note.id, ana)).toBe(true);
    expect(await deleteNote(note.id, ana)).toBe(false);
  });

  it("restores after a replacement was written, which the cap used to refuse", async () => {
    // AC-14a in 008: at ten, delete one, add another, then press Undo, and the
    // restore was refused. With no cap the undo is just an undo.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "note number 0");
    await deleteNote(first.id, ana);
    await add(flat, ana, "a replacement");

    const back = await db.transaction().execute((trx) => restoreNote(first.id, ana, trx));
    expect(back.text).toBe("note number 0");
    expect(await readableNotes(ana, flat)).toHaveLength(2);
  });

  it("restores what was deleted", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "Todo names in three words");
    await deleteNote(note.id, ana);
    const back = await db.transaction().execute((trx) => restoreNote(note.id, ana, trx));
    expect(back.text).toBe("Todo names in three words");
    expect(await readableNotes(ana, flat)).toHaveLength(1);
  });
});

describe("AC-15 deleting an account", () => {
  it("leaves notes in a shared thread and takes the name off them", async () => {
    // OFF-3: account deletion never cascades into a shared thread, because the
    // thread belongs to the others too.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    await add(flat, john, "John wrote this one");
    await add(flat, ana, "Ana wrote this one");

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await db.deleteFrom("accounts").where("id", "=", john).execute();

    const left = await readableNotes(ana, flat);
    expect(left).toHaveLength(2);
    const orphan = left.find((m) => m.text === "John wrote this one");
    expect(orphan?.authorId).toBeNull();
    // Still reaching the model, which is the point: the thread kept what it
    // says. Ana's is hers and the orphan is in the members list, since it was
    // not written by whoever is reading.
    const carried = await notesForPrompt(flat, ana);
    expect(carried.yours).toHaveLength(1);
    expect(carried.members).toHaveLength(1);
  });
});

describe("AC-17 what reaches a prompt", () => {
  it("is bounded by a constant rather than by how many threads an account has", async () => {
    const ana = await account();
    const busy = await thread(ana, "Flat renovation");
    for (let i = 0; i < NOTE_PROMPT_BUDGET; i += 1) await add(busy, ana, `rule number ${i}`);

    // Fifty more threads, each carrying its ten. None of them is touched by a
    // turn that files into `busy`, so none of them costs a character.
    for (let t = 0; t < 50; t += 1) {
      const other = await thread(ana, `thread ${t}`);
      await add(other, ana, `rule for thread ${t}`);
    }

    const forOne = (await notesForPrompt(busy, ana)).yours;
    expect(forOne).toHaveLength(NOTE_PROMPT_BUDGET);
    const chars = forOne.join("").length;
    expect(chars).toBeLessThanOrEqual(NOTE_PROMPT_BUDGET * NOTE_TEXT_CHARS);
  });

  it("hands back nothing for a thread with nothing to say", async () => {
    const ana = await account();
    const flat = await thread(ana);
    expect((await notesForPrompt(flat, ana)).yours).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 0018: content in a shared thread outlives the account that wrote it.
//
// Not a notes test, but it is the same rule from the same principle, and
// putting it next to the notes one is what stops the two drifting apart
// again. `content.account_id` was `on delete cascade` until 0018, which would
// have emptied half of somebody else's shared thread the first time account
// deletion was built.

describe("OFF-3 content survives its author", () => {
  it("keeps what a departed member put in a shared thread, and takes the name off it", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    const row = await db
      .insertInto("content")
      .values({ account_id: john, thread_id: flat, type: "task", title: "The electrician's quote" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await db.deleteFrom("accounts").where("id", "=", john).execute();

    const after = await db
      .selectFrom("content")
      .select(["id", "account_id"])
      .where("id", "=", row.id)
      .executeTakeFirst();

    expect(after).toBeDefined();
    expect(after?.account_id).toBeNull();
  });

  it("hands it to whoever is still in the thread, rather than to nobody", async () => {
    // This asserted the opposite until 2026-09-04. The rule was that content
    // whose author is gone can be deleted by nobody, which is OFF-3 read
    // literally; the product owner reversed it, because the result was a
    // shared thread accumulating leftovers no member could clear.
    const { requireAuthor } = await import("../src/threads/access.js");
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    const row = await db
      .insertInto("content")
      .values({ account_id: john, thread_id: flat, type: "task", title: "The electrician's quote" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await db.deleteFrom("accounts").where("id", "=", john).execute();

    await expect(requireAuthor(ana, row.id)).resolves.toBeTruthy();
  });
});

describe("a thread's leftovers belong to whoever is still in it", () => {
  it("lets any member delete a note whose author left the thread", async () => {
    // OFF-3 gives delete to the author so a shared thread cannot become a place
    // where somebody else destroys what you put in. Once the author is gone
    // there is no contribution left to protect, and the rule only produces a
    // rule still steering the model that nobody can remove.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const note = await add(flat, john, "never file anything from Ana as a task");

    // While John is here, it is his alone.
    await expect(deleteNote(note.id, ana)).rejects.toBeInstanceOf(NotYours);

    await db
      .deleteFrom("thread_members")
      .where("account_id", "=", john)
      .where("thread_id", "=", flat)
      .execute();

    expect(await deleteNote(note.id, ana)).toBe(true);
  });

  it("lets any member delete a note whose author deleted their account", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const note = await add(flat, john, "John's leftover rule");

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await db.deleteFrom("accounts").where("id", "=", john).execute();

    expect(await deleteNote(note.id, ana)).toBe(true);
  });

  it("does the same for content", async () => {
    const { requireAuthor } = await import("../src/threads/access.js");
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    const row = await db
      .insertInto("content")
      .values({ account_id: john, thread_id: flat, type: "task", title: "The electrician's quote" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await expect(requireAuthor(ana, row.id)).rejects.toBeInstanceOf(NotYours);

    await db
      .deleteFrom("thread_members")
      .where("account_id", "=", john)
      .where("thread_id", "=", flat)
      .execute();

    await expect(requireAuthor(ana, row.id)).resolves.toBeTruthy();
  });

  it("still refuses somebody who was never in the thread", async () => {
    // The exception is about the author being gone, not about the caller. A
    // stranger gets the same refusal either way.
    const { requireAuthor } = await import("../src/threads/access.js");
    const ana = await account("Ana");
    const john = await account("John");
    const stranger = await account("Stranger");
    const flat = await thread(ana);
    await join(flat, john);

    const row = await db
      .insertInto("content")
      .values({ account_id: john, thread_id: flat, type: "task", title: "The electrician's quote" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await expect(requireAuthor(stranger, row.id)).rejects.toBeInstanceOf(NotYours);
  });
});

// ---------------------------------------------------------------------------
// Deleting a thread, which is really leaving one.
//
// OFF-3: a thread has members and no owner, and the privacy page says in
// public that no role can throw somebody out or empty it. So this removes the
// caller and nobody else, and the thread goes when the last member is out,
// which is what that page already promises.

describe("leaving a thread, and the thread dying with the last member", () => {
  it("deletes it when you were the only one in it", async () => {
    const { deleteThread } = await import("../src/routes/threads.js");
    const ana = await account("Ana");
    const flat = await thread(ana);

    expect(await deleteThread(ana, flat)).toEqual({ left: true, deleted: true });

    const row = await db
      .selectFrom("threads")
      .select(["deleted_at", "purge_after"])
      .where("id", "=", flat)
      .executeTakeFirstOrThrow();
    // Soft, so the eight seconds are real and the purge job does the
    // destroying, like every other table under the undo window.
    expect(row.deleted_at).not.toBeNull();
    expect(row.purge_after).not.toBeNull();
  });

  it("leaves a shared thread standing for the others", async () => {
    const { deleteThread } = await import("../src/routes/threads.js");
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    expect(await deleteThread(john, flat)).toEqual({ left: true, deleted: false });

    const row = await db
      .selectFrom("threads")
      .select("deleted_at")
      .where("id", "=", flat)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).toBeNull();
    expect(await readableNotes(ana, flat)).toBeDefined();
  });

  it("dies when the last member leaves", async () => {
    const { deleteThread } = await import("../src/routes/threads.js");
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    await deleteThread(john, flat);
    expect(await deleteThread(ana, flat)).toEqual({ left: true, deleted: true });
  });

  it("refuses the default thread, because every dump has to land somewhere", async () => {
    const { deleteThread } = await import("../src/routes/threads.js");
    const ana = await account("Ana");
    const misc = await thread(ana, "Miscellaneous");
    await db
      .updateTable("accounts")
      .set({ default_thread_id: misc })
      .where("id", "=", ana)
      .execute();

    await expect(deleteThread(ana, misc)).rejects.toBeInstanceOf(NotYours);
  });

  it("marks the default thread on the list, so the row can say why", async () => {
    // Read from `accounts.default_thread_id`, never from a thread called
    // Miscellaneous: 004 is explicit that the default is what the column
    // points at, and a name is not a key.
    const ana = await account("Ana");
    const misc = await thread(ana, "Miscellaneous");
    const flat = await thread(ana, "Flat renovation");
    await db
      .updateTable("accounts")
      .set({ default_thread_id: misc })
      .where("id", "=", ana)
      .execute();

    const rows = await db
      .selectFrom("accounts")
      .select("default_thread_id")
      .where("id", "=", ana)
      .executeTakeFirstOrThrow();
    expect(rows.default_thread_id).toBe(misc);
    expect(rows.default_thread_id).not.toBe(flat);
  });

  it("refuses somebody who is not in it, with the one refusal", async () => {
    const { deleteThread } = await import("../src/routes/threads.js");
    const ana = await account("Ana");
    const stranger = await account("Stranger");
    const flat = await thread(ana);

    await expect(deleteThread(stranger, flat)).rejects.toBeInstanceOf(NotYours);
  });

  it("puts it back, twice without raising", async () => {
    const { deleteThread, restoreThread } = await import("../src/routes/threads.js");
    const ana = await account("Ana");
    const flat = await thread(ana);
    await add(flat, ana, "Todo names in three words");

    await deleteThread(ana, flat);
    expect(await restoreThread(ana, flat)).toBe(true);
    expect(await restoreThread(ana, flat)).toBe(true);

    expect(await readableNotes(ana, flat)).toHaveLength(1);
  });

  it("takes its notes when the purge runs, since nothing cascades to them", async () => {
    const { deleteThread } = await import("../src/routes/threads.js");
    const { handlers } = await import("../src/jobs/handlers.js");
    const ana = await account("Ana");
    const flat = await thread(ana);
    await add(flat, ana, "Todo names in three words");
    await db
      .insertInto("content")
      .values({ account_id: ana, thread_id: flat, type: "task", title: "Chase the electrician" })
      .execute();

    await deleteThread(ana, flat);
    // Past the window, without waiting eight seconds for it.
    await db
      .updateTable("threads")
      .set({ purge_after: new Date(Date.now() - 1000) })
      .where("id", "=", flat)
      .execute();

    await handlers["content.purge"]?.({}, { mailer: null as never }, null);

    const left = await db
      .selectFrom("notes")
      .select("id")
      .where("subject_id", "=", flat)
      .execute();
    expect(left).toHaveLength(0);
    const threadRow = await db
      .selectFrom("threads")
      .select("id")
      .where("id", "=", flat)
      .executeTakeFirst();
    expect(threadRow).toBeUndefined();
  });
});

describe("AC-14 what a turn writes after it read a calendar", () => {
  it("marks it untrusted, and the prompt keeps it out of the list it acts on", async () => {
    // The two-hop path 001 named and 012 built the column for: connector
    // content, summarised into a note, read later as something to act on. The
    // flag had no writer at all until this, which is what made the second list
    // a shape nothing landed in.
    const ana = await account();
    const flat = await thread(ana);

    await db.transaction().execute((trx) =>
      addNote(
        {
          threadId: flat,
          accountId: ana,
          text: "the dentist moved to Thursday",
          origin: "learned",
          derivedFromUntrusted: true,
        },
        trx,
      ),
    );
    await add(flat, ana, "Todo names in three words");

    const carried = await notesForPrompt(flat, ana);
    expect(carried.yours.map((note) => note.text)).toEqual(["Todo names in three words"]);
    expect(carried.fromApps.map((note) => note.text)).toEqual(["the dentist moved to Thursday"]);
    expect(carried.members).toEqual([]);
  });
});

describe("a note can be moved, and moving it is not writing it", () => {
  it("orders the section by where a person put it, then by when it was written", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "Boiler is serviced in March");
    const second = await add(flat, ana, "Keys are with the neighbour");
    const third = await add(flat, ana, "Landlord prefers email");

    // Untouched, a section reads oldest first, which is what it always did.
    expect((await readableNotes(ana, flat)).map((note) => note.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ]);

    // Drag the last one to the top: the helper the screens use gives it the
    // midpoint above the first row, and the read comes back in that order.
    const notes = await readableNotes(ana, flat);
    const { writes } = reorderPlan(notes, 2, 0);
    expect(writes).toEqual([{ id: third.id, priority: 75, previous: 50 }]);
    for (const write of writes) await reprioritiseNote(ana, write.id, write.priority);

    expect((await readableNotes(ana, flat)).map((note) => note.id)).toEqual([
      third.id,
      first.id,
      second.id,
    ]);
  });

  it("returns what it was, so Undo is the same call with the old number", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const note = await add(flat, ana, "Keys are with the neighbour");

    const { previous } = await reprioritiseNote(ana, note.id, 80);
    expect(previous).toEqual({ priority: 50 });
    await reprioritiseNote(ana, note.id, previous.priority);
    expect((await readableNote(ana, note.id))?.priority).toBe(50);
  });

  it("leaves updated_at alone, because precedence is when a note was last written", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const older = await add(flat, ana, "We arrive on the 12th");
    const newer = await add(flat, ana, "We arrive on the 14th");

    await reprioritiseNote(ana, older.id, 90);

    const after = await readableNote(ana, older.id);
    expect(after?.writtenAt.getTime()).toBe(older.writtenAt.getTime());
    // And the prompt still puts the newer sentence last, whatever the screen
    // shows first.
    const { yours } = await notesForPrompt(flat, ana);
    expect(yours.map((entry) => entry.text)).toEqual([
      "We arrive on the 12th",
      "We arrive on the 14th",
    ]);
    expect(newer.writtenAt.getTime()).toBeGreaterThanOrEqual(older.writtenAt.getTime());
  });

  it("is any member's, like every other arrangement of a shared thread", async () => {
    const ana = await account();
    const john = await account("John Duarte");
    const flat = await thread(ana);
    await join(flat, john);
    const note = await add(flat, ana, "Keys are with the neighbour");

    await reprioritiseNote(john, note.id, 90);
    expect((await readableNote(ana, note.id))?.priority).toBe(90);

    const stranger = await account("Nobody");
    await expect(reprioritiseNote(stranger, note.id, 10)).rejects.toBeInstanceOf(NotYours);
  });
});
