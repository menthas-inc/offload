-- 027 tweak: whose an event is.
--
-- A calendar shared with somebody else carries their day as well as the
-- account's. Two flags, read from Google at sync and nothing else kept: did
-- this account create the event, and is it on the guest list without having
-- declined. Today draws a calendar's event only when one of them holds. Null
-- is not read yet, and is drawn, so nothing vanishes before the next pass.
alter table connector_events add column created_by_me boolean;
alter table connector_events add column invited_me boolean;

-- Every synced event has neither; the next pass reads each calendar whole.
update connector_calendars set sync_token = null;
