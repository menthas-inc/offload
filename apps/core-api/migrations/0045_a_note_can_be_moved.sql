-- A note has a place in its list, and a person can change it.
--
-- Notes were ordered by when they were written and nothing else, so the only
-- way to move one up was to write it again. The To do list already orders by
-- priority and a person already sets that; this gives a note the same number,
-- on the same 0 to 100 scale, so dragging a row works the same way in both
-- lists and the helper that computes the number is shared.
--
-- Default 50 rather than 0, so there is room to move a note either way before
-- the list has to be re-spread. Every note that exists today keeps its order:
-- equal priorities fall back to created_at, which is the order it had.
--
-- **It is not precedence.** Which of two disagreeing notes is true is decided
-- by updated_at, and moving a note does not touch that column: a note dragged
-- to the top has not been written again.
alter table notes add column priority smallint not null default 50;

-- Dropped and recreated rather than replaced: the view is `notes.*`, which
-- froze its column list when it was created, and `create or replace view` may
-- only append columns while `*` puts the new one in the middle.
drop view if exists readable_notes;

create view readable_notes as
select notes.*, thread_members.account_id as viewer_account_id
from notes
join thread_members on thread_members.thread_id = notes.subject_id
where notes.scope = 'thread'
  and thread_members.state = 'accepted';
