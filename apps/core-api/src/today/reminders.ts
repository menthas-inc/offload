// 042. Today's Reminders section: the home of what Coming up names.
//
// Every thing of the person's whose reminders have begun and whose day has
// not passed: from the moment its first reminder at their How many was due,
// to the end of its day. It follows the table whether Reminders is on or off
// on the Notifications page, so somebody who wants no notifications still sees
// what is coming; stopping a thing takes it off. A row Your day draws for
// today is not repeated here.
//
// Drawn as a column since 2026-10-11: each entry says which of its reminders
// is showing (its window) and the day its next one comes, so the x on the
// card can **dismiss that reminder and nothing else** (the owner): a birthday
// dismissed a month out comes back a week out. A dismiss is a row of ids, a
// day and a window, never a write to Remind me. The column shows everything
// that has begun; `more` is always 0 and stays for phones built before this.

import { dayIn } from "@offload/widgets";
import { z } from "zod";
import { db } from "../db.js";
import { reminderName } from "../notifications/copy.js";
import { clockOf, placed, type Candidate, type Placed } from "../notifications/reminders.js";
import type { Slot } from "../notifications/plan.js";
import { agendaQuery, agendaRow, shapeRows, type AgendaRaw } from "./rows.js";

export const WINDOWS = ["long", "short", "day"] as const;
const windowName = z.enum(WINDOWS);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const showing = {
  /** Which of the thing's reminders is showing: the last one that has begun. */
  window: windowName,
  /** The day its next reminder comes, or null when this is its last. */
  next: z.string().nullable(),
};

export const remindersRow = agendaRow.extend({
  /** The day it is reminded against: its own, or the day before what it is for. */
  remindDay: z.string(),
  /** "by" rather than "on": a deadline, or a task that belongs to something. */
  remindBy: z.boolean(),
  ...showing,
});

export const remindersOther = z.object({
  of: z.enum(["note", "memory"]),
  id: z.string(),
  name: z.string(),
  day: z.string(),
  by: z.boolean(),
  /** `HH:MM` in the account's zone when the thing has a clock time. */
  time: z.string().nullable(),
  threadId: z.string().nullable(),
  threadName: z.string().nullable(),
  threadIcon: z.string().nullable(),
  threadHue: z.number().nullable(),
  ...showing,
});

export const remindersResponse = z.object({
  rows: z.array(remindersRow),
  others: z.array(remindersOther),
  /** Always 0 since 2026-10-11: the column shows everything that has begun. */
  more: z.number(),
});

/** One reminder, as the screen that showed it names it. */
export const dismissal = z
  .object({
    of: z.enum(["content", "note", "memory"]),
    id: z.string().uuid(),
    day: z.string().regex(DAY).refine((day) => !Number.isNaN(Date.parse(`${day}T12:00:00Z`)), "not a day"),
    window: windowName,
  })
  .strict();
export type Dismissal = z.infer<typeof dismissal>;

interface Begun {
  candidate: Candidate;
  /** The reminder showing: the last that has begun. */
  slot: Slot;
  /** The first still to come. */
  next: Slot | null;
}

const dayOf = (slot: Slot, zone: string): string => (slot.at === "send" ? slot.day : dayIn(slot.instant, zone));
const keyOf = (of: Candidate["of"], id: string, occurrence: string, window: string): string => `${of === "content" ? "c" : "n"}:${id}:${occurrence}:${window}`;

/** Everything of the account's that is showing on Today: begun, not ended,
 *  not Your day's, nearest first. Dismissals are not applied here, so a
 *  dismiss can find what it is dismissing. */
async function begunOf(accountId: string, now: Date, zone: string, all: Placed[]): Promise<Begun[]> {
  const today = dayIn(now, zone);
  const byThing = new Map<string, Placed[]>();
  for (const one of all) {
    const key = `${one.candidate.of}:${one.candidate.id}`;
    byThing.set(key, [...(byThing.get(key) ?? []), one]);
  }
  // 051. A memory on a calendar: on its day Your day draws the event.
  const memoryIds = all.filter((one) => one.candidate.of === "memory").map((one) => one.candidate.id);
  const linked = new Set(
    memoryIds.length > 0
      ? (await db.selectFrom("notes").select("id").where("id", "in", memoryIds).where("account_id", "=", accountId).where("event_ref", "is not", null).execute()).map((row) => row.id)
      : [],
  );
  const begun: Begun[] = [];
  for (const slots of byThing.values()) {
    slots.sort((a, b) => a.slot.moment.getTime() - b.slot.moment.getTime());
    const gone = slots.filter((one) => one.slot.moment.getTime() <= now.getTime());
    const current = gone.at(-1);
    if (!current) continue;
    const { candidate, slot } = current;
    if (slot.occurrence < today) continue;
    // Your day draws a dated row on its day.
    if (candidate.of === "content" && !candidate.dated.anchored && slot.occurrence === today) continue;
    if (candidate.of === "memory" && linked.has(candidate.id) && slot.occurrence === today) continue;
    begun.push({ candidate, slot, next: slots.find((one) => one.slot.moment.getTime() > now.getTime())?.slot ?? null });
  }
  const sortKey = (one: Begun) => one.slot.occurrence + (one.candidate.dated.time ?? "") + one.candidate.id;
  return begun.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
}

