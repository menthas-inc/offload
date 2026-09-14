-- 016. What a turn read, what kind of lookup it was, and who may look at all.
--
-- Three tables and two columns, and the shape of each is an argument rather
-- than a convenience. The reasoning is in docs/specs/016-reaching-the-web/.

-- What a turn read, for the source chips under it.
--
-- `domain` is stored beside `url` rather than parsed on read, because three
-- clients parsing a URL is three parsers that disagree about a trailing dot.
create table turn_sources (
  id uuid primary key default uuid_v7(),
  account_id uuid not null references accounts (id) on delete cascade,
  turn_id uuid not null,
  domain text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index turn_sources_turn_idx on turn_sources (turn_id);

comment on table turn_sources is
  'Where a turn got something from, for the chip under it. Never the page, never its title, never a quoted excerpt: those are written by whoever owns the page.';

-- What kind of lookup happened, so the next narrow tool is argued from counts
-- rather than from whichever example somebody thought of.
--
-- **No query, no URL, no page.** A search query is the person''s own sentence,
-- and anonymising it does not make it not content: a query is frequently
-- identifying on its own, which is why every leaked search log has been a
-- disaster. What is here is a label from a closed set, what became of the
-- answer, and what it cost.
create table lookups (
  id uuid primary key default uuid_v7(),
  account_id uuid not null references accounts (id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('search', 'read')),
  outcome text not null check (
    outcome in ('used', 'unused', 'empty', 'failed', 'refused_bound')
  ),
  cost_micros integer not null default 0,
  created_at timestamptz not null default now()
);

create index lookups_label_idx on lookups (label, created_at);

comment on column lookups.label is
  'One of a closed set, validated in code. Anything else is stored as other and the string the model produced is discarded.';
comment on column lookups.outcome is
  'unused is the one that matters: a lookup whose answer never reached a row or a reply is a lookup that should not have happened.';

-- Which domains get read, with nobody attached.
--
-- **Aggregate by construction rather than by policy.** There is no account id
-- and no message id and no foreign key to either, deliberately, so there is no
-- row here that ties a domain to a person and no query that could.
create table domain_reads (
  domain text not null,
  day date not null,
  count integer not null default 0,
  primary key (domain, day)
);

-- And a floor, because a count of one on a rare personal domain is
-- re-identifying to anybody who knows who was awake that day, and this is an
-- invite-only alpha where that is one person.
create view domain_reads_visible as
select domain, day, count
from domain_reads
where count >= 5;

comment on view domain_reads_visible is
  'The only way to read the tally. Rare domains are suppressed rather than rounded, because rounding a one to a five is a lie and dropping it is not.';

-- Who may look things up, and how.
--
-- Two rather than one because they are two different promises: a search sends
-- somebody''s own words to a third party, and reading a link they pasted opens
-- something they already chose. Defaulting both on is a deliberate departure
-- from the pattern that says content leaving offload defaults off, recorded in
-- 016''s feature spec rather than left to be discovered here.
alter table accounts
  add column web_search_enabled boolean not null default true,
  add column web_links_enabled boolean not null default true;

-- And the grant, column by column, which is how this role has read accounts
-- since 0010 narrowed it away from `grant select on accounts` (every column:
-- email, display name, referral, the lot). Two more columns, named.
grant select (web_search_enabled, web_links_enabled) on accounts to offload_agent;

-- The worker never writes any of 016's tables: sources and lookups ride home on
-- the existing turn-result payload, which the Core API writes. So no insert
-- grant here, deliberately, and the absence is the point.
