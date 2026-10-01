-- 028 Not in a thread.
--
-- What is in the account's default thread is drawn as things, not as a thread,
-- and a thing can carry one suggestion: move to a thread it belongs in, or a
-- new thread offload proposes for two to ten of them. Storage does not move.

-- A dismissed suggestion, as a fact about the thing: no words, gone with it,
-- and the reason that thing is never suggested for again.
alter table content add column suggest_dismissed_at timestamptz;
alter table notes   add column suggest_dismissed_at timestamptz;

-- offload's proposal of a new thread. Plain text, as threads.name is: the
-- database is not encrypted by us and nothing here says otherwise (OFF-2).
create table thread_proposals (
  id              uuid primary key default uuid_v7(),
  account_id      uuid not null references accounts(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]'),
  created_at      timestamptz not null default now(),
  spent_at        timestamptz,
  spent_thread_id uuid references threads(id) on delete set null
);
create index thread_proposals_account_idx on thread_proposals (account_id) where spent_at is null;
create index thread_proposals_spent_idx on thread_proposals (spent_at) where spent_at is not null;

-- One suggestion per loose thing, a row or a note.
create table suggestions (
  id          uuid primary key default uuid_v7(),
  account_id  uuid not null references accounts(id) on delete cascade,
  content_id  uuid references content(id) on delete cascade,
  note_id     uuid references notes(id) on delete cascade,
  kind        text not null check (kind in ('move', 'create')),
  thread_id   uuid references threads(id) on delete cascade,
  proposal_id uuid references thread_proposals(id) on delete cascade,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(content_id, note_id) = 1),
  check ((kind = 'move' and thread_id is not null and proposal_id is null)
      or (kind = 'create' and proposal_id is not null and thread_id is null))
);
create unique index suggestions_content_idx on suggestions (content_id) where content_id is not null;
create unique index suggestions_note_idx    on suggestions (note_id)    where note_id is not null;
create index suggestions_proposal_idx on suggestions (proposal_id) where proposal_id is not null;
create index suggestions_accepted_idx on suggestions (accepted_at) where accepted_at is not null;

-- The full list's notes branch, ordered by id as the thread page's content is:
-- both ids are UUIDv7, so one order runs across the two tables. Content's
-- branch rides 0013's content_thread_active_idx.
create index notes_thread_current_idx on notes (subject_id, id desc)
  where scope = 'thread' and deleted_at is null and superseded_at is null;

-- The daily pass runs only when its candidate set changed.
alter table accounts add column loose_pass_key text;

-- The worker reads the candidates and writes nothing: its proposal goes to the
-- Core API, which decides. It already reads content and notes whole; of
-- suggestions it needs only which things carry one.
grant select (content_id, note_id) on suggestions to offload_agent;
