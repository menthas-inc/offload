// Threads, and what is in them.
//
// Four reads and six writes. The reads are the ones with a performance
// contract: the thread bundle is a fixed number of queries whatever the thread
// holds, because the alternative shape, one query per thing the screen draws,
// grows with a thread's shape rather than with its size and is the one that
// gets slow invisibly.
//
// Every route here resolves authorization through `../threads/access.js` and
// none of them touches `thread_members` directly. Every refusal is the same
// refusal, for the reason stated there.

import { z } from "zod";
import { sql } from "kysely";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { auth } from "../auth/auth.js";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import {
  MAX_MEMORIES_PER_THREAD,
  MEMORY_TEXT_CHARS,
  MemoryLimit,
  MemoryTooLong,
  addMemory,
  deleteMemory,
  editMemory,
  readableMemories,
  restoreMemory,
  setMuted,
} from "../threads/memories.js";
import { readPreference, type ThreadPreference } from "../threads/widgets.js";
import {
  NotYours,
  requireAuthor,
  requireMember,
  requireReadable,
  touchThread,
} from "../threads/access.js";

/** One screenful. 001's heavy case is 500 rows in one thread and the page draws
 *  a dozen, so fetching them all to show twelve is the thing this prevents. */
const PAGE = 30;

/** Past this, a thread is "older" on My threads. Derived from activity rather
 *  than stored, because it is a function of time rather than a property of the
 *  thread, which is 001's own reasoning for not storing it. */
const STALE_DAYS = 30;

function fetchHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return headers;
}

async function currentAccountId(request: FastifyRequest): Promise<string | null> {
  const result = await auth.api.getSession({ headers: fetchHeaders(request) });
  return result?.session.userId ?? null;
}

/** Wraps a handler so a `NotYours` becomes the one refusal rather than a 500.
 *  Written once so no endpoint can forget, and so no endpoint can accidentally
 *  distinguish its refusals from any other's. */
function guard<T>(
  reply: FastifyReply,
  run: () => Promise<T>,
): Promise<T | FastifyReply> {
  return run().catch((error: unknown) => {
    if (error instanceof NotYours) {
      return reply.code(404).send({ error: "not_found" as const });
    }
    throw error;
  });
}

const notFound = z.object({ error: z.literal("not_found") });
const unauthenticated = z.object({ error: z.literal("unauthenticated") });

const memberSchema = z.object({
  accountId: z.string(),
  displayName: z.string(),
  initials: z.string(),
  isYou: z.boolean(),
});

const threadRow = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  count: z.number(),
  meta: z.string(),
});

const threadList = z.object({
  groups: z.array(
    z.object({
      key: z.enum(["now", "always", "older"]),
      threads: z.array(threadRow),
    })
  ),
});

const memorySchema = z.object({
  id: z.string(),
  text: z.string(),
  /** `learned` is offload's, and the screen marks it. */
  origin: z.enum(["stated", "learned"]),
  /** Null once the author deleted their account: the memory stays in the
   *  shared thread it belongs to and the name comes off it. */
  authorId: z.string().nullable(),
  muted: z.boolean(),
});

const threadBundle = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  alwaysOn: z.boolean(),
  counts: z.object({ active: z.number(), archived: z.number() }),
  members: z.array(memberSchema),
  /** The standing facts this thread holds about itself. At most ten, so this
   *  never grows the bundle with the thread's age. */
  memories: z.array(memorySchema),
  /** How this thread wants to look. Absent fields mean derived from content. */
  preference: z.object({
    widgets: z.array(z.string()).optional(),
    groupBy: z.record(z.string(), z.string()).optional(),
  }),
  /** Always null. offload does not summarise a thread yet and nothing writes a
   *  standing memory, so the field is here in the shape the client already
   *  renders an empty state from. When something writes one, no client changes. */
  /** Null until something writes summaries, which nothing does. Nullable
   *  string rather than `null` so the client's branch is real code that is
   *  typechecked and tested rather than a branch nobody can reach. */
  standing: z.string().nullable(),
});

