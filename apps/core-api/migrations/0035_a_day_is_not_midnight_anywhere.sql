-- 0035 A bare date is a day, and midnight UTC is not one.
--
-- `parseWhen` stored a date with no time in it as midnight UTC, under a comment
-- saying that local "would put a due date on the wrong side of a boundary for
-- half the world". It is the other way round: midnight UTC is already on the
-- wrong side of the boundary for everybody west of Greenwich.
--
-- Found on a real screen. "Sunday brunch on way back to NYC" was filed as
-- `2026-09-13`, stored as `2026-09-13T00:00:00Z`, and drawn under **Saturday,
-- September 12, 8:00 PM** on a thread's timeline, with the word Sunday in its
-- own title.
--
-- **012 already knew.** It flags an all-day calendar event with `all_day` in
-- `attrs`, and its test says "an all-day event is a date, not midnight
-- anywhere. Storing it as a time is how a birthday lands a day out for half the
-- planet." The calendar door was right and the dump door was wrong.
--
-- So: noon, and the row says it is a day. Noon is right from UTC-11 to UTC+11
-- and still wrong in New Zealand; the complete answer is the account's own
-- timezone, which `accounts` does not carry yet.
--
-- **What this rewrites, and what it leaves alone.** Only rows whose time is
-- exactly midnight UTC, and only where a person is the source. A calendar row
-- at midnight UTC is a real instant that Google sent and is none of our
-- business; an all-day event from that path already carries `all_day` and its
-- own timezone. Notes have no source column and every note is dumped or
-- derived from a dump, so they all qualify.

-- Content. The three date columns move independently: a row can carry a bare
-- due date and a real occurrence.
update content
   set occurs_at = occurs_at + interval '12 hours',
       attrs = attrs || '{"all_day": true}'::jsonb
 where occurs_at is not null
   and occurs_at = date_trunc('day', occurs_at at time zone 'UTC') at time zone 'UTC'
   and source in ('person', 'share');

update content
   set occurs_end_at = occurs_end_at + interval '12 hours'
 where occurs_end_at is not null
   and occurs_end_at = date_trunc('day', occurs_end_at at time zone 'UTC') at time zone 'UTC'
   and source in ('person', 'share');

-- A due date carries no hour anybody expects to see, so it moves without the
-- flag: `all_day` is about what may be drawn, and nothing draws an hour here.
update content
   set due_at = due_at + interval '12 hours'
 where due_at is not null
   and due_at = date_trunc('day', due_at at time zone 'UTC') at time zone 'UTC'
   and source in ('person', 'share');

-- Notes, which 014 gave the same three columns and which have no source: every
-- one of them came from a dump.
update notes
   set occurs_at = occurs_at + interval '12 hours',
       attrs = attrs || '{"all_day": true}'::jsonb
 where occurs_at is not null
   and occurs_at = date_trunc('day', occurs_at at time zone 'UTC') at time zone 'UTC';

update notes
   set occurs_end_at = occurs_end_at + interval '12 hours'
 where occurs_end_at is not null
   and occurs_end_at = date_trunc('day', occurs_end_at at time zone 'UTC') at time zone 'UTC';

update notes
   set due_at = due_at + interval '12 hours'
 where due_at is not null
   and due_at = date_trunc('day', due_at at time zone 'UTC') at time zone 'UTC';
