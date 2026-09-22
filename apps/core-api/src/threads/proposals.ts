// A said share: "share Lisbon trip with Sam", proposed by the model and done
// by a tap.
//
// **Proposed, never done.** Sharing reaches a person, so it is outward facing
// whoever asks for it (OFF-6), and the model is told that rather than
// deciding it: the tool writes a `pending_shares` row and the reply carries it
// as its own control, the way 019's calendar proposal does. The tap re-runs
// every check the sheet runs, through the same function.
//
// **The name is resolved here, against the person's accepted connections and
// nobody else.** No list of connections reaches the prompt, so a turn costs
// the same however many people somebody knows (OFF-8), and a name that is not
// a connection is never looked up by email from the composer. Two matches
// become a person question the server raises, worded from the database.

import { sql, type Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { connectionsOf, type Executor } from "../people/access.js";
import { initialsOf } from "../accounts/initials.js";
import { raisePersonQuestion } from "../questions.js";
import { memberOf } from "./access.js";
import { shareThread, type ShareRefusal } from "./sharing.js";

type Trx = Transaction<Database>;

/** How long a proposal is worth confirming. Unanswered, it changed nothing. */
export const PROPOSAL_TTL_MS = 60 * 60 * 1000;

/** The line a person reads before sharing, as the sheet shows it. The policy
 *  promises it at the moment of sharing, so a said share carries it too. */
export const SHARE_LINE =
  "A shared thread belongs to everyone in it. If somebody leaves offload, the thread and everything they added stay with the rest of you.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProposeOutcome =
  | { kind: "pending"; pendingId: string; line: string }
  | { kind: "asked" }
  | { kind: "refused"; error: ShareRefusal | "unknown_person" };

/** Whole name, first name, or initials, case-insensitively. "Sam" matches
 *  Sam Ibekwe and not Samira; "SO" matches Sam Ibekwe. */
function nameMatches(person: string, name: string | null): boolean {
  if (!name) return false;
  const p = person.trim().toLowerCase();
  const n = name.trim().toLowerCase();
  if (p === n) return true;
  const first = n.split(/\s+/)[0] ?? "";
  if (p === first) return true;
  return p === initialsOf(name).toLowerCase();
}

/** The tool's server side. `person` is a name or a mention's id. */
export async function proposeShare(
  trx: Trx,
  input: { accountId: string; messageId: string; threadId: string; person: string },
): Promise<ProposeOutcome> {
  if (!(await memberOf(input.accountId, input.threadId, trx))) return { kind: "refused", error: "unknown_thread" };
  const thread = await trx.selectFrom("threads").select("name").where("id", "=", input.threadId).executeTakeFirstOrThrow();
  const account = await trx
    .selectFrom("accounts")
    .select("default_thread_id")
    .where("id", "=", input.accountId)
    .executeTakeFirstOrThrow();
  if (account.default_thread_id === input.threadId) return { kind: "refused", error: "default_thread" };

  const connections = await connectionsOf(input.accountId, trx);
  const word = input.person.trim();
  const candidates = UUID.test(word)
    ? connections.filter((c) => c.accountId === word.toLowerCase())
    : connections.filter((c) => nameMatches(word, c.displayName));
  if (candidates.length === 0) return { kind: "refused", error: "unknown_person" };
  if (candidates.length > 1) {
    const asked = await raisePersonQuestion(trx, {
      accountId: input.accountId,
      messageId: input.messageId,
      threadId: input.threadId,
      threadName: thread.name,
      word,
      candidates: candidates.map((c) => ({ accountId: c.accountId, name: c.displayName ?? "Someone" })),
    });
    return asked ? { kind: "asked" } : { kind: "refused", error: "unknown_person" };
  }

  const target = candidates[0]!;
  // The sheet's checks, now, so a proposal that cannot be confirmed is never
  // drawn. They run again at the tap.
  const check = await checkOnly(trx, input.accountId, input.threadId, target.accountId);
  if (check) return { kind: "refused", error: check };

  const row = await trx
    .insertInto("pending_shares")
    .values({
      account_id: input.accountId,
      message_id: input.messageId,
      thread_id: input.threadId,
      target_account_id: target.accountId,
      expires_at: new Date(Date.now() + PROPOSAL_TTL_MS),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { kind: "pending", pendingId: row.id, line: lineFor(thread.name, target.displayName) };
}

/** The sheet's refusals without the write: a dry run of `shareThread`, in a
 *  savepoint that is always rolled back. One function, two uses. */
async function checkOnly(trx: Trx, callerId: string, threadId: string, targetId: string): Promise<ShareRefusal | null> {
  await sql`savepoint share_check`.execute(trx);
  try {
    const result = await shareThread(trx, callerId, threadId, targetId);
    return result.ok ? null : result.error;
  } finally {
    // Whatever happened inside, the outer transaction goes on: a dry run
    // that threw must not leave it aborted for a reason of its own.
    await sql`rollback to savepoint share_check`.execute(trx);
  }
}

/** The sentence on the control. Rendered from the rows, never from the
 *  model's words. */
export function lineFor(threadName: string, displayName: string | null): string {
  return `Share ${threadName} with ${displayName ?? "Someone"}?`;
}

/** The open proposal on each of these messages, for the reply and the page. */
export async function waitingSharesFor(
  messageIds: string[],
  trx: Executor = db,
): Promise<Map<string, { id: string; because: string; kind: "share" }>> {
  const found = new Map<string, { id: string; because: string; kind: "share" }>();
  if (messageIds.length === 0) return found;
  const rows = await trx
    .selectFrom("pending_shares")
    .innerJoin("threads", "threads.id", "pending_shares.thread_id")
    .innerJoin("accounts", "accounts.id", "pending_shares.target_account_id")
    .select(["pending_shares.id as id", "pending_shares.message_id as messageId", "threads.name as threadName", "accounts.display_name as displayName"])
    .where("pending_shares.message_id", "in", messageIds)
    .where("pending_shares.confirmed_at", "is", null)
    .where("pending_shares.declined_at", "is", null)
    .where("pending_shares.expires_at", ">", sql<Date>`now()`)
    .orderBy("pending_shares.created_at", "desc")
    .execute();
  for (const row of rows) {
    if (found.has(row.messageId)) continue;
    found.set(row.messageId, { id: row.id, because: lineFor(row.threadName, row.displayName), kind: "share" });
  }
  return found;
}

/** The tap. Every check again, through the one function. */
export async function confirmShare(accountId: string, pendingId: string): Promise<boolean> {
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("pending_shares")
      .select(["id", "thread_id", "target_account_id"])
      .where("id", "=", pendingId)
      .where("account_id", "=", accountId)
      .where("confirmed_at", "is", null)
      .where("declined_at", "is", null)
      .where("expires_at", ">", sql<Date>`now()`)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return false;
    const result = await shareThread(trx, accountId, row.thread_id, row.target_account_id);
    if (!result.ok) {
      // Answered, and nothing happened: the control goes and the sheet is
      // where they find out why.
      await trx.updateTable("pending_shares").set({ declined_at: sql`now()` }).where("id", "=", row.id).execute();
      return false;
    }
    await trx.updateTable("pending_shares").set({ confirmed_at: sql`now()` }).where("id", "=", row.id).execute();
    return true;
  });
}

export async function declineShare(accountId: string, pendingId: string): Promise<boolean> {
  const result = await db
    .updateTable("pending_shares")
    .set({ declined_at: sql`now()` })
    .where("id", "=", pendingId)
    .where("account_id", "=", accountId)
    .where("confirmed_at", "is", null)
    .where("declined_at", "is", null)
    .where("expires_at", ">", sql<Date>`now()`)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}