const contentRow = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
  /** What 006 extracts, and what 007's widgets are derived from. All of it may
   *  be null or empty, which is what a thread of plain notes looks like. */
  doneAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  occursAt: z.string().nullable(),
  isReminder: z.boolean(),
  priority: z.number(),
  priorityPinned: z.boolean(),
  tags: z.array(z.string()),
  place: z
    .object({
      id: z.string(),
      name: z.string(),
      address: z.string().nullable(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
    })
    .nullable(),
  author: z.object({
    /** Null once they deleted their account. Their content stays in the
     *  threads they shared; the name comes off it. */
    accountId: z.string().nullable(),
    displayName: z.string(),
    isYou: z.boolean(),
  }),
  /** Computed by the same predicate the endpoints enforce, so the client cannot
   *  draw a control the server will refuse or hide one it would allow. */
  canDelete: z.boolean(),
  canMove: z.boolean(),
});

const contentPage = z.object({
  rows: z.array(contentRow),
  nextCursor: z.string().nullable(),
});

const contentDetail = contentRow.extend({
  threadId: z.string(),
  threadName: z.string(),
  from: z
    .object({ messageId: z.string(), text: z.string().nullable(), at: z.string() })
    .nullable(),
});

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase();
}

/** Members of one thread, with the viewer marked. */
async function membersOf(threadId: string, viewerId: string) {
  const rows = await db
    .selectFrom("thread_members")
    .innerJoin("accounts", "accounts.id", "thread_members.account_id")
    .select(["accounts.id as id", "accounts.display_name as displayName"])
    .where("thread_members.thread_id", "=", threadId)
    .where("thread_members.state", "=", "accepted")
    .where("accounts.deleted_at", "is", null)
    .execute();

  return rows.map((row) => {
    const name = row.displayName ?? "Someone";
    return {
      accountId: row.id,
      displayName: name,
      initials: initialsOf(name),
      isYou: row.id === viewerId,
    };
  });
}

/** The row shape both the page and the detail return, so the two cannot drift. */
interface RawRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: Date;
  archived_at: Date | null;
  /** Null once the author deleted their account. OFF-3 keeps their content in
   *  the threads they shared, so the row outlives them and loses the name. */
  account_id: string | null;
  authorName: string | null;
  done_at: Date | null;
  due_at: Date | null;
  occurs_at: Date | null;
  is_reminder: boolean;
  priority: number;
  priority_pinned: boolean;
  tags: string[];
  place_id: string | null;
  placeName: string | null;
  placeAddress: string | null;
  placeLat: number | null;
  placeLng: number | null;
}

function toRow(row: RawRow, viewerId: string) {
  // A departed author is nobody, so `mine` is false and the two controls that
  // belong to an author are off for everyone. That is OFF-3 working rather
  // than a gap: nobody may delete what they did not write, and the person who
  // did is gone. Archive is the co-owned action and still applies, so a thread
  // can be cleared without destroying what somebody left in it.
  const mine = row.account_id !== null && row.account_id === viewerId;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    doneAt: row.done_at ? row.done_at.toISOString() : null,
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    occursAt: row.occurs_at ? row.occurs_at.toISOString() : null,
    isReminder: row.is_reminder,
    priority: row.priority,
    priorityPinned: row.priority_pinned,
    tags: row.tags,
    place: row.place_id
      ? {
          id: row.place_id,
          name: row.placeName ?? "",
          address: row.placeAddress,
          lat: row.placeLat,
          lng: row.placeLng,
        }
      : null,
    author: {
      accountId: row.account_id,
      displayName: row.authorName ?? "Someone",
      isYou: mine,
    },
    // Both actions change who can see something, so both are the author's.
    canDelete: mine,
    canMove: mine,
  };
}

// ============================================================== the writes
//
// Exported and session-free, with the routes below as thin wrappers. Better
// Auth signs its session cookie, so a test cannot reach a session-scoped route
// by pretending, and the interesting behaviour here is the transaction: which
// counts move, what `previous` actually holds, what a second call does. Same
// shape as `takeDump` and `undoTurn` in dumps.ts.

export interface ContentSnapshot {
  title: string;
  body: string | null;
}

/** Edit. Co-owned: anybody in the thread may fix a title offload got wrong,
 *  which is most of what the page is for. */
export async function editContent(
  accountId: string,
  contentId: string,
  patch: { title?: string | undefined; body?: string | null | undefined },
): Promise<ContentSnapshot> {
  const ref = await requireReadable(accountId, contentId);
  return db.transaction().execute(async (trx) => {
    const before = await trx
      .selectFrom("content")
      .select(["title", "body"])
      .where("id", "=", ref.id)
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("content")
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.body === undefined ? {} : { body: patch.body }),
        updated_at: sql`now()`,
      })
      .where("id", "=", ref.id)
      .execute();

    await touchThread(ref.threadId, trx);
    return before;
  });
}

