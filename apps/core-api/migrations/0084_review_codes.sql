-- 0084 A way in for store reviewers (039). Typed on the sign-in screen and
-- redeemed at sign-in, for the address the provider has just verified.
--
-- A code staff make in the panel, pasted into the store review notes. It lets
-- in that address through the same promotion an admin invite runs. Only a
-- hash of the code is kept: it is shown once.
--
-- The limit is the database's. A redemption claims a use with one conditional
-- update, and the check below is the backstop for anything that writes the
-- row another way.
create table review_codes (
  id uuid primary key default uuid_v7(),
  -- SHA-256 of the normalised code. A 60-bit random value needs no slow hash.
  code_hash bytea not null unique,
  -- Staff's words, such as "App Store review 1.0". Never a person's content.
  note text not null check (char_length(note) between 1 and 80),
  max_uses integer not null check (max_uses between 1 and 50),
  uses integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- The staff member who made it. No foreign key, as an audit entry's: a
  -- redemption is recorded against them, and reads the same once they go.
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint review_codes_within_limit check (uses >= 0 and uses <= max_uses)
);

-- Which code let an account in. Null for everyone an admin invited. Codes are
-- revoked, never deleted, so the reference always resolves.
alter table accounts add column review_code_id uuid references review_codes (id);

-- The limiter's record, as waitlist_attempts keeps one (0004): HMACs, never
-- the address or the IP. Purged after two days; an account's rows go with it.
create table review_code_attempts (
  id uuid primary key default uuid_v7(),
  email_hmac bytea not null,
  ip_hmac bytea not null,
  created_at timestamptz not null default now()
);

create index review_code_attempts_email_idx on review_code_attempts (email_hmac, created_at);
create index review_code_attempts_ip_idx on review_code_attempts (ip_hmac, created_at);
