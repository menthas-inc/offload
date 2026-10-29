-- 0095 Thread layouts: the one pass each open thread is owed.
--
-- Until 2026-10-29 the nightly pass was asked for a layout without being shown
-- the thread's rows, and it was only booked on a new dump, so a quiet thread
-- made before 0094 never had a pass that could judge one. Every thread still
-- open to a suggestion is owed one pass with its rows in view; the Core API
-- books it however quiet the thread is and clears this when a pass applies.

alter table threads add column layout_pass_owed boolean not null default false;

update threads set layout_pass_owed = true
 where deleted_at is null
   and layout = 'default'
   and layout_set_by = 'offload'
   and layout_suggestion is null
   and layout_suggestion_dismissed_at is null;
