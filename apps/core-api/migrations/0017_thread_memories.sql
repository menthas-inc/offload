-- 0017 Thread memories.
--
-- 001 specified `memories` in full and it was never migrated, which is why 005
-- renders no standing block: the table had no writer. This gives it one, for a
-- subset of what 001 described, and 008's impl-spec records every divergence.
--
-- Three of those divergences are worth repeating here, because the next person
-- to read this file will be looking at the schema rather than the spec.
--
-- **`account_id` is nullable and never cascades.** 001 has it NULL for thread
-- scope on the argument that a non-null author is "a hole in both directions".
-- That argument is about using the column as the read predicate and it is
-- correct about that. It is not an argument against the column existing: delete
-- is the author's under OFF-3, and a shared thread has to show who wrote each
-- memory. So the column stays, `on delete set null` rather than cascade,
-- because OFF-3 makes it a MUST that account deletion never reaches into a
-- shared thread. A deleted author leaves the memory in place with no name on
-- it, which is the privacy-correct outcome and not a gap.
--
-- *`content.account_id` is `on delete cascade` (0011), which is the same
-- decision made the other way and contradicts both OFF-3 and the privacy page.
-- Nothing exercises it yet because account deletion is not built. Memories do
-- it correctly rather than copying it.*
--
-- **No `standing` unique index.** 001 specifies one standing memory per thread,
-- for a summary blurb nothing writes. Creating an index for a writer that does
-- not exist is how a constraint ends up enforcing the wrong thing later.
--
-- **No `embedding`.** Ten short rows read by `subject_id` need no vector, and
-- adding one would drag pgvector into a migration that does not want it.

create table memories (
  id                       uuid primary key default uuid_v7(),

  -- The author. Decides delete (OFF-3) and shows in a shared thread. It is
  -- NEVER an input to a read: reads resolve through thread_members on
  -- subject_id, and `readableMemory` exists so that is not a convention.
  account_id               uuid references accounts (id) on delete set null,

  scope                    text not null
                             check (scope in ('account', 'thread', 'person')),

  -- A thread_id here. Polymorphic by 001's design, so it carries no foreign
  -- key, which means thread deletion has to remove these explicitly. Nothing
  -- does it for us.
  subject_id               uuid,

  kind                     text not null
                             check (kind in ('going_on', 'person', 'preference',
                                             'noticed', 'standing')),
  text                     text not null,

  -- Corrections beat inference. A person's `stated` outranks offload's
  -- `learned`, and offload may never overwrite the former.
  origin                   text not null check (origin in ('stated', 'learned')),

  -- False for everything this feature writes, person-typed and offload-written
  -- alike: every source here is a person's own dump. A connector-sourced
  -- memory must set it true, which is the point the two-hop injection path 001
  -- describes becomes live.
  derived_from_untrusted   boolean not null default false,

  -- Muted by any member, thread-wide, reversible. The co-owned action that
  -- stands in for `archived_at` on content: it stops a memory reaching the
  -- model without letting one member destroy what another wrote.
  muted_at                 timestamptz,

  derived_from_message_id  uuid references messages (id) on delete set null,
  attrs                    jsonb not null default '{}'::jsonb,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Set when compaction replaces a memory. Nothing sets it yet and every
  -- current-memory query filters it anyway, because the failure mode of
  -- forgetting is silent growth, which is the OFF-8 failure this table exists
  -- inside.
  superseded_at            timestamptz,

  deleted_at               timestamptz,
  purge_after              timestamptz
);

-- The thread page and every tool result.
create index memories_thread on memories (subject_id)
  where scope = 'thread' and deleted_at is null and superseded_at is null;

-- One memory per text per thread. A guarantee rather than a convention,
-- because the second writer is a model and a model asked twice about the same
-- thread writes the same sentence twice.
--
-- Callers use `on conflict do nothing` plus a select. Never a caught 23505:
-- Postgres puts the conflicting value in the error detail, so a caught unique
-- violation carries memory text into whatever logs the exception, which is an
-- OFF-1 breach by the shortest possible route.
create unique index memories_thread_text on memories (subject_id, lower(text))
  where scope = 'thread' and deleted_at is null;

-- Account deletion, and nothing else.
create index memories_account on memories (account_id) where deleted_at is null;

-- The purge sweep, the same shape as every other table under the undo window.
create index memories_purge on memories (purge_after) where purge_after is not null;
