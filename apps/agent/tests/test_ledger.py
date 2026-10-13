"""Every model call a job makes reaches the ledger, cache writes included.

Until 2026-10-02 the planner's calls went to the ledger priced at zero and the
classifier's, the judge's, the mail look's and the reader's went nowhere, so
the daily budget could not trip. core-api prices a call from its tokens now;
this side has to send all of them, and the cache writes Anthropic counts apart
from input.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import pytest

from offload_agent import ledger
from offload_agent.harness.plan import Outcome, Usage, classify
from offload_agent.worker import _usage_wire


@dataclass
class _Use:
    input_tokens: int = 300
    output_tokens: int = 12
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0


@dataclass
class _Text:
    text: str
    type: str = "text"


@dataclass
class _Response:
    content: list
    usage: _Use
    stop_reason: str = "end_turn"


class _Messages:
    def __init__(self, response):
        self.response = response

    async def create(self, **_kwargs):
        return self.response


class _Client:
    def __init__(self, response):
        self.messages = _Messages(response)


def test_a_call_carries_its_cache_writes_apart_from_input():
    started = time.monotonic()
    wire = ledger.usage_of("claude-sonnet-5", _Use(1_000, 500, 8_000, 2_000), started)
    assert wire["model"] == "claude-sonnet-5"
    assert (wire["inputTokens"], wire["outputTokens"]) == (1_000, 500)
    assert (wire["cacheReadTokens"], wire["cacheWriteTokens"]) == (8_000, 2_000)
    assert "costMicros" not in wire


def test_the_planners_usage_records_cache_writes():
    u = Usage.of("claude-sonnet-5", _Use(10, 5, 300, 7_000), time.monotonic())
    assert u.cache_write_tokens == 7_000
    assert _usage_wire(Outcome(reply=None, usage=[u]))[0]["cacheWriteTokens"] == 7_000


@pytest.mark.asyncio
async def test_the_classifier_is_ledgered_inside_a_job():
    client = _Client(_Response([_Text("asking")], _Use(420, 9)))
    with ledger.collecting():
        await classify(client, "when is the dentist?", "claude-haiku-4-5")
        wire = _usage_wire(Outcome(reply=None, usage=[]))
    seen = [(w["model"], w["inputTokens"], w["outputTokens"]) for w in wire]
    assert seen == [("claude-haiku-4-5", 420, 9)]


@pytest.mark.asyncio
async def test_side_usage_is_sent_once_and_never_outside_a_job():
    client = _Client(_Response([_Text("telling")], _Use()))
    await classify(client, "milk", "claude-haiku-4-5")  # no job: nowhere to record, and no error
    with ledger.collecting():
        await classify(client, "milk", "claude-haiku-4-5")
        first = _usage_wire(Outcome(reply=None, usage=[]))
        second = _usage_wire(Outcome(reply=None, usage=[]))
    assert len(first) == 1
    assert second == []
