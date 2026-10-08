-- The store demo: one fictional person, two connections, and the threads the
-- App Store screenshots are taken of. It tells the landing page's story
-- (apps/web/src/components/LandingStory.tsx): a Lisbon trip shared with Ana,
-- a bookshelf build, a dinner, a work thing and the garden.
--
-- Loaded by `pnpm -C apps/core-api seed:store-demo`, which also writes the
-- account keys, uploads the photo and signs in. Local databases only, and
-- never anything a person typed: every name, address and row here is made up.
--
-- Idempotent. Everything with a demo id is removed first, except the accounts,
-- which are upserted so a session minted against them survives a reseed.
--
-- **Every time is wall-clock in one zone**, `demo.zone`, America/New_York
-- unless the script sets another: Sam's and Tom's, the calendar's, and the
-- Lisbon trip's too, so the flight reads 07:40 on a phone in that zone as it
-- does on the landing page. Today's rows are relative to midnight there; the
-- trip is the story's own, 14 to 17 October 2026.
--
-- Ids: accounts 0de70000-0000-4000-a000-*, threads -a001-, conversations
-- -a002-, messages -a003-, notes -a004-, content -a005-, the calendar
-- connection -a006-, calendars -a007-, events -a008-.

begin;

select set_config('demo.zone', coalesce(nullif(current_setting('demo.zone', true), ''), 'America/New_York'), true);

-- ---------------------------------------------------------------- clear

delete from connector_events where id::text like '0de70000-0000-4000-a008-%';
delete from connector_calendars where id::text like '0de70000-0000-4000-a007-%';
delete from connector_connections where id::text like '0de70000-0000-4000-a006-%';
delete from note_labels where note_id::text like '0de70000-0000-4000-a004-%';
delete from notes
 where id::text like '0de70000-0000-4000-a004-%'
    or subject_id::text like '0de70000-0000-4000-a000-%'
    or subject_id::text like '0de70000-0000-4000-a001-%';
delete from content_blobs where content_id in (select id from content where thread_id::text like '0de70000-0000-4000-a001-%');
delete from content where thread_id::text like '0de70000-0000-4000-a001-%';
delete from blob_keys where blob_id in (select id from blobs where account_id::text like '0de70000-0000-4000-a000-%');
delete from blobs where account_id::text like '0de70000-0000-4000-a000-%';
delete from message_threads where message_id::text like '0de70000-0000-4000-a003-%';
delete from messages where conversation_id::text like '0de70000-0000-4000-a002-%';
delete from conversations where id::text like '0de70000-0000-4000-a002-%';
delete from thread_keys where thread_id::text like '0de70000-0000-4000-a001-%';
delete from thread_members where thread_id::text like '0de70000-0000-4000-a001-%';
update accounts set default_thread_id = null where id::text like '0de70000-0000-4000-a000-%';
delete from threads where id::text like '0de70000-0000-4000-a001-%';
delete from activity where account_id::text like '0de70000-0000-4000-a000-%';
delete from jobs where account_id::text like '0de70000-0000-4000-a000-%';
delete from connections
 where account_a::text like '0de70000-0000-4000-a000-%' or account_b::text like '0de70000-0000-4000-a000-%';

-- ---------------------------------------------------------------- people

-- Sam Rivera signs in. Ana Duarte lives in Lisbon and is coming on the trip;
-- Tom Reyes is Sam's brother and comes to dinner. Sam and Tom are in the demo
-- zone, so a Today read lands on the phone's own day.
insert into accounts (id, email, state, email_verified, display_name, analytics_subject_id,
                      time_zone, country, consented_at, consent_version, first_signed_in_at)
values
  ('0de70000-0000-4000-a000-000000000001', 'sam@demo.offload.test', 'active', true, 'Sam Rivera', gen_random_uuid(), current_setting('demo.zone'), 'US', now(), '2026-10-07', now() - interval '60 days'),
  ('0de70000-0000-4000-a000-000000000002', 'ana@demo.offload.test', 'active', true, 'Ana Duarte', gen_random_uuid(), 'Europe/Lisbon', 'PT', now(), '2026-10-07', now() - interval '90 days'),
  ('0de70000-0000-4000-a000-000000000003', 'tom@demo.offload.test', 'active', true, 'Tom Reyes',  gen_random_uuid(), current_setting('demo.zone'), 'US', now(), '2026-10-07', now() - interval '45 days'),
  -- Somebody just invited, for the first-run screenshot: no name, no consent.
  ('0de70000-0000-4000-a000-000000000004', 'new@demo.offload.test', 'invited', true, null, gen_random_uuid(), current_setting('demo.zone'), 'US', null, null, null)