export async function todayReminders(accountId: string, now = new Date()): Promise<z.infer<typeof remindersResponse>> {
  const empty = { rows: [], others: [], more: 0 };
  const clock = await clockOf(accountId, now);
  if (!clock) return empty;

  const dismissed = new Set(
    (await db.selectFrom("reminder_dismissals").select(["content_id", "note_id", "occurrence", "window_name"]).where("account_id", "=", accountId).execute()).map(
      (one) => keyOf(one.content_id ? "content" : "note", one.content_id ?? one.note_id!, one.occurrence, one.window_name),
    ),
  );
  const shown = (await begunOf(accountId, now, clock.zone, await placed(accountId, clock))).filter(
    (one) => !dismissed.has(keyOf(one.candidate.of, one.candidate.id, one.slot.occurrence, one.slot.window)),
  );

  const by = (one: Begun) => one.candidate.kind === "deadline" || one.candidate.dated.anchored;
  const rowIds = shown.filter((one) => one.candidate.of === "content").map((one) => one.candidate.id);
  const raw = rowIds.length > 0 ? ((await agendaQuery(accountId).where("content.id", "in", rowIds).execute()) as AgendaRaw[]) : [];
  const shaped = new Map((await shapeRows(raw, accountId)).map((row) => [row.id, row]));

  const rows: z.infer<typeof remindersRow>[] = [];
  const others: z.infer<typeof remindersOther>[] = [];
  for (const one of shown) {
    const where = { window: one.slot.window, next: one.next ? dayOf(one.next, clock.zone) : null };
    if (one.candidate.of === "content") {
      const row = shaped.get(one.candidate.id);
      if (row) rows.push({ ...row, remindDay: one.slot.occurrence, remindBy: by(one), ...where });
    } else {
      others.push({
        of: one.candidate.of,
        id: one.candidate.id,
        name: reminderName(one.candidate.name),
        day: one.slot.occurrence,
        by: by(one),
        time: one.candidate.dated.time,
        threadId: one.candidate.threadId,
        threadName: one.candidate.threadName,
        threadIcon: one.candidate.threadIcon,
        threadHue: one.candidate.threadHue,
        ...where,
      });
    }
  }
  return { rows, others, more: 0 };
}

/** Hide the one reminder the screen showed. True when it was showing: the
 *  account's own thing, begun, on that day and in that window. Anything else
 *  is false, as a thing that does not exist is, so the route is no oracle.
 *  The same dismiss twice is one dismiss. */
export async function dismissReminder(accountId: string, which: Dismissal, now = new Date()): Promise<boolean> {
  const clock = await clockOf(accountId, now);
  if (!clock) return false;
  const begun = await begunOf(accountId, now, clock.zone, await placed(accountId, clock));
  const match = begun.find(
    (one) => one.candidate.of === which.of && one.candidate.id === which.id && one.slot.occurrence === which.day && one.slot.window === which.window,
  );
  if (!match) return false;
  const column = which.of === "content" ? "content_id" : "note_id";
  await db
    .insertInto("reminder_dismissals")
    .values({ account_id: accountId, [column]: which.id, occurrence: which.day, window_name: which.window } as never)
    .onConflict((oc) => oc.columns(["account_id", column, "occurrence", "window_name"]).where(column, "is not", null).doNothing())
    .execute();
  return true;
}

/** Undo: the reminder shows again. False when there was nothing to undo. */
export async function undismissReminder(accountId: string, which: Dismissal): Promise<boolean> {
  const column = which.of === "content" ? "content_id" : "note_id";
  const result = await db
    .deleteFrom("reminder_dismissals")
    .where("account_id", "=", accountId)
    .where(column, "=", which.id)
    .where("occurrence", "=", which.day)
    .where("window_name", "=", which.window)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0) > 0;
}
