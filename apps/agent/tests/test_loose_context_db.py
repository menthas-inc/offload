"""028. The worker's own reads never hand the model the default thread's name.

The Core API substitutes it everywhere it answers the model; these are the
queries the agent plane runs itself: what a retried turn already filed, the
thread a dump was made from, and the thread a quick add was typed into.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import _asyncpg
from offload_agent.context import load

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


async def _id(conn, sql: str, **params) -> str:
    return str((await conn.execute(text(sql), params)).scalar_one())


async def _seed() -> dict:
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        account = await _id(
            conn,
            "insert into accounts (email, state, email_verified, analytics_subject_id) "
            "values (:email, 'active', true, gen_random_uuid()) returning id",
            email=f"{uuid.uuid4()}@example.invalid",
        )
        loose = await _id(conn, "insert into threads (name) values ('Miscellaneous') returning id")
        await conn.execute(
            text(
                "insert into thread_members (thread_id, account_id, state) "
                "values (:t, :a, 'accepted')"
            ),
            {"t": loose, "a": account},
        )
        await conn.execute(
            text("update accounts set default_thread_id = :t where id = :a"),
            {"t": loose, "a": account},
        )
        conversation = await _id(
            conn,
            "insert into conversations (account_id) values (:a) returning id",
            a=account,
        )
        message = await _id(
            conn,
            "insert into messages (conversation_id, account_id, role, type, turn_id, text, "
            "state, looking_at_thread_id) values (:c, :a, 'person', 'text', gen_random_uuid(), "
            "'boiler receipt', 'seen', :t) returning id",
            c=conversation,
            a=account,
            t=loose,
        )
        content = await _id(
            conn,
            "insert into content (account_id, thread_id, derived_from_message_id, type, title) "
            "values (:a, :t, :m, 'task', 'Boiler receipt') returning id",
            a=account,
            t=loose,
            m=message,
        )
    await admin.dispose()
    return {
        "account": account,
        "conversation": conversation,
        "message": message,
        "content": content,
    }


async def test_a_retried_turn_reads_what_landed_loose_without_its_name():
    seeded = await _seed()
    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        ctx = await load(
            conn,
            account_id=seeded["account"],
            conversation_id=seeded["conversation"],
            message_id=seeded["message"],
            max_turns=10,
            max_threads=20,
        )
    await agent.dispose()
    assert ctx is not None
    assert [f.thread_name for f in ctx.landed] == ["not in a thread"]
    assert ctx.looking_at is not None and ctx.looking_at.name == "not in a thread"


