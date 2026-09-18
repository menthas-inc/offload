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
import { initialsOf } from "../accounts/initials.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import {
  NOTE_BODY_CHARS,
  NOTE_TEXT_CHARS,
  NoteTooLong,
  addNote,
  deleteNote,
  editNote,
  reprioritiseNote,
  foldedNotes,
  noteCounts,
  readableNotes,
  restoreNote,
  setMuted,
} from "../threads/notes.js";
import { readPreference, type ThreadPreference } from "../threads/widgets.js";
import { calendarCounts, dropPicksOf, setPick, threadEvents, viewerCalendars } from "../threads/calendars.js";
import { emit } from "../analytics.js";
import { isBareDate, parseWhen } from "../threads/dates.js";
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
  /** The account's default thread, which cannot be deleted: everything with no
   *  obvious home lands there, so an account without one has nowhere to put
   *  anything. The list carries it so the row can say why rather than offering
   *  a control the server will refuse. */
  isDefault: z.boolean(),
});

const threadList = z.object({
  groups: z.array(
    z.object({
      key: z.enum(["now", "always", "older"]),
      threads: z.array(threadRow),
    })
  ),
});

/** How many folded notes come back in one page. History is browsed, not
 *  worked with, so this is small on purpose. */
const FOLDED_PAGE = 20;

const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** What was dumped when it did not fit in 200 characters. Never in a prompt,
   *  and never shown on a row: the row shows `text` and opening it shows this. */
  body: z.string().nullable(),
  /** `learned` is offload's, and the screen marks it. It also means offload
   *  wrote the text over somebody's longer words, which is the same claim: this
   *  sentence is offload's. */
  origin: z.enum(["stated", "learned"]),
  /** Null once the author deleted their account: the note stays in the shared
   *  thread it belongs to and the name comes off it. */
  authorId: z.string().nullable(),
  /** False once the author left or deleted their account, at which point every
   *  member may delete it. */
  authorIsMember: z.boolean(),
  muted: z.boolean(),
  occursAt: z.coerce.date().nullable(),
  occursEndAt: z.coerce.date().nullable(),
  dueAt: z.coerce.date().nullable(),
  placeId: z.string().nullable(),
  /** Where it sits in the section, 0 to 100 and higher first. A person moves
   *  it by dragging the row; nothing else writes it. */
  priority: z.number(),
  /** When it was last written. What decides which notes reach a prompt when a
   *  thread holds more than the budget, and what the row shows. */
  writtenAt: z.coerce.date(),
  /** The date carries no time, so nothing may draw one. */
  allDay: z.boolean(),
  /** That it comes round again, as a rule rather than as occurrences. The
   *  calendar expands it over whatever window is on screen. */
  repeats: z.enum(["day", "weekday", "week", "two_weeks", "month", "year"]).nullable(),
  repeatsUntil: z.coerce.date().nullable(),
  /** Set aside by the daily job. Only ever present on the folded list. */
  supersededAt: z.coerce.date().nullable(),
});

const threadBundle = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  alwaysOn: z.boolean(),
  counts: z.object({ active: z.number(), archived: z.number() }),
  members: z.array(memberSchema),
  /** What this thread holds about itself. Active only: what the daily job
   *  folded is its own paginated read, because that list has no ceiling. */
  notes: z.array(noteSchema),
  /** Active and folded. The second is what the section's folded-history control
   *  counts, and a thread with none of them says nothing. */
  noteCounts: z.object({ active: z.number(), folded: z.number() }),
  /** How this thread wants to look. Absent fields mean derived from content. */
  preference: z.object({
    widgets: z.array(z.string()).optional(),
    groupBy: z.record(z.string(), z.string()).optional(),
    hideDone: z.boolean().optional(),
  }),
  /** Always null. offload does not summarise a thread yet and nothing writes a
   *  standing summary, so the field is here in the shape the client already
   *  renders an empty state from. When something writes one, no client changes. */
  /** Null until something writes summaries, which nothing does. Nullable
   *  string rather than `null` so the client's branch is real code that is
   *  typechecked and tested rather than a branch nobody can reach. */
  standing: z.string().nullable(),
  /** 019. The viewer's picks and approved count, and whether anybody has
   *  picked here, which earns the rail. Null when the account has no calendar
   *  connection at all, which is what hides the glyph. */
  calendars: z
    .object({ picked: z.number(), total: z.number(), anyPicked: z.boolean() })
    .nullable(),
});

