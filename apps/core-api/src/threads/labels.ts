// 025. Labels, and the one place every write to one happens.
//
// A label is a named, coloured group inside one thread. It is the thread's,
// not its creator's: any accepted member may make, rename, recolour, delete
// and apply any of them, the way any member may rename the thread. So the
// permission here is membership and nothing finer.
//
// **Everything goes through this file**: the person's routes, a dump's `#`
// picks, the model's tool and the nightly sort. That is what makes the four
// rules below true everywhere rather than wherever somebody remembered them:
//
//   - A label and a row meet only inside one thread, and a note only when it
//     is that thread's own note. Every id is resolved against the thread in
//     the same transaction as the write, and one that does not resolve
//     refuses the whole write.
//   - Who set it is the caller's (`Actor.via`), decided by the route that
//     called, never by anything in a request body.
//   - offload never overrides a person: a join a person set or removed, and a
//     label a person renamed, recoloured or deleted, are refused to it.
//   - Ten labels per thread, and offload makes one only below six.
//
// Label names are content (they were written from what somebody dumped), so
// nothing here logs one. Refusals carry a reason code and nothing else.

import { sql, type Kysely, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { NotYours, memberOf } from "./access.js";

type Executor = Kysely<Database> | Transaction<Database>;

export const LABEL_LIMIT = 10;
/** offload creates a label only while a thread has fewer than this, so a
 *  person always has room for their own (product owner, 2026-09-26). */
export const OFFLOAD_LABEL_LIMIT = 6;
export const LABEL_NAME_CHARS = 24;
export const LABEL_COLOURS = 10;
/** How long a deleted label is kept: the privacy page's window for anything
 *  deleted, and the span offload will not re-create its name in. */
export const LABEL_KEPT_DAYS = 30;
/** The eight-second Undo, and the round trip after it. */
export const RESTORE_WINDOW_SECONDS = 30;
/** The nightly sort looks at a thread of this many live rows or more, the
 *  same six that draw Group with labels. */
export const LABEL_SORT_MIN_ROWS = 6;

export type Via = "person" | "offload";

/** Who is writing. `via` comes from the route: a session is a person, the
 *  model plane is offload. `runId` ties offload's writes, and a person's `#`
 *  picks in a turn, to the sort that made them, which is what Undo reads. */
export interface Actor {
  accountId: string;
  via: Via;
  runId?: string | null;
}

export type LabelRefusal =
  | "bad_label_name"
  | "label_taken"
  | "label_limit"
  | "label_gone"
  | "person_set"
  | "person_deleted"
  | "not_in_the_dump";

export class LabelRefused extends Error {
  constructor(readonly reason: LabelRefusal) {
    super(reason);
  }
}

export interface Label {
  id: string;
  threadId: string;
  name: string;
  colour: number;
}

// ---------------------------------------------------------------- the name

// C0 and C1 controls, and the line and paragraph separators, which render as
// breaks and would put a newline inside a chip.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

/** Trim, collapse inner whitespace, drop a leading `#`, and hold the result to
 *  1 to 24 characters with no control characters. Counted in code points,
 *  which is what Postgres's `char_length` counts. */
export function normaliseLabelName(raw: string): string {
  const trimmed = raw.trim();
  // Surrounding whitespace, a newline included, is trimmed; one inside the
  // name is refused rather than silently joined up.
  if (CONTROL.test(trimmed)) throw new LabelRefused("bad_label_name");
  const name = trimmed.replace(/^#+/, "").replace(/\s+/g, " ").trim();
  const length = [...name].length;
  if (length < 1 || length > LABEL_NAME_CHARS) throw new LabelRefused("bad_label_name");
  return name;
}

// ---------------------------------------------------------------- reads

async function requireThread(trx: Executor, actor: Actor, threadId: string): Promise<void> {
  if (!(await memberOf(actor.accountId, threadId, trx))) throw new NotYours();
}

/** A live label, locked, and membership of its thread. Not found for anybody
 *  outside the thread, and for a label that is deleted. */
async function liveLabel(trx: Executor, actor: Actor, labelId: string) {
  const row = await trx
    .selectFrom("labels")
    .selectAll()
    .where("id", "=", labelId)
    .where("deleted_at", "is", null)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new NotYours();
  await requireThread(trx, actor, row.thread_id);
  return row;
}

async function liveLabelsOf(trx: Executor, threadId: string) {
  return trx
    .selectFrom("labels")
    .select(["id", "name", "colour"])
    .where("thread_id", "=", threadId)
    .where("deleted_at", "is", null)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
}

function lowestFree(taken: readonly number[]): number | null {
  for (let colour = 1; colour <= LABEL_COLOURS; colour++) if (!taken.includes(colour)) return colour;
  return null;
}

const asLabel = (row: { id: string; thread_id: string; name: string; colour: number }): Label => ({
  id: row.id,
  threadId: row.thread_id,
  name: row.name,
  colour: row.colour,
});

/** Run `work` in a transaction, or inside the caller's when there is one. */
async function inTransaction<T>(trx: Executor, work: (t: Transaction<Database>) => Promise<T>): Promise<T> {
  if (trx.isTransaction) return work(trx as Transaction<Database>);
  return (trx as Kysely<Database>).transaction().execute(work);
}

/** A unique index losing a race is the same answer as the check before it. */
function takenOnConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (/labels_thread_name_idx/.test(message)) throw new LabelRefused("label_taken");
  throw error;
}

// ---------------------------------------------------------------- create

export async function createLabel(
  executor: Executor,
  actor: Actor,
  threadId: string,
  input: { name: string; colour?: number | null },
): Promise<Label> {
  const name = normaliseLabelName(input.name);
  return inTransaction(executor, async (trx) => {
    await requireThread(trx, actor, threadId);
    // One writer at a time per thread, so the count and the colour read here
    // are still true when the insert lands.
    await trx.selectFrom("threads").select("id").where("id", "=", threadId).forUpdate().execute();

    const live = await liveLabelsOf(trx, threadId);
    const limit = actor.via === "offload" ? OFFLOAD_LABEL_LIMIT : LABEL_LIMIT;
    if (live.length >= limit) throw new LabelRefused("label_limit");
    if (live.some((l) => l.name.toLowerCase() === name.toLowerCase())) throw new LabelRefused("label_taken");

    if (actor.via === "offload") {
      const deleted = await trx
        .selectFrom("labels")
        .select("id")
        .where("thread_id", "=", threadId)
        .where("deleted_by_person", "=", true)
        .where("deleted_at", "is not", null)
        .where(sql<boolean>`lower(name) = ${name.toLowerCase()}`)
        .executeTakeFirst();
      if (deleted) throw new LabelRefused("person_deleted");
    }

    const taken = live.map((l) => l.colour);
    const free = lowestFree(taken)!;
    const wanted = input.colour && input.colour >= 1 && input.colour <= LABEL_COLOURS ? input.colour : free;
    if (wanted !== free && taken.includes(wanted)) {
      // A taken colour swaps: the holder takes the colour the new label would
      // have had.
      const holder = live.find((l) => l.colour === wanted)!;
      await trx.updateTable("labels").set({ colour: free, updated_at: sql`now()` }).where("id", "=", holder.id).execute();
    }

    const inserted = await trx
      .insertInto("labels")
      .values({
        thread_id: threadId,
        name,
        colour: wanted,
        set_by: actor.via,
        created_by: actor.via === "person" ? actor.accountId : null,
        run_id: actor.runId ?? null,
      })
      .returning(["id", "thread_id", "name", "colour"])
      .executeTakeFirstOrThrow()
      .catch(takenOnConflict);
    return asLabel(inserted);
  });
}

// ---------------------------------------------------------------- rename, recolour

export async function updateLabel(
  executor: Executor,
  actor: Actor,
  labelId: string,
  input: { name?: string | null | undefined; colour?: number | null | undefined },
): Promise<{ label: Label; previous: { name: string; colour: number }; swappedWith: string | null }> {
  // offload has no path to renaming or recolouring, and this is the refusal
  // should one ever be written.
  if (actor.via === "offload") throw new LabelRefused("person_set");
  const name = input.name == null ? undefined : normaliseLabelName(input.name);
  return inTransaction(executor, async (trx) => {
    const current = await liveLabel(trx, actor, labelId);
    await trx.selectFrom("threads").select("id").where("id", "=", current.thread_id).forUpdate().execute();
    const previous = { name: current.name, colour: current.colour };
    const live = await liveLabelsOf(trx, current.thread_id);

    if (name !== undefined && live.some((l) => l.id !== labelId && l.name.toLowerCase() === name.toLowerCase())) {
      throw new LabelRefused("label_taken");
    }

    let swappedWith: string | null = null;
    const colour = input.colour ?? undefined;
    if (colour !== undefined && (colour < 1 || colour > LABEL_COLOURS)) throw new LabelRefused("bad_label_name");
    if (colour !== undefined && colour !== current.colour) {
      const holder = live.find((l) => l.id !== labelId && l.colour === colour);
      if (holder) {
        // A partial unique index cannot be deferred, so the swap steps this
        // label out of it for the length of the transaction.
        swappedWith = holder.id;
        await trx.updateTable("labels").set({ deleted_at: sql`now()` }).where("id", "=", labelId).execute();
        await trx.updateTable("labels").set({ colour: current.colour, updated_at: sql`now()` }).where("id", "=", holder.id).execute();
      }
    }

    const updated = await trx
      .updateTable("labels")
      .set({
        ...(name === undefined ? {} : { name }),
        ...(colour === undefined ? {} : { colour }),
        deleted_at: null,
        touched_by_person_at: sql`now()`,
        updated_at: sql`now()`,
      })
      .where("id", "=", labelId)
      .returning(["id", "thread_id", "name", "colour"])
      .executeTakeFirstOrThrow()
      .catch(takenOnConflict);
    return { label: asLabel(updated), previous, swappedWith };
  });
}

// ---------------------------------------------------------------- delete, restore, purge

/** Soft: the label and its joins stay for thirty days, for Undo and for
 *  offload's refusal to re-create the name. No row is touched. */
export async function deleteLabel(executor: Executor, actor: Actor, labelId: string): Promise<{ id: string }> {
  if (actor.via === "offload") throw new LabelRefused("person_set");
  return inTransaction(executor, async (trx) => {
    await liveLabel(trx, actor, labelId);
    await trx
      .updateTable("labels")
      .set({
        deleted_at: sql`now()`,
        deleted_by_person: true,
        deleted_by: actor.accountId,
        purge_after: sql`now() + make_interval(days => ${LABEL_KEPT_DAYS})`,
        updated_at: sql`now()`,
      })
      .where("id", "=", labelId)
      .execute();
    return { id: labelId };
  });
}

/** Undo of a delete, by id alone, from what the server kept. Only the
 *  member who deleted it, and only while their Undo is up, with slack for the
 *  round trip: anyone else re-creates it instead. The name must still be
 *  free; the colour is its own if nobody took it, the lowest free if somebody
 *  did, and a thread that filled to ten meanwhile refuses. */
export async function restoreLabel(executor: Executor, actor: Actor, labelId: string): Promise<Label> {
  if (actor.via === "offload") throw new LabelRefused("person_set");
  return inTransaction(executor, async (trx) => {
    const row = await trx
      .selectFrom("labels")
      .selectAll()
      .where("id", "=", labelId)
      .where("deleted_at", "is not", null)
      .where("deleted_by", "=", actor.accountId)
      .where("deleted_at", ">", sql<Date>`now() - make_interval(secs => ${RESTORE_WINDOW_SECONDS})`)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new LabelRefused("label_gone");
    await requireThread(trx, actor, row.thread_id);
    await trx.selectFrom("threads").select("id").where("id", "=", row.thread_id).forUpdate().execute();
    const live = await liveLabelsOf(trx, row.thread_id);
    if (live.length >= LABEL_LIMIT) throw new LabelRefused("label_limit");
    if (live.some((l) => l.name.toLowerCase() === row.name.toLowerCase())) throw new LabelRefused("label_taken");
    const taken = live.map((l) => l.colour);
    const colour = taken.includes(row.colour) ? lowestFree(taken)! : row.colour;
    const back = await trx
      .updateTable("labels")
      .set({ deleted_at: null, deleted_by_person: false, deleted_by: null, purge_after: null, colour, updated_at: sql`now()` })
      .where("id", "=", labelId)
      .returning(["id", "thread_id", "name", "colour"])
      .executeTakeFirstOrThrow();
    return asLabel(back);
  });
}

/** The daily sweep: deleted labels past their thirty days, joins with them. */
export async function purgeLabels(executor: Executor = db): Promise<number> {
  const gone = await executor
    .deleteFrom("labels")
    .where("deleted_at", "is not", null)
    .where("purge_after", "<", sql<Date>`now()`)
    .returning("id")
    .execute();
  return gone.length;
}

/** A sort's record lives as long as the Activity row that offers its Undo.
 *  What it set stays: the joins lose their run and read as offload's. */
export async function purgeLabelRuns(executor: Executor = db): Promise<number> {
  const gone = await executor
    .deleteFrom("label_runs")
    .where(sql<boolean>`created_at < now() - make_interval(days => ${LABEL_KEPT_DAYS})`)
    .returning("id")
    .execute();
  return gone.length;
}

// ---------------------------------------------------------------- apply

export interface RowRef {
  kind: "content" | "note";
  rowId: string;
  labelId: string;
}

export interface Applied {
  applied: RowRef[];
  removed: RowRef[];
}

/** Put labels on rows and take them off, in one transaction.
 *
 *  Every label must be a live label of `threadId`; every content row a live
 *  row of it; every note a live thread note of it; and the actor an accepted
 *  member. Anything that does not resolve refuses the whole write as not
 *  found, so a label from one thread can never land on a row in another.
 *
 *  For offload, a join a person set or took off is refused as `person_set`,
 *  or skipped when `skipRefused` is set, which is what the nightly sort asks
 *  for so one row a person corrected does not cost the rest of the plan.
 */
export async function applyLabels(
  executor: Executor,
  actor: Actor,
  threadId: string,
  rows: { content?: readonly string[] | undefined; notes?: readonly string[] | undefined },
  add: readonly string[],
  remove: readonly string[],
  options: { skipRefused?: boolean } = {},
): Promise<Applied> {
  const contentIds = [...new Set(rows.content ?? [])];
  const noteIds = [...new Set(rows.notes ?? [])];
  const labelIds = [...new Set([...add, ...remove])];
  const out: Applied = { applied: [], removed: [] };
  if (labelIds.length === 0 || contentIds.length + noteIds.length === 0) {
    if (labelIds.length + contentIds.length + noteIds.length > 0) {
      // Still resolve what was named, so a stray id is a refusal and not a
      // silent success.
      await inTransaction(executor, (trx) => resolve(trx, actor, threadId, contentIds, noteIds, labelIds));
    }
    return out;
  }

  return inTransaction(executor, async (trx) => {
    await resolve(trx, actor, threadId, contentIds, noteIds, labelIds);

    const targets: { kind: "content" | "note"; ids: string[] }[] = [
      { kind: "content", ids: contentIds },
      { kind: "note", ids: noteIds },
    ];
    for (const { kind, ids } of targets) {
      if (ids.length === 0) continue;
      const existing = await joinsOf(trx, kind, ids, labelIds);
      for (const rowId of ids) {
        for (const labelId of add) {
          const join = existing.get(`${rowId}:${labelId}`);
          const verdict = decideAdd(actor.via, join);
          if (verdict === "refused") {
            if (options.skipRefused) continue;
            throw new LabelRefused("person_set");
          }
          if (verdict === "nothing") continue;
          await writeAdd(trx, kind, rowId, labelId, actor, join !== undefined);
          out.applied.push({ kind, rowId, labelId });
        }
        for (const labelId of remove) {
          const join = existing.get(`${rowId}:${labelId}`);
          const verdict = decideRemove(actor.via, join);
          if (verdict === "refused") {
            if (options.skipRefused) continue;
            throw new LabelRefused("person_set");
          }
          if (verdict === "nothing") continue;
          await writeRemove(trx, kind, rowId, labelId, actor);
          out.removed.push({ kind, rowId, labelId });
        }
      }
    }
    return out;
  });
}

interface JoinState {
  set_by: Via;
  removed_at: unknown;
  removed_by: Via | null;
}

function decideAdd(via: Via, join: JoinState | undefined): "write" | "nothing" | "refused" {
  if (!join) return "write";
  const on = join.removed_at === null;
  if (via === "person") return on && join.set_by === "person" ? "nothing" : "write";
  if (on) return "nothing";
  return join.removed_by === "person" ? "refused" : "write";
}

function decideRemove(via: Via, join: JoinState | undefined): "write" | "nothing" | "refused" {
  if (!join || join.removed_at !== null) return "nothing";
  if (via === "offload" && join.set_by === "person") return "refused";
  return "write";
}

async function resolve(
  trx: Executor,
  actor: Actor,
  threadId: string,
  contentIds: readonly string[],
  noteIds: readonly string[],
  labelIds: readonly string[],
): Promise<void> {
  await requireThread(trx, actor, threadId);
  if (labelIds.length > 0) {
    const found = await trx
      .selectFrom("labels")
      .select("id")
      .where("id", "in", labelIds)
      .where("thread_id", "=", threadId)
      .where("deleted_at", "is", null)
      .execute();
    if (found.length !== labelIds.length) throw new NotYours();
  }
  if (contentIds.length > 0) {
    // Locked, so a move between this read and the write below waits for it,
    // and the move then takes the joins off with it.
    const found = await trx
      .selectFrom("content")
      .select("id")
      .where("id", "in", contentIds)
      .where("thread_id", "=", threadId)
      .where("deleted_at", "is", null)
      .forUpdate()
      .execute();
    if (found.length !== contentIds.length) throw new NotYours();
  }
  if (noteIds.length > 0) {
    const found = await trx
      .selectFrom("notes")
      .select("id")
      .where("id", "in", noteIds)
      .where("scope", "=", "thread")
      .where("subject_id", "=", threadId)
      .where("deleted_at", "is", null)
      .forUpdate()
      .execute();
    if (found.length !== noteIds.length) throw new NotYours();
  }
}

async function joinsOf(
  trx: Executor,
  kind: "content" | "note",
  rowIds: readonly string[],
  labelIds: readonly string[],
): Promise<Map<string, JoinState>> {
  const rows =
    kind === "content"
      ? await trx
          .selectFrom("content_labels")
          .select(["content_id as row_id", "label_id", "set_by", "removed_at", "removed_by"])
          .where("content_id", "in", rowIds)
          .where("label_id", "in", labelIds)
          .execute()
      : await trx
          .selectFrom("note_labels")
          .select(["note_id as row_id", "label_id", "set_by", "removed_at", "removed_by"])
          .where("note_id", "in", rowIds)
          .where("label_id", "in", labelIds)
          .execute();
  return new Map(rows.map((r) => [`${r.row_id}:${r.label_id}`, r]));
}

async function writeAdd(
  trx: Executor,
  kind: "content" | "note",
  rowId: string,
  labelId: string,
  actor: Actor,
  exists: boolean,
): Promise<void> {
  const values = { set_by: actor.via, run_id: actor.runId ?? null, removed_at: null, removed_by: null, removed_run_id: null };
  if (kind === "content") {
    if (exists) {
      await trx.updateTable("content_labels").set(values).where("content_id", "=", rowId).where("label_id", "=", labelId).execute();
    } else {
      await trx.insertInto("content_labels").values({ content_id: rowId, label_id: labelId, ...values }).execute();
    }
  } else if (exists) {
    await trx.updateTable("note_labels").set(values).where("note_id", "=", rowId).where("label_id", "=", labelId).execute();
  } else {
    await trx.insertInto("note_labels").values({ note_id: rowId, label_id: labelId, ...values }).execute();
  }
}

async function writeRemove(trx: Executor, kind: "content" | "note", rowId: string, labelId: string, actor: Actor): Promise<void> {
  const values = { removed_at: sql<Date>`now()`, removed_by: actor.via, removed_run_id: actor.runId ?? null };
  if (kind === "content") {
    await trx.updateTable("content_labels").set(values).where("content_id", "=", rowId).where("label_id", "=", labelId).execute();
  } else {
    await trx.updateTable("note_labels").set(values).where("note_id", "=", rowId).where("label_id", "=", labelId).execute();
  }
}

// ---------------------------------------------------------------- reads

export interface LabelWithCount extends Omit<Label, "threadId"> {
  count: number;
}

/** A thread's live labels in the order they were made, each with how many
 *  live, unarchived rows and listed notes carry it. The caller has checked
 *  membership. One statement, at most ten rows. */
export async function labelsOfThread(threadId: string, executor: Executor = db): Promise<LabelWithCount[]> {
  const rows = await executor
    .selectFrom("labels as l")
    .select([
      "l.id",
      "l.name",
      "l.colour",
      sql<string>`(
        select count(*) from content_labels cl join content c on c.id = cl.content_id
         where cl.label_id = l.id and cl.removed_at is null
           and c.thread_id = l.thread_id and c.deleted_at is null and c.archived_at is null
      ) + (
        select count(*) from note_labels nl join notes n on n.id = nl.note_id
         where nl.label_id = l.id and nl.removed_at is null
           and n.scope = 'thread' and n.subject_id = l.thread_id
           and n.deleted_at is null and n.superseded_at is null
      )`.as("count"),
    ])
    .where("l.thread_id", "=", threadId)
    .where("l.deleted_at", "is", null)
    .orderBy("l.created_at")
    .orderBy("l.id")
    .execute();
  return rows.map((r) => ({ id: r.id, name: r.name, colour: r.colour, count: Number(r.count) }));
}

/** Live, unarchived rows of a thread that carry no live label: No label's count. */
export async function unlabelledCount(threadId: string, executor: Executor = db): Promise<number> {
  const row = await executor
    .selectFrom("content as c")
    .select(sql<string>`count(*)`.as("n"))
    .where("c.thread_id", "=", threadId)
    .where("c.deleted_at", "is", null)
    .where("c.archived_at", "is", null)
    .where(sql<boolean>`not exists (${carriesAny(sql.ref("c.id"), null)})`)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/** The live joins of a content row to live labels of its own thread. `ids`
 *  narrows to those labels; null means any. Used as an `exists` in filters. */
export function carriesAny(contentId: ReturnType<typeof sql.ref>, ids: readonly string[] | null) {
  return sql`select 1 from content_labels cl join labels l on l.id = cl.label_id join content cc on cc.id = cl.content_id
    where cl.content_id = ${contentId} and cl.removed_at is null and l.deleted_at is null and l.thread_id = cc.thread_id
    ${ids === null ? sql`` : sql`and cl.label_id in (${sql.join(ids)})`}`;
}

/** Each content row's live labels, in the thread's label order. A label is
 *  returned only on a row in its own thread, whatever the join table says. */
export async function contentLabelsFor(contentIds: readonly string[], executor: Executor = db): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (contentIds.length === 0) return out;
  const rows = await executor
    .selectFrom("content_labels as cl")
    .innerJoin("labels as l", "l.id", "cl.label_id")
    .innerJoin("content as c", "c.id", "cl.content_id")
    .select(["cl.content_id as row_id", "cl.label_id as label_id"])
    .where("cl.content_id", "in", [...contentIds])
    .where("cl.removed_at", "is", null)
    .where("l.deleted_at", "is", null)
    .whereRef("l.thread_id", "=", "c.thread_id")
    .orderBy("l.created_at")
    .orderBy("l.id")
    .execute();
  for (const r of rows) out.set(r.row_id, [...(out.get(r.row_id) ?? []), r.label_id]);
  return out;
}

export async function noteLabelsFor(noteIds: readonly string[], executor: Executor = db): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (noteIds.length === 0) return out;
  const rows = await executor
    .selectFrom("note_labels as nl")
    .innerJoin("labels as l", "l.id", "nl.label_id")
    .innerJoin("notes as n", "n.id", "nl.note_id")
    .select(["nl.note_id as row_id", "nl.label_id as label_id"])
    .where("nl.note_id", "in", [...noteIds])
    .where("nl.removed_at", "is", null)
    .where("l.deleted_at", "is", null)
    .where("n.scope", "=", "thread")
    .whereRef("l.thread_id", "=", "n.subject_id")
    .orderBy("l.created_at")
    .orderBy("l.id")
    .execute();
  for (const r of rows) out.set(r.row_id, [...(out.get(r.row_id) ?? []), r.label_id]);
  return out;
}

