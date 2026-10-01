// 028. The daily pass: offload proposes a new thread for two to ten loose
// things that belong together.
//
// The worker reads the candidates and asks a model; everything that decides
// what is written is here. The account comes from the job row, every id the
// model echoes is held to the set it was sent and to what is still a
// candidate now, a group below two or above ten is dropped, a name is one
// plain line of 1 to 60, and at most three proposals are written a day.
// Counts are logged, never a word (OFF-1).

import { createHash } from "node:crypto";
import { sql } from "kysely";
import { db } from "../db.js";
import type { Executor } from "../threads/access.js";
import { defaultThreadOf } from "./read.js";
import { LooseRefused, UNDO_WINDOW, threadName } from "./suggestions.js";

/** How many things the pass reads, newest first. The prompt is this many short
 *  lines whatever the account's age (OFF-8); `loose_propose.py` holds the same
 *  number. */
export const PROPOSAL_CANDIDATES = 50;
/** Things in one proposal. */
export const PROPOSAL_MIN = 2;
export const PROPOSAL_MAX = 10;
/** Proposals written in one pass. */
export const PROPOSALS_PER_PASS = 3;

/** The switch, read when the daily run books, so it can be turned off on the
 *  platform without a deploy. On unless set to `off`. */
export function proposalsOn(): boolean {
  return process.env["LOOSE_PROPOSALS"] !== "off";
}

export interface Candidate {
  id: string;
  kind: "content" | "note";
}

/** Live loose rows and current loose notes that carry no suggestion and were
 *  never dismissed, and no note marked untrusted. Unbounded here: the bound
 *  is the caller's. */
function candidateContent(executor: Executor, threadId: string) {
  return executor
    .selectFrom("content")
    .select([sql<string>`content.id::text`.as("id"), sql<"content">`'content'`.as("kind")])
    .where("content.thread_id", "=", threadId)
    .where("content.deleted_at", "is", null)
    .where("content.archived_at", "is", null)
    .where((eb) => eb.or([eb("content.type", "!=", "task"), eb("content.done_at", "is", null)]))
    .where("content.suggest_dismissed_at", "is", null)
    .where((eb) => eb.not(eb.exists(eb.selectFrom("suggestions").select("suggestions.id").whereRef("suggestions.content_id", "=", "content.id"))));
}

function candidateNotes(executor: Executor, threadId: string) {
  return executor
    .selectFrom("notes")
    .select([sql<string>`notes.id::text`.as("id"), sql<"note">`'note'`.as("kind")])
    .where("notes.subject_id", "=", threadId)
    .where("notes.scope", "=", "thread")
    .where("notes.deleted_at", "is", null)
    .where("notes.superseded_at", "is", null)
    .where("notes.derived_from_untrusted", "=", false)
    .where("notes.suggest_dismissed_at", "is", null)
    .where((eb) => eb.not(eb.exists(eb.selectFrom("suggestions").select("suggestions.id").whereRef("suggestions.note_id", "=", "notes.id"))));
}

/** The newest candidates, the set the pass reads. */
export async function proposalCandidates(accountId: string, executor: Executor = db): Promise<Candidate[]> {
  const threadId = await defaultThreadOf(accountId, executor);
  if (!threadId) return [];
  const [content, notes] = await Promise.all([
    candidateContent(executor, threadId).orderBy("content.id", "desc").limit(PROPOSAL_CANDIDATES).execute(),
    candidateNotes(executor, threadId).orderBy("notes.id", "desc").limit(PROPOSAL_CANDIDATES).execute(),
  ]);
  return [...content, ...notes].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, PROPOSAL_CANDIDATES);
}

/** What the pass last read, so it runs again only when that changed. */
export function candidateKey(candidates: Candidate[]): string {
  return createHash("sha256").update(candidates.map((c) => c.id).sort().join(",")).digest("hex");
}

/** Book the pass when it has something new to read: two or more candidates
 *  and a set it has not read before. */
export async function shouldPropose(accountId: string): Promise<boolean> {
  if (!proposalsOn()) return false;
  const candidates = await proposalCandidates(accountId);
  if (candidates.length < PROPOSAL_MIN) return false;
  const account = await db.selectFrom("accounts").select("loose_pass_key").where("id", "=", accountId).executeTakeFirst();
  return account?.loose_pass_key !== candidateKey(candidates);
}

/** Write what the model proposed, keeping only what may be written. */
export async function applyProposals(
  trx: Executor,
  accountId: string,
  sent: string[],
  groups: { name: string; ids: string[] }[],
): Promise<number> {
  const threadId = await defaultThreadOf(accountId, trx);
  if (!threadId) return 0;
  const offered = new Set(sent);
  // Still a candidate now, not merely when it was read: a thing dismissed,
  // moved or suggested for while the model thought is not proposed.
  const [content, notes] = await Promise.all([
    candidateContent(trx, threadId).where("content.id", "in", sent.length ? sent : ["00000000-0000-0000-0000-000000000000"]).execute(),
    candidateNotes(trx, threadId).where("notes.id", "in", sent.length ? sent : ["00000000-0000-0000-0000-000000000000"]).execute(),
  ]);
  const valid = new Map<string, "content" | "note">([...content, ...notes].map((c) => [c.id, c.kind]));
  const used = new Set<string>();
  let written = 0;

  for (const group of groups) {
    if (written >= PROPOSALS_PER_PASS) break;
    let name: string;
    try {
      name = threadName(group.name);
    } catch (error) {
      if (error instanceof LooseRefused) continue;
      throw error;
    }
    const ids = [...new Set(group.ids)];
    // Every id has to be one the model was handed and still a candidate; one
    // that is not means the group is not what it says, so it goes whole.
    if (ids.some((id) => !offered.has(id) || !valid.has(id) || used.has(id))) continue;
    if (ids.length < PROPOSAL_MIN || ids.length > PROPOSAL_MAX) continue;

    const proposal = await trx.insertInto("thread_proposals").values({ account_id: accountId, name }).returning("id").executeTakeFirstOrThrow();
    await trx
      .insertInto("suggestions")
      .values(
        ids.map((id) => ({
          account_id: accountId,
          content_id: valid.get(id) === "content" ? id : null,
          note_id: valid.get(id) === "note" ? id : null,
          kind: "create" as const,
          proposal_id: proposal.id,
        }))
      )
      .execute();
    for (const id of ids) used.add(id);
    written += 1;
  }

  const key = candidateKey(await proposalCandidates(accountId, trx));
  await trx.updateTable("accounts").set({ loose_pass_key: key }).where("id", "=", accountId).execute();
  return written;
}

/** Spent proposals and accepted suggestions, once nobody can undo them. */
export async function sweepSuggestions(accountId: string): Promise<void> {
  await db
    .deleteFrom("thread_proposals")
    .where("account_id", "=", accountId)
    .where("spent_at", "<", sql<Date>`now() - interval '${sql.raw(UNDO_WINDOW)}'`)
    .execute();
  await db
    .deleteFrom("suggestions")
    .where("account_id", "=", accountId)
    .where("accepted_at", "<", sql<Date>`now() - interval '${sql.raw(UNDO_WINDOW)}'`)
    .execute();
}
