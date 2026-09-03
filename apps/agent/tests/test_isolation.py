"""One account's prompt never contains another account's rows.

This is the query in the whole feature that is one typo from cross-tenant
leakage, and the consequence is not a mis-served page: it is one person's
private text inside another person's model call, leaving to a third party under
the wrong authorization (OFF-3, SEC-2).

It talks to the real database on purpose. A mock cannot tell you whether a
`where account_id` was actually written.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import _asyncpg
from offload_agent.context import load

# Two connections on purpose. Seeding needs write access, which the worker
# deliberately does not have; reading is done as the worker, so this exercises
# the grant as well as the query. The first version seeded as the worker and
# failed with "permission denied for table accounts", which was the restriction
# working exactly as intended.
ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


async def seed(conn, name: str) -> dict:
    """An account with a thread and a conversation holding one dump."""
    account = (
        await conn.execute(
            text(
                "insert into accounts (email, state, email_verified, analytics_subject_id) "
                "values (:email, 'active', true, gen_random_uuid()) returning id"
            ),
            {"email": f"{uuid.uuid4()}@example.invalid"},
        )
    ).scalar_one()

    thread = (
        await conn.execute(
            text("insert into threads (name) values (:name) returning id"),
            {"name": f"{name} thread"},
        )
    ).scalar_one()
    await conn.execute(
        text("insert into thread_members (thread_id, account_id) values (:t, :a)"),
        {"t": thread, "a": account},
    )

    conversation = (
        await conn.execute(
            text("insert into conversations (account_id) values (:a) returning id"),
            {"a": account},
        )
    ).scalar_one()

    message = (
        await conn.execute(
            text(
                "insert into messages (conversation_id, account_id, role, type, turn_id, text, state) "
                "values (:c, :a, 'person', 'text', gen_random_uuid(), :text, 'seen') returning id"
            ),
            {"c": conversation, "a": account, "text": f"{name} private text"},
        )
    ).scalar_one()

    return {"account": str(account), "conversation": str(conversation), "message": str(message)}


@pytest.fixture
async def two_accounts():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    worker = create_async_engine(_asyncpg(AGENT_DB))

    async with admin.begin() as conn:
        a = await seed(conn, "alice")
        b = await seed(conn, "bob")

    yield worker, a, b

    async with admin.begin() as conn:
        for who in (a, b):
            await conn.execute(text("delete from accounts where id = :id"), {"id": who["account"]})
    await worker.dispose()
    await admin.dispose()


async def test_a_prompt_holds_only_its_own_accounts_rows(two_accounts):
    engine, alice, bob = two_accounts
    async with engine.connect() as conn:
        ctx = await load(
            conn,
            account_id=alice["account"],
            conversation_id=alice["conversation"],
            message_id=alice["message"],
            max_turns=20,
            max_threads=12,
        )

    assert ctx is not None
    everything = ctx.dump + " ".join(t.text for t in ctx.turns) + " ".join(ctx.threads)
    assert "alice" in everything
    assert "bob" not in everything, "another account's rows reached the prompt"


async def test_another_accounts_message_id_loads_nothing(two_accounts):
    engine, alice, bob = two_accounts
    async with engine.connect() as conn:
        # Alice's account with Bob's message and conversation. Guessing an id
        # must not be enough: the account filter is what refuses this.
        ctx = await load(
            conn,
            account_id=alice["account"],
            conversation_id=bob["conversation"],
            message_id=bob["message"],
            max_turns=20,
            max_threads=12,
        )

    assert ctx is None, "one account could load another's dump"


async def test_threads_come_only_through_membership(two_accounts):
    engine, alice, bob = two_accounts
    async with engine.connect() as conn:
        ctx = await load(
            conn,
            account_id=alice["account"],
            conversation_id=alice["conversation"],
            message_id=alice["message"],
            max_turns=20,
            max_threads=12,
        )

    assert ctx is not None
    # `threads` has no owner column at all, so membership is the only path.
    # Filtering by anything else would either hide a shared thread from a member
    # or show one to somebody who is not.
    assert ctx.threads == ["alice thread"]
