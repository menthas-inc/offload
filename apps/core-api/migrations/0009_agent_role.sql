-- 0009 The agent plane's database role.
--
-- stack.md says the Python plane "reads through SQLAlchemy... and writes
-- derived artifacts through a Core API internal endpoint, so there is one
-- writer". Until now that has been a sentence in a document. 003 is the first
-- feature where a second process actually connects, so this makes it a grant.
--
-- What the worker legitimately needs: read the conversation it is answering,
-- read the account's thread names for the prompt, and claim its own jobs. That
-- is six tables of SELECT and one of UPDATE. Everything else is refused by the
-- database rather than by a convention the worker could break by accident.
--
-- Explicitly out of reach: sessions, account_identities, account_keys,
-- thread_keys and staff. The agent plane is the process that will eventually
-- run tool-calling code and pull third-party packages, which makes it the most
-- likely place in this product for a supply-chain problem to land. It has no
-- business reading a session token or a wrapped key, so it cannot.
--
-- The role is created without LOGIN. A password would be a secret in source
-- (SEC-1), so `pnpm agent:role` sets it from AGENT_DB_PASSWORD and grants LOGIN.
-- Until that runs the role exists and cannot connect, which is the safe order.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'offload_agent') then
    create role offload_agent nologin;
  end if;
end
$$;

grant usage on schema public to offload_agent;

-- Read. Enough to assemble a prompt and answer the message it was given.
grant select on conversations    to offload_agent;
grant select on messages         to offload_agent;
grant select on threads          to offload_agent;
grant select on thread_members   to offload_agent;
grant select on jobs             to offload_agent;
grant select on accounts         to offload_agent;

-- Write, exactly one table and only to claim work. The reply itself goes
-- through the Core API's internal endpoint, which is what keeps one writer.
grant update on jobs to offload_agent;

-- Belt and braces. If a later migration adds a table and someone grants broadly
-- by habit, these stay revoked.
revoke all on sessions            from offload_agent;
revoke all on account_identities  from offload_agent;
revoke all on account_keys        from offload_agent;
revoke all on thread_keys         from offload_agent;
revoke all on staff               from offload_agent;
