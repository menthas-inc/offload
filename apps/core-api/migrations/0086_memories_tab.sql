-- 0086 The Memories tab (040).
--
-- Five kinds: "their words" folds into About, a durable fact about the person.
update notes set kind = 'about' where scope = 'account' and kind = 'words';
alter table notes drop constraint notes_kind_check;
alter table notes add constraint notes_kind_check check (
  (scope = 'account' and kind in ('people', 'things', 'about', 'rules', 'patterns'))
  or (scope <> 'account' and kind in ('going_on', 'person', 'preference', 'noticed', 'standing'))
);

-- A memory's embedding and its place on the map, on its own row. A memory is
-- one sentence, so one vector; it never enters note_chunks, which search
-- reads, so search cannot return a memory and a forgotten one cannot come back
-- through a stale chunk. No vector index: an account holds at most 300, a
-- flat scan behind the subject index.
alter table notes
  add column embedding halfvec(1024),
  add column embedding_model text,
  add column embedded_at timestamptz,
  add column place_dx real,
  add column place_dy real,
  add column placed_at timestamptz;
alter table notes add constraint notes_memory_columns check (
  scope = 'account'
  or (embedding is null and embedding_model is null and embedded_at is null
      and place_dx is null and place_dy is null and placed_at is null)
);

-- The worker embeds a memory as it embeds a note's chunks: an index of a row.
-- It may write those three columns and nothing else of a memory.
grant update (embedding, embedding_model, embedded_at) on notes to offload_agent;

-- The view carries notes' columns as of its creation; made again, thread scope only.
drop view readable_notes;
create view readable_notes as
select notes.*, thread_members.account_id as viewer_account_id
from notes
join thread_members on thread_members.thread_id = notes.subject_id
where notes.scope = 'thread'
  and thread_members.state = 'accepted';