/** Attach `labels` to rows that carry an id. */
export async function withContentLabels<T extends { id: string }>(rows: T[], executor: Executor = db): Promise<(T & { labels: string[] })[]> {
  const found = await contentLabelsFor(rows.map((r) => r.id), executor);
  return rows.map((r) => ({ ...r, labels: found.get(r.id) ?? [] }));
}

export async function withNoteLabels<T extends { id: string }>(rows: T[], executor: Executor = db): Promise<(T & { labels: string[] })[]> {
  const found = await noteLabelsFor(rows.map((r) => r.id), executor);
  return rows.map((r) => ({ ...r, labels: found.get(r.id) ?? [] }));
}

/** One row's labels as a full set: the diff against what it carries is the
 *  write. Returns what it carried, which the person's Undo sends back. */
export async function setRowLabels(
  executor: Executor,
  actor: Actor,
  target: { kind: "content" | "note"; id: string; threadId: string },
  labelIds: readonly string[],
): Promise<{ previous: string[] }> {
  return inTransaction(executor, async (trx) => {
    const current =
      (target.kind === "content" ? await contentLabelsFor([target.id], trx) : await noteLabelsFor([target.id], trx)).get(target.id) ?? [];
    const wanted = [...new Set(labelIds)];
    const add = wanted.filter((id) => !current.includes(id));
    const remove = current.filter((id) => !wanted.includes(id));
    const rows = target.kind === "content" ? { content: [target.id] } : { notes: [target.id] };
    // Every wanted id is resolved, including ones already carried, so a stray
    // id is refused rather than ignored; only the difference is written.
    await resolve(trx, actor, target.threadId, rows.content ?? [], rows.notes ?? [], wanted);
    await applyLabels(trx, actor, target.threadId, rows, add, remove);
    return { previous: current };
  });
}

