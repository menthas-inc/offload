// 028. What is not in a thread, read.
//
// Storage does not move: what has no home is in the account's default thread.
// What changes is that it is drawn as things, sorted by what they are, newest
// first, each with at most one suggestion. Everything here resolves the
// default thread from the caller's own account row and never takes a thread
// id from a client, so the only rows it can reach are the caller's own.

import { DEFAULT_THREAD_ICON } from "@offload/widgets";
import { sql } from "kysely";
import { db } from "../db.js";
import { initialsOf } from "../accounts/initials.js";
import type { Executor } from "../threads/access.js";
import { notesNewestFirst, type Note } from "../threads/notes.js";
import { withNoteLabels } from "../threads/labels.js";
import { toRow, withPhotos, type RawRow } from "../routes/threads.js";

/** The chips, in the order they are drawn. The server owns the mapping so the
 *  three clients cannot each merge images and screenshots their own way. */
export const CHIP_KEYS = ["todo", "link", "photo", "note", "event", "place", "voice", "file"] as const;
export type ChipKey = (typeof CHIP_KEYS)[number];

type ContentType = "link" | "image" | "screenshot" | "voice" | "file" | "task" | "event" | "location";

const TYPES_OF: Record<Exclude<ChipKey, "note">, ContentType[]> = {
  todo: ["task"],
  link: ["link"],
  photo: ["image", "screenshot"],
  event: ["event"],
  place: ["location"],
  voice: ["voice"],
  file: ["file"],
};

export function chipOf(type: string): ChipKey | null {
  for (const [key, types] of Object.entries(TYPES_OF)) if ((types as string[]).includes(type)) return key as ChipKey;
  return null;
}

/** One screenful, the same as a thread's. */
export const LOOSE_PAGE = 30;
/** What My threads draws before *All N*. */
export const LOOSE_SHOWN = 3;
/** Faces drawn on a shared Move to before the count. */
const FACES = 2;

export type LooseRow = Awaited<ReturnType<typeof withPhotos<ReturnType<typeof toRow>>>>[number];
export type LooseNote = Note & { labels: string[] };

export type Suggestion =
  | {
      id: string;
      kind: "move";
      thread: { id: string; name: string; icon: string; hue: number };
      faces: { accountId: string; initials: string; displayName: string }[];
      more: number;
    }
  | { id: string; kind: "create"; proposal: { id: string; name: string; count: number } };

export type LooseEntry =
  | { kind: "content"; row: LooseRow; suggestion: Suggestion | null }
  | { kind: "note"; note: LooseNote; suggestion: Suggestion | null };

export async function defaultThreadOf(accountId: string, executor: Executor = db): Promise<string | null> {
  const row = await executor.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  return row?.default_thread_id ?? null;
}

/** Live: not deleted, not archived, and a to-do not ticked off. The one
 *  predicate the count, the chips and the list share. */
function liveContent(executor: Executor, threadId: string) {
  return executor
    .selectFrom("content")
    .where("content.thread_id", "=", threadId)
    .where("content.deleted_at", "is", null)
    .where("content.archived_at", "is", null)
    .where((eb) => eb.or([eb("content.type", "!=", "task"), eb("content.done_at", "is", null)]));
}

function currentNotes(executor: Executor, threadId: string) {
  return executor
    .selectFrom("notes")
    .where("notes.subject_id", "=", threadId)
    .where("notes.scope", "=", "thread")
    .where("notes.deleted_at", "is", null)
    .where("notes.superseded_at", "is", null);
}

