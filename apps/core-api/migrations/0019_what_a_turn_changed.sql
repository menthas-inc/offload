-- Which threads a turn changed, as opposed to which threads it filed into.
--
-- `content.derived_from_message_id` answers "what did this dump produce", and
-- it was standing in for "what did this turn change". Those are the same
-- question only for `add_content`. A turn that moves a piece, ticks it off,
-- archives it or rewrites its title produces no new content, so the answer came
-- back empty and the client concluded the turn had done nothing: no Done mark
-- on a move that worked, and no refresh on the page the move had just changed.
--
-- Two flavours, one boolean, because the reply's pills are a claim surface.
-- `landed` means the turn's content is in this thread now, which is what a pill
-- may say and what earns the Done mark. A move's source thread changed and its
-- content is not there any more, so it is recorded without `landed`: the page
-- has to reload, and a pill saying it went there would be untrue.

create table message_threads (
  message_id uuid not null references messages(id) on delete cascade,
  thread_id  uuid not null references threads(id) on delete cascade,
  -- The turn's content is in this thread now. False for the thread it left.
  landed     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (message_id, thread_id)
);

-- The only read: every thread one message touched, when its turn settles.
create index message_threads_by_message on message_threads (message_id);

-- Cleaning up after a thread is deleted, and after an account is. Both cascade
-- above; this is here so that the cascade has an index to find rows with rather
-- than sequentially scanning the table for every deleted thread.
create index message_threads_by_thread on message_threads (thread_id);
