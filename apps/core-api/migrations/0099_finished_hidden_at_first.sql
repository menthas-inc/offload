-- What is finished starts hidden, for every member of every thread (owner,
-- 2026-11-06). The count stays beside To do and one press shows it. A false
-- here never recorded a choice, it was the default, so all of them move.
alter table thread_members alter column hide_done set default true;

update thread_members set hide_done = true where hide_done = false;
