// 049. What the Search page reads: four short lists, as the person types.
//
// Words on every keystroke, from the start of a word, under the configuration
// that folds accents; meaning too when the route hands in a vector. Thread
// names match any run of letters, so *bon* finds Lisbon trip. Every arm reads
// through what already carries membership: `readable_content`,
// `readable_notes` and `noteFilter`, `active()` for memories, `thread_members`
// for names. No membership rule is written in this file.
//
// **The query is content.** It is never logged here and never leaves in an
// error: the terms are letters and digits, bound as parameters.

import { sql, type RawBuilder } from "kysely";
import { db } from "../db.js";
import { active } from "../memories/store.js";
import type { MemoryClass } from "../schema.js";
import type { Executor } from "../threads/access.js";
import { NOT_IN_A_THREAD } from "../threads/default.js";
import { ANSWER_ROW_CHARS, contentArms, fuse, noteFilter } from "./read.js";

export const PAGE_LIMITS = { threads: 5, rows: 6, notes: 3, memories: 3 } as const;
/** What the field takes; anything longer is cut, never refused. */
export const QUERY_CHARS = 128;
const MAX_TERMS = 8;
/** Below this many letters only names are matched. A two-letter prefix on the
 *  heaviest account measured 21 ms (impl-spec, A0). */
const WORDS_FROM = 2;
/** Each arm's shortlist before fusion. */
const SHORTLIST = 20;

export interface PageRow {
  id: string;
  threadId: string;
  /** In the account's own Not in a thread. */
  loose: boolean;
  type: string;
  title: string;
  /** What an answer's row carries, so both clients draw the date with
   *  `foundMeta`, as answers do; a row without one shows its kind. */
  dueAt: string | null;
  occursAt: string | null;
  occursEndAt: string | null;
  allDay: boolean;
  rrule: string | null;
  archived: boolean;
}

export interface PageResult {
  threads: { id: string; name: string }[];
  /** Not in a thread matches by its name. */
  loose: boolean;
  rows: PageRow[];
  notes: { id: string; threadId: string; loose: boolean; text: string }[];
  memories: { id: string; kind: MemoryClass; text: string }[];
}

export const EMPTY: PageResult = { threads: [], loose: false, rows: [], notes: [], memories: [] };

/** The query's words: letters and digits, lower case, at most eight. Every
 *  other character separates, so nothing typed can be tsquery syntax. */
export function terms(q: string): string[] {
  return (q.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TERMS);
}

export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Case and marks off, for the one comparison made here rather than in SQL. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export async function searchPage(
  accountId: string,
  query: string,
  options: { vector?: string | null } = {},
  executor: Executor = db,
): Promise<PageResult> {
  const q = query.normalize("NFKC").slice(0, QUERY_CHARS).trim().replace(/\s+/g, " ");
  if (!q) return EMPTY;
  const words = terms(q);
  const letters = words.join("").length;

  const loose = fold(NOT_IN_A_THREAD).includes(fold(q));
  const threads = await threadsNamed(executor, accountId, q);
  if (letters < WORDS_FROM) return { ...EMPTY, threads, loose };

  const match = sql`to_tsquery('offload_search', ${words.map((w) => `${w}:*`).join(" & ")})`;
  const vector = options.vector ?? null;
  const defaultThread = sql`(select a.default_thread_id from accounts a where a.id = ${accountId}::uuid)`;
  const rows = await rowsMatching(executor, accountId, match, vector, defaultThread);
  const notes = await notesMatching(executor, accountId, match, vector, defaultThread);
  const memories = await memoriesMatching(executor, accountId, match, vector);
  return { threads, loose, rows, notes, memories };
}

async function threadsNamed(executor: Executor, accountId: string, q: string): Promise<PageResult["threads"]> {
  const pattern = `%${escapeLike(q)}%`;
  const found = await sql<{ id: string; name: string }>`
    select t.id::text as id, t.name
    from threads t
    join thread_members m on m.thread_id = t.id
    where m.account_id = ${accountId}::uuid and m.state = 'accepted'
      and t.deleted_at is null
      -- Not in a thread is matched by what it is called, never its stored name.
      and t.id is distinct from (select a.default_thread_id from accounts a where a.id = ${accountId}::uuid)
      and unaccent(t.name) ilike unaccent(${pattern}) escape '\\'
    order by position(lower(unaccent(${q})) in lower(unaccent(t.name))), t.name
    limit ${PAGE_LIMITS.threads}
  `.execute(executor);
  return found.rows;
}

