-- 0074 Settings become a registry, and one account can carry its own caps.
--
-- 0073 named its one key in a check so nothing else could be stored. 034 has
-- seventeen keys and the list will move, so the closed set lives in code
-- (`src/settings.ts`): the route refuses a key the registry does not have,
-- and a row nobody recognises is never read.
alter table app_settings drop constraint app_settings_key_check;

-- One account's own value for a per-person cap, set by an owner. Absent means
-- the global setting. The key is one of the registry's `cap.*` keys, checked
-- in the route for the same reason as above.
create table account_limits (
  account_id uuid not null references accounts (id) on delete cascade,
  key text not null,
  value bigint not null,
  set_by_account_id uuid references accounts (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (account_id, key)
);

-- The worker reads three switches on every turn (web search, reading links,
-- the map). Read only: a setting is the owner's to change, through the panel.
grant select on app_settings to offload_agent;
