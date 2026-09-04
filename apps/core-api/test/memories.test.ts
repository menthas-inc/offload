// Thread memories: the standing facts a thread holds about itself.
//
// AC-1   a member adds one, at most 200 characters.
// AC-2   ten and no eleventh, for a person and for offload.
// AC-4   offload's are marked as inferred.
// AC-5   the same text twice is one memory.
// AC-6   offload may not overwrite what a person stated.
// AC-9   any member reads and edits.
// AC-9a  only the author deletes.
// AC-9b  any member mutes, thread-wide.
// AC-10  authorship never moves on an edit.
// AC-11  reads resolve through membership, never through account_id.
// AC-12  one refusal, whatever the reason, on one code path.
// AC-13  delete is undoable and destroys nothing first.
// AC-14  a deleted one does not count; AC-14a a restore cannot exceed ten.
// AC-15  account deletion leaves memories in shared threads.
// AC-17  what reaches a prompt is a constant, not a function of account age.
// AC-21  no memory text reaches an error, a log or a job.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, closeDb } from "../src/db.js";
import { migrate } from "../src/migrate.js";
import { uuidv7 } from "../src/uuid.js";
import { NotYours } from "../src/threads/access.js";
import {
  MAX_MEMORIES_PER_THREAD,
  MEMORY_TEXT_CHARS,
  MemoryLimit,
  MemoryTooLong,
  addMemory,
  deleteMemory,
  editMemory,
  memoriesForPrompt,
  readableMemories,
  readableMemory,
  restoreMemory,
  setMuted,
} from "../src/threads/memories.js";

await migrate(() => {});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await db.deleteFrom("memories").execute();
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

/** Adding through a transaction, the way every caller does, because the cap
 *  takes a row lock and a lock outside a transaction locks nothing. */
function add(threadId: string, accountId: string, text: string, origin: "stated" | "learned" = "stated") {
  return db.transaction().execute((trx) => addMemory({ threadId, accountId, text, origin }, trx));
}

describe("AC-1 adding", () => {
  it("puts a memory on a thread you are in", async () => {
    const ana = await account();
    const flat = await thread(ana);

    const memory = await add(flat, ana, "Todo names in three words");
    expect(memory.text).toBe("Todo names in three words");
    expect(memory.origin).toBe("stated");
    expect(memory.authorId).toBe(ana);
    expect(memory.muted).toBe(false);

    expect(await readableMemories(ana, flat)).toHaveLength(1);
  });

  it("refuses text that is empty once trimmed, so 200 spaces is empty", async () => {
    const ana = await account();
    const flat = await thread(ana);
    await expect(add(flat, ana, "   ".repeat(60))).rejects.toBeInstanceOf(MemoryTooLong);
  });

  it("refuses text past the cap rather than truncating it", async () => {
    const ana = await account();
    const flat = await thread(ana);
    // Storing something other than what somebody typed is worse than saying no.
    await expect(add(flat, ana, "x".repeat(MEMORY_TEXT_CHARS + 1))).rejects.toBeInstanceOf(
      MemoryTooLong
    );
    await expect(add(flat, ana, "x".repeat(MEMORY_TEXT_CHARS))).resolves.toBeTruthy();
  });
});

