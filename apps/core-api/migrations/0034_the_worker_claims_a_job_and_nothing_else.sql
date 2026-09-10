-- 0034 The worker may claim a job, and may not rewrite one.
--
-- 0009 granted `update on jobs` to `offload_agent`, table-wide, with a comment
-- saying it is "only to claim work". The grant did not say so, and the
-- difference matters more since 014.
--
-- **Every internal endpoint's defence rests on the job row.** `turn-result`,
-- `quick-add-result` and 014's `notes-compacted` all take the account, the
-- conversation and the thread from the `jobs` row this service wrote, never
-- from the body, because "a worker that has started asserting identity is
-- either compromised or wrong". That reasoning assumes the worker cannot
-- rewrite the row it is pointing at. Table-wide UPDATE means it can: set
-- `payload->>'threadId'` to a thread on another account, then post a
-- compaction plan for it, and the endpoint applies it to whatever the payload
-- now says.
--
-- The worker's own queries update seven columns, and none of them is `payload`
-- or `account_id`:
--
--   claim    state, locked_at, locked_by, attempts, updated_at
--   release  state, locked_at, locked_by, run_after, last_error, updated_at
--   finish   state, locked_at, locked_by, updated_at
--
-- So the grant becomes those seven. Found by the security review of 014, in a
-- line 0009 wrote and 0033 left alone.

revoke update on jobs from offload_agent;

grant update (state, locked_at, locked_by, attempts, run_after, last_error, updated_at)
  on jobs to offload_agent;
