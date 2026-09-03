-- 0014 What offload extracts.
--
-- 005 built a thread page that renders a list of notes, because a note with a
-- title is the only thing offload has ever produced. These are the columns the
-- screens actually read, and the two tables that turn a place name into a point
-- on a map.
--
-- `places` comes first, because `content.place_id` references it. Obvious once
-- it fails, and the first draft of this file had it the other way round.

-- ------------------------------------------------------------------ places
--
-- The geocoder cache, and the one part of the schema shared across every
-- account. Two tables rather than one, because caching by the provider's place
-- id only saves the details lookup once the id is known: the search that turns
-- "Time Out Market" into an id still runs per distinct phrase. One table would
-- have been described as "a place is looked up once", which is not what it
-- would have done.
--
-- **Neither table has an account column and neither may ever gain one.** They
-- hold what a public geocoder returned and nothing that links a place to a
-- person, which is what makes it a phone book rather than somebody's address
-- book. 001 keeps `people` per account for exactly the opposite reason. An
-- account deletion has nothing to remove from here, and that is only correct
-- while this holds.
create table places (
  id                 uuid primary key default uuid_v7(),
  provider           text not null default 'google'
                       check (provider in ('google')),
  provider_place_id  text not null,
  name               text not null,
  formatted_address  text,
  lat                double precision,
  lng                double precision,
  resolved_at        timestamptz not null default now()
);

create unique index places_provider_key on places (provider, provider_place_id);

-- Search text to place id. `query_hash` is a hash of the normalised search
-- string and not the string, so this does not become a plaintext list of every
-- place anybody has ever mentioned. A null `place_id` is a remembered miss, so
-- an unresolvable name is not retried on every dump forever.
create table place_lookups (
  query_hash    text primary key,
  place_id      uuid references places (id) on delete cascade,
  looked_up_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------- content
--
-- The fields a screen reads. `needs_attention`, `embedding`, `waiting_on_*` and
-- `sorted_at` from 001 are still absent, because nothing reads them yet and a
-- column that exists before its first reader collects a meaning nobody
-- remembers choosing.
alter table content
  -- Ticking off. Nullable rather than a boolean, because when something was
  -- done is a fact the agenda will want and a boolean throws it away.
  add column done_at         timestamptz,
  add column due_at          timestamptz,
  add column occurs_at       timestamptz,
  add column occurs_end_at   timestamptz,
  -- A flag, never a type. A task that becomes a reminder must not change type,
  -- because a type change halfway down somebody's list is a migration in the
  -- middle of their afternoon. Nothing acts on this until notifications ship.
  add column is_reminder     boolean not null default false,
  -- One number, 0 to 100, higher first. Not `needs_attention`, which 001
  -- defines as the Today screen's whole query and which nothing writes or reads
  -- yet: priority orders content inside a thread, `needs_attention` decides
  -- what leaves one. Two scopes, so no precedence rule is needed, and saying so
  -- here is cheaper than discovering the collision later.
  add column priority        smallint not null default 0,
  -- A person set it, so the planner must not overwrite it.
  add column priority_pinned boolean not null default false,
  -- Either `dimension:value` or a bare value whose dimension is implicitly
  -- `tag`. Normalised on the way in: lowercased and trimmed in both halves, at
  -- most one value per dimension per row. A row that appears under two headings
  -- is a row somebody has to reconcile by eye every time they read the list.
  add column tags            text[] not null default '{}',
  -- Nullable forever. A location with a name and no pin is a normal, permanent
  -- state: the provider may be down, or may simply not know the place.
  add column place_id        uuid references places (id) on delete set null;

-- `location` joins the set. 001's list did not have it because 001 predates the
-- map widget being a decided thing rather than an open question.
alter table content drop constraint content_type_check;
alter table content add constraint content_type_check
  check (type in ('note', 'link', 'image', 'screenshot', 'voice',
                  'file', 'task', 'event', 'location'));

-- No new indexes, and that is deliberate.
--
-- Priority order, open tasks and dated content all want one, and nothing in 005
-- or 006 reads any of them: `list_thread_content` reuses 005's recency
-- predicate and 005's index. Their consumer is 007, which may want a different
-- column order once it states its queries. Adding them here would be the same
-- mistake as adding a GIN on `tags` for a query nothing runs.

-- The worker reads the new columns for the same reason it reads the old ones:
-- to tell the planner what a resumed turn already filed. Select only.
grant select on places to offload_agent;
