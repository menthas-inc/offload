// The agenda's rows: every content row the account can read, with its thread,
// shaped as the thread page's row. 024's Today read and 027's day read both
// start here, so a row on Today and the same row on its thread page cannot
// disagree about a field.

import { sql } from "kysely";
import { z } from "zod";
import { db } from "../db.js";
import { shownThreadName } from "../threads/default.js";
import { shownThreadHue, shownThreadIcon } from "../threads/icons.js";
import { contentRow, toRow, withPhotos, type RawRow } from "../routes/threads.js";

export const agendaRow = contentRow.extend({
  /** 052. The calendar a row is on, by its own name and Google's colour, when
   *  it is one of this account's: a reply's details name it. */
  calendar: z.object({ name: z.string(), colour: z.string().nullable() }).nullable().optional(),
  threadId: z.string(),
  threadName: z.string().nullable(),
  /** 037. Null with the name, for a row in the default thread. */
  threadIcon: z.string().nullable(),
  threadHue: z.number().nullable(),
});
export type AgendaRow = z.infer<typeof agendaRow>;
export type AgendaRaw = RawRow & { threadId: string; threadName: string | null; threadIcon: string | null; threadHue: number | null };

/** Open, live content the account reads, in a live thread. Callers add the
 *  date predicate, the order and the limit. */
export function agendaQuery(accountId: string) {
  return db
    .selectFrom("readable_content as content")
    .innerJoin("threads", "threads.id", "content.thread_id")
    .leftJoin("accounts", "accounts.id", "content.account_id")
    // 052. Where an event is, for a reply's details and their Directions.
    .leftJoin("places", "places.id", "content.place_id")
    .select([
      "content.id as id",
      "content.type as type",
      "content.title as title",
      "content.body as body",
      "content.url as url",
      "content.image_url as image_url",
      "content.created_at as created_at",
      "content.archived_at as archived_at",
      "content.account_id as account_id",
      "content.done_at as done_at",
      "content.filing_at as filing_at",
      "content.due_at as due_at",
      "content.occurs_at as occurs_at",
      "content.occurs_end_at as occurs_end_at",
      "content.rrule as rrule",
      "content.source_ref as source_ref",
      "content.is_reminder as is_reminder",
      "content.priority as priority",
      "content.priority_pinned as priority_pinned",
      "content.place_id as place_id",
      "content.attrs as attrs",
      "accounts.display_name as authorName",
      "content.thread_id as threadId",
      // 028. Null for a row in the default thread, which no surface names.
      shownThreadName("threads.id", "threads.name", accountId).as("threadName"),
      shownThreadIcon("threads.id", "threads.icon", accountId).as("threadIcon"),
      shownThreadHue("threads.id", "threads.hue", accountId).as("threadHue"),
      sql<boolean>`exists (
        select 1 from thread_members am
        where am.thread_id = content.thread_id
          and am.account_id = content.account_id
          and am.state = 'accepted'
      )`.as("authorIsMember"),
      "content.location as location",
      "places.lat as placeLat",
      "places.lng as placeLng",
      "places.approximate as placeApproximate",
    ])
    .where("content.viewer_account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    .where("content.archived_at", "is", null)
    .where("content.done_at", "is", null)
    // Thread layouts (decision 11). An open row reaches Today's To do from a
    // Default or Project thread as it always has; from any other layout only
    // when it carries a date or a reminder. `reachesToday` in @offload/widgets
    // is the same rule for the clients' optimistic rows, pinned by a test. A
    // dated row passes here whatever the layout, so the day read, whose rows
    // are all dated, is untouched.
    .where((eb) =>
      eb.or([
        eb("threads.layout", "in", ["default", "project"]),
        eb("content.due_at", "is not", null),
        eb("content.occurs_at", "is not", null),
        eb("content.is_reminder", "=", true),
      ]),
    )
    .where("threads.deleted_at", "is", null);
}

/** The thread page's row, with its thread, its photo and its labels. */
export async function shapeRows(rows: AgendaRaw[], accountId: string): Promise<AgendaRow[]> {
  return (await withPhotos(
    rows.map((row) => ({ ...toRow(row, accountId), threadId: row.threadId, threadName: row.threadName, threadIcon: row.threadIcon, threadHue: row.threadHue })),
    accountId,
  )) as unknown as AgendaRow[];
}

/** The labels the rows carry, and only those: Today has no thread bundle to
 *  look a label up in. */
export async function labelsOf(rows: AgendaRow[]): Promise<{ id: string; name: string; colour: number }[]> {
  const named = [...new Set(rows.flatMap((row) => row.labels))];
  if (named.length === 0) return [];
  return db
    .selectFrom("labels")
    .select(["id", "name", "colour"])
    .where("id", "in", named)
    .where("deleted_at", "is", null)
    .orderBy("created_at")
    .execute();
}

/** Whether anything was ever filed: the day-one invitation is for an account
 *  that has never dumped anything. */
export async function everDumped(accountId: string): Promise<boolean> {
  const ever = await db
    .selectFrom("readable_content as content")
    .select("content.id")
    .where("content.viewer_account_id", "=", accountId)
    .where("content.deleted_at", "is", null)
    .limit(1)
    .executeTakeFirst();
  return ever !== undefined;
}
