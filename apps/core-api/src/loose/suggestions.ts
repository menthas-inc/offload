// 028. What a person does with a suggestion: accept it, take it back, dismiss
// it, or turn offload's proposal into a thread.
//
// Every write re-reads the suggestion for the caller's own account and checks
// that it is still drawable, then moves through `moveContentIn` and
// `moveNoteIn`, the functions every other move goes through, so authorship
// and destination membership are checked per row whatever the suggestion
// row says (SEC-2, OFF-3). Nothing here destroys anything of the person's:
// moves are moves, and Create's Undo empties the thread before it goes.

import { sql, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { NotYours, type Executor } from "../threads/access.js";
import { moveNoteIn } from "../threads/notes.js";
import { withNoteLabels } from "../threads/labels.js";
import { moveContentIn } from "../routes/threads.js";
import { defaultThreadOf, loosePage, proposalCounts, type LooseItem } from "./read.js";

type Trx = Transaction<Database>;

/** How long after accepting the Undo still works: the toast's eight seconds
 *  and the tap at the end of it reaching the server, as a thread's restore. */
export const UNDO_WINDOW = "15 seconds";

export const NAME_CHARS = 60;

export type LooseRefusal = "bad_name" | "empty" | "too_late" | "changed";

export class LooseRefused extends Error {
  constructor(readonly code: LooseRefusal) {
    super(code);
  }
}

/** One line of 1 to 60 characters once trimmed, no control characters. The
 *  database holds a proposal to the same; a thread's name is checked here. */
export function threadName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > NAME_CHARS || /[\u0000-\u001f\u007f]/.test(name)) throw new LooseRefused("bad_name");
  return name;
}

/** Is this thing in the default thread and live? The predicate the read
 *  draws by, asked of one row. */
async function isLoose(trx: Executor, looseThreadId: string, target: { contentId: string | null; noteId: string | null }): Promise<boolean> {
  if (target.contentId) {
    const row = await trx
      .selectFrom("content")
      .select("id")
      .where("id", "=", target.contentId)
      .where("thread_id", "=", looseThreadId)
      .where("deleted_at", "is", null)
      .where("archived_at", "is", null)
      .where((eb) => eb.or([eb("type", "!=", "task"), eb("done_at", "is", null)]))
      .executeTakeFirst();
    return row !== undefined;
  }
  const note = await trx
    .selectFrom("notes")
    .select("id")
    .where("id", "=", target.noteId!)
    .where("subject_id", "=", looseThreadId)
    .where("scope", "=", "thread")
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .executeTakeFirst();
  return note !== undefined;
}

async function moveTarget(trx: Trx, accountId: string, target: { contentId: string | null; noteId: string | null }, destination: string) {
  if (target.contentId) return moveContentIn(trx, accountId, target.contentId, destination);
  return (await moveNoteIn(trx, accountId, target.noteId!, destination)).previous;
}

/** A proposal below two loose, unaccepted things is drawn on none of them, so
 *  it goes, and its suggestions with it. Called after anything that can take
 *  one of its things away. A spent proposal is left alone: Create and its
 *  Undo move its things while it is spent, and Undo needs it whole. */
export async function holdFloor(trx: Executor, target: { contentId?: string | null; noteId?: string | null }): Promise<void> {
  const suggestion = await trx
    .selectFrom("suggestions")
    .innerJoin("thread_proposals", "thread_proposals.id", "suggestions.proposal_id")
    .select(["thread_proposals.id as proposalId", "thread_proposals.account_id as accountId", "thread_proposals.spent_at as spentAt"])
    .where((eb) =>
      target.contentId ? eb("suggestions.content_id", "=", target.contentId) : eb("suggestions.note_id", "=", target.noteId!)
    )
    .executeTakeFirst();
  if (suggestion) await holdFloorOf(trx, suggestion.proposalId, suggestion.accountId);
}

/** 028. offload's Move to, written at filing time.
 *
 *  Only when the thing landed in the default thread, the suggested thread is
 *  another live thread the person is in, and the turn read nothing untrusted:
 *  a forwarded email, a calendar, or a web page (the worker strips the
 *  argument after a web read). Otherwise ignored rather than refused, so a
 *  filing never fails over a suggestion. A thing already dismissed, or already
 *  carrying one, keeps what it has. */