on conflict (id) do update set
  state = excluded.state, display_name = excluded.display_name, time_zone = excluded.time_zone,
  consented_at = excluded.consented_at, consent_version = excluded.consent_version, deleted_at = null;

insert into connections (account_a, account_b) values
  ('0de70000-0000-4000-a000-000000000001', '0de70000-0000-4000-a000-000000000002'),
  ('0de70000-0000-4000-a000-000000000001', '0de70000-0000-4000-a000-000000000003');

-- ---------------------------------------------------------------- threads

insert into threads (id, created_by_account_id, name, icon, hue, icon_set_by, always_on, last_activity_at) values
  ('0de70000-0000-4000-a001-000000000001', '0de70000-0000-4000-a000-000000000001', 'Miscellaneous',   'lasso',    1, 'offload', true,  now() - interval '1 day'),
  ('0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000001', 'Lisbon trip',     'luggage',  1, 'offload', false, now() - interval '20 minutes'),
  ('0de70000-0000-4000-a001-000000000003', '0de70000-0000-4000-a000-000000000001', 'Bookshelf build', 'hammer',   5, 'offload', false, now() - interval '2 hours'),
  ('0de70000-0000-4000-a001-000000000004', '0de70000-0000-4000-a000-000000000001', 'Friday dinner',   'utensils', 2, 'offload', false, now() - interval '3 hours'),
  ('0de70000-0000-4000-a001-000000000005', '0de70000-0000-4000-a000-000000000001', 'Q4 launch',       'rocket',   4, 'offload', false, now() - interval '5 hours'),
  ('0de70000-0000-4000-a001-000000000006', '0de70000-0000-4000-a000-000000000001', 'Garden',          'sprout',   3, 'offload', false, now() - interval '1 day'),
  ('0de70000-0000-4000-a001-000000000007', '0de70000-0000-4000-a000-000000000001', 'Groceries',       'shopping-cart', 6, 'offload', false, now() - interval '6 hours'),
  ('0de70000-0000-4000-a001-000000000008', '0de70000-0000-4000-a000-000000000001', 'Half marathon',   'footprints', 7, 'offload', false, now() - interval '2 days'),
  ('0de70000-0000-4000-a001-000000000009', '0de70000-0000-4000-a000-000000000001', 'Mum''s birthday',  'gift',     8, 'offload', false, now() - interval '3 days'),
  ('0de70000-0000-4000-a001-000000000010', '0de70000-0000-4000-a000-000000000001', 'Car service',     'car',      9, 'offload', false, now() - interval '5 days'),
  ('0de70000-0000-4000-a001-000000000021', '0de70000-0000-4000-a000-000000000002', 'Miscellaneous',   'lasso',    1, 'offload', true,  now() - interval '1 day'),
  ('0de70000-0000-4000-a001-000000000031', '0de70000-0000-4000-a000-000000000003', 'Miscellaneous',   'lasso',    1, 'offload', true,  now() - interval '1 day'),
  ('0de70000-0000-4000-a001-000000000041', '0de70000-0000-4000-a000-000000000004', 'Miscellaneous',   'lasso',    1, 'offload', true,  now());

update accounts a set default_thread_id = t.id
  from threads t
 where t.created_by_account_id = a.id and t.always_on and t.id::text like '0de70000-0000-4000-a001-%';

-- The Lisbon trip is Sam's, Ana's and Tom's; Friday dinner is Sam's and Tom's.
insert into thread_members (thread_id, account_id, state, responded_at)
select t.id, t.created_by_account_id, 'accepted', now() - interval '30 days' from threads t where t.id::text like '0de70000-0000-4000-a001-%';
insert into thread_members (thread_id, account_id, invited_by, state, responded_at) values
  ('0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000002', '0de70000-0000-4000-a000-000000000001', 'accepted', now() - interval '20 days'),
  ('0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000003', '0de70000-0000-4000-a000-000000000001', 'accepted', now() - interval '19 days'),
  ('0de70000-0000-4000-a001-000000000004', '0de70000-0000-4000-a000-000000000003', '0de70000-0000-4000-a000-000000000001', 'accepted', now() - interval '4 days');

