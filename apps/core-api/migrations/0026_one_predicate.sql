-- 013: who may read what, written once, in SQL.
--
-- 001 decided this on day one and named the reason: the Core API reads through
-- Kysely and the agent plane reads through SQLAlchemy, so an authorization rule
-- written in TypeScript is a rule the other plane does not have. Its T16 stayed
-- unticked because there has only ever been one reader, and that was fine.
--
-- 013's search is the second reader, and it runs in the other language. So the
-- debt comes due here rather than at some later convenient moment.
--
-- **These views carry authorization, not lifecycle.** They answer "may this
-- account see this row at all", and nothing else. Deleted, superseded, muted
-- and archived stay with the callers, which is not tidiness deferred: every one
-- of those has a caller that deliberately wants the other answer. `restore` has
-- to find the row it is undoing inside its eight second window, and
-- `readableMemory` reads a superseded memory on purpose. Baking a lifecycle
-- filter in here would silently break both, and the failure would look like a
-- missing row rather than a changed predicate.

-- Content resolves through thread membership. NEVER through content.account_id,
-- which is the mistake 001 names explicitly: filtering reads by author hides
-- what other members wrote in a shared thread, and the instinct on seeing that
-- is to loosen the filter rather than narrow it.
--
-- `viewer_account_id` is a column rather than a parameter, because a view
-- cannot take one. Callers filter on it and the planner pushes that down into
-- thread_members. A set-returning function would have been opaque to the
-- planner on exactly the query that most needs an index.
create view readable_content as
select content.*, thread_members.account_id as viewer_account_id
from content
join thread_members on thread_members.thread_id = content.thread_id
where thread_members.state = 'accepted';

-- Thread memories resolve through thread_members on subject_id.
--
-- A thread memory has account_id IS NULL by design, so the obvious
-- `where account_id = :viewer` returns nothing at all, and the obvious fix for
-- returning nothing is to drop the filter. That is the whole reason this is a
-- view: the rule is easy to get wrong and it should only be written once.
--
-- Thread scope only, because it is the only scope with a writer. The table
-- allows 'account' and 'person' and nothing has ever inserted either; 008 built
-- thread memories and left the rest to the features that need them. A branch
-- for rows that do not exist would be a guess, not a predicate.
create view readable_memories as
select memories.*, thread_members.account_id as viewer_account_id
from memories
join thread_members on thread_members.thread_id = memories.subject_id
where memories.scope = 'thread'
  and thread_members.state = 'accepted';

-- A conversation resolves through the account that owns it and nothing else.
--
-- This is the third rule and the only simple one, and it is written down beside
-- the other two so that nobody has to notice it is different in order to get it
-- right. **A conversation is never shared**, including the one that filed
-- something into a thread somebody shares: what you said while dumping is not
-- part of what you shared.
--
-- The join to conversations is an integrity guard rather than a permission.
-- messages.account_id is denormalised from the conversation, and this makes a
-- disagreement between the two unreadable rather than readable by whichever
-- copy a query happened to consult.
create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;
