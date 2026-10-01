-- 027 Today.
--
-- The layout a person chooses in Customize Today; a card they put off until
-- tomorrow or settled for good on Today alone; Google's own link to an event,
-- so a tap can hand it to the platform; and the indexes the day read and the
-- picks need.

-- Null is the defaults. The server fills any kind a stored layout does not
-- name, so a new kind needs no migration.
alter table accounts add column today_layout jsonb;

-- `card` is a closed shape, checked here and in code. `until` null is for
-- good: an invitation's Not now and the tip's Got it.
create table today_put_offs (
  account_id uuid not null references accounts(id) on delete cascade,
  card       text not null check (card ~ '^((calendar|request|invitation|question|pick):[0-9a-f-]{36}|tip:forwarding)$'),
  until      timestamptz,
  created_at timestamptz not null default now(),
  primary key (account_id, card)
);

-- A reference to the event, not what it says, bounded by the calendar's
-- window and deleted with it like the rest of the row. Only ever handed to
-- the person's own phone or browser.
alter table connector_events add column link text
  check (link is null or (char_length(link) <= 2048 and link ~ '^https://(www\.google\.com|calendar\.google\.com)/calendar/'));

-- Every event synced before this has no link; the next pass reads each
-- calendar whole and fills it in.
update connector_calendars set sync_token = null;

-- The day read's dated rows ride 0027's `content_thread_due_idx`.
create index content_picks_idx on content (account_id, created_at)
  where type = 'task' and due_at is null and rrule is null
    and done_at is null and archived_at is null and deleted_at is null;

create index questions_open_account_idx on questions (account_id) where state = 'open';
