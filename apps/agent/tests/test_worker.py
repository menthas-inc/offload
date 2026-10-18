"""What the worker does when things go wrong.

The cases that matter are the ones where an answer already exists: the model
has been called and paid for, and everything after that has to avoid throwing
the answer away or leaving the job locked.
"""

import contextlib
import dataclasses
import json

import httpx
import pytest

from offload_agent.config import Config
from offload_agent.worker import ReportFailed, _post_result


def cfg() -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )


async def test_a_transient_blip_does_not_lose_the_answer():
    # Two failures then success. The model has already been paid for by this
    # point, so giving up on the first blip buys the same answer twice.
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            raise httpx.ConnectError("boom")
        return httpx.Response(200, json={"status": "written"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await _post_result(client, cfg(), {"outcome": "failed", "jobId": "j", "reason": "timeout"})

    assert calls["n"] == 3


async def test_a_persistent_outage_raises_its_own_error_type():
    # ReportFailed, not a generic exception: the caller has to tell "the answer
    # could not be delivered" from "the model failed", because the first cannot
    # be reported and the second must be.
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ReportFailed):
            await _post_result(client, cfg(), {"outcome": "answered", "jobId": "j"})


async def test_a_rejected_result_is_also_a_report_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorised"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ReportFailed):
            await _post_result(client, cfg(), {"outcome": "answered", "jobId": "j"})


async def test_the_service_token_is_sent_and_the_body_names_no_account():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = request.content.decode()
        return httpx.Response(200, json={"status": "written"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await _post_result(client, cfg(), {"outcome": "answered", "jobId": "j", "replyText": "hi"})

    assert seen["auth"] == "Bearer t"
    # There is nothing in the body for a worker to assert an identity with, and
    # that is the point: the Core API reads the account off the job it minted.
    assert "account" not in seen["body"].lower()


# ---------------------------------------------------------------- the tool caller


async def test_a_tool_call_carries_the_job_and_never_an_account():
    """AC-7, from the caller's side.

    The Core API derives the account from the job row, and the only way that is
    a real property rather than a claim is if the worker never sends one.
    """
    seen: list[dict] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(__import__("json").loads(request.content))
        assert request.headers["authorization"] == "Bearer t"
        return httpx.Response(200, json={"ok": True, "threadId": "t1", "threadName": "Flat admin"})

    from offload_agent.worker import _tool_caller

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg(), "job-1")
        await call("add_content", "toolu_1", {"thread_id": "t1", "title": "x", "body": ""})

    assert seen == [
        {
            "tool": "add_content",
            "jobId": "job-1",
            "toolCallId": "toolu_1",
            # camelCase on the wire, snake_case in Python, one mapping.
            "threadId": "t1",
            "title": "x",
            "body": "",
        }
    ]
    assert "accountId" not in seen[0]


async def test_a_tool_call_retries_the_network_and_then_reports_a_failed_tool():
    """A refusal and an outage are different things and must not look alike.

    Three transport failures is the network, not a decision. It comes back as a
    failed tool so the turn can still finish and say what landed, rather than
    raising and throwing away everything already filed.
    """
    attempts = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ConnectError("down")

    from offload_agent.worker import _tool_caller

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg(), "job-1")
        result = await call("add_content", "toolu_1", {"thread_id": "t1", "title": "x"})

    assert attempts == 3
    assert result == {"ok": False, "error": "unavailable"}


async def test_a_refusal_is_returned_as_data_and_not_retried():
    attempts = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(200, json={"ok": False, "error": "unknown_thread"})

    from offload_agent.worker import _tool_caller

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg(), "job-1")
        result = await call("add_content", "toolu_1", {"thread_id": "gone", "title": "x"})

    assert attempts == 1, "a considered refusal was retried as though it were a blip"
    # And marked declined: a thread the model cannot see is the model's
    # argument to fix, not a tool that failed, so the turn is not partial.
    assert result == {"ok": False, "error": "unknown_thread", "declined": True}


async def test_a_refusal_the_server_could_not_help_stays_a_failure():
    """The other side of the decline: a calendar whose access was taken away
    is not the model's argument to fix, and the person is owed the Finish
    control a failed tool brings."""
    from offload_agent.worker import _tool_caller

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": False, "error": "needs_reconnect"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg(), "job-1")
        result = await call("create_event", "toolu_1", {"content_id": "c1"})

    assert result == {"ok": False, "error": "needs_reconnect"}
    assert "declined" not in result


