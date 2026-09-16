-- threads.content_count is what is live in the thread: neither archived nor
-- deleted.
--
-- Archiving left it alone until 2026-09-16, so My threads said 9 about a thread
-- whose own page said 7 beside a "2 archived" row. Archive and restore maintain
-- it now, in the same transaction as the write, per 001. This puts every
-- existing thread on the same footing once.
update threads t
set content_count = (
  select count(*)
  from content c
  where c.thread_id = t.id
    and c.archived_at is null
    and c.deleted_at is null
);
