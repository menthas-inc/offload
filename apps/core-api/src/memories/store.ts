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

import { remindersOf } from "../notifications/labels.js";
import { LEARNED_CAP, MEMORY_CAP, MEMORY_TEXT_CHARS as SHARED_TEXT_CHARS, RULES_CAP } from "@offload/widgets";
import { sql } from "kysely";
import { db } from "../db.js";
import type { MemoryClass } from "../schema.js";
import type { Executor } from "../threads/access.js";
import { flat } from "./flat.js";
import { neverHolds } from "./shapes.js";
import { placeOnRead } from "./layout.js";

/** A sentence, the same as a note. One number with the clients' count. */
export const MEMORY_TEXT_CHARS = SHARED_TEXT_CHARS;
/** How many reach a prompt (OFF-8): the budget, and the query is the bound. */
export const MEMORY_PROMPT_BUDGET = 50;
/** How many learned ones may be active, so a person's own are never crowded
 *  out and the pass cannot fill the block on its own. */
export const LEARNED_MEMORY_CAP = LEARNED_CAP;
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
/** 040. Why there is no room for one more. */
type Full = { ok: false; error: "rules_full" | "memories_full" };

/** Active memories of the account, the one scope every read and write here
 *  takes: account scope, about the account, written to the account. */
export function active(trx: Executor, accountId: string) {
  return trx
    .selectFrom("notes")
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null);
}

/** The id of the active memory that already says these words, any case. */
async function saying(trx: Executor, accountId: string, text: string, except: string | null = null): Promise<string | null> {
  let q = active(trx, accountId).select("id").where(sql<boolean>`lower(text) = lower(${text})`);
  if (except) q = q.where("id", "!=", except);
  return (await q.executeTakeFirst())?.id ?? null;
}

/** 040. Room for one more of this kind, or why not. At 300 the oldest learned
 *  memory is retired to make room (OFF-6's allowlist, on compaction's terms):
 *  the person's own are never retired, and when all 300 are theirs the cap
 *  refuses. One writer at a time per account, so two adds cannot both see 299. */
/** One writer at a time per account for anything a cap or a duplicate check
 *  decides, held to the end of the caller's transaction. */