// ---------------------------------------------------------------- a turn's #

/** What a dump's `#` picks travel as: a label the composer resolved, or a
 *  name to make. Stored on the message as sent and resolved only here. */
export type LabelPickOnWire = { id: string } | { name: string };

/** The run a turn's labels hang off, one per turn and who set them, made the
 *  first time it is needed so a turn that labelled nothing leaves no row. */
export async function runForTurn(
  trx: Executor,
  threadId: string,
  turnId: string,
  via: Via,
): Promise<string> {
  const existing = await trx
    .selectFrom("label_runs")
    .select("id")
    .where("turn_id", "=", turnId)
    .where("thread_id", "=", threadId)
    .where("set_by", "=", via)
    .where("undone_at", "is", null)
    .executeTakeFirst();
  if (existing) return existing.id;
  const made = await trx
    .insertInto("label_runs")
    .values({ thread_id: threadId, kind: "live", set_by: via, turn_id: turnId })
    .returning("id")
    .executeTakeFirstOrThrow();
  return made.id;
}

/** A dump's `#`, applied once its turn has filed: every row the message
 *  produced gets the labels picked for it, in the thread it landed in.
 *
 *  A pick by id applies only where the label is that row's thread's; a name
 *  is matched ignoring case in the row's thread and made there when missing
 *  and there is room. From Today there are no picks, since no thread was
 *  known, so the message's own #words are the names. Everything is the
 *  person's: they typed it. Anything that cannot land is dropped without a
 *  word, and the turn footer simply shows no mark for it. */