/** Counts by chip, both tables, two grouped queries at most. */
export async function looseCounts(threadId: string, executor: Executor = db): Promise<{ count: number; byType: Partial<Record<ChipKey, number>> }> {
  const [byContent, notes] = await Promise.all([
    liveContent(executor, threadId)
      .select(["content.type as type", (eb) => eb.fn.countAll<string>().as("n")])
      .groupBy("content.type")
      .execute(),
    currentNotes(executor, threadId).select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow(),
  ]);
  const byType: Partial<Record<ChipKey, number>> = {};
  let count = 0;
  for (const row of byContent) {
    const key = chipOf(row.type);
    if (!key) continue;
    const n = Number(row.n);
    byType[key] = (byType[key] ?? 0) + n;
    count += n;
  }
  const n = Number(notes.n);
  if (n > 0) byType.note = n;
  count += n;
  // In the chips' order, so a client iterating keys draws them right.
  const ordered: Partial<Record<ChipKey, number>> = {};
  for (const key of CHIP_KEYS) if (byType[key]) ordered[key] = byType[key];
  return { count, byType: ordered };
}

async function contentNewestFirst(
  accountId: string,
  threadId: string,
  opts: { before?: string | undefined; limit: number; types?: ContentType[] | undefined; archived?: boolean; ids?: string[] | undefined },
): Promise<LooseRow[]> {
  if (opts.ids && opts.ids.length === 0) return [];
  let query = (opts.archived
    ? db.selectFrom("content").where("content.thread_id", "=", threadId).where("content.deleted_at", "is", null).where("content.archived_at", "is not", null)
    : liveContent(db, threadId))
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
      "content.rrule as rrule",
      "content.source_ref as source_ref",
      "content.is_reminder as is_reminder",
      "content.priority as priority",
      "content.priority_pinned as priority_pinned",
      "content.place_id as place_id",
      "content.attrs as attrs",
      "accounts.display_name as authorName",
      sql<boolean>`exists (
        select 1 from thread_members am
        where am.thread_id = content.thread_id
          and am.account_id = content.account_id
          and am.state = 'accepted'
      )`.as("authorIsMember"),
      "content.location as location",
      "places.lat as placeLat",
      "places.lng as placeLng",
      "places.approximate as placeApproximate",
    ])
    .orderBy("content.id", "desc")
    .limit(opts.limit);
  if (opts.before) query = query.where("content.id", "<", opts.before);
  if (opts.types) query = query.where("content.type", "in", opts.types);
  if (opts.ids) query = query.where("content.id", "in", opts.ids);
  const rows = (await query.execute()) as RawRow[];
  return withPhotos(rows.map((row) => toRow(row, accountId)));
}

/** Drawable suggestions for these targets, keyed by target id. A suggestion
 *  is drawn only while its thing is loose, it has not been accepted, and, for
 *  a move, the caller is still in a live thread that is not this one; for a
 *  create, while its proposal is unspent and still has two loose things. */
