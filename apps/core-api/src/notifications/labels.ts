// 042. What a pass may label, what a task may be for, and what the Core API
// keeps of what a pass answered.
//
// **The model proposes, this decides.** The pass names things by id; every id
// is checked against the set the database itself says may be labelled, which
// is the member's own, the person's own words, and not stopped. An anchor is
// checked the same way, and a name is kept only as a run of the thing's own
// text, since a name reaches a lock screen. One definition of each set lives
// in the database (`reminders_wanted`, `reminder_anchors`, migration 0089), so
// the daily run, the worker and this file cannot drift apart.

import { sql } from "kysely";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import type { Executor } from "../threads/access.js";
import type { RemindKind, RemindLead } from "../schema.js";

export interface Ref {
  of: "content" | "note";
  id: string;
}

export interface Wanted extends Ref {
  /** The thing's own date, or null for an undated task. */
  at: Date | null;
  born: Date;
}

export interface LabelEntry extends Ref {
  kind: RemindKind;
  lead: RemindLead;
  before?: Ref | null | undefined;
  name?: string | null | undefined;
}

export async function wantedLabels(trx: Executor, accountId: string, threadId: string): Promise<Wanted[]> {
  const result = await sql<Wanted>`
    select "of", id, at, born from reminders_wanted(${accountId}::uuid, ${threadId}::uuid)
  `.execute(trx);
  return result.rows;
}

export async function anchorsFor(trx: Executor, threadId: string): Promise<(Ref & { at: Date })[]> {
  const result = await sql<Ref & { at: Date }>`select "of", id, at from reminder_anchors(${threadId}::uuid)`.execute(trx);
  return result.rows;
}

/** Things a pass is shown to label in one thread, and anchors beside them
 *  (OFF-8). The worker's caps are the same numbers. */
export const LABELS_SHOWN = 30;
export const ANCHORS_SHOWN = 20;

const key = (found: Ref) => `${found.of}:${found.id}`;
const ADDRESS = /:\/\/|www\.|@|[a-z0-9-]\.[a-z]{2,}/i;
const FOUR_DIGITS = /\d{4}/;

/** A name reaches a lock screen, so it is only ever words the thing already
 *  holds: found in its text once spacing and case are set aside, and never an
 *  address or a number long enough to be one somebody would not want shown. */
export function nameIsOwn(name: string, text: string): boolean {
  const flat = (words: string) => words.replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = flat(name);
  if (wanted.length === 0 || wanted.length > 60) return false;
  if (ADDRESS.test(wanted) || FOUR_DIGITS.test(wanted)) return false;
  return flat(text).includes(wanted);
}

/** Keep what the pass may write. Whatever it was shown and left unlabelled is
 *  `none`, so a thing the model skips is not booked again every night. */
export async function applyLabels(
  trx: Executor,
  input: { accountId: string; threadId: string; shown: Ref[]; entries: LabelEntry[] },
): Promise<{ labelled: number; ignored: number }> {
  const wanted = new Map((await wantedLabels(trx, input.accountId, input.threadId)).map((found) => [key(found), found]));
  const anchors = new Set((await anchorsFor(trx, input.threadId)).map(key));

  // Only words of a note this pass may label: the ids are the worker's, and
  // the wanted set is reminders_wanted's, already scoped to the account.
  const noteIds = input.entries.filter((entry) => entry.of === "note" && entry.name && wanted.has(key(entry))).map((entry) => entry.id);
  const texts = new Map(
    noteIds.length === 0
      ? []
      : (await trx.selectFrom("notes").select(["id", "text"]).where("id", "in", noteIds).where("account_id", "=", input.accountId).execute()).map(
          (n) => [n.id, n.text],
        ),
  );

  let labelled = 0;
  let ignored = 0;
  const done = new Set<string>();
  const entries: LabelEntry[] = [...input.entries];
  for (const shown of input.shown) {
    if (!input.entries.some((entry) => key(entry) === key(shown))) entries.push({ ...shown, kind: "none", lead: "none" });
  }

  for (const entry of entries) {
    const found = wanted.get(key(entry));
    if (!found || done.has(key(entry))) {
      ignored += 1;
      continue;
    }
    done.add(key(entry));
    // A task is for another thing only when it has no date of its own.
    const before = entry.before && found.of === "content" && found.at === null && anchors.has(key(entry.before)) ? entry.before : null;
    const name = entry.of === "note" && entry.name && nameIsOwn(entry.name, texts.get(entry.id) ?? "") ? entry.name.replace(/\s+/g, " ").trim() : null;
    await write(trx, input.accountId, entry, before, name);
    labelled += 1;
  }
  return { labelled, ignored };
}

