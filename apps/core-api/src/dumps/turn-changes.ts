// 052. What a turn changed that was there before it, so its reply can show the
// change and its Undo can put it back (closing OFF-6's item of 2026-10-02).
//
// One row per dump message and target. The first value a field had in the turn
// wins; a field a second tool touches is merged in. Only offload's own
// columns are kept, never a connected app's body (OFF-4).

import { sql, type Transaction } from "kysely";
import type { Database } from "../schema.js";
import type { Executor } from "../threads/access.js";
import { moveContentIn } from "../routes/threads.js";

/** The content columns an `edit_content` can change, recorded before it does. */
export const CONTENT_EDITED = ["title", "body", "url", "image_url", "due_at", "occurs_at", "occurs_end_at", "rrule", "priority"] as const;

export type ChangeKind = "content" | "note" | "thread";

export async function recordChange(
  trx: Executor,
  input: { messageId: string | null; accountId: string; kind: ChangeKind; targetId: string; tool: string; previous: Record<string, unknown> },
): Promise<void> {
  // A row typed straight into a thread has no turn to undo.
  if (!input.messageId) return;
  await sql`
    insert into turn_changes (message_id, account_id, target_kind, target_id, tool, previous)
    values (${input.messageId}::uuid, ${input.accountId}::uuid, ${input.kind}, ${input.targetId}::uuid, ${input.tool},
            ${JSON.stringify(input.previous)}::jsonb)
    on conflict (message_id, target_kind, target_id)
    do update set previous = excluded.previous || turn_changes.previous`.execute(trx);
}

/** A content row's columns as they are now, to record before a write. */
export async function contentNow(trx: Executor, id: string, columns: readonly string[]): Promise<Record<string, unknown>> {
  const row = await trx
    .selectFrom("content")
    .select(columns as never[])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  return row as Record<string, unknown>;
}

const TIMES = new Set(["done_at", "archived_at", "due_at", "occurs_at", "occurs_end_at"]);

/** Put back what the turn's messages changed, inside the Undo's transaction.
 *  With `since`, a target somebody changed after it is left as it is and its
 *  title returned, so a late Undo never overwrites a later edit (026's rule). */
export async function restoreChanges(
  trx: Transaction<Database>,
  accountId: string,
  messageIds: string[],
  since?: string,
): Promise<string[]> {
  if (messageIds.length === 0) return [];
  const rows = await trx
    .selectFrom("turn_changes")
    .select(["target_kind", "target_id", "previous"])
    .where("message_id", "in", messageIds)
    .where("account_id", "=", accountId)
    .where("previous", "is not", null)
    .execute();
  const changed: string[] = [];
  for (const one of rows) {
    const previous = one.previous as Record<string, unknown>;
    if (one.target_kind === "thread") {
      const held = await trx
        .selectFrom("threads")
        .select(["name", "updated_at"])
        .where("id", "=", one.target_id)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!held) continue;
      if (since && held.updated_at && held.updated_at.toISOString() > new Date(since).toISOString()) {
        changed.push(held.name);
        continue;
      }
      if ("name" in previous) await trx.updateTable("threads").set({ name: previous.name as string }).where("id", "=", one.target_id).execute();
      if ("widgets" in previous) {
        await trx
          .updateTable("threads")
          .set({
            attrs: previous.widgets === null ? sql`attrs - 'widgets'` : sql`attrs || ${JSON.stringify({ widgets: previous.widgets })}::jsonb`,
          })
          .where("id", "=", one.target_id)
          .execute();
      }
      continue;
    }
    if (one.target_kind !== "content") continue;
    const held = await trx
      .selectFrom("content")
      .select(["title", "thread_id", "updated_at"])
      .where("id", "=", one.target_id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!held) continue;
    if (since && held.updated_at > new Date(since)) {
      changed.push(held.title);
      continue;
    }
    const { thread_id: threadId, ...columns } = previous;
    if (Object.keys(columns).length > 0) {
      const set: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(columns)) set[key] = TIMES.has(key) && value != null ? new Date(value as string) : value;
      await trx.updateTable("content").set({ ...set, updated_at: sql`now()` }).where("id", "=", one.target_id).execute();
    }
    // A move goes back through the move itself, so a picture's wraps follow it.
    if (typeof threadId === "string" && threadId !== held.thread_id) {
      try {
        await moveContentIn(trx, accountId, one.target_id, threadId);
      } catch {
        changed.push(held.title);
      }
    }
  }
  return changed;
}
