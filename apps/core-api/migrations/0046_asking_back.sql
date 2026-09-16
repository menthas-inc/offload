-- 018. A question offload asked back, stored with the turn like the reply is.
--
-- **Values, not words.** The sentence is one of five templates rendered by the
-- server; `options` carries values the server already knows how to apply and
-- the labels are offload's wording of them. The client sees labels and sends
-- an index back. Nothing in this row was written by a person or by a page.
--
-- One row per question, at most two per turn, one open per conversation. The
-- partial unique index is the one-open-question rule as a constraint rather
-- than a check somebody has to remember to run.
create table questions (
  id                     uuid primary key default uuid_v7(),
  account_id             uuid not null references accounts (id) on delete cascade,
  conversation_id        uuid not null references conversations (id) on delete cascade,
  -- The person's message the turn was about. The control hangs off it the way
  -- the calendar's waiting control does, and its text is what a country re-run
  -- answers again.
  message_id             uuid not null references messages (id) on delete cascade,
  turn_id                uuid not null,
  ordinal                smallint not null check (ordinal in (1, 2)),
  field                  text not null check (field in ('date', 'span', 'time', 'tag', 'country')),
  -- The row the answer fills. One of the two, or neither for country.
  target_content_id      uuid references content (id) on delete set null,
  target_note_id         uuid references notes (id) on delete set null,
  text                   text not null check (length(text) <= 80),
  options                jsonb not null,
  state                  text not null default 'pending'
                           check (state in ('pending', 'open', 'answered', 'closed')),
  answered_option        smallint,
  answered_message_id    uuid references messages (id) on delete set null,
  -- The answer's own turn, so Undo can find what it changed.
  answer_turn_id         uuid,
  -- What the field held before the answer, for Undo. Null when nothing was set.
  previous_value         jsonb,
  derived_from_untrusted boolean not null default false,
  created_at             timestamptz not null default now(),
  settled_at             timestamptz,
  unique (turn_id, ordinal)
);

create index questions_message_idx on questions (message_id) where state in ('open', 'pending');
create unique index questions_one_open_idx on questions (conversation_id) where state = 'open';
create index questions_turn_idx on questions (turn_id);
create index questions_answer_turn_idx on questions (answer_turn_id) where answer_turn_id is not null;

comment on table questions is
  '018. What offload asked back on a turn. Templates and values only; no text anybody wrote.';
