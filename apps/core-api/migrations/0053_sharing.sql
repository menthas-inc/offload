-- 022. Sharing: connections, requests, blocks, a said share, the mark, and
-- one view that says who may see whom.
--
-- **A connection is one row per unordered pair.** 001's impl-spec kept it as
-- `people.linked_account_id` in a per-account address book that nothing ever
-- built. A connection is a mutual fact between two accounts, so it is one row
-- with `account_a < account_b`: mutual is structural, and removing it is one
-- delete rather than two rows that have to agree.
--
-- **A request that was never delivered still exists.** When the recipient
-- had blocked the requester the row is written with `delivered = false`, so
-- the requester's Pending list, its date and the seven-day rule behave exactly
-- as for a delivered request. Dropping it would have left their list empty,
-- which is the one tell the design says a decline must not have.
--
-- **A waiting share is `thread_members` in `pending`, as 001 built it**, and
-- gains `preview`: the count and two of the sharer's own titles, taken when
-- the share was made and nulled on accept. The invitation reads that and
-- never the thread, so a person who has not accepted never sees a row another
-- member wrote and cannot be shown a changing feed by a share made and
-- withdrawn. `removed` joins the states: taking somebody out is leaving done
-- to them, and the row keeps who did it, as ids, for a question the product
-- never raises but support might.
--
-- **The mark is drawn once from the id and never rewritten.** Not content:
-- it is a function of the account id and says nothing about the person, so
-- it sits plain on the row. `pngjs` draws it on first read.
--
-- **`visible_people` is the one predicate**, read by the lookup, the share
-- sheet, the @ list, My people, the person page, the mark and the share
-- tool. Rows are (viewer, account, relation). The reader still filters the
-- account's state and a block the other way, in `visibleTo`, so that the two
-- halves are tested as one. The agent role gets none of these tables: the
-- tool resolves people on this side of the boundary.

create table connections (
  account_a  uuid not null references accounts (id) on delete cascade,
  account_b  uuid not null references accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_a, account_b),
  check (account_a < account_b)
);
create index connections_b_idx on connections (account_b);

create table connection_requests (
  id              uuid primary key default uuid_v7(),
  from_account_id uuid not null references accounts (id) on delete cascade,
  to_account_id   uuid not null references accounts (id) on delete cascade,
  delivered       boolean not null default true,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  -- Not now. The card goes and the row stays, so the requester sees nothing.
  dismissed_at    timestamptz,
  -- The requester's Withdraw, or the request ending with its expiry, a
  -- removal or a block. Set by the daily job for expiry so a row is never
  -- half alive.
  withdrawn_at    timestamptz,
  accepted_at     timestamptz,
  check (from_account_id <> to_account_id)
);
-- One open request per pair. Expired rows count as open here until the daily
-- job withdraws them, which is what stops a second request inside the window.
create unique index connection_requests_open_key
  on connection_requests (from_account_id, to_account_id)
  where accepted_at is null and withdrawn_at is null;
-- The dot, and the cards: what is waiting for this account's answer.
create index connection_requests_waiting_idx
  on connection_requests (to_account_id)
  where accepted_at is null and withdrawn_at is null and dismissed_at is null and delivered;
-- The seven-day rule reads the last request to this person, open or not.
create index connection_requests_recent_idx
  on connection_requests (from_account_id, to_account_id, created_at);

