-- 0097 My threads in a person's own order (2026-10-29, design handoff
-- APPLY-2026-10-29-threads-grid.md).
--
-- My threads opens newest made first. A drag makes the person's own order:
-- one list per person, so a shared thread sits where each member put it.
-- Switching back to newest first keeps the list, so the order comes back as it
-- was. Ids and a word, no words of the person's; goes with the account. An id
-- the person can no longer see stays harmlessly and is skipped on read.

create table thread_order (
  account_id uuid primary key references accounts (id) on delete cascade,
  sort       text not null default 'newest' check (sort in ('newest', 'mine')),
  ids        uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 048. An order made on one device reaches the person's other screens. Ids
-- only, as every live trigger: the account, never the list.
create trigger live_thread_order after insert or update or delete on thread_order
  for each row execute function live_notify('order', 'account_id');
