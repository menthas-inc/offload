-- Closing the composer ends the conversation.
--
-- Until now the only thing that ended one was six hours of silence. Closing the
-- chat cleared the screen and nothing else, so the next dump joined the same
-- conversation and offload answered it with the last one still in its context.
-- Somebody who deliberately put a conversation away and started a new subject
-- got answers about the old one.
--
-- Server-side rather than a flag on the device, for two reasons. A conversation
-- belongs to the account and not to the phone it was closed on, so closing it
-- on one surface has to end it on the others. And a device flag is lost on
-- reinstall, which would quietly resurrect a conversation somebody ended.
--
-- Not `deleted_at`. Ended is not deleted: every message stays readable, stays
-- in the record a turn's Undo reaches for, and stays subject to the same
-- retention as any other. This says only that nothing new joins it.

alter table conversations add column ended_at timestamptz;

-- The two reads that pick "the conversation this dump belongs to" both filter
-- on account, deleted_at, and recency. Ending is a fourth predicate on the same
-- lookup rather than a new one, so it rides the same index.
comment on column conversations.ended_at is
  'Set when somebody closed the composer. Nothing new joins this conversation; its messages are untouched.';