/** Archive and restore, the co-owned soft action.
 *
 *  Restore clears a pending destruction as well as an archive, so one control
 *  brings back an archived row and an undone delete alike, and the count it
 *  decremented comes back with it. */
export async function setArchived(
  accountId: string,
  contentId: string,
  archived: boolean,
): Promise<void> {
  // Restore is the Undo for delete as well as for archive, so it has to be able
  // to find a row inside its eight second window. Archive must not: archiving
  // something already on its way out is meaningless.
  const ref = await requireReadable(accountId, contentId, db, !archived);
  await db.transaction().execute(async (trx) => {
    const before = await trx
      .selectFrom("content")
      .select(["deleted_at"])
      .where("id", "=", ref.id)
      .executeTakeFirstOrThrow();

    await trx
      .updateTable("content")
      .set({
        archived_at: archived ? sql`now()` : null,
        ...(archived ? {} : { deleted_at: null, purge_after: null }),
        updated_at: sql`now()`,
      })
      .where("id", "=", ref.id)
      .execute();

    // Undeleting puts the count back. Without this an undo restores the row and
    // leaves the header saying one fewer, which is AC-8 broken by the undo path
    // rather than by the delete.
    if (!archived && before.deleted_at !== null) {
      await trx
        .updateTable("threads")
        .set({ content_count: sql`content_count + 1` })
        .where("id", "=", ref.threadId)
        .execute();
    }

    await touchThread(ref.threadId, trx);
  });
}

/** Move. The author's, like delete, because both change who can see something. */
export async function moveContent(
  accountId: string,
  contentId: string,
  destination: string,
): Promise<{ threadId: string }> {
  const ref = await requireAuthor(accountId, contentId);
  await requireMember(accountId, destination);

  if (destination === ref.threadId) return { threadId: ref.threadId };

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("content")
      .set({ thread_id: destination, updated_at: sql`now()` })
      .where("id", "=", ref.id)
      .execute();

    // Both counts, in the same transaction as the write that changes them, per
    // 001. A count maintained anywhere else drifts.
    await trx
      .updateTable("threads")
      .set({ content_count: sql`greatest(content_count - 1, 0)` })
      .where("id", "=", ref.threadId)
      .execute();
    await trx
      .updateTable("threads")
      .set({ content_count: sql`content_count + 1` })
      .where("id", "=", destination)
      .execute();

    await touchThread(ref.threadId, trx);
    await touchThread(destination, trx);
  });

  return { threadId: ref.threadId };
}

/** Delete. Author only, soft, on 004's mechanism exactly. */
export async function deleteContent(
  accountId: string,
  contentId: string,
): Promise<boolean> {
  // Sees a row already inside its window, so a second call reports "nothing to
  // do" rather than "no such thing". A repeated delete is a double click, not
  // an error.
  const ref = await requireAuthor(accountId, contentId, db, true);
  return db.transaction().execute(async (trx) => {
    const result = await trx
      .updateTable("content")
      .set({
        deleted_at: sql`now()`,
        purge_after: sql`now() + interval '8 seconds'`,
        updated_at: sql`now()`,
      })
      .where("id", "=", ref.id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (Number(result.numUpdatedRows) === 0) return false;

    await trx
      .updateTable("threads")
      .set({ content_count: sql`greatest(content_count - 1, 0)` })
      .where("id", "=", ref.threadId)
      .execute();
    await touchThread(ref.threadId, trx);

    // Enqueued by the delete rather than left to a timer, exactly as 004's undo
    // does. A timer that stops running leaves content the person believes is
    // gone, and nothing notices.
    await enqueue({
      kind: "content.purge",
      accountId,
      payload: {},
      priority: PRIORITY.background,
      runAfterSeconds: 10,
      tx: trx,
    });

    return true;
  });
}

/** Tick something off, or put it back. Co-owned: a thread's contents belong to
 *  everybody in it, and neither direction destroys anything. */
export async function completeContent(
  accountId: string,
  contentId: string,
  done: boolean,
): Promise<{ done: boolean }> {
  const ref = await requireReadable(accountId, contentId);
  const before = await db
    .selectFrom("content")
    .select("done_at")
    .where("id", "=", ref.id)
    .executeTakeFirstOrThrow();

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("content")
      .set({ done_at: done ? sql`now()` : null, updated_at: sql`now()` })
      .where("id", "=", ref.id)
      .execute();
    await touchThread(ref.threadId, trx);
  });

  return { done: before.done_at !== null };
}

