// 051. A birthday the turn remembered goes on a calendar, with no row.
//
// Run after the turn's transaction has committed: the memory is a row the
// write's own connection has to see, and Google is never called from inside a
// transaction (`readAround`). Every decision is the server's; the model passes
// only the words they used for a calendar, if any.

import { sql } from "kysely";
import { db } from "../db.js";
import type { Executor } from "../threads/access.js";
import { flat } from "./flat.js";
import { daysIn } from "./dates.js";
import { nameFor } from "./birthdays.js";
import { OWN_BIRTHDAY } from "../notifications/labels.js";
import { approvedWritable, calendarsNamed, turnScope, type ScopedCalendar } from "../threads/calendars.js";
import { writeThroughTool } from "../connectors/tool-calls.js";
import { targetFor, undoWrite } from "../connectors/write.js";
import { FORGET_PURGE_MINUTES } from "./store.js";
import { raiseCalendarQuestion } from "../questions.js";

export type DayCalendar = "written" | "asked" | "waiting" | "noCalendar" | "refused" | null;

/** The next time `MM-DD` comes round, from today in UTC, as Google keeps an
 *  all-day day: midnight UTC. 29 February waits for a year that has one. */
export function nextOccurrence(on: string, now: Date = new Date()): Date {
  const [month, day] = on.split("-").map(Number) as [number, number];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let year = now.getUTCFullYear(); ; year += 1) {
    const at = Date.UTC(year, month - 1, day);
    if (new Date(at).getUTCMonth() === month - 1 && at >= today) return new Date(at);
  }
}

/** An event of the person's own already on that day, repeating, with every
 *  word of the name in its title, on any calendar of theirs offload reads:
 *  Google's own Birthdays calendar is read-only and is where many already are.
 *  The copy holds instances, not rules, so how often it repeats is not known. */
async function alreadyThere(accountId: string, name: string, day: Date): Promise<string | null> {
  const scope = (await turnScope(accountId, null)).filter((calendar) => calendar.yours);
  if (scope.length === 0) return null;
  const rows = await db
    .selectFrom("connector_events as e")
    .innerJoin("connector_calendars as c", "c.id", "e.calendar_id")
    .select(["c.external_id as external", "e.series_ref as series", "e.title"])
    .where("e.calendar_id", "in", scope.map((calendar) => calendar.id))
    .where("e.deleted_at", "is", null)
    .where("e.series_ref", "is not", null)
    .where("e.occurs_at", ">=", day)
    .where("e.occurs_at", "<", new Date(day.getTime() + 86_400_000))
    .where(sql<boolean>`(e.created_by_me is true or e.invited_me is true or (e.created_by_me is null and e.invited_me is null))`)
    .execute();
  const wanted = flat(name).split(" ").filter((word) => word.length > 1);
  const hit = rows.find((row) => {
    const title = new Set(flat(row.title).split(" "));
    return wanted.every((word) => title.has(word));
  });
  return hit ? `${hit.external}:${hit.series}` : null;
}

export async function dayOnCalendar(input: {
  accountId: string;
  messageId: string;
  noteId: string;
  /** Their words for a calendar, "any" for one they asked for unnamed, or nothing. */
  calendar: string | null | undefined;
  /** The short name on the call, used only for their own birthday. */
  name?: string | null | undefined;
  sawApps: boolean;
}): Promise<DayCalendar> {
  const memory = await db
    .selectFrom("notes as n")
    .leftJoin("reminder_labels as l", "l.note_id", "n.id")
    .select(["n.id", "n.kind", "n.text", "n.event_ref", "n.derived_from_message_id", "l.name", "l.yearly_on"])
    .where("n.id", "=", input.noteId)
    .where("n.account_id", "=", input.accountId)
    .where("n.scope", "=", "account")
    .where("n.deleted_at", "is", null)
    .executeTakeFirst();
  if (!memory || memory.event_ref) return null;

  const asked = Boolean(input.calendar);
  const own = memory.kind === "about" && OWN_BIRTHDAY.test(memory.text);
  // Their own birthday, and one remembered on an earlier day, only when asked.
  if ((own || memory.derived_from_message_id !== input.messageId) && !asked) return null;

  // Their own birthday has no reminder label (nobody is reminded of their
  // own), so its day is read from its words and its name from the call.
  const on = memory.yearly_on ?? (own ? (daysIn(memory.text)[0] ?? null) : null);
  const name = memory.name ?? (own ? nameFor(input.name, memory.text) : null);
  if (!name || !on) return null;
  const day = nextOccurrence(on);

  const found = await alreadyThere(input.accountId, name, day);
  if (found) {
    await db
      .updateTable("notes")
      .set({ event_ref: found, attrs: sql`coalesce(attrs, '{}'::jsonb) || jsonb_build_object('event_found', true, 'event_message', ${input.messageId}::text)`, updated_at: sql`now()` })
      .where("id", "=", memory.id)
      .where("event_ref", "is", null)
      .execute();
    return null;
  }

  const approved = await approvedWritable(input.accountId);
  if (approved.length === 0) return asked ? "noCalendar" : null;

  const named = input.calendar && input.calendar !== "any" ? await calendarsNamed(input.accountId, input.calendar, approved) : null;
  const byName = (a: ScopedCalendar, b: ScopedCalendar) => a.name.localeCompare(b.name);
  const target = named?.named
    ? named.matches.length === 1
      ? named.matches[0]
      : undefined
    : (approved.find((calendar) => calendar.primary) ?? [...approved].sort(byName)[0]);

  if (!target) {
    const offered = named && named.matches.length > 1 ? named.matches : approved;
    const raised = await db.transaction().execute((trx) =>
      raiseCalendarQuestion(trx, {
        accountId: input.accountId,
        messageId: input.messageId,
        noteId: memory.id,
        title: name,
        calendars: offered.slice(0, 4),
        onAnswer: "write",
        sawApps: input.sawApps,
      }),
    );
    return raised ? "asked" : null;
  }

  const outcome = await writeThroughTool(
    input.accountId,
    target.id,
    {
      action: "create",
      draft: {
        title: name,
        startsAt: day,
        endsAt: new Date(day.getTime() + 86_400_000),
        allDay: true,
        location: null,
        attendees: [],
        recurrence: ["RRULE:FREQ=YEARLY"],
      },
    },
    input.messageId,
    null,
    { noteId: memory.id },
  );
  if (outcome.kind === "refused") return "refused";
  return outcome.kind === "written" ? "written" : "waiting";
}