async def test_a_401_is_not_the_models_mistake():
    """A rotated token, a job that is not this one, a rate: told as its own
    invalid arguments the model would spend every round trip fixing what it
    did not break."""
    from offload_agent.worker import _tool_caller

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorised"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg(), "job-1")
        result = await call("add_content", "toolu_1", {"thread_id": "t1", "title": "x"})

    assert result == {"ok": False, "error": "unavailable"}


def test_the_clock_is_read_in_a_zone_python_knows_and_utc_otherwise():
    """The zone is checked here rather than by letting Postgres refuse it: a
    refused statement aborts the connection's transaction and the fallback
    query after it, so the first version of the fallback could never run."""
    from offload_agent.context import clock_line, known_zone

    assert known_zone(None) == "UTC"
    assert known_zone("UTC") == "UTC"
    assert known_zone("Europe/Lisbon") == "Europe/Lisbon"
    # ICU accepts the alias and so does tzdata.
    assert known_zone("Asia/Calcutta") == "Asia/Calcutta"
    assert known_zone("Mars/Olympus") == "UTC"
    assert known_zone("Europe/Lisbon; drop table messages") == "UTC"

    assert clock_line(None) == "in UTC"
    assert clock_line("Mars/Olympus") == "in UTC"
    assert clock_line("Asia/Tokyo") == "in Asia/Tokyo, where the clock is UTC+09:00 today"
    lisbon = clock_line("Europe/Lisbon")
    assert lisbon.startswith("in Europe/Lisbon, where the clock is UTC+0")


# --------------------------------------------------------------- the partial reply


def _outcome(*names):
    from offload_agent.harness.plan import Landed, Outcome

    return Outcome(
        reply=None,
        landed=[
            Landed(tool="add_content", thread_id="t", thread_name=n, content_id="c") for n in names
        ],
    )


async def test_the_partial_reply_names_only_threads_that_were_written_to():
    """AC-3 and AC-23 at the point they are most likely to break.

    The model stopped mid-turn, so its own account of what it did is unreliable
    by construction. This sentence is built from the record instead.
    """
    from offload_agent.worker import _partial_reply

    assert _partial_reply(_outcome("Flat admin")) == "Saved to Flat admin."
    assert "Flat admin and Bookshelf build" in _partial_reply(
        _outcome("Flat admin", "Bookshelf build")
    )
    assert "Flat admin, Lisbon trip and Bookshelf build" in _partial_reply(
        _outcome("Flat admin", "Lisbon trip", "Bookshelf build")
    )
    # A thread written to twice is named once.
    assert _partial_reply(_outcome("Flat admin", "Flat admin")).count("Flat admin") == 1


async def test_the_partial_reply_claims_nothing_when_nothing_landed():
    from offload_agent.worker import _partial_reply

    assert _partial_reply(_outcome()) == "Nothing saved."


async def test_the_partial_reply_does_not_say_nothing_was_saved_after_a_move():
    """ "Nothing saved." is a claim about the database, and it was false for the
    one kind of turn it was most likely to appear on.

    `landed` holds filings. A move, a tick, an archive and a rename are none of
    them, so a turn that moved a piece and then stopped told somebody nothing
    had been saved about a move that had already happened. Reported from
    production on 2026-09-11."""
    from offload_agent.harness.plan import Outcome
    from offload_agent.worker import _partial_reply

    moved = Outcome(reply=None, worked=1)
    assert _partial_reply(moved) == "That did not finish."

    # And when genuinely nothing happened at all, the older sentence stands.
    assert _partial_reply(Outcome(reply=None, worked=0)) == "Nothing saved."


async def test_the_partial_reply_never_explains_itself():
    """offload once wrote "the task tool seems to be down, you may want to try
    again shortly" about a tool that was up. The screen says what did not save
    and offers the button; the reply says what did and stops."""
    from offload_agent.harness.plan import Outcome
    from offload_agent.worker import _partial_reply

    for reply in (
        _partial_reply(_outcome()),
        _partial_reply(_outcome("Flat admin")),
        _partial_reply(Outcome(reply=None, worked=1)),
    ):
        lowered = reply.lower()
        for word in ("try again", "sorry", "down", "unable", "could not", "failed", "shortly"):
            assert word not in lowered, f"{word!r} in {reply!r}"
        assert "\u2014" not in reply and "\u2013" not in reply
        assert len(reply) < 80