/** Change a priority.
 *
 *  **A person doing this pins it**, which is what stops the planner overwriting
 *  it later. The flag is set by this action and never by the model, so "somebody
 *  decided" and "offload guessed" stay distinguishable forever. */
export async function reprioritise(
  accountId: string,
  contentId: string,
  priority: number,
): Promise<{ priority: number; priorityPinned: boolean }> {
  const ref = await requireReadable(accountId, contentId);
  const before = await db
    .selectFrom("content")
    .select(["priority", "priority_pinned"])
    .where("id", "=", ref.id)
    .executeTakeFirstOrThrow();

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("content")
      .set({ priority, priority_pinned: true, updated_at: sql`now()` })
      .where("id", "=", ref.id)
      .execute();
    await touchThread(ref.threadId, trx);
  });

  return { priority: before.priority, priorityPinned: before.priority_pinned };
}

/** How a thread wants to look.
 *
 *  Co-owned, like the name: a shared thread's arrangement belongs to everybody
 *  in it. Merged rather than replaced, so setting the grouping does not silently
 *  clear the widget order. */
export async function setPreference(
  accountId: string,
  threadId: string,
  patch: { widgets?: string[] | null; groupBy?: Record<string, string> | null },
): Promise<ThreadPreference> {
  await requireMember(accountId, threadId);

  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("threads")
      .select("attrs")
      .where("id", "=", threadId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!row) throw new NotYours();

    const before = readPreference(row.attrs);
    const merged = readPreference({
      widgets: patch.widgets === undefined ? before.widgets : patch.widgets,
      groupBy: patch.groupBy === undefined ? before.groupBy : patch.groupBy,
    });

    await trx
      .updateTable("threads")
      .set({ attrs: JSON.stringify(merged), updated_at: sql`now()` })
      .where("id", "=", threadId)
      .execute();

    return before;
  });
}

/** Rename a thread. Co-owned: a shared thread's name belongs to everybody in
 *  it, and renaming touches no content. */
export async function renameThread(
  accountId: string,
  threadId: string,
  name: string,
): Promise<{ name: string }> {
  await requireMember(accountId, threadId);

  // Read then write, in one transaction. `returning` on an UPDATE gives the NEW
  // value in Postgres, so returning it as `previous` would hand the client an
  // Undo that restores the name it just set. The kind of bug that looks correct
  // and does nothing.
  const before = await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom("threads")
      .select("name")
      .where("id", "=", threadId)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!current) return null;

    await trx
      .updateTable("threads")
      .set({ name, updated_at: sql`now()` })
      .where("id", "=", threadId)
      .execute();

    return current;
  });
  if (!before) throw new NotYours();
  return { name: before.name };
}

