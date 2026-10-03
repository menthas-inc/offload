"""034. The worker says it is alive, once a minute.

Health is read from offload's own Postgres: one row per service per minute, and
a gap is an outage. The worker does not write its row. It posts to the Core
API's `/internal/v1/heartbeat`, behind the private host and the bearer every
result already goes through, because the Core API is the one writer and this
role holds no grant on `heartbeats`.

**A beat that cannot be delivered is dropped.** The gap it leaves is the record,
and it is the truth: for that minute the worker could not reach the Core API,
which is also why nothing it finished could have landed.
"""

from __future__ import annotations

import asyncio
import contextlib
from datetime import UTC, datetime

import httpx
import structlog

from offload_agent.config import Config

log = structlog.get_logger()

HEARTBEAT_SECONDS = 60


def _iso(at: datetime) -> str:
    """The one spelling the Core API's schema takes: UTC, milliseconds, Z."""
    return at.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def beat(http: httpx.AsyncClient, cfg: Config, started_at: datetime) -> None:
    """Post one heartbeat. Never raises."""
    try:
        response = await http.post(
            f"{cfg.api_url}/internal/v1/heartbeat",
            json={"commit": cfg.commit, "startedAt": _iso(started_at)},
            headers={"authorization": f"Bearer {cfg.internal_token}"},
            timeout=10.0,
        )
        if response.status_code != 200:
            log.warning("heartbeat refused", status=response.status_code)
    except Exception as exc:  # noqa: BLE001
        log.warning("heartbeat undelivered", error_type=type(exc).__name__)


async def heartbeats(
    http: httpx.AsyncClient,
    cfg: Config,
    stop: asyncio.Event,
    *,
    every: float = HEARTBEAT_SECONDS,
) -> None:
    """Beat until the worker stops.

    A task of its own beside the claim loop, not a step inside it: a turn can
    hold that loop for minutes, and a worker busy answering somebody is not a
    worker that is down.
    """
    started_at = datetime.now(UTC)
    while not stop.is_set():
        await beat(http, cfg, started_at)
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=every)