export async function applyTurnLabels(
  trx: Transaction<Database>,
  accountId: string,
  message: { id: string; turnId: string; text: string | null; attrs: unknown },
  hashtags: (text: string) => string[],
): Promise<void> {
  const attrs = (message.attrs && typeof message.attrs === "object" ? message.attrs : {}) as { labels?: unknown };
  const picked = Array.isArray(attrs.labels) ? (attrs.labels as LabelPickOnWire[]) : null;
  const ids = picked ? picked.flatMap((p) => ("id" in p && typeof p.id === "string" ? [p.id] : [])) : [];
  const names = picked
    ? picked.flatMap((p) => ("name" in p && typeof p.name === "string" ? [p.name] : []))
    : hashtags(message.text ?? "");
  if (ids.length === 0 && names.length === 0) return;

  const content = await trx
    .selectFrom("content")
    .select(["id", "thread_id"])
    .where("derived_from_message_id", "=", message.id)
    .where("deleted_at", "is", null)
    .execute();
  const notes = await trx
    .selectFrom("notes")
    .select(["id", "subject_id"])
    .where("derived_from_message_id", "=", message.id)
    .where("scope", "=", "thread")
    .where("deleted_at", "is", null)
    .execute();

  const byThread = new Map<string, { content: string[]; notes: string[] }>();
  for (const c of content) {
    const entry = byThread.get(c.thread_id) ?? { content: [], notes: [] };
    entry.content.push(c.id);
    byThread.set(c.thread_id, entry);
  }
  for (const n of notes) {
    if (!n.subject_id) continue;
    const entry = byThread.get(n.subject_id) ?? { content: [], notes: [] };
    entry.notes.push(n.id);
    byThread.set(n.subject_id, entry);
  }

  for (const [threadId, rows] of byThread) {
    if (!(await memberOf(accountId, threadId, trx))) continue;
    const live = await liveLabelsOf(trx, threadId);
    const wanted = new Set(live.filter((l) => ids.includes(l.id)).map((l) => l.id));
    const missing: string[] = [];
    for (const raw of names) {
      let name: string;
      try {
        name = normaliseLabelName(raw);
      } catch {
        continue;
      }
      const found = live.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (found) wanted.add(found.id);
      else missing.push(name);
    }
    if (wanted.size === 0 && missing.length === 0) continue;
    const runId = await runForTurn(trx, threadId, message.turnId, "person");
    const actor: Actor = { accountId, via: "person", runId };
    for (const name of missing) {
      try {
        const made = await createLabel(trx, actor, threadId, { name });
        wanted.add(made.id);
      } catch (error) {
        if (!(error instanceof LabelRefused)) throw error;
      }
    }
    if (wanted.size > 0) await applyLabels(trx, actor, threadId, rows, [...wanted], []);
  }
}

