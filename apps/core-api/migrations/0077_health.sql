-- 0077 What the system says about itself, in tables the panel can read.

-- A failed job's reason, from a closed set (`src/jobs/errors.ts`). The panel
-- shows this and never `last_error`, which is free text. A dead job gets one
-- retry from the panel, or is dismissed from its list and kept.
alter table jobs add column error_code text;
alter table jobs add column retried_at timestamptz;
alter table jobs add column dismissed_at timestamptz;

-- The dead list and the stuck list.
create index jobs_state_updated_idx on jobs (state, updated_at);

-- The worker writes the same string to `last_error` and here (0034 lists the
-- columns it may update, and this adds one).
grant update (error_code) on jobs to offload_agent;

-- One row a minute per service. `core-api` and `worker` report themselves;
-- `web` and `database` are the Core API's view of them. The primary key makes
-- the write safe from two instances.
create table heartbeats (
  service text not null check (service in ('core-api', 'worker', 'web', 'database')),
  minute timestamptz not null,
  ok boolean not null,
  commit text,
  started_at timestamptz,
  primary key (service, minute)
);

-- Hourly counts, kept 90 days, so the plots outlive the job table's 30.
-- **No account column**: history is about the system, not about anybody.
create table job_stats_hourly (
  hour timestamptz not null,
  kind text not null,
  outcome text not null,
  count integer not null,
  wait_ms_sum bigint not null default 0,
  wait_ms_p95 integer not null default 0,
  run_ms_sum bigint not null default 0,
  run_ms_p95 integer not null default 0,
  primary key (hour, kind, outcome)
);

-- Written by the backup service at the end of each run, either way.
create table backup_runs (
  id uuid primary key default uuid_v7(),
  finished_at timestamptz not null default now(),
  bytes bigint not null default 0,
  ok boolean not null
);

-- One row per alert condition: open until it clears, and when it last mailed.
create table alert_states (
  condition text primary key,
  opened_at timestamptz not null default now(),
  cleared_at timestamptz,
  last_sent_at timestamptz
);

-- How many condition alerts went out in a UTC day, for the limit of ten.
create table alert_sends (
  day date primary key,
  count integer not null default 0
);

-- Each time a cap refused somebody: one row per account, cap, scope and UTC
-- day, counted. The scope says whose cap it was, theirs or the platform's.
create table limit_hits (
  account_id uuid not null references accounts (id) on delete cascade,
  cap text not null,
  scope text not null check (scope in ('account', 'platform')),
  day date not null,
  count integer not null default 1,
  last_at timestamptz not null default now(),
  primary key (account_id, cap, scope, day)
);

create index limit_hits_day_idx on limit_hits (day desc);
