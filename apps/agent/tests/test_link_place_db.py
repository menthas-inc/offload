"""030 T2.3. A kept link's page read once more for a place, as the worker does it.

Run as `offload_agent`, so a column the role was never granted fails here rather
than on the platform. Everything the one pass checked when it booked the job is
checked again before any request leaves: the row is a live link not yet read,
its author's *Read links I paste* is on, and its address is in the author's own
words on the message it came from.
"""

import json
import os
import uuid

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import Config, _asyncpg
from offload_agent.link_place import handle_link_place
from offload_agent.queue import ClaimedJob

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)

PAGE = (
    b'<html><head><meta property="og:latitude" content="38.7113">'
    b'<meta property="og:longitude" content="-9.1301"></head></html>'
)
URL = "https://example.com/rooms/1"


async def _id(conn, sql: str, **params) -> str:
    return str((await conn.execute(text(sql), params)).scalar_one())


async def _link(conn, *, links: bool = True, said: str = f"this one {URL}", **over) -> str:
    account = await _id(
        conn,
        "insert into accounts (email, state, email_verified, analytics_subject_id, "
        "web_links_enabled) values (:email, 'active', true, gen_random_uuid(), :links) "
        "returning id",
        email=f"{uuid.uuid4()}@example.invalid",
        links=links,
    )
    thread = await _id(conn, "insert into threads (name) values ('Lisbon trip') returning id")
    conversation = await _id(
        conn, "insert into conversations (account_id) values (:a) returning id", a=account
    )
    message = await _id(
        conn,
        "insert into messages (conversation_id, account_id, role, type, turn_id, text, state) "
        "values (:c, :a, 'person', 'text', gen_random_uuid(), :said, 'seen') returning id",
        c=conversation,
        a=account,
        said=said,
    )
    return await _id(
        conn,
        "insert into content (account_id, thread_id, type, title, url, "
        "derived_from_message_id, place_read_at, deleted_at, purge_after) "
        "values (:a, :t, 'link', 'A page', :url, :m, "
        "case when :read then now() end, case when :gone then now() end, "
        "case when :gone then now() end) returning id",
        a=account,
        t=thread,
        url=URL,
        m=message,
        read=over.get("read", False),
        gone=over.get("gone", False),
    )


async def _run(content_id: str, *, maps_on: bool = True):
    fetched: list[str] = []
    posted: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/page-location"):
            posted.append({"path": request.url.path, **json.loads(request.read())})
            return httpx.Response(200, json={"ok": True})
        fetched.append(str(request.url))
        return httpx.Response(200, content=PAGE, headers={"content-type": "text/html"})

    cfg = Config(
        database_url=AGENT_DB,
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
        maps_on=maps_on,
    )
    job = ClaimedJob(
        id=str(uuid.uuid4()),
        kind="link.place",
        payload={"contentId": content_id},
        account_id=None,
        attempts=1,
        max_attempts=1,
    )
    engine = create_async_engine(_asyncpg(AGENT_DB))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await handle_link_place(job, cfg=cfg, engine=engine, http=http)
    await engine.dispose()
    return fetched, posted, job.id


async def test_a_readable_link_is_read_and_what_it_gave_is_posted_with_its_job():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        content_id = await _link(conn)
    await admin.dispose()
    fetched, posted, job_id = await _run(content_id)
    assert len(fetched) == 1
    assert posted == [
        {
            "path": f"/internal/v1/content/{content_id}/page-location",
            "jobId": job_id,
            "found": {"lat": 38.7113, "lng": -9.1301},
        }
    ]


@pytest.mark.parametrize(
    "over",
    [
        {"links": False},
        {"read": True},
        {"gone": True},
        {"said": "the restaurant from yesterday"},
    ],
)
async def test_nothing_is_fetched_for_a_link_that_may_not_be_read(over: dict):
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        content_id = await _link(conn, **over)
    await admin.dispose()
    fetched, posted, _ = await _run(content_id)
    assert fetched == []
    assert posted == []


async def test_nothing_is_fetched_while_the_map_is_off():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        content_id = await _link(conn)
    await admin.dispose()
    fetched, posted, _ = await _run(content_id, maps_on=False)
    assert fetched == []
    assert posted == []


@pytest.mark.parametrize("switch", ["switch.maps", "switch.web_links"])
async def test_nothing_is_fetched_while_an_owner_has_the_switch_off(switch: str):
    """034 AC-32. The owner's switch stops the read for everyone, whatever the
    worker's own configuration and the author's own setting say."""
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    async with admin.begin() as conn:
        content_id = await _link(conn)
        await conn.execute(
            text("insert into app_settings (key, value) values (:key, 'false'::jsonb)"),
            {"key": switch},
        )
    try:
        fetched, posted, _ = await _run(content_id)
        assert fetched == []
        assert posted == []
    finally:
        async with admin.begin() as conn:
            await conn.execute(text("delete from app_settings where key = :key"), {"key": switch})
        await admin.dispose()
    # On again, and the same link is read.
    fetched, _, _ = await _run(content_id)
    assert len(fetched) == 1
