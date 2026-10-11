// Notes: the sentences a thread holds about itself.
//
// One concept where 014 found two. A note is what a dump becomes when it is not
// a task, an event, a link or a file, and it is also the standing rule 008
// called a memory. Both were a sentence somebody wrote about a thread, and
// keeping them apart meant the model never learned where you were staying
// while faithfully learning that you like three-word titles.
//
// Four things in here are easy to get wrong and each one is a real defect
// rather than a style preference:
//
//   1. Reads resolve through membership; delete resolves through authorship.
//      Both, in one query, so a missing row and an unreachable one are the same
//      answer on the same path.
//   2. **Nothing is refused for being one too many.** The hundred is a prompt
//      budget applied at assembly, not a wall on the way in. 008's cap, and the
//      row lock that enforced it, are gone rather than raised.
//   3. A duplicate takes `on conflict do nothing`, never a caught unique
//      violation, because Postgres puts the conflicting value in the error and
//      note text is not allowed anywhere near a log (OFF-1).
//   4. The duplicate rule applies to offload and not to a person. A model asked
//      twice writes the same sentence twice; a person who dumps the same
//      sentence twice meant it, and a dump that silently does not appear is the
//      one thing this product may never do.

import { noteWordsSet } from "../notifications/labels.js";
import { sql, type ExpressionBuilder, type Selectable } from "kysely";
import { db } from "../db.js";
import type { Database, NotesTable } from "../schema.js";
import { NotYours, type Executor } from "./access.js";
import { holdFloor } from "../loose/suggestions.js";
import { restoreSourceOfRow, takeSourceOfRow } from "./takes.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";

/** How many of a thread's notes reach a prompt.
 *
 *  **Not a cap on the thread.** A thread holds as many as somebody dumps; this
 *  is how many of them the model is handed, newest first, and the daily job is
 *  what keeps the newest hundred saying everything worth saying. */
export const NOTE_PROMPT_BUDGET = 100;

/** And across one turn, however many threads it touches.
 *
 *  Without it the worst case is the budget times `MAX_TOOL_CALLS`, which is
 *  thirty distinct threads at a hundred notes each: a number that describes no
 *  real turn and costs real money if one ever happens. **This is the bound that
 *  holds the prompt still when the filing bound moves**, which it did on
 *  2026-09-11, from eight to thirty. */
export const NOTE_TURN_BUDGET = 200;

/** Long enough for a sentence, short enough that the prompt contribution stays
 *  a constant anyone can multiply out. The only column that reaches a model. */
export const NOTE_TEXT_CHARS = 200;

/** And the rest of the words, which reach nothing. */
export const NOTE_BODY_CHARS = 4000;

/** How often a note comes round. The words `cadenceLabel` already says. */

export interface Note {
  id: string;
  text: string;
  /** What was dumped, when it did not fit in `text`. Never in a prompt. */
  body: string | null;
  origin: "stated" | "learned";
  /** Null once the author deleted their account. The note stays; the name
   *  comes off it. */
  authorId: string | null;
  /** Whether the author is still in the thread. False once they deleted their
   *  account or left, at which point every member may delete it: nobody is
   *  left for OFF-3's author rule to protect. */
  authorIsMember: boolean;
  muted: boolean;
  occursAt: Date | null;
  occursEndAt: Date | null;
  dueAt: Date | null;
  placeId: string | null;
  /** Where it sits in the section. 0 to 100, higher first, then oldest first.
   *  Written by a person dragging the row and by nothing else. */
  priority: number;
  /** The date carries no time, so nothing may draw one. */
  allDay: boolean;
  /** That it repeats, as the rule rather than as occurrences. 023: an RFC
   *  5545 rule in the closed grammar, the server's own serialisation. */
  rrule: string | null;
  /** Set aside by the daily job. Off the prompt, off the section, still here. */
  supersededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** The same value as `updatedAt`, named for what it means to a reader: when
   *  somebody last wrote this sentence. It is what precedence turns on, so it
   *  is worth a name that says so. */
  writtenAt: Date;
}

export class NoteTooLong extends Error {
  constructor(readonly maxChars: number) {
    super("too_long");
  }
}

// Selected plainly rather than aliased through a shared const: Kysely unwraps
// `ColumnType` on the way out of a select, and does not when the columns come
// from an aliased `as const` tuple, which turns every timestamp into something
// that is not a Date.
const COLUMNS = [
  "notes.id",
  "notes.text",
  "notes.body",
  "notes.origin",
  "notes.account_id",
  "notes.muted_at",
  "notes.occurs_at",
  "notes.occurs_end_at",
  "notes.due_at",
  "notes.place_id",
  "notes.priority",
  "notes.rrule",
  "notes.attrs",
  "notes.superseded_at",
  "notes.created_at",
  "notes.updated_at",
] as const;

/** Is the note's author still an accepted member of its thread?
 *
 *  Selected alongside every read, in the same statement, so a permission
 *  decision never costs a second round trip and never reads a membership from
 *  a different moment than the row it decides about. */
const authorIsMember = (eb: ExpressionBuilder<Database, "notes">) =>
  eb
    .exists(
      eb
        .selectFrom("thread_members as author_member")
        .select("author_member.id")
        .whereRef("author_member.thread_id", "=", "notes.subject_id")
        .whereRef("author_member.account_id", "=", "notes.account_id")
        .where("author_member.state", "=", "accepted"),
    )
    .as("authorIsMember");

/** `Selectable` rather than a hand-written shape, because it is what unwraps
 *  `ColumnType` into the type a select actually returns. Written by hand, every
 *  timestamp comes back as something that is not a Date. */
