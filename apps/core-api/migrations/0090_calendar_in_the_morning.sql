-- 0090 The calendar in the morning (a tweak to 024 and 042, 2026-10-10).
--
-- A row a person dumped keeps its reminders after offload writes it to a
-- calendar: what decides is whose words it is (`source`), not whether a
-- calendar holds a copy (`source_ref`). A calendar's own row is still never
-- reminded about.

-- What an undated task in a thread may be for.
create or replace function reminder_anchors(thread uuid)
returns table (of text, id uuid, at timestamptz)
language sql stable as $$
  select 'content', c.id, case when c.type = 'event' then c.occurs_at else c.due_at end
    from content c
   where c.thread_id = $1
     and c.deleted_at is null and c.archived_at is null and c.done_at is null
     and c.source in ('person', 'share')
     and not reminder_foreign(c.derived_from_message_id)
     and (case when c.type = 'event' then c.occurs_at else c.due_at end) >= now() - interval '1 day'
  union all
  select 'note', n.id, coalesce(n.occurs_at, n.due_at)
    from notes n
   where n.scope = 'thread' and n.subject_id = $1
     and n.deleted_at is null and n.superseded_at is null and n.muted_at is null
     and not n.derived_from_untrusted and not reminder_foreign(n.derived_from_message_id)
     and coalesce(n.occurs_at, n.due_at) >= now() - interval '1 day'
$$;

-- What a member's pass may label in a thread.
create or replace function reminders_wanted(account uuid, thread uuid)
returns table (of text, id uuid, at timestamptz, born timestamptz)
language sql stable as $$
  select 'content', c.id, case when c.type = 'event' then c.occurs_at else c.due_at end, c.created_at
    from content c
    left join reminder_labels l on l.content_id = c.id
   where c.account_id = $1 and c.thread_id = $2
     and c.deleted_at is null and c.archived_at is null and c.done_at is null
     and c.source in ('person', 'share')
     and not reminder_foreign(c.derived_from_message_id)
     and ((case when c.type = 'event' then c.occurs_at else c.due_at end) >= now() - interval '1 day'
          or c.rrule is not null
          or (c.type = 'task' and c.due_at is null and c.created_at > now() - interval '30 days'
              -- An undated task can only be for a dated thing, so it is
              -- worth a pass only in a thread that holds one.
              and exists (select 1 from reminder_anchors($2))))
     and (l.id is null or (l.stopped_at is null and l.fingerprint is distinct from content_fingerprint(c)))
  union all
  select 'note', n.id, coalesce(n.occurs_at, n.due_at), n.created_at
    from notes n
    left join reminder_labels l on l.note_id = n.id
   where n.account_id = $1 and n.scope = 'thread' and n.subject_id = $2
     and n.deleted_at is null and n.superseded_at is null and n.muted_at is null
     and not n.derived_from_untrusted and not reminder_foreign(n.derived_from_message_id)
     and (coalesce(n.occurs_at, n.due_at) >= now() - interval '1 day' or n.rrule is not null)
     and (l.id is null or (l.stopped_at is null and l.fingerprint is distinct from note_fingerprint(n)))
$$;

-- The hourly pass reads written rows too now.
drop index content_due_live;
drop index content_occurs_live;
create index content_due_live on content (due_at)
  where deleted_at is null and done_at is null and archived_at is null;
create index content_occurs_live on content (occurs_at)
  where deleted_at is null and done_at is null and archived_at is null;

-- The morning send names the day's events on the person's own calendars,
-- under a switch of their own, on until they turn it off.
alter table accounts add column notify_calendar boolean not null default true;

-- An invite's title can be anybody's words, and Google files an invite on
-- the calendar unanswered. The morning names an event only when the person is
-- going: they made it, or answered yes or maybe. Null is not read yet; the
-- next pass reads each calendar whole, as 0065 did.
alter table connector_events add column going boolean;
update connector_calendars set sync_token = null
  where connection_id in (select id from connector_connections where state = 'active' and deleted_at is null);

-- The morning send names the day's events on the person's own calendars, so
-- a record can carry a calendar's titles. Which calendars a record named, so
-- the record goes with them: the privacy page says what a connected calendar
-- gave offload is deleted when it is disconnected, and unticking one stops
-- offload using it.
create table activity_calendars (
  activity_id uuid not null references activity (id) on delete cascade,
  calendar_id uuid not null references connector_calendars (id) on delete cascade,
  primary key (activity_id, calendar_id)
);
create index activity_calendars_calendar on activity_calendars (calendar_id);

-- In the database, not the code: a calendar goes on disconnect, on a list
-- that no longer has it, and on a cascade, and the link alone would cascade
-- and leave the record that names its events.
create function activity_with_calendar() returns trigger language plpgsql as $$
begin
  delete from activity
   where id in (select activity_id from activity_calendars where calendar_id = old.id);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger activity_with_calendar_deleted
  before delete on connector_calendars
  for each row execute function activity_with_calendar();

create trigger activity_with_calendar_unticked
  after update of selected on connector_calendars
  for each row when (old.selected and not new.selected)
  execute function activity_with_calendar();
