"""The daily fold's own control flow.

The model half of compaction, stubbed. What the Core API does with the plan is
tested there; what matters here is that a bad answer costs one repair and then
gives up, that a good one comes back parsed, and that the call is paid for
either way and says so.
"""

from dataclasses import dataclass

import pytest

from offload_agent.compact import Compaction, _ask, _lines

pytestmark = pytest.mark.asyncio


@dataclass
class ToolUse:
    id: str
    name: str
    input: dict
    type: str = "tool_use"


@dataclass
class TextBlock:
    text: str
    type: str = "text"


@dataclass
class Usage:
    input_tokens: int = 100
    output_tokens: int = 20
    cache_read_input_tokens: int = 0


@dataclass
class Response:
    content: list
    stop_reason: str = "tool_use"
    usage: Usage = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.usage is None:
            self.usage = Usage()


class StubModel:
    def __init__(self, responses):
        self._responses = list(responses)
        self.requests: list[dict] = []
        self.messages = self

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        return self._responses.pop(0)


class Cfg:
    sort_model = "claude-haiku-4-5"


def plan(**over) -> dict:
    return {"supersede": [], "remove": [], "add": [], **over}


async def test_a_good_answer_comes_back_parsed_and_paid_for():
    model = StubModel([Response(content=[ToolUse("a", "compaction", plan(supersede=["x"]))])])

    result, usage = await _ask(model, Cfg(), "a listing")

    assert isinstance(result, Compaction)
    assert result.supersede == ["x"]
    assert len(usage) == 1
    assert usage[0]["model"] == "claude-haiku-4-5"
    assert usage[0]["inputTokens"] == 100


async def test_an_unparseable_answer_gets_one_repair_and_no_more():
    model = StubModel(
        [
            Response(content=[ToolUse("a", "compaction", {"supersede": "not a list"})]),
            Response(content=[ToolUse("b", "compaction", plan(remove=["y"]))]),
        ]
    )

    result, usage = await _ask(model, Cfg(), "a listing")

    assert result is not None
    assert result.remove == ["y"]
    assert len(model.requests) == 2
    # Both calls were made and both are on the ledger, whichever one parsed.
    assert len(usage) == 2
    # The repair turn carries the assistant's own answer and the complaint, and
    # never the values it sent back at it.
    repair = model.requests[1]["messages"]
    assert repair[-1]["role"] == "user"
    assert "right shape" in repair[-1]["content"]


async def test_an_answer_with_no_plan_in_it_still_gets_the_repair():
    """Forced `tool_choice` should make this impossible, and a truncated or
    refused response is where "should" stops holding. It used to end the loop
    on the spot, one attempt in."""
    model = StubModel(
        [
            Response(content=[TextBlock("I would rather not")], stop_reason="end_turn"),
            Response(content=[ToolUse("b", "compaction", plan(remove=["y"]))]),
        ]
    )

    result, _ = await _ask(model, Cfg(), "a listing")

    assert result is not None
    assert len(model.requests) == 2


async def test_two_bad_answers_give_up_rather_than_looping():
    bad = {"supersede": "not a list"}
    model = StubModel(
        [
            Response(content=[ToolUse("a", "compaction", bad)]),
            Response(content=[ToolUse("b", "compaction", bad)]),
        ]
    )

    result, usage = await _ask(model, Cfg(), "a listing")

    assert result is None
    assert len(model.requests) == 2
    # Paid for twice, and the ledger says so even though nothing came back.
    assert len(usage) == 2


@pytest.mark.asyncio(loop_scope="function")
async def test_the_listing_says_who_wrote_each_note_without_naming_anybody():
    rows = [
        {"id": "1", "written_at": "2026-09-10", "theirs": True, "origin": "stated", "text": "a"},
        {"id": "2", "written_at": "2026-09-11", "theirs": False, "origin": "learned", "text": "b"},
    ]
    listing = _lines(rows)

    assert "you" in listing
    assert "someone else" in listing
    assert "they typed this" in listing
    assert "offload wrote this" in listing