async function write(trx: Executor, accountId: string, entry: LabelEntry, before: Ref | null, name: string | null): Promise<void> {
  const fingerprint =
    entry.of === "content"
      ? sql<string>`(select content_fingerprint(c) from content c where c.id = ${entry.id}::uuid)`
      : sql<string>`(select note_fingerprint(n) from notes n where n.id = ${entry.id}::uuid)`;
  const born =
    entry.of === "content"
      ? sql<Date>`(select created_at from content where id = ${entry.id}::uuid)`
      : sql<Date>`(select created_at from notes where id = ${entry.id}::uuid)`;
  const values = {
    kind: entry.kind,
    lead: entry.lead,
    anchor_content_id: before?.of === "content" ? before.id : null,
    anchor_note_id: before?.of === "note" ? before.id : null,
    name,
    fingerprint,
    labelled_at: sql<Date>`now()`,
  };
  const column = entry.of === "content" ? "content_id" : "note_id";
  await trx
    .insertInto("reminder_labels")
    .values({ account_id: accountId, [column]: entry.id, date_set_at: born, ...values } as never)
    .onConflict((oc) => oc.column(column).where(column, "is not", null).doUpdateSet(values as never))
    .execute();
}

/** A memory about the person themselves that names their birthday. */
export const OWN_BIRTHDAY = /\b(their|my)\s+(own\s+)?birthday\b/i;

/** Memories a memory pass is shown to date, at most this many a night. */
export const MEMORIES_SHOWN = 20;

export async function memoriesToDate(trx: Executor, accountId: string): Promise<{ id: string; kind: string; text: string }[]> {
  const result = await sql<{ id: string; kind: string; text: string }>`select id, kind, text from memories_to_date(${accountId}::uuid)`.execute(trx);
  return result.rows;
}

export interface MemoryDate {
  id: string;
  /** `MM-DD`, checked a real day by the route. */
  on: string;
  lead: RemindLead;
  name?: string | null | undefined;
}

/** A memory that states a yearly date carries it; one shown and not dated is
 *  `none`, so it is not shown again until its words change. Always an
 *  occasion: a memory is never a deadline, a trip or an appointment. */
export async function applyMemoryDates(
  trx: Executor,
  input: { accountId: string; shown: string[]; dates: MemoryDate[] },
): Promise<{ dated: number; ignored: number }> {
  const wanted = new Map((await memoriesToDate(trx, input.accountId)).map((m) => [m.id, m]));
  const entries: (MemoryDate | { id: string; on: null; lead: "none" })[] = [...input.dates];
  for (const id of input.shown) if (!input.dates.some((date) => date.id === id)) entries.push({ id, on: null, lead: "none" });
  let dated = 0;
  let ignored = 0;
  const done = new Set<string>();
  for (const entry of entries) {
    const memory = wanted.get(entry.id);
    if (!memory || done.has(entry.id)) {
      ignored += 1;
      continue;
    }
    done.add(entry.id);
    const name = "name" in entry && entry.name && nameIsOwn(entry.name, memory.text) ? entry.name.replace(/\s+/g, " ").trim() : null;
    // Never their own birthday, whatever the pass answers (AC-4).
    const on = memory.kind === "about" && OWN_BIRTHDAY.test(memory.text) ? null : entry.on;
    const values = {
      kind: on ? "occasion" : "none",
      lead: on ? entry.lead : "none",
      yearly_on: on,
      name,
      fingerprint: sql<string>`(select note_fingerprint(n) from notes n where n.id = ${entry.id}::uuid)`,
      labelled_at: sql<Date>`now()`,
    };
    // 051. A memory on a calendar follows its new day there: moved, or
    // deleted when its words no longer hold one. Read before the label moves.
    // shortcut: an edit in the tab moves the event at the next nightly pass,
    // not at the edit; read the day in `changeMemory` if the lag is noticed.
    const was = await trx
      .selectFrom("notes as n")
      .leftJoin("reminder_labels as l", "l.note_id", "n.id")
      .select(["n.event_ref", "l.yearly_on"])
      .where("n.id", "=", entry.id)
      .executeTakeFirst();
    await trx
      .insertInto("reminder_labels")
      .values({ account_id: input.accountId, note_id: entry.id, date_set_at: sql<Date>`(select created_at from notes where id = ${entry.id}::uuid)`, ...values } as never)
      .onConflict((oc) => oc.column("note_id").where("note_id", "is not", null).doUpdateSet(values as never))
      .execute();
    if (was?.event_ref && was.yearly_on !== on) {
      await enqueue({
        kind: "memory.event",
        accountId: input.accountId,
        payload: { noteId: entry.id, accountId: input.accountId, action: on ? "move" : "undate", on },
        priority: PRIORITY.background,
        tx: trx,
      });
    }
    dated += 1;
  }
  return { dated, ignored };
}