async def test_a_refused_tool_call_is_not_retried_as_a_network_failure():
    """The bug that told somebody the tool was down.

    The endpoint refused a malformed argument with a 400. This retried it three
    times as though the network had dropped, then reported "unavailable", and
    the model told the person "the task tool seems to be down". It was up. It
    had said no, clearly, and the answer was thrown away and replaced with a
    lie.
    """
    attempts = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(400, json={"statusCode": 400, "message": "body/dueAt invalid"})

    from offload_agent.worker import _tool_caller

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg(), "job-1")
        result = await call("add_content", "toolu_1", {"thread_id": "t1", "title": "x"})

    assert attempts == 1, "a considered refusal was retried as though it were a blip"
    # Data the planner can read and act on, not a claim that the tool is down.
    assert result == {"ok": False, "declined": True, "error": "invalid_arguments"}


async def test_a_5xx_is_still_retried():
    """The other half. A server that fell over may well be up on the next try,
    and the model has already been paid for by this point."""
    attempts = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503)

    from offload_agent.worker import _tool_caller

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg(), "job-1")
        result = await call("add_content", "toolu_1", {"thread_id": "t1", "title": "x"})

    assert attempts == 3
    assert result == {"ok": False, "error": "unavailable"}


async def test_a_date_a_model_would_write_is_accepted_before_it_becomes_a_400():
    """`2026-09-28` is a date. The schema wanted `z.string().datetime()`, which
    is ISO with a Z, and refused it."""
    from offload_agent.harness.tools import AddContent

    for value in ("2026-09-28", "2026-09-28T09:00:00Z", "2026-09-28T09:00:00+03:00"):
        assert AddContent(thread_id="t", title="x", type="task", due_at=value).due_at == value

    # And prose is still refused, here, with a message naming the field, rather
    # than by a 400 the model cannot read.
    import pytest

    with pytest.raises(Exception) as caught:
        AddContent(thread_id="t", title="x", type="task", due_at="next week")
    assert "due_at" in str(caught.value)


def _ctx(landed: int):
    from offload_agent.context import DumpContext, Filed

    return DumpContext(
        dump="todos each: repellent, clean litter, bottles",
        turns=[],
        threads=[],
        landed=[Filed(title=f"piece {i}", thread_name="sustain/release") for i in range(landed)],
        default_thread_id=None,
    )


async def test_a_resume_with_nothing_left_to_do_is_finished():
    """Reported from production on 2026-09-11, three presses of Finish.

    Eleven todos in one dump filed eight and stopped. The resume read what had
    already landed, found nothing it could add, and stopped of its own accord.
    That turn filed nothing and said nothing, which everywhere else means a turn
    that did not happen, so it came back partial saying "Nothing saved." about
    eight rows that were in the thread, with a Finish that would do it again.
    """
    from offload_agent.worker import _nothing_left

    assert _nothing_left(_outcome(), _ctx(8)) is True


async def test_a_first_attempt_that_does_nothing_is_still_unfinished():
    """The narrow half, and the one worth protecting.

    Nothing landed on this message before, so there is nothing this turn could
    have found already done. A turn that filed nothing and said nothing here is
    a turn that did not happen.
    """
    from offload_agent.worker import _nothing_left

    assert _nothing_left(_outcome(), _ctx(0)) is False


async def test_a_photo_turn_the_model_stopped_on_is_finished_because_the_server_files_it():
    """Seen on a phone on 2026-09-19: a shop sign sent twice, and the second
    time the model read the thread, found the first, and stopped with nothing
    filed and nothing said. The server files every photo no row claims before
    the turn settles, so that turn is finished and silent, not partial and
    "Nothing saved." under a grid that just gained the picture.
    """
    from offload_agent.context import Photo
    from offload_agent.harness.plan import Outcome
    from offload_agent.worker import _photos_land_anyway

    ctx = dataclasses.replace(_ctx(0), photos=[Photo(blob_id="b1", index=1, large=b"jpeg")])
    assert _photos_land_anyway(Outcome(reply=None), ctx) is True
    # Not when the model said something, filed something, or was cut off:
    # those are the ordinary rules.
    assert _photos_land_anyway(Outcome(reply="Kept it."), ctx) is False
    cut = Outcome(reply=None)
    cut.out_of_calls = True
    assert _photos_land_anyway(cut, ctx) is False
    refused = Outcome(reply=None)
    refused.refused.append("add_content")
    assert _photos_land_anyway(refused, ctx) is False
    # And not for a photo the worker could not open: that one takes the
    # authored line and the plain-title path.
    unreadable = dataclasses.replace(ctx, photos=[Photo(blob_id="b1", index=1, large=None)])
    assert _photos_land_anyway(Outcome(reply=None), unreadable) is False


async def test_a_resume_cut_off_by_the_bound_is_still_unfinished():
    from offload_agent.harness.plan import Outcome
    from offload_agent.worker import _nothing_left

    out = Outcome(reply=None)
    out.out_of_calls = True
    assert _nothing_left(out, _ctx(8)) is False


