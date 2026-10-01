// 028: what the loose tests share. 025's kit already makes accounts, threads,
// rows, notes and sessions; this adds the default thread and the two new tables.

import { db } from "../src/db.js";
import { account, thread } from "./labels-kit.js";

export { account, thread, join, row, note, signIn, dump, tool, as, wipe } from "./labels-kit.js";

/** An account with its default thread, the way promotion leaves one. */
export async function owner(name = "Ana Duarte"): Promise<{ me: string; loose: string }> {
  const me = await account(name);
  const loose = await thread(me, "Miscellaneous");
  await db.updateTable("accounts").set({ default_thread_id: loose }).where("id", "=", me).execute();
  await db.updateTable("threads").set({ always_on: true }).where("id", "=", loose).execute();
  return { me, loose };
}

export async function proposal(accountId: string, name = "Kitchen shelves"): Promise<string> {
  const inserted = await db.insertInto("thread_proposals").values({ account_id: accountId, name }).returning("id").executeTakeFirstOrThrow();
  return inserted.id;
}

export async function moveSuggestion(accountId: string, target: { contentId?: string; noteId?: string }, threadId: string): Promise<string> {
  const inserted = await db
    .insertInto("suggestions")
    .values({ account_id: accountId, content_id: target.contentId ?? null, note_id: target.noteId ?? null, kind: "move", thread_id: threadId })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

export async function createSuggestion(accountId: string, target: { contentId?: string; noteId?: string }, proposalId: string): Promise<string> {
  const inserted = await db
    .insertInto("suggestions")
    .values({ account_id: accountId, content_id: target.contentId ?? null, note_id: target.noteId ?? null, kind: "create", proposal_id: proposalId })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}
