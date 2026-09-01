-- 0002 Auth.
--
-- Better Auth is remapped onto our tables rather than running its own identity
-- schema alongside them, because two sources of truth for "who is this" works
-- until they disagree, and then the disagreement is an authorization bug.
--
-- That mapping has a cost, and it is recorded here rather than absorbed: Better
-- Auth's account model requires provider token columns. We do not want them. We
-- never call a Google API on someone's behalf; connector tokens are a separate
-- vault by decision. The columns exist because the library needs them, and a
-- hook blanks them immediately after sign-in, so a live provider refresh token
-- is never at rest in this database.

-- ------------------------------------------------- account_identities, extended

alter table account_identities
  add column access_token              text,
  add column refresh_token             text,
  add column id_token                  text,
  add column access_token_expires_at   timestamptz,
  add column refresh_token_expires_at  timestamptz,
  add column scope                     text,
  add column password                  text,
  add column updated_at                timestamptz not null default now();

-- ------------------------------------------------------------------- sessions

create table sessions (
  id         uuid primary key default uuid_v7(),
  account_id uuid not null references accounts (id) on delete cascade,
  token      text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_account_idx on sessions (account_id);
create index sessions_expires_idx on sessions (expires_at);

-- --------------------------------------------------------------- verification

-- Better Auth uses this for state and nonce during an OAuth exchange. Short
-- lived by nature; swept by the purge job with everything else.
create table verifications (
  id         uuid primary key default uuid_v7(),
  identifier text not null,
  value      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index verifications_identifier_idx on verifications (identifier);
create index verifications_expires_idx on verifications (expires_at);
