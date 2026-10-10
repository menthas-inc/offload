// 038. The nightly memory pass, on the Core API's side: what it may be shown,
// and what it may write. The worker reads the same sets to build the prompt;
// this re-derives them before anything is applied, because a prompt is a
// request and this is the enforcement (the 032 pattern).

import { memoriesToDate } from "../notifications/labels.js";
import { sql } from "kysely";
import type { Executor } from "../threads/access.js";
import type { MemoryClass } from "../schema.js";
import { touchesSensitive } from "./sensitive.js";
import { MEMORY_CAP } from "@offload/widgets";
import { LEARNED_MEMORY_CAP, shaped } from "./store.js";

/** What a pass reads, at most (OFF-8). */
export const PASS_MESSAGES = 60;
export const PASS_MESSAGE_CHARS = 500;
export const PASS_NOTES = 40;
/** How many it may add in a night. */
export const PASS_ADDS = 5;

/** How far back a pass reads: since the last one, a day for the first, never
 *  more than a week, so a missed night loses nothing. */
const since = (accountId: string) => sql<Date>`greatest(
  coalesce((select a.memories_at from accounts a where a.id = ${accountId}), now() - interval '25 hours'),
  now() - interval '7 days'
)`;

/** The person's own messages a pass may read: typed, spoken or shared,
 *  questions included; never mail, a calendar, the browser, anything untrusted,
 *  anybody else's or offload's; never one a forgotten memory came from. */
export function passMessages(trx: Executor, accountId: string) {
  return trx
    .selectFrom("messages as m")
    .where("m.account_id", "=", accountId)
    .where("m.role", "=", "person")
    .where("m.source", "not in", ["mail", "gmail", "calendar", "browser"])
    .where("m.derived_from_untrusted", "=", false)
    .where("m.deleted_at", "is", null)
    .where(sql<boolean>`said(m.text, m.transcript) is not null`)
    .where(sql<boolean>`m.created_at > ${since(accountId)}`)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("memory_forgotten as f")
            .select("f.message_id")
            .whereRef("f.message_id", "=", "m.id")
            .where("f.account_id", "=", accountId),
        ),
      ),
    );
}

/** Whether there is anything for a pass to read tonight. */
export async function passOwed(trx: Executor, accountId: string): Promise<boolean> {
  const one = await passMessages(trx, accountId).select("m.id").limit(1).executeTakeFirst();
  if (one !== undefined) return true;
  // 042. A memory nobody has dated yet, or whose words changed since.
  return (await memoriesToDate(trx, accountId)).length > 0;
}

/** The person's own active thread notes a pass may read, newest first: the
 *  evidence a pattern needs, which a week of messages cannot hold. Never
 *  another member's, never one marked untrusted, never one muted, and never
 *  one in a thread somebody else is in, where a note of theirs may be a
 *  summary of another member's words. */
export function passNotes(trx: Executor, accountId: string) {
  return trx
    .selectFrom("notes as n")
    .where("n.scope", "=", "thread")
    .where("n.account_id", "=", accountId)
    .where("n.derived_from_untrusted", "=", false)
    .where("n.deleted_at", "is", null)
    .where("n.superseded_at", "is", null)
    .where("n.muted_at", "is", null)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("thread_members as tm")
          .select("tm.thread_id")
          .whereRef("tm.thread_id", "=", "n.subject_id")
          .where("tm.account_id", "=", accountId)
          .where("tm.state", "=", "accepted"),
      ),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("thread_members as other")
            .select("other.thread_id")
            .whereRef("other.thread_id", "=", "n.subject_id")
            .where("other.account_id", "<>", accountId)
            .where("other.state", "=", "accepted"),
        ),
      ),
    );
}

export interface PassPlan {
  add: { kind: Exclude<MemoryClass, "rules">; text: string; cites: string }[];
  supersede: { id: string; text: string; cites: string }[];
  fold: { ids: string[]; text: string }[];
}

export interface PassApplied {
  added: number;
  superseded: number;
  folded: number;
  ignored: number;
}

/** Apply a pass's answer. Each entry checked on its own; one that fails is
 *  dropped and the rest apply. */
