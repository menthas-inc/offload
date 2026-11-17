// 052. What a turn's reply draws beside its words: slices of where it landed.
//
// **Ids are stored; rows are resolved,** as 013 settled for answers. What a
// turn wrote is found by `derived_from_message_id`, what it changed by
// `turn_changes`, what an answer showed by `message_content` and
// `messages.shown`, and every row is then read through `readable_content` as
// the reader, now. A row the reader can no longer read is absent and its
// thread is never named (OFF-3, SEC-2).
//
// One query per source over the whole page of turns, as `foundFor` does.

import { sql } from "kysely";
import { db } from "../db.js";
import { foundFor, rowsByIds, type FoundRow } from "../search/found.js";
import { zoneOf } from "../accounts/zone.js";
import { dayIn } from "@offload/widgets";
import type { MemoryClass } from "../schema.js";
import { pillsFor, type Pill } from "./pills.js";

export interface ThreadRef {
  id: string;
  /** Null for the default thread, which the client heads Not in a thread. */
  name: string | null;
  icon: string | null;
  hue: number | null;
}

export interface SliceNote {
  id: string;
  text: string;
  marked: boolean;
}

export type Slice =
  | {
      kind: "list";
      thread: ThreadRef;
      openCount: number;
      rows: FoundRow[];
      marked: string[];
      notes: SliceNote[];
      /** An edited row's dates before the turn, while its Undo still holds them. */
      previous: Record<string, { dueAt?: string | null; occursAt?: string | null }>;
      truncated: boolean;
    }
  | { kind: "newThread"; thread: ThreadRef; rows: FoundRow[]; notes: SliceNote[] }
  | { kind: "memories"; memoryKind: MemoryClass; memories: SliceNote[] }
  | { kind: "calendar"; period: { from: string; to: string }; day: string; marked: string[]; span: boolean }
  | { kind: "removed" };

export type SummaryKind = "new" | "filed" | "moved" | "ticked" | "changed" | "started" | "remembered" | "added";

export interface Reply {
  slices: Slice[];
  /** The threads a turn reached past its third slice. */
  also: ThreadRef[];
  pills: Pill[];
  summary: { kind: SummaryKind; count: number } | null;
  /** When the turn's result arrived: the client's clock for the first eight seconds. */
  resultAt: string | null;
}

export interface PageMessage {
  id: string;
  role: "person" | "offload";
  turn_id: string;
  created_at: Date;
}

/** A database timestamp as milliseconds, whatever the driver handed back. */
const ms = (at: unknown): number => new Date(at as string | Date).getTime();

const MAX_SLICES = 3;
/** Open rows from before the turn shown above its own, per list slice. */
const NEIGHBOURS = 2;

