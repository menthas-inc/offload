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

## On Railway

Its own service, with **root directory `apps/agent`**. That is the whole trick:
pointed there, the builder sees `pyproject.toml` and `uv.lock` and builds a
Python app, with no Node build involved at all. This directory imports nothing
from the rest of the monorepo, so it stands alone.

The start command is `uv run offload-worker`. It is in `railway.json` here and
should also be set in the service settings, because `decisions.md` records that
Railpack ignored a per-service config file at prepare time once already, and a
start command that lives only in a file that might be ignored is a service that
might not start.

If the root directory approach turns out not to work, the fallback is sharing
the repository root with the other services and setting `OFFLOAD_SERVICE=agent`,
which `scripts/start.mjs` already dispatches on.

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
