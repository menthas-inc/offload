// 042. Which of an account's things offload reminds it about, and where each
// reminder lands. One read of the author's own labelled things, then `plan()`
// for each: the sends keep what lands in them, the hourly pass what falls in
// its hour, and Today what has begun.
//
// **Only the author, only their own words, only a date they set.** The read
// joins the author's accepted membership, refuses a calendar's row and
// anything from mail, a calendar, a capture or an untrusted dump, and skips a
// thing that is stopped, or held because somebody else set its date.

import { dayIn, utcDay } from "@offload/widgets";
import { sql } from "kysely";
import { db } from "../db.js";
import type { Executor } from "../threads/access.js";
import type { RemindKind, RemindLead } from "../schema.js";
import { plan, type Clock, type Slot, type Dated } from "./plan.js";

/** Things one account is read for at once. Nearest first, so a cap drops the
 *  furthest off. */
export const CANDIDATES_CAP = 500;
/** How far ahead a dated thing can still have a reminder to come: a month
 *  out for `months` is eight weeks. */
const HORIZON_DAYS = 57;

export interface Candidate {
  of: "content" | "note" | "memory";
  id: string;
  threadId: string | null;
  /** The thread's name, icon and hue as the person sees them: null for
   *  their default thread. */
  threadName: string | null;
  threadIcon: string | null;
  threadHue: number | null;
  /** A row's title, or a note's or a memory's short name. */
  name: string;
  type: string;
  /** The instant the row's or note's date names, for its hour. */
  at: Date | null;
  allDay: boolean;
  dated: Dated;
  kind: RemindKind | null;
}

interface Raw {
  of: "content" | "note" | "memory";
  id: string;
  thread_id: string | null;
  thread_name: string | null;
  thread_icon: string | null;
  thread_hue: number | null;
  title: string;
  type: string;
  at: Date | null;
  all_day: boolean;
  rrule: string | null;
  asked: boolean;
  born: Date;
  kind: RemindKind | null;
  lead: RemindLead | null;
  name: string | null;
  yearly_on: string | null;
  date_set_at: Date | null;
  labelled_at: Date | null;
  anchor_at: Date | null;
  anchor_all_day: boolean | null;
}

/** The first 60 characters of a sentence, cut at a word. */
export function nameFromText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (flat.length <= 60) return flat;
  const head = flat.slice(0, 60);
  const at = head.lastIndexOf(" ");
  return (at > 20 ? head.slice(0, at) : head).replace(/[,;:]+$/, "");
}

/** The account's clock and How many, or null for an account with no zone,
 *  which nothing can schedule. */
export async function clockOf(accountId: string, now: Date, trx: Executor = db): Promise<(Clock & { on: boolean }) | null> {
  const account = await trx
    .selectFrom("accounts")
    .select(["time_zone", "notify_due_today_at", "notify_coming_tomorrow_at", "notify_reminder_count", "notify_reminders"])
    .where("id", "=", accountId)
    .executeTakeFirst();
  if (!account?.time_zone) return null;
  return {
    zone: account.time_zone,
    morning: String(account.notify_due_today_at).slice(0, 5),
    evening: String(account.notify_coming_tomorrow_at).slice(0, 5),
    count: account.notify_reminder_count,
    now,
    on: account.notify_reminders,
  };
}

/** The author's own things that may be reminded about, nearest first. A row
 *  with no label is here only when it has a clock time in the next day, for
 *  the default, or when they asked about it. */