type Row = Pick<
  Selectable<NotesTable>,
  | "id"
  | "text"
  | "body"
  | "origin"
  | "account_id"
  | "muted_at"
  | "occurs_at"
  | "occurs_end_at"
  | "due_at"
  | "place_id"
  | "priority"
  | "rrule"
  | "attrs"
  | "superseded_at"
  | "created_at"
  | "updated_at"
>;

function toNote(row: Row & { authorIsMember?: boolean | number }): Note {
  return {
    id: row.id,
    text: row.text,
    body: row.body,
    // `answered` is a memory's (038) and the table refuses it at thread scope.
    origin: row.origin === "learned" ? "learned" : "stated",
    authorId: row.account_id,
    authorIsMember: Boolean(row.authorIsMember),
    muted: row.muted_at !== null,
    occursAt: row.occurs_at,
    occursEndAt: row.occurs_end_at,
    dueAt: row.due_at,
    placeId: row.place_id,
    priority: row.priority,
    rrule: row.rrule,
    allDay:
      typeof row.attrs === "object" &&
      row.attrs !== null &&
      (row.attrs as Record<string, unknown>)["all_day"] === true,
    supersededAt: row.superseded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    writtenAt: row.updated_at,
  };
}

/** Every active note on a thread this account can reach.
 *
 *  Membership, never `account_id`: filtering reads by author would hide a note
 *  every member of a shared thread is supposed to see, and the instinct on
 *  discovering that is to loosen the filter rather than narrow it. Same
 *  mistake 001 names for content, same fix. */
export async function readableNotes(
  accountId: string,
  threadId: string,
  trx: Executor = db,
): Promise<Note[]> {
  const rows = await trx
    // `readable_notes` from 0033, aliased so nothing below has to move. The
    // scope and membership rules are the view's; lifecycle stays here.
    .selectFrom("readable_notes as notes")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("notes.subject_id", "=", threadId)
    .where("notes.deleted_at", "is", null)
    .where("notes.superseded_at", "is", null)
    .where("notes.viewer_account_id", "=", accountId)
    // Where a person put it, then the order it was written in. Every note
    // starts at the same priority, so a section nobody has rearranged reads
    // oldest first, which is what it always did.
    .orderBy("notes.priority", "desc")
    .orderBy("notes.created_at", "asc")
    .execute();
  return rows.map(toNote);
}

/** 028. A thread's current notes, newest first, a page at a time.
 *
 *  By id rather than by when it was written, so an edit never moves a note:
 *  ids are UUIDv7, the same order content's ids run in, which is what lets the
 *  loose list merge the two tables on one cursor. */
export async function notesNewestFirst(
  accountId: string,
  threadId: string,
  opts: { before?: string | undefined; limit: number; ids?: string[] | undefined },
  trx: Executor = db,
): Promise<Note[]> {
  if (opts.ids && opts.ids.length === 0) return [];
  let query = trx
    .selectFrom("readable_notes as notes")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("notes.subject_id", "=", threadId)
    .where("notes.scope", "=", "thread")
    .where("notes.deleted_at", "is", null)
    .where("notes.superseded_at", "is", null)
    .where("notes.viewer_account_id", "=", accountId)
    .orderBy("notes.id", "desc")
    .limit(opts.limit);
  if (opts.before) query = query.where("notes.id", "<", opts.before);
  if (opts.ids) query = query.where("notes.id", "in", opts.ids);
  return (await query.execute()).map(toNote);
}

/** Move a note within its section.
 *
 *  Any member, like every other arrangement of a shared thread. The number
 *  comes from the client, which knows the neighbours the row was dropped
 *  between; the server keeps it on the scale and keeps `updated_at` out of it,
 *  because precedence is when a note was last written and a note dragged to
 *  the top has not been written again. Returns what it was, so Undo is the
 *  same call with the old number. */
export async function reprioritiseNote(
  accountId: string,
  noteId: string,
  priority: number,
  trx: Executor = db,
): Promise<{ note: Note; previous: { priority: number } }> {
  const current = await requireReadableNote(accountId, noteId, trx);
  const row = await trx
    .updateTable("notes")
    .set({ priority })
    .where("id", "=", noteId)
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirstOrThrow();
  return { note: toNote(row), previous: { priority: current.priority } };
}

/** What the daily job folded, newest first.
 *
 *  Cursor-paginated, because it is the one list here with no ceiling: active
 *  notes are bounded by the budget and what was folded accumulates. History is
 *  read rather than worked with, so there is no restore and no edit. */
export async function foldedNotes(
  accountId: string,
  threadId: string,
  before: Date | null,
  limit: number,
  trx: Executor = db,
): Promise<Note[]> {
  let query = trx
    .selectFrom("readable_notes as notes")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("notes.subject_id", "=", threadId)
    .where("notes.deleted_at", "is", null)
    .where("notes.superseded_at", "is not", null)
    .where("notes.viewer_account_id", "=", accountId)
    .orderBy("notes.superseded_at", "desc")
    .limit(limit);

  if (before) query = query.where("notes.superseded_at", "<", before);

  return (await query.execute()).map(toNote);
}

/** How many are on the thread, active and folded.
 *
 *  Two counts rather than a column: both run behind partial indexes over a few
 *  hundred rows at worst, and a denormalised count is a second thing to keep
 *  honest through a job that rewrites the set. */
