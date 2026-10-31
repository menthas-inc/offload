// The three ways an answer finds anything.
//
//   listContent   one thread, filtered. The exact answer to most questions
//                 somebody asks about their own threads, and no guessing.
//   listAgenda    a date range, across threads. What is due this week.
//   search        text and meaning, fused, for what a filter cannot express.
//
// **The filter is first on purpose.** "What is left to do from Lisbon" is
// `type = 'task' and done_at is null` in one thread, which is a where clause the
// thread page has run since 005. Answering it by cosine distance is a worse and
// less predictable version of a query we already know how to write, and it is
// what makes an answer twenty rows long when it is two.
//
// Everything here reads `readable_content` and `readable_notes` from 0026 and 0033.
// No membership rule is written in this file.

import { sql, type RawBuilder } from "kysely";
import type { Executor } from "../threads/access.js";
import { calendarName } from "../connectors/calendars.js";
import { db } from "../db.js";
import { NOT_IN_A_THREAD, shownToModel } from "../threads/default.js";

/** Candidates per arm, before fusion. Enough for the fusion to reorder
 *  meaningfully, small enough that the post-filter stays cheap. */
export const SHORTLIST = 60;

/** What reaches the model, per result. The same figure as 006's `LIST_PAGE`,
 *  and for the same reason: it is the number that makes OFF-1 and OFF-8
 *  checkable rather than argued about. */
export const ANSWER_RESULTS = 20;

/** Per row. Matches 006's `LIST_ROW_CHARS`. */
export const ANSWER_ROW_CHARS = 200;

/** Results in one turn. "Lisbon and Istanbul" is two.
 *
 *  The OFF-8 ceiling is this times ANSWER_RESULTS: at most sixty rows of at
 *  most two hundred characters reach a prompt, however old the account is. That
 *  is a constant, which is exactly what the principle asks for. */
export const ANSWER_SETS = 3;

export interface FoundRow {
  id: string;
  threadId: string;
  threadName: string;
  type: string;
  title: string;
  body: string | null;
  doneAt: string | null;
  dueAt: string | null;
  occursAt: string | null;
  createdAt: string;
}

/** Something read that is not a content row.
 *
 *  A note is what a thread holds about itself and a message is what somebody
 *  said while dumping. Both can answer a question and **neither is a row to
 *  draw**: a note has no checkbox and rendering half a conversation back at
 *  somebody is not an answer. They reach the model and stop there.
 *
 *  `who` is load bearing on a message. Half of a conversation is offload's own
 *  output, and a past reply that was wrong is otherwise indistinguishable from
 *  something a person stated. */
export interface Aside {
  kind: "note" | "message";
  who: "you" | "offload" | "a member";
  threadName: string | null;
  text: string;
}

export interface Result {
  threadId: string | null;
  threadName: string | null;
  /** There were more than a page. The reply may say "more than twenty" and may
   *  never say "no", which is what AC-4b turns on. */
  truncated: boolean;
  rows: FoundRow[];
  /** Empty for the two filtered reads, which look only at content. */
  asides?: Aside[];
}

interface RawRow {
  id: string;
  thread_id: string;
  thread_name: string;
  type: string;
  title: string;
  body: string | null;
  done_at: Date | null;
  due_at: Date | null;
  occurs_at: Date | null;
  created_at: Date;
}

function toRow(row: RawRow): FoundRow {
  return {
    id: row.id,
    threadId: row.thread_id,
    threadName: row.thread_name,
    type: row.type,
    title: row.title,
    // Bounded here rather than at the prompt, so the cap is applied once and
    // cannot be forgotten by a second caller.
    body: row.body ? row.body.slice(0, ANSWER_ROW_CHARS) : null,
    doneAt: row.done_at ? row.done_at.toISOString() : null,
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    occursAt: row.occurs_at ? row.occurs_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** One page plus one, so truncation is known without a second count.
 *
 *  006's `list_thread_content` already does exactly this and it is the cheaper
 *  idiom: below a page the row count is the true count, which is where "three
 *  left" comes from, and above it the reply says more than a page rather than
 *  inventing a number. No COUNT(*) on the path of a sentence. */
function page<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, ANSWER_RESULTS), truncated: rows.length > ANSWER_RESULTS };
}

