-- 017. One line of what offload is doing, and a way to stop it.
--
-- Both halves ride rails that already exist: the step goes out on the channel
-- the answer stream already listens to, and the cancel comes back in on a
-- second one the worker holds open the same way.

-- The current step, and nothing else. **Not a log**: one column, overwritten,
-- cleared when the turn settles. A table here would invite a history nobody
-- asked for, which is AC-2 stated in DDL.
alter table messages
  add column step text check (step is null or length(step) <= 80),
  add column step_at timestamptz;

comment on column messages.step is
  'What offload is doing right now, in its own voice, at most 80 characters. Written by the planner, never from a page it read. Cleared by the transaction that settles the turn.';

-- **The cap is a constraint as well as a check in the handler**, because AC-4
-- says the cap is the server''s, and a constraint is the version of that claim
-- which survives a second writer.

comment on column messages.step_at is
  'When the step was written, so a step left behind by a worker that died is ignorable rather than permanent.';

-- The cancel. A timestamp rather than a state, because `state` already carries
-- the queue''s own lifecycle and a cancelled job is still one of queued,
-- running or done: what changed is that somebody asked it to stop.
alter table jobs
  add column cancelled_at timestamptz;

comment on column jobs.cancelled_at is
  'When somebody asked for this turn to stop. The worker checks it and abandons the task; nothing is rolled back, because cancel stops work and undo is what reverses it.';

-- And the view that is made of `messages`, which does not follow it.
--
-- `readable_messages` is `select messages.*`, resolved once when the view was
-- created, so two new columns are invisible through it until it is recreated.
-- **This is the third time.** 0028 found it, 0037 hit it again and was caught by
-- `predicate.test.ts`, and any future migration touching this table owes the
-- same four lines.
drop view if exists readable_messages;

create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;
