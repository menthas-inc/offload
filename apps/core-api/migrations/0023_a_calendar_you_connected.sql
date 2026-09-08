-- The first connector, and the tables every later one will copy.
--
-- Four things are kept apart on purpose. A **connection** is one Google account
-- somebody linked. Its **secrets** are in a table of their own, sealed under a
-- key of their own, because credentials to somebody else's system are not
-- content. A **calendar** is one of the calendars that account can see, with the
-- two facts offload decides things by: who may write to it, and whether anybody
-- else sees it. **Rules** send some of a calendar's events somewhere other than
-- its default thread.
--
-- None of these carries an account id except the connection. Ownership is one
-- join away and a second copy is a second thing to keep in step; every route
-- resolves it through the connection rather than trusting a denormalised
-- column, which is a bug this repository has already fixed twice.

create table connector_connections (
  id                      uuid primary key default uuid_v7(),
  account_id              uuid not null references accounts (id) on delete cascade,
  provider                text not null default 'google' check (provider in ('google')),
  -- Which Google account this is, shown in Settings so two connections are
  -- tellable apart. Not an identity: sign-in's address may be a different one.
  external_account_email  text not null,
  -- needs_reauth is a state and not an error. A refresh token the person
  -- revoked in Google is their decision: the sync stops, Settings offers
  -- Reconnect, and nothing retries into a wall.
  state                   text not null default 'active'
                            check (state in ('active', 'needs_reauth', 'revoked')),
  connected_at            timestamptz not null default now(),
  last_sync_at            timestamptz,
  last_error_at           timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create index connector_connections_account_idx
  on connector_connections (account_id)
  where deleted_at is null;

-- One Google account connected once. A second attempt reconnects rather than
-- stacking a duplicate nobody asked for.
create unique index connector_connections_unique_idx
  on connector_connections (account_id, provider, external_account_email)
  where deleted_at is null;

create table connector_secrets (
  connection_id       uuid primary key references connector_connections (id) on delete cascade,
  -- Sealed with AES-256-GCM under CONNECTOR_VAULT_KEY, bound to this row and
  -- this column by associated data, so a ciphertext moved between rows fails to
  -- open rather than opening as something else.
  access_token        bytea not null,
  refresh_token       bytea,
  access_expires_at   timestamptz,
  scope               text,
  -- Which key sealed it. account_keys.wrapped_by exists for exactly this reason
  -- and without it a rotation cannot tell which rows it has already moved.
  wrapped_by          text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table connector_calendars (
  id                 uuid primary key default uuid_v7(),
  connection_id      uuid not null references connector_connections (id) on delete cascade,
  external_id        text not null,
  summary            text not null,
  timezone           text,
  -- Google's word on what this account may do here, refreshed on every sync.
  access_role        text not null
                       check (access_role in ('owner', 'writer', 'reader', 'freeBusyReader')),
  -- **Does anybody but you see this**, which decides whether a write to it is
  -- reversible or has to be confirmed first.
  --
  -- The person's answer, not Google's. Reading Google's access list would need
  -- another sensitive scope and would still get it wrong: a calendar can be
  -- public to anyone with the link, or visible to a whole Workspace domain, and
  -- neither is an access-list entry. One member and readable by the world is a
  -- real state. The person who owns the calendar knows; nothing else does.
  --
  -- **Defaults true**, because the safe direction is a confirmation nobody
  -- needed rather than a notification nobody expected. Forced back to true by
  -- the sync whenever access_role stops being owner, since an invariant checked
  -- only when it is written goes stale the day somebody shares the calendar.
  is_shared          boolean not null default true,
  is_primary         boolean not null default false,
  -- Reads into offload at all. A calendar that reads must name a thread: an
  -- event offload holds is a content row and content.thread_id has been not
  -- null since 0008.
  selected           boolean not null default false,
  default_thread_id  uuid references threads (id) on delete set null,
  sync_token         text,
  synced_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint connector_calendars_selected_needs_thread
    check (not selected or default_thread_id is not null),
  -- Somebody else owning it is proof somebody else sees it.
  constraint connector_calendars_unowned_is_shared
    check (access_role = 'owner' or is_shared)
);

create unique index connector_calendars_unique_idx
  on connector_calendars (connection_id, external_id);

create index connector_calendars_connection_idx
  on connector_calendars (connection_id);

create table connector_calendar_rules (
  id           uuid primary key default uuid_v7(),
  calendar_id  uuid not null references connector_calendars (id) on delete cascade,
  ordinal      integer not null,
  match_kind   text not null check (match_kind in ('title_contains', 'attendee_is', 'all')),
  match_value  text,
  thread_id    uuid not null references threads (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index connector_calendar_rules_calendar_idx
  on connector_calendar_rules (calendar_id, ordinal);

-- An outward-facing write the model proposed and nobody has agreed to yet.
--
-- Every tool in this product executes inside the turn and returns a result:
-- there is no pending state anywhere, so "confirmed first" had no meaning for a
-- model-initiated write. It would have gone straight to Google, which is the
-- one thing the confirmation rule exists to prevent. Nothing in this table has
-- reached Google. It expires after an hour, and expiry is an ordinary ending
-- rather than a failure, because an unconfirmed proposal changed nothing.
create table connector_pending_writes (
  id            uuid primary key default uuid_v7(),
  account_id    uuid not null references accounts (id) on delete cascade,
  calendar_id   uuid not null references connector_calendars (id) on delete cascade,
  action        text not null check (action in ('create', 'edit', 'delete')),
  -- Which occurrences an edit or a delete touches. Never asked as a question:
  -- read from what the person said, and defaulted to one occurrence.
  scope         text check (scope in ('one', 'following')),
  payload       jsonb not null,
  source_ref    text,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  declined_at   timestamptz
);

create index connector_pending_writes_account_idx
  on connector_pending_writes (account_id, created_at desc)
  where confirmed_at is null and declined_at is null;

-- One row per occurrence, and a re-sync updates rather than duplicating.
-- source_ref has existed since 0008 as the connector seam and nothing has ever
-- written it; this is what it was for.
create unique index content_source_ref_idx
  on content (account_id, source_ref)
  where source_ref is not null;
