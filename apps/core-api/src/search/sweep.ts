// What still needs embedding, found by asking rather than by remembering.
//
// **One place decides, and it is not the write path.** Content is inserted from
// four places and updated from more, memories from two, messages from two, and
// hooking each one means the feature is correct only while nobody adds a fifth.
// A missed hook does not fail: it makes one row quietly unfindable by meaning,
// which is the kind of defect that surfaces months later as "search is a bit
// rubbish" and cannot be traced to anything.
//
// So nothing enqueues on write. This sweeps for rows whose chunks are missing
// or stale and enqueues those, which makes the question "what is not embedded"
// a query with an answer instead of a claim about coverage.
//
// **The same code is the backfill.** Everything filed before 013 has no chunks,
// so the first sweep finds all of it and the hundredth finds nothing. A
// separate one-shot script would have been a second thing to keep correct.
//
// The cost is freshness: something dumped is searchable by meaning within a
// sweep rather than immediately. It is searchable by exact text at once, since
// that index is a generated column and needs nothing to run.

import { sql } from "kysely";
import { db } from "../db.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";

/** Rows per corpus per sweep.
 *
 *  Bounded so a backfill of a large account does not enqueue tens of thousands
 *  of jobs in one transaction and starve the queue of the interactive work
 *  somebody is waiting on. It drains over several sweeps instead. */
export const SWEEP_BATCH = 200;

/** How often it runs. A minute is short enough that "I just dumped that" is
 *  answerable and long enough that an idle account costs three cheap queries. */
export const SWEEP_SECONDS = 60;

/** The model whose vectors count as current. A change here makes every row
 *  stale, and the sweep re-embeds them over the following sweeps rather than
 *  in one pass. Must match `embed.py`'s MODEL. */
export const EMBED_MODEL = "voyage-4";

interface Pending {
  kind: "embed.content" | "embed.memory" | "embed.message";
  rowId: string;
  accountId: string | null;
  /** The row's own version, so an edit is a different job.
   *
   *  `jobs.idempotency_key` is unique across the whole table and survives the
   *  job completing, so a key of just the row id would embed a row once and
   *  then refuse forever, including after somebody rewrote it. `jobs.purge`
   *  clears done rows eventually, which would make re-embedding depend on how
   *  recently the purge ran: correct by accident is worse than broken. */
  version: string;
}

/** Content with no chunks, or chunks from another model.
 *
 *  `updated_at` beats `embedded_at` for staleness: an edit changes the text and
 *  the chunk boundaries with it, and comparing against the chunk's own clock is
 *  what catches that. */
const CONTENT = sql<{ id: string; account_id: string | null; version: string }>`
  select c.id::text as id, c.account_id::text as account_id,
         extract(epoch from c.updated_at)::bigint::text as version
  from content c
  where c.deleted_at is null
    and not exists (
      select 1 from content_chunks ch
      where ch.content_id = c.id
        and ch.model is not distinct from ${EMBED_MODEL}
        and ch.embedded_at >= c.updated_at
    )
  order by c.updated_at desc
  limit ${SWEEP_BATCH}
`;

const MEMORIES = sql<{ id: string; account_id: string | null; version: string }>`
  select m.id::text as id, m.account_id::text as account_id,
         extract(epoch from m.updated_at)::bigint::text as version
  from memories m
  where m.deleted_at is null and m.superseded_at is null
    and not exists (
      select 1 from memory_chunks ch
      where ch.memory_id = m.id
        and ch.model is not distinct from ${EMBED_MODEL}
        and ch.embedded_at >= m.updated_at
    )
  order by m.updated_at desc
  limit ${SWEEP_BATCH}
`;

// Only settled messages. `queued` has no text worth indexing yet and `failed`
// has nothing worth finding, and both would be re-swept forever.
const MESSAGES = sql<{ id: string; account_id: string | null; version: string }>`
  select m.id::text as id, m.account_id::text as account_id,
         extract(epoch from m.created_at)::bigint::text as version
  from messages m
  where m.deleted_at is null
    and m.text is not null
    and m.state in ('seen', 'answered')
    and not exists (
      select 1 from message_chunks ch
      where ch.message_id = m.id
        and ch.model is not distinct from ${EMBED_MODEL}
    )
  order by m.created_at desc
  limit ${SWEEP_BATCH}
`;

export async function pendingEmbeds(): Promise<Pending[]> {
  const [content, memories, messages] = await Promise.all([
    CONTENT.execute(db),
    MEMORIES.execute(db),
    MESSAGES.execute(db),
  ]);
  return [
    ...content.rows.map((r) => ({ kind: "embed.content" as const, rowId: r.id, accountId: r.account_id, version: r.version })),
    ...memories.rows.map((r) => ({ kind: "embed.memory" as const, rowId: r.id, accountId: r.account_id, version: r.version })),
    ...messages.rows.map((r) => ({ kind: "embed.message" as const, rowId: r.id, accountId: r.account_id, version: r.version })),
  ];
}

/** Find work, enqueue it, and put the next sweep in the queue.
 *
 *  Rescheduling first, the way the calendar's supervisor does, so a sweep that
 *  throws halfway does not stop the chain: the next one is already booked and
 *  will find whatever this one missed.
 */
export async function sweepEmbeds(): Promise<number> {
  await enqueue({
    kind: "embed.sweep",
    payload: {},
    priority: PRIORITY.background,
    runAfterSeconds: SWEEP_SECONDS,
    // One chain, however many instances boot. A second sweep booked for the
    // same minute collapses into the first rather than doubling the rate.
    idempotencyKey: `embed.sweep:${Math.floor(Date.now() / (SWEEP_SECONDS * 1000)) + 1}`,
    maxAttempts: 3,
  });

  const pending = await pendingEmbeds();
  for (const row of pending) {
    await enqueue({
      kind: row.kind,
      payload: { rowId: row.rowId },
      accountId: row.accountId,
      priority: PRIORITY.background,
      // Row and version. A sweep running while the last one's jobs are still
      // queued does not duplicate them, and an edited row is a new key rather
      // than one the table has already seen.
      idempotencyKey: `${row.kind}:${row.rowId}:${row.version}`,
      maxAttempts: 3,
    });
  }
  return pending.length;
}
