-- Settings that are the owner's to change while offload runs, without a
-- deploy, and that the admin panel will show. One row per setting, each named
-- by the check so nothing else can be stored here.
--
-- The first is the web's map: the only part of the map that bills is a web map
-- load, so the owner can turn it off on the web and leave the phones' maps on.
create table app_settings (
  key text primary key check (key in ('web_maps')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by_account_id uuid references accounts(id) on delete set null
);
