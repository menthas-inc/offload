-- 030. A thread's map, on Google Maps Platform.
--
-- Google's terms let offload keep its id for a place indefinitely and the
-- place's coordinates for at most thirty days, and nothing else: not its name,
-- not its address, not its categories. This migration makes the tables say so.

-- No place ever resolved in production (the key was never set); a local
-- database may hold some, each carrying a name and an address the terms do not
-- let us keep. And every remembered miss was written with no key set, so none
-- of them is a miss. Destructive and accepted: production loses nothing, and a
-- development database loses only cache.
update content set place_id = null where place_id is not null;
update notes set place_id = null where place_id is not null;
delete from place_lookups;
delete from places;

-- Google's place id in provider_place_id, kept. Its name and address, gone.
-- Whether a result was an area is derived from its categories, so it goes with
-- the coordinates. A page place keeps its coordinates as long as it likes:
-- they are the page's, not Google's.
alter table places drop column name;
alter table places drop column formatted_address;
alter table places drop column resolved_at;
alter table places drop constraint places_provider_check;
alter table places alter column provider drop default;
alter table places add constraint places_provider_check
  check (provider in ('google', 'page'));
alter table places add column approximate boolean;
-- When the coordinates were fetched. The daily sweep nulls a Google place's
-- coordinates at thirty days whatever else happens.
alter table places add column coords_at timestamptz;

-- `readable_content` is `select content.*` and Postgres expands the star when
-- the view is made, so it is dropped before the columns change and made again
-- after, exactly as 0057 wrote it, or it would keep the old column list.
drop view if exists readable_content;

-- What a row that is not a `location` is looked up by: an event's location,
-- written by the model from the dump or the reader's `place` field and shown on
-- the place sheet, or the place name a link's page gave, looked up and not
-- shown. On the row, never in a job payload. Bounded here as well as in code,
-- because what reaches Google is a claim about a third party.
alter table content add column location text;
alter table content add constraint content_location_shape check (
  location is null or (
    type in ('event', 'link')
    and char_length(location) between 1 and 120
    and location !~ '[\r\n]'
  )
);

-- A link's page was read for a location, at filing or by the one-off pass.
-- Set whether or not anything was found, and kept when a person clears the
-- point, so a cleared link is never read again.
alter table content add column place_read_at timestamptz;

-- The place fields as they were before a turn's edit_content changed them, so
-- that turn's Undo can put them back. Written and read by the server alone,
-- and cleared once no Undo can use it: the next write to the row, or the daily
-- sweep after 25 hours, which covers a mail turn's 24-hour Undo.
alter table content add column place_prior jsonb;
alter table content add column place_prior_at timestamptz;

-- A calendar event's place, and a keyed fingerprint of the location text it
-- last looked up, so an unchanged location is not looked up twice without a
-- second copy of somebody else's words. Both go with the row when the copy
-- goes (019).
alter table connector_events add column place_id uuid
  references places (id) on delete set null;
alter table connector_events add column located_key text;

create view readable_content as
select content.*, thread_members.account_id as viewer_account_id
from content
join thread_members on thread_members.thread_id = content.thread_id
where thread_members.state = 'accepted';

create index content_points on content (thread_id)
  where place_id is not null and deleted_at is null;
create index connector_events_points on connector_events (calendar_id, occurs_at)
  where place_id is not null and deleted_at is null;
create index places_age on places (coords_at)
  where provider = 'google' and lat is not null;