describe("AC-2 ten, and no eleventh", () => {
  it("refuses the eleventh", async () => {
    const ana = await account();
    const flat = await thread(ana);
    for (let i = 0; i < MAX_MEMORIES_PER_THREAD; i += 1) {
      await add(flat, ana, `rule number ${i}`);
    }
    await expect(add(flat, ana, "one too many")).rejects.toBeInstanceOf(MemoryLimit);
  });

  it("holds ten under two adds racing at nine", async () => {
    // The whole reason the cap takes `select ... for update` on the thread row.
    // A plain count is check-then-act: both read nine, both insert, eleven.
    const ana = await account();
    const flat = await thread(ana);
    for (let i = 0; i < MAX_MEMORIES_PER_THREAD - 1; i += 1) {
      await add(flat, ana, `rule number ${i}`);
    }

    const outcomes = await Promise.allSettled([
      add(flat, ana, "first racer"),
      add(flat, ana, "second racer"),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await readableMemories(ana, flat)).toHaveLength(MAX_MEMORIES_PER_THREAD);
  });

  it("gives offload no exemption", async () => {
    const ana = await account();
    const flat = await thread(ana);
    for (let i = 0; i < MAX_MEMORIES_PER_THREAD; i += 1) {
      await add(flat, ana, `rule number ${i}`);
    }
    await expect(add(flat, ana, "offload noticed something", "learned")).rejects.toBeInstanceOf(
      MemoryLimit
    );
  });
});

describe("AC-5 the same sentence twice", () => {
  it("returns the existing memory and creates nothing", async () => {
    // A model asked twice about one thread writes the same sentence twice.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "Todo names in three words");
    const second = await add(flat, ana, "todo NAMES in three WORDS", "learned");

    expect(second.id).toBe(first.id);
    expect(second.origin).toBe("stated");
    expect(await readableMemories(ana, flat)).toHaveLength(1);
  });

  it("never surfaces the text through a caught unique violation", async () => {
    // Postgres puts the conflicting value in the error's detail, so a caught
    // 23505 carries memory text into whatever logs the exception. OFF-1.
    const ana = await account();
    const flat = await thread(ana);
    await add(flat, ana, "the flat is the Lisbon one");
    let raised: unknown = null;
    try {
      await add(flat, ana, "the flat is the Lisbon one");
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

    const memory = await add(flat, ana, "Ana handles the electrician");
    expect(await readableMemories(john, flat)).toHaveLength(1);

    const edited = await db
      .transaction()
      .execute((trx) =>
        editMemory({ memoryId: memory.id, accountId: john, text: "John handles the electrician" }, trx)
      );
    expect(edited?.memory.text).toBe("John handles the electrician");
    expect(edited?.previous).toBe("Ana handles the electrician");
  });

  it("keeps the memory with whoever created it, however often it is edited", async () => {
    // AC-10. John editing Ana's rule does not make it John's.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    const memory = await add(flat, ana, "Ana handles the electrician");
    await db
      .transaction()
      .execute((trx) => editMemory({ memoryId: memory.id, accountId: john, text: "changed" }, trx));

    const after = await readableMemory(john, memory.id);
    expect(after?.authorId).toBe(ana);
  });

  it("lets only the author delete, per OFF-3", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const memory = await add(flat, ana, "Ana handles the electrician");

    await expect(deleteMemory(memory.id, john)).rejects.toBeInstanceOf(NotYours);
    await expect(deleteMemory(memory.id, ana)).resolves.toBe(true);
  });

  it("refuses a non-author and a non-member identically", async () => {
    // AC-12. A different answer for each is an oracle: ask about an id, learn
    // whether it exists and whether somebody else can see it.
    const ana = await account("Ana");
    const john = await account("John");
    const stranger = await account("Stranger");
    const flat = await thread(ana);
    await join(flat, john);
    const memory = await add(flat, ana, "Ana handles the electrician");

    const asMember = await deleteMemory(memory.id, john).catch((e: unknown) => e);
    const asStranger = await deleteMemory(memory.id, stranger).catch((e: unknown) => e);
    const asGhost = await deleteMemory(uuidv7(), stranger).catch((e: unknown) => e);

    expect(asMember).toBeInstanceOf(NotYours);
    expect(asStranger).toBeInstanceOf(NotYours);
    expect(asGhost).toBeInstanceOf(NotYours);
    expect((asMember as Error).message).toBe((asGhost as Error).message);
  });

  it("resolves reads through membership and never through the author", async () => {
    // AC-11. Filtering reads by account_id would hide a memory every member of
    // a shared thread is meant to see, and the instinct on finding that is to
    // loosen the filter rather than narrow it.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    await add(flat, ana, "Ana wrote this one");
    await add(flat, john, "John wrote this one");

    expect(await readableMemories(ana, flat)).toHaveLength(2);
    expect(await readableMemories(john, flat)).toHaveLength(2);
  });

  it("shows a stranger nothing", async () => {
    const ana = await account("Ana");
    const stranger = await account("Stranger");
    const flat = await thread(ana);
    await add(flat, ana, "Ana handles the electrician");
    expect(await readableMemories(stranger, flat)).toHaveLength(0);
  });
});

describe("AC-9b mute", () => {
  it("lets any member mute another member's memory, thread-wide", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const memory = await add(flat, ana, "never file anything from Ana as a task");

    await setMuted(memory.id, john, true);

    // Off the model's desk for everybody, still on the thread for everybody.
    expect(await memoriesForPrompt(flat)).toHaveLength(0);
    expect(await readableMemories(ana, flat)).toHaveLength(1);
    expect((await readableMemories(ana, flat))[0]?.muted).toBe(true);
    expect((await readableMemories(ana, flat))[0]?.authorId).toBe(ana);
  });

  it("is reversible", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const memory = await add(flat, ana, "Todo names in three words");
    await setMuted(memory.id, ana, true);
    await setMuted(memory.id, ana, false);
    expect(await memoriesForPrompt(flat)).toEqual(["Todo names in three words"]);
  });

  it("is not a way to hold eleven", async () => {
    const ana = await account();
    const flat = await thread(ana);
    for (let i = 0; i < MAX_MEMORIES_PER_THREAD; i += 1) {
      const m = await add(flat, ana, `rule number ${i}`);
      await setMuted(m.id, ana, true);
    }
    await expect(add(flat, ana, "one too many")).rejects.toBeInstanceOf(MemoryLimit);
  });
});