// ---------------------------------------------------------------- undoing a sort

/** Take back one sort. Joins it set that are still as it left them are
 *  removed; joins it took off come back; a label it made goes when no live
 *  join from anyone else, a person or a later sort, is under it and nobody
 *  renamed or recoloured it. What anyone has touched since stays. Returns
 *  what it took back. */
export async function undoRun(trx: Executor, runId: string): Promise<{ joins: number; labels: number }> {
  const run = await trx.selectFrom("label_runs").selectAll().where("id", "=", runId).forUpdate().executeTakeFirst();
  if (!run || run.undone_at !== null) return { joins: 0, labels: 0 };

  let joins = 0;
  for (const table of ["content_labels", "note_labels"] as const) {
    const set = await trx
      .deleteFrom(table)
      .where("run_id", "=", runId)
      .where("set_by", "=", run.set_by)
      .where("removed_at", "is", null)
      .executeTakeFirst();
    const back = await trx
      .updateTable(table)
      .set({ removed_at: null, removed_by: null, removed_run_id: null })
      .where("removed_run_id", "=", runId)
      .where("removed_by", "=", run.set_by)
      .executeTakeFirst();
    joins += Number(set.numDeletedRows) + Number(back.numUpdatedRows);
  }

  const made = await trx
    .updateTable("labels")
    .set({ deleted_at: sql`now()`, purge_after: sql`now() + make_interval(days => ${LABEL_KEPT_DAYS})`, updated_at: sql`now()` })
    .where("run_id", "=", runId)
    .where("deleted_at", "is", null)
    .where("touched_by_person_at", "is", null)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("content_labels")
            .select("content_labels.label_id")
            .whereRef("content_labels.label_id", "=", "labels.id")
            .where("content_labels.removed_at", "is", null)
        ),
      ),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("note_labels")
            .select("note_labels.label_id")
            .whereRef("note_labels.label_id", "=", "labels.id")
            .where("note_labels.removed_at", "is", null)
        ),
      ),
    )
    .executeTakeFirst();

  await trx.updateTable("label_runs").set({ undone_at: sql`now()` }).where("id", "=", runId).execute();
  // Every member's record of the sort reads Undone, from the column; the
  // words stay as they were written.
  await trx.updateTable("activity").set({ undone_at: sql`now()` }).where("label_run_id", "=", runId).execute();
  return { joins, labels: Number(made.numUpdatedRows) };
}