export async function suggestionsFor(
  accountId: string,
  looseThreadId: string,
  targets: { contentIds: string[]; noteIds: string[] },
): Promise<Map<string, Suggestion>> {
  const out = new Map<string, Suggestion>();
  if (targets.contentIds.length === 0 && targets.noteIds.length === 0) return out;
  const rows = await db
    .selectFrom("suggestions")
    .leftJoin("threads", "threads.id", "suggestions.thread_id")
    .leftJoin("thread_proposals", "thread_proposals.id", "suggestions.proposal_id")
    .select([
      "suggestions.id as id",
      "suggestions.kind as kind",
      "suggestions.content_id as contentId",
      "suggestions.note_id as noteId",
      "suggestions.thread_id as threadId",
      "threads.name as threadName",
      "threads.icon as threadIcon",
      "threads.hue as threadHue",
      "suggestions.proposal_id as proposalId",
      "thread_proposals.name as proposalName",
    ])
    .where("suggestions.account_id", "=", accountId)
    .where("suggestions.accepted_at", "is", null)
    .where((eb) =>
      eb.or([
        ...(targets.contentIds.length ? [eb("suggestions.content_id", "in", targets.contentIds)] : []),
        ...(targets.noteIds.length ? [eb("suggestions.note_id", "in", targets.noteIds)] : []),
      ])
    )
    .where((eb) =>
      eb.or([
        eb.and([
          eb("suggestions.kind", "=", "move"),
          eb("threads.deleted_at", "is", null),
          eb("suggestions.thread_id", "!=", looseThreadId),
          eb.exists(
            eb
              .selectFrom("thread_members")
              .select("thread_members.id")
              .whereRef("thread_members.thread_id", "=", "suggestions.thread_id")
              .where("thread_members.account_id", "=", accountId)
              .where("thread_members.state", "=", "accepted")
          ),
        ]),
        eb.and([eb("suggestions.kind", "=", "create"), eb("thread_proposals.spent_at", "is", null)]),
      ])
    )
    .execute();

  const proposals = [...new Set(rows.flatMap((row) => (row.proposalId ? [row.proposalId] : [])))];
  const counts = await proposalCounts(looseThreadId, proposals);
  const shared = [...new Set(rows.flatMap((row) => (row.threadId ? [row.threadId] : [])))];
  const faces = await facesOf(accountId, shared);

  for (const row of rows) {
    const target = (row.contentId ?? row.noteId)!;
    if (row.kind === "move" && row.threadId) {
      const people = faces.get(row.threadId) ?? [];
      out.set(target, {
        id: row.id,
        kind: "move",
        thread: { id: row.threadId, name: row.threadName ?? "", icon: row.threadIcon ?? DEFAULT_THREAD_ICON, hue: row.threadHue ?? 1 },
        faces: people.slice(0, FACES),
        more: Math.max(0, people.length - FACES),
      });
    } else if (row.kind === "create" && row.proposalId) {
      const count = counts.get(row.proposalId) ?? 0;
      if (count < 2) continue;
      out.set(target, { id: row.id, kind: "create", proposal: { id: row.proposalId, name: row.proposalName ?? "", count } });
    }
  }
  return out;
}

/** How many of each proposal's things are still loose and unaccepted. Below
 *  two, a proposal is drawn on none of them. */
export async function proposalCounts(looseThreadId: string, proposalIds: string[], executor: Executor = db): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (proposalIds.length === 0) return out;
  const rows = await executor
    .selectFrom("suggestions")
    .leftJoin("content", "content.id", "suggestions.content_id")
    .leftJoin("notes", "notes.id", "suggestions.note_id")
    .select(["suggestions.proposal_id as proposalId", (eb) => eb.fn.countAll<string>().as("n")])
    .where("suggestions.proposal_id", "in", proposalIds)
    .where("suggestions.accepted_at", "is", null)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("content.thread_id", "=", looseThreadId),
          eb("content.deleted_at", "is", null),
          eb("content.archived_at", "is", null),
          eb.or([eb("content.type", "!=", "task"), eb("content.done_at", "is", null)]),
        ]),
        eb.and([
          eb("notes.subject_id", "=", looseThreadId),
          eb("notes.scope", "=", "thread"),
          eb("notes.deleted_at", "is", null),
          eb("notes.superseded_at", "is", null),
        ]),
      ])
    )
    .groupBy("suggestions.proposal_id")
    .execute();
  for (const row of rows) if (row.proposalId) out.set(row.proposalId, Number(row.n));
  return out;
}

/** The other accepted members of each thread, oldest membership first. */
async function facesOf(viewerId: string, threadIds: string[]) {
  const out = new Map<string, { accountId: string; initials: string; displayName: string }[]>();
  if (threadIds.length === 0) return out;
  const rows = await db
    .selectFrom("thread_members")
    .innerJoin("accounts", "accounts.id", "thread_members.account_id")
    .select(["thread_members.thread_id as threadId", "accounts.id as accountId", "accounts.display_name as displayName"])
    .where("thread_members.thread_id", "in", threadIds)
    .where("thread_members.state", "=", "accepted")
    .where("thread_members.account_id", "!=", viewerId)
    .where("accounts.deleted_at", "is", null)
    .orderBy("thread_members.created_at")
    .execute();
  for (const row of rows) {
    const name = row.displayName ?? "Someone";
    const list = out.get(row.threadId) ?? [];
    list.push({ accountId: row.accountId, initials: initialsOf(name), displayName: name });
    out.set(row.threadId, list);
  }
  return out;
}

