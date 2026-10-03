// 035 part B. A person's copy of everything they can read: the row.
//
// One row per account. The archive itself is `build.ts`; this is who may ask,
// when, and what the row says. The clock is the request's: a copy lives seven
// days from it and another can be asked for seven days from it, so deleting a
// copy early frees storage and not the clock. A build that failed clears the
// clock, since nobody got anything.

import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import { db } from "../db.js";
import type { Database } from "../schema.js";
import { generateKey, wrap } from "../crypto/keys.js";
import { accountKey } from "../blobs/keys.js";
import { objectStore } from "../blobs/store.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";
import { emit, subjectOf } from "../analytics.js";

type Trx = Transaction<Database> | Kysely<Database>;

export const COPY_DAYS = 7;
const COPY_MS = COPY_DAYS * 86_400_000;

export interface CopyState {
  state: "idle" | "making" | "ready" | "failed" | "waiting";
  readyAt: string | null;
  expiresAt: string | null;
  /** When another may be asked for, while one may not. */
  nextAt: string | null;
}

const IDLE: CopyState = { state: "idle", readyAt: null, expiresAt: null, nextAt: null };

/** Where a copy's sealed parts live. An id and a number, never a name. */
export function partKey(exportId: string, part: number): string {
  return `exports/${exportId}/${part}`;
}

/** Hand a copy's parts to the job that removes them, in the caller's
 *  transaction, so a row never goes without its objects being booked. */
export async function destroyParts(trx: Trx, id: string, parts: number): Promise<void> {
  await enqueue({ kind: "export.destroy", payload: { id, parts }, priority: PRIORITY.background, tx: trx });
}

export async function copyState(accountId: string): Promise<CopyState> {
  const row = await db
    .selectFrom("exports")
    .select(["state", "requested_at", "ready_at", "expires_at"])
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!row) return IDLE;
  // A failed build gave the clock back, and can be asked for again.
  if (row.state === "failed" && !row.requested_at) return { ...IDLE, state: "failed" };
  // Past the seven days the row is history, whatever the sweep has got to.
  const nextAt = row.requested_at ? new Date(row.requested_at.getTime() + COPY_MS) : null;
  if (!nextAt || nextAt.getTime() <= Date.now()) return IDLE;
  if (row.state === "making") return { ...IDLE, state: "making" };
  // No copy and the clock still counting: one deleted, or one too big to make.
  if (row.state === "gone" || row.state === "failed") return { ...IDLE, state: "waiting", nextAt: nextAt.toISOString() };
  return {
    state: "ready",
    readyAt: row.ready_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    nextAt: null,
  };
}

export type Asked = { ok: true } | { ok: false; nextAt: string };

/** Start a copy, or say when one may be started. The row is locked, so two
 *  presses are one copy. */
export async function requestCopy(accountId: string): Promise<Asked> {
  return db.transaction().execute(async (trx) => {
    // The account row is the lock: there may be no exports row to take one on.
    await trx.selectFrom("accounts").select("id").where("id", "=", accountId).forUpdate().executeTakeFirstOrThrow();
    const old = await trx
      .selectFrom("exports")
      .select(["id", "parts", "requested_at"])
      .where("account_id", "=", accountId)
      .executeTakeFirst();
    if (old?.requested_at) {
      const nextAt = new Date(old.requested_at.getTime() + COPY_MS);
      const { now } = await trx.selectNoFrom(sql<Date>`now()`.as("now")).executeTakeFirstOrThrow();
      if (nextAt.getTime() > now.getTime()) return { ok: false, nextAt: nextAt.toISOString() };
    }
    if (old) {
      await trx.deleteFrom("exports").where("id", "=", old.id).execute();
      await destroyParts(trx, old.id, old.parts);
    }
    const made = await trx
      .insertInto("exports")
      .values({ account_id: accountId, wrapped_key: wrap(generateKey(), await accountKey(trx, accountId)) })
      .returning("id")
      .executeTakeFirstOrThrow();
    await enqueue({
      kind: "export.build",
      payload: { exportId: made.id },
      accountId,
      priority: PRIORITY.background,
      // Once. A build that fails says so and frees the clock; it is the
      // person's to ask again, not the queue's.
      maxAttempts: 1,
      tx: trx,
    });
    await enqueue({ kind: "email.export_requested", payload: { at: new Date().toISOString() }, accountId, tx: trx });
    await emit({ name: "export_requested", subjectId: await subjectOf(accountId, trx), tx: trx });
    return { ok: true };
  });
}

/** Delete copy. The row stays as `gone` so the clock keeps counting. */
export async function deleteCopy(accountId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable("exports")
      .set({ state: "gone" })
      .where("account_id", "=", accountId)
      .where("state", "!=", "gone")
      .returning(["id", "parts"])
      .executeTakeFirst();
    if (row) await destroyParts(trx, row.id, row.parts);
  });
}

/** A membership ended: every copy of that account's holding the thread goes
 *  (AC-19). Called inside the leave or the take-out. A copy still being made
 *  has not said what it holds yet and may hold this, so it goes too: the
 *  build finds its row is no longer `making` and removes what it had put. */
export async function destroyCopiesHolding(trx: Trx, threadId: string, accountId: string): Promise<void> {
  const rows = await trx
    .updateTable("exports")
    .set({ state: "gone" })
    .where("account_id", "=", accountId)
    .where("state", "!=", "gone")
    .where((eb) => eb.or([eb("state", "=", "making"), sql<boolean>`${threadId}::uuid = any(thread_ids)`]))
    .returning(["id", "parts"])
    .execute();
  for (const row of rows) await destroyParts(trx, row.id, row.parts);
}

/** Remove a copy's objects. One past the count, for a part that was put and
 *  never counted. */
export async function removeParts(id: string, parts: number): Promise<void> {
  const store = objectStore();
  if (!store) return;
  await store.remove(Array.from({ length: parts + 1 }, (_, part) => partKey(id, part)));
}
