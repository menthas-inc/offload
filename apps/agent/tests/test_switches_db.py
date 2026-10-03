"""034 AC-32. The three switches the worker reads, on the turn's own query.

An owner turns web search, reading links or the map off on Limits and the path
stops for everyone within seconds, in the worker as in the Core API. The worker
keeps no cache: `_MAY_REACH` already runs once a turn, and it reads the switch
beside the account's own setting. Run as `offload_agent`, so the grant on
`app_settings` (0074) fails here rather than on the platform.

A person's own setting is untouched by a switch, and a stored value that makes
no sense reads as on, which is the registry's default.
"""

import os
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent.config import _asyncpg
from offload_agent.context import _MAY_REACH

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)

SWITCHES = ["switch.web_search", "switch.web_links", "switch.maps"]


@pytest.fixture
async def admin():
    engine = create_async_engine(_asyncpg(ADMIN_DB))
    yield engine
    # Settings are global: one left behind would be read by every later test.
    async with engine.begin() as conn:
        await conn.execute(
            text("delete from app_settings where key = any(:keys)"), {"keys": SWITCHES}
        )
    await engine.dispose()


async def _account(engine, *, search: bool = True, links: bool = True) -> str:
    async with engine.begin() as conn:
        return str(
            (
                await conn.execute(
                    text(
                        "insert into accounts (email, state, email_verified, analytics_subject_id, "
                        "web_search_enabled, web_links_enabled) "
                        "values (:email, 'active', true, gen_random_uuid(), :search, :links) "
                        "returning id"
                    ),
                    {"email": f"{uuid.uuid4()}@example.invalid", "search": search, "links": links},
                )
            ).scalar_one()
        )


async def _set(engine, key: str, value: str) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "insert into app_settings (key, value) values (:key, cast(:value as jsonb)) "
                "on conflict (key) do update set value = excluded.value"
            ),
            {"key": key, "value": value},
        )


async def _reach(account_id: str):
    engine = create_async_engine(_asyncpg(AGENT_DB))
    async with engine.connect() as conn:
        row = (await conn.execute(_MAY_REACH, {"account_id": account_id})).first()
    await engine.dispose()
    return row


async def test_every_switch_reads_as_on_until_an_owner_turns_one_off(admin):
    row = await _reach(await _account(admin))
    assert (row.web_search_enabled, row.web_links_enabled, row.maps_on) == (True, True, True)


async def test_the_search_switch_stops_search_and_nothing_else(admin):
    account = await _account(admin)
    await _set(admin, "switch.web_search", "false")
    row = await _reach(account)
    assert (row.web_search_enabled, row.web_links_enabled, row.maps_on) == (False, True, True)


async def test_the_links_switch_stops_reading_links_and_nothing_else(admin):
    account = await _account(admin)
    await _set(admin, "switch.web_links", "false")
    row = await _reach(account)
    assert (row.web_search_enabled, row.web_links_enabled, row.maps_on) == (True, False, True)


async def test_the_map_switch_stops_the_map_and_nothing_else(admin):
    account = await _account(admin)
    await _set(admin, "switch.maps", "false")
    row = await _reach(account)
    assert (row.web_search_enabled, row.web_links_enabled, row.maps_on) == (True, True, False)


async def test_a_switch_leaves_the_persons_own_setting_as_they_chose_it(admin):
    account = await _account(admin, search=True, links=False)
    await _set(admin, "switch.web_search", "false")
    async with admin.connect() as conn:
        own = (
            await conn.execute(
                text("select web_search_enabled, web_links_enabled from accounts where id = :id"),
                {"id": account},
            )
        ).first()
    assert (own.web_search_enabled, own.web_links_enabled) == (True, False)
    # And on again restores exactly what they had: search, and still no links.
    await _set(admin, "switch.web_search", "true")
    row = await _reach(account)
    assert (row.web_search_enabled, row.web_links_enabled) == (True, False)


@pytest.mark.parametrize("stored", ['"off"', "0", "null", '{"on": false}'])
async def test_a_stored_value_that_makes_no_sense_reads_as_on(admin, stored: str):
    account = await _account(admin)
    for key in SWITCHES:
        await _set(admin, key, stored)
    row = await _reach(account)
    assert (row.web_search_enabled, row.web_links_enabled, row.maps_on) == (True, True, True)
