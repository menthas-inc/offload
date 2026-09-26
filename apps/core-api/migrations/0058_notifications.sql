-- 024. Notifications: the account's switches and hours, the tokens a phone
-- registers, and Activity, the record of what was sent and what was not.
--
-- Two tables and seven columns. The agent role gets no grant on either table:
-- a token is a delivery capability and Activity is the person's own record.

alter table accounts
  add column notify_due_today          boolean not null default true,
  add column notify_due_today_at       time    not null default '08:00',
  add column notify_coming_tomorrow    boolean not null default true,
  add column notify_coming_tomorrow_at time    not null default '19:00',
  add column notify_people_requests    boolean not null default true,
  add column notify_shared_activity    boolean not null default true,
  add column activity_seen_at          timestamptz;

-- One row per token, and a token belongs to whichever account registered it
-- last: a phone that changes accounts never receives the last account's
-- words. The pattern is Expo's own.
create table push_tokens (
  id           uuid primary key default uuid_v7(),
  account_id   uuid not null references accounts (id) on delete cascade,
  token        text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,64}\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_account_idx on push_tokens (account_id);

-- What offload told somebody, in the words it used, and what it decided not
-- to tell them and why. `about_account_id` is the other member whose words a
-- row carries, so their departure or deletion purges it; `content_id`
-- cascades on the hard purge; `thread_id` with the thread.
create table activity (
  id               uuid primary key default uuid_v7(),
  account_id       uuid not null references accounts (id) on delete cascade,
  kind             text not null check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted')),
  sent             boolean not null,
  reason           text check (reason is null or reason in ('setting', 'permission', 'design')),
  title            text not null check (length(title) <= 200),
  body             text check (body is null or length(body) <= 600),
  send             text check (send is null or send in ('morning', 'evening')),
  thread_id        uuid references threads (id) on delete cascade,
  content_id       uuid references content (id) on delete cascade,
  about_account_id uuid references accounts (id) on delete cascade,
  member_id        uuid references thread_members (id) on delete set null,
  request_id       uuid references connection_requests (id) on delete set null,
  occurred_at      timestamptz not null default now()
);
create index activity_account_idx on activity (account_id, occurred_at desc);
create index activity_thread_idx  on activity (thread_id) where thread_id is not null;
create index activity_about_idx   on activity (about_account_id) where about_account_id is not null;

-- The digest reads reminders across threads; the thread-scoped indexes do
-- not serve it. Partial, on the rows a send can name.
create index content_reminder_due_idx    on content (due_at)    where is_reminder and deleted_at is null and done_at is null and archived_at is null;
create index content_reminder_occurs_idx on content (occurs_at) where is_reminder and deleted_at is null and done_at is null and archived_at is null;
create index content_rule_idx            on content (thread_id) where rrule is not null and deleted_at is null;