export async function applyMemoryPass(trx: Executor, accountId: string, plan: PassPlan): Promise<PassApplied> {
  const messages = new Map(
    (
      await passMessages(trx, accountId)
        .select(["m.id", "m.created_at"])
        .orderBy("m.created_at", "desc")
        .limit(PASS_MESSAGES)
        .execute()
    ).map((row) => [row.id, row.created_at]),
  );
  const notes = new Map(
    (
      await passNotes(trx, accountId)
        .select(["n.id", "n.created_at", "n.derived_from_message_id"])
        .orderBy("n.updated_at", "desc")
        .limit(PASS_NOTES)
        .execute()
    ).map((row) => [row.id, row]),
  );
  const held = await trx
    .selectFrom("notes")
    .select(["id", "origin", "kind", "text", "created_at", "derived_from_message_id", "attrs"])
    .where("scope", "=", "account")
    .where("subject_id", "=", accountId)
    .where("deleted_at", "is", null)
    .where("superseded_at", "is", null)
    .execute();
  const byId = new Map(held.map((row) => [row.id, row]));
  // When each of the person's own was said, which a later word has to follow.
  const sources = held.map((row) => row.derived_from_message_id).filter((id): id is string => id !== null);
  const spoken = new Map(
    sources.length
      ? (await trx.selectFrom("messages").select(["id", "created_at"]).where("id", "in", sources).execute()).map((row) => [row.id, row.created_at])
      : [],
  );
  const saidAt = new Map(
    held.flatMap((row) => {
      const at = row.derived_from_message_id ? spoken.get(row.derived_from_message_id) : undefined;
      return at ? [[row.id, at] as const] : [];
    }),
  );
  const said = new Set(held.map((row) => row.text.trim().toLowerCase()));
  let learned = held.filter((row) => row.origin === "learned").length;
  // 040. A pass never makes room: at 300 it adds nothing, and only a person's
  // own add retires the oldest learned.
  let active = held.length;

  const out: PassApplied = { added: 0, superseded: 0, folded: 0, ignored: 0 };

  /** A citation it was shown, as the source columns a memory carries. */
  const source = (cites: string): { messageId: string | null; fromNote: string | null; at: Date } | null => {
    const at = messages.get(cites);
    if (at) return { messageId: cites, fromNote: null, at };
    const note = notes.get(cites);
    if (note) return { messageId: note.derived_from_message_id, fromNote: note.id, at: note.created_at };
    return null;
  };

  const write = async (kind: MemoryClass, text: string, from: { messageId: string | null; fromNote: string | null }) => {
    const row = await trx
      .insertInto("notes")
      .values({
        account_id: accountId,
        scope: "account",
        subject_id: accountId,
        kind,
        text,
        origin: "learned",
        derived_from_message_id: from.messageId,
        attrs: JSON.stringify(from.fromNote ? { from_note: from.fromNote } : {}),
      })
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
    return row !== undefined;
  };

  // Set aside by an earlier entry of this same plan: not there to touch again.
  const retired = new Set<string>();
  const retire = (ids: string[]) => {
    for (const id of ids) retired.add(id);
    return trx
      .updateTable("notes")
      .set({ superseded_at: sql`now()`, updated_at: sql`now()` })
      .where("id", "in", ids)
      .where("scope", "=", "account")
      .where("subject_id", "=", accountId)
      .execute();
  };

  for (const entry of plan.add.slice(0, PASS_ADDS)) {
    const words = shaped(entry.text, entry.kind);
    const from = source(entry.cites);
    if (!words.ok || !from || touchesSensitive(words.text) || said.has(words.text.toLowerCase()) || learned >= LEARNED_MEMORY_CAP || active >= MEMORY_CAP) {
      out.ignored += 1;
      continue;
    }
    if (!(await write(entry.kind, words.text, from))) {
      out.ignored += 1;
      continue;
    }
    said.add(words.text.toLowerCase());
    learned += 1;
    active += 1;
    out.added += 1;
  }

  for (const entry of plan.supersede) {
    const old = retired.has(entry.id) ? undefined : byId.get(entry.id);
    const from = source(entry.cites);
    const kind = old?.kind as MemoryClass | undefined;
    const words = kind ? shaped(entry.text, kind) : null;
    // The person's own, asked for, only on a later word of theirs; an answered
    // one only by a new answer, since it carries the calendar.
    const theirs = old?.origin === "stated";
    const ok =
      old &&
      kind &&
      kind !== "rules" &&
      old.origin !== "answered" &&
      words?.ok &&
      from &&
      !touchesSensitive(words.text) &&
      (!theirs || (from.messageId !== null && from.fromNote === null && from.at > (saidAt.get(old.id) ?? old.created_at)));
    if (!ok || !words?.ok) {
      out.ignored += 1;
      continue;
    }
    await retire([old.id]);
    said.delete(old.text.trim().toLowerCase());
    if (await write(kind!, words.text, from!)) {
      said.add(words.text.toLowerCase());
      out.superseded += 1;
    } else {
      out.ignored += 1;
    }
  }

  for (const entry of plan.fold) {
    const olds = entry.ids.map((id) => byId.get(id));
    // Offload's own only: two of the person's sentences are theirs to merge.
    if (olds.length < 2 || olds.some((old) => !old || old.origin !== "learned" || retired.has(old.id))) {
      out.ignored += 1;
      continue;
    }
    const first = olds[0]!;
    const kind = first.kind as MemoryClass;
    const words = shaped(entry.text, kind);
    if (!words.ok || touchesSensitive(words.text)) {
      out.ignored += 1;
      continue;
    }
    await retire(olds.map((old) => old!.id));
    for (const old of olds) said.delete(old!.text.trim().toLowerCase());
    const attrs = (typeof first.attrs === "string" ? JSON.parse(first.attrs) : first.attrs) as { from_note?: string } | null;
    if (await write(kind, words.text, { messageId: first.derived_from_message_id, fromNote: attrs?.from_note ?? null })) {
      said.add(words.text.toLowerCase());
      learned -= olds.length - 1;
      active -= olds.length - 1;
      out.folded += 1;
    }
  }

  return out;
}