/** The content types a question can narrow to. Mirrors the check constraint on
 *  `content.type`; a value outside it is a filter that can only ever match
 *  nothing, so it is refused at the schema rather than run. */
export type ContentType =
  | "link"
  | "image"
  | "screenshot"
  | "voice"
  | "file"
  | "task"
  | "event";

export interface ListContentOptions {
  threadId: string;
  type?: ContentType | null;
  done?: boolean | null;
  /** Narrows within the thread over the same text index the corpus uses.
   *
   *  This is what makes "did I already add butter" cheap and correct: forty
   *  rows become the two mentioning butter, and the model reads those instead
   *  of a truncated page of the whole list. Without it, an existence check on a
   *  long thread is decided by whichever twenty rows came back, which is how a
   *  wrong "no" is produced. */
  matching?: string | null;
}

export async function listContent(
  accountId: string,
  options: ListContentOptions,
): Promise<Result | null> {
  const thread = await db
    .selectFrom("threads")
    .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
    .select(["threads.id as id", shownToModel("threads.id", "threads.name", accountId).as("name")])
    .where("threads.id", "=", options.threadId)
    .where("thread_members.account_id", "=", accountId)
    .where("thread_members.state", "=", "accepted")
    .where("threads.deleted_at", "is", null)
    .executeTakeFirst();
  // One refusal, whatever the reason. A thread that does not exist and one you
  // are not in are the same answer, or the tool is an id oracle.
  if (!thread) return null;

  let query = db
    .selectFrom("readable_content as content")
    // Joined for the row's own thread name even though the result carries one.
    // A row is rendered by the same component wherever it came from, and a row
    // that knows its thread in one result and not in another is two shapes.
    .innerJoin("threads", "threads.id", "content.thread_id")
    .select([
      "content.id as id",
      "content.thread_id as thread_id",
      shownToModel("threads.id", "threads.name", accountId).as("thread_name"),
      "content.type as type",
      "content.title as title",
      "content.body as body",
      "content.done_at as done_at",
      "content.due_at as due_at",
      "content.occurs_at as occurs_at",
      "content.created_at as created_at",
    ])
    .where("content.viewer_account_id", "=", accountId)
    .where("content.thread_id", "=", options.threadId)
    .where("content.deleted_at", "is", null)
    .where("content.archived_at", "is", null);

  if (options.type) query = query.where("content.type", "=", options.type);
  if (options.done === true) query = query.where("content.done_at", "is not", null);
  if (options.done === false) query = query.where("content.done_at", "is", null);
  if (options.matching) {
    query = query.where(
      sql<boolean>`content.search_text @@ websearch_to_tsquery('offload_search', ${options.matching})`,
    );
  }

  const rows = await query
    .orderBy("content.created_at", "desc")
    .limit(ANSWER_RESULTS + 1)
    .execute();

  const paged = page<RawRow>(rows);
  return {
    threadId: thread.id,
    threadName: thread.name,
    truncated: paged.truncated,
    rows: paged.rows.map(toRow),
  };
}

export interface ListAgendaOptions {
  fromIso: string;
  toIso: string;
  /** The three dates a question can mean. "What is due this week", "what is on
   *  Thursday", "what did I dump yesterday". */
  when: "due" | "occurs" | "created";
  type?: ContentType | null;
  done?: boolean | null;
}

