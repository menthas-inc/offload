// Thread memories: the standing facts a thread holds about itself.
//
// A memory is not content. "Write todo names in three words" is a memory;
// "chase the electrician" is a task. The test is whether it would show up in a
// widget: a memory has no date, no place, no tick and no due, and it stays true
// after everything currently in the thread is done.
//
// Three things in here are easy to get wrong and each one is a real defect
// rather than a style preference:
//
//   1. Reads resolve through membership; delete resolves through authorship.
//      Both, in one query, so a missing row and an unreachable one are the same
//      answer on the same path.
//   2. The cap is enforced under a lock. A plain count is check-then-act and
//      two adds at nine leave eleven.
//   3. A duplicate takes `on conflict do nothing`, never a caught unique
//      violation, because Postgres puts the conflicting value in the error and
//      memory text is not allowed anywhere near a log (OFF-1).

import { sql, type ExpressionBuilder, type Selectable } from "kysely";
import { db } from "../db.js";
import type { Database, MemoriesTable } from "../schema.js";
import { NotYours, type Executor } from "./access.js";

/** Ten, and the cap is the feature rather than a safeguard on it.
 *
 *  Memories reach the model as standing instruction, and twenty instructions
 *  that half contradict each other make behaviour worse rather than richer. The
 *  cap is what forces the useful ones to survive at the expense of the rest. */
export const MAX_MEMORIES_PER_THREAD = 10;

/** Long enough for a rule, short enough that the whole set stays readable and
 *  the prompt contribution stays a constant anyone can multiply out. */
export const MEMORY_TEXT_CHARS = 200;

