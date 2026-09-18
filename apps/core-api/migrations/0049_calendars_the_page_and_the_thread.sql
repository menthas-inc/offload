-- 019. A thread picks its calendars, an event is held once, and who can see a
-- calendar is read from Google rather than asked.
--
-- 012 mirrored a calendar into content rows in the thread the calendar named.
-- That is what made a calendar name a thread, and it is what a thread's picks
-- cannot be built on: a calendar picked in two threads would be two copies of
-- every event, and a calendar picked nowhere would be nowhere. So the copy
-- moves out of every thread and on to the connection, one row per event per
-- calendar, and a thread reads through the calendars it picked.
--
-- **The person's shared flag goes.** A calendar has one or more participants,
-- counted from Google's access list under one added scope; a count only, never
-- an address, and null where the person does not own the calendar or the grant
-- lacks the scope, which every reader treats as more than one.

-- ---------------------------------------------------------- the copy

create table connector_events (
  id               uuid primary key default uuid_v7(),
  -- Denormalised from the connection, for Today's read: the leading column on
  -- a hot read, written once by the sync and never updated.
  account_id       uuid not null references accounts (id) on delete cascade,
  calendar_id      uuid not null references connector_calendars (id) on delete cascade,
  -- <calendar external id>:<event id>, as 012 wrote it on content.source_ref.
  source_ref       text not null,
  title            text not null,
  occurs_at        timestamptz,
  occurs_end_at    timestamptz,
  all_day          boolean not null default false,
  timezone         text,
  location         text,
  series_ref       text,
  organizer_is_me  boolean not null default false,
  -- Per event, by author: text somebody else wrote is read, never obeyed.
  -- Defaults true so a path that forgets to set it errs the safe way.
  untrusted        boolean not null default true,
  -- Minimised as 012 wrote it: a name and whether they accepted, an address
  -- only on an event offload created with guests.
  attendees        jsonb not null default '[]',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (calendar_id, source_ref)
);

create index connector_events_calendar_occurs_idx
  on connector_events (calendar_id, occurs_at)
  where deleted_at is null;

create index connector_events_account_occurs_idx
  on connector_events (account_id, occurs_at)
  where deleted_at is null;

comment on table connector_events is
  '019. One copy of each event per calendar, on the connection, for the window. Threads read it through their picks.';

-- ---------------------------------------------------------- the picks

create table thread_calendars (
  thread_id    uuid not null references threads (id) on delete cascade,
  calendar_id  uuid not null references connector_calendars (id) on delete cascade,
  -- The member who picked. Leaving a thread removes exactly theirs, and a
  -- write reaches a calendar only through the acting account's own picks.
  account_id   uuid not null references accounts (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (thread_id, calendar_id)
);

create index thread_calendars_calendar_idx on thread_calendars (calendar_id);
create index thread_calendars_account_idx  on thread_calendars (account_id);

comment on table thread_calendars is
  '019. The calendars a thread reads through, one row per member per calendar. A thread starts with none.';

-- ---------------------------------------------------------- the calendar row

alter table connector_calendars
  add column participants         integer,
  add column participants_read_at timestamptz,
  add column colour               text;

comment on column connector_calendars.participants is
  '019. Everyone Google lets see this calendar, the person included, counted from the access list. Null: not owned, or the grant lacks the scope; read as more than one.';

-- ---------------------------------------------------------- the switch, the flag, the link

alter table accounts
  add column calendar_ask_first boolean not null default false;

-- A message written for a tapped answer whose label was a calendar somebody
-- else named. The tail the prompts read substitutes a fixed line for its text.
alter table messages
  add column derived_from_untrusted boolean not null default false;

-- `readable_messages` is `select messages.*`, resolved once when the view was
-- created, so the new column is invisible through it until it is recreated.
-- The fifth time, and `predicate.test.ts` catches it every time.
drop view if exists readable_messages;

create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;

-- The row a confirmed create marks as on the calendar, now that a proposal no
-- longer files into a thread.
alter table connector_pending_writes
  add column content_id uuid references content (id) on delete set null;

alter table questions drop constraint questions_field_check;
alter table questions
  add constraint questions_field_check
  check (field in ('date', 'span', 'time', 'tag', 'country', 'calendar'));

-- ---------------------------------------------------------- what moves

-- An approved calendar that named a thread becomes a pick on that thread,
-- where the connection's account is still a member of it. Only an approved
-- one: 012 kept the thread on an un-ticked calendar, and a pick made from that
-- would re-widen the thread the day the calendar was ticked again.
insert into thread_calendars (thread_id, calendar_id, account_id)
select c.default_thread_id, c.id, n.account_id
  from connector_calendars c
  join connector_connections n on n.id = c.connection_id
  join thread_members m
    on m.thread_id = c.default_thread_id
   and m.account_id = n.account_id
   and m.state = 'accepted'
 where c.default_thread_id is not null
   and c.selected
on conflict do nothing;

-- A proposal still waiting confirmed into a thread that no longer exists.
update connector_pending_writes
   set declined_at = now()
 where confirmed_at is null
   and declined_at is null;

-- The rows 012 synced into threads go, and with them the rows its confirm
-- path filed on a confirmed proposal, which were Google mirrors written with no
-- message behind them. A row the planner filed from a dump is `source =
-- 'person'` and is untouched. A dated exception, recorded in the feature spec:
-- alpha, invite only, nothing that matters in production.
delete from content
 where source = 'calendar'
   and derived_from_message_id is null;

-- ---------------------------------------------------------- what goes

drop table connector_calendar_rules;

alter table connector_calendars
  drop constraint connector_calendars_selected_needs_thread,
  drop constraint connector_calendars_unowned_is_shared,
  drop column default_thread_id,
  drop column is_shared;