create table blocks (
  blocker_account_id uuid not null references accounts (id) on delete cascade,
  blocked_account_id uuid not null references accounts (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (blocker_account_id, blocked_account_id),
  check (blocker_account_id <> blocked_account_id)
);
create index blocks_blocked_idx on blocks (blocked_account_id);

-- A said share, proposed by the model and waiting for the person's tap. The
-- calendar's `connector_pending_writes` is the same idea for a different
-- destination; they stay apart because their checks share nothing.
create table pending_shares (
  id                uuid primary key default uuid_v7(),
  account_id        uuid not null references accounts (id) on delete cascade,
  message_id        uuid not null references messages (id) on delete cascade,
  thread_id         uuid not null references threads (id) on delete cascade,
  target_account_id uuid not null references accounts (id) on delete cascade,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '1 hour',
  confirmed_at      timestamptz,
  declined_at       timestamptz
);
create index pending_shares_message_idx on pending_shares (message_id)
  where confirmed_at is null and declined_at is null;

-- Who looked somebody up, for the hourly cap. Never the address.
create table people_lookups (
  account_id   uuid not null references accounts (id) on delete cascade,
  looked_up_at timestamptz not null default now()
);
create index people_lookups_idx on people_lookups (account_id, looked_up_at);

alter table thread_members
  drop constraint thread_members_state_check,
  add constraint thread_members_state_check
    check (state in ('pending', 'accepted', 'declined', 'expired', 'removed')),
  add column preview               jsonb,
  add column removed_by_account_id uuid references accounts (id) on delete set null,
  add column removed_at            timestamptz;
-- Three waiting shares per pair, across threads.
create index thread_members_pair_pending_idx
  on thread_members (invited_by, account_id) where state = 'pending';

alter table accounts add column avatar_png bytea;

-- The worker asks one thing of this table: whether the account has any
-- connection at all, which decides whether the share tool is sent. Who is
-- connected to whom it already knows from thread_members, which it reads
-- whole, so the pair table adds nothing it did not have. Nothing else here
-- is granted: the requests, the blocks and the mark stay on this side.
grant select on connections to offload_agent;

create view visible_people as
  select account_a as viewer_account_id, account_b as account_id, 'connected' as relation
    from connections
  union all
  select account_b, account_a, 'connected'
    from connections
  union all
  select to_account_id, from_account_id, 'asked_you'
    from connection_requests
    where accepted_at is null and withdrawn_at is null and expires_at > now() and delivered
  union all
  select from_account_id, to_account_id, 'you_asked'
    from connection_requests
    where accepted_at is null and withdrawn_at is null and expires_at > now()
  union all
  select a.account_id, b.account_id, 'thread'
    from thread_members a
    join thread_members b on b.thread_id = a.thread_id and b.account_id <> a.account_id
    join threads t on t.id = a.thread_id and t.deleted_at is null
    where a.state = 'accepted' and b.state = 'accepted'
  union all
  -- The share sheet lists who a thread is waiting on, and a face on that
  -- list is a person the member can see: their mark, their name. One way
  -- only, since the one waiting sees nobody in the thread until they accept.
  select a.account_id, b.account_id, 'waiting'
    from thread_members a
    join thread_members b on b.thread_id = a.thread_id and b.account_id <> a.account_id
    join threads t on t.id = a.thread_id and t.deleted_at is null
    where a.state = 'accepted' and b.state = 'pending' and (b.expires_at is null or b.expires_at > now())
  union all
  select blocker_account_id, blocked_account_id, 'blocked'
    from blocks;

-- "Which Sam?" A person question, raised by the server from inside the
-- share tool when a name matches two connections, answered on a chip whose
-- label is a display name read from the database. Widened the way 0050
-- widened it, so whatever the set holds today keeps its values.
do $$
declare
  existing text[];
begin
  select array_agg(m[1]) into existing
  from pg_constraint c,
       regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') as m
  where c.conname = 'questions_field_check' and c.conrelid = 'questions'::regclass;
  if existing is null then
    existing := array['date', 'span', 'time', 'tag', 'country', 'calendar', 'thread'];
  end if;
  if not ('person' = any(existing)) then
    existing := array_append(existing, 'person');
  end if;
  execute 'alter table questions drop constraint if exists questions_field_check';
  execute format(
    'alter table questions add constraint questions_field_check check (field in (%s))',
    (select string_agg(quote_literal(v), ', ') from unnest(existing) as v)
  );
end $$;
