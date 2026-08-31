-- 0001 Getting in.
--
-- The subset of the spec 001 model that feature 002 actually reads or writes.
-- The rest of the model arrives with the features that use it: bringing up
-- tables no code touches would be building ahead of a spec (DEV-1).
--
-- Conventions, from spec 001:
--   UUIDv7 primary keys, time-ordered so they cluster on insert.
--   No enum types. Kinds and states are text with a CHECK, because adding a
--   value to a Postgres enum is a migration that locks and adding one to a
--   check constraint is not.
--   Soft delete is deleted_at plus purge_after. If a table has one it has both.
--   Every index is partial on deleted_at IS NULL, so tombstones stay out.

create extension if not exists pgcrypto;

-- UUIDv7. Postgres 18 has uuidv7() natively; this is the portable fallback so
-- the migration runs on whatever version Railway gives us today.
--
-- Ordering is per millisecond, not within one. The leading 48 bits are the
-- timestamp, so ids cluster on insert and sort by creation time at millisecond
-- granularity; ids minted inside the same millisecond order randomly against
-- each other. That is the basic RFC 9562 form and it is fine for both things we
-- rely on: B-tree locality cares about the timestamp prefix, and cursor
-- pagination orders on the (created_at, id) tuple, which is a stable total
-- order regardless. Do not assume monotonicity inside a millisecond.
create or replace function uuid_v7() returns uuid as $$
  select encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
                from 1 for 6),
        52, 1),
      53, 1), 'hex')::uuid;
$$ language sql volatile;

-- ---------------------------------------------------------------- accounts

create table accounts (
  id                     uuid primary key default uuid_v7(),
  state                  text not null default 'waitlist'
                           check (state in ('waitlist', 'invited', 'active', 'disabled')),
  display_name           text,
  email                  text not null,
  email_verified         boolean not null default false,
  default_thread_id      uuid,
  referred_by_account_id uuid references accounts (id) on delete set null,
  referral_thread_id     uuid,
  analytics_subject_id   uuid unique,
  waitlist_email_sent_at timestamptz,
  tier                   text not null default 'beta',
  consent_version        text,
  consented_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  disabled_at            timestamptz,
  deleted_at             timestamptz
);

-- One address is one account, enforced by the database rather than by whoever
-- writes the next insert. Without it two waitlist submissions of the same
-- address produce two rows, and then "look up the account by verified email"
-- during sign-in has two answers. The public waitlist endpoint is bursty and
-- adversarial by design, so that is the ordinary case, not a race.
create unique index accounts_email_key on accounts (lower(email)) where deleted_at is null;

-- The admin Waitlist page, and the only list here that grows unattended.
create index accounts_state_created_idx on accounts (state, created_at) where deleted_at is null;

-- ------------------------------------------------------- account_identities

create table account_identities (
  id             uuid primary key default uuid_v7(),
  account_id     uuid not null references accounts (id) on delete cascade,
  provider       text not null check (provider in ('apple', 'google')),
  subject        text not null,
  email          text,
  email_verified boolean not null default false,
  created_at     timestamptz not null default now()
);

create unique index account_identities_provider_subject_key
  on account_identities (provider, subject);
create index account_identities_account_idx on account_identities (account_id);

-- ------------------------------------------------------------------- staff

create table staff (
  account_id uuid primary key references accounts (id) on delete cascade,
  role       text not null check (role in ('support', 'owner')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- threads

create table threads (
  id                     uuid primary key default uuid_v7(),
  created_by_account_id  uuid references accounts (id) on delete set null,
  name                   text not null,
  always_on              boolean not null default false,
  icon                   text,
  thing_count            integer not null default 0,
  last_activity_at       timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  purge_after            timestamptz
);

-- There is no is_default column. The default thread is named by
-- accounts.default_thread_id, so one per account is structural: an account is
-- one row and one row holds one pointer.
alter table accounts
  add constraint accounts_default_thread_fk
  foreign key (default_thread_id) references threads (id) on delete set null;

-- ---------------------------------------------------------- thread_members

create table thread_members (
  id           uuid primary key default uuid_v7(),
  thread_id    uuid not null references threads (id) on delete cascade,
  account_id   uuid not null references accounts (id) on delete cascade,
  invited_by   uuid references accounts (id) on delete set null,
  state        text not null default 'pending'
                 check (state in ('pending', 'accepted', 'declined', 'expired')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  expires_at   timestamptz
);

create unique index thread_members_thread_account_key on thread_members (thread_id, account_id);

-- Readable threads: one indexed lookup, not a union of owned and granted,
-- because threads have members and no owner.
create index thread_members_account_state_idx on thread_members (account_id, state, thread_id);

-- -------------------------------------------------------------------- keys

create table account_keys (
  account_id  uuid primary key references accounts (id) on delete cascade,
  wrapped_dek bytea not null,
  -- Names the root that wrapped this key: db:v1 now, aws-kms:<arn> later.
  -- Without it, moving root custody stops being one rewrap job.
  wrapped_by  text not null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  rotated_at  timestamptz
);

create table thread_keys (
  thread_id  uuid not null references threads (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  wrapped_tk bytea not null,
  created_at timestamptz not null default now(),
  primary key (thread_id, account_id)
);

-- -------------------------------------------------------------------- jobs

create table jobs (
  kind            text not null check (kind ~ '^[a-z][a-z0-9_.]*$'),
  id              uuid primary key default uuid_v7(),
  account_id      uuid references accounts (id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,
  priority        smallint not null default 100,
  run_after       timestamptz not null default now(),
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  state           text not null default 'queued'
                    check (state in ('queued', 'running', 'done', 'failed', 'dead')),
  locked_at       timestamptz,
  locked_by       text,
  idempotency_key text unique,
  -- Truncated and scrubbed before it is written. An email provider's rejection
  -- quotes the recipient, and a recipient address in a log is an OFF-1
  -- violation.
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Interactive jobs take a lower priority number than scheduled ones, which is
-- how scheduled work is stopped from starving interactive work.
create index jobs_runnable_idx on jobs (priority, run_after) where state = 'queued';

-- -------------------------------------------------------- analytics_events

create table analytics_events (
  id           uuid primary key default uuid_v7(),
  name         text not null,
  version      integer not null default 1,
  occurred_at  timestamptz not null,
  received_at  timestamptz not null default now(),
  anonymous_id uuid,
  -- The pseudonym, never a real account id. Erasure destroys the mapping on
  -- accounts.analytics_subject_id, after which every event already written is
  -- permanently unattributable without touching a single archived file.
  subject_id   uuid,
  session_id   uuid,
  source       text not null,
  platform     text,
  -- Structured references only. Never a title, a transcript or a dumped URL.
  properties   jsonb not null default '{}'::jsonb,
  shipped_at   timestamptz
);

create index analytics_events_unshipped_idx on analytics_events (received_at) where shipped_at is null;
