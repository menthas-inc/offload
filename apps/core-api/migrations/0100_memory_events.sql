-- 051. Birthdays are memories, and a memory can be on a calendar.
--
-- The event a memory became, as `content.source_ref` holds a row's:
-- '<calendar external id>:<event id>', the series' master for a yearly one.
-- Only a memory carries one: a thread's note goes on no calendar.
alter table notes add column event_ref text;
alter table notes add constraint notes_event_ref_scope check (event_ref is null or scope = 'account');
create index notes_event_ref on notes (event_ref) where event_ref is not null;

-- Which calendar, asked about a memory rather than a row, reuses 013's
-- `questions.target_note_id`.

-- A write waiting for a go-ahead (`Ask before adding`) about a memory.
alter table connector_pending_writes add column note_id uuid references notes (id) on delete set null;

-- A memory with an event comes back to the pass when its words change, even
-- with its reminders off: the date in its words is where the event belongs.
create or replace function memories_to_date(account uuid)
returns table (id uuid, kind text, text text)
language sql stable as $$
  select n.id, n.kind, n.text
    from notes n
    left join reminder_labels l on l.note_id = n.id
   where n.scope = 'account' and n.subject_id = $1 and n.account_id = $1
     and n.kind in ('people', 'about')
     and n.deleted_at is null and n.superseded_at is null
     and (l.id is null
          or ((l.stopped_at is null or n.event_ref is not null)
              and l.fingerprint is distinct from note_fingerprint(n)))
$$;

-- The view carries notes' columns as of its creation; made again, as 0086 did.
drop view readable_notes;
create view readable_notes as
select notes.*, thread_members.account_id as viewer_account_id
from notes
join thread_members on thread_members.thread_id = notes.subject_id
where notes.scope = 'thread'
  and thread_members.state = 'accepted';
