// 052. A reply's pills: what the dump left out, as one tap.
//
// Chosen here, from the turn's record and the reader's own state, never by the
// model; worded by the client from the kind. The tap route runs this again for
// its turn and acts only on what it returns, so a target never comes from the
// client (SEC-2). Words somebody else wrote never lead to a share (SEC-1).

import { sql } from "kysely";
import { db } from "../db.js";
import { approvedWritable } from "../threads/calendars.js";
import { connectionsOf } from "../people/access.js";

export type PillKind = "date" | "calendar" | "remind" | "share" | "directions";
export interface Pill {
  kind: PillKind;
  rowId?: string;
  calendar?: { id: string; name: string; colour: string | null };
  person?: { accountId: string; name: string };
}

const ORDER: PillKind[] = ["date", "calendar", "remind", "share", "directions"];
const MAX_PILLS = 2;

/** A whole word of `text`, any case. */
function says(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export async function pillsFor(accountId: string, turns: { turnId: string; personIds: string[] }[]): Promise<Map<string, Pill[]>> {
  const out = new Map<string, Pill[]>();
  const personIds = turns.flatMap((t) => t.personIds);
  if (personIds.length === 0) return out;

  const [made, threadsMade, open, dumps] = await Promise.all([
    db
      .selectFrom("content")
      // Only rows in threads the reader is in now: a thread they left offers nothing.
      .innerJoin("thread_members as tm", (join) =>
        join.onRef("tm.thread_id", "=", "content.thread_id").on("tm.account_id", "=", accountId).on("tm.state", "=", "accepted"),
      )
      .leftJoin("places", "places.id", "content.place_id")
      .select([
        "content.id as id",
        "content.derived_from_message_id as messageId",
        "content.account_id as accountId",
        "content.thread_id as threadId",
        "content.type as type",
        "content.due_at as dueAt",
        "content.occurs_at as occursAt",
        "content.done_at as doneAt",
        "content.source_ref as sourceRef",
        "content.is_reminder as isReminder",
        "content.attrs as attrs",
        "places.lat as lat",
      ])
      .where("content.derived_from_message_id", "in", personIds)
      .where("content.account_id", "=", accountId)
      .where("content.deleted_at", "is", null)
      .execute(),
    db
      .selectFrom("turn_changes")
      .select(["message_id as messageId", "target_id as threadId"])
      .where("message_id", "in", personIds)
      .where("tool", "=", "create_thread")
      .execute(),
    db
      .selectFrom("questions")
      .select("message_id as messageId")
      .where("message_id", "in", personIds)
      .where("state", "in", ["pending", "open"])
      .execute(),
    db
      .selectFrom("messages")
      .select(["id", "text", "source", "derived_from_untrusted as untrusted"])
      .where("id", "in", personIds)
      .execute(),
  ]);

  // Only fetched when some turn could use them.
  const needCalendars = made.some((r) => (r.occursAt || r.dueAt) && !r.sourceRef);
  const writable = needCalendars ? (await approvedWritable(accountId)).filter((c) => c.yours && c.writable) : [];
  const colour = writable.length === 1 ? await calendarColour(writable[0]!.id) : null;
  const needPeople = threadsMade.length > 0;
  const people = needPeople ? await connectionsOf(accountId) : [];
  const dated = made.filter((r) => r.occursAt || r.dueAt);
  const alone = await threadsWithOneMember(dated.map((r) => r.threadId));

  for (const { turnId, personIds: ids } of turns) {
    const mine = (id: string | null) => !!id && ids.includes(id);
    if (open.some((q) => mine(q.messageId))) {
      out.set(turnId, []);
      continue;
    }
    const rows = made.filter((r) => mine(r.messageId));
    const found: Pill[] = [];

    const undated = rows.filter((r) => r.type === "task" && !r.dueAt && !r.occursAt && !r.doneAt);
    if (undated.length === 1) found.push({ kind: "date", rowId: undated[0]!.id });

    const timed = rows.filter((r) => (r.occursAt || r.dueAt) && !r.sourceRef && !allDay(r.attrs));
    if (timed.length === 1 && writable.length === 1) {
      const cal = writable[0]!;
      found.push({ kind: "calendar", rowId: timed[0]!.id, calendar: { id: cal.id, name: cal.name, colour } });
    }

    const remindable = rows.filter((r) => (r.occursAt || r.dueAt) && r.accountId === accountId && !r.isReminder && !r.doneAt);
    if (remindable.length === 1 && alone.has(remindable[0]!.threadId)) found.push({ kind: "remind", rowId: remindable[0]!.id });

    const dump = dumps.find((d) => mine(d.id) && d.text);
    const madeThread = threadsMade.some((t) => mine(t.messageId));
    if (madeThread && dump && dump.source === "person" && !dump.untrusted) {
      const named = people.filter((p) => {
        const name = p.displayName?.trim();
        if (!name) return false;
        const first = name.split(/\s+/)[0]!;
        return says(dump.text!, name) || says(dump.text!, first);
      });
      if (named.length === 1) found.push({ kind: "share", person: { accountId: named[0]!.accountId, name: named[0]!.displayName! } });
    }

    if (rows.length === 1 && rows[0]!.lat != null) found.push({ kind: "directions", rowId: rows[0]!.id });

    found.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    out.set(turnId, found.slice(0, MAX_PILLS));
  }
  return out;
}

const allDay = (attrs: unknown): boolean =>
  typeof attrs === "object" && attrs !== null && (attrs as Record<string, unknown>)["all_day"] === true;

async function calendarColour(calendarId: string): Promise<string | null> {
  const row = await db.selectFrom("connector_calendars").select("colour").where("id", "=", calendarId).executeTakeFirst();
  return row?.colour ?? null;
}

/** The threads among these with exactly one accepted member. */
async function threadsWithOneMember(threadIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(threadIds)];
  if (unique.length === 0) return new Set();
  const rows = await sql<{ thread_id: string }>`
    select thread_id::text as thread_id from thread_members
    where thread_id = any(${unique}::uuid[]) and state = 'accepted'
    group by thread_id having count(*) = 1`.execute(db);
  return new Set(rows.rows.map((r) => r.thread_id));
}
