-- 035 part B. A copy of everything an account can read, kept seven days.
--
-- One row per account at most. The archive itself is in the object store, cut
-- into parts and sealed under a key made for this copy; that key is here,
-- wrapped under the account's own, so the row and the parts are useless apart
-- and both go with the account (OFF-2).
--
-- `requested_at` is the clock for both seven days: the copy is destroyed at
-- `expires_at` and the next one may be asked for then. A build that failed
-- clears both, so a failure does not cost anybody a week.
--
-- `thread_ids` is which threads the archive holds, so leaving or being taken
-- out of one can find the copy to destroy without opening it. `parts` counts
-- up as each part is stored, so whatever stops a build, what it wrote can be
-- removed by number.
create table exports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  state text not null default 'making' check (state in ('making', 'ready', 'failed', 'gone')),
  requested_at timestamptz default now(),
  ready_at timestamptz,
  expires_at timestamptz default now() + interval '7 days',
  parts integer not null default 0,
  byte_size bigint not null default 0,
  wrapped_key bytea not null,
  thread_ids uuid[] not null default '{}'
);

-- The hourly sweep reads what has run out and is not yet destroyed.
create index exports_expires_idx on exports (expires_at) where state <> 'gone';

-- Activity says once that a copy is ready. Never pushed.
alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check
  check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted', 'labelled', 'mail', 'export'));
