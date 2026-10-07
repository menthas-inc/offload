-- The grants a restored backup needs before offload can use it.
--
-- backup.sh dumps with --no-owner --no-privileges and restore.sh restores the
-- same way, so a restored database belongs to whoever restored it and nobody
-- else has anything. The migrations' grants to the worker do not come back on
-- their own: schema_migrations is restored too, so migrate re-applies none of
-- them, and the worker's first claim is refused. restore.sh runs this straight
-- after a restore told --grants yes, as the role that restored it, and says
-- how to run it by hand after one told no:
--
--   psql -X -1 -v ON_ERROR_STOP=1 -f apps/backup/regrant.sql <restored database>
--
-- Only for a database offload will run on: a drill copy given these grants is
-- a full copy the live API and worker could read. It refuses a database where
-- the worker already has grants, which the live one does, unless it is run
-- with -v again=yes. It needs a role that can create roles and change owners,
-- which is the superuser a restore runs as anyway.

\set ON_ERROR_STOP on
\if :{?api_role}
\else
  \set api_role offload_api
\endif
\if :{?again}
\else
  \set again no
\endif
set regrant.api_role = :'api_role';
set regrant.again = :'again';
\echo Giving the worker and the API their grants in :DBNAME

-- A fresh restore gives the worker nothing. The live database gives it
-- everything below, and replacing that by mistake would be silent.
do $$
declare
  agent oid := (select oid from pg_roles where rolname = 'offload_agent');
begin
  if current_setting('regrant.again') = 'yes' or agent is null then
    return;
  end if;
  if exists (select from pg_namespace n, aclexplode(n.nspacl) a where a.grantee = agent)
    or exists (select from pg_class c, aclexplode(c.relacl) a where a.grantee = agent)
    or exists (select from pg_attribute t, aclexplode(t.attacl) a where a.grantee = agent)
    or exists (select from pg_proc p, aclexplode(p.proacl) a where a.grantee = agent)
  then
    raise exception 'offload_agent already has grants in %, so this is not a fresh restore. Nothing changed. To replace them, run again with -v again=yes.',
      current_database();
  end if;
end
$$;

-- The API's role, when the cluster has one: it owns the application's objects,
-- as apps/core-api/src/api-role.ts makes it, since a restore made them the
-- restorer's. Without one the API connects as the restorer, and owns them already.
do $$
declare
  api text := current_setting('regrant.api_role');
  r record;
begin
  if not exists (select 1 from pg_roles where rolname = api) then
    return;
  end if;
  execute format('grant connect on database %I to %I', current_database(), api);
  execute format('grant usage, create on schema public to %I', api);
  for r in
    select c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'S', 'v', 'm', 'p')
      and pg_get_userbyid(c.relowner) <> api
  loop
    execute format('alter %s public.%I owner to %I',
      case r.relkind
        when 'S' then 'sequence'
        when 'v' then 'view'
        when 'm' then 'materialized view'
        else 'table'
      end,
      r.relname, api);
  end loop;
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_userbyid(p.proowner) <> api
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter routine %s owner to %I', r.sig, api);
  end loop;
end
$$;

-- The worker's role, as 0009 makes it: without LOGIN, which `pnpm agent:role`
-- grants with a password. A cluster that already has it keeps its password.
-- CONNECT outright, as the API's is, so a cluster that refuses PUBLIC one
-- still lets the worker in.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'offload_agent') then
    create role offload_agent nologin;
  end if;
  execute format('grant connect on database %I to offload_agent', current_database());
end
$$;

-- From nothing, so a run with -v again=yes, over stray grants or its own,
-- ends the same. Revoking a table's privileges revokes its columns' too, and
-- routines are functions and procedures both.
revoke all on all tables in schema public from offload_agent;
revoke all on all sequences in schema public from offload_agent;
revoke all on all routines in schema public from offload_agent;
revoke all on schema public from offload_agent;

-- What every migration in apps/core-api/migrations adds up to, read from a
-- scratch database they have just run into rather than replayed: a grant replayed by name
-- lands on whatever has that name now, and 0032's `memories` is 0033's `notes`.
-- test/regrant.test.sh fails when a migration changes them and this has not
-- caught up. Edit above the next line, never below it.
-- Generated from here down by apps/backup/test/regrant.test.sh --write.
grant usage on schema public to offload_agent;
grant select (country, default_thread_id, id, memories_at, state, time_zone, web_links_enabled, web_search_enabled) on table public.accounts to offload_agent;
grant select on table public.app_settings to offload_agent;
grant select (created_at, deleted_at, duration_ms, id, kind, measured_ms, message_id, provider_ref, renditions_at) on table public.blobs to offload_agent;
grant select on table public.connections to offload_agent;
grant select (connection_id, selected) on table public.connector_calendars to offload_agent;
grant select (account_id, deleted_at, id, state) on table public.connector_connections to offload_agent;
grant select on table public.content to offload_agent;
grant select on table public.content_blobs to offload_agent;
grant select, insert, update, delete on table public.content_chunks to offload_agent;
grant select (content_id, label_id, removed_at, removed_by, set_by) on table public.content_labels to offload_agent;
grant select on table public.conversations to offload_agent;
grant select on table public.jobs to offload_agent;
grant update (attempts, error_code, last_error, locked_at, locked_by, run_after, state, updated_at) on table public.jobs to offload_agent;
grant select (colour, created_at, deleted_at, deleted_by_person, id, name, set_by, thread_id, touched_by_person_at) on table public.labels to offload_agent;
grant select (account_id, message_id) on table public.memory_forgotten to offload_agent;
grant select, insert, update, delete on table public.message_chunks to offload_agent;
grant select on table public.messages to offload_agent;
grant select, insert, update, delete on table public.note_chunks to offload_agent;
grant select on table public.notes to offload_agent;
grant update (embedded_at, embedding, embedding_model) on table public.notes to offload_agent;
grant select on table public.questions to offload_agent;
grant select (content_id, note_id) on table public.suggestions to offload_agent;
grant select on table public.thread_members to offload_agent;
grant select on table public.threads to offload_agent;
grant select (labels_sorted_at) on table public.threads to offload_agent;