function addDays(day: string, n: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}
function mondayOf(day: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  return addDays(day, -((at.getUTCDay() + 6) % 7));
}
function lastOfMonth(day: string): string {
  const at = new Date(`${day.slice(0, 8)}01T12:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() + 1);
  at.setUTCDate(0);
  return at.toISOString().slice(0, 10);
}

/** The period a reply's calendar draws around `day`: this week and the next as
 *  two weeks, otherwise the day's month. */
export function periodFor(day: string, today: string): { from: string; to: string } {
  const from = mondayOf(today);
  if (day >= from && day <= addDays(from, 13)) return { from, to: addDays(from, 13) };
  return { from: `${day.slice(0, 8)}01`, to: lastOfMonth(day) };
}

export async function repliesFor(accountId: string, page: PageMessage[]): Promise<Map<string, Reply>> {
  const out = new Map<string, Reply>();
  if (page.length === 0) return out;

  const persons = page.filter((m) => m.role === "person");
  const offloads = page.filter((m) => m.role === "offload");
  const personIds = persons.map((m) => m.id);
  const turnOf = new Map(page.map((m) => [m.id, m.turn_id]));
  const startOf = new Map<string, Date>();
  for (const m of persons) {
    const was = startOf.get(m.turn_id);
    if (!was || m.created_at < was) startOf.set(m.turn_id, m.created_at);
  }

  const zone = await zoneOf(accountId);
  const today = dayIn(new Date(), zone);

  const [written, changes, notes, settled, shownRows, found] = await Promise.all([
    // What the turn made: its own rows, readable or not, so a turn whose rows
    // are all out of reach reads as removed rather than as having done nothing.
    personIds.length
      ? db
          .selectFrom("content")
          .select(["id", "derived_from_message_id as messageId", "created_at"])
          .where("derived_from_message_id", "in", personIds)
          .where("account_id", "=", accountId)
          .orderBy("created_at")
          .orderBy("id")
          .execute()
      : [],
    personIds.length
      ? db
          .selectFrom("turn_changes")
          .select(["message_id as messageId", "target_kind as kind", "target_id as targetId", "tool", "previous", "created_at"])
          .where("message_id", "in", personIds)
          .where("account_id", "=", accountId)
          .orderBy("created_at")
          .execute()
      : [],
    personIds.length
      ? db
          .selectFrom("notes")
          .select(["id", "derived_from_message_id as messageId", "scope", "subject_id as subjectId", "kind", "text", "created_at", "deleted_at", "superseded_at"])
          .where("derived_from_message_id", "in", personIds)
          .where("account_id", "=", accountId)
          .orderBy("created_at")
          .execute()
      : [],
    personIds.length
      ? db.selectFrom("messages").select(["turn_id", "settled_at"]).where("id", "in", personIds).execute()
      : [],
    offloads.length
      ? db.selectFrom("messages").select(["turn_id", "shown"]).where("id", "in", offloads.map((m) => m.id)).where("shown", "is not", null).execute()
      : [],
    foundFor(offloads.map((m) => m.id), accountId),
  ]);

  // Every content row any turn on the page made or changed, read as the reader.
  const contentIds = [...new Set([...written.map((r) => r.id), ...changes.filter((c) => c.kind === "content").map((c) => c.targetId)])];
  const rows = await rowsByIds(contentIds, accountId);

  // The threads the turns made, by `create_thread`'s record, read as the reader.
  const madeThreadIds = [...new Set(changes.filter((c) => c.tool === "create_thread").map((c) => c.targetId))];
  const readableThreads = await threadsReadable(accountId, [
    ...madeThreadIds,
    ...[...rows.values()].map((r) => r.threadId),
    ...notes.filter((n) => n.scope === "thread" && n.subjectId).map((n) => n.subjectId!),
  ]);

  type Draft = { key: string; at: number; slice: Slice };
  const drafts = new Map<string, Draft[]>();
  const summaries = new Map<string, Reply["summary"]>();
  const neighbourAsks: { key: string; turnId: string; threadId: string; before: Date; exclude: string[] }[] = [];
  const touchedAny = new Set<string>();

  for (const turnId of new Set(persons.map((m) => m.turn_id))) {
    const own = (messageId: string | null) => !!messageId && turnOf.get(messageId) === turnId;
    const made = written.filter((r) => own(r.messageId));
    const changed = changes.filter((c) => own(c.messageId));
    const turnNotes = notes.filter((n) => own(n.messageId) && !n.deleted_at && !n.superseded_at);
    const madeThreads = changed.filter((c) => c.tool === "create_thread" && readableThreads.has(c.targetId)).map((c) => c.targetId);
    const list: Draft[] = [];
    const sliceFor = new Map<string, Draft>();

    if (made.length || changed.length || turnNotes.length) touchedAny.add(turnId);

    // Rows, in the order the turn wrote them: what it made, then what it changed.
    const ordered: { id: string; at: number; tool: string | null; previous: Record<string, unknown> | null }[] = [
      ...made.map((r) => ({ id: r.id, at: ms(r.created_at), tool: null, previous: null })),
      ...changed.filter((c) => c.kind === "content" && !made.some((m) => m.id === c.targetId)).map((c) => ({ id: c.targetId, at: ms(c.created_at), tool: c.tool, previous: c.previous as Record<string, unknown> | null })),
    ].sort((a, b) => a.at - b.at);

    for (const entry of ordered) {
      const row = rows.get(entry.id);
      if (!row || !readableThreads.has(row.threadId)) continue;
      const thread = readableThreads.get(row.threadId)!;
      const dated = (row.occursAt ?? row.dueAt) !== null;
      if (madeThreads.includes(row.threadId)) {
        const key = `new:${row.threadId}`;
        let d = sliceFor.get(key);
        if (!d) {
          d = { key, at: entry.at, slice: { kind: "newThread", thread, rows: [], notes: [] } };
          sliceFor.set(key, d);
          list.push(d);
        }
        if (d.slice.kind === "newThread") d.slice.rows.push(row);
        continue;
      }
      if (dated && !row.done && entry.tool !== "complete_content") {
        const key = "calendar";
        let d = sliceFor.get(key);
        if (!d) {
          const day = dayIn(new Date(row.occursAt ?? row.dueAt!), zone);
          d = { key, at: entry.at, slice: { kind: "calendar", period: periodFor(day, today), day, marked: [], span: false } };
          sliceFor.set(key, d);
          list.push(d);
        }
        if (d.slice.kind === "calendar") d.slice.marked.push(row.contentId);
        continue;
      }
      const key = `list:${row.threadId}`;
      let d = sliceFor.get(key);
      if (!d) {
        d = { key, at: entry.at, slice: { kind: "list", thread, openCount: 0, rows: [], marked: [], notes: [], previous: {}, truncated: false } };
        sliceFor.set(key, d);
        list.push(d);
      }
      if (d.slice.kind === "list") {
        d.slice.rows.push(row);
        d.slice.marked.push(row.contentId);
        const prev = entry.previous;
        if (prev && ("occurs_at" in prev || "due_at" in prev)) {
          d.slice.previous[row.contentId] = {
            ...("occurs_at" in prev ? { occursAt: (prev.occurs_at as string | null) ?? null } : {}),
            ...("due_at" in prev ? { dueAt: (prev.due_at as string | null) ?? null } : {}),
          };
        }
      }
    }

    // A thread the turn made and put nothing in still shows, as itself.
    for (const threadId of madeThreads) {
      const key = `new:${threadId}`;
      if (!sliceFor.has(key)) {
        const at = ms(changed.find((c) => c.targetId === threadId)!.created_at);
        const d: Draft = { key, at, slice: { kind: "newThread", thread: readableThreads.get(threadId)!, rows: [], notes: [] } };
        sliceFor.set(key, d);
        list.push(d);
      }
    }

    // Notes: a thread's go under its slice, memories under their kind.
    for (const note of turnNotes) {
      if (note.scope === "thread" && note.subjectId && readableThreads.has(note.subjectId)) {
        const newKey = `new:${note.subjectId}`;
        const listKey = `list:${note.subjectId}`;
        let d = sliceFor.get(newKey) ?? sliceFor.get(listKey);
        if (!d) {
          d = { key: listKey, at: ms(note.created_at), slice: { kind: "list", thread: readableThreads.get(note.subjectId)!, openCount: 0, rows: [], marked: [], notes: [], previous: {}, truncated: false } };
          sliceFor.set(listKey, d);
          list.push(d);
        }
        if (d.slice.kind === "list" || d.slice.kind === "newThread") d.slice.notes.push({ id: note.id, text: note.text, marked: true });
      } else if (note.scope === "account" && note.subjectId === accountId) {
        const kind = note.kind as MemoryClass;
        const key = `memories:${kind}`;
        let d = sliceFor.get(key);
        if (!d) {
          d = { key, at: ms(note.created_at), slice: { kind: "memories", memoryKind: kind, memories: [] } };
          sliceFor.set(key, d);
          list.push(d);
        }
        if (d.slice.kind === "memories") d.slice.memories.push({ id: note.id, text: note.text, marked: true });
      }
    }

    list.sort((a, b) => a.at - b.at);
    drafts.set(turnId, list);

    for (const d of list) {
      if (d.slice.kind === "list") {
        neighbourAsks.push({ key: `${turnId}|${d.key}`, turnId, threadId: d.slice.thread.id, before: startOf.get(turnId)!, exclude: d.slice.marked });
      }
    }

    summaries.set(turnId, summaryOf(made.length, changed, turnNotes, madeThreads, new Set(made.map((r) => rows.get(r.id)?.threadId).filter(Boolean)).size));
  }

  // Answers: what they read, as list slices, and what they showed, as a calendar.
  for (const message of offloads) {
    const turnId = message.turn_id;
    const list = drafts.get(turnId) ?? [];
    for (const result of found.get(message.id) ?? []) {
      const thread = { id: result.threadId, name: result.threadName, icon: result.threadIcon, hue: result.threadHue };
      list.push({ key: `found:${result.threadId}`, at: Number.MAX_SAFE_INTEGER, slice: { kind: "list", thread, openCount: 0, rows: result.rows, marked: [], notes: [], previous: {}, truncated: result.truncated } });
    }
    const shown = shownRows.find((s) => s.turn_id === turnId)?.shown;
    if (shown && "span" in shown) {
      list.push({ key: "shown", at: Number.MAX_SAFE_INTEGER, slice: { kind: "calendar", period: shown.span, day: shown.span.from, marked: [], span: true } });
    } else if (shown && "on" in shown) {
      list.push({ key: "shown", at: Number.MAX_SAFE_INTEGER, slice: { kind: "calendar", period: periodFor(shown.on, today), day: shown.on, marked: [], span: false } });
    }
    drafts.set(turnId, list);
  }

  // The pills, one batch for the page.
  const turnIds = [...new Set(persons.map((m) => m.turn_id))];
  const pills = await pillsFor(accountId, turnIds.map((turnId) => ({ turnId, personIds: persons.filter((m) => m.turn_id === turnId).map((m) => m.id) })));

  // The neighbours and the open counts, one query each for the page.
  const neighbours = await neighboursFor(accountId, neighbourAsks);
  const listThreads = [...new Set([...drafts.values()].flat().flatMap((d) => (d.slice.kind === "list" ? [d.slice.thread.id] : [])))];
  const counts = await openCounts(accountId, listThreads);
  const neighbourRows = await rowsByIds([...new Set([...neighbours.values()].flat())], accountId);

  for (const [turnId, list] of drafts) {
    for (const d of list) {
      if (d.slice.kind !== "list") continue;
      d.slice.openCount = counts.get(d.slice.thread.id) ?? 0;
      const before = (neighbours.get(`${turnId}|${d.key}`) ?? []).map((id) => neighbourRows.get(id)).filter((r): r is FoundRow => !!r);
      if (before.length) d.slice.rows = [...before.reverse(), ...d.slice.rows];
    }
    const slices = list.map((d) => d.slice);
    const shown = slices.slice(0, MAX_SLICES);
    const also = slices
      .slice(MAX_SLICES)
      .flatMap((s) => (s.kind === "list" || s.kind === "newThread" ? [s.thread] : []));
    const resultAt = settled.find((s) => s.turn_id === turnId)?.settled_at ?? null;
    out.set(turnId, {
      slices: shown.length === 0 && touchedAny.has(turnId) ? [{ kind: "removed" }] : shown,
      also,
      pills: pills.get(turnId) ?? [],
      summary: summaries.get(turnId) ?? null,
      resultAt: resultAt ? new Date(resultAt).toISOString() : null,
    });
  }
  for (const message of page) {
    if (!out.has(message.turn_id)) {
      out.set(message.turn_id, { slices: drafts.get(message.turn_id)?.map((d) => d.slice) ?? [], also: [], pills: [], summary: null, resultAt: null });
    }
  }
  return out;
}

function summaryOf(
  made: number,
  changed: { tool: string; kind: string }[],
  notes: { scope: string }[],
  madeThreads: string[],
  threadsWritten: number,
): Reply["summary"] {
  if (madeThreads.length) return { kind: "started", count: madeThreads.length };
  const memories = notes.filter((n) => n.scope === "account").length;
  const threadNotes = notes.length - memories;
  if (made + threadNotes > 0) return { kind: threadsWritten > 1 ? "filed" : "new", count: made + threadNotes };
  if (memories > 0) return { kind: "remembered", count: memories };
  const rowChanges = changed.filter((c) => c.kind === "content");
  if (rowChanges.length && rowChanges.every((c) => c.tool === "complete_content")) return { kind: "ticked", count: rowChanges.length };
  if (rowChanges.length && rowChanges.every((c) => c.tool === "move_content" || c.tool === "edit_content")) return { kind: "moved", count: rowChanges.length };
  if (changed.length) return { kind: "changed", count: changed.length };
  return null;
}

/** The threads among `ids` the reader is in now, as they draw. */
async function threadsReadable(accountId: string, ids: string[]): Promise<Map<string, ThreadRef>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const found = await sql<{ id: string; name: string | null; icon: string | null; hue: number | null }>`
    select t.id::text as id,
           case when t.id = a.default_thread_id then null else t.name end as name,
           case when t.id = a.default_thread_id then null else t.icon end as icon,
           case when t.id = a.default_thread_id then null else t.hue end as hue
    from threads t
    join thread_members m on m.thread_id = t.id and m.account_id = ${accountId}::uuid and m.state = 'accepted'
    join accounts a on a.id = ${accountId}::uuid
    where t.id = any(${unique}::uuid[]) and t.deleted_at is null`.execute(db);
  return new Map(found.rows.map((t) => [t.id, t]));
}

async function neighboursFor(
  accountId: string,
  asks: { key: string; threadId: string; before: Date; exclude: string[] }[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (asks.length === 0) return out;
  const found = await sql<{ key: string; id: string }>`
    select k.key, c.id::text as id
    from unnest(${asks.map((a) => a.key)}::text[], ${asks.map((a) => a.threadId)}::uuid[], ${asks.map((a) => a.before.toISOString())}::timestamptz[])
      as k(key, thread_id, before)
    cross join lateral (
      select c.id from readable_content c
      where c.viewer_account_id = ${accountId}::uuid and c.thread_id = k.thread_id
        and c.deleted_at is null and c.done_at is null and c.archived_at is null
        and c.created_at < k.before
      order by c.created_at desc
      limit ${NEIGHBOURS}
    ) c`.execute(db);
  for (const row of found.rows) {
    const ask = asks.find((a) => a.key === row.key)!;
    if (ask.exclude.includes(row.id)) continue;
    out.set(row.key, [...(out.get(row.key) ?? []), row.id]);
  }
  return out;
}

async function openCounts(accountId: string, threadIds: string[]): Promise<Map<string, number>> {
  if (threadIds.length === 0) return new Map();
  const found = await sql<{ thread_id: string; n: number }>`
    select c.thread_id::text as thread_id, count(*)::int as n
    from readable_content c
    where c.viewer_account_id = ${accountId}::uuid and c.thread_id = any(${threadIds}::uuid[])
      and c.deleted_at is null and c.done_at is null and c.archived_at is null
    group by c.thread_id`.execute(db);
  return new Map(found.rows.map((r) => [r.thread_id, r.n]));
}

