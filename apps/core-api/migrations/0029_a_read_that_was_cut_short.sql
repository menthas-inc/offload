-- Whether the read behind a result reached the end of what matched.
--
-- The two tails an answer can have are different and only one may be drawn.
-- More in hand than shown is **Show N more**, expanding in place, because the
-- rows are already here. A read that hit its page has no rest to expand into:
-- what was not read was not sent, so the tail is the thread instead.
--
-- Without this the stored answer forgets which it was, and a reply reopened
-- tomorrow offers to expand into rows nobody fetched.
--
-- On the join row rather than in a table of its own. It is a property of the
-- read rather than of the row, and one read is one thread here, so every row of
-- a result carries the same value. A `message_results` table would be more
-- normal and would buy nothing but a join.
alter table message_content
  add column truncated boolean not null default false;
