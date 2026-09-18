-- 020. Photos: the blob tables 001 designed and nothing wrote until now.
-- Numbered 0050 because a calendar branch took 0049 the same week.
--
-- **A blob belongs to the message it arrived on**, and is held unclaimed
-- between its upload and the message write that claims it. `message_id` is
-- on delete set null, never cascade: account deletion hard-deletes messages,
-- and a photo filed into a shared thread must survive that. The purge job
-- does the refcount (decisions.md, 2026-08-31).
--
-- **One object, one object key, wrapped once per place entitled to open it.**
-- The account wrap is what makes the dump readable in its conversation; a
-- thread wrap exists only where the picture actually landed, created by the
-- filing that put it there, and dropped when nothing in that thread links it
-- any more. The wrap is nonce || ciphertext || tag under the scope's key, the
-- shape keys.ts already stores.
--
-- **The original is stored as it arrived, metadata and all.** What the file
-- knows about itself is read once on the way in and kept here in columns:
-- the coordinate stays on this row and reaches no wire; the town, once a
-- resolver names it, is what the row shows. `name` is the dumper's and is
-- shown to them alone.
create table blobs (
  id                 uuid primary key default uuid_v7(),
  -- Who handed it over. Null once they are gone: the shared thread keeps
  -- the picture, nobody keeps the attribution.
  account_id         uuid references accounts (id) on delete set null,
  message_id         uuid references messages (id) on delete set null,
  -- The outbox idempotency key, one per photo per draft.
  client_key         text not null,
  name               text,
  -- Sniffed from the bytes, never the declared type.
  content_type       text not null,
  byte_size          integer not null check (byte_size > 0),
  width              integer not null check (width > 0),
  height             integer not null check (height > 0),
  sha256             bytea not null,
  encryption_scheme  text not null default 'aesgcm-v1',
  taken_at           timestamptz,
  latitude           double precision,
  longitude          double precision,
  device             text,
  town               text,
  -- When the two renditions were stored, and when the file could not be
  -- opened at all. The wire's `ready` is the first; the plain-title filing
  -- path is the second.
  renditions_at      timestamptz,
  unreadable_at      timestamptz,
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  purge_after        timestamptz
);

-- A retry from a device that never heard the response finds its own upload.
create unique index blobs_client_key_idx on blobs (account_id, client_key);
-- The tail draws a message's photos; the claim checks them.
create index blobs_message_idx on blobs (message_id) where deleted_at is null;
-- The daily ceiling.
create index blobs_account_created_idx on blobs (account_id, created_at desc);
-- The unclaimed sweep: uploaded, never sent, an hour old.
create index blobs_unclaimed_idx on blobs (created_at) where message_id is null and deleted_at is null;
-- The purge.
create index blobs_purge_idx on blobs (purge_after) where deleted_at is not null;

comment on table blobs is
  '020. A photo as it arrived, encrypted in R2 under blobs/<id>/original, with its two renditions beside it. Belongs to its message; refcounted by content_blobs; purged when nothing references it.';
comment on column blobs.name is
  'The file name the dumper saw. Theirs alone: never on a title, in a log, in an event, or sent to the model.';
comment on column blobs.latitude is
  'Where it was taken, exactly, from the file. Stored, never served. What leaves is rounded to three decimals and returns as blobs.town.';

create table blob_keys (
  blob_id            uuid not null references blobs (id) on delete cascade,
  scope              text not null check (scope in ('account', 'thread')),
  scope_id           uuid not null,
  wrapped_object_key bytea not null,
  created_at         timestamptz not null default now(),
  primary key (blob_id, scope, scope_id)
);

comment on table blob_keys is
  '020. The object key, wrapped once per place that may open it: the account for the dump, each thread whose rows carry it.';

-- Which rows carry which blob. Authorization resolves through this and
-- messages, never through a column on blobs.
create table content_blobs (
  content_id         uuid not null references content (id) on delete cascade,
  blob_id            uuid not null references blobs (id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (content_id, blob_id)
);

create index content_blobs_blob_idx on content_blobs (blob_id);

-- A coordinate rounded to about a hundred metres, and the town it is in.
-- No account column: the cache is a phone book, and a lookup table keyed on
-- who asked would be the location list the rounding exists to avoid.
create table place_reverse (
  lat                numeric(7, 3) not null,
  lng                numeric(7, 3) not null,
  town               text,
  resolved_at        timestamptz not null default now(),
  primary key (lat, lng)
);

-- 018's one exception. A photo with no words, from Today, that landed alone in
-- the default thread may be asked which thread. The condition is checked in
-- code on the way in; the set is widened here so the row can exist.
--
-- Widened, not restated: another branch adds `calendar` to the same
-- constraint in its own migration, and the two were written the same week.
-- Whichever runs second must keep the other's value, so this reads the set
-- the constraint holds now and adds `thread` to it. Postgres renders the
-- check as `field = ANY (ARRAY['date'::text, ...])`, which is what the
-- pattern reads, and `field in (...)` is what it writes, which renders the
-- same way for the next migration that does this.
do $$
declare
  existing text[];
begin
  select array_agg(m[1]) into existing
  from pg_constraint c,
       regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') as m
  where c.conname = 'questions_field_check' and c.conrelid = 'questions'::regclass;
  if existing is null then
    existing := array['date', 'span', 'time', 'tag', 'country'];
  end if;
  if not ('thread' = any(existing)) then
    existing := array_append(existing, 'thread');
  end if;
  execute 'alter table questions drop constraint if exists questions_field_check';
  execute format(
    'alter table questions add constraint questions_field_check check (field in (%s))',
    (select string_agg(quote_literal(v), ', ') from unnest(existing) as v)
  );
end $$;

-- The worker reads which photos a message carries and which rows carry them.
-- It never sees a key: the object key stays with the Core API, which hands
-- the worker decrypted bytes over the internal route and takes renditions
-- back the same way. Columns, not the table: the file's name, the exact
-- coordinate and the device are the dumper's and the worker has no read
-- that needs them.
grant select (id, message_id, created_at, deleted_at, renditions_at) on blobs to offload_agent;
grant select on content_blobs to offload_agent;
