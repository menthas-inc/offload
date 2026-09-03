# The agent plane

The only thing in offload that talks to Claude.

One entrypoint and no HTTP surface: work arrives by polling the `jobs` table,
which is also the admission control that bounds how many model calls can be in
flight at once. FastAPI becomes a second entrypoint on this same image the day
something needs to call in, and nothing does yet.

```
uv sync
uv run offload-worker
```

## What it is allowed to do

It reads the database as `offload_agent`, a role with `select` on six tables,
one of those on a single column, and `update` on `jobs` so it can claim. It
writes nothing to the canonical tables: every result goes back through the Core
API's `/internal/v1/turn-result`, which is what `stack.md` means by one writer.

`pnpm agent:role` from the repo root mints that role's password and writes
`AGENT_DATABASE_URL`. Run it again to rotate.

## Environment

| Variable | What |
| --- | --- |
| `AGENT_DATABASE_URL` | Written by `pnpm agent:role`. Never set by hand. |
| `API_URL` | Where the Core API is. The worker posts results there. |
| `INTERNAL_SERVICE_TOKEN` | Shared with the Core API. Private network only. |
| `ANTHROPIC_API_KEY` | A service account key scoped to a workspace. |

Every one is required and none has a default. A worker that starts against the
wrong database or with no key fails at boot, which is where it is obvious,
rather than at the first dump.

## Tests

```
uv run pytest
```

The isolation tests need both `DATABASE_URL` and `AGENT_DATABASE_URL`: they seed
as the admin and read as the worker, so the grant is exercised alongside the
query. They skip without both rather than passing vacuously.
