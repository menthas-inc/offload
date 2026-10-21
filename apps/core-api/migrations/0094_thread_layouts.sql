-- 0094 Thread layouts: a thread has a layout, one of six.
--
-- Decided with the owner on 2026-10-19 (design handoff
-- APPLY-2026-10-19-thread-layouts.md). A thread is laid out as one of six:
-- default (the page as built), todo, events, gallery, project, timeline.
-- offload may name one in the call that makes the thread; after that only a
-- person changes it. A column, not attrs, because Today reads it as a predicate
-- (0016's own test for leaving attrs). Every existing thread reads 'default',
-- set by offload, which is exactly today.
--
-- The suggestion the nightly pass may write, once, lives beside it; the seen
-- stamp for the one-time heads-up to other members lives on the membership.

alter table threads
  add column layout text not null default 'default'
    check (layout in ('default', 'todo', 'events', 'gallery', 'project', 'timeline')),
  add column layout_set_by text not null default 'offload'
    check (layout_set_by in ('offload', 'person')),
  add column layout_changed_at timestamptz,
  add column layout_changed_by uuid references accounts (id) on delete set null,
  -- At most one suggestion per thread, ever. Never 'default': a suggestion is
  -- always a move off it.
  add column layout_suggestion text
    check (layout_suggestion in ('todo', 'events', 'gallery', 'project', 'timeline')),
  add column layout_suggestion_dismissed_at timestamptz;

-- When each member last saw the layout as it stands, so the "Ana switched this
-- to Events" line draws once per member per change.
alter table thread_members add column layout_seen_at timestamptz;