export async function noteCounts(
  accountId: string,
  threadId: string,
  trx: Executor = db,
): Promise<{ active: number; folded: number }> {
  const row = await trx
    .selectFrom("readable_notes as notes")
    .select(({ fn, eb }) => [
      fn
        .count<string>(sql`case when notes.superseded_at is null then 1 end`)
        .as("active"),
      fn
        .count<string>(sql`case when notes.superseded_at is not null then 1 end`)
        .as("folded"),
      eb.val(1).as("one"),
    ])
    .where("notes.subject_id", "=", threadId)
    .where("notes.deleted_at", "is", null)
    .where("notes.viewer_account_id", "=", accountId)
    .executeTakeFirstOrThrow();
  return { active: Number(row.active), folded: Number(row.folded) };
}

/** One note by id, resolved to authorization in a SINGLE query.
 *
 *  The obvious implementation reads the row and then checks membership on its
 *  `subject_id`. That is a note-id oracle: a nonexistent id runs one query and
 *  an unreachable one runs two, so the two are distinguishable by timing and
 *  the single-refusal promise is false. One join, one answer.
 */
export async function readableNote(
  accountId: string,
  noteId: string,
  trx: Executor = db,
  /** Reach inside the eight second delete window. On for exactly one caller,
   *  restore, which has to find the thing it is undoing. */
  includeDeleted = false,
): Promise<(Note & { threadId: string }) | null> {
  let query = trx
    .selectFrom("readable_notes as notes")
    .select((eb) => [...COLUMNS, "notes.subject_id", authorIsMember(eb)])
    .where("notes.id", "=", noteId)
    .where("notes.viewer_account_id", "=", accountId);

  if (!includeDeleted) query = query.where("notes.deleted_at", "is", null);

  const row = await query.executeTakeFirst();
  if (!row || row.subject_id === null) return null;
  return { ...toNote(row), threadId: row.subject_id };
}

/** Read access to a note, or the one refusal. */
export async function requireReadableNote(
  accountId: string,
  noteId: string,
  trx: Executor = db,
  includeDeleted = false,
): Promise<Note & { threadId: string }> {
  const row = await readableNote(accountId, noteId, trx, includeDeleted);
  if (!row) throw new NotYours();
  return row;
}

/** Delete access. Membership first, then authorship, so somebody outside the
 *  thread and somebody inside it who did not write the note get the same
 *  answer. OFF-3: a member can never delete what they did not author.
 *
 *  With the one exception `access.ts` documents: a note whose author is gone
 *  from the thread belongs to whoever is still in it. A rule nobody owns,
 *  still steering the model, that no member could remove was the alternative. */
export async function requireNoteAuthor(
  accountId: string,
  noteId: string,
  trx: Executor = db,
  includeDeleted = false,
): Promise<Note & { threadId: string }> {
  const row = await requireReadableNote(accountId, noteId, trx, includeDeleted);
  if (row.authorId !== accountId && row.authorId !== null && row.authorIsMember) {
    throw new NotYours();
  }
  return row;
}

export interface AddNote {
  threadId: string;
  accountId: string;
  text: string;
  /** The rest of the words, when the dump did not fit in `text`. */
  body?: string | null;
  origin: "stated" | "learned";
  occursAt?: Date | null;
  occursEndAt?: Date | null;
  dueAt?: Date | null;
  placeId?: string | null;
  /** That it repeats. A rule needs a first occurrence, which the database
   *  enforces: a repeat with no `occursAt` is a rule about nothing. */
  rrule?: string | null;
  /** The date had no time in it, so nothing may draw one. Same meaning as
   *  012's all-day calendar event, in the same column. */
  allDay?: boolean;
  fromMessageId?: string | null;
  /** The model's tool_use block id, when a model wrote this. */
  toolCallId?: string | null;
  /** Any source of this note was written by somebody else.
   *
   *  **012 is the first feature that set this**, and until it did the column
   *  was written `false` at every call site and read by nothing. A note carries
   *  it if **any** untrusted source contributed: there is no partial taint,
   *  because a note drawn from a stranger's event and the person's own words is
   *  still a note a stranger had a hand in.
   *
   *  What it changes is how the note reaches a prompt. A trusted note is read
   *  as what is true about the thread and, when it states a rule, followed;
   *  this one is reference the model may read and cite and must not obey.
   *  Without that split the flag is decoration and the two-hop path 001 wrote
   *  it for stays open: connector content, summarised into a note, injected
   *  later as trusted background. */
  derivedFromUntrusted?: boolean;
}

/** Add one. It always lands.
 *
 *  Caller has already established membership. **There is no cap and no lock.**
 *  008 took `select ... for update` on the thread because ten was a wall and a
 *  plain count is check-then-act; with the wall gone the lock serialises
 *  nothing, and a lock that guards no invariant is worse than no lock, which is
 *  what the staff-linking guard already taught this repo.
 *
 *  Returns the existing note when offload writes text it has already written,
 *  creating nothing. A person gets a second note: they dumped it twice and they
 *  meant it.
 */
