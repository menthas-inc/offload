-- 0013 Archive, the shared soft action.
--
-- The whole schema delta for feature 005, which is the point of having cut that
-- feature down to what can be true today.
--
-- `archived_at` and `deleted_at` look alike and are opposites:
--
--   deleted_at   starts an eight second clock ending in destruction, and only
--                the author may start it (OFF-3).
--   archived_at  is a permanent, reversible, anybody-in-the-thread state that
--                means "not in the active list any more". Nothing is destroyed
--                and nothing is scheduled.
--
-- A shared list is unusable without the second one and dangerous with only the
-- first: without archive, a co-owned grocery list fills with rows that only
-- their author can clear, which is the friction that makes people abandon a
-- shared list. With only delete available to everyone, a shared thread becomes
-- a place where somebody else can destroy what you put in.
--
-- A row can be archived and later deleted. It cannot be deleted and later
-- archived, because after eight seconds it is not there.

alter table content add column archived_at timestamptz;

-- The active list, which is what the thread page reads every time it opens and
-- the only content query on the hot path.
create index content_thread_active_idx
  on content (thread_id, created_at desc)
  where deleted_at is null and archived_at is null;

-- Archived, read on demand and never on the hot path. Separate rather than one
-- index over both, because the active read is the frequent one and it should
-- not walk past rows somebody has already cleared.
create index content_thread_archived_idx
  on content (thread_id, archived_at desc)
  where deleted_at is null and archived_at is not null;

-- content_thread_idx from 0011 stays. It covers both states, which is what the
-- counts query wants: Postgres will not scan two partial indexes in one
-- statement, so a single index covering both plus a filter per count is the
-- shape that actually works.