/** One page of loose things, rows and notes merged by id, newest first. */
export async function loosePage(
  accountId: string,
  opts: {
    type?: ChipKey | undefined;
    cursor?: string | undefined;
    limit?: number;
    /** Only these things, as the create sheet reads a proposal's. */
    only?: { contentIds: string[]; noteIds: string[] } | undefined;
  },
): Promise<{ rows: LooseEntry[]; nextCursor: string | null }> {
  const threadId = await defaultThreadOf(accountId);
  if (!threadId) return { rows: [], nextCursor: null };
  const limit = opts.limit ?? LOOSE_PAGE;
  const wantNotes = !opts.type || opts.type === "note";
  const wantContent = !opts.type || opts.type !== "note";
  const [content, notes] = await Promise.all([
    wantContent
      ? contentNewestFirst(accountId, threadId, {
          before: opts.cursor,
          limit: limit + 1,
          types: opts.type && opts.type !== "note" ? TYPES_OF[opts.type] : undefined,
          ids: opts.only?.contentIds,
        })
      : Promise.resolve([]),
    wantNotes
      ? notesNewestFirst(accountId, threadId, { before: opts.cursor, limit: limit + 1, ids: opts.only?.noteIds }).then((page) =>
          withNoteLabels(page)
        )
      : Promise.resolve([] as LooseNote[]),
  ]);

  // Both are UUIDv7 in lower-case hex, so string order is creation order.
  const merged: ({ id: string } & ({ kind: "content"; row: LooseRow } | { kind: "note"; note: LooseNote }))[] = [
    ...content.map((row) => ({ id: row.id, kind: "content" as const, row })),
    ...notes.map((note) => ({ id: note.id, kind: "note" as const, note })),
  ].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const page = merged.slice(0, limit);
  const more = merged.length > limit;

  const suggestions = await suggestionsFor(accountId, threadId, {
    contentIds: page.flatMap((entry) => (entry.kind === "content" ? [entry.id] : [])),
    noteIds: page.flatMap((entry) => (entry.kind === "note" ? [entry.id] : [])),
  });
  return {
    rows: page.map((entry) =>
      entry.kind === "content"
        ? { kind: "content", row: entry.row, suggestion: suggestions.get(entry.id) ?? null }
        : { kind: "note", note: entry.note, suggestion: suggestions.get(entry.id) ?? null }
    ),
    nextCursor: more ? page.at(-1)!.id : null,
  };
}

/** The default thread's archived rows, the thread page's own way. */
export async function looseArchived(accountId: string, cursor?: string): Promise<{ rows: LooseRow[]; nextCursor: string | null }> {
  const threadId = await defaultThreadOf(accountId);
  if (!threadId) return { rows: [], nextCursor: null };
  const rows = await contentNewestFirst(accountId, threadId, { before: cursor, limit: LOOSE_PAGE + 1, archived: true });
  const page = rows.slice(0, LOOSE_PAGE);
  return { rows: page, nextCursor: rows.length > LOOSE_PAGE ? page.at(-1)!.id : null };
}

export async function archivedCount(threadId: string): Promise<number> {
  const row = await db
    .selectFrom("content")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("thread_id", "=", threadId)
    .where("deleted_at", "is", null)
    .where("archived_at", "is not", null)
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

/** What My threads draws: the count, the chips and the newest three. Null
 *  when nothing is loose, which is when the group is not drawn. */
export async function looseSummary(accountId: string): Promise<{ count: number; byType: Partial<Record<ChipKey, number>>; rows: LooseEntry[] } | null> {
  const threadId = await defaultThreadOf(accountId);
  if (!threadId) return null;
  const { count, byType } = await looseCounts(threadId);
  if (count === 0) return null;
  const { rows } = await loosePage(accountId, { limit: LOOSE_SHOWN });
  return { count, byType, rows };
}