async function rowsMatching(
  executor: Executor,
  accountId: string,
  match: RawBuilder<unknown>,
  vector: string | null,
  defaultThread: RawBuilder<unknown>,
): Promise<PageRow[]> {
  const arms = await contentArms(accountId, { match, vector, limit: SHORTLIST }, executor);
  const wanted = fuse(arms.live, arms.archived).slice(0, PAGE_LIMITS.rows);
  if (wanted.length === 0) return [];
  const found = await sql<{
    id: string;
    thread_id: string;
    loose: boolean;
    type: string;
    title: string;
    occurs_at: Date | null;
    occurs_end_at: Date | null;
    due_at: Date | null;
    all_day: boolean;
    rrule: string | null;
    archived: boolean;
  }>`
    select c.id::text as id, c.thread_id::text as thread_id, c.thread_id = ${defaultThread} as loose,
      c.type, c.title, c.occurs_at, c.occurs_end_at, c.due_at, c.rrule,
      coalesce(c.attrs->>'all_day' = 'true', false) as all_day, c.archived_at is not null as archived
    from readable_content c
    join threads t on t.id = c.thread_id
    where c.viewer_account_id = ${accountId}::uuid
      and c.deleted_at is null and t.deleted_at is null
      and c.id in (${sql.join(wanted.map((id) => sql`${id}::uuid`))})
  `.execute(executor);
  const byId = new Map(found.rows.map((r) => [r.id, r]));
  return wanted.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [
      {
        id: r.id,
        threadId: r.thread_id,
        loose: r.loose === true,
        type: r.type,
        title: r.title.slice(0, ANSWER_ROW_CHARS),
        dueAt: r.due_at?.toISOString() ?? null,
        occursAt: r.occurs_at?.toISOString() ?? null,
        occursEndAt: r.occurs_end_at?.toISOString() ?? null,
        allDay: r.all_day,
        rrule: r.rrule,
        archived: r.archived,
      },
    ];
  });
}

async function notesMatching(
  executor: Executor,
  accountId: string,
  match: RawBuilder<unknown>,
  vector: string | null,
  defaultThread: RawBuilder<unknown>,
): Promise<PageResult["notes"]> {
  const live = noteFilter(accountId);
  const words = await sql<{ id: string }>`
    select m.id::text as id
    from readable_notes m
    left join threads t on t.id = m.subject_id
    where ${live} and m.search_text @@ ${match}
    order by ts_rank(m.search_text, ${match}) desc, m.updated_at desc
    limit ${SHORTLIST}
  `.execute(executor);
  const meaning = vector
    ? await sql<{ id: string }>`
        select m.id::text as id
        from note_chunks ch
        join readable_notes m on m.id = ch.note_id
        left join threads t on t.id = m.subject_id
        where ${live} and ch.embedding is not null
        order by ch.embedding <=> ${vector}::halfvec(1024), m.updated_at desc
        limit ${SHORTLIST}
      `.execute(executor)
    : { rows: [] as { id: string }[] };
  const wanted = fuse([words.rows.map((r) => r.id), [...new Set(meaning.rows.map((r) => r.id))]]).slice(0, PAGE_LIMITS.notes);
  if (wanted.length === 0) return [];
  const found = await sql<{ id: string; thread_id: string; loose: boolean; text: string }>`
    select m.id::text as id, m.subject_id::text as thread_id, m.subject_id = ${defaultThread} as loose, m.text
    from readable_notes m
    left join threads t on t.id = m.subject_id
    where ${live} and m.id in (${sql.join(wanted.map((id) => sql`${id}::uuid`))})
  `.execute(executor);
  const byId = new Map(found.rows.map((r) => [r.id, r]));
  return wanted.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ id: r.id, threadId: r.thread_id, loose: r.loose === true, text: r.text.slice(0, ANSWER_ROW_CHARS) }] : [];
  });
}

async function memoriesMatching(
  executor: Executor,
  accountId: string,
  match: RawBuilder<unknown>,
  vector: string | null,
): Promise<PageResult["memories"]> {
  // `active()`, never `notes` by scope: `readable_notes` holds thread notes
  // only, and a memory is the account's alone.
  const words = await active(executor, accountId)
    .select("id")
    .where(sql<boolean>`search_text @@ ${match}`)
    .orderBy(sql`ts_rank(search_text, ${match})`, "desc")
    .orderBy("updated_at", "desc")
    .limit(SHORTLIST)
    .execute();
  const meaning = vector
    ? await active(executor, accountId)
        .select("id")
        .where("embedding", "is not", null)
        .orderBy(sql`embedding <=> ${vector}::halfvec(1024)`)
        .limit(SHORTLIST)
        .execute()
    : [];
  const wanted = fuse([words.map((r) => r.id), meaning.map((r) => r.id)]).slice(0, PAGE_LIMITS.memories);
  if (wanted.length === 0) return [];
  const found = await active(executor, accountId).select(["id", "kind", "text"]).where("id", "in", wanted).execute();
  const byId = new Map(found.map((r) => [r.id, r]));
  return wanted.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ id: r.id, kind: r.kind as MemoryClass, text: r.text.slice(0, ANSWER_ROW_CHARS) }] : [];
  });
}
