// 027 If you have time: the one rule for what offload picks, and + Today.
//
// Open to-dos with no date and no rule, filed by this person, in a thread with
// something due in the next seven days, oldest first, three at most, never one
// the person took back with + Today's Undo that day. Not a setting. The write
// checks the same rule again, so nothing but the person's own open, undated
// row can be dated this way, whatever id arrives.

import { addUtcDays, dayIn, instantIn } from "@offload/widgets";
import { sql } from "kysely";
import { zoneOf } from "../accounts/zone.js";
import { db } from "../db.js";
import { editContent } from "../routes/threads.js";
import { NotYours } from "../threads/access.js";
import { agendaQuery, shapeRows, type AgendaRaw, type AgendaRow } from "./rows.js";

export const PICKS = 3;
export const PICK_DAYS = 7;

/** The start of the day after `day` in the zone: when a put-off ends. */
export function startOfTomorrow(today: string, zone: string | null): Date {
  const next = addUtcDays(today, 1);
  return instantIn(`${next}T00:00`, zone) ?? new Date(`${next}T00:00:00Z`);
}

/** The predicate a pick has to satisfy, as a query on `readable_content`. */
function eligible(accountId: string) {
  return agendaQuery(accountId)
    .where("content.account_id", "=", accountId)
    .where("content.type", "=", "task")
    .where("content.due_at", "is", null)
    .where("content.rrule", "is", null);
}

export async function todayPicks(accountId: string, today: string, zone: string | null): Promise<AgendaRow[]> {
  const from = new Date(`${addUtcDays(today, -1)}T00:00:00Z`);
  const to = new Date(`${addUtcDays(today, PICK_DAYS + 2)}T00:00:00Z`);
  const rows = await eligible(accountId)
    // Something due soon in the same thread. Widened by a day either side of
    // the window and checked against the zone's days below, so a bare day and
    // a timed row are judged the same way.
    .where(({ exists, selectFrom }) =>
      exists(
        selectFrom("content as soon")
          .select("soon.id")
          .whereRef("soon.thread_id", "=", "content.thread_id")
          .where("soon.due_at", ">=", from)
          .where("soon.due_at", "<", to)
          .where("soon.done_at", "is", null)
          .where("soon.deleted_at", "is", null)
          .where("soon.archived_at", "is", null)
          .where(sql<boolean>`(
            case when (soon.attrs->>'all_day')::boolean
              then (soon.due_at at time zone 'UTC')::date
              else (soon.due_at at time zone ${zone ?? "UTC"})::date
            end
          ) between ${today}::date and ${addUtcDays(today, PICK_DAYS)}::date`),
      ),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("today_put_offs as off")
            .select("off.card")
            .where("off.account_id", "=", accountId)
            .where(sql<boolean>`off.card = 'pick:' || content.id::text`)
            .where((eb) => eb.or([eb("off.until", "is", null), eb("off.until", ">", sql<Date>`now()`)])),
        ),
      ),
    )
    .orderBy("content.created_at", "asc")
    .orderBy("content.id", "asc")
    .limit(PICKS)
    .execute();
  return shapeRows(rows as AgendaRaw[], accountId);
}

async function ownPick(accountId: string, contentId: string): Promise<AgendaRaw> {
  const row = await eligible(accountId).where("content.id", "=", contentId).executeTakeFirst();
  if (!row) throw new NotYours();
  return row as AgendaRaw;
}

/** + Today: the row gets today, as a day with no hour, through 023's write. */
export async function takeToday(accountId: string, contentId: string): Promise<AgendaRow> {
  await ownPick(accountId, contentId);
  const today = dayIn(new Date(), await zoneOf(accountId));
  await editContent(accountId, contentId, { dueAt: today, allDay: true });
  const row = await agendaQuery(accountId).where("content.id", "=", contentId).executeTakeFirstOrThrow();
  return (await shapeRows([row as AgendaRaw], accountId))[0]!;
}

/** + Today's Undo: only while the row still holds today's bare day, so a
 *  date somebody set since is never cleared. Keeps the row out of the picks
 *  until tomorrow. */
export async function undoTakeToday(accountId: string, contentId: string): Promise<"ok" | "not_undoable"> {
  const zone = await zoneOf(accountId);
  const today = dayIn(new Date(), zone);
  const row = await agendaQuery(accountId)
    .where("content.id", "=", contentId)
    .where("content.account_id", "=", accountId)
    .where("content.type", "=", "task")
    .where("content.rrule", "is", null)
    .executeTakeFirst();
  if (!row) throw new NotYours();
  const allDay = (row.attrs as Record<string, unknown> | null)?.["all_day"] === true;
  if (!allDay || row.due_at?.toISOString() !== `${today}T12:00:00.000Z`) return "not_undoable";
  await editContent(accountId, contentId, { dueAt: null });
  await db
    .insertInto("today_put_offs")
    .values({ account_id: accountId, card: `pick:${contentId}`, until: startOfTomorrow(today, zone) })
    .onConflict((oc) => oc.columns(["account_id", "card"]).doUpdateSet({ until: startOfTomorrow(today, zone) }))
    .execute();
  return "ok";
}
