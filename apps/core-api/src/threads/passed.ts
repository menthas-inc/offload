// What has passed archives itself (the owner, 2026-10-17).
//
// An event, a stay, a ticket: anything that happens on a day and is not a
// to-do leaves the list once its last day is over in its author's clock, and
// the undated photos and files that came in the same dump go with it, since a
// movie ticket is over when the movie is. A late to-do stays, however late:
// it is still something to do. A repeating row has a next time. A row a person
// put back carries `put_back` and is left where they put it.
//
// Archived, never deleted: it is one tap back from the thread's archived pile.
// Hourly, because a day ends at a different hour in every zone. SQL only, one
// statement, a batch at a time: the first run meets every passed row there has
// ever been, and the handler books the next batch while there is more.

import { sql } from "kysely";
import { db } from "../db.js";

export const PASSED_BATCH = 2000;

export async function archivePassed(
  now = new Date(),
  batch = PASSED_BATCH,
): Promise<{ archived: number; threads: number; more: boolean }> {
  // A zone Postgres does not know would fail the whole statement, so an
  // account's zone is read through its own list, UTC where it has none. The
  // flags are compared as JSON, which cannot raise on an odd value the way a
  // cast to boolean does.
  const result = await sql<{ archived: number; threads: number; passed: number }>`
    with zones as (
      select a.id, coalesce(z.name, 'UTC') as zone
      from accounts a
      left join pg_timezone_names z on z.name = a.time_zone
    ),
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