export async function addNote(
  {
    threadId,
    accountId,
    text,
    body = null,
    origin,
    occursAt = null,
    occursEndAt = null,
    dueAt = null,
    placeId = null,
    rrule = null,
    allDay = false,
    fromMessageId = null,
    toolCallId = null,
    derivedFromUntrusted = false,
  }: AddNote,
  trx: Executor = db,
): Promise<Note> {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new NoteTooLong(NOTE_TEXT_CHARS);
  if (trimmed.length > NOTE_TEXT_CHARS) throw new NoteTooLong(NOTE_TEXT_CHARS);

  const keptBody = body === null ? null : body.trim() || null;
  if (keptBody !== null && keptBody.length > NOTE_BODY_CHARS) {
    throw new NoteTooLong(NOTE_BODY_CHARS);
  }

  if (origin === "learned") {
    const existing = await trx
      .selectFrom("notes")
      .select((eb) => [...COLUMNS, authorIsMember(eb)])
      .where("scope", "=", "thread")
      .where("subject_id", "=", threadId)
      .where("deleted_at", "is", null)
      .where("origin", "=", "learned")
      .where(sql`lower(notes.text)`, "=", trimmed.toLowerCase())
      .executeTakeFirst();
    if (existing) return toNote(existing);
  }

  // `on conflict do nothing` plus a select, never a caught 23505. The error's
  // detail carries the conflicting value, which is note text, which is dumped
  // text, which is not allowed in a log (OFF-1).
  const inserted = await trx
    .insertInto("notes")
    .values({
      account_id: accountId,
      scope: "thread",
      subject_id: threadId,
      kind: "preference",
      text: trimmed,
      body: keptBody,
      origin,
      occurs_at: occursAt,
      occurs_end_at: occursEndAt,
      due_at: dueAt,
      place_id: placeId,
      // A rule about nothing is refused by the database; this keeps the two
      // columns consistent on the way in rather than relying on that.
      rrule: occursAt ? rrule : null,
      derived_from_untrusted: derivedFromUntrusted,
      derived_from_message_id: fromMessageId,
      tool_call_id: toolCallId,
      ...(allDay ? { attrs: { all_day: true } } : {}),
    })
    .onConflict((oc) => oc.doNothing())
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirst();

  if (inserted) return toNote(inserted);

  // Only reachable for a `learned` note, since the unique index covers nothing
  // else: two of offload's own writes raced on the same sentence.
  const raced = await trx
    .selectFrom("notes")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where("origin", "=", "learned")
    .where(sql`lower(notes.text)`, "=", trimmed.toLowerCase())
    .executeTakeFirstOrThrow();
  return toNote(raced);
}

export interface EditNote {
  noteId: string;
  accountId: string;
  text: string;
  /** Absent leaves the body alone; null clears it. */
  body?: string | null;
  /** True when offload is editing rather than a person. Corrections beat
   *  inference, so this is refused against anything a person has stated. */
  byModel?: boolean;
}

/** Edit the text, and the body with it. Its author alone, on the terms delete
 *  has: what somebody typed is theirs, and overwriting it destroys it as
 *  surely as deleting it would. A note whose author has gone from the thread
 *  is whoever is left's to correct.
 *
 *  offload's own edit is held by the rule below instead, and reaches any note
 *  it wrote in the thread.
 *
 *  `account_id` is not touched: an edit never moves a note to its editor. */
export async function editNote(
  { noteId, accountId, text, body, byModel = false }: EditNote,
  trx: Executor = db,
): Promise<{ note: Note; previous: string } | null> {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new NoteTooLong(NOTE_TEXT_CHARS);
  if (trimmed.length > NOTE_TEXT_CHARS) throw new NoteTooLong(NOTE_TEXT_CHARS);
  if (body !== undefined && body !== null && body.length > NOTE_BODY_CHARS) {
    throw new NoteTooLong(NOTE_BODY_CHARS);
  }

  const current = byModel ? await requireReadableNote(accountId, noteId, trx) : await requireNoteAuthor(accountId, noteId, trx);

  // Corrections beat inference. offload may rewrite what it worked out, and
  // never what somebody said.
  if (byModel && current.origin === "stated") throw new NotYours();

  // Read before write. `RETURNING` on an UPDATE gives the new value, which is
  // how the rename endpoint once reported the new name as the previous one.
  const previous = current.text;

  // A person's edit can never clash: the unique index covers offload's own
  // notes only. offload's can, and merging into the existing row would destroy
  // one note to satisfy an edit of another.
  if (byModel && previous !== trimmed) {
    const clash = await trx
      .selectFrom("notes")
      .select("id")
      .where("scope", "=", "thread")
      .where("subject_id", "=", current.threadId)
      .where("deleted_at", "is", null)
      .where("origin", "=", "learned")
      .where("id", "!=", noteId)
      .where(sql`lower(notes.text)`, "=", trimmed.toLowerCase())
      .executeTakeFirst();
    if (clash) return null;
  }

  const row = await trx
    .updateTable("notes")
    .set({
      text: trimmed,
      ...(body === undefined ? {} : { body: body === null ? null : body.trim() || null }),
      origin: byModel ? "learned" : "stated",
      updated_at: sql`now()`,
    })
    .where("id", "=", noteId)
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirstOrThrow();

  // 042. Another member's turn rewrote words a reminder says: it waits.
  if (byModel) await noteWordsSet(trx, { noteId, actorId: accountId });
  return { note: toNote(row), previous };
}

/** 028. The destination already holds these words as a note offload wrote,
 *  which `notes_thread_text` would refuse with the words in the error. */
export class NoteDuplicate extends Error {
  constructor() {
    super("duplicate");
  }
}

/** 028. Move a note to another thread, the way a row moves: by its author, or
 *  by anybody still in the thread once the author has left (OFF-3), into a
 *  thread the caller is in. One refusal for every reason.
 *
 *  Only `subject_id` changes. The origin, the untrusted mark and when it was
 *  put down travel with it, so a note from an email stays reference wherever
 *  it lands and an edit never reorders anything. Its label joins stay where
 *  they are: a label belongs to a thread and every read filters on that, so
 *  they are unseen in the new thread and seen again if it comes back, which
 *  is what Undo needs and destroys nothing. */
