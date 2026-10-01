-- 027 tweak: whose an event is.
--
-- A calendar shared with somebody else carries their day as well as the
-- account's. Two flags, read from Google at sync and nothing else kept: did
-- this account create the event, and is it on the guest list without having
-- declined. Today draws a calendar's event only when one of them holds. Null
-- is not read yet, and is drawn, so nothing vanishes before the next pass.
alter table connector_events add column created_by_me boolean;
alter table connector_events add column invited_me boolean;

-- And no guest's address, ever: nothing read them, and a change to an event
-- with guests asks Google who they are at that moment. Names and answers stay.
update connector_events
  set attendees = (select coalesce(jsonb_agg(guest - 'email'), '[]'::jsonb) from jsonb_array_elements(attendees) guest)
  where jsonb_typeof(attendees) = 'array' and attendees::text like '%"email"%';

-- Every synced event has neither flag; the next pass reads each calendar whole.
update connector_calendars set sync_token = null
  where connection_id in (select id from connector_connections where state = 'active' and deleted_at is null);
