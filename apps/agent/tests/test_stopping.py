"""Stopping a turn somebody asked to stop. 017.

The mechanism is the thing worth testing here, not the plumbing. A cancel has to
reach a worker that is already inside a model call, which means the job has to be
running as a task rather than being awaited, and a task cancelled mid-call has to
be told apart from the process shutting down.
"""

import asyncio
import contextlib
import dataclasses
import json

import httpx
import pytest

from offload_agent.cancels import REMEMBER, Cancels
from offload_agent.config import Config
from offload_agent.queue import ClaimedJob
from offload_agent.worker import ReportFailed, _post_result, _step_writer, _stopped


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


async def test_a_refused_result_is_not_retried_three_times():
    """A 4xx is the body being wrong, and the reason has to reach a log.

    The first production turn to complete a lookup posted nine sources at a
    schema that allowed six. It was refused, retried twice more, and reported as
    `ReportFailed` with no status and no reason, which is indistinguishable from
    the private network blinking. The turn had already done the work.
    """
    tries = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        tries["n"] += 1
        return httpx.Response(400, json={"message": "sources: too big"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(ReportFailed):
            await _post_result(http, cfg(), {"outcome": "answered", "jobId": "job-8"})

    assert tries["n"] == 1, "a refusal was retried"


async def test_a_5xx_is_still_retried():
    """The other half: a server error is exactly what the retry is for."""
    tries = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        tries["n"] += 1
        return httpx.Response(503)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(ReportFailed):
            await _post_result(http, cfg(), {"outcome": "answered", "jobId": "job-9"})

    assert tries["n"] == 3


def test_the_sources_are_deduplicated_by_domain_and_bounded():
    """What the chip shows is a domain, so two URLs on one domain are one chip."""
    from offload_agent.worker import MAX_SOURCES, Lookups, _web_wire

    budget = Lookups("x", may_search=True, may_read_links=True)
    budget.sources = [
        {"domain": "en.wikipedia.org", "url": f"https://en.wikipedia.org/{n}"} for n in range(20)
    ] + [{"domain": "timeanddate.com", "url": "https://timeanddate.com/x"}]

    wire = _web_wire(budget)
    assert [s["domain"] for s in wire["sources"]] == ["en.wikipedia.org", "timeanddate.com"]
    assert len(wire["sources"]) <= MAX_SOURCES


class _Engine:
    """Stands in for the database around the lane: every transaction is empty."""

    @contextlib.asynccontextmanager
    async def begin(self):
        yield None


async def _run_lane(monkeypatch, jobs: list, handle, config: Config) -> list[dict]:
    """One lane, fed `jobs` in order by a stub claim, until they run out."""
    from offload_agent import worker as worker_mod

    stop = asyncio.Event()
    posted: list[dict] = []

    async def claim(*_args, **_kwargs):
        if jobs:
            return jobs.pop(0)
        stop.set()
        return None

    async def reap(*_args, **_kwargs):
        return None

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append(json.loads(request.read().decode()))
        return httpx.Response(200, json={"status": "written"})

    monkeypatch.setattr(worker_mod, "claim", claim)
    monkeypatch.setattr(worker_mod, "reap", reap)
    monkeypatch.setattr(worker_mod, "handle", handle)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await asyncio.wait_for(
            worker_mod._lane(
                "test",
                None,
                cfg=config,
                stop=stop,
                engine=_Engine(),
                anthropic=None,
                http=http,
                cancels=Cancels(),
                worker_id="w",
            ),
            timeout=10,
        )
    return posted


def _job(job_id: str, **kwargs) -> ClaimedJob:
    fields = (
        dict(kind="dump.answer", payload={}, account_id="a", attempts=1, max_attempts=5) | kwargs
    )
    return ClaimedJob(id=job_id, **fields)


async def test_a_job_claimed_as_cancelled_is_stopped_and_never_run(monkeypatch):
    """A Stop the listener missed is on the row, and the lane honours it the way
    it honours one it heard: reported stopped, and the paid turn never starts."""
    ran: list[str] = []

    async def handle(job, **_):
        ran.append(job.id)

    posted = await _run_lane(monkeypatch, [_job("job-10", cancelled=True)], handle, cfg())

    assert ran == []
    assert posted == [{"outcome": "cancelled", "jobId": "job-10"}]


async def test_a_turn_that_outlives_its_lock_fails_and_the_lane_carries_on(monkeypatch):
    """A turn still running when its lock goes stale is claimed by the other
    lane and runs twice at once. Bounded short of the lock, it ends as a
    failure instead, and the lane takes the next job."""
    from offload_agent import worker as worker_mod

    released: list[tuple[str, str]] = []
    ran: list[str] = []

    async def release(_conn, job_id, reason, delay_seconds=2):
        released.append((job_id, reason))

    async def handle(job, **_):
        ran.append(job.id)
        if job.id == "job-11":
            await asyncio.sleep(30)

    monkeypatch.setattr(worker_mod, "release_for_retry", release)
    # A minute short of the lock: one second.
    config = dataclasses.replace(cfg(), stale_after_seconds=61)
    await _run_lane(monkeypatch, [_job("job-11"), _job("job-12")], handle, config)

    assert released == [("job-11", "timeout")]
    assert ran == ["job-11", "job-12"]


async def test_the_cancel_listener_reconnects_when_its_connection_drops(monkeypatch):
    """A dropped connection used to leave `listen` waiting on `stop` for good,
    so Stop did nothing until the worker restarted."""
    from offload_agent import cancels as cancels_mod

    monkeypatch.setattr(cancels_mod, "RETRY_SECONDS", 0)
    connects: list[object] = []
    stop = asyncio.Event()

    class Driver:
        def __init__(self) -> None:
            self.lost = None

        async def add_listener(self, _channel, _callback) -> None:
            pass

        def add_termination_listener(self, callback) -> None:
            self.lost = callback

    class Raw:
        def __init__(self) -> None:
            self.driver_connection = Driver()

        def close(self) -> None:
            pass

    class Engine:
        async def raw_connection(self):
            raw = Raw()
            connects.append(raw)
            if len(connects) == 2:
                stop.set()
            return raw

    listening = asyncio.create_task(cancels_mod.listen(Engine(), Cancels(), stop))
    while not connects:
        await asyncio.sleep(0)
    await asyncio.sleep(0.05)
    first = connects[0].driver_connection
    assert first.lost is not None, "nothing hears the connection drop"
    first.lost(first)

    await asyncio.wait_for(listening, timeout=2)
    assert len(connects) == 2
