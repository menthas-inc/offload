"""Stopping a turn somebody asked to stop. 017.

The mechanism is the thing worth testing here, not the plumbing. A cancel has to
reach a worker that is already inside a model call, which means the job has to be
running as a task rather than being awaited, and a task cancelled mid-call has to
be told apart from the process shutting down.
"""

import asyncio
import json

import httpx
import pytest

from offload_agent.cancels import REMEMBER, Cancels
from offload_agent.config import Config
from offload_agent.worker import _step_writer, _stopped


def cfg() -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )


async def test_a_cancel_stops_a_job_that_is_already_running():
    """The point of the whole design: work in flight actually stops."""
    cancels = Cancels()
    started = asyncio.Event()
    finished = {"did": False}

    async def slow() -> None:
        started.set()
        # Stands in for the model call. Nothing else in the worker takes long
        # enough to be worth cancelling.
        await asyncio.sleep(30)
        finished["did"] = True

    task = asyncio.create_task(slow())
    cancels.watching("job-1", task)
    await started.wait()

    cancels.cancel("job-1")
    with pytest.raises(asyncio.CancelledError):
        await task

    # **Stopped, not finished quietly.** A worker that let the call complete and
    # threw the answer away would still be paying for it and would still be
    # holding the job for as long as it took.
    assert finished["did"] is False


async def test_a_cancel_that_arrives_before_the_claim_is_still_honoured():
    """The race the listener cannot win.

    The notification and the claim happen in different processes, so a cancel can
    land while the job is still queued. A worker that only checked at cancel time
    would miss it by milliseconds and then run for thirty seconds.
    """
    cancels = Cancels()
    cancels.cancel("job-2")
    assert cancels.asked("job-2") is True


async def test_a_finished_job_is_forgotten_so_the_set_cannot_grow():
    cancels = Cancels()
    cancels.cancel("job-3")
    cancels.done("job-3")
    assert cancels.asked("job-3") is False


async def test_the_set_is_bounded_even_when_nothing_this_worker_owns_is_cancelled():
    """Every worker hears every cancel, including for jobs it never claimed."""
    cancels = Cancels()
    for n in range(REMEMBER + 10):
        cancels.cancel(f"job-{n}")
    # The exact contents past the bound are not the claim. Not growing is.
    assert len(cancels._asked) <= REMEMBER


async def test_cancelling_something_not_running_here_raises_nothing():
    """Two workers, one cancel. The other one hears it and has nothing to stop."""
    cancels = Cancels()
    cancels.cancel("somebody-elses-job")


async def test_a_stopped_turn_reports_cancelled_and_never_a_failure():
    """AC-12. A cancelled turn is not a failure and does not retry."""
    posted: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append({"url": str(request.url), "body": request.read().decode()})
        return httpx.Response(200, json={"status": "written"})

    class Job:
        id = "job-4"
        attempts = 1
        max_attempts = 5

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await _stopped(Job(), cfg=cfg(), engine=None, http=http)

    assert len(posted) == 1
    assert posted[0]["url"].endswith("/internal/v1/turn-result")
    assert json.loads(posted[0]["body"]) == {"outcome": "cancelled", "jobId": "job-4"}
    # No reason and no reply, which the exact-match above already holds: the
    # reason is on screen already, because they are the one who pressed it.


async def test_a_stop_that_cannot_be_delivered_does_not_requeue_the_turn():
    """The one thing that must not happen: a cancelled job going back in the queue."""
    released = {"did": False}

    class Engine:
        def begin(self):  # pragma: no cover - asserted by not being called
            released["did"] = True
            raise AssertionError("a cancelled turn must never be released for retry")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    class Job:
        id = "job-5"
        attempts = 1
        max_attempts = 5

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        # Swallowed, not raised: the person's screen moved on when they pressed it.
        await _stopped(Job(), cfg=cfg(), engine=Engine(), http=http)

    assert released["did"] is False


async def test_a_progress_line_that_cannot_be_delivered_does_not_break_the_turn():
    """The least important thing happening on this turn.

    Dropping the post loses a sentence. Raising would lose the answer, which is
    the wrong trade by a wide margin.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        say = _step_writer(http, cfg(), "job-6")
        await say("Checking when the tip closes")


async def test_an_empty_line_is_not_posted_at_all():
    """A model that left `doing` out gets the writing indicator, per AC-3."""
    posted: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append(str(request.url))
        return httpx.Response(200, json={"status": "written"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        say = _step_writer(http, cfg(), "job-7")
        await say("")
        await say("   ")

    assert posted == []
