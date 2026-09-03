-- 0010 Narrow the agent role's grant on accounts to one column.
--
-- 0009 said, in its own header, that the worker needs "the account's thread
-- names for the prompt" and `accounts.state` only. It then wrote
-- `grant select on accounts`, which in Postgres is every column: email,
-- display_name, referred_by_account_id, analytics_subject_id, tier,
-- consent_version. The comment and the SQL disagreed and the SQL won, which is
-- the way round that matters.
--
-- Worth fixing even though nothing uses it. The worker does not read `accounts`
-- at all today, so this was an unused grant, and an unused grant is the kind
-- that survives review by not being noticed. 0009's own preamble argues that
-- this role is the likeliest place in the product for a supply-chain problem to
-- land, which is exactly the argument against leaving a broad one lying there
-- for a future dependency to use.
--
-- Column-level rather than revoked outright, because reading an account's state
-- is a thing the worker will plausibly need, and a grant that names the column
-- it needs is clearer than one that is added back in a hurry later.

revoke select on accounts from offload_agent;
grant select (state) on accounts to offload_agent;
