// 042. Today's Reminders section: the home of what Coming up names.
//
// Every thing of the person's whose reminders have begun and whose day has
// not passed: from the moment its first reminder at their How many was due,
// to the end of its day. It follows the table whether Reminders is on or off
// on the Notifications page, so somebody who wants no notifications still sees
// what is coming; stopping a thing takes it off. A row Your day draws for
// today is not repeated here.

import { dayIn } from "@offload/widgets";
import { z } from "zod";
import { reminderName } from "../notifications/copy.js";
import { clockOf, placed, type Candidate } from "../notifications/reminders.js";
import { agendaQuery, agendaRow, shapeRows, type AgendaRaw } from "./rows.js";

/** What the section draws at most, nearest first. */
export const SECTION_CAP = 20;

export const remindersRow = agendaRow.extend({
  /** The day it is reminded against: its own, or the day before what it is for. */
  remindDay: z.string(),
  /** "by" rather than "on": a deadline, or a task that belongs to something. */
  remindBy: z.boolean(),
});

export const remindersOther = z.object({
  of: z.enum(["note", "memory"]),
  id: z.string(),
  name: z.string(),
  day: z.string(),
  by: z.boolean(),
  threadId: z.string().nullable(),
  threadName: z.string().nullable(),
  threadIcon: z.string().nullable(),
  threadHue: z.number().nullable(),
});

export const remindersResponse = z.object({
  rows: z.array(remindersRow),
  others: z.array(remindersOther),
  /** Begun and not drawn: the further away. */
  more: z.number(),
});

interface Begun {
  candidate: Candidate;
  day: string;
  time: string;
}

export async function todayReminders(accountId: string, now = new Date()): Promise<z.infer<typeof remindersResponse>> {
  const empty = { rows: [], others: [], more: 0 };
  const clock = await clockOf(accountId, now);
  if (!clock) return empty;
  const today = dayIn(now, clock.zone);

  // The first reminder at their How many, per thing: begun once it is due.
  const first = new Map<string, Begun & { at: number }>();
  for (const { candidate, slot } of await placed(accountId, clock)) {
    const seen = first.get(candidate.id);
    if (seen && seen.at <= slot.moment.getTime()) continue;
    first.set(candidate.id, { candidate, day: slot.occurrence, time: candidate.dated.time ?? "", at: slot.moment.getTime() });
  }
  const begun = [...first.values()]
    .filter((one) => one.at <= now.getTime() && one.day >= today)
    // Your day draws a dated row on its day.
    .filter((one) => !(one.candidate.of === "content" && !one.candidate.dated.anchored && one.day === today))
    .sort((a, b) => (a.day + a.time + a.candidate.id < b.day + b.time + b.candidate.id ? -1 : 1));

  const shown = begun.slice(0, SECTION_CAP);
  const by = (one: Begun) => one.candidate.kind === "deadline" || one.candidate.dated.anchored;
  const rowIds = shown.filter((one) => one.candidate.of === "content").map((one) => one.candidate.id);
  const raw = rowIds.length > 0 ? ((await agendaQuery(accountId).where("content.id", "in", rowIds).execute()) as AgendaRaw[]) : [];
  const shaped = new Map((await shapeRows(raw, accountId)).map((row) => [row.id, row]));

  const rows: z.infer<typeof remindersRow>[] = [];
  const others: z.infer<typeof remindersOther>[] = [];
  for (const one of shown) {
    if (one.candidate.of === "content") {
      const row = shaped.get(one.candidate.id);
      if (row) rows.push({ ...row, remindDay: one.day, remindBy: by(one) });
    } else {
      others.push({
        of: one.candidate.of,
        id: one.candidate.id,
        name: reminderName(one.candidate.name),
        day: one.day,
        by: by(one),
        threadId: one.candidate.threadId,
        threadName: one.candidate.threadName,
        threadIcon: one.candidate.threadIcon,
        threadHue: one.candidate.threadHue,
      });
    }
  }
  return { rows, others, more: begun.length - shown.length };
}
