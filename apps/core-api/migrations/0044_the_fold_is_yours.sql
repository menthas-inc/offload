-- The To do fold belongs to the member, not the thread.
--
-- It shipped this morning as a third entry in threads.attrs beside the widget
-- order and the grouping, which made it co-owned: one person folding the
-- finished rows folded them for everyone in a shared list. The other two are
-- about how the thread is arranged and belong to it; this one is about what you
-- have already read, which is yours. So it moves to the membership row, and the
-- copy the thread briefly carried is dropped rather than left to be read.
alter table thread_members add column hide_done boolean not null default false;

update threads set attrs = attrs - 'hideDone' where attrs ? 'hideDone';