-- ---------------------------------------------------------------- rows

-- `d.t` is midnight today in the demo zone, as an instant.
with d as (select z.tz, (date_trunc('day', now() at time zone z.tz) at time zone z.tz) as t from (select current_setting('demo.zone') as tz) z)
insert into content (id, thread_id, account_id, type, title, body, url, occurs_at, occurs_end_at, due_at, done_at, source, created_at, updated_at)
select v.id::uuid, v.thread_id::uuid, v.account_id::uuid, v.type, v.title, v.body, v.url, v.occurs_at, v.occurs_end_at, v.due_at, v.done_at, v.source, v.created_at, v.created_at
  from d, lateral (values
  -- Lisbon trip
  ('0de70000-0000-4000-a005-000000000201', '0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000001', 'event',
     'Alfama flat, 14 to 17 Oct', 'Your booking at Alfama Flats. Confirmed for 14 to 17 October, two guests.', null::text,
     (timestamp '2026-10-14 15:00' at time zone d.tz), (timestamp '2026-10-17 11:00' at time zone d.tz), null::timestamptz, null::timestamptz, 'person', now() - interval '6 days'),
  ('0de70000-0000-4000-a005-000000000202', '0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000001', 'event',
     'Flights to Lisbon', 'TAP, €214 each.', null,
     (timestamp '2026-10-14 07:40' at time zone d.tz), (timestamp '2026-10-14 10:10' at time zone d.tz), null, null, 'person', now() - interval '5 days'),
  ('0de70000-0000-4000-a005-000000000203', '0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000002', 'link',
     'Tram 28 timetable', null, 'https://www.carris.pt/en/',
     null, null, null, null, 'person', now() - interval '3 days'),
  ('0de70000-0000-4000-a005-000000000204', '0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000001', 'task',
     'Book dinner in Alfama for the 15th', null, null,
     null, null, d.t + interval '1 day' + interval '18 hours', null, 'person', now() - interval '2 days'),
  ('0de70000-0000-4000-a005-000000000205', '0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000003', 'task',
     'Renew passport photos', null, null,
     null, null, d.t + interval '17 hours', now() - interval '1 day', 'person', now() - interval '4 days'),
  ('0de70000-0000-4000-a005-000000000206', '0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000001', 'task',
     'Travel insurance for three', null, null,
     null, null, d.t + interval '20 hours', null, 'person', now() - interval '1 day'),
  ('0de70000-0000-4000-a005-000000000207', '0de70000-0000-4000-a001-000000000002', '0de70000-0000-4000-a000-000000000002', 'event',
     'Fado night at Tasca do Chico', null, null,
     (timestamp '2026-10-15 21:30' at time zone d.tz), (timestamp '2026-10-15 23:30' at time zone d.tz), null, null, 'person', now() - interval '20 minutes'),
  -- Bookshelf build
  ('0de70000-0000-4000-a005-000000000301', '0de70000-0000-4000-a001-000000000003', '0de70000-0000-4000-a000-000000000001', 'task',
     '4 more shelf brackets', null, null,
     null, null, d.t + interval '17 hours', null, 'person', now() - interval '2 hours'),
  ('0de70000-0000-4000-a005-000000000302', '0de70000-0000-4000-a001-000000000003', '0de70000-0000-4000-a000-000000000001', 'voice',
     'Remind me to call the landlord', 'About drilling into the brick wall before Saturday.', null,
     null, null, null, null, 'person', now() - interval '3 hours'),
  ('0de70000-0000-4000-a005-000000000303', '0de70000-0000-4000-a001-000000000003', '0de70000-0000-4000-a000-000000000001', 'task',
     'Call the landlord about the wall', null, null,
     null, null, d.t + interval '12 hours', null, 'person', now() - interval '3 hours'),
  ('0de70000-0000-4000-a005-000000000304', '0de70000-0000-4000-a001-000000000003', '0de70000-0000-4000-a000-000000000001', 'task',
     'Pick up the oak boards, cut to size', null, null,
     null, null, null, null, 'person', now() - interval '4 days'),
  ('0de70000-0000-4000-a005-000000000305', '0de70000-0000-4000-a001-000000000003', '0de70000-0000-4000-a000-000000000001', 'task',
     'Sand and oil the top shelf', null, null,
     null, null, null, now() - interval '2 days', 'person', now() - interval '5 days'),
  -- Friday dinner
  ('0de70000-0000-4000-a005-000000000401', '0de70000-0000-4000-a001-000000000004', '0de70000-0000-4000-a000-000000000001', 'event',
     'Dinner at ours with Tom', null, null,
     d.t + interval '1 day' + interval '19 hours 30 minutes', d.t + interval '1 day' + interval '22 hours', null, null, 'person', now() - interval '3 days'),
  ('0de70000-0000-4000-a005-000000000402', '0de70000-0000-4000-a001-000000000004', '0de70000-0000-4000-a000-000000000003', 'task',
     'Bring a bottle of vinho verde', null, null,
     null, null, d.t + interval '1 day' + interval '18 hours', null, 'person', now() - interval '1 day'),
  ('0de70000-0000-4000-a005-000000000403', '0de70000-0000-4000-a001-000000000004', '0de70000-0000-4000-a000-000000000001', 'task',
     'Marinate the chicken the night before', null, null,
     null, null, null, null, 'person', now() - interval '3 hours'),
  -- Q4 launch
  ('0de70000-0000-4000-a005-000000000501', '0de70000-0000-4000-a001-000000000005', '0de70000-0000-4000-a000-000000000001', 'task',
     'Send the launch deck for review', null, null,
     null, null, d.t + interval '15 hours', null, 'person', now() - interval '1 day'),
  ('0de70000-0000-4000-a005-000000000502', '0de70000-0000-4000-a001-000000000005', '0de70000-0000-4000-a000-000000000001', 'event',
     'Launch review', null, null,
     d.t + interval '14 hours', d.t + interval '15 hours', null, null, 'person', now() - interval '5 hours'),
  ('0de70000-0000-4000-a005-000000000503', '0de70000-0000-4000-a001-000000000005', '0de70000-0000-4000-a000-000000000001', 'task',
     'Rewrite the pricing page intro', null, null,
     null, null, d.t + interval '11 hours', null, 'person', now() - interval '3 days'),
  -- Garden
  ('0de70000-0000-4000-a005-000000000601', '0de70000-0000-4000-a001-000000000006', '0de70000-0000-4000-a000-000000000001', 'task',
     'Plant the tulip bulbs before the frost', null, null,
     null, null, d.t + interval '3 days' + interval '10 hours', null, 'person', now() - interval '1 day'),
  -- Groceries
  ('0de70000-0000-4000-a005-000000000701', '0de70000-0000-4000-a001-000000000007', '0de70000-0000-4000-a000-000000000001', 'task',
     'Oat milk, eggs, coffee beans', null, null,
     null, null, d.t + interval '18 hours', null, 'person', now() - interval '6 hours'),
  ('0de70000-0000-4000-a005-000000000702', '0de70000-0000-4000-a001-000000000007', '0de70000-0000-4000-a000-000000000001', 'task',
     'Lemons and fresh thyme', null, null,
     null, null, null, null, 'person', now() - interval '6 hours'),
  -- Half marathon, Mum's birthday, Car service
  ('0de70000-0000-4000-a005-000000000801', '0de70000-0000-4000-a001-000000000008', '0de70000-0000-4000-a000-000000000001', 'event',
     'Long run, 16km', null, null,
     d.t + interval '2 days' + interval '8 hours', d.t + interval '2 days' + interval '9 hours 30 minutes', null, null, 'person', now() - interval '2 days'),
  ('0de70000-0000-4000-a005-000000000802', '0de70000-0000-4000-a001-000000000008', '0de70000-0000-4000-a000-000000000001', 'task',
     'New running shoes', null, null,
     null, null, null, null, 'person', now() - interval '2 days'),
  ('0de70000-0000-4000-a005-000000000901', '0de70000-0000-4000-a001-000000000009', '0de70000-0000-4000-a000-000000000001', 'task',
     'Order the flowers', null, null,
     null, null, d.t + interval '9 days' + interval '12 hours', null, 'person', now() - interval '3 days'),
  ('0de70000-0000-4000-a005-000000000902', '0de70000-0000-4000-a001-000000000009', '0de70000-0000-4000-a000-000000000001', 'event',
     'Lunch for Mum''s birthday', null, null,
     d.t + interval '10 days' + interval '13 hours', d.t + interval '10 days' + interval '15 hours', null, null, 'person', now() - interval '3 days'),
  ('0de70000-0000-4000-a005-000000001001', '0de70000-0000-4000-a001-000000000010', '0de70000-0000-4000-a000-000000000001', 'task',
     'Book the winter tyre swap', null, null,
     null, null, d.t + interval '6 days' + interval '9 hours', null, 'person', now() - interval '5 days')
  ) as v(id, thread_id, account_id, type, title, body, url, occurs_at, occurs_end_at, due_at, done_at, source, created_at);