export async function capLock(trx: Executor, accountId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${accountId}), hashtext('memory:cap'))`.execute(trx);
}

async function room(trx: Executor, accountId: string, kind: MemoryClass): Promise<{ ok: true } | Full> {
  await capLock(trx, accountId);
  const counts = await active(trx, accountId)
    .select([sql<number>`count(*)::int`.as("all"), sql<number>`(count(*) filter (where kind = 'rules'))::int`.as("rules")])
    .executeTakeFirstOrThrow();
  if (kind === "rules" && counts.rules >= RULES_CAP) return { ok: false, error: "rules_full" };
  if (counts.all < MEMORY_CAP) return { ok: true };
  const oldest = await active(trx, accountId)
    .select("id")
    .where("origin", "=", "learned")
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .limit(1)
    .executeTakeFirst();
  if (!oldest) return { ok: false, error: "memories_full" };
  // The same ten minutes a forget waits: never purged while a toast is up.
  await trx
    .updateTable("notes")
    .set({
      deleted_at: sql`now()`,
      purge_after: sql`now() + make_interval(mins => ${FORGET_PURGE_MINUTES})`,
      updated_at: sql`now()`,
    })
    .where("id", "=", oldest.id)
    .execute();
  return { ok: true };
}

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
): Promise<{ ok: true; id: string } | Refused | Full> {
  const words = shaped(input.text, input.kind);
  if (!words.ok) return words;
  // Asked twice is remembered once, and needs no room.
  const already = await saying(trx, input.accountId, words.text);
  if (already) return { ok: true, id: already };
  const fits = await room(trx, input.accountId, input.kind);
  if (!fits.ok) return fits;
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
  input: { accountId: string; messageId: string | null; memoryId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: "unknown_memory" }> {
  // The turn's Undo finds it by the message that forgot it; the tab's, which
  // has no message, by its own id.
  const marker = input.messageId
    ? sql`jsonb_build_object('forgot_in', ${input.messageId}::text)`
    : sql`jsonb_build_object('forgot_by', 'tab')`;
  const row = await trx
    .updateTable("notes")
    .set({
      deleted_at: sql`now()`,
      purge_after: sql`now() + make_interval(mins => ${FORGET_PURGE_MINUTES})`,
      attrs: sql`attrs || ${marker}`,
      updated_at: sql`now()`,
    })
    .where("id", "=", input.memoryId)
    .where("scope", "=", "account")
    .where("subject_id", "=", input.accountId)
    .where("account_id", "=", input.accountId)
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

/** Either Undo puts one forgotten memory back, and its source may teach
 *  again. Never a second copy of words said again since ("said"), and an Undo
 *  never makes room by retiring another memory: at a cap it stays forgotten
 *  ("full"). */
async function putBack(
  trx: Executor,
  accountId: string,
  row: { id: string; kind: string; text: string; derived_from_message_id: string | null },
  marker: "forgot_in" | "forgot_by",
): Promise<"back" | "said" | "full"> {
  await capLock(trx, accountId);
  if (await saying(trx, accountId, row.text)) return "said";
  const counts = await active(trx, accountId)
    .select([sql<number>`count(*)::int`.as("all"), sql<number>`(count(*) filter (where kind = 'rules'))::int`.as("rules")])
    .executeTakeFirstOrThrow();
  if (counts.all >= MEMORY_CAP || (row.kind === "rules" && counts.rules >= RULES_CAP)) return "full";
  await trx
    .updateTable("notes")
    .set({ deleted_at: null, purge_after: null, attrs: sql`attrs - ${marker}::text`, updated_at: sql`now()` })
    .where("id", "=", row.id)
    .execute();
  if (row.derived_from_message_id) {
    await trx
      .deleteFrom("memory_forgotten")
      .where("account_id", "=", accountId)
      .where("message_id", "=", row.derived_from_message_id)
      .execute();
  }
  return "back";
}

/** The turn's Undo: memories these messages forgot come back, as many as fit.
 *  Returns the words of those that stayed forgotten, for the toast to name. */
export async function restoreForgotten(trx: Executor, accountId: string, messageIds: string[]): Promise<string[]> {
  if (messageIds.length === 0) return [];
  const rows = await trx
    .selectFrom("notes")
    .select(["id", "kind", "text", "derived_from_message_id"])
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("deleted_at", "is not", null)
    .where(sql<boolean>`attrs->>'forgot_in' in (${sql.join(messageIds)})`)
    .orderBy("created_at")
    .execute();
  const stayed: string[] = [];
  for (const row of rows) if ((await putBack(trx, accountId, row, "forgot_in")) === "full") stayed.push(row.text);
  return stayed;
}

/** 040. The tab's Undo, by id, while the forgotten memory waits for its
 *  purge. False when the window has closed, or there is no longer room. */
export async function restoreMemory(trx: Executor, accountId: string, id: string): Promise<boolean> {
  const row = await trx
    .selectFrom("notes")
    .select(["id", "kind", "text", "derived_from_message_id"])
    .where("id", "=", id)
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("account_id", "=", accountId)
    .where("deleted_at", "is not", null)
    .where("superseded_at", "is", null)
    .where(sql<boolean>`attrs->>'forgot_by' = 'tab'`)
    .where("purge_after", ">", sql<Date>`now()`)
    .executeTakeFirst();
  if (!row) return false;
  return (await putBack(trx, accountId, row, "forgot_by")) === "back";
}

/** 040. Typed in the tab: kept as typed, the person's own, with no source.
 *  Rules and sensitive subjects are allowed, because the person wrote them. */
export async function addMemory(
  trx: Executor,
  input: { accountId: string; text: string; kind?: MemoryClass },
): Promise<{ ok: true; id: string } | Refused | Full | { ok: false; error: "duplicate" }> {
  const kind = input.kind ?? "about";
  const words = shaped(input.text, kind);
  if (!words.ok) return words;
  if (kind === "rules") {
    const rules = await active(trx, input.accountId).select(sql<number>`count(*)::int`.as("n")).where("kind", "=", "rules").executeTakeFirstOrThrow();
    if (rules.n >= RULES_CAP) return { ok: false, error: "rules_full" };
  }
  if (await saying(trx, input.accountId, words.text)) return { ok: false, error: "duplicate" };
  const fits = await room(trx, input.accountId, kind);
  if (!fits.ok) return fits;
  const held = await insertOnce(trx, { accountId: input.accountId, kind, text: words.text, origin: "stated", messageId: null, attrs: { added: "tab" } });
  if (!held.created) return { ok: false, error: "duplicate" };
  return { ok: true, id: held.id };
}

/** 040. Changed in the tab. Whatever changed it is the person's now, so a
 *  learned memory becomes theirs and its source cannot teach the old words
 *  again. An answered one keeps its calendar while only its kind moves; new
 *  words are no longer the answer, so the link is severed (owner, 2026-10-06).
 *  Either change places it afresh on the map and re-embeds it. */
export async function changeMemory(
  trx: Executor,
  input: { accountId: string; id: string; text?: string; kind?: MemoryClass },
): Promise<{ ok: true; id: string } | Refused | Full | { ok: false; error: "duplicate" | "not_found" }> {
  // The rules cap and the duplicate check are read under the same lock an add
  // takes, so two changes cannot both see nineteen rules or both see free words.
  await capLock(trx, input.accountId);
  const row = await active(trx, input.accountId)
    .select(["id", "kind", "text", "origin", "derived_from_message_id"])
    .where("id", "=", input.id)
    .executeTakeFirst();
  if (!row) return { ok: false, error: "not_found" };
  const kind = input.kind ?? (row.kind as MemoryClass);
  const words = shaped(input.text ?? row.text, kind);
  if (!words.ok) return words;
  const textChanged = words.text !== row.text;
  const kindChanged = kind !== row.kind;
  if (!textChanged && !kindChanged) return { ok: true, id: row.id };
  // A rule is followed in every turn, so a change that makes one carries the
  // words it makes an instruction: the person has seen them.
  if (kindChanged && kind === "rules" && input.text === undefined) return { ok: false, error: "empty" };
  if (kindChanged && kind === "rules") {
    const rules = await active(trx, input.accountId).select(sql<number>`count(*)::int`.as("n")).where("kind", "=", "rules").executeTakeFirstOrThrow();
    if (rules.n >= RULES_CAP) return { ok: false, error: "rules_full" };
  }
  if (textChanged && (await saying(trx, input.accountId, words.text, row.id))) return { ok: false, error: "duplicate" };

  const learned = row.origin === "learned";
  const severed = row.origin === "answered" && textChanged;
  if (learned && row.derived_from_message_id) {
    await trx
      .insertInto("memory_forgotten")
      .values({ account_id: input.accountId, message_id: row.derived_from_message_id })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  await trx
    .updateTable("notes")
    .set({
      text: words.text,
      kind,
      origin: learned || severed ? "stated" : (row.origin as "stated" | "answered"),
      ...(learned ? { derived_from_message_id: null } : {}),
      ...(severed ? { calendar_id: null } : {}),
      attrs: severed
        ? sql`(attrs - 'with' - 'answered_in' - 'replaced') || '{"changed":"tab"}'::jsonb`
        : learned
          ? sql`(attrs - 'from_note') || '{"changed":"tab"}'::jsonb`
          : sql`attrs || '{"changed":"tab"}'::jsonb`,
      place_dx: null,
      place_dy: null,
      placed_at: null,
      // The vector of words the person removed goes with them.
      embedding: null,
      embedding_model: null,
      embedded_at: null,
      updated_at: sql`now()`,
    })
    .where("id", "=", row.id)
    .execute();
  return { ok: true, id: row.id };
}

export interface SourceThread {
  id: string;
  /** Null for the default thread, which the tab names as not in a thread. */
  name: string | null;
  notInAThread: boolean;
}

export type MemorySource =
  | { type: "message"; thread: SourceThread | null }
  | { type: "note"; thread: SourceThread | null }
  | { type: "answer"; question: string | null }
  | { type: "none" };

export interface ListedMemory extends Memory {
  updatedAt: Date;
  /** Changed in the tab: the editor says so instead of where it came from. */
  changed: boolean;
  source: MemorySource;
  place: { dx: number; dy: number } | null;
  /** 042. Remind me: on while a yearly date is reminded about, off once stopped. */
  reminders: "on" | "off" | null;
}

/** 040. Everything the tab shows, unpaginated: at most 300 by the cap. A
 *  source thread is named only while the account is in it, and **never a
 *  calendar's id or name**, which may be words somebody else gave it. */
export async function listMemories(
  accountId: string,
  trx: Executor = db,
): Promise<{
  memories: ListedMemory[];
  /** Where each kind's cloud sits, normalised, from last night's layout. */
  kinds: { kind: MemoryClass; x: number; y: number }[];
  full: boolean;
  rulesFull: boolean;
}> {
  const rows = await active(trx, accountId)
    .select(["id", "kind", "text", "origin", "created_at", "updated_at", "derived_from_message_id", "attrs", "place_dx", "place_dy"])
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
  const attrsOf = (row: (typeof rows)[number]) =>
    ((typeof row.attrs === "string" ? JSON.parse(row.attrs) : row.attrs) ?? {}) as Record<string, string | undefined>;

  const messageIds = [...new Set(rows.map((r) => r.derived_from_message_id).filter((id): id is string => id !== null))];
  const noteIds = [...new Set(rows.map((r) => attrsOf(r).from_note).filter((id): id is string => typeof id === "string"))];
  const answeredIn = [...new Set(rows.filter((r) => r.origin === "answered").map((r) => attrsOf(r).answered_in).filter((id): id is string => typeof id === "string"))];

  // The person's own messages only, and only while they exist.
  const messages = messageIds.length
    ? await trx
        .selectFrom("messages as m")
        .leftJoin("message_threads as mt", (j) => j.onRef("mt.message_id", "=", "m.id").on("mt.landed", "=", true))
        .select(["m.id", "m.looking_at_thread_id", "mt.thread_id"])
        .where("m.id", "in", messageIds)
        .where("m.account_id", "=", accountId)
        .where("m.deleted_at", "is", null)
        .orderBy("mt.thread_id")
        .execute()
    : [];
  const messageThread = new Map<string, string | null>();
  for (const m of messages) if (!messageThread.has(m.id) || !messageThread.get(m.id)) messageThread.set(m.id, m.thread_id ?? m.looking_at_thread_id);

  const notes = noteIds.length
    ? await trx
        .selectFrom("notes")
        .select(["id", "subject_id"])
        .where("id", "in", noteIds)
        .where("scope", "=", "thread")
        .where("account_id", "=", accountId)
        .where("deleted_at", "is", null)
        .execute()
    : [];
  const noteThread = new Map(notes.map((n) => [n.id, n.subject_id]));

  const questions = answeredIn.length
    ? await trx
        .selectFrom("questions")
        .select(["answered_message_id", "text"])
        .where("account_id", "=", accountId)
        .where("answered_message_id", "in", answeredIn)
        .execute()
    : [];
  // The question's own words, without the title it was filed with.
  const questionOf = new Map(questions.map((q) => [q.answered_message_id!, /Which calendar is shared with .+\?$/.exec(q.text)?.[0] ?? null]));

  const threadIds = [...new Set([...messageThread.values(), ...noteThread.values()].filter((id): id is string => !!id))];
  const threads = threadIds.length
    ? await trx
        .selectFrom("threads as t")
        .innerJoin("thread_members as tm", "tm.thread_id", "t.id")
        .select(["t.id", "t.name"])
        .where("t.id", "in", threadIds)
        .where("t.deleted_at", "is", null)
        .where("tm.account_id", "=", accountId)
        .where("tm.state", "=", "accepted")
        .execute()
    : [];
  const fallback = await trx.selectFrom("accounts").select("default_thread_id").where("id", "=", accountId).executeTakeFirst();
  const named = new Map(threads.map((t) => [t.id, t.name]));
  const threadOf = (id: string | null | undefined): SourceThread | null => {
    if (!id || !named.has(id)) return null;
    const loose = id === fallback?.default_thread_id;
    return { id, name: loose ? null : (named.get(id) ?? null), notInAThread: loose };
  };

  const reminders = await remindersOf(trx, "note", rows.map((row) => row.id), accountId);
  const memories = rows.map((row): ListedMemory => {
    const attrs = attrsOf(row);
    let source: MemorySource = { type: "none" };
    if (row.origin === "answered") source = { type: "answer", question: (attrs.answered_in && questionOf.get(attrs.answered_in)) || null };
    else if (attrs.from_note) source = { type: "note", thread: threadOf(noteThread.get(attrs.from_note)) };
    else if (row.derived_from_message_id) source = { type: "message", thread: threadOf(messageThread.get(row.derived_from_message_id)) };
    return {
      id: row.id,
      kind: row.kind as MemoryClass,
      text: row.text,
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      changed: attrs.changed === "tab",
      source,
      place: row.place_dx !== null && row.place_dy !== null ? { dx: row.place_dx, dy: row.place_dy } : null,
      reminders: reminders.get(row.id) ?? null,
    };
  });
  // 040. Placed tonight or not yet: one with no place sits beside its nearest.
  const placed = await placeOnRead(accountId, memories, trx);
  const kinds = await trx
    .selectFrom("memory_kind_places")
    .select(["kind", "x", "y"])
    .where("account_id", "=", accountId)
    .orderBy("kind")
    .execute();
  for (const memory of memories) memory.place ??= placed.get(memory.id) ?? null;
  return {
    memories,
    kinds: kinds.map((k) => ({ kind: k.kind as MemoryClass, x: k.x, y: k.y })),
    // The cap line: at 300 the pass learns nothing, whoever wrote the 300.
    full: memories.length >= MEMORY_CAP,
    rulesFull: memories.filter((m) => m.kind === "rules").length >= RULES_CAP,
  };
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
    .set({ superseded_at: sql`now()`, purge_after: sql`now() + make_interval(days => ${SUPERSEDED_PURGE_DAYS})`, updated_at: sql`now()` })
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
      .set({ superseded_at: null, purge_after: null, updated_at: sql`now()` })
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

/** Once a day for every account, active or quiet: a learned memory whose
 *  source is gone goes with it. A replaced memory carries its own thirty-day
 *  `purge_after` and goes with `content.purge`; the first update here is for
 *  one replaced before it did. */
export async function sweepMemories(trx: Executor = db): Promise<void> {
  await trx
    .updateTable("notes")
    .set({ deleted_at: sql`now()`, purge_after: sql`now()`, updated_at: sql`now()` })
    .where("scope", "=", "account")
    .where("deleted_at", "is", null)
    .where("superseded_at", "<", sql<Date>`now() - make_interval(days => ${SUPERSEDED_PURGE_DAYS})`)
    .execute();
  await trx
    .updateTable("notes")
    .set({ deleted_at: sql`now()`, purge_after: sql`now()`, updated_at: sql`now()` })
    .where("scope", "=", "account")
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