export async function moveNoteIn(
  trx: Executor,
  accountId: string,
  noteId: string,
  destination: string,
): Promise<{ note: Note; previous: { threadId: string } }> {
  const current = await requireNoteAuthor(accountId, noteId, trx);
  const scoped = await trx.selectFrom("notes").select(["scope", "origin", "text"]).where("id", "=", noteId).executeTakeFirstOrThrow();
  if (scoped.scope !== "thread") throw new NotYours();
  const member = await trx
    .selectFrom("thread_members")
    .innerJoin("threads", "threads.id", "thread_members.thread_id")
    .select("thread_members.id")
    .where("thread_members.thread_id", "=", destination)
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted")
    .where("threads.deleted_at", "is", null)
    .executeTakeFirst();
  if (!member) throw new NotYours();

  if (destination !== current.threadId) {
    if (scoped.origin === "learned") {
      const clash = await trx
        .selectFrom("notes")
        .select("id")
        .where("subject_id", "=", destination)
        .where("scope", "=", "thread")
        .where("deleted_at", "is", null)
        .where("origin", "=", "learned")
        .where(sql`lower(notes.text)`, "=", scoped.text.toLowerCase())
        .executeTakeFirst();
      if (clash) throw new NoteDuplicate();
    }
    await trx.updateTable("notes").set({ subject_id: destination }).where("id", "=", noteId).execute();
    for (const threadId of [current.threadId, destination]) {
      await trx.updateTable("threads").set({ last_activity_at: sql`now()`, updated_at: sql`now()` }).where("id", "=", threadId).execute();
    }
  }

  await holdFloor(trx, { noteId });
  const row = await trx
    .selectFrom("notes")
    .select((eb) => [...COLUMNS, authorIsMember(eb)])
    .where("notes.id", "=", noteId)
    .executeTakeFirstOrThrow();
  return { note: toNote(row), previous: { threadId: current.threadId } };
}

/** Delete, for the author only.
 *
 *  Soft, with `purge_after` eight seconds out, so Undo has something to find
 *  and the purge job does the destroying. Idempotent: deleting twice removes
 *  nothing extra and raises nothing. */
export async function deleteNote(
  noteId: string,
  accountId: string,
  trx: Executor = db,
): Promise<boolean> {
  // `includeDeleted`, so a second delete returns false instead of raising a
  // refusal at the person who already deleted it. 005 found the same bug on
  // content, and the shape is identical: an authorization check that cannot
  // see a soft-deleted row turns idempotence into an error.
  await requireNoteAuthor(accountId, noteId, trx, true);

  const row = await trx
    .updateTable("notes")
    .set({
      deleted_at: sql`now()`,
      purge_after: sql`now() + interval '8 seconds'`,
      updated_at: sql`now()`,
    })
    .where("id", "=", noteId)
    .where("deleted_at", "is", null)
    .returning(["id", "deleted_at", "purge_after", "derived_from_message_id", "scope", "subject_id"])
    .executeTakeFirst();
  if (!row) return false;
  // The owner, 2026-10-05. The message the note came from goes with it, on
  // its clock, once nothing else alive came from that message (takes.ts).
  await takeSourceOfRow(
    trx,
    { messageId: row.derived_from_message_id, threadId: row.scope === "thread" ? row.subject_id : null },
    accountId,
    { deletedAt: row.deleted_at!, purgeAfter: row.purge_after! },
  );
  // 028. A proposal that just lost a note may be below two.
  await holdFloor(trx, { noteId });
  // Asked for by the delete, as a row's delete does, so what went with it
  // leaves once the window has passed rather than at the day's run.
  await enqueue({ kind: "content.purge", accountId, payload: {}, priority: PRIORITY.background, runAfterSeconds: 10, tx: trx });
  return true;
}

/** Undo the delete.
 *
 *  Nothing to re-check: 008 re-checked the cap here because restore was the one
 *  door the cap did not watch, and there is no cap now. */
export async function restoreNote(
  noteId: string,
  accountId: string,
  trx: Executor = db,
): Promise<Note> {
  await requireNoteAuthor(accountId, noteId, trx, true);

  const row = await trx
    .updateTable("notes")
    .set({ deleted_at: null, purge_after: null, updated_at: sql`now()` })
    .where("id", "=", noteId)
    .returning((eb) => [...COLUMNS, authorIsMember(eb), "notes.derived_from_message_id as fromMessageId"])
    .executeTakeFirstOrThrow();
  // And the message it came from, if the delete took it.
  await restoreSourceOfRow(trx, row.fromMessageId);
  return toNote(row);
}

/** Mute, or unmute. Any member, thread-wide, reversible.
 *
 *  The co-owned action, standing in for what `archived_at` does on content: it
 *  stops a note reaching the model without letting one member destroy what
 *  another wrote. It is also the only thing a person can reach for when
 *  somebody else's note is steering their turns badly, since offload never
 *  diagnoses itself and nothing else will point at the cause. */
export async function setMuted(
  noteId: string,
  accountId: string,
  muted: boolean,
  trx: Executor = db,
): Promise<Note> {
  await requireReadableNote(accountId, noteId, trx);

  const row = await trx
    .updateTable("notes")
    .set({ muted_at: muted ? sql`now()` : null, updated_at: sql`now()` })
    .where("id", "=", noteId)
    .returning((eb) => [...COLUMNS, authorIsMember(eb)])
    .executeTakeFirstOrThrow();
  return toNote(row);
}

/** One entry as the model reads it: a sentence and when it was written. */
export interface PromptNote {
  text: string;
  writtenAt: Date;
}