export async function threadRoutes(app: App): Promise<void> {
  // ------------------------------------------------------------ My threads
  //
  // Three groups, and only one of them is stored. `always_on` is a column;
  // "older" is derived from activity, because a thread does not become old, it
  // stops being used.
  app.get(
    "/v1/threads",
    { schema: { response: { 200: threadList, 401: unauthenticated } } },
    async (request, reply) => {
      const accountId = await currentAccountId(request);
      if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

      const rows = await db
        .selectFrom("threads")
        .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
        .select([
          "threads.id as id",
          "threads.name as name",
          "threads.icon as icon",
          "threads.always_on as alwaysOn",
          "threads.content_count as count",
          "threads.last_activity_at as lastActivityAt",
        ])
        .where("thread_members.account_id", "=", accountId)
        .where("thread_members.state", "=", "accepted")
        .where("threads.deleted_at", "is", null)
        .orderBy("threads.last_activity_at", "desc")
        .execute();

      // One extra query for every thread's members rather than one per thread.
      // A person is in tens of threads, so the N+1 here would be tens of round
      // trips to render one list.
      const ids = rows.map((row) => row.id);
      const memberRows = ids.length
        ? await db
            .selectFrom("thread_members")
            .innerJoin("accounts", "accounts.id", "thread_members.account_id")
            .select([
              "thread_members.thread_id as threadId",
              "accounts.display_name as displayName",
            ])
            .where("thread_members.thread_id", "in", ids)
            .where("thread_members.state", "=", "accepted")
            .where("thread_members.account_id", "!=", accountId)
            .where("accounts.deleted_at", "is", null)
            .execute()
        : [];

      const others = new Map<string, string[]>();
      for (const row of memberRows) {
        const list = others.get(row.threadId) ?? [];
        list.push(row.displayName ?? "Someone");
        others.set(row.threadId, list);
      }

      const stale = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

      // Composed here rather than in the client. It is one string in three
      // clients, and composing it three times is how they drift.
      // "14 · Ana, Tom", which is the kit's line minus its unit. The count
      // carries no noun, per the vocabulary rule: the word for what is in a
      // thread was retired and nothing replaced it in anything a person reads.
      const meta = (count: number, people: string[]): string => {
        const who =
          people.length === 0
            ? "just you"
            : people.length <= 2
              ? people.join(", ")
              : `${people.slice(0, 2).join(", ")} and ${people.length - 2} more`;
        return `${count} · ${who}`;
      };

      type Row = z.infer<typeof threadRow>;
      const groups = { now: [] as Row[], always: [] as Row[], older: [] as Row[] };
      for (const row of rows) {
        const shaped = {
          id: row.id,
          name: row.name,
          icon: row.icon,
          count: row.count,
          meta: meta(row.count, others.get(row.id) ?? []),
        };
        // always_on wins over staleness: a thread that never closes has not
        // gone quiet, it is just waiting.
        if (row.alwaysOn) groups.always.push(shaped);
        else if (row.lastActivityAt.getTime() < stale) groups.older.push(shaped);
        else groups.now.push(shaped);
      }

      return reply.send({
        groups: [
          { key: "now" as const, threads: groups.now },
          { key: "always" as const, threads: groups.always },
          { key: "older" as const, threads: groups.older },
        ],
      });
    }
  );

  // ---------------------------------------------------------- one thread
  //
  // Four queries: membership, the thread, its members, its counts. It does not
  // become five because the thread holds more, and it must not become one per
  // widget when 007 draws them.
  //
  // 008 spends the fifth. 005 reserved it for a standing summary, which still
  // does not exist; memories took it instead, and both specs are amended rather
  // than left disagreeing about a number one of them enforces. It is bounded by
  // MAX_MEMORIES_PER_THREAD, so it is a fifth query and never a sixth.
  app.get(
    "/v1/threads/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: threadBundle, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const { id } = request.params;
        await requireMember(accountId, id);

        const thread = await db
          .selectFrom("threads")
          .select(["id", "name", "icon", "always_on", "attrs"])
          .where("id", "=", id)
          .where("deleted_at", "is", null)
          .executeTakeFirst();
        if (!thread) throw new NotYours();

        // One query, two counts. Postgres will not scan two partial indexes in
        // one statement, so this rides content_thread_idx, which covers both
        // states, with a filter per count.
        const counts = await db
          .selectFrom("content")
          .select([
            sql<string>`count(*) filter (where archived_at is null)`.as("active"),
            sql<string>`count(*) filter (where archived_at is not null)`.as("archived"),
          ])
          .where("thread_id", "=", id)
          .where("deleted_at", "is", null)
          .executeTakeFirstOrThrow();

        return reply.send({
          id: thread.id,
          name: thread.name,
          icon: thread.icon,
          alwaysOn: thread.always_on,
          counts: { active: Number(counts.active), archived: Number(counts.archived) },
          members: await membersOf(id, accountId),
          // Validated on the way out as well as on the way in. A preference
          // naming a widget that no longer exists renders as though it were
          // absent, because a thread whose contents changed under a preference
          // is the normal case rather than an edge one.
          memories: await readableMemories(accountId, id),
          preference: readPreference(thread.attrs),
          standing: null,
        });
      })
  );

  // ------------------------------------------------- a thread's content
  app.get(
    "/v1/threads/:id/content",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          cursor: z.string().optional(),
          archived: z.enum(["true", "false"]).default("false"),
        }),
        response: { 200: contentPage, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const { id } = request.params;
        await requireMember(accountId, id);

        const wantArchived = request.query.archived === "true";

        let query = db
          .selectFrom("content")
          .leftJoin("accounts", "accounts.id", "content.account_id")
          .leftJoin("places", "places.id", "content.place_id")
          .select([
            "content.id as id",
            "content.type as type",
            "content.title as title",
            "content.body as body",
            "content.created_at as created_at",
            "content.archived_at as archived_at",
            "content.account_id as account_id",
            "content.done_at as done_at",
            "content.due_at as due_at",
            "content.occurs_at as occurs_at",
            "content.is_reminder as is_reminder",
            "content.priority as priority",
            "content.priority_pinned as priority_pinned",
            "content.tags as tags",
            "content.place_id as place_id",
            "accounts.display_name as authorName",
            "places.name as placeName",
            "places.formatted_address as placeAddress",
            "places.lat as placeLat",
            "places.lng as placeLng",
          ])
          .where("content.thread_id", "=", id)
          .where("content.deleted_at", "is", null)
          .where("content.archived_at", wantArchived ? "is not" : "is", null)
          .orderBy("content.id", "desc")
          .limit(PAGE + 1);

        // The cursor is the id alone, and the ordering is by id alone.
        //
        // 001 specifies "(created_at, id), which UUIDv7 makes monotonic", and
        // the id is what makes it monotonic, so the id is the whole cursor. The
        // pair version is worse in a way that only shows up under load:
        // Postgres stores `created_at` to the microsecond and a JavaScript Date
        // holds milliseconds, so round-tripping the timestamp through the
        // cursor truncates it. Rows written inside the same millisecond then
        // fall in the gap, because `created_at < cursor` skips them and the
        // `created_at = cursor` tie-break never matches a value that has
        // microseconds. Eighty rows inserted in a loop lost one, which is what
        // a real thread filled by one dump would do.
        if (request.query.cursor) {
          query = query.where("content.id", "<", request.query.cursor);
        }

        const rows = await query.execute();
        const page = rows.slice(0, PAGE);
        const last = page.at(-1);

        return reply.send({
          rows: page.map((row) => toRow(row, accountId)),
          nextCursor: rows.length > PAGE && last ? last.id : null,
        });
      })
  );

  // ------------------------------------------------------ one piece
  app.get(
    "/v1/content/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: contentDetail, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        await requireReadable(accountId, request.params.id);

        const row = await db
          .selectFrom("content")
          .innerJoin("threads", "threads.id", "content.thread_id")
          .leftJoin("accounts", "accounts.id", "content.account_id")
          .leftJoin("places", "places.id", "content.place_id")
          .select([
            "content.id as id",
            "content.type as type",
            "content.title as title",
            "content.body as body",
            "content.created_at as created_at",
            "content.archived_at as archived_at",
            "content.account_id as account_id",
            "content.done_at as done_at",
            "content.due_at as due_at",
            "content.occurs_at as occurs_at",
            "content.is_reminder as is_reminder",
            "content.priority as priority",
            "content.priority_pinned as priority_pinned",
            "content.tags as tags",
            "content.place_id as place_id",
            "content.derived_from_message_id as fromMessageId",
            "content.thread_id as threadId",
            "threads.name as threadName",
            "accounts.display_name as authorName",
            "places.name as placeName",
            "places.formatted_address as placeAddress",
            "places.lat as placeLat",
            "places.lng as placeLng",
          ])
          .where("content.id", "=", request.params.id)
          .executeTakeFirstOrThrow();

        // Provenance is the dump and the author, never the history of where
        // this has been. Content that moved must not carry its old thread's
        // name to people who were never in it.
        const from = row.fromMessageId
          ? await db
              .selectFrom("messages")
              .select(["id", "text", "created_at"])
              .where("id", "=", row.fromMessageId)
              .where("deleted_at", "is", null)
              .executeTakeFirst()
          : undefined;

        return reply.send({
          ...toRow(row, accountId),
          threadId: row.threadId,
          threadName: row.threadName,
          from: from
            ? {
                messageId: from.id,
                text: from.text,
                at: from.created_at.toISOString(),
              }
            : null,
        });
      })
  );

  // ================================================================ writes
  //
  // All of them return the row as it now is and what it was, so Undo is one
  // more call to the same endpoint with the old value and the client holds
  // nothing across a reload.

  const previousTitle = z.object({ title: z.string(), body: z.string().nullable() });

  // Edit. Co-owned: anybody in the thread may fix a title offload got wrong,
  // which is most of what this page is for.
  app.patch(
    "/v1/content/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          title: z.string().min(1).max(200).optional(),
          body: z.string().max(4000).nullable().optional(),
        }),
        response: {
          200: z.object({ content: contentRow, previous: previousTitle }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const previous = await editContent(accountId, request.params.id, request.body);
        return reply.send({
          content: await rowById(request.params.id, accountId),
          previous,
        });
      })
  );

  // Archive and restore. The co-owned soft action, and the reason a shared list
  // is usable: without it a thread fills with rows only their author can clear.
  for (const [path, archive] of [
    ["archive", true],
    ["restore", false],
  ] as const) {
    app.post(
      `/v1/content/:id/${path}`,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          response: { 200: z.object({ content: contentRow }), 401: unauthenticated, 404: notFound },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          await setArchived(accountId, request.params.id, archive);
          return reply.send({ content: await rowById(request.params.id, accountId) });
        })
    );
  }

  // Move. The author's, like delete, because both change who can see something.
  app.post(
    "/v1/content/:id/move",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ threadId: z.string().uuid() }),
        response: {
          200: z.object({ content: contentRow, previous: z.object({ threadId: z.string() }) }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const previous = await moveContent(accountId, request.params.id, request.body.threadId);
        return reply.send({
          content: await rowById(request.params.id, accountId),
          previous,
        });
      })
  );

  // Delete. Author only, soft, on 004's mechanism exactly: eight seconds, then
  // the purge job that is the only hard delete in the codebase.
  app.delete(
    "/v1/content/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ deleted: z.boolean() }), 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const deleted = await deleteContent(accountId, request.params.id);
        return reply.send({ deleted });
      })
  );

  // ------------------------------------------------------------- memories
  //
  // A memory is a standing fact about a thread rather than something in it, so
  // these sit on the thread and not on content. The permission split is the one
  // OFF-3 already sets and 005 already applied to content: reading and editing
  // are co-owned, deleting is the author's, and mute is what everybody else
  // gets instead. Mute is to a memory what archive is to content.

  app.post(
    "/v1/threads/:id/memories",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ text: z.string().min(1).max(MEMORY_TEXT_CHARS) }),
        response: {
          200: z.object({ memory: memorySchema }),
          401: unauthenticated,
          404: notFound,
          // Carries the count and never the text: a refusal is not a reason to
          // start echoing dumped text into responses somebody might log.
          409: z.object({ error: z.literal("thread_memory_full"), limit: z.number() }),
          413: z.object({ error: z.literal("too_long"), maxChars: z.number() }),
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const { id } = request.params;
        await requireMember(accountId, id);

        try {
          // Its own transaction, because the cap is enforced with a lock on the
          // thread row and a lock is only worth taking inside the transaction
          // that does the insert.
          const memory = await db.transaction().execute((trx) =>
            addMemory(
              { threadId: id, accountId, text: request.body.text, origin: "stated" },
              trx,
            ),
          );
          await touchThread(id, db);
          return reply.send({ memory });
        } catch (error) {
          if (error instanceof MemoryLimit) {
            return reply
              .code(409)
              .send({ error: "thread_memory_full" as const, limit: MAX_MEMORIES_PER_THREAD });
          }
          if (error instanceof MemoryTooLong) {
            return reply
              .code(413)
              .send({ error: "too_long" as const, maxChars: MEMORY_TEXT_CHARS });
          }
          throw error;
        }
      })
  );

  // Edit. Any member, and the full text rather than the shortened form the chip
  // shows. Returns `previous` so Undo has something to write back.
  app.patch(
    "/v1/memories/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ text: z.string().min(1).max(MEMORY_TEXT_CHARS) }),
        response: {
          200: z.object({ memory: memorySchema, previous: z.string() }),
          401: unauthenticated,
          404: notFound,
          // The thread already holds this sentence. Refused rather than merged
          // into the existing row, which would destroy one memory to satisfy an
          // edit of another.
          409: z.object({ error: z.literal("duplicate") }),
          413: z.object({ error: z.literal("too_long"), maxChars: z.number() }),
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        try {
          const result = await db
            .transaction()
            .execute((trx) =>
              editMemory({ memoryId: request.params.id, accountId, text: request.body.text }, trx),
            );
          if (!result) return reply.code(409).send({ error: "duplicate" as const });
          return reply.send(result);
        } catch (error) {
          if (error instanceof MemoryTooLong) {
            return reply
              .code(413)
              .send({ error: "too_long" as const, maxChars: MEMORY_TEXT_CHARS });
          }
          throw error;
        }
      })
  );

  // Delete. The author's alone, per OFF-3. A member who did not write it gets
  // the same refusal a non-member gets, so the response never teaches who did.
  app.delete(
    "/v1/memories/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ deleted: z.boolean() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const deleted = await deleteMemory(request.params.id, accountId);
        return reply.send({ deleted });
      })
  );

  // Undo the delete. Re-checks the cap, which is the one door it could
  // otherwise walk through: at ten, delete one, add another, then press Undo.
  app.post(
    "/v1/memories/:id/restore",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ memory: memorySchema }),
          401: unauthenticated,
          404: notFound,
          409: z.object({ error: z.literal("thread_memory_full"), limit: z.number() }),
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        try {
          const memory = await db
            .transaction()
            .execute((trx) => restoreMemory(request.params.id, accountId, trx));
          return reply.send({ memory });
        } catch (error) {
          if (error instanceof MemoryLimit) {
            return reply
              .code(409)
              .send({ error: "thread_memory_full" as const, limit: MAX_MEMORIES_PER_THREAD });
          }
          throw error;
        }
      })
  );

  // Mute and unmute. Any member, thread-wide, and reversible, which is why it
  // is on the OFF-6 allowlist rather than under an eight second toast.
  app.post(
    "/v1/memories/:id/mute",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ muted: z.boolean() }),
        response: {
          200: z.object({ memory: memorySchema }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const memory = await setMuted(request.params.id, accountId, request.body.muted);
        return reply.send({ memory });
      })
  );

  // Rename a thread. Co-owned: a shared thread's name belongs to everybody in
  // it, and renaming touches no content.
  app.patch(
    "/v1/threads/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ name: z.string().min(1).max(80) }),
        response: {
          200: z.object({
            thread: z.object({ id: z.string(), name: z.string() }),
            previous: z.object({ name: z.string() }),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const previous = await renameThread(accountId, request.params.id, request.body.name);
        return reply.send({
          thread: { id: request.params.id, name: request.body.name },
          previous,
        });
      })
  );

  // Tick, reprioritise and arrange. All co-owned, all reversible, all returning
  // what was there so Undo is one more call with the old value.
  app.post(
    "/v1/content/:id/complete",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ done: z.boolean() }),
        response: {
          200: z.object({ content: contentRow, previous: z.object({ done: z.boolean() }) }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const previous = await completeContent(accountId, request.params.id, request.body.done);
        return reply.send({ content: await rowById(request.params.id, accountId), previous });
      })
  );

  app.post(
    "/v1/content/:id/priority",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ priority: z.number().int().min(0).max(100) }),
        response: {
          200: z.object({
            content: contentRow,
            previous: z.object({ priority: z.number(), priorityPinned: z.boolean() }),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const previous = await reprioritise(accountId, request.params.id, request.body.priority);
        return reply.send({ content: await rowById(request.params.id, accountId), previous });
      })
  );

  app.patch(
    "/v1/threads/:id/preference",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          widgets: z.array(z.string()).nullish(),
          groupBy: z.record(z.string(), z.string()).nullish(),
        }),
        response: {
          200: z.object({
            preference: z.object({
              widgets: z.array(z.string()).optional(),
              groupBy: z.record(z.string(), z.string()).optional(),
            }),
            previous: z.object({
              widgets: z.array(z.string()).optional(),
              groupBy: z.record(z.string(), z.string()).optional(),
            }),
          }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const previous = await setPreference(accountId, request.params.id, {
          ...(request.body.widgets === undefined ? {} : { widgets: request.body.widgets }),
          ...(request.body.groupBy === undefined ? {} : { groupBy: request.body.groupBy }),
        });

        const now = await db
          .selectFrom("threads")
          .select("attrs")
          .where("id", "=", request.params.id)
          .executeTakeFirstOrThrow();

        return reply.send({ preference: readPreference(now.attrs), previous });
      })
  );
}

/** One row, shaped the way every response shapes it. Re-read after a write
 *  rather than assembled from the update, so what the client renders is what
 *  the database holds. */
async function rowById(contentId: string, viewerId: string) {
  const row = await db
    .selectFrom("content")
    .leftJoin("accounts", "accounts.id", "content.account_id")
    .leftJoin("places", "places.id", "content.place_id")
    .select([
      "content.id as id",
      "content.type as type",
      "content.title as title",
      "content.body as body",
      "content.created_at as created_at",
      "content.archived_at as archived_at",
      "content.account_id as account_id",
      "content.done_at as done_at",
      "content.due_at as due_at",
      "content.occurs_at as occurs_at",
      "content.is_reminder as is_reminder",
      "content.priority as priority",
      "content.priority_pinned as priority_pinned",
      "content.tags as tags",
      "content.place_id as place_id",
      "accounts.display_name as authorName",
      "places.name as placeName",
      "places.formatted_address as placeAddress",
      "places.lat as placeLat",
      "places.lng as placeLng",
    ])
    .where("content.id", "=", contentId)
    .executeTakeFirstOrThrow();
  return toRow(row, viewerId);
}

export const THREAD_LIMITS = { PAGE, STALE_DAYS } as const;