describe("AC-6 corrections beat inference", () => {
  it("lets offload rewrite what it worked out", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const memory = await add(flat, ana, "receipts go somewhere", "learned");

    const edited = await db
      .transaction()
      .execute((trx) =>
        editMemory({ memoryId: memory.id, accountId: ana, text: "Receipts go to Money", byModel: true }, trx)
      );
    expect(edited?.memory.text).toBe("Receipts go to Money");
    expect(edited?.memory.origin).toBe("learned");
  });

  it("refuses offload rewriting what a person said", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const memory = await add(flat, ana, "Todo names in three words");

    await expect(
      db
        .transaction()
        .execute((trx) =>
          editMemory({ memoryId: memory.id, accountId: ana, text: "something else", byModel: true }, trx)
        )
    ).rejects.toBeInstanceOf(NotYours);
  });

  it("makes a memory stated the moment a person edits it, and offload cannot touch it after", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const memory = await add(flat, ana, "receipts go somewhere", "learned");

    await db
      .transaction()
      .execute((trx) => editMemory({ memoryId: memory.id, accountId: ana, text: "Receipts go to Money" }, trx));

    await expect(
      db
        .transaction()
        .execute((trx) =>
          editMemory({ memoryId: memory.id, accountId: ana, text: "offload knows better", byModel: true }, trx)
        )
    ).rejects.toBeInstanceOf(NotYours);
  });

  it("refuses an edit into a sentence the thread already holds", async () => {
    const ana = await account();
    const flat = await thread(ana);
    await add(flat, ana, "first rule");
    const second = await add(flat, ana, "second rule");

    // Not merged into the existing row: that would destroy one memory to
    // satisfy an edit of another.
    const result = await db
      .transaction()
      .execute((trx) => editMemory({ memoryId: second.id, accountId: ana, text: "First Rule" }, trx));
    expect(result).toBeNull();
    expect(await readableMemories(ana, flat)).toHaveLength(2);
  });
});

describe("AC-13 and AC-14 delete, undo and the cap", () => {
  it("destroys nothing while Undo is up", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const memory = await add(flat, ana, "Todo names in three words");
    await deleteMemory(memory.id, ana);

    const row = await db
      .selectFrom("memories")
      .select(["deleted_at", "purge_after"])
      .where("id", "=", memory.id)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.purge_after).not.toBeNull();
  });

  it("deletes twice without raising and without removing anything extra", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const memory = await add(flat, ana, "Todo names in three words");
    expect(await deleteMemory(memory.id, ana)).toBe(true);
    expect(await deleteMemory(memory.id, ana)).toBe(false);
  });

  it("does not count a deleted memory against the ten", async () => {
    // Or "delete one, add another" fails for eight seconds and the person is
    // told the thread is full while looking at nine.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "rule number 0");
    for (let i = 1; i < MAX_MEMORIES_PER_THREAD; i += 1) await add(flat, ana, `rule number ${i}`);

    await deleteMemory(first.id, ana);
    await expect(add(flat, ana, "a replacement")).resolves.toBeTruthy();
  });

  it("refuses a restore that would make eleven", async () => {
    // AC-14a. The one door the cap does not otherwise watch: at ten, delete
    // one, add another, then press Undo.
    const ana = await account();
    const flat = await thread(ana);
    const first = await add(flat, ana, "rule number 0");
    for (let i = 1; i < MAX_MEMORIES_PER_THREAD; i += 1) await add(flat, ana, `rule number ${i}`);

    await deleteMemory(first.id, ana);
    await add(flat, ana, "a replacement");

    await expect(
      db.transaction().execute((trx) => restoreMemory(first.id, ana, trx))
    ).rejects.toBeInstanceOf(MemoryLimit);
    expect(await readableMemories(ana, flat)).toHaveLength(MAX_MEMORIES_PER_THREAD);
  });

  it("restores when there is room", async () => {
    const ana = await account();
    const flat = await thread(ana);
    const memory = await add(flat, ana, "Todo names in three words");
    await deleteMemory(memory.id, ana);
    const back = await db.transaction().execute((trx) => restoreMemory(memory.id, ana, trx));
    expect(back.text).toBe("Todo names in three words");
    expect(await readableMemories(ana, flat)).toHaveLength(1);
  });
});

