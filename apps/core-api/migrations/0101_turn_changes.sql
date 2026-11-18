-- 052. What a turn changed, so its reply can show it and its Undo can put it back.
--
-- One row per dump message and target. `previous` holds offload's own columns
-- as they were before the turn (never a connected app's body, OFF-4), merged
-- when a second tool touches a second field of the same target. It is nulled
-- once a later dump retires the turn's Undo; the ids stay, so a reopened reply
-- still knows which rows the turn changed.
create table turn_changes (
  message_id   uuid not null references messages (id) on delete cascade,
  account_id   uuid not null references accounts (id) on delete cascade,
  target_kind  text not null check (target_kind in ('content', 'note', 'thread')),
  target_id    uuid not null,
  tool         text not null,
  previous     jsonb,
  created_at   timestamptz not null default now(),
  primary key (message_id, target_kind, target_id)
);
create index turn_changes_account_idx on turn_changes (account_id);
-- The rows still holding a value: the next dump's retiring update reads only these.
create index turn_changes_live_idx on turn_changes (account_id) where previous is not null;

-- What an answer showed beside its words: a day, {"on": "2027-03-28"}, or a
-- span, {"span": {"from": "2026-11-16", "to": "2026-11-22"}}. Offload's
-- answering message only.
alter table messages add column shown jsonb;

-- When the turn's result arrived, on the person's message. A late Undo (past
-- the first eight seconds, by server time) keeps the dump and leaves what
-- changed after this; the client's clock reads it too.
alter table messages add column settled_at timestamptz;

-- `readable_messages` is `select messages.*`, resolved when the view was made,
-- so the two columns above are invisible through it until it is recreated.
drop view if exists readable_messages;
create view readable_messages as
select messages.*, messages.account_id as viewer_account_id
from messages
join conversations on conversations.id = messages.conversation_id
where conversations.account_id = messages.account_id;