update threads t set content_count = (select count(*) from content c where c.thread_id = t.id and c.deleted_at is null)
 where t.id::text like '0de70000-0000-4000-a001-%';

-- ---------------------------------------------------------------- thread notes

insert into notes (id, account_id, scope, subject_id, kind, text, origin, created_at, updated_at) values
  ('0de70000-0000-4000-a004-000000000201', '0de70000-0000-4000-a000-000000000001', 'thread', '0de70000-0000-4000-a001-000000000002', 'going_on', 'Ana can only travel the 14th to the 17th', 'stated', now() - interval '7 days', now() - interval '7 days'),
  ('0de70000-0000-4000-a004-000000000202', '0de70000-0000-4000-a000-000000000001', 'thread', '0de70000-0000-4000-a001-000000000002', 'going_on', '€214 for the flights', 'stated', now() - interval '5 days', now() - interval '5 days'),
  ('0de70000-0000-4000-a004-000000000203', '0de70000-0000-4000-a000-000000000002', 'thread', '0de70000-0000-4000-a001-000000000002', 'going_on', 'The flat has a washing machine, no dryer', 'stated', now() - interval '2 days', now() - interval '2 days'),
  ('0de70000-0000-4000-a004-000000000301', '0de70000-0000-4000-a000-000000000001', 'thread', '0de70000-0000-4000-a001-000000000003', 'going_on', 'Brackets are matte black, 30cm', 'stated', now() - interval '2 hours', now() - interval '2 hours'),
  ('0de70000-0000-4000-a004-000000000302', '0de70000-0000-4000-a000-000000000001', 'thread', '0de70000-0000-4000-a001-000000000003', 'going_on', 'The alcove is 92cm wide', 'stated', now() - interval '6 days', now() - interval '6 days'),
  ('0de70000-0000-4000-a004-000000000401', '0de70000-0000-4000-a000-000000000003', 'thread', '0de70000-0000-4000-a001-000000000004', 'going_on', 'Tom is vegetarian on weekdays', 'stated', now() - interval '2 days', now() - interval '2 days');

