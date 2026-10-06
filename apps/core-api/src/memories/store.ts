// 038. What offload knows about a person across their threads.
//
// A memory is a `notes` row with scope 'account' and subject_id the account:
// the table was built for this (0017) and reusing it gives supersede, purge,
// deletion and the export for free. **This file is the one write path**, and
// every function takes the account from its caller, which takes it from the
// job or the session, never from a body.
//
// subject_id is always the account. The export selects account scope by it,
// and a memory written without it would delete correctly and export as
// nothing, which is the one way of seeing memories there is until the tab.

import { sql } from "kysely";
import { db } from "../db.js";
import type { MemoryClass } from "../schema.js";
import type { Executor } from "../threads/access.js";
import { flat } from "./flat.js";
import { neverHolds } from "./shapes.js";

/** A sentence, the same as a note. */
export const MEMORY_TEXT_CHARS = 200;
/** How many reach a prompt (OFF-8): the budget, and the query is the bound. */
export const MEMORY_PROMPT_BUDGET = 50;
/** How many learned ones may be active, so a person's own are never crowded
 *  out and the pass cannot fill the block on its own. */
export const LEARNED_MEMORY_CAP = 25;
/** How long a forgotten memory waits for the turn's Undo before it is purged. */
export const FORGET_PURGE_MINUTES = 10;
/** How long a learned memory offload set aside is kept, as 014's folds are. */
export const SUPERSEDED_PURGE_DAYS = 30;

export interface Memory {
  id: string;
  kind: MemoryClass;
  text: string;
  origin: "stated" | "learned" | "answered";
  createdAt: Date;
}

type Refused = { ok: false; error: "never_list" | "too_long" | "empty" };

/** The account's active memories for a prompt: the person's own (asked and
 *  answered) before learned, then newest first, at most fifty. */
export async function memoriesForPrompt(accountId: string, trx: Executor = db): Promise<Memory[]> {
  const rows = await trx
    .selectFrom("notes")
    .select(["id", "kind", "text", "origin", "created_at"])
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .orderBy(sql`case when origin = 'learned' then 1 else 0 end`)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(MEMORY_PROMPT_BUDGET)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as MemoryClass,
    text: row.text,
    origin: row.origin,
    createdAt: row.created_at,
  }));
}

/** The words a memory is, or why they cannot be one. */
export function shaped(raw: string, kind: MemoryClass): { ok: true; text: string } | Refused {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.length > MEMORY_TEXT_CHARS) return { ok: false, error: "too_long" };
  if (neverHolds(text, kind)) return { ok: false, error: "never_list" };
  return { ok: true, text };
}