/** An edit to a row, seen from its reminders. A date another member set or
 *  moved holds them until the author edits the thing; any edit by the author
 *  lets them go, and a date the author set is when the two-day rule counts
 *  from. Nobody can arrange for somebody else to be woken. */
export async function dateSet(
  trx: Executor,
  edit: { contentId: string; actorId: string; dated: boolean; worded?: boolean },
): Promise<void> {
  const row = await trx.selectFrom("content").select("account_id").where("id", "=", edit.contentId).executeTakeFirst();
  const author = row?.account_id;
  if (!author) return;
  if (author !== edit.actorId) {
    // Their words are what a reminder says, so another member's words hold
    // it as their date does (the security review of 2026-10-10).
    if (!edit.dated && !edit.worded) return;
    const held = { held_at: sql<Date>`now()`, ...(edit.dated ? { date_set_at: sql<Date>`now()` } : {}) };
    await trx
      .insertInto("reminder_labels")
      .values({ account_id: author, content_id: edit.contentId, ...held } as never)
      .onConflict((oc) => oc.column("content_id").where("content_id", "is not", null).doUpdateSet(held as never))
      .execute();
    return;
  }
  const mine = { held_at: null, ...(edit.dated ? { date_set_at: sql<Date>`now()` } : {}) };
  if (edit.dated) {
    await trx
      .insertInto("reminder_labels")
      .values({ account_id: author, content_id: edit.contentId, date_set_at: sql<Date>`now()` } as never)
      .onConflict((oc) => oc.column("content_id").where("content_id", "is not", null).doUpdateSet(mine as never))
      .execute();
  } else {
    await trx.updateTable("reminder_labels").set(mine as never).where("content_id", "=", edit.contentId).execute();
  }
}

export type Reminders = "on" | "off";

/** The author's Remind me for one thing: a row, a thread note or a memory.
 *  False when the account is not its author, or the thing is not what `of`
 *  says, so a route answers exactly as it does for a thing that does not
 *  exist. Off is for good: the pass never labels it again. */
