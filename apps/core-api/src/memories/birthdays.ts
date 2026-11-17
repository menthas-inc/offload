// 051. A birthday or an anniversary is a memory, said or asked.
//
// 038 wrote a memory only on an explicit ask. A day that comes round every
// year about somebody is the one exception: it is a fact, it is what
// reminders are for, and as a row it sat in a thread forever. The exception
// is held to more than an asked memory, not less: every word of the sentence
// but the day in the person's own message, the day read on its own from both,
// and a turn that read another member's words refused outright (the caller
// checks that, with the rest of the taint).

import { sql } from "kysely";
import type { Executor } from "../threads/access.js";
import { OWN_BIRTHDAY, nameIsOwn } from "../notifications/labels.js";
import { daysIn, realDay, withoutDays } from "./dates.js";
import { everyWordHeard } from "./ground.js";
import { flat } from "./flat.js";
import { remember, SUPERSEDED_PURGE_DAYS } from "./store.js";
import { enqueue, PRIORITY } from "../jobs/queue.js";

type Kept = { ok: true; id: string };
type Refusal = { ok: false; error: "not_their_words" | "bad_date" | Exclude<Awaited<ReturnType<typeof remember>>, { ok: true }>["error"] };

/** The short name a reminder and a calendar call it by: words of the
 *  sentence's own that say whose day it is, or nothing. */
export function nameFor(name: string | null | undefined, text: string): string | null {
  if (!name) return null;
  const clean = name.replace(/\s+/g, " ").trim();
  return /\b(birthday|anniversary)\b/i.test(clean) && nameIsOwn(clean, text) ? clean : null;
}

/** "Born on", "bday" and "married on" say birthday and anniversary, so the
 *  memory may use the plain word without it counting as one they did not say. */
function saidPlainly(said: string): string {
  const born = /\b(born|b-?day|bday)\b/i.test(said) ? " birthday" : "";
  const wed = /\b(married|wedding)\b/i.test(said) ? " anniversary" : "";
  return said + born + wed;
}

export async function rememberDay(
  trx: Executor,
  input: { accountId: string; messageId: string; said: string; text: string; kind: string; on: string; name?: string | null | undefined },
): Promise<Kept | Refusal> {
  if (input.kind !== "people" && input.kind !== "about") return { ok: false, error: "not_their_words" };
  if (!realDay(input.on)) return { ok: false, error: "bad_date" };
  // The day the memory says is the day on the call, and they said it.
  if (daysIn(input.text)[0] !== input.on || !daysIn(input.said).includes(input.on)) return { ok: false, error: "bad_date" };
  if (!everyWordHeard(withoutDays(input.text), saidPlainly(input.said))) return { ok: false, error: "not_their_words" };

  const own = input.kind === "about" && OWN_BIRTHDAY.test(input.text);
  const name = own ? null : nameFor(input.name, input.text);

  let replaced: string[] = [];
  if (name) {
    // Held already under this name: the same day is the same memory, another
    // day is a correction and the old one is set aside.
    const held = await trx
      .selectFrom("notes as n")
      .innerJoin("reminder_labels as l", "l.note_id", "n.id")
      .select(["n.id", "l.name", "l.yearly_on"])
      .where("n.account_id", "=", input.accountId)
      .where("n.scope", "=", "account")
      .where("n.deleted_at", "is", null)
      .where("n.superseded_at", "is", null)
      .where("l.name", "is not", null)
      .execute();
    const same = held.filter((row) => flat(row.name!) === flat(name));
    const already = same.find((row) => row.yearly_on === input.on);
    if (already) {
      // Said again: this turn remembered it too, and draws its Done.
      await trx.updateTable("notes").set({ attrs: sql`coalesce(attrs, '{}'::jsonb) || jsonb_build_object('day_message', ${input.messageId}::text)` }).where("id", "=", already.id).execute();
      return { ok: true, id: already.id };
    }
    if (same.length > 0) {
      await trx
        .updateTable("notes")
        .set({ superseded_at: sql`now()`, purge_after: sql`now() + make_interval(days => ${SUPERSEDED_PURGE_DAYS})`, updated_at: sql`now()` })
        .where("id", "in", same.map((row) => row.id))
        .execute();
      replaced = same.map((row) => row.id);
    }
  }

  const kept = await remember(trx, { accountId: input.accountId, messageId: input.messageId, text: input.text, kind: input.kind });
  if (!kept.ok) return kept;
  // What it replaced, so the turn's Undo can put it back (`undoCorrections`).
  if (replaced.length > 0) {
    await trx.updateTable("notes").set({ attrs: sql`coalesce(attrs, '{}'::jsonb) || jsonb_build_object('replaced', ${replaced[0]}::text)` }).where("id", "=", kept.id).execute();
  }
  // A corrected day keeps its one event: carried to the new memory and moved.
  await carryEvent(trx, { accountId: input.accountId, from: replaced, to: kept.id, on: input.on });
  // Marked as a day the turn filed, which is what draws the turn's Done: a
  // memory has no thread to put a pill on (`threadsFor`).
  await trx.updateTable("notes").set({ attrs: sql`coalesce(attrs, '{}'::jsonb) || jsonb_build_object('day', ${input.on}::text)` }).where("id", "=", kept.id).execute();
  if (!own) await labelMemoryNow(trx, { accountId: input.accountId, noteId: kept.id, on: input.on, name });
  return { ok: true, id: kept.id };
}

