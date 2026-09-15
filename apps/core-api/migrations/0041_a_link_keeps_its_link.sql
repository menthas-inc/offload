-- A dumped link had nowhere to keep the link.
--
-- `content` has `title` and `body` and no address, so the planner put the URL in
-- `body` when it thought of it and dropped it when it did not. Of the link rows
-- in production, one holds a full Airbnb URL in `body` and two hold null: the
-- page is gone and the row is a sentence about a page nobody can reach.
--
-- **That is the one thing a saved link has to do.** Everything else about a link
-- row is decoration.
alter table content
  add column url text check (url is null or url ~ '^https?://');

comment on column content.url is
  'Where a piece of content came from, when it came from a page. Its own column rather than a convention inside body, because a convention is a thing the model remembers four times out of five.';

-- The rows that did keep it, moved rather than copied.
--
-- **Only when `body` is nothing but a URL**, so a note that happens to mention a
-- link is untouched. Those rows draw the raw address as their own subtitle
-- today, which is the URL doing a worse job of being the title than the title
-- is; with somewhere proper to live it stops being text and becomes the link.
update content
   set url = trim(body),
       body = null
 where type = 'link'
   and body is not null
   and trim(body) ~ '^https?://[^\s]+$';

-- And the view that is made of this table, which does not follow it.
--
-- `readable_content` is `select content.*`, resolved once when the view was
-- created, so a new column is invisible through it until it is recreated.
-- **This is the fourth time**, across two tables: 0028 found it, 0036 recreated
-- this one, 0037 and 0039 did the same for `readable_messages`, and
-- `predicate.test.ts` caught this one too. Any migration adding a column to
-- `content` or `messages` owes these four lines.
drop view if exists readable_content;

create view readable_content as
select content.*, thread_members.account_id as viewer_account_id
from content
join thread_members on thread_members.thread_id = content.thread_id
where thread_members.state = 'accepted';
