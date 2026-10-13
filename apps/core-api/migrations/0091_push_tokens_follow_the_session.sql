-- 0091 A push token goes with the session that registered it (024, security
-- finding 2026-10-11).
--
-- Sign-out deletes the token while the session is still good, but a session
-- that ends on the server, ended from Signed in on or expired, could not: the
-- phone had already wiped itself, the delete route needs a live session, and
-- the account's digests and reminders kept landing on its lock screen. Better
-- Auth deletes the row on a revoke and on sign-out, and the nightly purge
-- deletes an expired one a day after it expires, so the cascade covers every
-- way a session ends. The sends refuse a token whose session has expired, so
-- that day is covered too.
--
-- A token registered before this has no session to name. It goes: every phone
-- registers again on launch and on Today, and a guess at which session a token
-- belonged to is the bug this closes.

delete from push_tokens;

alter table push_tokens add column session_id uuid not null references sessions (id) on delete cascade;
create index push_tokens_session_idx on push_tokens (session_id);
