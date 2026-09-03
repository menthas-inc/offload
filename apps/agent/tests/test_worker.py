"""What the worker does when things go wrong.

The cases that matter are the ones where an answer already exists: the model
has been called and paid for, and everything after that has to avoid throwing
the answer away or leaving the job locked.
"""

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
        await _post_result(
            client, cfg(), {"outcome": "answered", "jobId": "j", "replyText": "hi"}
        )

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
    assert result == {"ok": False, "error": "unknown_thread"}


# --------------------------------------------------------------- the partial reply


def _outcome(*names):
    from offload_agent.harness.plan import Landed, Outcome

    return Outcome(
        reply=None,
        landed=[Landed(tool="add_content", thread_id="t", thread_name=n, content_id="c")
                for n in names],
    )


async def test_the_partial_reply_names_only_threads_that_were_written_to():
    """AC-3 and AC-23 at the point they are most likely to break.

    The model stopped mid-turn, so its own account of what it did is unreliable
    by construction. This sentence is built from the record instead.
    """
    from offload_agent.worker import _partial_reply

    assert _partial_reply(_outcome("Flat admin")).startswith("Added to Flat admin.")
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

    reply = _partial_reply(_outcome())
    assert "Added to" not in reply
    assert "Nothing was lost" in reply