export async function listAgenda(
  accountId: string,
  options: ListAgendaOptions,
): Promise<Result> {
  const column =
    options.when === "due" ? "due_at" : options.when === "occurs" ? "occurs_at" : "created_at";

  let query = db
    .selectFrom("readable_content as content")
    .innerJoin("threads", "threads.id", "content.thread_id")
    .select([
      "content.id as id",
      "content.thread_id as thread_id",
      shownToModel("threads.id", "threads.name", accountId).as("thread_name"),
      "content.type as type",
      "content.title as title",
      "content.body as body",
      "content.done_at as done_at",
      "content.due_at as due_at",
      "content.occurs_at as occurs_at",
      "content.created_at as created_at",
    ])
    .where("content.viewer_account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    // 2026-10-17. Archived rows too, after the live ones: a window of dates is
    // an ask about that time, and what has passed archives itself.
    // **The thread's own lifecycle, which the predicate deliberately does not
    // carry.** `readable_content` answers "may they see it", never "does it
    // still exist": `restore` depends on that. So every reader states its own
    // lifecycle, and a reader that forgets shows rows from a thread somebody
    // deleted eight seconds ago, with a working link to it.
    .where("threads.deleted_at", "is", null)
    // Membership, not authorship. In a shared thread this returns what another
    // member timed, which is the whole reason it reads the predicate rather
    // than content.account_id.
    .where(sql<boolean>`content.${sql.raw(column)} >= ${options.fromIso}::timestamptz`)
    .where(sql<boolean>`content.${sql.raw(column)} <= ${options.toIso}::timestamptz`);

  if (options.type) query = query.where("content.type", "=", options.type);
  if (options.done === true) query = query.where("content.done_at", "is not", null);
  if (options.done === false) query = query.where("content.done_at", "is", null);

  const rows = await query
    .orderBy(sql`content.archived_at is not null`, "asc")
    .orderBy(sql.raw(`content.${column}`), "asc")
    .limit(ANSWER_RESULTS + 1)
    .execute();

  const paged = page<RawRow>(rows);
  return {
    // Cross-thread by nature, so the result carries no single thread and its
    // rows name their own.
    threadId: null,
    threadName: null,
    truncated: paged.truncated,
    rows: paged.rows.map(toRow),
  };
}

/** Reciprocal rank fusion.
 *
 *  `1/(60 + rank)` summed across the arms. No score normalisation between a
 *  cosine distance and a ts_rank, and no constant anybody has to justify later,
 *  which is DEV-3's whole argument. 60 is the figure the method is published
 *  with and is not tuned here.
 *
 *  Then `created_at` breaks ties. Two rows that answer a question equally well
 *  are not equally good answers, and the newer one is usually what somebody
 *  meant. A tiebreak rather than a term in the score, so recency can never
 *  outrank relevance and there is no half life to defend.
 */
const RRF_K = 60;

/** 2026-10-17. An archived row's arms count as if each of its ranks came
 *  after a whole live shortlist: a live match wins, and a strong archived
 *  match still beats a live row the meaning arm only found nearby. */
const ARCHIVED_BEHIND = SHORTLIST;

export function fuse(arms: string[][], archivedArms: string[][] = []): string[] {
  const score = new Map<string, number>();
  const add = (arm: string[], behind: number) =>
    arm.forEach((id, index) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + behind + index + 1));
    });
  for (const arm of arms) add(arm, 0);
  for (const arm of archivedArms) add(arm, ARCHIVED_BEHIND);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export interface SearchOptions {
  query: string;
  /** The query embedding, from the agent plane, which owns the Voyage client.
   *
   *  Absent when Voyage could not be reached, and then the text arm answers
   *  alone: search is worse, not broken, and there is no failure line because
   *  there is nothing for the person to do. */
  queryVector?: string | null;
}

/** The content arms both searches run: words, and meaning when there is a
 *  vector, each once per pile so neither pile's shortlist crowds out the
 *  other's. `match` is the tsquery: the model's search passes
 *  `websearch_to_tsquery`, the Search page (049) a prefix query. Lifted out of
 *  `search()` unchanged so the two cannot drift on membership or lifecycle. */
export async function contentArms(
  accountId: string,
  options: { match: RawBuilder<unknown>; vector: string | null; limit: number },
  executor: Executor = db,
): Promise<{ live: string[][]; archived: string[][] }> {
  // Which pile an arm reads, said as every other reader says it.
  const pile = (archived: boolean) => (archived ? sql`c.archived_at is not null` : sql`c.archived_at is null`);
  const textArm = async (archived: boolean) =>
    sql<{ id: string }>`
      select c.id::text as id
      from readable_content c
      join threads t on t.id = c.thread_id
      where c.viewer_account_id = ${accountId}::uuid
        and c.deleted_at is null and ${pile(archived)}
        and t.deleted_at is null
        and c.search_text @@ ${options.match}
      order by ts_rank(c.search_text, ${options.match}) desc,
               c.created_at desc
      limit ${options.limit}
    `.execute(executor);
  const vectorArm = async (archived: boolean) =>
    options.vector
      ? sql<{ id: string }>`
          select c.id::text as id
          from content_chunks ch
          join readable_content c on c.id = ch.content_id
          join threads t on t.id = c.thread_id
          where c.viewer_account_id = ${accountId}::uuid
            and c.deleted_at is null and ${pile(archived)}
            and t.deleted_at is null
            and ch.embedding is not null
          order by ch.embedding <=> ${options.vector}::halfvec(1024), c.created_at desc
          limit ${options.limit}
        `.execute(executor)
      : { rows: [] as { id: string }[] };
  const [text, vector, oldText, oldVector] = await Promise.all([textArm(false), vectorArm(false), textArm(true), vectorArm(true)]);
  const ids = (result: { rows: { id: string }[] }) => result.rows.map((r) => r.id);
  return { live: [ids(text), ids(vector)], archived: [ids(oldText), ids(oldVector)] };
}

