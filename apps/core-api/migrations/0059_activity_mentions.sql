-- 024. Whose words an Activity row carries, and from which thread, one row
-- per pair: a digest names rows across threads and members, and the two
-- columns on `activity` hold one of each. The purges that end a membership
-- or a member read this, so a row that carried another member's words goes
-- when it should, whatever else it also said. No agent grant.

create table activity_mentions (
  activity_id      uuid not null references activity (id) on delete cascade,
  thread_id        uuid not null references threads (id) on delete cascade,
  about_account_id uuid not null references accounts (id) on delete cascade,
  primary key (activity_id, thread_id, about_account_id)
);
create index activity_mentions_thread_idx on activity_mentions (thread_id);
create index activity_mentions_about_idx  on activity_mentions (about_account_id);
