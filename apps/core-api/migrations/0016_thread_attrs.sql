-- 0016 A thread can be told how it wants to look.
--
-- Two preferences, both optional: which tag dimension each widget groups by,
-- and what order the widgets come in. Absent means derived from what the thread
-- actually holds, so a trip full of places leads with the map without anybody
-- choosing.
--
-- **`attrs` rather than columns, and this is the one place 001's rule bends.**
-- 001 says `attrs` holds what no screen queries, and a screen queries these.
-- The rule is a proxy for the real test, which is whether a value ever appears
-- in a WHERE clause: these are read whole with the thread they belong to, on
-- the query that already fetches it, and nothing filters or sorts by them. A
-- column per preference would be two columns today and one per widget kind
-- forever.
alter table threads add column attrs jsonb not null default '{}'::jsonb;

-- The three indexes 006 deliberately left out, now that something reads them.
--
-- 006's reasoning was that nothing in 005 or 006 queried them and 007 might
-- want a different column order. It did not; they are as drafted. The
-- discipline was still right: an index with no reader is a guess that looks
-- like a decision.

-- The thread page's own ordering: priority first, then recency.
create index content_thread_priority_idx
  on content (thread_id, priority desc, created_at desc)
  where deleted_at is null and archived_at is null;

-- What the to-do widget draws, which is the only widget with a predicate
-- narrow enough to be worth its own index.
create index content_thread_open_tasks_idx
  on content (thread_id, priority desc)
  where type = 'task' and done_at is null
    and deleted_at is null and archived_at is null;

-- The timeline, and later the agenda.
create index content_thread_dated_idx
  on content (thread_id, occurs_at)
  where occurs_at is not null and deleted_at is null and archived_at is null;
