-- 0033 Notes: one concept where there were two.
--
-- 008 built `memories`, a 200 character standing fact about a thread, capped at
-- ten and injected into every turn that touches the thread. `content.type =
-- 'note'` was the other half: whatever a dump became when it was not a task, a
-- link or a file, unbounded and injected into nothing. Both are a sentence
-- somebody wrote about a thread, and 008's test for telling them apart ("if it
-- would show up in a widget, it is content") stops working the moment a
-- sentence has a date, which is exactly what 015 needs.
--
-- So one table, called `notes`, which can carry dates.
--
-- **The cap does not come with it.** A hundred is a prompt budget applied when
-- the prompt is assembled, not a wall on the way in: nothing a person dumps is
-- ever refused, and the daily job is what brings a thread back under it.
--
-- **This migration deletes content.** Every `content` row of type 'note' goes,
-- with its chunks. That is a MUST broken on purpose, under the dated one-time
-- exception written into OFF-1 on 2026-09-10, taken while the product is in
-- alpha and invite only. Rows offload filed from a dump still have their
-- message; rows typed straight into a section carry no derived_from_message_id
-- and this is the only copy going.
--
-- Privileges follow a rename in Postgres, so 0032's grants to offload_agent
-- survive without being restated. The views do not: they hold OIDs, so a
-- renamed table leaves `readable_memories` working under a name that no longer
-- describes it, which is 0028's lesson from the other direction.

-- ---------------------------------------------------------------- the table

alter table memories rename to notes;

alter index memories_thread       rename to notes_thread;
alter index memories_search_idx   rename to notes_search_idx;
alter index memories_account      rename to notes_account;
alter index memories_purge        rename to notes_purge;

-- What a note can now carry. All nullable, and most notes have none of it.
--
-- `text` keeps its meaning and its 200 character cap: it is the only column
-- that ever reaches a prompt. `body` is what somebody dumped when it did not
-- fit, kept whole and assembled into nothing.
alter table notes add column body          text;
alter table notes add column occurs_at     timestamptz;
alter table notes add column occurs_end_at timestamptz;
alter table notes add column due_at        timestamptz;
alter table notes add column place_id      uuid references places (id);

-- The model's tool_use block id, exactly as `content` carries it.
--
-- It is what lets a turn tell its own write apart from an earlier call's when
-- it works out whether this thread's notes have already been handed over. A
-- retried tool call whose response was lost must be given the same answer, and
-- without this it is given the answer "you already have them" about a set it
-- never received.
alter table notes add column tool_call_id text;

-- The duplicate rule narrows to what it was built for.
--
-- It exists because a model asked twice about the same thread writes the same
-- sentence twice. Applied to a person it is a dump that silently does not
-- appear, which is the one thing this product may never do.
drop index memories_thread_text;

create unique index notes_thread_text on notes (subject_id, lower(text))
  where scope = 'thread' and deleted_at is null and origin = 'learned';

-- 015 reads dated notes beside dated content. Thread-leading, because every
-- read here resolves through membership on subject_id.
create index notes_thread_dated on notes (subject_id, occurs_at)
  where occurs_at is not null and deleted_at is null and superseded_at is null;

create index notes_thread_due on notes (subject_id, due_at)
  where due_at is not null and deleted_at is null and superseded_at is null;

-- The folded history, newest first. The one list here with no ceiling: active
-- notes are bounded by the daily job, and what it folded accumulates.
create index notes_thread_superseded on notes (subject_id, superseded_at desc)
  where superseded_at is not null and deleted_at is null;

-- ---------------------------------------------------------------- the view

drop view if exists readable_memories;

create view readable_notes as
select notes.*, thread_members.account_id as viewer_account_id
from notes
join thread_members on thread_members.thread_id = notes.subject_id
where notes.scope = 'thread'
  and thread_members.state = 'accepted';

-- --------------------------------------------------------------- the corpus

alter table memory_chunks rename to note_chunks;
alter table note_chunks rename column memory_id to note_id;

alter index memory_chunks_pending_idx     rename to note_chunks_pending_idx;
alter index memory_chunks_hnsw            rename to note_chunks_hnsw;
alter index memory_chunks_memory_id_ord_key rename to note_chunks_note_id_ord_key;

-- The sweep's job kind follows the table. Queued rows are rewritten rather than
-- left addressed to a handler that no longer exists: a job nobody drains is a
-- row that never becomes searchable, and nothing raises.
update jobs set kind = 'embed.note' where kind = 'embed.memory';

-- --------------------------------------------------- and the content type goes

delete from content_chunks
 where content_id in (select id from content where type = 'note');

delete from content where type = 'note';

-- The column defaulted to 'note', so dropping the type without dropping the
-- default leaves every insert that omits one failing the NOT NULL it has
-- carried since 0011. There is no honest replacement default: a row whose type
-- nobody stated is a bug, not a note, and the write paths all state one.
alter table content alter column type drop default;

alter table content drop constraint content_type_check;
alter table content add constraint content_type_check
  check (type in ('link', 'image', 'screenshot', 'voice',
                  'file', 'task', 'event', 'location'));