export async function suggestAtFiling(
  trx: Executor,
  input: {
    accountId: string;
    target: { contentId?: string; noteId?: string };
    landedIn: string;
    suggested: string | null | undefined;
    untrusted: boolean;
  },
): Promise<void> {
  if (!input.suggested || input.untrusted) return;
  const looseThreadId = await defaultThreadOf(input.accountId, trx);
  if (!looseThreadId || input.landedIn !== looseThreadId || input.suggested === looseThreadId) return;
  const member = await trx
    .selectFrom("thread_members")
    .innerJoin("threads", "threads.id", "thread_members.thread_id")
    .select("thread_members.id")
    .where("thread_members.thread_id", "=", input.suggested)
    .where("thread_members.account_id", "=", input.accountId)
    .where("thread_members.state", "=", "accepted")
    .where("threads.deleted_at", "is", null)
    .executeTakeFirst();
  if (!member) return;
  const dismissed = input.target.contentId
    ? await trx.selectFrom("content").select("suggest_dismissed_at as at").where("id", "=", input.target.contentId).executeTakeFirst()
    : await trx.selectFrom("notes").select("suggest_dismissed_at as at").where("id", "=", input.target.noteId!).executeTakeFirst();
  if (!dismissed || dismissed.at !== null) return;
  await trx
    .insertInto("suggestions")
    .values({
      account_id: input.accountId,
      content_id: input.target.contentId ?? null,
      note_id: input.target.noteId ?? null,
      kind: "move",
      thread_id: input.suggested,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

/** The caller's own suggestion, still drawable, or the one refusal. */
async function drawable(trx: Trx, accountId: string, suggestionId: string) {
  const looseThreadId = await defaultThreadOf(accountId, trx);
  if (!looseThreadId) throw new NotYours();
  const row = await trx
    .selectFrom("suggestions")
    .selectAll()
    .where("id", "=", suggestionId)
    .where("account_id", "=", accountId)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new NotYours();
  return { row, looseThreadId };
}

export async function acceptSuggestion(accountId: string, suggestionId: string): Promise<{ thread: { id: string; name: string } }> {
  return db.transaction().execute(async (trx) => {
    const { row, looseThreadId } = await drawable(trx, accountId, suggestionId);
    if (row.kind !== "move" || !row.thread_id || row.accepted_at !== null || row.thread_id === looseThreadId) throw new NotYours();
    if (!(await isLoose(trx, looseThreadId, { contentId: row.content_id, noteId: row.note_id }))) throw new NotYours();
    await moveTarget(trx, accountId, { contentId: row.content_id, noteId: row.note_id }, row.thread_id);
    await trx.updateTable("suggestions").set({ accepted_at: sql`now()` }).where("id", "=", row.id).execute();
    const thread = await trx.selectFrom("threads").select(["id", "name"]).where("id", "=", row.thread_id).executeTakeFirstOrThrow();
    return { thread };
  });
}

/** Undo a Move to: the thing goes back to the default thread and draws its
 *  suggestion again. */
export async function undoSuggestion(accountId: string, suggestionId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const { row, looseThreadId } = await drawable(trx, accountId, suggestionId);
    if (row.kind !== "move" || row.accepted_at === null) throw new NotYours();
    const fresh = await trx
      .selectFrom("suggestions")
      .select("id")
      .where("id", "=", row.id)
      .where("accepted_at", ">", sql<Date>`now() - interval '${sql.raw(UNDO_WINDOW)}'`)
      .executeTakeFirst();
    if (!fresh) throw new LooseRefused("too_late");
    await moveTarget(trx, accountId, { contentId: row.content_id, noteId: row.note_id }, looseThreadId);
    await trx.updateTable("suggestions").set({ accepted_at: null }).where("id", "=", row.id).execute();
  });
}

/** Dismiss for good: the thing is marked, with no words, and the suggestion
 *  goes. Authorship is the thing's, as for every other write on it. */
export async function dismissSuggestion(accountId: string, suggestionId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const { row } = await drawable(trx, accountId, suggestionId);
    if (row.content_id) {
      await trx.updateTable("content").set({ suggest_dismissed_at: sql`now()` }).where("id", "=", row.content_id).execute();
    } else {
      await trx.updateTable("notes").set({ suggest_dismissed_at: sql`now()` }).where("id", "=", row.note_id!).execute();
    }
    await trx.deleteFrom("suggestions").where("id", "=", row.id).execute();
    if (row.proposal_id) await holdFloorOf(trx, row.proposal_id, row.account_id);
  });
}