/** What a turn hands the model for one thread.
 *
 *  **Three lists, and the split is the containment.** The prompt tells the
 *  model to act on what a thread's notes say. That is right for what you wrote,
 *  narrower for what somebody else in a shared thread wrote, and wrong for a
 *  sentence derived from an event a stranger put on a calendar. 008 shipped two
 *  lists at ten rule-phrased memories; at a hundred sentences of any kind the
 *  third one is what stops "anybody who can put a sentence on your thread is
 *  writing your assistant's instructions".
 *
 *  Bounded by `NOTE_PROMPT_BUDGET`, taken newest first so what is current
 *  survives the budget, then handed over oldest first so the model reads them
 *  in the order they were written and the newer of two that disagree is the one
 *  it reaches last. */
export async function notesForPrompt(
  threadId: string,
  viewerId: string,
  trx: Executor = db,
): Promise<{ yours: PromptNote[]; members: PromptNote[]; fromApps: PromptNote[] }> {
  const rows = await trx
    .selectFrom("notes")
    .select(["text", "updated_at", "account_id", "derived_from_untrusted"])
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .where("muted_at", "is", null)
    .orderBy("updated_at", "desc")
    .limit(NOTE_PROMPT_BUDGET)
    .execute();

  const yours: PromptNote[] = [];
  const members: PromptNote[] = [];
  const fromApps: PromptNote[] = [];

  for (const row of [...rows].reverse()) {
    const entry = { text: row.text, writtenAt: row.updated_at };
    if (row.derived_from_untrusted) fromApps.push(entry);
    else if (row.account_id === viewerId) yours.push(entry);
    else members.push(entry);
  }

  return { yours, members, fromApps };
}

/** Thread deletion has to take its notes with it.
 *
 *  `subject_id` is polymorphic, so it carries no foreign key, so nothing
 *  cascades and nothing will do this unless it is called. */
export async function deleteNotesForThread(
  threadId: string,
  trx: Executor,
): Promise<void> {
  await trx
    .deleteFrom("notes")
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .execute();
}

/** What one turn hands the model for one thread, or nothing if it already has.
 *
 *  **A turn carries a thread's notes once.** 008 returned them from every
 *  filing call, which at ten sentences was cheap repetition and at a hundred is
 *  the same hundred sentences eight times in one conversation. Whether this
 *  turn has already been handed them is not stored anywhere: it is derived from
 *  what the turn wrote, since the calls that carry notes are exactly the calls
 *  that leave a row behind pointing at the message.
 *
 *  **Call it before this call's own insert**, or the row it just wrote makes it
 *  look like the notes went out on an earlier call.
 *
 *  The turn ceiling is applied here too. Without it the worst case is the
 *  per-thread budget times `MAX_TOOL_CALLS`, which describes no real turn and
 *  would cost real money the first time one happened.
 */
export async function notesForTurn(
  messageId: string | null,
  threadId: string,
  viewerId: string,
  /** This call's own tool_use id, so a retry of it is not mistaken for an
   *  earlier call that already carried the set. */
  toolCallId: string | null,
  trx: Executor = db,
): Promise<{ yours: PromptNote[]; members: PromptNote[]; fromApps: PromptNote[] } | null> {
  if (!messageId) return notesForPrompt(threadId, viewerId, trx);

  const [filed, noted] = await Promise.all([
    trx
      .selectFrom("content")
      .select("thread_id")
      .distinct()
      .where("derived_from_message_id", "=", messageId)
      .$if(toolCallId !== null, (qb) => qb.where("tool_call_id", "is distinct from", toolCallId))
      .execute(),
    trx
      .selectFrom("notes")
      .select("subject_id")
      .distinct()
      .where("derived_from_message_id", "=", messageId)
      .$if(toolCallId !== null, (qb) => qb.where("tool_call_id", "is distinct from", toolCallId))
      .execute(),
  ]);

  const carried = new Set<string>([
    ...filed.map((row) => row.thread_id),
    ...noted.map((row) => row.subject_id).filter((id): id is string => id !== null),
  ]);

  if (carried.has(threadId)) return null;
  if (carried.size === 0) return notesForPrompt(threadId, viewerId, trx);

  // What the earlier threads already spent. Counted rather than remembered,
  // for the same reason the set above is: nothing stores what a turn has
  // handed over, and a column that did would be a second thing to keep true.
  const spent = await trx
    .selectFrom("notes")
    .select(({ fn }) => fn.countAll<string>().as("n"))
    .where("scope", "=", "thread")
    .where("subject_id", "in", [...carried])
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .where("muted_at", "is", null)
    .executeTakeFirstOrThrow();

  const left = NOTE_TURN_BUDGET - Math.min(Number(spent.n), carried.size * NOTE_PROMPT_BUDGET);
  if (left <= 0) return { yours: [], members: [], fromApps: [] };

  const notes = await notesForPrompt(threadId, viewerId, trx);
  const total = notes.yours.length + notes.members.length + notes.fromApps.length;
  if (total <= left) return notes;

  // Over the ceiling, so the newest survive. Each list is oldest first, so
  // dropping from the front is dropping the oldest.
  const drop = total - left;
  const trim = (list: PromptNote[], take: number): PromptNote[] => list.slice(take);
  let remaining = drop;
  const fromApps = trim(notes.fromApps, Math.min(remaining, notes.fromApps.length));
  remaining -= notes.fromApps.length - fromApps.length;
  const members = trim(notes.members, Math.min(remaining, notes.members.length));
  remaining -= notes.members.length - members.length;
  const yours = trim(notes.yours, Math.min(remaining, notes.yours.length));
  return { yours, members, fromApps };
}

