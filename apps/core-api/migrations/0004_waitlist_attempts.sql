-- 0004 Waitlist attempts.
--
-- The rate limiter on the public waitlist endpoint counted rows in
-- analytics_events, matching properties ->> 'email_hash' and 'ip_hash'.
-- Nothing ever wrote those properties, so both counts were always zero and the
-- limit never fired for any address or any IP. Found by review; it had been
-- that way since the file's first commit.
--
-- The fix is not to start writing those properties. analytics_events is an
-- outbox that ships to R2 and is never a second copy of anything (OFF-1), and
-- a security control should not be a side effect of a telemetry write that a
-- schema change could silently break the same way twice.
--
-- So: a table whose only job is rate limiting, holding no address and no
-- address, only HMACs of them. HMAC rather than a bare hash, keyed by the
-- server secret, because an unsalted digest of an email address is reversible
-- against any common address list.

create table waitlist_attempts (
  id          uuid primary key default uuid_v7(),
  email_hmac  bytea not null,
  ip_hmac     bytea not null,
  created_at  timestamptz not null default now()
);

-- The two windows the limiter actually asks about. Both are counts over a
-- recent interval, so the timestamp leads.
create index waitlist_attempts_email_idx on waitlist_attempts (email_hmac, created_at desc);
create index waitlist_attempts_ip_idx on waitlist_attempts (ip_hmac, created_at desc);

-- Nothing here is worth keeping once it is outside every window. The longest
-- is a day; a week of slack costs nothing and makes the sweep unhurried.
create index waitlist_attempts_created_idx on waitlist_attempts (created_at);
