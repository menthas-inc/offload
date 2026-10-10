"""042. What a pass reads to label, read as the worker reads it.

Run as `offload_agent`, so a function or a table the role cannot use fails
here rather than on the platform: the member's own dated things that no label
fits, a day as its date and a time on the member's clock, and the dated
things a to-do could be for, by anybody in the thread.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import _asyncpg
from offload_agent.nightly import _ANCHORS, _TO_LABEL

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


async def _id(conn, sql: str, **params) -> str:
    return str((await conn.execute(text(sql), params)).scalar_one())


async def test_a_pass_reads_its_members_dated_things_and_what_a_to_do_could_be_for():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:

        async def person() -> str:
            return await _id(
                conn,
                "insert into accounts (email, state, email_verified, analytics_subject_id, "
                "time_zone) values (:email, 'active', true, gen_random_uuid(), "
                "'America/Toronto') returning id",
                email=f"{uuid.uuid4()}@example.invalid",
            )

        ana, sam = await person(), await person()
        trip = await _id(conn, "insert into threads (name) values ('Lisbon') returning id")
        for who in (ana, sam):
            await conn.execute(
                text(
                    "insert into thread_members (thread_id, account_id, state) "
                    "values (:t, :a, 'accepted')"
                ),
                {"t": trip, "a": who},
            )

        async def row(who: str, title: str, column: str | None, at: str | None, all_day: bool):
            return await _id(
                conn,
                f"insert into content (account_id, thread_id, type, title, "
                f"{column or 'due_at'}, attrs) values (:a, :t, :type, :title, "
                "cast(cast(:at as text) as timestamptz), cast(:attrs as jsonb)) returning id",
                a=who,
                t=trip,
                type="event" if column == "occurs_at" else "task",
                title=title,
                at=at,
                attrs='{"all_day": true}' if all_day else "{}",
            )

        rent = await row(ana, "Pay the rent", "due_at", "2099-11-01T12:00:00Z", True)
        dentist = await row(ana, "Dentist", "occurs_at", "2099-11-02T20:00:00Z", False)
        visa = await row(ana, "Get the visa", None, None, False)
        party = await row(sam, "Sam's party", "due_at", "2099-11-03T12:00:00Z", True)
        their_trip = await _id(
            conn,
            "insert into notes (account_id, scope, subject_id, kind, text, origin, occurs_at, "
            "attrs) values (:a, 'thread', :t, 'going_on', 'Lisbon 12 to 19 November', 'stated', "
            "'2099-11-12T12:00:00Z', '{\"all_day\": true}') returning id",
            a=sam,
            t=trip,
        )
    await admin.dispose()

    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        params = {"thread_id": trip, "account_id": ana, "zone": "America/Toronto"}
        things = (await conn.execute(_TO_LABEL, {**params, "limit": 30})).mappings().all()
        anchors = (await conn.execute(_ANCHORS, {**params, "limit": 20})).mappings().all()
    await agent.dispose()

    assert [(t["id"], t["of"], t["type"], t["text"], t["when"]) for t in things] == [
        (rent, "content", "task", "Pay the rent", "2099-11-01"),
        # 20:00 UTC is 15:00 in Toronto in November.
        (dentist, "content", "event", "Dentist", "2099-11-02 15:00"),
        (visa, "content", "task", "Get the visa", None),
    ]
    # Anybody's dated things in the thread, Sam's among them.
    assert [(a["id"], a["of"], a["when"]) for a in anchors] == [
        (rent, "content", "2099-11-01"),
        (dentist, "content", "2099-11-02 15:00"),
        (party, "content", "2099-11-03"),
        (their_trip, "note", "2099-11-12"),
    ]