const contentRow = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
  /** What 006 extracts, and what 007's widgets are derived from. All of it may
   *  be null or empty, which is what a thread of plain notes looks like. */
  doneAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  occursAt: z.string().nullable(),
  /** The other end of a span, so a thing that covers three days is drawn on
   *  three days. Written since 0011 and read by nothing until 015. */
  occursEndAt: z.string().nullable(),
  /** That it comes round again, as a rule the calendar expands. Distinct from
   *  `seriesRef`, which is occurrences a calendar already sent. */
  repeats: z.enum(["day", "weekday", "week", "two_weeks", "month", "year"]).nullable(),
  repeatsUntil: z.string().nullable(),
  isReminder: z.boolean(),
  priority: z.number(),
  priorityPinned: z.boolean(),
  tags: z.array(z.string()),
  /** The repeating series this occurrence belongs to, or null for a one off.
   *
   *  Derived from `attrs`, which is never sent whole, exactly as `place` is
   *  built rather than the raw key being handed over. A list collapses a series
   *  to one entry and counts the rest; a calendar draws every occurrence, which
   *  is why the field says which series rather than how to draw it. */
  seriesRef: z.string().nullable(),
  /** The date carries no time, so nothing may draw one. A day drawn as a time
   *  is a day drawn wrong: "Sunday brunch" filed as a bare date read
   *  "Saturday, 8:00 PM" to somebody in New York. */
  allDay: z.boolean(),
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
  /** Typed straight into the thread and not read by offload yet. The row is
   *  already saved and already usable; this only says a tidier version may
   *  arrive. Null the rest of the time, which is almost always. */
  filingAt: z.string().nullable(),
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
  url: string | null;
  image_url: string | null;
  created_at: Date;
  archived_at: Date | null;
  /** Null once the author deleted their account. OFF-3 keeps their content in
   *  the threads they shared, so the row outlives them and loses the name. */
  account_id: string | null;
  authorName: string | null;
  /** Whether the author is still in this thread. False once they deleted their
   *  account or left, at which point the row is everyone's. */
  authorIsMember: boolean;
  done_at: Date | null;
  /** Typed straight in and queued for offload to read. Null once it has. */
  filing_at: Date | null;
  due_at: Date | null;
  occurs_at: Date | null;
  /** The other end of a span. **Written since 0011 and read by nothing until
   *  015**, which is why a two day event drew as a point on the rail: the
   *  column was on the row, off the select, and absent from every shape above
   *  it. */
  occurs_end_at: Date | null;
  repeats: "day" | "weekday" | "week" | "two_weeks" | "month" | "year" | null;
  repeats_until: Date | null;
  is_reminder: boolean;
  priority: number;
  priority_pinned: boolean;
  tags: string[];
  place_id: string | null;
  /** Whatever the source put on the row. Only `series_ref` is read here, and
   *  only to say whether an occurrence belongs to something that repeats.
   *
   *  `unknown` because that is what Kysely gives a jsonb column, and narrowing
   *  it at the boundary would be claiming a shape nothing validates. */
  attrs: unknown;
  placeName: string | null;
  placeAddress: string | null;
  placeLat: number | null;
  placeLng: number | null;
}

/** Which repeating series an occurrence belongs to, or null.
 *
 *  `series_ref` is Google's id for the whole series, written by the calendar
 *  sync onto every occurrence it produces. Empty string is treated as absent:
 *  a row whose series is the empty string belongs to nothing, and grouping by
 *  it would collect every such row into one imaginary series. */
/** A date with no time in it. Derived from `attrs`, which is never sent whole,
 *  exactly as `seriesRef` and `placeId` are. */
function allDayOf(attrs: unknown): boolean {
  if (typeof attrs !== "object" || attrs === null) return false;
  return (attrs as Record<string, unknown>)["all_day"] === true;
}