async def test_a_resume_with_a_refused_tool_is_still_unfinished():
    from offload_agent.harness.plan import Outcome
    from offload_agent.worker import _nothing_left

    out = Outcome(reply=None)
    out.failed.append("add_content")
    assert _nothing_left(out, _ctx(8)) is False


async def test_a_resume_that_did_something_is_judged_the_ordinary_way():
    """It moved or ticked something and then stopped. That is the partial this
    `worked` counter was added for, and it must not be swallowed here."""
    from offload_agent.harness.plan import Outcome
    from offload_agent.worker import _nothing_left

    out = Outcome(reply=None)
    out.worked = 1
    assert _nothing_left(out, _ctx(8)) is False


async def test_a_job_past_its_attempts_reports_the_failure_without_running_the_turn():
    """M13, the half `_give_up_or_retry` cannot close. When even the failure
    could not be posted the job is released with its attempts spent, and the
    next claim ran the whole paid turn again, every thirty seconds of an
    outage. Past its attempts, the only thing left to do is say it failed."""
    from offload_agent.queue import ClaimedJob
    from offload_agent.worker import handle

    touched: list[str] = []
    posted: list[dict] = []

    class Engine:
        def connect(self):
            touched.append("context")
            raise AssertionError("the turn read its context")

        def begin(self):
            touched.append("release")
            raise AssertionError("the job was released")

    class Anthropic:
        def __getattr__(self, name):
            touched.append("model")
            raise AssertionError("the turn called a model")

    def handler(request: httpx.Request) -> httpx.Response:
        posted.append(json.loads(request.read().decode()))
        return httpx.Response(200, json={"status": "written"})

    job = ClaimedJob(
        id="j",
        kind="dump.answer",
        payload={"messageId": "m", "conversationId": "c"},
        account_id="a",
        attempts=6,
        max_attempts=5,
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await handle(job, cfg=cfg(), engine=Engine(), anthropic=Anthropic(), http=http)

    assert touched == []
    assert posted == [{"outcome": "failed", "jobId": "j", "reason": "model_error"}]


async def test_an_answer_that_read_four_times_posts_at_most_three_found(monkeypatch):
    """The turn-result route caps `found` at three; a fourth read used to be a
    400 that lost the finished answer."""
    import contextlib
    from types import SimpleNamespace

    from offload_agent import worker as worker_mod
    from offload_agent.harness.plan import Outcome
    from offload_agent.queue import ClaimedJob

    posted: list[dict] = []

    class Engine:
        @contextlib.asynccontextmanager
        async def connect(self):
            yield None

    async def load_answer(*_a, **_k):
        return None

    async def plan_answer(*_a, **_k):
        found = [{"threadId": None, "truncated": False, "contentIds": []} for _ in range(4)]
        return Outcome(reply="Here.", found=found)

    async def post(_http, _cfg, body, **_):
        posted.append(body)

    ctx = SimpleNamespace(
        may_search=False, may_read_links=False, country_in_effect=None, today=None
    )
    monkeypatch.setattr(worker_mod.ctx_mod, "load_answer", load_answer)
    monkeypatch.setattr(worker_mod.ctx_mod, "fit_answer", lambda loaded, _max: ctx)
    monkeypatch.setattr(worker_mod, "plan_answer", plan_answer)
    monkeypatch.setattr(worker_mod, "_post_result", post)

    job = ClaimedJob(
        id="j", kind="dump.answer", payload={}, account_id="a", attempts=1, max_attempts=5
    )
    async with httpx.AsyncClient() as http:
        await worker_mod._handle_answer(
            job, question="q", cfg=cfg(), engine=Engine(), anthropic=None, http=http
        )

    assert posted[0]["outcome"] == "answered"
    assert len(posted[0]["found"]) == 3


class _Unusable:
    """A model that answers in words every time, so a pass has nothing to apply."""

    def __init__(self):
        self.messages = self

    async def create(self, **_kwargs):
        from types import SimpleNamespace

        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="no")],
            usage=SimpleNamespace(input_tokens=100, output_tokens=20),
        )


class _Engine:
    """Reads nothing and holds no rows; the release is stubbed where it is called."""

    class _Conn:
        async def execute(self, *_a, **_k):
            from types import SimpleNamespace

            return SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: []))

    @contextlib.asynccontextmanager
    async def connect(self):
        yield self._Conn()

    @contextlib.asynccontextmanager
    async def begin(self):
        yield None


