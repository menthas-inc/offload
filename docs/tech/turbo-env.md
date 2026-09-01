# Why turbo.json lists environment variables

Turbo runs tasks in a filtered environment. A variable that is not named in
`globalPassThroughEnv`, `globalEnv` or a task's own `env` is simply not there
inside the task, whatever the shell had.

That is a sensible default and it hid a real problem for a while. Locally
`pnpm test` worked because `test/setup.ts` loads the root `.env` itself, so the
suite got `DATABASE_URL` from the file rather than from the environment. CI has
no `.env`, sets `DATABASE_URL` in the workflow, and the tests refused to run:
the guard that stops them truncating a non-local database saw an empty value.

The list is `globalPassThroughEnv` rather than `globalEnv` deliberately.
`globalEnv` folds each value into the cache key, so rotating a secret would
invalidate every cached build for no reason, and a laptop and a CI runner would
never share a cache entry. `passThroughEnv` forwards the value without hashing
it, which is what these are: inputs to running, not to building.

`test` is `cache: false` for a related reason. Its result depends on a database
that turbo cannot see or hash, so a cached pass is a claim about a database
state that may no longer exist.