function seriesRefOf(attrs: unknown): string | null {
  if (typeof attrs !== "object" || attrs === null) return null;
  const ref = (attrs as Record<string, unknown>)["series_ref"];
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

function toRow(row: RawRow, viewerId: string) {
  // A departed author is nobody, so `mine` is false and the two controls that
  // belong to an author are off for everyone. That is OFF-3 working rather
  // than a gap: nobody may delete what they did not write, and the person who
  // did is gone. Archive is the co-owned action and still applies, so a thread
  // can be cleared without destroying what somebody left in it.
  const mine = row.account_id !== null && row.account_id === viewerId;
  // Author, or nobody current. OFF-3 gives delete to the author so a shared
  // thread cannot become a place where somebody else destroys what you put in;
  // once the author is gone there is nothing left to protect and the rule only
  // produces leftovers no member can clear.
  const ownerless = row.account_id === null || !row.authorIsMember;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    // Where it came from, when it came from a page. The clients turn this into
    // the thing that opens; until 0041 it lived in `body` by convention and was
    // missing from two thirds of the link rows in production.
    url: row.url,
    // An address, never bytes. The client loads it from the site, which is the
    // thing section 9 of the privacy policy now says out loud.
    imageUrl: row.image_url,
    createdAt: row.created_at.toISOString(),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    doneAt: row.done_at ? row.done_at.toISOString() : null,
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    occursAt: row.occurs_at ? row.occurs_at.toISOString() : null,
    occursEndAt: row.occurs_end_at ? row.occurs_end_at.toISOString() : null,
    repeats: row.repeats,
    repeatsUntil: row.repeats_until ? row.repeats_until.toISOString() : null,
    isReminder: row.is_reminder,
    priority: row.priority,
    priorityPinned: row.priority_pinned,
    tags: row.tags,
    // Derived rather than sending `attrs` whole, exactly as `placeId` is: the
    // client needs to know an occurrence repeats and has no business with the
    // rest of what a calendar sync wrote.
    seriesRef: seriesRefOf(row.attrs),
    allDay: allDayOf(row.attrs),
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
    // Both actions change who can see something, so both are the author's,
    // or everybody's once the author is gone.
    canDelete: mine || ownerless,
    canMove: mine || ownerless,
    filingAt: row.filing_at ? row.filing_at.toISOString() : null,
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
 *  decremented comes back with it.
 *
 *  **`content_count` is what is live in the thread**, since 2026-09-16: rows
 *  neither archived nor deleted. Archiving left it alone until then, on the
 *  grounds that the row was still there, and My threads said 9 about a thread
 *  whose own page said 7 next to an "2 archived" row. The product owner's rule
 *  is that archived rows do not count towards a total, and this is the total
 *  the thread row shows. So archive decrements, and restore puts back exactly
 *  one, whether the row was archived, deleted or both. */
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
      .select(["deleted_at", "archived_at"])
      .where("id", "=", ref.id)
      .executeTakeFirstOrThrow();
    // Counted iff live. Both transitions read this once so a second archive of
    // an archived row, or a restore of one already back, moves nothing.
    const wasLive = before.deleted_at === null && before.archived_at === null;

    await trx
      .updateTable("content")
      .set({
        archived_at: archived ? sql`now()` : null,
        ...(archived ? {} : { deleted_at: null, purge_after: null }),
        updated_at: sql`now()`,
      })
      .where("id", "=", ref.id)
      .execute();

    // Restoring puts the count back. Without this an undo restores the row and
    // leaves the header saying one fewer, which is AC-8 broken by the undo path
    // rather than by the delete.
    if (archived && wasLive) {
      await trx
        .updateTable("threads")
        .set({ content_count: sql`greatest(content_count - 1, 0)` })
        .where("id", "=", ref.threadId)
        .execute();
    } else if (!archived && !wasLive) {
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
    const moved = await trx
      .updateTable("content")
      .set({ thread_id: destination, updated_at: sql`now()` })
      .where("id", "=", ref.id)
      .returning("archived_at")
      .executeTakeFirstOrThrow();

    // Both counts, in the same transaction as the write that changes them, per
    // 001. A count maintained anywhere else drifts. An archived row is in
    // neither count, so moving it moves nothing.
    if (moved.archived_at === null) {
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
    }

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
      .returning("archived_at")
      .executeTakeFirst();

    if (!result) return false;

    // An archived row already left the count when it was archived.
    if (result.archived_at === null) {
      await trx
        .updateTable("threads")
        .set({ content_count: sql`greatest(content_count - 1, 0)` })
        .where("id", "=", ref.threadId)
        .execute();
    }
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
 *  clear the widget order.
 *
 *  **Except the fold, which is the member's.** Which finished rows you have
 *  put away is about what you have read, not about how the thread is arranged,
 *  so it lives on the membership row and one person folding a shared list
 *  folds it for nobody else. */
export async function setPreference(
  accountId: string,
  threadId: string,
  patch: {
    widgets?: string[] | null;
    groupBy?: Record<string, string> | null;
    hideDone?: boolean | null;
  },
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

    const member = await trx
      .selectFrom("thread_members")
      .select("hide_done")
      .where("thread_id", "=", threadId)
      .where("account_id", "=", accountId)
      .executeTakeFirstOrThrow();

    const before = { ...readPreference(row.attrs), ...(member.hide_done ? { hideDone: true } : {}) };

    if (patch.widgets !== undefined || patch.groupBy !== undefined) {
      const merged = readPreference({
        widgets: patch.widgets === undefined ? before.widgets : patch.widgets,
        groupBy: patch.groupBy === undefined ? before.groupBy : patch.groupBy,
      });
      await trx
        .updateTable("threads")
        .set({ attrs: JSON.stringify(merged), updated_at: sql`now()` })
        .where("id", "=", threadId)
        .execute();
    }

    if (patch.hideDone !== undefined) {
      // No `updated_at` on the thread: nothing about the thread moved.
      await trx
        .updateTable("thread_members")
        .set({ hide_done: patch.hideDone === true })
        .where("thread_id", "=", threadId)
        .where("account_id", "=", accountId)
        .execute();
    }

    return before;
  });
}

/** The thread's arrangement and the viewer's own fold, as one object. The
 *  clients read one preference; where each field lives is the server's. */
async function preferenceOf(accountId: string, threadId: string): Promise<ThreadPreference> {
  const row = await db
    .selectFrom("threads")
    .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
    .select(["threads.attrs", "thread_members.hide_done"])
    .where("threads.id", "=", threadId)
    .where("thread_members.account_id", "=", accountId)
    .executeTakeFirstOrThrow();
  return { ...readPreference(row.attrs), ...(row.hide_done ? { hideDone: true } : {}) };
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

/** Leaving a thread, which is also how a thread dies.
 *
 *  **There is no delete-somebody-else's-thread, because there is no owner.**
 *  OFF-3: a thread resolves to its member set, and the privacy policy says in
 *  public that no role can throw someone out, take it over, or empty it. So
 *  this removes the caller and nobody else, and the thread goes when the last
 *  member is out, which is exactly what that page already promises.
 *
 *  On a thread nobody else is in, those are the same action, which is why one
 *  endpoint serves both and the screen can call it Delete.
 *
 *  Soft, with `purge_after`, so the eight seconds are real and the destroying
 *  is done by the purge job like everything else (DATA-1).
 */
export async function deleteThread(
  accountId: string,
  threadId: string,
): Promise<{ left: boolean; deleted: boolean }> {
  return db.transaction().execute(async (trx) => {
    await requireMember(accountId, threadId, trx);

    // Every dump with no obvious home lands in the default thread, so an
    // account without one has nowhere to put anything (004 AC-2). Refused
    // rather than handled, because there is no good answer to "where did my
    // dump go" afterwards.
    const account = await trx
      .selectFrom("accounts")
      .select("default_thread_id")
      .where("id", "=", accountId)
      .executeTakeFirst();
    if (account?.default_thread_id === threadId) throw new NotYours();

    await trx
      .deleteFrom("thread_members")
      .where("thread_id", "=", threadId)
      .where("account_id", "=", accountId)
      .execute();
    // 019. A member leaving takes their calendar picks with them.
    await dropPicksOf(accountId, threadId, trx);

    const remaining = await trx
      .selectFrom("thread_members")
      .select(({ fn }) => fn.countAll<string>().as("n"))
      .where("thread_id", "=", threadId)
      .where("state", "=", "accepted")
      .executeTakeFirstOrThrow();

    if (Number(remaining.n) > 0) return { left: true, deleted: false };

    await trx
      .updateTable("threads")
      .set({
        deleted_at: sql`now()`,
        purge_after: sql`now() + interval '8 seconds'`,
        updated_at: sql`now()`,
      })
      .where("id", "=", threadId)
      .where("deleted_at", "is", null)
      .execute();

    return { left: true, deleted: true };
  });
}

/** Undo. Puts the membership back and, if the thread died with it, revives it.
 *
 *  Reachable only inside the eight seconds: after that the purge job has taken
 *  the row and there is nothing to put back. */
export async function restoreThread(
  accountId: string,
  threadId: string,
): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const thread = await trx
      .selectFrom("threads")
      .select(["id", "deleted_at"])
      .where("id", "=", threadId)
      .executeTakeFirst();
    if (!thread) return false;

    await trx
      .updateTable("threads")
      .set({ deleted_at: null, purge_after: null, updated_at: sql`now()` })
      .where("id", "=", threadId)
      .execute();

    // `on conflict do nothing`: pressing Undo twice must not raise, and the
    // unique index on (thread_id, account_id) is what makes that free.
    await trx
      .insertInto("thread_members")
      .values({ thread_id: threadId, account_id: accountId, state: "accepted" })
      .onConflict((oc) => oc.doNothing())
      .execute();

    return true;
  });
}