export async function search(accountId: string, options: SearchOptions): Promise<Result> {
  // 2026-10-17 (the owner). Archived rows are found too, behind the live
  // ones: archive takes a row off the list, never out of reach, and what has
  // passed archives itself.
  const arms = await contentArms(accountId, {
    match: sql`websearch_to_tsquery('offload_search', ${options.query})`,
    vector: options.queryVector ?? null,
    limit: SHORTLIST,
  });

  // Read before the early return below. A question whose answer lives in a
  // standing rule matches no content at all, and returning nothing there would
  // have made "what did I tell you about this thread" unanswerable while
  // looking like an empty corpus.
  const asides = await asidesFor(accountId, options);

  const ranked = fuse(arms.live, arms.archived);
  const wanted = ranked.slice(0, ANSWER_RESULTS + 1);
  if (wanted.length === 0) {
    return { threadId: null, threadName: null, truncated: false, rows: [], asides };
  }

  const rows = await db
    .selectFrom("readable_content as content")
    .innerJoin("threads", "threads.id", "content.thread_id")
    .select([
      "content.id as id",
      "content.thread_id as thread_id",
      shownToModel("threads.id", "threads.name", accountId).as("thread_name"),
      "content.type as type",
      "content.title as title",
      "content.body as body",
      "content.done_at as done_at",
      "content.due_at as due_at",
      "content.occurs_at as occurs_at",
      "content.created_at as created_at",
    ])
    .where("content.viewer_account_id", "=", accountId)
    // Both arms already exclude a deleted thread, so this is the belt to their
    // braces. It is here because the arms are two queries and a third will be
    // written one day, and this is the one place all of them pass through.
    .where("threads.deleted_at", "is", null)
    .where("content.id", "in", wanted)
    .execute();

  // Back into fused order: `in` returns whatever order the planner likes, and
  // the ranking is the whole point of having run two arms.
  const byId = new Map(rows.map((r) => [r.id, r as unknown as RawRow]));
  const ordered = wanted.map((id) => byId.get(id)).filter((r): r is RawRow => r !== undefined);
  const paged = page(ordered);

  return {
    threadId: null,
    threadName: null,
    truncated: paged.truncated,
    rows: paged.rows.map(toRow),
    asides,
  };
}

/** How many notes and messages an answer may read. Small on purpose: they
 *  inform a sentence rather than being the answer, and every one of them is
 *  prompt that competes with the rows. */
export const ASIDES = 5;

/** Notes and conversations, searched by text and by meaning.
 *
 *  Separately from content rather than fused with it, because they are not
 *  ranked against each other in any meaningful way: a note and a task
 *  answer different halves of a question, and interleaving them by score would
 *  push rows out of a list to make room for context.
 *
 *  Each corpus runs the two arms content does and fuses them the same way, so
 *  "the heater was replaced" answers a question about the boiler. Until
 *  2026-10-07 only the words were read, and the vectors 013 specified were
 *  written every minute and never queried. The query vector is the one the
 *  content arm already has: no second embed.
 */
/** A thread note the account may read and that still stands, over
 *  `readable_notes m` left joined to `threads t`. Shared by the model's asides
 *  and the Search page (049), so the two agree on what a live note is. */
export function noteFilter(accountId: string): RawBuilder<unknown> {
  return sql`m.viewer_account_id = ${accountId}::uuid
      and m.deleted_at is null and m.superseded_at is null and m.muted_at is null
      -- A note scoped to a deleted thread is about somewhere that no longer
      -- exists, and it would still be steering the answer. The left join means
      -- an account-scoped note has no thread and stays.
      and (t.id is null or t.deleted_at is null)`;
}