/** One fold, as the daily job proposes it. */
export interface CompactionPlan {
  /** Notes that are no longer what the thread says. Set aside, not destroyed. */
  supersede: string[];
  /** Notes offload wrote and nobody edited, which it may take back. */
  remove: string[];
  /** What the set says now. Each one names what it was folded from, which is
   *  how it inherits an author and how the history says where something went. */
  add: {
    text: string;
    occursAt?: Date | null;
    occursEndAt?: Date | null;
    dueAt?: Date | null;
    foldedFrom: string[];
  }[];
}

export interface CompactionOutcome {
  superseded: number;
  removed: number;
  added: number;
  /** Ids the plan named that this thread does not have, or may not touch.
   *  Counted rather than raised: a model naming a uuid that is not there is not
   *  a validation failure and retrying would not fix it. */
  ignored: number;
}

/** Apply a fold, with every invariant enforced here rather than in the prompt.
 *
 *  **The model proposes and this decides.** Everything below is a rule the
 *  prompt also states, and stating it twice is the point: a prompt is a request
 *  and this is the enforcement, and 004 already settled that the two are not
 *  the same thing.
 *
 *  - A note a person typed or edited is never rewritten and never removed. It
 *    can be set aside, which changes what offload acts on and destroys nothing.
 *  - A note derived from a connected app is not touched at all. Folding it
 *    would mean a model rewriting text a stranger controls and handing back a
 *    sentence that no longer looks like it came from an app.
 *  - A fold never crosses authors. OFF-3 has no answer for a row two people
 *    wrote: either somebody can delete a synthesis of another person's notes,
 *    or it is authorless from birth and everybody can.
 *  - An id this thread does not hold is dropped, not raised.
 */
export async function applyCompaction(
  threadId: string,
  plan: CompactionPlan,
  trx: Executor = db,
  /** 032. The member a nightly pass runs as. Set, the plan may touch only
   *  notes this account wrote: other members' notes reach the pass as context
   *  and are never its to set aside, so one person's dump cannot quiet
   *  another's words. */
  options: { author?: string } = {},
): Promise<CompactionOutcome> {
  const rows = await trx
    .selectFrom("notes")
    .select(["id", "origin", "account_id", "derived_from_untrusted"])
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .execute();

  const held = new Map(rows.map((row) => [row.id, row]));
  let ignored = 0;

  const touchable = (id: string): boolean => {
    const row = held.get(id);
    if (!row || row.derived_from_untrusted || (options.author !== undefined && row.account_id !== options.author)) {
      ignored += 1;
      return false;
    }
    return true;
  };

  // Added first, so a fold that cannot produce its replacement does not set
  // aside the notes it was replacing.
  let added = 0;
  const folded = new Set<string>();
  for (const entry of plan.add) {
    // `touchable` has already counted every source it dropped, so an entry
    // with nothing left is not counted a second time. It was, and one
    // untouchable source reported two ignored.
    const sources = entry.foldedFrom.filter(touchable);
    if (sources.length === 0) continue;
    const authors = new Set(sources.map((id) => held.get(id)?.account_id ?? null));
    if (authors.size > 1) {
      ignored += 1;
      continue;
    }
    const author = [...authors][0];
    // Nobody left to own it. The notes it would fold belong to somebody who
    // deleted their account, and a new row with no author is one anybody in
    // the thread could delete, which is not what OFF-3 means by authorship.
    if (!author) {
      ignored += 1;
      continue;
    }

    const fresh = await addNote(
      {
        threadId,
        accountId: author,
        text: entry.text,
        origin: "learned",
        occursAt: entry.occursAt ?? null,
        occursEndAt: entry.occursEndAt ?? null,
        dueAt: entry.dueAt ?? null,
      },
      trx,
    );
    // 025. A fold never quietly unlabels anything: the new note carries every
    // live label the folded ones did, a person's as a person's.
    await sql`
      insert into note_labels (note_id, label_id, set_by)
      select ${fresh.id}, nl.label_id,
             case when bool_or(nl.set_by = 'person') then 'person' else 'offload' end
        from note_labels nl join labels l on l.id = nl.label_id
       where nl.note_id in (${sql.join(sources)}) and nl.removed_at is null
         and l.deleted_at is null and l.thread_id = ${threadId}
       group by nl.label_id
      on conflict do nothing`.execute(trx);
    added += 1;
    for (const id of sources) folded.add(id);
  }

  for (const id of plan.supersede) if (touchable(id)) folded.add(id);

  let superseded = 0;
  if (folded.size > 0) {
    const result = await trx
      .updateTable("notes")
      .set({
        superseded_at: sql`now()`,
        updated_at: sql`now()`,
        // **History has a clock, and only offload's half of it.** A folded note
        // it wrote is kept for thirty days and swept; a sentence a person typed
        // is never purged by us, which is OFF-1 as amended expressed as a
        // `purge_after` that stays null. Without this the folded list is the
        // one thing on a thread that grows forever.
        purge_after: sql`case when origin = 'learned' then now() + interval '30 days' end`,
      })
      .where("id", "in", [...folded])
      .where("superseded_at", "is", null)
      .executeTakeFirst();
    superseded = Number(result.numUpdatedRows ?? 0);
  }

  // Removal is offload taking back its own words, and only where nobody has
  // edited them since. `purge_after` puts it on the same eight second clock as
  // every other delete, so the sweep does the destroying.
  const removable = plan.remove.filter((id) => {
    if (!touchable(id)) return false;
    // **Already folded is not also deleted.** A plan naming one id in both
    // `foldedFrom` and `remove` would set it aside and then destroy it, which
    // is the one thing folding promises not to do: the history would lose the
    // note it was standing in for, eight seconds later and silently.
    if (folded.has(id)) {
      ignored += 1;
      return false;
    }
    if (held.get(id)?.origin !== "learned") {
      ignored += 1;
      return false;
    }
    return true;
  });

  let removed = 0;
  if (removable.length > 0) {
    const result = await trx
      .updateTable("notes")
      .set({
        deleted_at: sql`now()`,
        purge_after: sql`now() + interval '8 seconds'`,
        updated_at: sql`now()`,
      })
      .where("id", "in", removable)
      .where("origin", "=", "learned")
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    removed = Number(result.numUpdatedRows ?? 0);
  }

  return { superseded, removed, added, ignored };
}