/** How long a typed row may claim to be filing before a client stops waiting.
 *
 *  Nothing sweeps the column. A worker that died leaves a timestamp behind, and
 *  the row is a perfectly good row either way, so the only thing that has to
 *  expire is the spinner. Generous against a model that takes five seconds. */
export const FILING_PATIENCE_MS = 2 * 60 * 1000;

/** The most a person can type into a section heading's +. */
export const QUICK_ADD_CHARS = 500;

/** What the + on a widget's heading starts the row as.
 *
 *  A guess, and a deliberately weak one: it decides which section the row
 *  appears in for the few seconds before offload has read it, so adding from To
 *  do puts it in To do rather than making it appear somewhere else and jump.
 *  offload may change it, and the change mark says so when it does.
 *
 *  **A section with no answer here writes a note instead**, which is what 014
 *  made of a typed sentence with nothing else to be. Files is the one that
 *  lands there: you cannot type a file, and the words somebody typed are a
 *  sentence about the thread.
 *
 *  **`timeline` is the day rail's own +, not a widget.** It went with 015 when
 *  the rail stopped being one and comes back here because the rail has a + of
 *  its own now, on the selected day's heading. */
const STARTS_AS: Record<string, "task" | "location" | "event"> = {
  todo: "task",
  map: "location",
  timeline: "event",
};