export async function setReminders(
  trx: Executor,
  input: { accountId: string; of: "content" | "note" | "memory"; id: string; on: boolean },
): Promise<boolean> {
  const { accountId, id } = input;
  const mine =
    input.of === "content"
      ? await trx
          .selectFrom("content as c")
          .innerJoin("thread_members as tm", (join) => join.onRef("tm.thread_id", "=", "c.thread_id").on("tm.account_id", "=", accountId).on("tm.state", "=", "accepted"))
          .select("c.id")
          .where("c.id", "=", id)
          .where("c.account_id", "=", accountId)
          .where("c.deleted_at", "is", null)
          .executeTakeFirst()
      : input.of === "note"
        ? await trx
            .selectFrom("notes as n")
            .innerJoin("thread_members as tm", (join) => join.onRef("tm.thread_id", "=", "n.subject_id").on("tm.account_id", "=", accountId).on("tm.state", "=", "accepted"))
            .select("n.id")
            .where("n.id", "=", id)
            .where("n.scope", "=", "thread")
            .where("n.account_id", "=", accountId)
            .where("n.deleted_at", "is", null)
            .executeTakeFirst()
        : await trx
            .selectFrom("notes")
            .select("id")
            .where("id", "=", id)
            .where("scope", "=", "account")
            .where("subject_id", "=", accountId)
            .where("account_id", "=", accountId)
            .where("deleted_at", "is", null)
            .executeTakeFirst();
  if (!mine) return false;
  const column = input.of === "content" ? "content_id" : "note_id";
  const stopped = input.on ? null : sql<Date>`now()`;
  await trx
    .insertInto("reminder_labels")
    .values({ account_id: accountId, [column]: id, stopped_at: stopped } as never)
    .onConflict((oc) => oc.column(column).where(column, "is not", null).doUpdateSet({ stopped_at: stopped } as never))
    .execute();
  return true;
}

/** What the author's switch showed for a row, for Undo's snapshot: on while
 *  offload will remind them or they asked, off once stopped, else null. */
export async function remindersOfRow(trx: Executor, accountId: string, contentId: string, asked: boolean): Promise<Reminders | null> {
  const label = await trx
    .selectFrom("reminder_labels")
    .select(["kind", "stopped_at"])
    .where("content_id", "=", contentId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (label?.stopped_at) return "off";
  return asked || (label?.kind && label.kind !== "none") ? "on" : null;
}

/** A note of the author's whose words another member's turn rewrote: its
 *  reminders wait for the author, as a row's do. */
export async function noteWordsSet(trx: Executor, edit: { noteId: string; actorId: string }): Promise<void> {
  const note = await trx.selectFrom("notes").select("account_id").where("id", "=", edit.noteId).executeTakeFirst();
  if (!note?.account_id || note.account_id === edit.actorId) return;
  await trx
    .updateTable("reminder_labels")
    .set({ held_at: sql<Date>`now()` } as never)
    .where("note_id", "=", edit.noteId)
    .execute();
}

/** What the author's bell and switch read, for many things at once: "on"
 *  while offload will remind them about it, "off" once they stopped it, null
 *  otherwise and null to anybody but the author, so a shared row never tells
 *  the others whether its author will be reminded. */
export async function remindersOf(
  trx: Executor,
  of: "content" | "note",
  ids: readonly string[],
  viewerId: string,
): Promise<Map<string, Reminders>> {
  const out = new Map<string, Reminders>();
  if (ids.length === 0) return out;
  const column = of === "content" ? sql.ref("l.content_id") : sql.ref("l.note_id");
  const own =
    of === "content"
      ? sql`(select coalesce(c.rrule is not null, false)
                or (case when c.type = 'event' then c.occurs_at else c.due_at end) >= now() - interval '1 day'
             from content c where c.id = l.content_id)`
      : sql`(select l.yearly_on is not null or n.rrule is not null
                or coalesce(n.occurs_at, n.due_at) >= now() - interval '1 day'
             from notes n where n.id = l.note_id)`;
  const rows = await sql<{ id: string; kind: string | null; stopped: boolean; ahead: boolean | null }>`
    select ${column} as id, l.kind, l.stopped_at is not null as stopped,
           (${own}
            or (select case when ac.type = 'event' then ac.occurs_at else ac.due_at end from content ac where ac.id = l.anchor_content_id) >= now() - interval '1 day'
            or (select coalesce(an.occurs_at, an.due_at) from notes an where an.id = l.anchor_note_id) >= now() - interval '1 day') as ahead
      from reminder_labels l
     where ${column} in (${sql.join(ids.map((id) => sql`${id}::uuid`))})
       and l.account_id = ${viewerId}::uuid
  `.execute(trx);
  for (const row of rows.rows) {
    if (row.stopped) out.set(row.id, "off");
    else if (row.kind && row.kind !== "none" && row.ahead) out.set(row.id, "on");
  }
  return out;
}