/** 051. The job behind a memory's event: delete it once a forget's Undo has
 *  closed. Read again here rather than trusted from the payload: a memory
 *  brought back, or forgotten again since, is the newer word. An event it
 *  found is the person's own and is only let go. Any refusal or failure from
 *  Google ends it quietly, the link dropped, as a forget should never fail. */
export async function memoryEvent(payload: { noteId?: unknown; accountId?: unknown; action?: unknown; on?: unknown }): Promise<void> {
  if (typeof payload.noteId !== "string" || typeof payload.accountId !== "string") return;
  const note = await db
    .selectFrom("notes")
    .select(["id", "account_id", "event_ref", "deleted_at", sql<boolean>`coalesce((attrs ->> 'event_found')::boolean, false)`.as("found")])
    .where("id", "=", payload.noteId)
    .where("account_id", "=", payload.accountId)
    .where("scope", "=", "account")
    .executeTakeFirst();
  if (!note?.event_ref) return;
  if (payload.action === "forget") {
    const closed = note.deleted_at !== null && note.deleted_at.getTime() <= Date.now() - FORGET_PURGE_MINUTES * 60_000 + 5_000;
    if (!closed) return;
  }
  const ref = note.event_ref;
  const unlink = () =>
    db.updateTable("notes").set({ event_ref: null, attrs: sql`attrs - 'event_found' - 'event_message'` }).where("id", "=", note.id).where("event_ref", "=", ref).execute();
  // Only a forget deletes (OFF-6's allowlist). A memory whose words lost
  // their day lets its event go and leaves it on the calendar.
  if (note.found || payload.action === "undate") {
    await unlink();
    return;
  }
  const target = note.account_id ? await targetOfRef(note.account_id, ref) : null;
  // A new day: the series' master moves, and every year with it.
  if (payload.action === "move" && typeof payload.on === "string" && target && note.account_id) {
    const day = nextOccurrence(payload.on);
    const moved = await writeThroughTool(note.account_id, target.calendarId, { action: "edit", sourceRef: ref, scope: "one", patch: { startsAt: day, endsAt: new Date(day.getTime() + 86_400_000), allDay: true } }, null).catch(() => null);
    if (moved?.kind === "written") return;
    await unlink();
    return;
  }
  if (target) await undoWrite(target, ref).catch(() => false);
  await unlink();
  console.log(JSON.stringify({ level: "info", msg: "memory event", action: payload.action, outcome: target ? "deleted" : "unlinked" }));
}

/** The calendar a source ref lives on, among the account's own: the ref's
 *  prefix is the calendar's external id, as the turn's Undo reads it. */
async function targetOfRef(accountId: string, ref: string) {
  const externalId = ref.split(":")[0];
  if (!externalId) return null;
  const calendar = await db
    .selectFrom("connector_calendars as c")
    .innerJoin("connector_connections as n", "n.id", "c.connection_id")
    .select("c.id")
    .where("c.external_id", "=", externalId)
    .where("n.account_id", "=", accountId)
    .where("n.deleted_at", "is", null)
    .executeTakeFirst();
  return calendar ? targetFor(calendar.id, accountId) : null;
}

/** 051. Calendars offload can no longer read, unticked or disconnected: the
 *  memories on them let their events go, and stay. */
export async function unlinkCalendars(trx: Executor, accountId: string, externalIds: string[]): Promise<void> {
  if (externalIds.length === 0) return;
  await trx
    .updateTable("notes")
    .set({ event_ref: null, attrs: sql`attrs - 'event_found'` })
    .where("account_id", "=", accountId)
    .where("event_ref", "is not", null)
    .where(sql<string>`split_part(event_ref, ':', 1)`, "in", externalIds)
    .execute();
}