/** Write what somebody typed, then ask offload what it was.
 *
 *  **The row exists before the model is involved and does not depend on it.**
 *  The worst mistake this product can make is losing what somebody wrote, so
 *  the text is a row in the thread from the moment they hit enter. If the
 *  worker never runs, they have a row saying exactly what they typed, in the
 *  thread they typed it into, which is a good outcome rather than a broken one.
 *  Everything the model does afterwards is an improvement on something already
 *  safe.
 *
 *  It never leaves this thread. A dump chooses a home and this one is already
 *  chosen, which is the whole difference between the composer and a + on a
 *  section: somebody adding to To do has said where it goes.
 *
 *  **`day` is structured, and it is the only thing that is.** The rail's + knows
 *  which day heading it sits under, which is not something anybody said; it is
 *  where they pressed. It arrives as a real value rather than as something
 *  offload has to read out of a sentence, and it is final the moment this
 *  function returns, because `edit_content` carries no date.
 *
 *  **`repeats` used to arrive the same way, from a tick, and does not any
 *  more (2026-09-14).** The reasoning for the tick was that `edit_content`
 *  cannot set a repeat either, so a repeat had to be structural or it could
 *  never be set at all. It can: the model reads the words at the moment it
 *  writes the row, and "weekly on Monday at 2pm" says more than a box ever
 *  could. A box also asks somebody to choose a format before they can put
 *  something down, which is the one thing this product does not do.
 */