-- ---------------------------------------------------------------- memories

-- What offload knows about Sam across threads. The map needs an embedding per
-- memory and a nightly layout; the script writes made-up vectors (a kind and
-- a topic each, no model call) and runs the real layout over them.
insert into notes (id, account_id, scope, subject_id, kind, text, origin, created_at, updated_at) values
  ('0de70000-0000-4000-a004-000000000901', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'people', 'Tom is their brother.', 'stated', now() - interval '40 days', now() - interval '40 days'),
  ('0de70000-0000-4000-a004-000000000902', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'people', 'Ana is a friend who lives in Lisbon.', 'learned', now() - interval '20 days', now() - interval '20 days'),
  ('0de70000-0000-4000-a004-000000000903', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'people', 'Maya is on their launch team.', 'learned', now() - interval '9 days', now() - interval '9 days'),
  ('0de70000-0000-4000-a004-000000000904', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'people', 'Mr Patel is the landlord, on the ground floor.', 'learned', now() - interval '12 days', now() - interval '12 days'),
  ('0de70000-0000-4000-a004-000000000905', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'things', 'Their bike is a grey folding bike.', 'stated', now() - interval '30 days', now() - interval '30 days'),
  ('0de70000-0000-4000-a004-000000000906', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'things', 'The bookshelf is oak, 18mm boards.', 'learned', now() - interval '6 days', now() - interval '6 days'),
  ('0de70000-0000-4000-a004-000000000907', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'things', 'Tom keeps their spare key.', 'stated', now() - interval '35 days', now() - interval '35 days'),
  ('0de70000-0000-4000-a004-000000000908', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'things', 'Their passport runs out in March 2028.', 'stated', now() - interval '4 days', now() - interval '4 days'),
  ('0de70000-0000-4000-a004-000000000909', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'about', 'They live in Brooklyn.', 'stated', now() - interval '50 days', now() - interval '50 days'),
  ('0de70000-0000-4000-a004-000000000910', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'about', 'They prefer a window seat on flights.', 'learned', now() - interval '5 days', now() - interval '5 days'),
  ('0de70000-0000-4000-a004-000000000911', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'about', 'They are allergic to cats.', 'stated', now() - interval '25 days', now() - interval '25 days'),
  ('0de70000-0000-4000-a004-000000000912', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'about', 'They are learning Portuguese.', 'learned', now() - interval '14 days', now() - interval '14 days'),
  ('0de70000-0000-4000-a004-000000000913', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'patterns', 'They shop for groceries on Saturday mornings.', 'learned', now() - interval '15 days', now() - interval '15 days'),
  ('0de70000-0000-4000-a004-000000000914', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'patterns', 'Launch reviews happen on Thursdays.', 'learned', now() - interval '9 days', now() - interval '9 days'),
  ('0de70000-0000-4000-a004-000000000915', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'patterns', 'They do a long run on Saturdays.', 'learned', now() - interval '11 days', now() - interval '11 days'),
  ('0de70000-0000-4000-a004-000000000916', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'rules', 'Put flights on their calendar.', 'stated', now() - interval '18 days', now() - interval '18 days'),
  ('0de70000-0000-4000-a004-000000000917', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'rules', 'Nothing before 9 on weekdays.', 'stated', now() - interval '22 days', now() - interval '22 days'),
  ('0de70000-0000-4000-a004-000000000918', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'people', 'Lena is Tom''s partner.', 'learned', now() - interval '16 days', now() - interval '16 days'),
  ('0de70000-0000-4000-a004-000000000919', '0de70000-0000-4000-a000-000000000001', 'account', '0de70000-0000-4000-a000-000000000001', 'people', 'Dr Okoye is their dentist.', 'stated', now() - interval '7 days', now() - interval '7 days');

