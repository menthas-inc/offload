-- Where a dump was typed.
--
-- A dump made while a thread is on screen almost always belongs to that thread,
-- and 015 asks offload to act on that without anybody having to say it twice.
-- The thread reaches the model as context, not as an instruction: words that
-- name another thread still win.
--
-- On the message rather than in the job payload, for two reasons. The resume
-- path re-enqueues from the message and would otherwise lose the default on
-- exactly the retry that needs it, and the worker already selects this row, so
-- the id is copied one fewer time.
--
-- `on delete set null`: a thread that is gone is not a default, and a dangling
-- id that reaches a prompt is worse than no id at all.

alter table messages
  add column looking_at_thread_id uuid references threads (id) on delete set null;

comment on column messages.looking_at_thread_id is
  'The thread on screen when this was dumped. A default for filing, overridden by anything the text names. Membership checked at write time.';

-- And the view that is made of this table, which does not follow it.
--
-- `readable_messages` is `select messages.*`, resolved once when the view was
-- created. A new column on the table is invisible through it until it is
-- recreated. This is 0028's lesson and the test in `predicate.test.ts` is what
-- caught it again, which is the test working.
drop view if exists readable_messages;

create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;
