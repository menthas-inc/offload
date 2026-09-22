"""The account's clock on the answer and quick-add paths. 023 AC-5.

The security review of 2026-09-22: the dump was read in the account's clock
while an answer and a quick add were read in the zone the device sent, so a
phone somewhere else filed the wrong hour on two of the three paths.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import _asyncpg
from offload_agent.context import load_quick_add, message_zone

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


async def seed(conn, *, clock: str | None) -> dict:
    account = (
        await conn.execute(
            text(
                "insert into accounts "
                "(email, state, email_verified, analytics_subject_id, time_zone) "
                "values (:email, 'active', true, gen_random_uuid(), :clock) returning id"
            ),
            {"email": f"{uuid.uuid4()}@example.invalid", "clock": clock},
        )
    ).scalar_one()
    thread = (
        await conn.execute(
            text("insert into threads (name) values ('Flat admin') returning id"),
        )
    ).scalar_one()
    await conn.execute(
        text(
            "insert into thread_members (thread_id, account_id, state) values (:t, :a, 'accepted')"
        ),
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
                "insert into messages "
                "(conversation_id, account_id, role, type, turn_id, text, state, time_zone) "
                "values (:c, :a, 'person', 'text', gen_random_uuid(), 'dentist at 3', 'seen', "
                "'Asia/Tokyo') returning id"
            ),
            {"c": conversation, "a": account},
        )
    ).scalar_one()
    content = (
        await conn.execute(
            text(
                "insert into content (account_id, thread_id, derived_from_message_id, type, title) "
                "values (:a, :t, :m, 'task', 'Call the clinic') returning id"
            ),
            {"a": account, "t": thread, "m": message},
        )
    ).scalar_one()
    return {"account": str(account), "message": str(message), "content": str(content)}


@pytest.fixture
async def seeded():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        with_clock = await seed(conn, clock="Europe/Lisbon")
        without = await seed(conn, clock=None)
    await admin.dispose()
    return with_clock, without


async def test_an_answer_reads_in_the_accounts_clock_before_the_devices_zone(seeded):
    with_clock, without = seeded
    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        assert (
            await message_zone(
                conn, message_id=with_clock["message"], account_id=with_clock["account"]
            )
            == "Europe/Lisbon"
        )
        # An account with no clock yet reads in the device's word, as before.
        assert (
            await message_zone(conn, message_id=without["message"], account_id=without["account"])
            == "Asia/Tokyo"
        )
    await agent.dispose()


async def test_a_quick_add_reads_in_the_accounts_clock_before_the_devices_zone(seeded):
    with_clock, without = seeded
    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        loaded = await load_quick_add(
            conn,
            account_id=with_clock["account"],
            content_id=with_clock["content"],
            time_zone="Asia/Tokyo",
        )
        assert loaded is not None and loaded.time_zone == "Europe/Lisbon"
        loaded = await load_quick_add(
            conn,
            account_id=without["account"],
            content_id=without["content"],
            time_zone="Asia/Tokyo",
        )
        assert loaded is not None and loaded.time_zone == "Asia/Tokyo"
    await agent.dispose()
