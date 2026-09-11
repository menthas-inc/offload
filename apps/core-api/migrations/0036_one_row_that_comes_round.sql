-- 0036 A thing that comes round again is one row with a rule.
--
-- "Yoga every Tuesday for the next month" had nowhere to go. One undated note
-- loses the Tuesdays. Four notes is four rows saying Yoga, which is the thirty
-- identical lines `splitRepeating` exists to collapse. Neither is what somebody
-- said: they said one thing, and it repeats.
--
-- **So the row carries the rule and the calendar expands it.** One line in a
-- list, a mark on every matching day of whatever window is on screen. It is on
-- both tables because the same sentence arrives as either: "yoga every Tuesday"
-- is a note, "standup every weekday at 9" is an appointment.
--
-- **Two mechanisms, and keeping them apart is the point.**
--
--   `attrs.series_ref`  occurrences that already exist, because a calendar sent
--                       them. Google expands its own rules and offload mirrors
--                       the rows. A list collapses them; the calendar draws
--                       every one. A moved week is a real row that differs.
--
--   `repeats`           a rule with nothing behind it, because somebody said it
--                       in words and there is nothing to mirror. One row.
--
-- Rewriting a calendar's occurrences into a rule would mean deciding that its
-- exceptions do not exist, which is exactly what a rule cannot express.
--
-- **Not an RRULE.** iCal covers "the last Thursday of every other month" and
-- nobody has asked for it; a column holding one is a parser, a test suite and a
-- screen for editing it. Six values answer what people actually say, and the
-- day of the week comes from `occurs_at` rather than being stated twice and
-- able to disagree with itself.

alter table notes add column repeats text
  check (repeats in ('day', 'weekday', 'week', 'two_weeks', 'month', 'year'));
alter table notes add column repeats_until timestamptz;

alter table content add column repeats text
  check (repeats in ('day', 'weekday', 'week', 'two_weeks', 'month', 'year'));
alter table content add column repeats_until timestamptz;

-- A rule about nothing cannot be drawn, so it is refused rather than stored.
alter table notes add constraint notes_repeats_needs_a_date
  check (repeats is null or occurs_at is not null);
alter table content add constraint content_repeats_needs_a_date
  check (repeats is null or occurs_at is not null);

-- And the two mechanisms never describe one row.
alter table content add constraint content_repeats_or_series
  check (repeats is null or attrs->>'series_ref' is null);

-- **The views do not follow the tables**, which 0028 is named after and which
-- this change paid for again: a view defined as `select notes.*` fixes its
-- column list at creation, so the first read through `readable_notes` failed
-- with "column notes.repeats does not exist". A column added to a table under a
-- view is two statements, never one.
--
-- Dropped and recreated rather than replaced: `create or replace view` may only
-- append columns, and `*` puts the new ones in the middle.
drop view if exists readable_notes;
drop view if exists readable_content;

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
