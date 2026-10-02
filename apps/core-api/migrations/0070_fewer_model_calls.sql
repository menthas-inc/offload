-- 032. Fewer, better model calls.
--
-- A row typed into a section is saved as typed, and the nightly compaction,
-- loose proposal and label sort jobs become one pass per thread. Nothing claims
-- the four retired kinds any more, so a job of one still waiting at deploy is
-- closed here rather than left queued forever.
update jobs
   set state = 'done', locked_at = null, locked_by = null, updated_at = now()
 where kind in ('thread.quick_add', 'notes.compact', 'loose.propose', 'labels.sort')
   and state in ('queued', 'running');

-- Quick add was the only writer of filing_at. A row it was reading at deploy
-- would otherwise be drawn as being sorted until the clients' patience ran out.
update content set filing_at = null where filing_at is not null;