export async function quickAdd(
  accountId: string,
  threadId: string,
  text: string,
  section: string,
  options: { day?: string | null | undefined } = {},
): Promise<{ id: string; kind: "content" | "note" }> {
  await requireMember(accountId, threadId);

  const startsAs = STARTS_AS[section];

  // A sentence with no widget type to start as is a note, and a note needs no
  // job: it is already exactly what it is, in the person's own words. The
  // reclassification below exists to turn a typed line into a task with a date,
  // and there is nothing to turn.
  if (!startsAs) {
    const note = await addNote({ threadId, accountId, text, origin: "stated" });
    await touchThread(threadId, db);
    return { id: note.id, kind: "note" };
  }

  // A day with no time in it, noon UTC per `parseWhen`, so it reads back as
  // the same calendar day almost everywhere.
  const occursAt = options.day ? parseWhen(options.day) : null;
  const allDay = occursAt ? isBareDate(options.day) : false;

  return db.transaction().execute(async (trx) => {
    const row = await trx
      .insertInto("content")
      .values({
        account_id: accountId,
        thread_id: threadId,
        // Their words, untouched, as the title. offload rewrites it if it can
        // do better, and until then the row says what they said.
        type: startsAs,
        title: text,
        source: "person",
        filing_at: sql`now()`,
        updated_at: sql`now()`,
        ...(occursAt ? { occurs_at: occursAt } : {}),
        ...(allDay ? { attrs: { all_day: true } } : {}),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    // In the same transaction as the row, per the queue's own reasoning: a row
    // written without its job is a row that never gets read, and a job enqueued
    // without its row is a job with nothing to work on.
    await trx
      .updateTable("threads")
      .set({ content_count: sql`content_count + 1` })
      .where("id", "=", threadId)
      .execute();
    await touchThread(threadId, trx);

    await enqueue({
      kind: "thread.quick_add",
      payload: { contentId: row.id, threadId },
      accountId,
      priority: PRIORITY.interactive,
      // Somebody is looking at the row right now. One retry, the same as a
      // dump, rather than the five an email deserves.
      maxAttempts: 2,
      tx: trx,
    });

    return { id: row.id, kind: "content" as const };
  });
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

      // Which thread is the account's default, so the list can say why one
      // row has no delete. Read here rather than inferred from the name: the
      // default is whatever `accounts.default_thread_id` points at, never a
      // thread called Miscellaneous, and 004 is explicit about that.
      const account = await db
        .selectFrom("accounts")
        .select("default_thread_id")
        .where("id", "=", accountId)
        .executeTakeFirst();

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
          isDefault: row.id === account?.default_thread_id,
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
  // does not exist; notes took it instead, and both specs are amended rather
  // than left disagreeing about a number one of them enforces. 014 spends a
  // sixth on the two counts the section needs, which is one query for both and
  // not one per count.
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

        // The viewer's membership rides along, for the fold. It was checked a
        // line above, so the join is a column and not a second check.
        const thread = await db
          .selectFrom("threads")
          .innerJoin("thread_members", "thread_members.thread_id", "threads.id")
          .select(["threads.id", "threads.name", "threads.icon", "threads.always_on", "threads.attrs", "thread_members.hide_done"])
          .where("threads.id", "=", id)
          .where("threads.deleted_at", "is", null)
          .where("thread_members.account_id", "=", accountId)
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
          notes: await readableNotes(accountId, id),
          noteCounts: await noteCounts(accountId, id),
          preference: {
            ...readPreference(thread.attrs),
            ...(thread.hide_done ? { hideDone: true } : {}),
          },
          standing: null,
          calendars: await calendarCounts(accountId, id),
        });
      })
  );

  // ------------------------------------------------- a thread's calendars
  //
  // 019. The viewer's approved calendars against this thread, and a pick on
  // one of them. A pick is the member's own, reads for the whole thread, and
  // can be made or taken back only by them, in a thread they are in.
  const threadCalendar = z.object({
    id: z.string(),
    name: z.string(),
    colour: z.string().nullable(),
    writable: z.boolean(),
    sharedWithYou: z.boolean(),
    primary: z.boolean(),
    picked: z.boolean(),
    note: z.string().nullable(),
  });
  const threadCalendars = z.object({
    calendars: z.array(threadCalendar),
    others: z.array(z.object({ displayName: z.string(), count: z.number() })),
  });

  app.get(
    "/v1/threads/:id/calendars",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: threadCalendars, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        return reply.send(await viewerCalendars(accountId, request.params.id));
      })
  );

  // PATCH rather than PUT: the API's CORS allowlist has never needed PUT and
  // the calendar's own approve route is a PATCH.
  app.patch(
    "/v1/threads/:id/calendars/:calendarId",
    {
      schema: {
        params: z.object({ id: z.string().uuid(), calendarId: z.string().uuid() }),
        body: z.object({ picked: z.boolean() }),
        response: { 200: threadCalendars, 401: unauthenticated, 404: notFound },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const { id, calendarId } = request.params;
        await setPick(accountId, id, calendarId, request.body.picked);
        // Ids and a boolean. Nothing anybody named (OFF-1).
        await emit({
          name: "calendar_picked",
          properties: { thread_id: id, calendar_id: calendarId, picked: request.body.picked },
        }).catch(() => undefined);
        return reply.send(await viewerCalendars(accountId, id));
      })
  );

  // The events on the thread's calendars inside a window, for the rail. A
  // title and a time, whoever asks: never the guests, never the place.
  app.get(
    "/v1/threads/:id/events",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }),
        response: {
          200: z.object({
            events: z.array(
              z.object({
                id: z.string(),
                sourceRef: z.string(),
                calendarId: z.string(),
                calendarName: z.string(),
                colour: z.string().nullable(),
                title: z.string(),
                occursAt: z.string().nullable(),
                occursEndAt: z.string().nullable(),
                allDay: z.boolean(),
                untrusted: z.boolean(),
              })
            ),
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
        // The client asks in its own local days and this reads in UTC, so a
        // day of padding either side keeps a late evening on the last day and
        // an early morning on the first; the client places by local day. The
        // window is capped at the rail's own reach, which is the copy's.
        const DAY = 24 * 60 * 60 * 1000;
        const from = new Date(new Date(`${request.query.from}T00:00:00Z`).getTime() - DAY);
        const to = new Date(new Date(`${request.query.to}T23:59:59Z`).getTime() + DAY);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from || to.getTime() - from.getTime() > 400 * DAY) {
          return reply.send({ events: [] });
        }
        return reply.send({ events: await threadEvents(accountId, request.params.id, from, to) });
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
      "content.url as url",
            "content.image_url as image_url",
            "content.url as url",
            "content.image_url as image_url",
            "content.created_at as created_at",
            "content.archived_at as archived_at",
            "content.account_id as account_id",
            "content.done_at as done_at",
            "content.filing_at as filing_at",
            "content.due_at as due_at",
            "content.occurs_at as occurs_at",
            "content.occurs_end_at as occurs_end_at",
            "content.repeats as repeats",
            "content.repeats_until as repeats_until",
            "content.is_reminder as is_reminder",
            "content.priority as priority",
            "content.priority_pinned as priority_pinned",
            "content.tags as tags",
            "content.place_id as place_id",
            "content.attrs as attrs",
            "accounts.display_name as authorName",
      sql<boolean>`exists (
        select 1 from thread_members am
        where am.thread_id = content.thread_id
          and am.account_id = content.account_id
          and am.state = 'accepted'
      )`.as("authorIsMember"),
            sql<boolean>`exists (
              select 1 from thread_members am
              where am.thread_id = content.thread_id
                and am.account_id = content.account_id
                and am.state = 'accepted'
            )`.as("authorIsMember"),
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
            "content.url as url",
            "content.image_url as image_url",
            "content.created_at as created_at",
            "content.archived_at as archived_at",
            "content.account_id as account_id",
            "content.done_at as done_at",
            "content.filing_at as filing_at",
            "content.due_at as due_at",
            "content.occurs_at as occurs_at",
            "content.occurs_end_at as occurs_end_at",
            "content.repeats as repeats",
            "content.repeats_until as repeats_until",
            "content.is_reminder as is_reminder",
            "content.priority as priority",
            "content.priority_pinned as priority_pinned",
            "content.tags as tags",
            "content.place_id as place_id",
            "content.attrs as attrs",
            "content.derived_from_message_id as fromMessageId",
            "content.thread_id as threadId",
            "threads.name as threadName",
            "accounts.display_name as authorName",
      sql<boolean>`exists (
        select 1 from thread_members am
        where am.thread_id = content.thread_id
          and am.account_id = content.account_id
          and am.state = 'accepted'
      )`.as("authorIsMember"),
            sql<boolean>`exists (
              select 1 from thread_members am
              where am.thread_id = content.thread_id
                and am.account_id = content.account_id
                and am.state = 'accepted'
            )`.as("authorIsMember"),
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

  // Leave a thread, which deletes it when nobody else is in it. One endpoint,
  // because on a thread you are alone in they are the same act, and the screen
  // is honest about which one it is doing.
  app.delete(
    "/v1/threads/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ left: z.boolean(), deleted: z.boolean() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        return reply.send(await deleteThread(accountId, request.params.id));
      })
  );

  app.post(
    "/v1/threads/:id/restore",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ restored: z.boolean() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        return reply.send({ restored: await restoreThread(accountId, request.params.id) });
      })
  );

  // Typing straight into a section, without going through the composer.
  //
  // The + on a widget's heading. It is the same model doing the same reading,
  // grounded in this thread rather than in the whole account, and it leaves no
  // trace in the conversation: somebody adding a task to a list is not talking
  // to offload, and a chat log full of "brackets" would make the composer
  // useless as a record of anything.
  app.post(
    "/v1/threads/:id/quick-add",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({
          text: z.string().min(1).max(QUICK_ADD_CHARS),
          /** Which heading the + was on. A hint about what the row starts as,
           *  never a constraint on what offload decides it is. */
          section: z.string().max(32).optional(),
          /** The day open on the rail, when the + was that one's. A day, not a
           *  time: the rail asks which day, never which hour. */
          day: z.string().max(40).optional(),
        }),
        response: {
          200: z.object({ id: z.string(), kind: z.enum(["content", "note"]) }),
          401: unauthenticated,
          404: notFound,
          413: z.object({ error: z.literal("too_long"), maxChars: z.number() }),
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        const text = request.body.text.trim();
        if (text.length === 0) return reply.code(404).send({ error: "not_found" as const });

        return reply.send(
          await quickAdd(accountId, request.params.id, text, request.body.section ?? "", {
            day: request.body.day,
          })
        );
      })
  );

  // ---------------------------------------------------------------- notes
  //
  // A note is a sentence about a thread: what is true about it, and sometimes
  // how it should be handled. It sits on the thread rather than in content,
  // because 014 merged the two concepts that were doing this job. The
  // permission split is the one OFF-3 already sets and 005 already applied to
  // content: reading and editing are co-owned, deleting is the author's, and
  // mute is what everybody else gets instead.
  //
  // **The old `/memories` paths answer identically and are deleted one release
  // from now.** Phone builds go out through EAS and an installed app is pinned
  // to the names it shipped with, so renaming a route under it is the same
  // class of break as deleting its data.

  const notePaths = (suffix: string): [string, string] => [
    `/v1/notes${suffix}`,
    `/v1/memories${suffix}`,
  ];

  for (const path of ["/v1/threads/:id/notes", "/v1/threads/:id/memories"]) {
    app.post(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.strictObject({
            text: z.string().min(1).max(NOTE_TEXT_CHARS),
            body: z.string().max(NOTE_BODY_CHARS).nullish(),
          }),
          response: {
            200: z.object({ note: noteSchema }),
            401: unauthenticated,
            404: notFound,
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
            // **No 409 and no lock.** 008 refused the eleventh under a row lock
            // on the thread; a hundred is a prompt budget applied at assembly,
            // so there is nothing here to serialise and nothing to refuse.
            const note = await addNote({
              threadId: id,
              accountId,
              text: request.body.text,
              body: request.body.body ?? null,
              origin: "stated",
            });
            await touchThread(id, db);
            return reply.send({ note });
          } catch (error) {
            if (error instanceof NoteTooLong) {
              return reply
                .code(413)
                .send({ error: "too_long" as const, maxChars: error.maxChars });
            }
            throw error;
          }
        })
    );
  }

  // What the daily job folded. Read, not worked with: no restore and no edit,
  // and cursor-paginated because it is the one list here that has no ceiling.
  app.get(
    "/v1/threads/:id/notes/folded",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        // A timestamp, checked as one. Unvalidated it reaches `new Date` and
        // becomes an Invalid Date, which is a 500 rather than a refusal.
        querystring: z.object({ cursor: z.string().datetime().optional() }),
        response: {
          200: z.object({ notes: z.array(noteSchema), cursor: z.string().nullable() }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

        await requireMember(accountId, request.params.id);

        const before = request.query.cursor ? new Date(request.query.cursor) : null;
        // One more than the page, so "is there another page" is answered by the
        // read rather than by a count.
        const rows = await foldedNotes(accountId, request.params.id, before, FOLDED_PAGE + 1);
        const page = rows.slice(0, FOLDED_PAGE);
        const last = page[page.length - 1];
        return reply.send({
          notes: page,
          cursor:
            rows.length > FOLDED_PAGE && last?.supersededAt
              ? last.supersededAt.toISOString()
              : null,
        });
      })
  );

  // Edit. Any member, and the full text rather than anything a row shortened.
  // Returns `previous` so Undo has something to write back.
  for (const path of notePaths("/:id")) {
    app.patch(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.strictObject({
            text: z.string().min(1).max(NOTE_TEXT_CHARS),
            body: z.string().max(NOTE_BODY_CHARS).nullish(),
          }),
          response: {
            200: z.object({ note: noteSchema, previous: z.string() }),
            401: unauthenticated,
            404: notFound,
            // Only reachable for a note offload wrote: the unique index covers
            // nothing else. Refused rather than merged into the existing row,
            // which would destroy one note to satisfy an edit of another.
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
            const result = await db.transaction().execute((trx) =>
              editNote(
                {
                  noteId: request.params.id,
                  accountId,
                  text: request.body.text,
                  ...(request.body.body === undefined ? {} : { body: request.body.body }),
                },
                trx,
              ),
            );
            if (!result) return reply.code(409).send({ error: "duplicate" as const });
            return reply.send(result);
          } catch (error) {
            if (error instanceof NoteTooLong) {
              return reply
                .code(413)
                .send({ error: "too_long" as const, maxChars: error.maxChars });
            }
            throw error;
          }
        })
    );
  }

  // Delete. The author's alone, per OFF-3. A member who did not write it gets
  // the same refusal a non-member gets, so the response never teaches who did.
  for (const path of notePaths("/:id")) {
    app.delete(
      path,
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

          const deleted = await deleteNote(request.params.id, accountId);
          return reply.send({ deleted });
        })
    );
  }

  // Undo the delete. Nothing to re-check: 008 re-checked the cap here because
  // restore was the one door the cap did not watch, and there is no cap now.
  for (const path of notePaths("/:id/restore")) {
    app.post(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: z.object({ note: noteSchema }),
            401: unauthenticated,
            404: notFound,
          },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          const note = await db
            .transaction()
            .execute((trx) => restoreNote(request.params.id, accountId, trx));
          return reply.send({ note });
        })
    );
  }

  // Move a note within its section. Any member, reversible by writing the
  // previous number back, and the twin of `/v1/content/:id/priority`: the same
  // scale, so the same drag helper serves both lists. No `/memories` alias,
  // because no shipped build calls it.
  app.post(
    "/v1/notes/:id/priority",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.strictObject({ priority: z.number().int().min(0).max(100) }),
        response: {
          200: z.object({ note: noteSchema, previous: z.object({ priority: z.number() }) }),
          401: unauthenticated,
          404: notFound,
        },
      },
    },
    async (request, reply) =>
      guard(reply, async () => {
        const accountId = await currentAccountId(request);
        if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });
        const result = await reprioritiseNote(accountId, request.params.id, request.body.priority);
        return reply.send(result);
      })
  );

  // Mute and unmute. Any member, thread-wide, and reversible, which is why it
  // is on the OFF-6 allowlist rather than under an eight second toast.
  for (const path of notePaths("/:id/mute")) {
    app.post(
      path,
      {
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: z.strictObject({ muted: z.boolean() }),
          response: {
            200: z.object({ note: noteSchema }),
            401: unauthenticated,
            404: notFound,
          },
        },
      },
      async (request, reply) =>
        guard(reply, async () => {
          const accountId = await currentAccountId(request);
          if (!accountId) return reply.code(401).send({ error: "unauthenticated" as const });

          const note = await setMuted(request.params.id, accountId, request.body.muted);
          return reply.send({ note });
        })
    );
  }

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
          hideDone: z.boolean().nullish(),
        }),
        response: {
          200: z.object({
            preference: z.object({
              widgets: z.array(z.string()).optional(),
              groupBy: z.record(z.string(), z.string()).optional(),
              hideDone: z.boolean().optional(),
            }),
            previous: z.object({
              widgets: z.array(z.string()).optional(),
              groupBy: z.record(z.string(), z.string()).optional(),
              hideDone: z.boolean().optional(),
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
          ...(request.body.hideDone === undefined ? {} : { hideDone: request.body.hideDone }),
        });

        return reply.send({
          preference: await preferenceOf(accountId, request.params.id),
          previous,
        });
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
      "content.url as url",
            "content.image_url as image_url",
      "content.created_at as created_at",
      "content.archived_at as archived_at",
      "content.account_id as account_id",
      "content.done_at as done_at",
      "content.filing_at as filing_at",
      "content.due_at as due_at",
      "content.occurs_at as occurs_at",
            "content.occurs_end_at as occurs_end_at",
            "content.repeats as repeats",
            "content.repeats_until as repeats_until",
      "content.is_reminder as is_reminder",
      "content.priority as priority",
      "content.priority_pinned as priority_pinned",
      "content.tags as tags",
      "content.place_id as place_id",
            "content.attrs as attrs",
      "accounts.display_name as authorName",
      sql<boolean>`exists (
        select 1 from thread_members am
        where am.thread_id = content.thread_id
          and am.account_id = content.account_id
          and am.state = 'accepted'
      )`.as("authorIsMember"),
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
