// 028. The account's default thread is never drawn as a thread.
//
// What is in it is still stored there and still read by search, answering and
// the model; only its name stops reaching a person. Every payload that names
// a row's thread for somebody to read selects the name through this, so the
// rule lives in one expression: the caller's own default thread has no name.

import { sql } from "kysely";

/** `name`, or null when `threadId` is the account's default thread. Both are
 *  column references in the query this is selected in. */
export function shownThreadName(threadId: string, name: string, accountId: string) {
  return sql<string | null>`case when ${sql.ref(threadId)} = (select a.default_thread_id from accounts a where a.id = ${accountId}) then null else ${sql.ref(name)} end`;
}

/** What the model reads for a thread's name: the stored one, or for the
 *  default thread the words the prompt uses for it, so a reply can never
 *  repeat "Miscellaneous" back to a person. */
export const NOT_IN_A_THREAD = "not in a thread";

export function shownToModel(threadId: string, name: string, accountId: string) {
  return sql<string>`case when ${sql.ref(threadId)} = (select a.default_thread_id from accounts a where a.id = ${accountId}) then ${NOT_IN_A_THREAD} else ${sql.ref(name)} end`;
}
