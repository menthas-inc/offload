-- 0008 The dump.
--
-- The three tables feature 003 actually reads or writes, from the spec 001
-- model: conversations, messages and llm_usage. Same conventions as 0001,
-- UUIDv7 keys, text plus CHECK rather than enums, deleted_at with purge_after
-- wherever there is one, and every index partial on deleted_at IS NULL.
--
-- things, blobs and thing_blobs are deliberately NOT created. Nothing in 003
-- writes them, and a table that exists before its first writer collects columns
-- whose meaning nobody remembers choosing (DEV-1). They arrive with the sorter.

-- A conversation is a working session, not a thread and not a filing location.
-- A dump joins the newest one if it is under six hours old and starts a new one
-- otherwise, which is 003's answer to the question spec 001 left open.
create table conversations (
  id               uuid primary key default uuid_v7(),
  account_id       uuid not null references accounts (id) on delete cascade,
  -- Null in 003. Naming a conversation is a model call that needs a reason to
  -- exist, and it has none while there is one screen and no list.
  title            text,
  started_at       timestamptz not null default now(),
  -- Denormalised rather than a max() over messages, because the six-hour join
  -- reads it on every single dump and that is the hottest read in the feature.
  -- Written in the same transaction as the message that moves it.
  last_message_at  timestamptz not null default now(),
  -- Set when offload replies, cleared when the person reads it. Nullable rather
  -- than a pair of timestamps to compare, so "is anything unread" is one
  -- partial index over one row or none.
  unread_at        timestamptz,
  last_read_at     timestamptz,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  purge_after      timestamptz
);

-- A message from a person is a dump. role and type are separate because a dump
-- can be a voice note while the reply is always text, and 003 only ever writes
-- text: the other types arrive with attachments.
create table messages (
  id               uuid primary key default uuid_v7(),
  conversation_id  uuid not null references conversations (id) on delete cascade,
  account_id       uuid not null references accounts (id) on delete cascade,
  role             text not null check (role in ('person', 'offload')),
  type             text not null default 'text'
                     check (type in ('text', 'link', 'image', 'screenshot', 'voice', 'file')),
  -- Groups the messages belonging to one model turn, so an at-least-once
  -- delivery cannot double-render an answer.
  turn_id          uuid not null,
  text             text,
  -- seen is what the 👀 marker renders: offload has it and has not answered.
  -- queued is internal and never reaches a client.
  state            text not null default 'queued'
                     check (state in ('queued', 'seen', 'answered', 'failed')),
  -- The outbox idempotency key. On messages rather than anywhere downstream
  -- because a retry from a device that never heard the response must not create
  -- the dump twice.
  client_key       text,
  source           text not null default 'person'
                     check (source in ('person', 'share', 'gmail', 'calendar', 'browser')),
  source_ref       text,
  attrs            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  purge_after      timestamptz
);

-- The token ledger. No content and no free text, so nothing in it ages out and
-- it is kept indefinitely: spec 001 left that unwritten and DATA-1 asks.
--
-- job_kind draws from the same open set as jobs.kind and must match it, because
-- the admin Costs page groups spend by the job being paid for and silently
-- misgroups if the two drift.
create table llm_usage (
  id                 uuid primary key default uuid_v7(),
  account_id         uuid not null references accounts (id) on delete cascade,
  job_kind           text not null,
  category           text not null check (category in ('interactive', 'scheduled')),
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cost_micros        bigint not null default 0,
  latency_ms         integer not null default 0,
  created_at         timestamptz not null default now()
);

-- Covers both the six-hour join and the newest-conversation read, which are the
-- same query with a different predicate on the same leading columns.
create index conversations_recent_idx
  on conversations (account_id, last_message_at desc)
  where deleted_at is null;

-- One row or none per account, so the partial index is the whole answer to
-- "does this person have anything waiting".
create index conversations_unread_idx
  on conversations (account_id)
  where unread_at is not null and deleted_at is null;

-- The composer's tail read, newest first.
create index messages_tail_idx
  on messages (conversation_id, created_at desc)
  where deleted_at is null;

-- Idempotency. Partial because most messages have no client key: only a client
-- that might retry sends one.
create unique index messages_client_key_idx
  on messages (account_id, client_key)
  where client_key is not null;

create index llm_usage_account_idx
  on llm_usage (account_id, created_at desc);