/** Insert one, or hand back the active memory that already says it. */
async function insertOnce(
  trx: Executor,
  values: {
    accountId: string;
    kind: MemoryClass;
    text: string;
    origin: "stated" | "learned" | "answered";
    messageId: string | null;
    calendarId?: string | null;
    attrs?: Record<string, string>;
  },
): Promise<{ id: string; created: boolean }> {
  const written = await trx
    .insertInto("notes")
    .values({
      account_id: values.accountId,
      scope: "account",
      subject_id: values.accountId,
      kind: values.kind,
      text: values.text,
      origin: values.origin,
      derived_from_message_id: values.messageId,
      calendar_id: values.calendarId ?? null,
      attrs: JSON.stringify(values.attrs ?? {}),
    })
    // Never a caught 23505: the conflicting text would be in the error.
    .onConflict((oc) =>
      oc
        .expression(sql`subject_id, lower(text)`)
        .where("scope", "=", "account")
        .where("deleted_at", "is", null)
        .where("superseded_at", "is", null)
        .doNothing(),
    )
    .returning("id")
    .executeTakeFirst();
  if (written) return { id: written.id, created: true };
  const held = await trx
    .selectFrom("notes")
    .select("id")
    .where("scope", "=", "account")
    .where("subject_id", "=", values.accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .where(sql<boolean>`lower(text) = lower(${values.text})`)
    .executeTakeFirstOrThrow();
  return { id: held.id, created: false };
}

/** 2a. What the person asked offload to remember. The turn's gate (who said
 *  it, and what the turn read) is the caller's; this holds the words. */
export async function remember(
  trx: Executor,
  input: { accountId: string; messageId: string; text: string; kind: MemoryClass },
): Promise<{ ok: true; id: string } | Refused> {
  const words = shaped(input.text, input.kind);
  if (!words.ok) return words;
  const held = await insertOnce(trx, {
    accountId: input.accountId,
    kind: input.kind,
    text: words.text,
    origin: "stated",
    messageId: input.messageId,
  });
  return { ok: true, id: held.id };
}

/** 2a. What the person asked offload to forget.
 *
 *  **Never through `deleteNote`**: that takes the source message, its photos
 *  and offload's reply onto the delete clock when nothing else came from it,
 *  and forgetting a sentence must not delete the conversation it was said in.
 *  The memory leaves every prompt now and is purged once the turn's Undo has
 *  closed; the message it came from is recorded so the nightly pass cannot
 *  learn it again from the same words. */
export async function forget(
  trx: Executor,
  input: { accountId: string; messageId: string; memoryId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: "unknown_memory" }> {
  const row = await trx
    .updateTable("notes")
    .set({
      deleted_at: sql`now()`,
      purge_after: sql`now() + make_interval(mins => ${FORGET_PURGE_MINUTES})`,
      attrs: sql`attrs || jsonb_build_object('forgot_in', ${input.messageId}::text)`,
      updated_at: sql`now()`,
    })
    .where("id", "=", input.memoryId)
    .where("scope", "=", "account")
    .where("subject_id", "=", input.accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .returning(["id", "derived_from_message_id"])
    .executeTakeFirst();
  if (!row) return { ok: false, error: "unknown_memory" };
  if (row.derived_from_message_id) {
    await trx
      .insertInto("memory_forgotten")
      .values({ account_id: input.accountId, message_id: row.derived_from_message_id })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  return { ok: true, id: row.id };
}

/** The turn's Undo: memories these messages forgot come back, and their
 *  sources may teach again. */
export async function restoreForgotten(trx: Executor, accountId: string, messageIds: string[]): Promise<number> {
  if (messageIds.length === 0) return 0;
  const back = await trx
    .updateTable("notes")
    .set({ deleted_at: null, purge_after: null, attrs: sql`attrs - 'forgot_in'`, updated_at: sql`now()` })
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("deleted_at", "is not", null)
    .where(sql<boolean>`attrs->>'forgot_in' in (${sql.join(messageIds)})`)
    .returning(["id", "derived_from_message_id"])
    .execute();
  const sources = back.map((row) => row.derived_from_message_id).filter((id): id is string => id !== null);
  if (sources.length > 0) {
    await trx.deleteFrom("memory_forgotten").where("account_id", "=", accountId).where("message_id", "in", sources).execute();
  }
  return back.length;
}

/** 2b. "Which calendar is shared with Meera?", answered. The memory names the
 *  person in their words and holds the calendar by id: **never the calendar's
 *  name**, which may be words somebody else gave it. A second answer for the
 *  same name replaces the first. */
export async function answerMemory(
  trx: Executor,
  input: { accountId: string; name: string; calendarId: string; answeredIn?: string | null },
): Promise<string | null> {
  const key = flat(input.name);
  const words = shaped(`They share a calendar with ${input.name.trim()}.`, "things");
  // A name is a person's: held to what a People memory may carry, too.
  if (!key || !words.ok || neverHolds(words.text, "people")) return null;
  // One answer per name at a time: two open questions about the same person
  // in two conversations would otherwise both find nothing to supersede, and
  // the second would quietly hand back the first's calendar.
  await sql`select pg_advisory_xact_lock(hashtext(${input.accountId}), hashtext(${"memory:" + key}))`.execute(trx);
  const replaced = await trx
    .updateTable("notes")
    .set({ superseded_at: sql`now()`, updated_at: sql`now()` })
    .where("scope", "=", "account")
    .where("subject_id", "=", input.accountId)
    .where("origin", "=", "answered")
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .where(sql<boolean>`attrs->>'with' = ${key}`)
    .returning("id")
    .executeTakeFirst();
  const held = await insertOnce(trx, {
    accountId: input.accountId,
    kind: "things",
    text: words.text,
    origin: "answered",
    messageId: null,
    calendarId: input.calendarId,
    // Which answer wrote it and what it replaced, so the answer's Undo can
    // take it back and put the one before back.
    attrs: {
      with: key,
      ...(input.answeredIn ? { answered_in: input.answeredIn } : {}),
      ...(replaced ? { replaced: replaced.id } : {}),
    },
  });
  return held.id;
}

/** The answer's Undo: the memory it wrote goes, and the one it replaced is
 *  current again. */
export async function undoAnswered(trx: Executor, accountId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const gone = await trx
    .updateTable("notes")
    .set({ deleted_at: sql`now()`, purge_after: sql`now()`, updated_at: sql`now()` })
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("origin", "=", "answered")
    .where("deleted_at", "is", null)
    .where(sql<boolean>`attrs->>'answered_in' in (${sql.join(messageIds)})`)
    .returning(sql<string | null>`attrs->>'replaced'`.as("replaced"))
    .execute();
  const back = gone.map((row) => row.replaced).filter((id): id is string => id !== null);
  if (back.length > 0) {
    await trx
      .updateTable("notes")
      .set({ superseded_at: null, updated_at: sql`now()` })
      .where("id", "in", back)
      .where("scope", "=", "account")
      .where("subject_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();
  }
}

/** 2b, the next time. Exactly one answered memory for the name, whose calendar
 *  is among the candidates the caller may write to, settles; anything else
 *  settles nothing and the question is asked again. */
export async function settleByMemory<C extends { id: string }>(
  accountId: string,
  name: string,
  candidates: C[],
  trx: Executor = db,
): Promise<C | null> {
  const key = flat(name);
  if (!key) return null;
  const rows = await trx
    .selectFrom("notes")
    .select("calendar_id")
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("origin", "=", "answered")
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .where(sql<boolean>`attrs->>'with' = ${key}`)
    .execute();
  if (rows.length !== 1 || !rows[0]!.calendar_id) return null;
  return candidates.find((calendar) => calendar.id === rows[0]!.calendar_id) ?? null;
}

/** In the daily run. A learned memory whose source is gone goes with it, and
 *  any memory replaced a month ago is purged, as 014's folds are: what the
 *  privacy page says of a replaced memory holds whoever wrote it. */
export async function sweepMemories(accountId: string, trx: Executor = db): Promise<void> {
  await trx
    .updateTable("notes")
    .set({ deleted_at: sql`now()`, purge_after: sql`now()`, updated_at: sql`now()` })
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "<", sql<Date>`now() - make_interval(days => ${SUPERSEDED_PURGE_DAYS})`)
    .execute();
  await trx
    .updateTable("notes")
    .set({ deleted_at: sql`now()`, purge_after: sql`now()`, updated_at: sql`now()` })
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("origin", "=", "learned")
    .where("deleted_at", "is", null)
    .where((eb) =>
      eb.or([
        // Learned from a message that is gone.
        eb.and([
          eb(sql`attrs->>'from_note'`, "is", null),
          eb.not(
            eb.exists(
              eb
                .selectFrom("messages")
                .select("messages.id")
                .whereRef("messages.id", "=", "notes.derived_from_message_id")
                .where("messages.deleted_at", "is", null),
            ),
          ),
        ]),
        // Learned from a thread note that is gone.
        eb.and([
          eb(sql`attrs->>'from_note'`, "is not", null),
          eb.not(
            eb.exists(
              eb
                .selectFrom("notes as source")
                .select("source.id")
                .where(sql<boolean>`source.id::text = notes.attrs->>'from_note'`)
                .where("source.deleted_at", "is", null),
            ),
          ),
        ]),
      ]),
    )
    .execute();
}