/** Undoing a turn takes back every sort it made, the person's `#` and the
 *  model's alike. */
export async function undoTurnLabels(trx: Executor, turnId: string): Promise<void> {
  const runs = await trx.selectFrom("label_runs").select("id").where("turn_id", "=", turnId).where("undone_at", "is", null).execute();
  for (const run of runs) await undoRun(trx, run.id);
}

// ---------------------------------------------------------------- live filing

const LINK = /\b(?:https?:\/\/|www\.)\S+/giu;
const WORD = /[\p{L}\p{N}]+/gu;

/** Every word of the name is a word of the message. 016's idea applied to a
 *  name: a live turn may make a label only out of what the person wrote, so
 *  a sentence another member put in a shared thread, or a page's text, cannot
 *  make labels nobody asked for. A link's words do not count: an address is
 *  not something somebody said. Case and accents are compared as written,
 *  lowercased. */
export function nameInDump(name: string, dump: string): boolean {
  const said = new Set((dump.replace(LINK, " ").toLowerCase().match(WORD) ?? []));
  const words = name.toLowerCase().match(WORD) ?? [];
  return words.length > 0 && words.every((word) => said.has(word));
}

/** One Activity row per accepted member for a sort that labelled anything:
 *  never sent, carrying its thread and its sort, the words composed now from
 *  what the sort holds. A second call for the same sort rewrites the words
 *  rather than adding a row, since one turn is one record. */
