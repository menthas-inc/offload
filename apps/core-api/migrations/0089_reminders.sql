-- 0089 Reminders (042).
--
-- What offload worked out about a dated thing so it can remind its author, and
-- nothing else. **No date and no schedule are stored here**: the date is read
-- from the thing whenever a send or the hourly pass asks, so a moved date, a
-- tick or a change of How many needs nothing kept in step. Derived, offload's,
-- never exported, and deleted with its thing.

create table reminder_labels (
  id                 uuid primary key default gen_random_uuid(),
  -- The thing's author, and the only account it reminds.
  account_id         uuid not null references accounts (id) on delete cascade,
  content_id         uuid references content (id) on delete cascade,
  -- A thread note, or a memory (a note of scope 'account').
  note_id            uuid references notes (id) on delete cascade,
  -- Null on a label that only records a stop made before any pass read it.
  kind               text check (kind in ('meeting', 'appointment', 'occasion', 'deadline', 'trip', 'day', 'none')),
  lead               text check (lead in ('none', 'days', 'weeks', 'months')),
  -- An undated task's date for reminders is the day before this thing starts.
  anchor_content_id  uuid references content (id) on delete set null,
  anchor_note_id     uuid references notes (id) on delete set null,
  -- A note's or a memory's name in a notification: a run of its own words.
  name               text check (char_length(name) between 1 and 60 and name !~ '[\r\n]'),
  -- A memory's date, which comes round every year.
  yearly_on          text check (yearly_on ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  -- What the label was judged on, from content_fingerprint or note_fingerprint.
  fingerprint        text,
  labelled_at        timestamptz,
  -- The author last set the date. The two-day rule reads it.
  date_set_at        timestamptz,
  -- Somebody else set the date last: nothing is sent until the author edits.
  held_at            timestamptz,
  -- The author's Remind me, off. Never cleared by a pass.
  stopped_at         timestamptz,
  created_at         timestamptz not null default now(),
  check (num_nonnulls(content_id, note_id) = 1),
  check (num_nonnulls(anchor_content_id, anchor_note_id) <= 1),
  check ((kind is null) = (lead is null))
);

create unique index reminder_labels_content on reminder_labels (content_id) where content_id is not null;
create unique index reminder_labels_note on reminder_labels (note_id) where note_id is not null;
-- The send's candidate read, and Today's.
create index reminder_labels_live on reminder_labels (account_id)
  where stopped_at is null and held_at is null and kind is not null and kind <> 'none';

-- Which kind of date a row or a note carries, never its value, so moving a
-- date keeps its label and adding or clearing one asks for another.
create function remind_date_shape(at_due timestamptz, at_occurs timestamptz, attrs jsonb, is_event boolean)
returns text language sql immutable as $$
  select case
    when (case when is_event then at_occurs else at_due end) is null then ''
    when coalesce((attrs ->> 'all_day')::boolean, false) then case when is_event then 'occurs' else 'due' end
    else case when is_event then 'occurs-time' else 'due-time' end
  end
$$;

-- What a label was judged on. One definition, compared by the daily run, the
-- worker's read and the Core API's apply.
create function content_fingerprint(c content) returns text language sql stable as $$
  select md5(concat_ws(chr(31), c.type, c.title, coalesce(c.body, ''),
    remind_date_shape(c.due_at, c.occurs_at, c.attrs, c.type = 'event'),
    coalesce(split_part(c.rrule, ';', 1), '')))
$$;

create function note_fingerprint(n notes) returns text language sql stable as $$
  select md5(concat_ws(chr(31), 'note', n.text,
    remind_date_shape(n.due_at, n.occurs_at, n.attrs, n.occurs_at is not null),
    coalesce(split_part(n.rrule, ';', 1), '')))
$$;

alter table accounts add column notify_reminders boolean not null default true;
alter table accounts add column notify_reminder_count smallint not null default 2
  check (notify_reminder_count between 1 and 3);

-- A phone built before 042 has no channel or door for a reminder of its own,
-- so it is sent none; it registers without saying it takes one.
alter table push_tokens add column takes_reminders boolean not null default false;

alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check
  check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted', 'labelled', 'mail', 'export', 'reminder'));
-- A reminder about a note goes with the note.
alter table activity add column note_id uuid references notes (id) on delete cascade;
-- Which memories a send named, so forgetting one can find its records.
-- Not a column on activity_mentions, whose key is a thread and an account.
create table activity_memories (
  activity_id uuid not null references activity (id) on delete cascade,
  note_id     uuid not null references notes (id) on delete cascade,
  primary key (activity_id, note_id)
);
create index activity_memories_note on activity_memories (note_id);

-- The hourly pass's read of timed things across accounts.
create index content_due_live on content (due_at)
  where deleted_at is null and done_at is null and archived_at is null and source_ref is null;
create index content_occurs_live on content (occurs_at)
  where deleted_at is null and done_at is null and archived_at is null and source_ref is null;
create index notes_occurs_live on notes (occurs_at) where scope = 'thread' and deleted_at is null;

-- The worker reads which of a member's things need a label; it never writes one.
grant select on reminder_labels to offload_agent;

-- A message whose words are not the person's own: a forwarded email, a
-- calendar, a capture, anything untrusted. Nothing it filed is reminded about.
create function reminder_foreign(message uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from messages m
     where m.id = message
       and (m.derived_from_untrusted or m.source in ('mail', 'gmail', 'calendar', 'browser'))
  )
$$;

-- What an undated task in a thread may be for: a dated row or note there, by
-- any member, dated today or later, live, and the person's own words.
create function reminder_anchors(thread uuid)
returns table (of text, id uuid, at timestamptz)
language sql stable as $$
  select 'content', c.id, case when c.type = 'event' then c.occurs_at else c.due_at end
    from content c
   where c.thread_id = $1
     and c.deleted_at is null and c.archived_at is null and c.done_at is null and c.source_ref is null
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

-- What a member's pass may label in a thread: their own dated rows and notes,
-- dated today or later or repeating, and their undated tasks of the last 30
-- days; never a stopped one, and never one whose label still matches. One
-- definition for the daily run's booking, the worker's read and the apply.
create function reminders_wanted(account uuid, thread uuid)
returns table (of text, id uuid, at timestamptz, born timestamptz)
language sql stable as $$
  select 'content', c.id, case when c.type = 'event' then c.occurs_at else c.due_at end, c.created_at
    from content c
    left join reminder_labels l on l.content_id = c.id
   where c.account_id = $1 and c.thread_id = $2
     and c.deleted_at is null and c.archived_at is null and c.done_at is null
     and c.source in ('person', 'share') and c.source_ref is null
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

-- The memories a memory pass may date: People and About, active, with no
-- label or with words changed since, never one whose reminders were stopped.
create function memories_to_date(account uuid)
returns table (id uuid, kind text, text text)
language sql stable as $$
  select n.id, n.kind, n.text
    from notes n
    left join reminder_labels l on l.note_id = n.id
   where n.scope = 'account' and n.subject_id = $1 and n.account_id = $1
     and n.kind in ('people', 'about')
     and n.deleted_at is null and n.superseded_at is null
     and (l.id is null or (l.stopped_at is null and l.fingerprint is distinct from note_fingerprint(n)))
$$;