/** The floor itself, for a proposal already in hand. */
async function holdFloorOf(trx: Executor, proposalId: string, accountId: string): Promise<void> {
  const proposal = await trx.selectFrom("thread_proposals").select("spent_at").where("id", "=", proposalId).executeTakeFirst();
  if (!proposal || proposal.spent_at !== null) return;
  const looseThreadId = await defaultThreadOf(accountId, trx);
  const count = looseThreadId ? ((await proposalCounts(looseThreadId, [proposalId], trx)).get(proposalId) ?? 0) : 0;
  if (count < 2) await trx.deleteFrom("thread_proposals").where("id", "=", proposalId).execute();
}

/** What the create sheet lists: every still-loose, unaccepted thing of the
 *  caller's unspent proposal. */
export async function readProposal(accountId: string, proposalId: string): Promise<{ id: string; name: string; items: LooseItem[] }> {
  const proposal = await db
    .selectFrom("thread_proposals")
    .select(["id", "name"])
    .where("id", "=", proposalId)
    .where("account_id", "=", accountId)
    .where("spent_at", "is", null)
    .executeTakeFirst();
  if (!proposal) throw new NotYours();
  const targets = await db
    .selectFrom("suggestions")
    .select(["content_id", "note_id"])
    .where("proposal_id", "=", proposalId)
    .where("accepted_at", "is", null)
    .execute();
  // Ten at most, read by id through the list's own read, so only what is
  // still loose comes back, however far down the list it has sunk.
  const { rows } = await loosePage(accountId, {
    limit: targets.length,
    only: {
      contentIds: targets.flatMap((t) => (t.content_id ? [t.content_id] : [])),
      noteIds: targets.flatMap((t) => (t.note_id ? [t.note_id] : [])),
    },
  });
  const items = rows.map((item) => ({ ...item, suggestion: null }));
  if (items.length < 1) throw new NotYours();
  return { ...proposal, items };
}

/** Make the thread, move the ticked things into it, spend the proposal. One
 *  transaction: an id that is not this proposal's, not loose or not the
 *  caller's refuses the whole call and nothing moves. */
export async function createFromProposal(
  accountId: string,
  proposalId: string,
  input: { name: string; contentIds: string[]; noteIds: string[] },
): Promise<{ thread: { id: string; name: string } }> {
  const name = threadName(input.name);
  if (input.contentIds.length + input.noteIds.length === 0) throw new LooseRefused("empty");
  return db.transaction().execute(async (trx) => {
    const proposal = await trx
      .selectFrom("thread_proposals")
      .select(["id"])
      .where("id", "=", proposalId)
      .where("account_id", "=", accountId)
      .where("spent_at", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!proposal) throw new NotYours();
    const looseThreadId = await defaultThreadOf(accountId, trx);
    if (!looseThreadId) throw new NotYours();

    // Locked, as a dismiss locks the one it takes: a thing dismissed while
    // this runs is either gone from here or waits until this is done.
    const suggestions = await trx
      .selectFrom("suggestions")
      .select(["id", "content_id", "note_id"])
      .where("proposal_id", "=", proposalId)
      .where("accepted_at", "is", null)
      .forUpdate()
      .execute();
    const byContent = new Map(suggestions.flatMap((s) => (s.content_id ? [[s.content_id, s.id] as const] : [])));
    const byNote = new Map(suggestions.flatMap((s) => (s.note_id ? [[s.note_id, s.id] as const] : [])));
    const ticked: { contentId: string | null; noteId: string | null; suggestionId: string }[] = [
      ...[...new Set(input.contentIds)].map((id) => ({ contentId: id, noteId: null, suggestionId: byContent.get(id) })),
      ...[...new Set(input.noteIds)].map((id) => ({ contentId: null, noteId: id, suggestionId: byNote.get(id) })),
    ].map((t) => {
      if (!t.suggestionId) throw new NotYours();
      return t as { contentId: string | null; noteId: string | null; suggestionId: string };
    });
    for (const t of ticked) if (!(await isLoose(trx, looseThreadId, t))) throw new NotYours();

    // Spent first, so the floor check every move makes leaves this proposal
    // alone while its things leave the default thread.
    const thread = await trx
      .insertInto("threads")
      .values({ created_by_account_id: accountId, name, always_on: false, last_activity_at: sql`now()`, updated_at: sql`now()` })
      .returning(["id", "name"])
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("thread_members")
      .values({ thread_id: thread.id, account_id: accountId, invited_by: null, state: "accepted", responded_at: sql`now()` })
      .execute();
    // The proposal keeps the name the person chose, so an Undo brings back
    // their words and can tell a later rename from the original.
    await trx
      .updateTable("thread_proposals")
      .set({ name: thread.name, spent_at: sql`now()`, spent_thread_id: thread.id })
      .where("id", "=", proposalId)
      .execute();

    for (const t of ticked) await moveTarget(trx, accountId, t, thread.id);
    const tickedIds = ticked.map((t) => t.suggestionId);
    await trx.updateTable("suggestions").set({ accepted_at: sql`now()` }).where("id", "in", tickedIds).execute();
    // An unticked thing stays loose and loses this suggestion.
    await trx.deleteFrom("suggestions").where("proposal_id", "=", proposalId).where("id", "not in", tickedIds).execute();
    return { thread };
  });
}

