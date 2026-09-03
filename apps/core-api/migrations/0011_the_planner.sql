-- 0011 The planner.
--
-- The table feature 004 files into, the rename that comes with it, and the one
-- new message state that partial success needs a name for.
--
-- `things` becomes `content` here. The word was retired as the product's noun
-- on 2026-09-02 and this is the last place it survived. The table is created
-- for the first time in this migration, so the only thing that actually moves
-- is `threads.thing_count`, which 0001 created and nothing has ever written.

alter table threads rename column thing_count to content_count;

-- Content: one piece of what somebody dumped, in exactly one thread.
--
-- The columns 004 writes or reads, and no others. Spec 001's field list is
-- longer, and the rest of it arrives with the feature that needs it: occurs_at
-- and due_at with the agenda, tags with the thread widgets, embedding with
-- search. A column that exists before its first writer collects a meaning
-- nobody remembers choosing (DEV-1).
--
-- The CHECK on `type` is the exception and carries 001's full value set, because
-- widening a constraint later is a migration and listing eight strings now is
-- not. 004 only ever writes 'note': task and event need occurs_at and due_at,
-- which are not columns yet, so a task here would be a note wearing a label
-- that no query could act on.
create table content (
  id                       uuid primary key default uuid_v7(),
  -- The author. Never the authorization predicate on its own: reading resolves
  -- through thread_members, per OFF-3, or a shared thread is invisible to every
  -- member but whoever wrote in it.
  account_id               uuid not null references accounts (id) on delete cascade,
  thread_id                uuid not null references threads (id) on delete cascade,
  -- The undo unit and the provenance, both. Nullable because content will
  -- eventually arrive from a connector rather than from a dump; on delete set
  -- null rather than cascade, because a purged message must not take content
  -- with it that the person still has in a thread.
  derived_from_message_id  uuid references messages (id) on delete set null,
  type                     text not null default 'note'
                             check (type in ('note', 'link', 'image', 'screenshot',
                                             'voice', 'file', 'task', 'event')),
  title                    text not null,
  body                     text,
  -- The connector seam, denormalised from the message exactly as 001 specifies,
  -- and holding the identical value set. An earlier draft of 001 dropped
  -- 'share' from this copy, which would have mislabelled every dump that came
  -- through a share sheet.
  source                   text not null default 'person'
                             check (source in ('person', 'share', 'gmail', 'calendar', 'browser')),
  source_ref               text,
  -- The model's own tool_use block id. It makes a retried tool call idempotent
  -- within one turn, and deliberately does nothing across a resume: a resumed
  -- turn is a new model call with new ids, and what stops it filing twice is
  -- being told what already landed.
  tool_call_id             text,
  attrs                    jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  purge_after              timestamptz
);

-- A thread's content, newest first. 001's primary access path, and the one the
-- thread screen is built on.
create index content_thread_idx
  on content (thread_id, created_at desc)
  where deleted_at is null;

-- Two questions with one answer: what does Undo reverse, and what has a resume
-- already filed.
create index content_message_idx
  on content (derived_from_message_id)
  where deleted_at is null;

-- Idempotency at the storage layer rather than in a handler, so a lost response
-- to a successful tool call cannot file the same piece twice. Scoped to the
-- message because a tool_use id is only unique within one model response.
create unique index content_tool_call_idx
  on content (derived_from_message_id, tool_call_id)
  where tool_call_id is not null;

-- What the purge job scans, on both tables it sweeps. Partial on the predicate
-- the job actually uses, so it reads the handful of rows inside the window
-- rather than the whole table.
create index content_purge_idx
  on content (purge_after)
  where deleted_at is not null;

create index messages_purge_idx
  on messages (purge_after)
  where deleted_at is not null;

-- Partial success needs a name.
--
-- 'partial' means content landed, the reply describes it, and the turn did not
-- finish. Distinct from 'failed', where nothing landed and the text goes back
-- in the composer, and from 'answered', where there is nothing left to do. The
-- composer offers a different way forward on each, which is the whole reason
-- this is a third value and not a flag.
alter table messages drop constraint messages_state_check;
alter table messages add constraint messages_state_check
  check (state in ('queued', 'seen', 'answered', 'failed', 'partial'));

-- The worker reads content for one reason: to tell the planner what a resumed
-- turn has already filed. Select only, like everything else it touches. Every
-- write still goes through the Core API (stack.md, one writer).
grant select on content to offload_agent;