async function asidesFor(accountId: string, options: SearchOptions): Promise<Aside[]> {
  const viewer = sql`m.viewer_account_id = ${accountId}::uuid`;
  const query = sql`websearch_to_tsquery('offload_search', ${options.query})`;
  const notesLive = noteFilter(accountId);
  const noteText = await sql<{ id: string }>`
    select m.id::text as id
    from readable_notes m
    left join threads t on t.id = m.subject_id
    where ${notesLive}
      and m.search_text @@ ${query}
    order by ts_rank(m.search_text, ${query}) desc, m.updated_at desc
    limit ${SHORTLIST}
  `.execute(db);
  const noteMeaning = options.queryVector
    ? await sql<{ id: string }>`
        select m.id::text as id
        from note_chunks ch
        join readable_notes m on m.id = ch.note_id
        left join threads t on t.id = m.subject_id
        where ${notesLive}
          and ch.embedding is not null
        order by ch.embedding <=> ${options.queryVector}::halfvec(1024), m.updated_at desc
        limit ${SHORTLIST}
      `.execute(db)
    : { rows: [] as { id: string }[] };
  const noteIds = fuse([noteText.rows.map((r) => r.id), noteMeaning.rows.map((r) => r.id)]).slice(0, ASIDES);
  const noteRows = noteIds.length
    ? await sql<{ id: string; text: string; thread_name: string | null }>`
        select m.id::text as id, m.text as text,
          -- 028. The default thread's stored name never reaches the model.
          case when t.id = (select a.default_thread_id from accounts a where a.id = ${accountId}::uuid) then ${NOT_IN_A_THREAD} else t.name end as thread_name
        from readable_notes m
        left join threads t on t.id = m.subject_id
        where m.viewer_account_id = ${accountId}::uuid
          and m.id in (${sql.join(noteIds.map((id) => sql`${id}::uuid`))})
      `.execute(db)
    : { rows: [] };
  const noteById = new Map(noteRows.rows.map((r) => [r.id, r]));

  // A message and the content it became are near duplicates, since the row was
  // written from the text. The content row wins: it still exists in a thread
  // and it can be ticked, while the message is only provenance. So messages are
  // read for what is NOT in a row, which is mostly offload's own replies and
  // the reasoning around a filing.
  const messageFilter = sql`${viewer}
      and m.deleted_at is null
      and m.state in ('seen', 'answered')
      and said(m.text, m.transcript) is not null
      -- 019. A tapped label that was somebody else's calendar name is not
      -- the person's words, here any more than in the tail or the index.
      and not m.derived_from_untrusted
      and not exists (
        select 1 from content c
        where c.derived_from_message_id = m.id and c.deleted_at is null
      )`;
  const messageText = await sql<{ id: string }>`
    select m.id::text as id
    from readable_messages m
    where ${messageFilter}
      and m.search_text @@ ${query}
    order by ts_rank(m.search_text, ${query}) desc, m.created_at desc
    limit ${SHORTLIST}
  `.execute(db);
  const messageMeaning = options.queryVector
    ? await sql<{ id: string }>`
        select m.id::text as id
        from message_chunks ch
        join readable_messages m on m.id = ch.message_id
        where ${messageFilter}
          and ch.account_id = ${accountId}::uuid
          and ch.embedding is not null
        order by ch.embedding <=> ${options.queryVector}::halfvec(1024), m.created_at desc
        limit ${SHORTLIST}
      `.execute(db)
    : { rows: [] as { id: string }[] };
  // A long message is several chunks; it counts once, at its best rank.
  const messageIds = fuse([messageText.rows.map((r) => r.id), [...new Set(messageMeaning.rows.map((r) => r.id))]]).slice(0, ASIDES);
  const messageRows = messageIds.length
    ? await sql<{ id: string; text: string; role: "person" | "offload" }>`
        select m.id::text as id, said(m.text, m.transcript) as text, m.role as role
        from readable_messages m
        where m.viewer_account_id = ${accountId}::uuid
          and m.id in (${sql.join(messageIds.map((id) => sql`${id}::uuid`))})
      `.execute(db)
    : { rows: [] };
  const messageById = new Map(messageRows.rows.map((r) => [r.id, r]));

  // Back into fused order, as the rows are.
  return [
    ...noteIds.flatMap((id) => {
      const row = noteById.get(id);
      return row
        ? [{ kind: "note" as const, who: "a member" as const, threadName: row.thread_name, text: row.text.slice(0, ANSWER_ROW_CHARS) }]
        : [];
    }),
    ...messageIds.flatMap((id) => {
      const row = messageById.get(id);
      return row
        ? [
            {
              kind: "message" as const,
              // The distinction the prompt turns on: offload's earlier reply is a
              // record of what was said and evidence of nothing else about the world.
              who: row.role === "offload" ? ("offload" as const) : ("you" as const),
              threadName: null,
              text: row.text.slice(0, ANSWER_ROW_CHARS),
            },
          ]
        : [];
    }),
  ];
}

