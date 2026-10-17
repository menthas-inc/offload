"""Somebody asked for a turn to stop. 017.

**The direction is what makes this its own file.** Everything else in the worker
is outward: claim a job, call a model, post a result. This is the one thing that
arrives, and it arrives on a channel rather than on a poll, because the whole
value of the control is that the work stops while somebody is still looking at
the screen.

Two pieces, and the second is why the first cannot just be a flag:

- **A set of job ids somebody has cancelled**, so a cancel that lands before the
  job is claimed is still honoured. The notification and the claim race, and the
  race is won by whichever the scheduler picks; a worker that only checked at
  claim time would miss a cancel by milliseconds and then run for thirty
  seconds.
- **The task running the current job**, so a cancel mid-model-call takes effect
  now. `asyncio.Task.cancel()` raises at the next await, which inside an
  Anthropic call is the socket read, and `httpx` closes the connection on its
  way out. That is the only way to stop an HTTP request that is already waiting
  on a response.
"""

from __future__ import annotations

import asyncio
import contextlib

import structlog
from sqlalchemy.ext.asyncio import AsyncEngine

log = structlog.get_logger(__name__)

CHANNEL = "offload_cancel"

#: How many cancelled ids to remember. A cancel for a job this worker never
#: claimed is somebody else's, and the set would otherwise grow for the life of
#: the process. Small because the window it covers is the gap between a notify
#: and a claim, which is milliseconds.
REMEMBER = 256

#: How long to wait before connecting again after the listener's connection
#: failed or dropped.
RETRY_SECONDS = 5


class Cancels:
    """What has been cancelled, and what to cancel."""

    def __init__(self) -> None:
        self._asked: set[str] = set()
        self._running: dict[str, asyncio.Task[None]] = {}

    def asked(self, job_id: str) -> bool:
        """Whether somebody asked for this job to stop."""
        return job_id in self._asked

    def watching(self, job_id: str, task: asyncio.Task[None]) -> None:
        self._running[job_id] = task

    def done(self, job_id: str) -> None:
        self._running.pop(job_id, None)
        self._asked.discard(job_id)

    def cancel(self, job_id: str) -> None:
        """Record it, and stop it if it is running here."""
        if len(self._asked) >= REMEMBER:
            # Oldest first would need an ordered structure for a set that exists
            # to cover a millisecond. Clearing is the cheaper correct thing: the
            # worst case is one cancel arriving before its claim being missed
            # under a flood of cancels, and the turn then finishes normally.
            self._asked.clear()
        self._asked.add(job_id)

        task = self._running.get(job_id)
        if task is not None and not task.done():
            # **No log line naming the job beyond its id.** A cancel is a thing
            # somebody did to their own turn, and the id is the whole of what is
            # useful here.
            log.info("cancelling", job_id=job_id)
            task.cancel()


async def listen(engine: AsyncEngine, cancels: Cancels, stop: asyncio.Event) -> None:
    """One connection for the process, held open, reconnecting on its own.

    Deliberately not pooled. A `LISTEN` belongs to a session, and a pooled
    connection handed back between notifications is a session that stops
    listening without saying so. This is the same shape `answers.ts` uses on the
    other side for the same reason.

    A dropped connection wakes it through asyncpg's termination listener, and
    it connects again after the same pause as any other failure. Waiting on
    `stop` alone left Stop dead until the worker restarted.
    """
    while not stop.is_set():
        try:
            raw = await engine.raw_connection()
            try:
                # Through SQLAlchemy's wrapper to asyncpg's own connection,
                # which is the object that has `add_listener`.
                conn = raw.driver_connection
                lost = asyncio.Event()
                conn.add_termination_listener(lambda _conn, lost=lost: lost.set())
                await conn.add_listener(
                    CHANNEL,
                    lambda _conn, _pid, _channel, payload: cancels.cancel(payload),
                )
                log.info("listening for cancels")
                waits = [asyncio.ensure_future(stop.wait()), asyncio.ensure_future(lost.wait())]
                try:
                    await asyncio.wait(waits, return_when=asyncio.FIRST_COMPLETED)
                finally:
                    for w in waits:
                        w.cancel()
                if not stop.is_set():
                    raise ConnectionError("listener connection lost")
            finally:
                # Closing the connection takes the listener with it, which is
                # why there is no `remove_listener` here: asyncpg matches it by
                # the exact callback object and the lambda above is not held.
                raw.close()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            # A dropped listener must not take the worker with it: a worker that
            # cannot hear cancels still answers dumps, which is the more
            # important half.
            log.error("cancel listener error", error_type=type(exc).__name__)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=RETRY_SECONDS)