/** 032. The most learned notes one member holds in one thread. Past it a pass
 *  adds nothing until it has folded some away, so offload's notes never push
 *  a person's own out of the hundred the prompt carries. */
export const LEARNED_CAP = 20;

/** 032. What a pass reads: since its member's last pass in the thread, a day
 *  for a first pass, and never more than a week. */
const LEARN_WINDOW_HOURS = 25;
const LEARN_WINDOW_MAX_DAYS = 7;

/** What a nightly pass would add, citing the messages it came from. */
export interface LearnedEntry {
  text: string;
  from: string[];
  occursAt?: Date | null;
  occursEndAt?: Date | null;
  dueAt?: Date | null;
}

/** Add what a nightly pass learned, with every rule held here.
 *
 *  **The set of messages a note may cite is derived here, from the database,
 *  and never from what the worker sent** (SEC-2): the member's own messages,
 *  said by them rather than by offload, not forwarded mail or anything from a
 *  connected app or the browser, not marked untrusted, from the last day, from
 *  which a live row or note in this thread was filed. A question files nothing
 *  and so is never in it, and neither is anything another member said.
 *
 *  A note that cites anything outside that set is dropped whole, as is an
 *  empty one, one of two lines, one longer than a note may be, one the thread
 *  already says, and every one past the member's cap. Nothing here notifies:
 *  a note is not news.
 */
export async function applyLearned(
  trx: Executor,
  { accountId, threadId, entries }: { accountId: string; threadId: string; entries: LearnedEntry[] },
): Promise<{ learned: number; ignored: number }> {
  const cited = [...new Set(entries.flatMap((entry) => entry.from))];
  if (cited.length === 0) return { learned: 0, ignored: 0 };

  const eligible = new Set(
    (
      await trx
        .selectFrom("messages")
        .select("messages.id")
        .where("messages.id", "in", cited)
        .where("messages.account_id", "=", accountId)
        .where("messages.role", "=", "person")
        .where("messages.source", "not in", ["mail", "gmail", "calendar", "browser"])
        .where("messages.derived_from_untrusted", "=", false)
        // Since the member's last pass here, so a missed night loses nothing;
        // the first pass reads a day, and no pass reads more than a week.
        .where(
          sql<boolean>`messages.created_at > greatest(
            coalesce(
              (select tm.nightly_at from thread_members tm where tm.thread_id = ${threadId} and tm.account_id = ${accountId}),
              now() - make_interval(hours => ${LEARN_WINDOW_HOURS})
            ),
            now() - make_interval(days => ${LEARN_WINDOW_MAX_DAYS})
          )`,
        )
        .where((eb) =>
          eb.or([
            eb.exists(
              eb
                .selectFrom("content")
                .select("content.id")
                .whereRef("content.derived_from_message_id", "=", "messages.id")
                .where("content.thread_id", "=", threadId)
                .where("content.deleted_at", "is", null),
            ),
            eb.exists(
              eb
                .selectFrom("notes")
                .select("notes.id")
                .whereRef("notes.derived_from_message_id", "=", "messages.id")
                .where("notes.scope", "=", "thread")
                .where("notes.subject_id", "=", threadId)
                .where("notes.deleted_at", "is", null),
            ),
          ]),
        )
        .execute()
    ).map((row) => row.id),
  );

  const current = await trx
    .selectFrom("notes")
    .select(["text", "origin", "account_id"])
    .where("scope", "=", "thread")
    .where("subject_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .execute();
  const said = new Set(current.map((row) => row.text.trim().toLowerCase()));
  let held = current.filter((row) => row.origin === "learned" && row.account_id === accountId).length;

  let learned = 0;
  let ignored = 0;
  for (const entry of entries) {
    const text = entry.text.trim();
    const ok =
      text.length > 0 &&
      text.length <= NOTE_TEXT_CHARS &&
      !/[\r\n]/.test(text) &&
      entry.from.length > 0 &&
      entry.from.every((id) => eligible.has(id)) &&
      !said.has(text.toLowerCase()) &&
      held < LEARNED_CAP;
    if (!ok) {
      ignored += 1;
      continue;
    }
    const written = await addNote(
      {
        threadId,
        accountId,
        text,
        origin: "learned",
        occursAt: entry.occursAt ?? null,
        occursEndAt: entry.occursEndAt ?? null,
        dueAt: entry.dueAt ?? null,
        fromMessageId: entry.from[0] ?? null,
      },
      trx,
    );
    // `addNote` hands back an existing learned note with the same words, set
    // aside or not and whoever's it is, rather than writing a second: that is
    // nothing learned.
    if (written.supersededAt !== null || written.authorId !== accountId) {
      ignored += 1;
      continue;
    }
    said.add(text.toLowerCase());
    held += 1;
    learned += 1;
  }
  return { learned, ignored };
}
