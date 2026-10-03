// 037. A thread's icon and hue: what a new thread gets, and how a read that
// names a thread carries them.

import { sql, type Transaction } from "kysely";
import { DEFAULT_THREAD_ICON, THREAD_ICON_NAMES, leastUsedHue, pickThreadIcon } from "@offload/widgets";
import type { Database } from "../schema.js";

const SEVENTY = new Set(THREAD_ICON_NAMES);

/** What a thread starts with. The icon is the one given when it is one of the
 *  seventy, which is the model naming it on `create_thread`; otherwise the
 *  word list's pick from the name, or lasso. The hue is the one the creator's
 *  live threads use least, the default thread not counted: it is never drawn.
 *  Either way the pick is offload's, so a rename may pick again. */
export async function markFor(
  trx: Transaction<Database>,
  accountId: string,
  name: string,
  icon?: string | null,
): Promise<{ icon: string; hue: number; icon_set_by: "offload" }> {
  const used = await trx
    .selectFrom("threads")
    .select("hue")
    .where("created_by_account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where(sql<boolean>`id is distinct from (select a.default_thread_id from accounts a where a.id = ${accountId})`)
    .execute();
  return {
    icon: icon && SEVENTY.has(icon) ? icon : (pickThreadIcon(name) ?? DEFAULT_THREAD_ICON),
    hue: leastUsedHue(used.map((row) => row.hue)),
    icon_set_by: "offload",
  };
}

/** A thread's icon or hue beside `shownThreadName`: null exactly when the
 *  name is, which is when the thread is the caller's default. `column` and
 *  `threadId` are column references in the query this is selected in. */
export function shownThreadIcon(threadId: string, column: string, accountId: string) {
  return sql<string | null>`case when ${sql.ref(threadId)} = (select a.default_thread_id from accounts a where a.id = ${accountId}) then null else ${sql.ref(column)} end`;
}

export function shownThreadHue(threadId: string, column: string, accountId: string) {
  return sql<number | null>`case when ${sql.ref(threadId)} = (select a.default_thread_id from accounts a where a.id = ${accountId}) then null else ${sql.ref(column)} end`;
}