export interface Memory {
  id: string;
  text: string;
  origin: "stated" | "learned";
  /** Null once the author deleted their account. The memory stays; the name
   *  comes off it. */
  authorId: string | null;
  /** Whether the author is still in the thread. False once they deleted their
   *  account or left, at which point every member may delete it: nobody is
   *  left for OFF-3's author rule to protect. */
  authorIsMember: boolean;
  muted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class MemoryLimit extends Error {
  constructor(readonly count: number) {
    super("thread_memory_full");
  }
}

export class MemoryTooLong extends Error {
  constructor(readonly maxChars: number) {
    super("too_long");
  }
}

// Selected plainly rather than aliased through a shared const: Kysely unwraps
// `ColumnType` on the way out of a select, and does not when the columns come
// from an aliased `as const` tuple, which turns every timestamp into something
// that is not a Date.
const COLUMNS = [
  "memories.id",
  "memories.text",
  "memories.origin",
  "memories.account_id",
  "memories.muted_at",
  "memories.created_at",
  "memories.updated_at",
] as const;

/** Is the memory's author still an accepted member of its thread?
 *
 *  Selected alongside every read, in the same statement, so a permission
 *  decision never costs a second round trip and never reads a membership from
 *  a different moment than the row it decides about. */
const authorIsMember = (eb: ExpressionBuilder<Database, "memories">) =>
  eb
    .exists(
      eb
        .selectFrom("thread_members as author_member")
        .select("author_member.id")
        .whereRef("author_member.thread_id", "=", "memories.subject_id")
        .whereRef("author_member.account_id", "=", "memories.account_id")
        .where("author_member.state", "=", "accepted"),
    )
    .as("authorIsMember");

/** `Selectable` rather than a hand-written shape, because it is what unwraps
 *  `ColumnType` into the type a select actually returns. Written by hand, every
 *  timestamp comes back as something that is not a Date. */
type Row = Pick<
  Selectable<MemoriesTable>,
  "id" | "text" | "origin" | "account_id" | "muted_at" | "created_at" | "updated_at"
>;

function toMemory(row: Row & { authorIsMember?: boolean | number }): Memory {
  return {
    id: row.id,
    text: row.text,
    origin: row.origin,
    authorId: row.account_id,
    authorIsMember: Boolean(row.authorIsMember),
    muted: row.muted_at !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every memory on a thread this account can reach.
 *
 *  Membership, never `account_id`: filtering reads by author would hide a
 *  memory every member of a shared thread is supposed to see, and the instinct
 *  on discovering that is to loosen the filter rather than narrow it. Same
 *  mistake 001 names for content, same fix. */
export async function readableMemories(
  accountId: string,
  threadId: string,
  trx: Executor = db,
): Promise<Memory[]> {
  const rows = await trx
    .selectFrom("memories")
    .innerJoin("thread_members", "thread_members.thread_id", "memories.subject_id")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("memories.scope", "=", "thread")
    .where("memories.subject_id", "=", threadId)
    .where("memories.deleted_at", "is", null)
    .where("memories.superseded_at", "is", null)
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted")
    .orderBy("memories.created_at", "asc")
    .execute();
  return rows.map(toMemory);
}

/** One memory by id, resolved to authorization in a SINGLE query.
 *
 *  The obvious implementation reads the row and then checks membership on its
 *  `subject_id`. That is a memory-id oracle: a nonexistent id runs one query
 *  and an unreachable one runs two, so the two are distinguishable by timing
 *  and the single-refusal promise is false. One join, one answer.
 */
export async function readableMemory(
  accountId: string,
  memoryId: string,
  trx: Executor = db,
  /** Reach inside the eight second delete window. On for exactly one caller,
   *  restore, which has to find the thing it is undoing. */
  includeDeleted = false,
): Promise<(Memory & { threadId: string }) | null> {
  let query = trx
    .selectFrom("memories")
    .innerJoin("thread_members", "thread_members.thread_id", "memories.subject_id")
    .select((eb) => [...COLUMNS, "memories.subject_id", authorIsMember(eb)])
    .where("memories.id", "=", memoryId)
    .where("memories.scope", "=", "thread")
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted");

  if (!includeDeleted) query = query.where("memories.deleted_at", "is", null);

  const row = await query.executeTakeFirst();
  if (!row || row.subject_id === null) return null;
  return { ...toMemory(row), threadId: row.subject_id };
}

/** Read access to a memory, or the one refusal. */
export async function requireReadableMemory(
  accountId: string,
  memoryId: string,
  trx: Executor = db,
  includeDeleted = false,
): Promise<Memory & { threadId: string }> {
  const row = await readableMemory(accountId, memoryId, trx, includeDeleted);
  if (!row) throw new NotYours();
  return row;
}

/** Delete access. Membership first, then authorship, so somebody outside the
 *  thread and somebody inside it who did not write the memory get the same
 *  answer. OFF-3: a member can never delete what they did not author.
 *
 *  With the one exception `access.ts` documents: a memory whose author is gone
 *  from the thread belongs to whoever is still in it. A rule nobody owns,
 *  still steering the model, that no member could remove was the alternative. */
export async function requireMemoryAuthor(
  accountId: string,
  memoryId: string,
  trx: Executor = db,
  includeDeleted = false,
): Promise<Memory & { threadId: string }> {
  const row = await requireReadableMemory(accountId, memoryId, trx, includeDeleted);
  if (row.authorId !== accountId && row.authorId !== null && row.authorIsMember) {
    throw new NotYours();
  }
  return row;
}

/** How many count against the cap.
 *
 *  Soft-deleted rows do not, or "delete one, add another" fails for eight
 *  seconds and the person is told the thread is full while looking at nine.
 *  Muted ones do, or muting becomes a way to hold eleven. */
async function activeCount(threadId: string, trx: Executor): Promise<number> {
  const row = await trx
    .selectFrom("memories")
    .select(({ fn }) => fn.countAll<string>().as("n"))
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

export interface AddMemory {
  threadId: string;
  accountId: string;
  text: string;
  origin: "stated" | "learned";
  fromMessageId?: string | null;
  /** Any source of this rule was written by somebody else.
   *
   *  **012 is the first feature that can set this**, and until it did the
   *  column was written `false` at every call site and read by nothing. A
   *  memory carries it if **any** untrusted source contributed: there is no
   *  partial taint, because a rule drawn from a stranger's event and the
   *  person's own words is still a rule a stranger had a hand in.
   *
   *  What it changes is how the rule reaches a prompt. A trusted memory is a
   *  standing instruction the model follows; this one is reference it may read
   *  and cite and must not obey. Without that split the flag is decoration and
   *  the two-hop path 001 wrote it for stays open: connector content,
   *  summarised into a memory, injected later as trusted background. */
  derivedFromUntrusted?: boolean;
}

/** Add one, under the cap.
 *
 *  Caller has already established membership. This owns the transaction, so
 *  the lock actually holds: `select ... for update` on the thread row
 *  serialises concurrent adds, and without it two at nine both count nine and
 *  the thread ends up with eleven.
 *
 *  Returns the existing memory when the text is already there, creating
 *  nothing. A model asked twice about the same thread writes the same sentence
 *  twice, and that is a no-op rather than an error.
 */
export async function addMemory(
  { threadId, accountId, text, origin, fromMessageId = null, derivedFromUntrusted = false }: AddMemory,
  trx: Executor = db,
): Promise<Memory> {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new MemoryTooLong(MEMORY_TEXT_CHARS);
  if (trimmed.length > MEMORY_TEXT_CHARS) throw new MemoryTooLong(MEMORY_TEXT_CHARS);

  // Serialise adds on this thread. On `threads` rather than `memories`,
  // because the row that would conflict is the one that does not exist yet.
  await sql`select id from threads where id = ${threadId} for update`.execute(trx);

  const existing = await trx
    .selectFrom("memories")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where(sql`lower(memories.text)`, "=", trimmed.toLowerCase())
    .executeTakeFirst();
  if (existing) return toMemory(existing);

  if ((await activeCount(threadId, trx)) >= MAX_MEMORIES_PER_THREAD) {
    throw new MemoryLimit(MAX_MEMORIES_PER_THREAD);
  }

  // `on conflict do nothing` plus a select, never a caught 23505. The error's
  // detail carries the conflicting value, which is memory text, which is
  // dumped text, which is not allowed in a log (OFF-1).
  const inserted = await trx
    .insertInto("memories")
    .values({
      account_id: accountId,
      scope: "thread",
      subject_id: threadId,
      kind: "preference",
      text: trimmed,
      origin,
      derived_from_untrusted: derivedFromUntrusted,
      derived_from_message_id: fromMessageId,
    })
    .onConflict((oc) => oc.doNothing())
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirst();

  if (inserted) return toMemory(inserted);

  const raced = await trx
    .selectFrom("memories")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where(sql`lower(memories.text)`, "=", trimmed.toLowerCase())
    .executeTakeFirstOrThrow();
  return toMemory(raced);
}

export interface EditMemory {
  memoryId: string;
  accountId: string;
  text: string;
  /** True when offload is editing rather than a person. Corrections beat
   *  inference, so this is refused against anything a person has stated. */
  byModel?: boolean;
}

/** Edit the full text. Any member, never the shortened form the chip shows.
 *
 *  `account_id` is not touched. A memory belongs to whoever put it there, and
 *  John editing Ana's rule does not make it John's. */
export async function editMemory(
  { memoryId, accountId, text, byModel = false }: EditMemory,
  trx: Executor = db,
): Promise<{ memory: Memory; previous: string } | null> {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new MemoryTooLong(MEMORY_TEXT_CHARS);
  if (trimmed.length > MEMORY_TEXT_CHARS) throw new MemoryTooLong(MEMORY_TEXT_CHARS);

  const current = await requireReadableMemory(accountId, memoryId, trx);

  // Corrections beat inference. offload may rewrite what it worked out, and
  // never what somebody said.
  if (byModel && current.origin === "stated") throw new NotYours();

  // Read before write. `RETURNING` on an UPDATE gives the new value, which is
  // how the rename endpoint once reported the new name as the previous one.
  const previous = current.text;
  if (previous === trimmed) return { memory: current, previous };

  const clash = await trx
    .selectFrom("memories")
    .select("id")
    .where("scope", "=", "thread")
    .where("subject_id", "=", current.threadId)
    .where("deleted_at", "is", null)
    .where("id", "!=", memoryId)
    .where(sql`lower(memories.text)`, "=", trimmed.toLowerCase())
    .executeTakeFirst();
  // Not silently merged into the existing row: that would destroy one memory
  // to satisfy an edit of another.
  if (clash) return null;

  const row = await trx
    .updateTable("memories")
    .set({
      text: trimmed,
      origin: byModel ? "learned" : "stated",
      updated_at: sql`now()`,
    })
    .where("id", "=", memoryId)
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirstOrThrow();

  return { memory: toMemory(row), previous };
}

/** Delete, for the author only.
 *
 *  Soft, with `purge_after` eight seconds out, so Undo has something to find
 *  and the purge job does the destroying. Idempotent: deleting twice removes
 *  nothing extra and raises nothing. */
export async function deleteMemory(
  memoryId: string,
  accountId: string,
  trx: Executor = db,
): Promise<boolean> {
  // `includeDeleted`, so a second delete returns false instead of raising a
  // refusal at the person who already deleted it. 005 found the same bug on
  // content, and the shape is identical: an authorization check that cannot
  // see a soft-deleted row turns idempotence into an error.
  await requireMemoryAuthor(accountId, memoryId, trx, true);

  const row = await trx
    .updateTable("memories")
    .set({
      deleted_at: sql`now()`,
      purge_after: sql`now() + interval '8 seconds'`,
      updated_at: sql`now()`,
    })
    .where("id", "=", memoryId)
    .where("deleted_at", "is", null)
    .returning("id")
    .executeTakeFirst();
  return row !== undefined;
}

/** Undo the delete.
 *
 *  Re-checks the cap, which is the one path that could otherwise exceed it: at
 *  ten, delete one, add another, then press Undo. Without this the thread holds
 *  eleven through the only door the cap does not watch. */
export async function restoreMemory(
  memoryId: string,
  accountId: string,
  trx: Executor = db,
): Promise<Memory> {
  const current = await requireMemoryAuthor(accountId, memoryId, trx, true);

  await sql`select id from threads where id = ${current.threadId} for update`.execute(trx);
  if ((await activeCount(current.threadId, trx)) >= MAX_MEMORIES_PER_THREAD) {
    throw new MemoryLimit(MAX_MEMORIES_PER_THREAD);
  }

  const row = await trx
    .updateTable("memories")
    .set({ deleted_at: null, purge_after: null, updated_at: sql`now()` })
    .where("id", "=", memoryId)
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirstOrThrow();
  return toMemory(row);
}

/** Mute, or unmute. Any member, thread-wide, reversible.
 *
 *  The co-owned action, standing in for what `archived_at` does on content: it
 *  stops a memory reaching the model without letting one member destroy what
 *  another wrote. It is also the only thing a person can reach for when
 *  somebody else's rule is steering their turns badly, since offload never
 *  diagnoses itself and nothing else will point at the cause. */
export async function setMuted(
  memoryId: string,
  accountId: string,
  muted: boolean,
  trx: Executor = db,
): Promise<Memory> {
  await requireReadableMemory(accountId, memoryId, trx);

  const row = await trx
    .updateTable("memories")
    .set({ muted_at: muted ? sql`now()` : null, updated_at: sql`now()` })
    .where("id", "=", memoryId)
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirstOrThrow();
  return toMemory(row);
}

/** What a turn hands the model for one thread.
 *
 *  Unmuted only, and text only: the model needs the rules, not who wrote them
 *  or when. Bounded by MAX_MEMORIES_PER_THREAD times MEMORY_TEXT_CHARS, which
 *  is a constant, which is the whole of what OFF-8 asks for. */
export async function memoriesForPrompt(
  threadId: string,
  trx: Executor = db,
): Promise<{ rules: string[]; fromApps: string[] }> {
  const rows = await trx
    .selectFrom("memories")
    .select(["text", "derived_from_untrusted"])
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .where("muted_at", "is", null)
    .orderBy("created_at", "asc")
    .limit(MAX_MEMORIES_PER_THREAD)
    .execute();

  // **Two lists, and the split is the whole point of the column.**
  //
  // The prompt tells the model to read a thread's rules and do what they say.
  // That is right for a rule somebody typed and wrong for one derived from an
  // event a stranger put on their calendar, which is text an attacker controls
  // arriving as a standing instruction. Until 012 nothing ever set the flag, so
  // the two lists were one list and the distinction cost nothing to ignore.
  //
  // The second list is still handed over: it is useful context and hiding it
  // would make offload worse at the thing memories are for. It is handed over
  // as something to read rather than something to obey, and the prompt says so.
  return {
    rules: rows.filter((r) => !r.derived_from_untrusted).map((r) => r.text),
    fromApps: rows.filter((r) => r.derived_from_untrusted).map((r) => r.text),
  };
}

/** Thread deletion has to take its memories with it.
 *
 *  `subject_id` is polymorphic, so it carries no foreign key, so nothing
 *  cascades and nothing will do this unless it is called. */
export async function deleteMemoriesForThread(
  threadId: string,
  trx: Executor,
): Promise<void> {
  await trx
    .deleteFrom("memories")
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .execute();
}
