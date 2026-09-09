-- A view over `table.*` freezes its column list at creation.
--
-- 0026 created readable_content as `select content.*, ...`. 0027 then added the
-- `search_text` generated column to `content`. The view did not gain it: the
-- star was expanded once, when the view was made, and Postgres has held that
-- list ever since.
--
-- It surfaced as `column content.search_text does not exist` from a query that
-- reads the view, which is a confusing error precisely because the column plainly
-- does exist on the table it is named after.
--
-- **The trap is permanent, not a one-off.** Any future migration that adds a
-- column to content, memories or messages leaves these views behind in the same
-- way, and the failure is either a confusing error like this one or, worse, a
-- read that silently cannot see a column it should. `test/predicate.test.ts`
-- asserts the view's columns match its table's, so the next person to add one
-- finds out from a test rather than from production.
--
-- `create or replace` cannot do this: the replacement would put search_text
-- before viewer_account_id, and replace may only append columns. Dropped and
-- recreated instead, which is safe because nothing but application code reads
-- them.

drop view if exists readable_content;
drop view if exists readable_memories;
drop view if exists readable_messages;

create view readable_content as
select content.*, thread_members.account_id as viewer_account_id
from content
join thread_members on thread_members.thread_id = content.thread_id
where thread_members.state = 'accepted';

create view readable_memories as
select memories.*, thread_members.account_id as viewer_account_id
from memories
join thread_members on thread_members.thread_id = memories.subject_id
where memories.scope = 'thread'
  and thread_members.state = 'accepted';

create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;
