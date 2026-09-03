"""The claim query, which exists twice.

The impl-spec calls this the highest-risk duplication in the feature: one
implementation in TypeScript for email, one here for model jobs, both draining
one table. This asserts the two properties that must not drift, against a real
database, because a mock cannot tell you whether a subquery was actually
written.

AC-12: one account cannot occupy the worker.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import _asyncpg
from offload_agent.queue import claim

ADMIN_DB = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(not ADMIN_DB, reason="needs the admin database url")


@pytest.fixture
async def db():
    engine = create_async_engine(_asyncpg(ADMIN_DB))
    async with engine.begin() as conn:
        await conn.execute(text("delete from jobs"))
    yield engine
    async with engine.begin() as conn:
        await conn.execute(text("delete from jobs"))
        await conn.execute(text("delete from accounts where email like 'queue-%'"))
    await engine.dispose()


async def account(conn) -> str:
    return str(
        (
            await conn.execute(
                text(
                    "insert into accounts (email, state, email_verified, analytics_subject_id) "
                    "values (:e, 'active', true, gen_random_uuid()) returning id"
                ),
                {"e": f"queue-{uuid.uuid4()}@example.invalid"},
            )
        ).scalar_one()
    )


async def enqueue(conn, account_id: str, *, priority: int = 10, state: str = "queued") -> str:
    return str(
        (
            await conn.execute(
                text(
                    "insert into jobs (kind, account_id, payload, priority, run_after, state) "
                    "values ('dump.answer', :a, '{}'::jsonb, :p, now(), :s) returning id"
                ),
                {"a": account_id, "p": priority, "s": state},
            )
        ).scalar_one()
    )


async def test_one_account_cannot_occupy_the_worker(db):
    """The whole of AC-12. Without the per-account subquery, an account that
    dumps ten times is answered ten times before anybody else is answered
    once, and the priority column cannot express that because every dump has
    the same priority."""
    async with db.begin() as conn:
        greedy = await account(conn)
        other = await account(conn)
        # Two already running for the greedy account: it is at its cap.
        await enqueue(conn, greedy, state="running")
        await enqueue(conn, greedy, state="running")
        # And a queued one behind them, enqueued before anybody else's.
        await enqueue(conn, greedy)
        theirs = await enqueue(conn, other)

    async with db.begin() as conn:
        claimed = await claim(conn, "w1", ["dump.answer"], 2)

    assert claimed is not None, "nothing was claimed at all"
    assert claimed.id == theirs, "the capped account's job was claimed ahead of another account's"


async def test_the_cap_releases_as_work_finishes(db):
    async with db.begin() as conn:
        who = await account(conn)
        await enqueue(conn, who, state="running")
        queued = await enqueue(conn, who)

    # One running, cap of two: still claimable.
    async with db.begin() as conn:
        claimed = await claim(conn, "w1", ["dump.answer"], 2)
    assert claimed is not None and claimed.id == queued


async def test_interactive_outranks_scheduled(db):
    """Ordered by priority then run_after, matching the TypeScript claim. A
    nightly sweep must never be picked ahead of somebody waiting."""
    async with db.begin() as conn:
        who = await account(conn)
        await enqueue(conn, who, priority=100)
        urgent = await enqueue(conn, who, priority=10)

    async with db.begin() as conn:
        claimed = await claim(conn, "w1", ["dump.answer"], 2)
    assert claimed is not None and claimed.id == urgent


async def test_a_kind_this_worker_does_not_own_is_left_alone(db):
    """The mirror of the TypeScript test. Both runners drain one table and
    neither may take the other's work: an unhandled kind is failed on the spot
    by the runner that claims it."""
    async with db.begin() as conn:
        who = await account(conn)
        await conn.execute(
            text(
                "insert into jobs (kind, account_id, payload, priority, run_after, state) "
                "values ('email.invited', :a, '{}'::jsonb, 100, now(), 'queued')"
            ),
            {"a": who},
        )

    async with db.begin() as conn:
        assert await claim(conn, "w1", ["dump.answer"], 2) is None