describe("AC-15 deleting an account", () => {
  it("leaves memories in a shared thread and takes the name off them", async () => {
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

    const left = await readableMemories(ana, flat);
    expect(left).toHaveLength(2);
    const orphan = left.find((m) => m.text === "John wrote this one");
    expect(orphan?.authorId).toBeNull();
    // Still steering the model, which is the point: the thread kept its rules.
    expect(await memoriesForPrompt(flat)).toHaveLength(2);
  });
});

describe("AC-17 what reaches a prompt", () => {
  it("is bounded by a constant rather than by how many threads an account has", async () => {
    const ana = await account();
    const busy = await thread(ana, "Flat renovation");
    for (let i = 0; i < MAX_MEMORIES_PER_THREAD; i += 1) await add(busy, ana, `rule number ${i}`);

    // Fifty more threads, each carrying its ten. None of them is touched by a
    // turn that files into `busy`, so none of them costs a character.
    for (let t = 0; t < 50; t += 1) {
      const other = await thread(ana, `thread ${t}`);
      await add(other, ana, `rule for thread ${t}`);
    }

    const forOne = await memoriesForPrompt(busy);
    expect(forOne).toHaveLength(MAX_MEMORIES_PER_THREAD);
    const chars = forOne.join("").length;
    expect(chars).toBeLessThanOrEqual(MAX_MEMORIES_PER_THREAD * MEMORY_TEXT_CHARS);
  });

  it("hands back nothing for a thread with nothing to say", async () => {
    const ana = await account();
    const flat = await thread(ana);
    expect(await memoriesForPrompt(flat)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 0018: content in a shared thread outlives the account that wrote it.
//
// Not a memories test, but it is the same rule from the same principle, and
// putting it next to the memories one is what stops the two drifting apart
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
      .values({ account_id: john, thread_id: flat, title: "The electrician's quote" })
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
      .values({ account_id: john, thread_id: flat, title: "The electrician's quote" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await db.deleteFrom("accounts").where("id", "=", john).execute();

    await expect(requireAuthor(ana, row.id)).resolves.toBeTruthy();
  });
});

describe("a thread's leftovers belong to whoever is still in it", () => {
  it("lets any member delete a memory whose author left the thread", async () => {
    // OFF-3 gives delete to the author so a shared thread cannot become a place
    // where somebody else destroys what you put in. Once the author is gone
    // there is no contribution left to protect, and the rule only produces a
    // rule still steering the model that nobody can remove.
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const memory = await add(flat, john, "never file anything from Ana as a task");

    // While John is here, it is his alone.
    await expect(deleteMemory(memory.id, ana)).rejects.toBeInstanceOf(NotYours);

    await db
      .deleteFrom("thread_members")
      .where("account_id", "=", john)
      .where("thread_id", "=", flat)
      .execute();

    expect(await deleteMemory(memory.id, ana)).toBe(true);
  });

  it("lets any member delete a memory whose author deleted their account", async () => {
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);
    const memory = await add(flat, john, "John's leftover rule");

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await db.deleteFrom("accounts").where("id", "=", john).execute();

    expect(await deleteMemory(memory.id, ana)).toBe(true);
  });

  it("does the same for content", async () => {
    const { requireAuthor } = await import("../src/threads/access.js");
    const ana = await account("Ana");
    const john = await account("John");
    const flat = await thread(ana);
    await join(flat, john);

    const row = await db
      .insertInto("content")
      .values({ account_id: john, thread_id: flat, title: "The electrician's quote" })
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
      .values({ account_id: john, thread_id: flat, title: "The electrician's quote" })
      .returning("id")
      .executeTakeFirstOrThrow();

    await db.deleteFrom("thread_members").where("account_id", "=", john).execute();
    await expect(requireAuthor(stranger, row.id)).rejects.toBeInstanceOf(NotYours);
  });
});