/** 042's label for a memory, from the turn rather than the night: the date is
 *  what the person said, and the fingerprint marks it read for these words,
 *  so the memory pass looks at it again only once they change. */
async function labelMemoryNow(trx: Executor, input: { accountId: string; noteId: string; on: string; name: string | null }): Promise<void> {
  const values = {
    kind: "occasion",
    lead: "days",
    yearly_on: input.on,
    name: input.name,
    fingerprint: sql<string>`(select note_fingerprint(n) from notes n where n.id = ${input.noteId}::uuid)`,
    labelled_at: sql<Date>`now()`,
  };
  await trx
    .insertInto("reminder_labels")
    .values({ account_id: input.accountId, note_id: input.noteId, date_set_at: sql<Date>`now()`, ...values } as never)
    .onConflict((oc) => oc.column("note_id").where("note_id", "is not", null).doUpdateSet(values as never))
    .execute();
}

/** 051. An event belongs to one live memory. A memory set aside for another
 *  (a corrected day, the pass's supersede or fold) hands its event on, and a
 *  new day moves it there. An event it only found is let go instead: it was
 *  on the old day, and it is theirs. */
export async function carryEvent(trx: Executor, input: { accountId: string; from: string[]; to: string; on: string | null }): Promise<void> {
  if (input.from.length === 0) return;
  const linked = await trx
    .selectFrom("notes")
    .select(["id", "event_ref", sql<boolean>`coalesce((attrs ->> 'event_found')::boolean, false)`.as("found"), sql<string | null>`attrs ->> 'event_message'`.as("by")])
    .where("id", "in", input.from)
    .where("account_id", "=", input.accountId)
    .where("event_ref", "is not", null)
    .execute();
  const first = linked[0];
  if (!first?.event_ref) return;
  await trx.updateTable("notes").set({ event_ref: null, attrs: sql`attrs - 'event_found' - 'event_message'` }).where("id", "in", linked.map((row) => row.id)).execute();
  if (first.found) return;
  await trx
    .updateTable("notes")
    .set({ event_ref: first.event_ref, attrs: sql`coalesce(attrs, '{}'::jsonb) || jsonb_build_object('event_message', ${first.by}::text)` })
    .where("id", "=", input.to)
    .where("event_ref", "is", null)
    .execute();
  if (input.on) {
    await enqueue({ kind: "memory.event", accountId: input.accountId, payload: { noteId: input.to, accountId: input.accountId, action: "move", on: input.on }, priority: PRIORITY.background, tx: trx });
  }
}

/** 051. The turn's Undo of a corrected day: the memory it replaced is current
 *  again, and takes its event back to its own day. The new memory itself goes
 *  with the turn's notes, as any memory the turn wrote does. */
export async function undoCorrections(trx: Executor, accountId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const corrected = await trx
    .selectFrom("notes")
    .select(["id", sql<string>`attrs ->> 'replaced'`.as("replaced")])
    .where("account_id", "=", accountId)
    .where("scope", "=", "account")
    .where("derived_from_message_id", "in", messageIds)
    .where(sql<boolean>`attrs ? 'replaced'`)
    .execute();
  for (const row of corrected) {
    await trx
      .updateTable("notes")
      .set({ superseded_at: null, purge_after: null, updated_at: sql`now()` })
      .where("id", "=", row.replaced)
      .where("account_id", "=", accountId)
      .where("deleted_at", "is", null)
      .execute();
    const day = await trx.selectFrom("reminder_labels").select("yearly_on").where("note_id", "=", row.replaced).executeTakeFirst();
    await carryEvent(trx, { accountId, from: [row.id], to: row.replaced, on: day?.yearly_on ?? null });
  }
}
