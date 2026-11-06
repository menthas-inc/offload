// What has passed archives itself (the owner, 2026-10-17).
//
// An event, a stay, a ticket: anything that happens on a day and is not a
// to-do leaves the list once its last day is over in its author's clock, and
// the undated photos and files that came in the same dump go with the last of
// its dated rows, since a movie ticket is over when the movie is. A late to-do stays, however late:
// it is still something to do. A repeating row has a next time. A row a person
// put back carries `put_back` and is left where they put it.
//
// Archived, never deleted: it is one tap back from the thread's archived pile.
// Hourly, because a day ends at a different hour in every zone. SQL only, one
// statement, a batch at a time: the first run meets every passed row there has
// ever been, and the handler books the next batch while there is more.
//
// A plan kept as a note passes the same way (the owner, 2026-11-06). The
// nightly pass reads dates too, but only on the notes it is shown, and a note
// out of an email is never shown to a model again. This asks no model, so it
// reaches those as well.

import { sql } from "kysely";
import { db } from "../db.js";

export const PASSED_BATCH = 2000;

// A zone Postgres does not know would fail the whole statement, so an
// account's zone is read through its own list, UTC where it has none.
const zones = sql`zones as (
  select a.id, coalesce(z.name, 'UTC') as zone
  from accounts a
  left join pg_timezone_names z on z.name = a.time_zone
)`;

export async function archivePassed(
  now = new Date(),
  batch = PASSED_BATCH,
): Promise<{ archived: number; threads: number; more: boolean }> {
  // The flags are compared as JSON, which cannot raise on an odd value the way
  // a cast to boolean does.
  const result = await sql<{ archived: number; threads: number; passed: number }>`
    with ${zones},
    passed as (
      select c.id, c.thread_id, c.derived_from_message_id
      from content c
      join zones on zones.id = c.account_id
      where c.archived_at is null
        and c.deleted_at is null
        and c.type <> 'task'
        and c.rrule is null
        and c.occurs_at is not null
        and coalesce(c.attrs -> 'put_back' = 'true'::jsonb, false) = false
        and (case when coalesce(c.attrs -> 'all_day' = 'true'::jsonb, false)
               then (coalesce(c.occurs_end_at, c.occurs_at) at time zone 'UTC')::date
               else (coalesce(c.occurs_end_at, c.occurs_at) at time zone zones.zone)::date
             end) < (${now}::timestamptz at time zone zones.zone)::date
      limit ${batch}
    ),
    dump as (
      select c.id
      from content c
      join passed p on p.derived_from_message_id = c.derived_from_message_id and p.thread_id = c.thread_id
      where c.type in ('image', 'screenshot', 'file')
        and c.archived_at is null
        and c.deleted_at is null
        and c.occurs_at is null
        and c.due_at is null
        and coalesce(c.attrs -> 'put_back' = 'true'::jsonb, false) = false
        -- S39. They go with the dump's last dated row: none from it still ahead.
        and not exists (
          select 1
          from content o
          join zones on zones.id = o.account_id
          where o.derived_from_message_id = c.derived_from_message_id
            and o.thread_id = c.thread_id
            and o.archived_at is null
            and o.deleted_at is null
            and o.id not in (select id from passed)
            and coalesce(o.occurs_at, o.due_at) is not null
            and (o.rrule is not null
                 or (case when coalesce(o.attrs -> 'all_day' = 'true'::jsonb, false)
                       then (coalesce(o.occurs_end_at, o.occurs_at, o.due_at) at time zone 'UTC')::date
                       else (coalesce(o.occurs_end_at, o.occurs_at, o.due_at) at time zone zones.zone)::date
                     end) >= (${now}::timestamptz at time zone zones.zone)::date)
        )
    ),
    -- updated_at is left alone: the nightly pass reads it as the row having
    -- changed, and nothing about the row did.
    archived as (
      update content set archived_at = now()
      where id in (select id from passed union select id from dump)
      returning thread_id
    ),
    -- content_count is what is live in a thread, as setArchived keeps it.
    counted as (
      select thread_id, count(*)::int as n from archived group by thread_id
    ),
    recounted as (
      update threads set content_count = greatest(content_count - counted.n, 0)
      from counted
      where threads.id = counted.thread_id
      returning threads.id
    )
    select (select count(*) from archived)::int as archived,
           (select count(*) from recounted)::int as threads,
           (select count(*) from passed)::int as passed
  `.execute(db);
  const row = result.rows[0] ?? { archived: 0, threads: 0, passed: 0 };
  return { archived: row.archived, threads: row.threads, more: row.passed >= batch };
}

/** Set aside a note whose plan has passed: off the prompt and the section, in
 *  the thread's folded history, as the nightly pass leaves one.
 *
 *  **A plan and a dated fact are told apart by when it was written.** A note
 *  whose last day was still ahead on the day it was written is a plan, and when
 *  that day is over it is over. One whose date had already come ("the house was
 *  built in 1931", "the boiler was serviced today") was a record from the start
 *  and stays. So does a note with `due_at`, which a late to-do stays for, and
 *  one with a rule, which has a next time.
 *
 *  No `purge_after`, unlike a fold: the privacy page says nothing a person put
 *  in expires on a clock, and `updated_at` is when somebody last wrote it. */
export async function setAsidePassedNotes(
  now = new Date(),
  batch = PASSED_BATCH,
): Promise<{ setAside: number; more: boolean }> {
  const result = await sql<{ set_aside: number }>`
    with ${zones},
    dated as (
      select n.id, n.created_at,
             -- An author who has gone leaves no clock, as a zone nobody knows.
             coalesce(zones.zone, 'UTC') as zone,
             case when coalesce(n.attrs -> 'all_day' = 'true'::jsonb, false)
               then (coalesce(n.occurs_end_at, n.occurs_at) at time zone 'UTC')::date
               else (coalesce(n.occurs_end_at, n.occurs_at) at time zone coalesce(zones.zone, 'UTC'))::date
             end as last_day
      from notes n
      left join zones on zones.id = n.account_id
      where n.scope = 'thread'
        and n.deleted_at is null
        and n.superseded_at is null
        and n.rrule is null
        and n.due_at is null
        and n.occurs_at is not null
    ),
    passed as (
      select id from dated
      where last_day < (${now}::timestamptz at time zone zone)::date
        and last_day > (created_at at time zone zone)::date
      limit ${batch}
    ),
    aside as (
      update notes set superseded_at = now()
      where id in (select id from passed)
      returning id
    )
    select count(*)::int as set_aside from aside
  `.execute(db);
  const setAside = result.rows[0]?.set_aside ?? 0;
  return { setAside, more: setAside >= batch };
}
