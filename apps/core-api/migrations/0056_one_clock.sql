-- 0056 One clock per account.
--
-- `accounts` has carried no time zone since 001, so a bare day was filed at
-- noon UTC, "today" in the filing prompt was whatever zone the device named
-- on that one message, and nothing could schedule anything at an hour. 023
-- gives the account a clock: `time_zone`, set once at first run from the
-- device and editable in Settings; `follow_device`, whether the strip on
-- Today may offer to switch when the phone is somewhere else; and
-- `kept_time_zone`, the one device zone somebody has answered Keep to.
--
-- **No travel signal.** The design asked for a `last_seen_time_zone` written
-- by every request. It is not built: the strip compares the device's own
-- zone on the device, the zone header stays on the three requests that reach
-- the model, and the account keeps one clock rather than a record of where
-- its phones have been.
--
-- The alphabet is 0051's, and the value stored is the name ICU resolved,
-- never the header as sent: the zone reaches a prompt and an `at time zone`
-- bind, so it is checked at every door.

alter table accounts
  add column time_zone      text check (time_zone is null or time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  add column kept_time_zone text check (kept_time_zone is null or kept_time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  add column follow_device  boolean not null default true;

comment on column accounts.time_zone is
  'The account''s clock, an IANA name ICU resolved. Set at first run from the device, editable in Settings and by the strip on Today. Every timed date is drawn and every digest is scheduled in it.';
comment on column accounts.kept_time_zone is
  'The one device zone the person answered Keep to on the strip, so a trip asks once. Cleared when the clock changes.';
comment on column accounts.follow_device is
  'Whether the strip may offer to switch the clock when the phone is somewhere else. Off means nothing compares.';

-- The clock, backfilled from the last zone a message carried, for accounts
-- that exist already. An account whose messages never carried one takes its
-- next dump's, or first run's, and until then reads in UTC as before.
-- backfill:begin
update accounts a set time_zone = m.time_zone
  from (select distinct on (account_id) account_id, time_zone from messages
        where time_zone is not null order by account_id, created_at desc) m
  where m.account_id = a.id and a.time_zone is null;
-- backfill:end

-- The worker reads today in the account's zone. One column, named, as
-- every column added to accounts since 0010 has been.
grant select (time_zone) on accounts to offload_agent;
