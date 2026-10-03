"""034 AC-36. The worker says it is alive once a minute.

It posts to the Core API's internal route rather than writing the row itself:
the Core API is the one writer, and the worker's role holds no grant on
`heartbeats`. A beat that cannot be delivered is dropped, never raised: the gap
it leaves is exactly what the panel should show, and a worker that died because
it could not say it was alive would be the wrong way round.
"""

import asyncio
import inspect
import json
from datetime import UTC, datetime

import httpx

from offload_agent import worker
from offload_agent.config import Config
from offload_agent.heartbeat import HEARTBEAT_SECONDS, beat, heartbeats

STARTED = datetime(2026, 10, 3, 8, 0, 0, tzinfo=UTC)


def _cfg(**over) -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t0ken",
        anthropic_api_key="k",
        **over,
    )


async def test_a_beat_is_one_post_with_the_commit_and_the_start():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await beat(http, _cfg(commit="abc1234"), STARTED)

    assert len(seen) == 1
    assert str(seen[0].url) == "http://api.test/internal/v1/heartbeat"
    assert seen[0].headers["authorization"] == "Bearer t0ken"
    assert json.loads(seen[0].read()) == {
        "commit": "abc1234",
        "startedAt": "2026-10-03T08:00:00.000Z",
    }


async def test_a_worker_that_does_not_know_its_commit_says_so():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.read()))
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await beat(http, _cfg(), STARTED)
    assert seen[0]["commit"] is None


async def test_a_beat_that_cannot_be_delivered_is_dropped_not_raised():
    def refused(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    for handler in (refused, down):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            await beat(http, _cfg(), STARTED)


async def test_it_beats_until_the_worker_stops():
    count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal count
        count += 1
        return httpx.Response(200, json={"ok": True})

    stop = asyncio.Event()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        task = asyncio.create_task(heartbeats(http, _cfg(), stop, every=0.01))
        while count < 3:
            await asyncio.sleep(0.005)
        stop.set()
        await asyncio.wait_for(task, timeout=1)
    assert count >= 3


def test_it_is_a_minute_and_the_worker_starts_it_beside_its_loop():
    assert HEARTBEAT_SECONDS == 60
    # Beside the loop, not inside it: a turn can hold the loop for minutes, and
    # a worker busy answering somebody is not a worker that is down.
    assert "heartbeats(" in inspect.getsource(worker.run)


def test_the_commit_is_read_from_the_platform(monkeypatch):
    for name in ("AGENT_DATABASE_URL", "API_URL", "INTERNAL_SERVICE_TOKEN", "ANTHROPIC_API_KEY"):
        monkeypatch.setenv(name, "postgresql://x/y" if name == "AGENT_DATABASE_URL" else "v")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc1234")
    assert Config.from_env().commit == "abc1234"
    monkeypatch.delenv("RAILWAY_GIT_COMMIT_SHA")
    assert Config.from_env().commit is None