export async function candidatesOf(accountId: string, clock: Clock, trx: Executor = db): Promise<Candidate[]> {
  const now = sql`${clock.now.toISOString()}::timestamptz`;
  // The default thread has no name a person reads.
  const loose = sql`t.id = (select a.default_thread_id from accounts a where a.id = ${accountId}::uuid)`;
  const shown = sql`case when ${loose} then null else t.name end as thread_name,
    case when ${loose} then null else t.icon end as thread_icon,
    case when ${loose} then null else t.hue end as thread_hue`;
  const result = await sql<Raw>`
    select * from (
      select 'content' as "of", c.id, c.thread_id, ${shown}, c.title, c.type,
             case when c.type = 'event' then c.occurs_at else c.due_at end as at,
             coalesce((c.attrs ->> 'all_day')::boolean, false) as all_day,
             c.rrule, c.is_reminder as asked, c.created_at as born,
             l.kind, l.lead, null::text as name, null::text as yearly_on, l.date_set_at, l.labelled_at,
             coalesce(case when ac.type = 'event' then ac.occurs_at else ac.due_at end, an.occurs_at, an.due_at) as anchor_at,
             coalesce((ac.attrs ->> 'all_day')::boolean, (an.attrs ->> 'all_day')::boolean) as anchor_all_day
        from content c
        join thread_members tm on tm.thread_id = c.thread_id and tm.account_id = ${accountId}::uuid and tm.state = 'accepted'
        join threads t on t.id = c.thread_id and t.deleted_at is null
        left join reminder_labels l on l.content_id = c.id
        left join content ac on ac.id = l.anchor_content_id and ac.deleted_at is null and ac.done_at is null and ac.archived_at is null
        left join notes an on an.id = l.anchor_note_id and an.deleted_at is null and an.superseded_at is null and an.muted_at is null
       where c.account_id = ${accountId}::uuid
         and c.deleted_at is null and c.done_at is null and c.archived_at is null
         and c.source in ('person', 'share')
         and not reminder_foreign(c.derived_from_message_id)
         and (l.id is null or (l.stopped_at is null and l.held_at is null))
         and (
           (l.kind is not null and l.kind <> 'none')
           or c.is_reminder
           or (l.kind is null and coalesce((c.attrs ->> 'all_day')::boolean, false) = false
               and (case when c.type = 'event' then c.occurs_at else c.due_at end) between ${now} - interval '1 hour' and ${now} + interval '25 hours')
         )
         and (
           c.rrule is not null
           or (case when c.type = 'event' then c.occurs_at else c.due_at end) between ${now} - interval '2 days' and ${now} + make_interval(days => ${HORIZON_DAYS})
           or coalesce(case when ac.type = 'event' then ac.occurs_at else ac.due_at end, an.occurs_at, an.due_at)
                between ${now} - interval '1 day' and ${now} + make_interval(days => ${HORIZON_DAYS + 1})
         )
      union all
      select 'note', n.id, n.subject_id, ${shown}, n.text, 'note',
             coalesce(n.occurs_at, n.due_at), coalesce((n.attrs ->> 'all_day')::boolean, false),
             n.rrule, false, n.created_at,
             l.kind, l.lead, l.name, null, l.date_set_at, l.labelled_at, null, null
        from notes n
        join thread_members tm on tm.thread_id = n.subject_id and tm.account_id = ${accountId}::uuid and tm.state = 'accepted'
        join threads t on t.id = n.subject_id and t.deleted_at is null
        join reminder_labels l on l.note_id = n.id
       where n.scope = 'thread' and n.account_id = ${accountId}::uuid
         and n.deleted_at is null and n.superseded_at is null and n.muted_at is null
         and not n.derived_from_untrusted and not reminder_foreign(n.derived_from_message_id)
         and l.stopped_at is null and l.held_at is null and l.kind is not null and l.kind <> 'none'
         and (n.rrule is not null
              or coalesce(n.occurs_at, n.due_at) between ${now} - interval '2 days' and ${now} + make_interval(days => ${HORIZON_DAYS}))
      union all
      select 'memory', n.id, null, null, null, null::smallint, n.text, 'memory', null, true, null, false, n.created_at,
             l.kind, l.lead, l.name, l.yearly_on, l.date_set_at, l.labelled_at, null, null
        from notes n
        join reminder_labels l on l.note_id = n.id
       where n.scope = 'account' and n.subject_id = ${accountId}::uuid and n.account_id = ${accountId}::uuid
         and n.deleted_at is null and n.superseded_at is null
         and l.stopped_at is null and l.kind = 'occasion' and l.yearly_on is not null
    ) things
    -- A memory has no instant; it sorts first, and is bounded at 300 anyway.
    order by coalesce(at, anchor_at, ${now}) asc
    limit ${CANDIDATES_CAP}
  `.execute(trx);

  return result.rows.map((raw) => toCandidate(raw, clock));
}

function hhmm(at: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

function toCandidate(raw: Raw, clock: Clock): Candidate {
  const at = raw.at ? new Date(raw.at) : null;
  const anchorAt = raw.anchor_at ? new Date(raw.anchor_at) : null;
  const anchored = at === null && anchorAt !== null;
  const when = anchored ? anchorAt : at;
  const allDay = anchored ? raw.anchor_all_day === true : raw.all_day;
  const day = when ? (allDay ? utcDay(when) : dayIn(when, clock.zone)) : null;
  const time = when && !allDay && !anchored ? hhmm(when, clock.zone) : null;
  const since = raw.date_set_at && raw.date_set_at > raw.born ? raw.date_set_at : raw.born;
  return {
    of: raw.of,
    id: raw.id,
    threadId: raw.thread_id,
    threadName: raw.thread_name,
    threadIcon: raw.thread_icon,
    threadHue: raw.thread_hue,
    name: raw.of === "content" ? raw.title : (raw.name ?? nameFromText(raw.title)),
    type: raw.type,
    at,
    allDay,
    kind: raw.kind,
    dated: {
      kind: raw.kind,
      lead: raw.lead,
      day,
      time,
      anchored,
      rule: raw.rrule,
      yearlyOn: raw.yearly_on,
      asked: raw.asked,
      since: new Date(since),
      labelledAt: raw.labelled_at ? new Date(raw.labelled_at) : null,
    },
  };
}

export interface Placed {
  candidate: Candidate;
  slot: Slot;
}

/** Every reminder of the account's, placed. */
export async function placed(accountId: string, clock: Clock, trx: Executor = db): Promise<Placed[]> {
  const things = await candidatesOf(accountId, clock, trx);
  return things.flatMap((candidate) => plan(candidate.dated, clock).map((slot) => ({ candidate, slot })));
}