/** Undo Create, in one write: every moved thing back first, then the
 *  suggestions and the proposal restored, then the thread, now empty, deleted
 *  the ordinary way. Refused once anything else happened in it: the thread is
 *  the person's then, and nothing in it may be destroyed while a toast is up. */
export async function undoProposal(accountId: string, proposalId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const proposal = await trx
      .selectFrom("thread_proposals")
      .select(["id", "name", "spent_at", "spent_thread_id"])
      .where("id", "=", proposalId)
      .where("account_id", "=", accountId)
      .forUpdate()
      .executeTakeFirst();
    if (!proposal || proposal.spent_at === null || !proposal.spent_thread_id) throw new NotYours();
    const fresh = await trx
      .selectFrom("thread_proposals")
      .select("id")
      .where("id", "=", proposalId)
      .where("spent_at", ">", sql<Date>`now() - interval '${sql.raw(UNDO_WINDOW)}'`)
      .executeTakeFirst();
    if (!fresh) throw new LooseRefused("too_late");
    const looseThreadId = await defaultThreadOf(accountId, trx);
    if (!looseThreadId) throw new NotYours();
    const threadId = proposal.spent_thread_id;

    const moved = await trx
      .selectFrom("suggestions")
      .select(["id", "content_id", "note_id"])
      .where("proposal_id", "=", proposalId)
      .where("accepted_at", "is not", null)
      .execute();
    const movedContent = new Set(moved.flatMap((m) => (m.content_id ? [m.content_id] : [])));
    const movedNotes = new Set(moved.flatMap((m) => (m.note_id ? [m.note_id] : [])));

    const thread = await trx.selectFrom("threads").select(["name", "deleted_at"]).where("id", "=", threadId).forUpdate().executeTakeFirst();
    if (!thread || thread.deleted_at !== null) throw new LooseRefused("changed");
    const members = await trx
      .selectFrom("thread_members")
      .select(["account_id", "state"])
      .where("thread_id", "=", threadId)
      .where("state", "in", ["accepted", "pending"])
      .execute();
    const content = await trx.selectFrom("content").select(["id", "deleted_at"]).where("thread_id", "=", threadId).execute();
    const notes = await trx.selectFrom("notes").select(["id", "deleted_at"]).where("subject_id", "=", threadId).where("scope", "=", "thread").execute();
    // The proposal took the name the thread was made with, so a rename shows
    // as a difference here.
    const unchanged =
      thread.name === proposal.name &&
      members.length === 1 &&
      members[0]!.account_id === accountId &&
      members[0]!.state === "accepted" &&
      content.length === movedContent.size &&
      notes.length === movedNotes.size &&
      content.every((c) => movedContent.has(c.id) && c.deleted_at === null) &&
      notes.every((n) => movedNotes.has(n.id) && n.deleted_at === null);
    if (!unchanged) throw new LooseRefused("changed");

    for (const m of moved) await moveTarget(trx, accountId, { contentId: m.content_id, noteId: m.note_id }, looseThreadId);
    await trx.updateTable("suggestions").set({ accepted_at: null }).where("proposal_id", "=", proposalId).execute();
    await trx.updateTable("thread_proposals").set({ spent_at: null, spent_thread_id: null }).where("id", "=", proposalId).execute();

    // The thread holds nothing now. Leaving it as its only member is how a
    // thread is deleted (OFF-3), with the purge job doing the destroying.
    await trx
      .updateTable("thread_members")
      .set({ state: "left", left_at: sql`now()`, responded_at: sql`now()` })
      .where("thread_id", "=", threadId)
      .where("account_id", "=", accountId)
      .execute();
    await trx
      .updateTable("threads")
      .set({ deleted_at: sql`now()`, purge_after: sql`now() + interval '8 seconds'`, updated_at: sql`now()` })
      .where("id", "=", threadId)
      .execute();
  });
}
