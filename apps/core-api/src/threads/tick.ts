// Ticking something off, or putting it back. Both doors, the screens and the
// model's `complete_content`, come through here.
//
// **A tick on a repeating task is this time done, not the series.** The row
// moves to its next date and stays open, so every reader of a rule follows
// with nothing to learn. Until 2026-11-06 it was done for good, and a monthly
// bill ticked once never came round again.

import { addUtcDays, dayIn, formatRule, instantIn, nextOnOrAfter, occurrencesIn, parseRule, timeHM, utcDay } from "@offload/widgets";
import { sql } from "kysely";
import { zoneOf } from "../accounts/zone.js";
import type { Executor } from "./access.js";

/** Where a tick leaves a rule: the first date after both the row's own and
 *  today, so one ticked early still takes this month's. The rule is rewritten
 *  only as far as the new anchor needs to keep drawing the same days. Null
 *  when there is no date left.
 *
 *  shortcut: a yearly rule on 29 February settles on the 28th after one tick,
 *  the grammar has no yearly day to pin it with; add one if that ever matters. */
export function afterTick(text: string, anchor: string, today: string): { day: string; rrule: string } | null {
  const parsed = parseRule(text);
  if (!parsed.ok) return null;
  const rule = parsed.rule;
  const day = nextOnOrAfter(rule, anchor, addUtcDays(anchor > today ? anchor : today, 1));
  if (!day) return null;
  const moved = { ...rule };
  if (rule.count !== undefined) {
    const { count: _count, ...open } = rule;
    moved.count = rule.count - occurrencesIn(open, anchor, anchor, addUtcDays(day, -1), 999).length;
  }
  // The anchor's day of the month is the rule's, until a short month moves it.
  const dom = Number(anchor.slice(8));
  if (rule.freq === "MONTHLY" && !rule.ordinal && !rule.byMonthDay && Number(day.slice(8)) !== dom) moved.byMonthDay = dom;
  return { day, rrule: formatRule(moved) };
}

/** Set a row's tick. The row is already known readable. */
export async function tickIn(trx: Executor, accountId: string, id: string, done: boolean, now = new Date()): Promise<void> {
  const row = await trx
    .selectFrom("content")
    .select(["type", "due_at", "occurs_at", "rrule", "done_at", "attrs"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  const attrs = (row.attrs ?? {}) as Record<string, unknown>;
  const stamp = { updated_at: sql<Date>`now()` };

  if (done && row.done_at === null && row.rrule && row.due_at && row.type !== "event") {
    const zone = await zoneOf(accountId, trx);
    const allDay = attrs["all_day"] === true;
    const next = afterTick(row.rrule, allDay ? utcDay(row.due_at) : dayIn(row.due_at, zone), dayIn(now, zone));
    if (next) {
      const hm = timeHM(row.due_at.toISOString(), zone);
      const due = allDay ? new Date(`${next.day}T12:00:00Z`) : (instantIn(`${next.day}T${hm}`, zone) ?? new Date(`${next.day}T${hm}:00Z`));
      const occurs = row.occurs_at ? new Date(row.occurs_at.getTime() + due.getTime() - row.due_at.getTime()) : null;
      // What Undo needs, with where the tick left it, so a date set since stays.
      const ticked = { dueAt: row.due_at.toISOString(), occursAt: row.occurs_at?.toISOString() ?? null, rrule: row.rrule, movedTo: due.toISOString() };
      await trx
        .updateTable("content")
        .set({ ...stamp, due_at: due, occurs_at: occurs, rrule: next.rrule, attrs: sql`attrs || ${JSON.stringify({ ticked })}::jsonb` })
        .where("id", "=", id)
        .execute();
      return;
    }
  }

  const ticked = attrs["ticked"] as { dueAt: string; occursAt: string | null; rrule: string; movedTo: string } | undefined;
  if (!done && row.done_at === null && ticked) {
    const untouched = row.due_at?.toISOString() === ticked.movedTo;
    await trx
      .updateTable("content")
      .set({
        ...stamp,
        ...(untouched ? { due_at: new Date(ticked.dueAt), occurs_at: ticked.occursAt ? new Date(ticked.occursAt) : null, rrule: ticked.rrule } : {}),
        attrs: sql`attrs - 'ticked'`,
      })
      .where("id", "=", id)
      .execute();
    return;
  }

  await trx
    .updateTable("content")
    .set({ ...stamp, done_at: done ? sql`now()` : null, attrs: sql`attrs - 'ticked'` })
    .where("id", "=", id)
    .execute();
}
