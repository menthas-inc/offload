-- Which turn proposed a calendar write, so the reply can carry its own control.
--
-- **A sentence cannot be clicked.** offload saying "I'll add it once you
-- confirm" with nothing to confirm is the shape this product already refuses
-- everywhere else: the reply names what happened and the control that acts on
-- it sits next to it. The proposal shipped without one, so an event with guests
-- or on a shared calendar was proposed, announced, and then expired an hour
-- later having done nothing.
--
-- The message rather than the turn, matching `content.derived_from_message_id`,
-- because a turn is a group of messages and the row belongs to the one whose
-- tool call made it. The turn is one join away and that is how the clients read
-- it back.
--
-- Nullable, because the column arrives after the table and nothing has written
-- it yet. A proposal with no message is unreachable from any screen, which is
-- the state this migration exists to stop producing.

alter table connector_pending_writes
  add column message_id uuid references messages (id) on delete cascade;

-- The open proposals for a turn, which is the only question anything asks of
-- this table from a screen.
create index connector_pending_writes_message_idx
  on connector_pending_writes (message_id)
  where confirmed_at is null and declined_at is null;
