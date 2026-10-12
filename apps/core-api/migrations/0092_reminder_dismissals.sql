-- 0092 Reminders on Today: a dismiss hides one reminder, not the thing.
--
-- The x on a card in Today's Reminders (drawn 2026-10-11) hides the reminder
-- that was showing: a birthday dismissed a month out comes back a week out.
-- One row per thing, occurrence and window, so the next window is untouched
-- and Remind me is never written. Ids, a day and a word: no words of the
-- person's. Goes with its thing and with the account.

create table reminder_dismissals (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts (id) on delete cascade,
  content_id   uuid references content (id) on delete cascade,
  -- A thread note, or a memory (a note of scope 'account').
  note_id      uuid references notes (id) on delete cascade,
  -- The day the reminder is about, in the account's zone.
  occurrence   text not null check (occurrence ~ '^\d{4}-\d{2}-\d{2}$'),
  -- Which reminder of that occurrence was showing when it was dismissed.
  window_name  text not null check (window_name in ('long', 'short', 'day')),
  created_at   timestamptz not null default now(),
  check (num_nonnulls(content_id, note_id) = 1)
);

-- One dismiss per account, thing, occurrence and window. The account is in
-- the key so that nobody else's row can ever swallow an insert, and so
-- Today's read, one account at a time, has its index.
create unique index reminder_dismissals_content on reminder_dismissals (account_id, content_id, occurrence, window_name) where content_id is not null;
create unique index reminder_dismissals_note on reminder_dismissals (account_id, note_id, occurrence, window_name) where note_id is not null;
