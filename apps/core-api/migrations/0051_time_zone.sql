-- The device's time zone, on the message it came with.
--
-- The worker built "today" in UTC and read "3pm" as 15:00Z, which is 4pm in
-- Lisbon for half the year and put a day boundary at 1am. `accounts` still
-- has no time zone column; until it does, every request that reaches the
-- model carries the device's zone in a header, and the message keeps it so
-- the turn that reads the message reads it in the zone it was written in. A
-- message with none is read in UTC, which is what every message before this
-- was.
--
-- An IANA name, never an offset: the offset changes twice a year and the
-- model has to place "the 2nd of November at 3pm" in the right one.

alter table messages add column time_zone text
  check (time_zone is null or time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$');
comment on column messages.time_zone is
  'The device''s IANA time zone when this was sent, for the turn that reads it. Null: read in UTC.';

-- The agent role already reads every column of messages (0009).

-- `readable_messages` is `select messages.*`, resolved once when the view was
-- created, so the new column is invisible through it until it is recreated.
-- The sixth time; `predicate.test.ts` catches it every time.
drop view if exists readable_messages;

create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;