export async function recordSortActivity(
  trx: Executor,
  runId: string,
  words: (facts: { threadName: string; rows: number; labels: string[] }) => string,
): Promise<void> {
  const run = await trx.selectFrom("label_runs").selectAll().where("id", "=", runId).executeTakeFirst();
  if (!run) return;
  const rowsSet = await trx
    .selectFrom("content_labels")
    .select("content_id")
    .where("run_id", "=", runId)
    .where("removed_at", "is", null)
    .execute();
  const noteRows = await trx
    .selectFrom("note_labels")
    .select("note_id")
    .where("run_id", "=", runId)
    .where("removed_at", "is", null)
    .execute();
  const rows = new Set(rowsSet.map((r) => r.content_id)).size + new Set(noteRows.map((r) => r.note_id)).size;
  if (rows === 0) return;
  const labels = await trx
    .selectFrom("labels")
    .select("name")
    .where("deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb("id", "in", eb.selectFrom("content_labels").select("label_id").where("run_id", "=", runId).where("removed_at", "is", null)),
        eb("id", "in", eb.selectFrom("note_labels").select("label_id").where("run_id", "=", runId).where("removed_at", "is", null)),
      ]),
    )
    .orderBy("created_at")
    .execute();
  const thread = await trx.selectFrom("threads").select("name").where("id", "=", run.thread_id).executeTakeFirstOrThrow();
  const title = words({ threadName: thread.name, rows, labels: labels.map((l) => l.name) }).slice(0, 200);

  const existing = await trx.selectFrom("activity").select("id").where("label_run_id", "=", runId).execute();
  if (existing.length > 0) {
    await trx.updateTable("activity").set({ title }).where("label_run_id", "=", runId).execute();
    return;
  }
  const members = await trx
    .selectFrom("thread_members")
    .select("account_id")
    .where("thread_id", "=", run.thread_id)
    .where("state", "=", "accepted")
    .execute();
  if (members.length === 0) return;
  await trx
    .insertInto("activity")
    .values(
      members.map((m) => ({
        account_id: m.account_id,
        kind: "labelled" as const,
        sent: false,
        reason: "design" as const,
        title,
        body: null,
        send: null,
        thread_id: run.thread_id,
        content_id: null,
        about_account_id: null,
        member_id: null,
        request_id: null,
        label_run_id: runId,
      })),
    )
    .execute();
}