-- ---------------------------------------------------------------- the conversation

-- What Sam dumped today, already answered, so the composer's sheet has a past.
insert into conversations (id, account_id, started_at, last_message_at) values
  ('0de70000-0000-4000-a002-000000000001', '0de70000-0000-4000-a000-000000000001', now() - interval '1 day', now() - interval '20 minutes');

insert into messages (id, conversation_id, account_id, role, type, turn_id, text, state, source, created_at) values
  ('0de70000-0000-4000-a003-000000000001', '0de70000-0000-4000-a002-000000000001', '0de70000-0000-4000-a000-000000000001', 'person', 'text', '0de70000-0000-4000-a009-000000000001', '4 more shelf brackets, matte black, 30cm', 'answered', 'person', now() - interval '2 hours'),
  ('0de70000-0000-4000-a003-000000000002', '0de70000-0000-4000-a002-000000000001', '0de70000-0000-4000-a000-000000000001', 'offload', 'text', '0de70000-0000-4000-a009-000000000001', 'Added 4 more shelf brackets to Bookshelf build, due today.', 'answered', 'person', now() - interval '2 hours' + interval '4 seconds'),
  ('0de70000-0000-4000-a003-000000000005', '0de70000-0000-4000-a002-000000000001', '0de70000-0000-4000-a000-000000000001', 'person', 'text', '0de70000-0000-4000-a009-000000000003', 'Put the flights on my calendar', 'answered', 'person', now() - interval '1 hour'),
  ('0de70000-0000-4000-a003-000000000006', '0de70000-0000-4000-a002-000000000001', '0de70000-0000-4000-a000-000000000001', 'offload', 'text', '0de70000-0000-4000-a009-000000000003', 'Added Flights to Lisbon to your calendar for Wednesday 14 October at 07:40.', 'answered', 'person', now() - interval '1 hour' + interval '4 seconds'),
  ('0de70000-0000-4000-a003-000000000003', '0de70000-0000-4000-a002-000000000001', '0de70000-0000-4000-a000-000000000001', 'person', 'text', '0de70000-0000-4000-a009-000000000002', 'Ana can only travel the 14th to the 17th', 'answered', 'person', now() - interval '25 minutes'),
  ('0de70000-0000-4000-a003-000000000004', '0de70000-0000-4000-a002-000000000001', '0de70000-0000-4000-a000-000000000001', 'offload', 'text', '0de70000-0000-4000-a009-000000000002', 'Noted in Lisbon trip. The Alfama flat is booked for the same dates.', 'answered', 'person', now() - interval '25 minutes' + interval '4 seconds');

