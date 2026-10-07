"""2026-10-07. A dump is answered while the worker is inside background work.

The worker used to be one loop: claim the highest priority job, await it, claim
the next. Priority decided what was claimed and never what was interrupted, so
a dump that arrived during a nightly pass waited for the whole pass. This runs
the real `run()` against the database, with a handler that holds a background
job open, and asserts a dump booked after it is handled anyway.
"""

import asyncio
import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent import worker as worker_mod
from offload_agent.config import Config, _asyncpg

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


async def _book(conn, account_id: str, kind: str, priority: int) -> str:
    return str(
        (
            await conn.execute(
                text(
                    "insert into jobs (kind, account_id, payload, priority, run_after, state) "
                    "values (:k, :a, '{}'::jsonb, :p, now(), 'queued') returning id"
                ),
                {"k": kind, "a": account_id, "p": priority},
            )
        ).scalar_one()
    )


async def test_a_dump_is_handled_while_a_background_job_is_still_running(monkeypatch):
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        who = str(
            (
                await conn.execute(
                    text(
                        "insert into accounts (email, state, email_verified, analytics_subject_id) "
                        "values (:e, 'active', true, gen_random_uuid()) returning id"
                    ),
                    {"e": f"lanes-{uuid.uuid4()}@example.invalid"},
                )
            ).scalar_one()
        )
        nightly = await _book(conn, who, "thread.nightly", 200)

    inside = asyncio.Event()
    let_go = asyncio.Event()
    answered = asyncio.Event()

    async def stub(job, **_):
        if job.id == nightly:
            inside.set()
            await let_go.wait()
        elif job.id == dump:
            answered.set()

    monkeypatch.setattr(worker_mod, "handle", stub)
    cfg = Config(
        database_url=_asyncpg(AGENT_DB),
        api_url="http://127.0.0.1:9",
        internal_token="t",
        anthropic_api_key="k",
        poll_seconds=0.05,
    )
    stop = asyncio.Event()
    running = asyncio.create_task(worker_mod.run(cfg, stop))
    dump = ""
    try:
        await asyncio.wait_for(inside.wait(), timeout=5)
        async with admin.begin() as conn:
            dump = await _book(conn, who, "dump.answer", 10)

        await asyncio.wait_for(answered.wait(), timeout=5)
        assert not let_go.is_set() and inside.is_set(), "the nightly job is still in hand"
    finally:
        stop.set()
        let_go.set()
        await asyncio.wait_for(running, timeout=10)
        async with admin.begin() as conn:
            await conn.execute(text("delete from jobs where account_id = :a"), {"a": who})
            await conn.execute(text("delete from accounts where id = :a"), {"a": who})
        await admin.dispose()
