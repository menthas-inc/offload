"""What the filing loop holds in code when a dump asks to find something out.

2026-10-13. Haiku 5.5 filing wrote "check when the polls open" into a row's
body instead of looking it up, and answered "Not sure." to a dump that asked
when the clocks change, with search on and no lookup tried. The prompt says
both are lookups; a model this size still skips one in three. A turn like that
is sent back once with one line, and the second reply stands, the same
contract as the answering loop's empty-search line.

The model is a stub, as in test_plan.py: what is asserted is what the loop does
with a given sequence of responses.
"""

from dataclasses import replace

from offload_agent.harness.plan import CHECK_LINE, _asks_to_find_out, plan

from .test_plan import Recorder, Response, StubModel, TextBlock, ToolUse, ctx

_ADD = ToolUse(
    id="a", name="add_content", input={"thread_id": "t1", "title": "Polls", "type": "task"}
)
_LOOK = ToolUse(id="l", name="look_up", input={"question": "polls open thursday", "want": ["time"]})
_NOT_SURE = ToolUse(id="s", name="say", input={"text": "Not sure.", "because": "nothing_to_file"})
_END = Response(content=[TextBlock("")], stop_reason="end_turn")


def _filed(*tools):
    return Response(content=list(tools), stop_reason="tool_use")


def _sent(model) -> list[str]:
    """Every text block the loop itself wrote into the conversation."""
    out = []
    for request in model.requests:
        for message in request["messages"]:
            if message["role"] == "user":
                for block in message["content"]:
                    if isinstance(block, dict) and block.get("type") == "text":
                        out.append(block["text"])
    return out


async def _file(dump, *responses, may_search=True):
    model = StubModel(list(responses))
    outcome = await plan(model, replace(ctx(dump), may_search=may_search), "m", Recorder())
    return outcome, model


def test_a_dump_that_asks_to_find_out_is_told_apart_from_a_chore():
    assert _asks_to_find_out("polls on thursday, check when they open")
    assert _asks_to_find_out("ferry on the 20th, find out the crossing times")
    assert _asks_to_find_out("when do the clocks change")
    assert _asks_to_find_out("market saturday, what time does it start")
    assert _asks_to_find_out("is there a rail strike on the 22nd")
    assert not _asks_to_find_out("check the boiler pressure")
    assert not _asks_to_find_out("dentist on the 23rd at 3")
    assert not _asks_to_find_out("eggs, flour, lemons")


async def test_a_row_filed_without_the_lookup_it_asked_for_is_sent_back_once():
    outcome, model = await _file(
        "polls on thursday, check when they open", _filed(_ADD), _END, _END
    )
    assert outcome.sent_back is True
    assert CHECK_LINE in _sent(model)
    assert len(model.requests) == 3


async def test_not_sure_without_a_lookup_is_sent_back_once():
    outcome, model = await _file("when do the clocks change", _filed(_NOT_SURE), _END)
    assert outcome.sent_back is True
    assert CHECK_LINE in _sent(model)


async def test_the_second_reply_stands():
    outcome, model = await _file(
        "when do the clocks change", _filed(_NOT_SURE), _filed(_NOT_SURE), _END
    )
    assert _sent(model).count(CHECK_LINE) == 1


async def test_a_turn_that_looked_up_is_not_sent_back():
    outcome, model = await _file(
        "polls on thursday, check when they open", _filed(_LOOK), _filed(_ADD), _END
    )
    assert not outcome.sent_back
    assert CHECK_LINE not in _sent(model)


async def test_a_chore_is_not_sent_back():
    outcome, model = await _file("check the boiler pressure", _filed(_ADD), _END)
    assert not outcome.sent_back


async def test_nothing_is_sent_back_when_search_is_off():
    outcome, model = await _file(
        "polls on thursday, check when they open", _filed(_ADD), _END, may_search=False
    )
    assert not outcome.sent_back


_EXPLAINS = ToolUse(
    id="x",
    name="say",
    input={
        "text": "I'm not going to look that up, so the earlier Not sure. stands.",
        "because": "nothing_to_file",
    },
)


async def test_a_second_reply_that_did_not_look_up_does_not_replace_the_first():
    """Sent back, the model wrote a sentence about not looking it up and about
    its own earlier reply (2026-10-13 run). A turn that still did not look keeps
    what it said first: the send-back may add a lookup, never a commentary."""
    outcome, model = await _file(
        "when do the clocks change", _filed(_NOT_SURE), _filed(_EXPLAINS), _END
    )
    assert outcome.reply == "Not sure."
    assert outcome.because == "nothing_to_file"


async def test_a_second_reply_after_a_lookup_stands():
    said = ToolUse(
        id="t", name="say", input={"text": "Sunday 25 October.", "because": "nothing_to_file"}
    )
    outcome, model = await _file(
        "when do the clocks change", _filed(_NOT_SURE), _filed(_LOOK), _filed(said), _END
    )
    assert outcome.reply == "Sunday 25 October."


def test_the_check_line_does_not_invite_a_comment():
    assert "say nothing" in CHECK_LINE
    assert "as you did" not in CHECK_LINE