async def test_a_pass_with_an_unusable_answer_posts_what_it_paid_for_before_release(monkeypatch):
    """The two calls were paid for either way, and the ledger is what gates
    scheduled work: it has to hear about them before the job is let go."""
    from offload_agent import memories as memories_mod
    from offload_agent.queue import ClaimedJob
    from offload_agent.worker import handle

    events: list[tuple] = []

    async def read(*_a, **_k):
        return "Today", [], [], [{"id": "m", "text": "hi"}]

    async def retry_or_die(_conn, _job, code, **_k):
        events.append(("release", code))

    def handler(request: httpx.Request) -> httpx.Response:
        events.append(("post", request.url.path, json.loads(request.read().decode())))
        return httpx.Response(200, json={"status": "written"})

    monkeypatch.setattr(memories_mod, "read", read)
    monkeypatch.setattr(memories_mod, "listing", lambda **_k: "a listing")
    monkeypatch.setattr(memories_mod, "retry_or_die", retry_or_die)

    job = ClaimedJob(
        id="j", kind="account.memories", payload={}, account_id="a", attempts=1, max_attempts=3
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await handle(job, cfg=cfg(), engine=_Engine(), anthropic=_Unusable(), http=http)

    assert [e[:2] for e in events] == [
        ("post", "/internal/v1/usage"),
        ("release", "memory_unparseable"),
    ]
    assert events[0][2]["jobId"] == "j" and len(events[0][2]["usage"]) == 2


async def test_a_pass_that_fails_after_its_call_posts_its_usage_and_a_failed_post_changes_nothing(
    monkeypatch,
):
    from offload_agent import ledger
    from offload_agent import worker as worker_mod
    from offload_agent.queue import ClaimedJob

    events: list[tuple] = []
    entry = {
        "model": "m",
        "inputTokens": 1,
        "outputTokens": 1,
        "cacheReadTokens": 0,
        "cacheWriteTokens": 0,
        "latencyMs": 1,
    }

    async def handle_nightly(*_a, **_k):
        ledger.record(entry)
        raise RuntimeError("after the call")

    async def retry_or_die(_conn, _job, code, **_k):
        events.append(("release", code))

    def handler(request: httpx.Request) -> httpx.Response:
        events.append(("post", request.url.path))
        return httpx.Response(503)

    monkeypatch.setattr(worker_mod, "handle_nightly", handle_nightly)
    monkeypatch.setattr(worker_mod, "retry_or_die", retry_or_die)

    job = ClaimedJob(
        id="j", kind="thread.nightly", payload={}, account_id="a", attempts=1, max_attempts=3
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await worker_mod.handle(job, cfg=cfg(), engine=_Engine(), anthropic=None, http=http)

    assert events[0] == ("post", "/internal/v1/usage")
    assert events[-1] == ("release", "nightly_error")


async def test_a_question_that_failed_after_searching_reports_the_lookups(monkeypatch):
    """The search was paid for; a failed turn that drops it undercounts it."""
    from types import SimpleNamespace

    from offload_agent import worker as worker_mod
    from offload_agent.queue import ClaimedJob

    posted: list[dict] = []
    row = {"label": "weather", "kind": "search", "outcome": "used", "costMicros": 10000}

    class Searched(worker_mod.Lookups):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self.rows.append(row)

    @contextlib.asynccontextmanager
    async def connect():
        yield None

    async def load_answer(*_a, **_k):
        return None

    async def plan_answer(*_a, **_k):
        raise RuntimeError("after the search")

    async def post(_http, _cfg, body, **_):
        posted.append(body)

    ctx = SimpleNamespace(may_search=True, may_read_links=False, country_in_effect=None, today=None)
    monkeypatch.setattr(worker_mod, "Lookups", Searched)
    monkeypatch.setattr(worker_mod.ctx_mod, "load_answer", load_answer)
    monkeypatch.setattr(worker_mod.ctx_mod, "fit_answer", lambda loaded, _max: ctx)
    monkeypatch.setattr(worker_mod, "plan_answer", plan_answer)
    monkeypatch.setattr(worker_mod, "_post_result", post)

    job = ClaimedJob(
        id="j", kind="dump.answer", payload={}, account_id="a", attempts=1, max_attempts=5
    )
    async with httpx.AsyncClient() as http:
        await worker_mod._handle_answer(
            job,
            question="q",
            cfg=cfg(),
            engine=SimpleNamespace(connect=connect),
            anthropic=None,
            http=http,
        )

    assert posted[-1] == {
        "outcome": "failed",
        "jobId": "j",
        "reason": "model_error",
        "lookups": [row],
    }