/** What each turn applied, for its footer: the labels its sorts set that are
 *  still on and still live, in the order they were set, and only in threads
 *  the viewer is in. An undone turn has none. */
export async function labelsForTurns(
  turnIds: readonly string[],
  viewerId: string,
  executor: Executor = db,
): Promise<Map<string, { id: string; name: string; colour: number }[]>> {
  const out = new Map<string, { id: string; name: string; colour: number }[]>();
  if (turnIds.length === 0) return out;
  const rows = await sql<{ turn_id: string; id: string; name: string; colour: number; at: Date }>`
    select lr.turn_id, l.id, l.name, l.colour, min(j.created_at) as at
      from label_runs lr
      join (
        select run_id, label_id, created_at from content_labels where removed_at is null
        union all
        select run_id, label_id, created_at from note_labels where removed_at is null
      ) j on j.run_id = lr.id
      join labels l on l.id = j.label_id and l.deleted_at is null
      join thread_members m on m.thread_id = l.thread_id and m.account_id = ${viewerId} and m.state = 'accepted'
     where lr.turn_id in (${sql.join([...turnIds])}) and lr.undone_at is null
     group by lr.turn_id, l.id, l.name, l.colour
     order by at, l.id`.execute(executor);
  for (const r of rows.rows) out.set(r.turn_id, [...(out.get(r.turn_id) ?? []), { id: r.id, name: r.name, colour: r.colour }]);
  return out;
}

// ---------------------------------------------------------------- the nightly sort

export interface NightlyPlan {
  create: { name: string; contentIds: string[] }[];
  apply: { labelId: string; contentIds: string[] }[];
}

/** A nightly sort's plan, applied as far as it may be. Everything the model
 *  proposed is checked here: a row or label outside the thread, a name a
 *  person deleted, a seventh label, and anything a person set or took off are
 *  each dropped, and the rest lands. It creates and applies and never removes:
 *  the plan has no way to say remove. Returns what landed. */
export async function applyNightlyPlan(
  trx: Transaction<Database>,
  accountId: string,
  threadId: string,
  plan: NightlyPlan,
  words: (facts: { threadName: string; rows: number; labels: string[] }) => string,
): Promise<{ created: number; applied: number }> {
  const run = await trx
    .insertInto("label_runs")
    .values({ thread_id: threadId, kind: "nightly", set_by: "offload" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const actor: Actor = { accountId, via: "offload", runId: run.id };
  let created = 0;
  let applied = 0;

  // Only rows of this thread are ever named to applyLabels, so one stray id
  // costs its own entry and not the plan.
  const allIds = [...new Set([...plan.create, ...plan.apply].flatMap((entry) => entry.contentIds))];
  const inThread = new Set(
    allIds.length === 0
      ? []
      : (
          await trx
            .selectFrom("content")
            .select("id")
            .where("id", "in", allIds)
            .where("thread_id", "=", threadId)
            .where("deleted_at", "is", null)
            .execute()
        ).map((r) => r.id),
  );
  const rowsOf = (ids: string[]) => ids.filter((id) => inThread.has(id));

  const place = async (labelId: string, ids: string[]) => {
    const rows = rowsOf(ids);
    if (rows.length === 0) return;
    try {
      const out = await applyLabels(trx, actor, threadId, { content: rows }, [labelId], [], { skipRefused: true });
      applied += out.applied.length;
    } catch (error) {
      if (!(error instanceof NotYours) && !(error instanceof LabelRefused)) throw error;
    }
  };

  const live = await liveLabelsOf(trx, threadId);
  for (const entry of plan.create) {
    if (rowsOf(entry.contentIds).length === 0) continue;
    let name: string;
    try {
      name = normaliseLabelName(entry.name);
    } catch {
      continue;
    }
    const existing = live.find((label) => label.name.toLowerCase() === name.toLowerCase());
    let labelId = existing?.id;
    if (!labelId) {
      try {
        const made = await createLabel(trx, actor, threadId, { name });
        live.push({ id: made.id, name: made.name, colour: made.colour });
        labelId = made.id;
        created += 1;
      } catch (error) {
        if (error instanceof LabelRefused) continue;
        throw error;
      }
    }
    await place(labelId, entry.contentIds);
  }
  for (const entry of plan.apply) {
    if (!live.some((label) => label.id === entry.labelId)) continue;
    await place(entry.labelId, entry.contentIds);
  }

  // A label made for rows that all turned out to be refused holds nothing
  // offload set; it goes rather than sitting empty in the bar.
  await trx.updateTable("threads").set({ labels_sorted_at: sql`now()` }).where("id", "=", threadId).execute();
  if (applied === 0) {
    if (created > 0) await undoRun(trx, run.id);
    return { created: 0, applied: 0 };
  }
  await recordSortActivity(trx, run.id, words);
  return { created, applied };
}
