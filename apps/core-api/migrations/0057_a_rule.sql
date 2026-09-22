-- 0057 Recurrence becomes a rule.
--
-- 0036 said "not an RRULE: a column holding one is a parser, a test suite and
-- a screen for editing it", and chose six values. 023 built the screen, and
-- the screen is Google Calendar's presets and Custom dialog, which the six
-- values cannot hold: no interval past two, no set of weekdays, no monthly
-- anchor, no occurrence count. So the column becomes one RFC 5545 rule in a
-- closed grammar, `packages/widgets/src/rrule.ts`, exactly as wide as the
-- picker and no wider. Three reasons: it is the expressiveness the dialog
-- needs; it is what Google speaks, so a rule survives the trip to a calendar
-- untranslated; and the six values map in losslessly, which is what the
-- rewrite below is. The reversal is logged in docs/tech/decisions.md.
--
-- **The stored string is always the server's own serialisation**, parts in a
-- fixed order, and the check here is a backstop: the grammar is applied at
-- every door before a row is written. The rewrite writes canonical strings
-- by construction, and rule.test.ts runs this very expression to prove it.
--
-- **A rule anchors on the row's When column.** An event repeats when it
-- happens, everything else repeats when it is wanted by, so "rent every
-- month" is a repeating task on `due_at` rather than an event. 0036 anchored
-- every rule on `occurs_at`; a repeating task from before this keeps its
-- occurrence and gains it as its due date, so the rule keeps its anchor.
--
-- The views are dropped first, because a column cannot leave a table a
-- `select *` view depends on, and are recreated as 0036 and 0045 wrote them.

drop view if exists readable_notes;
drop view if exists readable_content;

alter table content add column rrule text
  check (rrule is null or (rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$' and length(rrule) <= 200));
alter table notes add column rrule text
  check (rrule is null or (rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$' and length(rrule) <= 200));

comment on column content.rrule is
  'An RFC 5545 recurrence rule in the closed grammar of packages/widgets/src/rrule.ts, in the server''s own serialisation. Anchored on occurs_at for an event and due_at for everything else. One row, drawn on every matching day.';
comment on column notes.rrule is
  'As content.rrule, anchored on occurs_at.';

update content set rrule =
  -- rewrite:begin
  case repeats
    when 'day' then 'FREQ=DAILY'
    when 'weekday' then 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    when 'week' then 'FREQ=WEEKLY'
    when 'two_weeks' then 'FREQ=WEEKLY;INTERVAL=2'
    when 'month' then 'FREQ=MONTHLY'
    when 'year' then 'FREQ=YEARLY'
  end
  || coalesce(';UNTIL=' || to_char(repeats_until at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"'), '')
  -- rewrite:end
  where repeats is not null;

update notes set rrule =
  case repeats
    when 'day' then 'FREQ=DAILY'
    when 'weekday' then 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    when 'week' then 'FREQ=WEEKLY'
    when 'two_weeks' then 'FREQ=WEEKLY;INTERVAL=2'
    when 'month' then 'FREQ=MONTHLY'
    when 'year' then 'FREQ=YEARLY'
  end
  || coalesce(';UNTIL=' || to_char(repeats_until at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"'), '')
  where repeats is not null;

-- A repeating task from before this anchored on its occurrence. It keeps
-- that and gains it as the day it is wanted by, which is where its rule
-- anchors now.
update content set due_at = occurs_at
  where rrule is not null and type <> 'event' and due_at is null;

alter table content drop constraint content_repeats_needs_a_date;
alter table content drop constraint content_repeats_or_series;
alter table notes drop constraint notes_repeats_needs_a_date;
alter table content drop column repeats, drop column repeats_until;
alter table notes drop column repeats, drop column repeats_until;

alter table content add constraint content_rrule_needs_when
  check (rrule is null or (case when type = 'event' then occurs_at else due_at end) is not null);
alter table content add constraint content_rrule_or_series
  check (rrule is null or attrs->>'series_ref' is null);
alter table notes add constraint notes_rrule_needs_a_date
  check (rrule is null or occurs_at is not null);

create view readable_content as
select content.*, thread_members.account_id as viewer_account_id
from content
join thread_members on thread_members.thread_id = content.thread_id
where thread_members.state = 'accepted';

create view readable_notes as
select notes.*, thread_members.account_id as viewer_account_id
from notes
join thread_members on thread_members.thread_id = notes.subject_id
where notes.scope = 'thread'
  and thread_members.state = 'accepted';
