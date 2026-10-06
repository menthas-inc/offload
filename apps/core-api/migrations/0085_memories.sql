-- 0085 Memories (038): what offload knows about a person across their threads.
--
-- A memory is a `notes` row with scope 'account' and subject_id the account,
-- which 0017 built the table for and nothing wrote until now. The thread's
-- notes keep their five kinds and two origins; a memory has one of six
-- classes and may also be `answered`, written by the server from an answer to
-- a question offload asked.
alter table notes drop constraint memories_kind_check;
alter table notes drop constraint memories_origin_check;
alter table notes add constraint notes_kind_check check (
  (scope = 'account' and kind in ('people', 'things', 'words', 'about', 'rules', 'patterns'))
  or (scope <> 'account' and kind in ('going_on', 'person', 'preference', 'noticed', 'standing'))
);
alter table notes add constraint notes_origin_check check (
  origin in ('stated', 'learned') or (scope = 'account' and origin = 'answered')
);

-- An answered memory's calendar, by id: never its name, which may be words
-- somebody else gave it. A calendar that goes leaves the memory settling
-- nothing.
alter table notes add column calendar_id uuid references connector_calendars (id) on delete set null;

-- Every read of an account's memories, and one memory per text while active.
-- Writers use `on conflict do nothing` and a select, never a caught 23505: the
-- conflicting text would land in the error detail and from there in a log.
create index notes_account_memories on notes (subject_id)
  where scope = 'account' and deleted_at is null and superseded_at is null;
create unique index notes_account_text on notes (subject_id, lower(text))
  where scope = 'account' and deleted_at is null and superseded_at is null;

-- The last memory pass, which the next one reads from.
alter table accounts add column memories_at timestamptz;

-- The messages a forgotten memory came from. Ids only: the sentence is gone,
-- and the same words cannot teach it again.
create table memory_forgotten (
  account_id  uuid not null references accounts (id) on delete cascade,
  message_id  uuid not null references messages (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (account_id, message_id)
);

-- The view carries notes' columns by `notes.*` as of its creation, so it is
-- made again to carry `calendar_id`. Still a thread's notes only: memories are
-- read by their own functions and never through a thread's members.
drop view readable_notes;
create view readable_notes as
select notes.*, thread_members.account_id as viewer_account_id
from notes
join thread_members on thread_members.thread_id = notes.subject_id
where notes.scope = 'thread'
  and thread_members.state = 'accepted';

-- The worker's memory pass reads since the last pass and never learns again
-- from a forgotten memory's message. It writes neither: the Core API stamps
-- the pass and records what was forgotten. `notes` it already reads whole.
grant select (memories_at) on accounts to offload_agent;
grant select (account_id, message_id) on memory_forgotten to offload_agent;