export interface AccountFacts {
  displayName: string | null;
  defaultThread: { id: string; name: string } | null;
  /** 019. The approved calendars, by name, each with the threads this
   *  account has picked it for, by the names the model is shown. Where an
   *  event lands is the thread's pick; which threads pick a calendar is a
   *  fact the account can be asked about, and from 019 until 2026-10-10 no
   *  tool carried it, so the answer was a confident guess. */
  calendars: { name: string; threads: string[] }[];
  /** Device preferences are absent on purpose and the prompt says so. Theme and
   *  text size live in SecureStore and localStorage, deliberately, so they can
   *  be read before first paint; the server has never held them and a copy kept
   *  here to answer a question would be a second source of truth for a value
   *  that already has one. */
  knowsDevicePreferences: false;
}

/** A lookup, not a search. Takes no query and returns a small typed record.
 *
 *  These are typed columns on accounts, threads and connector tables. They are
 *  not embeddable and must never be pushed into the corpus to make one code
 *  path: they are read by something that knows their shape.
 *
 *  **Trusted means the shape, not the strings.** The booleans, the counts and
 *  the ids are ours. A thread name is person-written and a calendar's name came
 *  back from Google, which SEC-1 calls untrusted in as many words. Both travel
 *  in a tool result, so they reach the model as data rather than as part of a
 *  system prompt, and that is what makes this safe rather than the provenance.
 *  Anything added here inherits that and nothing added here may assume more. */
export async function accountFacts(accountId: string): Promise<AccountFacts> {
  const account = await db
    .selectFrom("accounts")
    .leftJoin("threads", "threads.id", "accounts.default_thread_id")
    .select([
      "accounts.display_name as display_name",
      "threads.id as thread_id",
      shownToModel("threads.id", "threads.name", accountId).as("thread_name"),
    ])
    .where("accounts.id", "=", accountId)
    .executeTakeFirst();

  const calendars = await db
    .selectFrom("connector_calendars")
    .innerJoin(
      "connector_connections",
      "connector_connections.id",
      "connector_calendars.connection_id",
    )
    .select([
      "connector_calendars.id as id",
      "connector_calendars.summary as summary",
      "connector_calendars.is_primary as is_primary",
    ])
    .where("connector_connections.account_id", "=", accountId)
    .where("connector_connections.deleted_at", "is", null)
    .where("connector_calendars.selected", "=", true)
    .execute();

  // This account's own picks: a pick is one member's, so another member's
  // pick in a shared thread is theirs to be asked about.
  const picks = calendars.length
    ? await db
        .selectFrom("thread_calendars")
        .innerJoin("threads", "threads.id", "thread_calendars.thread_id")
        .select([
          "thread_calendars.calendar_id as calendar_id",
          shownToModel("threads.id", "threads.name", accountId).as("thread_name"),
        ])
        .where("thread_calendars.account_id", "=", accountId)
        .where(
          "thread_calendars.calendar_id",
          "in",
          calendars.map((c) => c.id),
        )
        .where("threads.deleted_at", "is", null)
        .execute()
    : [];
  const threadsOf = new Map<string, string[]>();
  for (const pick of picks) {
    threadsOf.set(pick.calendar_id, [...(threadsOf.get(pick.calendar_id) ?? []), pick.thread_name]);
  }

  return {
    displayName: account?.display_name ?? null,
    defaultThread:
      account?.thread_id && account.thread_name
        ? { id: account.thread_id, name: NOT_IN_A_THREAD }
        : null,
    calendars: calendars
      .map((c) => ({
        name: calendarName(c, account?.display_name ?? null),
        threads: (threadsOf.get(c.id) ?? []).sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    knowsDevicePreferences: false,
  };
}
