"""032. What the nightly pass reads, read as the worker reads it.

028's candidates for suggestions, and the member's own dumps that landed in a
thread.

Run as `offload_agent`, so a column the role was never granted fails here
rather than on the platform, and against the same rules the Core API books
on: live loose rows and current loose notes, no suggestion, never dismissed,
no note marked untrusted, newest first.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import _asyncpg
from offload_agent.nightly import _CANDIDATES, _MEMBER, _MESSAGES, _NOTES

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


async def _id(conn, sql: str, **params) -> str:
    return str((await conn.execute(text(sql), params)).scalar_one())


async def test_the_candidates_are_the_loose_things_with_nothing_on_them():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        account = await _id(
            conn,
            "insert into accounts (email, state, email_verified, analytics_subject_id) "
            "values (:email, 'active', true, gen_random_uuid()) returning id",
            email=f"{uuid.uuid4()}@example.invalid",
        )
        loose = await _id(conn, "insert into threads (name) values ('Miscellaneous') returning id")
        home = await _id(conn, "insert into threads (name) values ('Flat admin') returning id")
        for thread in (loose, home):
            await conn.execute(
                text(
                    "insert into thread_members (thread_id, account_id, state) "
                    "values (:t, :a, 'accepted')"
                ),
                {"t": thread, "a": account},
            )
        await conn.execute(
            text("update accounts set default_thread_id = :t where id = :a"),
            {"t": loose, "a": account},
        )

        async def row(title: str, thread: str = loose, done: bool = False, dismissed: bool = False):
            return await _id(
                conn,
                "insert into content "
                "(account_id, thread_id, type, title, done_at, suggest_dismissed_at) "
                "values (:a, :t, 'task', :title, "
                "case when :done then now() end, case when :dismissed then now() end) "
                "returning id",
                a=account,
                t=thread,
                title=title,
                done=done,
                dismissed=dismissed,
            )

        kept = await row("Oak brackets")
        await conn.execute(
            text(
                "insert into content (account_id, thread_id, type, title, source) "
                "values (:a, :t, 'task', 'From Gmail', 'gmail')"
            ),
            {"a": account, "t": loose},
        )
        await row("Done already", done=True)
        await row("Dismissed", dismissed=True)
        await row("In a thread", thread=home)
        suggested = await row("Suggested")
        await conn.execute(
            text(
                "insert into suggestions (account_id, content_id, kind, thread_id) "
                "values (:a, :c, 'move', :t)"
            ),
            {"a": account, "c": suggested, "t": home},
        )
        note = await _id(
            conn,
            "insert into notes (account_id, scope, subject_id, kind, text, origin) "
            "values (:a, 'thread', :t, 'preference', 'Alcove is 92cm wide', 'learned') "
            "returning id",
            a=account,
            t=loose,
        )
        await conn.execute(
            text(
                "insert into notes "
                "(account_id, scope, subject_id, kind, text, origin, derived_from_untrusted) "
                "values (:a, 'thread', :t, 'preference', 'From an email', 'learned', true)"
            ),
            {"a": account, "t": loose},
        )
    await admin.dispose()

    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        rows = (
            (await conn.execute(_CANDIDATES, {"account_id": account, "limit": 50})).mappings().all()
        )
    await agent.dispose()

    assert [r["id"] for r in rows] == [note, kept]
    assert [r["type"] for r in rows] == ["note", "task"]
    assert rows[1]["text"] == "Oak brackets"


async def test_a_pass_reads_only_its_members_own_dumps_that_landed_in_the_thread():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:

        async def person(name: str) -> str:
            return await _id(
                conn,
                "insert into accounts (email, state, email_verified, analytics_subject_id) "
                "values (:email, 'active', true, gen_random_uuid()) returning id",
                email=f"{uuid.uuid4()}@example.invalid",
            )

        ana, sam = await person("Ana"), await person("Sam")
        trip = await _id(conn, "insert into threads (name) values ('Lisbon') returning id")
        elsewhere = await _id(conn, "insert into threads (name) values ('Flat') returning id")
        for who in (ana, sam):
            await conn.execute(
                text(
                    "insert into thread_members (thread_id, account_id, state) "
                    "values (:t, :a, 'accepted')"
                ),
                {"t": trip, "a": who},
            )
        conversation = await _id(
            conn, "insert into conversations (account_id) values (:a) returning id", a=ana
        )
        theirs = await _id(
            conn, "insert into conversations (account_id) values (:a) returning id", a=sam
        )

        async def said(who: str, conv: str, words: str, *, source="person", hours=1, role="person"):
            return await _id(
                conn,
                "insert into messages (conversation_id, account_id, role, type, turn_id, text, "
                "state, source, created_at) values (:c, :a, :role, 'text', gen_random_uuid(), :t, "
                "'answered', :source, now() - make_interval(hours => :h)) returning id",
                c=conv,
                a=who,
                t=words,
                source=source,
                h=hours,
                role=role,
            )

        async def filed(message: str, who: str, thread: str):
            await conn.execute(
                text(
                    "insert into content "
                    "(account_id, thread_id, type, title, derived_from_message_id) "
                    "values (:a, :t, 'task', 'row', :m)"
                ),
                {"a": who, "t": thread, "m": message},
            )

        kept = await said(ana, conversation, "staying in Alfama")
        await filed(kept, ana, trip)
        sams = await said(sam, theirs, "Sam's dump")
        await filed(sams, sam, trip)
        await said(ana, conversation, "what is left for Lisbon")
        mail = await said(ana, conversation, "booking confirmed", source="mail")
        await filed(mail, ana, trip)
        old = await said(ana, conversation, "two days ago", hours=49)
        await filed(old, ana, trip)
        other = await said(ana, conversation, "the boiler")
        await filed(other, ana, elsewhere)
        await conn.execute(
            text(
                "insert into notes (account_id, scope, subject_id, kind, text, origin) "
                "values (:a, 'thread', :t, 'going_on', 'Sam books the ferry', 'stated')"
            ),
            {"a": sam, "t": trip},
        )
    await admin.dispose()

    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        params = {"thread_id": trip, "account_id": ana}
        messages = (await conn.execute(_MESSAGES, {**params, "limit": 40})).mappings().all()
        notes = (await conn.execute(_NOTES, {**params, "budget": 100})).mappings().all()
    await agent.dispose()

    assert [m["id"] for m in messages] == [kept]

    # A missed night: the last pass was three days ago, so a dump from
    # yesterday morning that no pass has read is read now.
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        await conn.execute(
            text(
                "update thread_members set nightly_at = now() - interval '72 hours' "
                "where thread_id = :t and account_id = :a"
            ),
            {"t": trip, "a": ana},
        )
        await conn.execute(
            text("update messages set created_at = now() - interval '40 hours' where id = :m"),
            {"m": kept},
        )
    await admin.dispose()
    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        missed = (await conn.execute(_MESSAGES, {**params, "limit": 40})).mappings().all()
    await agent.dispose()
    # Both dumps since that pass, the 40 and the 49 hour one, newest first.
    assert [m["id"] for m in missed] == [kept, old]
    assert messages[0]["text"] == "staying in Alfama"
    assert [(n["text"], n["theirs"]) for n in notes] == [("Sam books the ferry", False)]


async def test_a_pass_reads_today_in_its_members_own_zone():
    """The prompt has the model read each date against today, and today was
    UTC's for everybody: a day wrong, for part of every day, for anyone some
    hours from it. The member's zone rides out with the member."""
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        ana = await _id(
            conn,
            "insert into accounts (email, state, email_verified, analytics_subject_id, time_zone) "
            "values (:email, 'active', true, gen_random_uuid(), 'Pacific/Auckland') returning id",
            email=f"{uuid.uuid4()}@example.invalid",
        )
        trip = await _id(conn, "insert into threads (name) values ('Lisbon') returning id")
        await conn.execute(
            text(
                "insert into thread_members (thread_id, account_id, state) "
                "values (:t, :a, 'accepted')"
            ),
            {"t": trip, "a": ana},
        )
    await admin.dispose()

    agent = create_async_engine(_asyncpg(AGENT_DB))
    async with agent.connect() as conn:
        member = (
            (await conn.execute(_MEMBER, {"thread_id": trip, "account_id": ana})).mappings().first()
        )
    await agent.dispose()
    assert member["time_zone"] == "Pacific/Auckland"


def test_the_pass_hands_that_zone_to_today():
    import inspect

    from offload_agent import nightly

    assert 'today_line(conn, member["time_zone"])' in inspect.getsource(nightly.handle_nightly)