insert into message_threads (message_id, thread_id, landed, created_at) values
  ('0de70000-0000-4000-a003-000000000001', '0de70000-0000-4000-a001-000000000003', true, now() - interval '2 hours'),
  ('0de70000-0000-4000-a003-000000000005', '0de70000-0000-4000-a001-000000000002', true, now() - interval '1 hour'),
  ('0de70000-0000-4000-a003-000000000003', '0de70000-0000-4000-a001-000000000002', true, now() - interval '25 minutes');

-- ---------------------------------------------------------------- calendar

-- A Google Calendar connection with no secret: nothing here ever reaches
-- Google. Today reads `connector_events` for the account's selected calendars.
-- Not the primary, so a card says "Calendar: Sam", which fits on it.
insert into connector_connections (id, account_id, provider, external_account_email, state, connected_at, last_sync_at, created_at, updated_at) values
  ('0de70000-0000-4000-a006-000000000001', '0de70000-0000-4000-a000-000000000001', 'google', 'sam@demo.offload.test', 'active', now() - interval '30 days', now(), now() - interval '30 days', now());

insert into connector_calendars (id, connection_id, external_id, summary, timezone, access_role, colour, is_primary, selected, synced_at, created_at, updated_at) values
  ('0de70000-0000-4000-a007-000000000001', '0de70000-0000-4000-a006-000000000001', 'sam.rivera@demo.offload.test', 'Sam', current_setting('demo.zone'), 'owner', '#3F6B4F', false, true, now(), now() - interval '30 days', now());

with d as (select z.tz, (date_trunc('day', now() at time zone z.tz) at time zone z.tz) as t from (select current_setting('demo.zone') as tz) z)
insert into connector_events (id, account_id, calendar_id, source_ref, title, occurs_at, occurs_end_at, timezone, organizer_is_me, created_by_me, created_at, updated_at)
select v.id::uuid, '0de70000-0000-4000-a000-000000000001', '0de70000-0000-4000-a007-000000000001', v.ref, v.title, v.s, v.e, d.tz, true, true, now() - interval '3 days', now()
  from d, lateral (values
  ('0de70000-0000-4000-a008-000000000001', 'demo-standup',   'Team standup',          d.t + interval '10 hours', d.t + interval '10 hours 15 minutes'),
  ('0de70000-0000-4000-a008-000000000002', 'demo-lunch',     'Lunch with Maya',       d.t + interval '12 hours 30 minutes', d.t + interval '13 hours 30 minutes'),
  ('0de70000-0000-4000-a008-000000000003', 'demo-dentist',   'Dentist',               d.t + interval '17 hours',  d.t + interval '17 hours 45 minutes'),
  ('0de70000-0000-4000-a008-000000000004', 'demo-climbing',  'Climbing with Tom',     d.t + interval '1 day' + interval '7 hours', d.t + interval '1 day' + interval '8 hours 30 minutes'),
  ('0de70000-0000-4000-a008-000000000005', 'demo-checkin',   'Check in, Alfama flat', (timestamp '2026-10-14 15:00' at time zone d.tz), (timestamp '2026-10-14 16:00' at time zone d.tz)),
  ('0de70000-0000-4000-a008-000000000006', 'demo-dinner-ana','Dinner with Ana',       (timestamp '2026-10-14 20:30' at time zone d.tz), (timestamp '2026-10-14 22:30' at time zone d.tz))
  ) as v(id, ref, title, s, e);

commit;
