"""028. The daily pass's candidates, read as the worker reads them.

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
from offload_agent.loose_propose import _CANDIDATES

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
    assert [r["kind"] for r in rows] == ["note", "content"]
    assert rows[1]["text"] == "Oak brackets"
