"""The reply shapes the answering loop enforces in code.

Swarm v2 round 4. Answering moved to Haiku 5.5 and every miss it made on the
sealed holdout was the shape of the reply, not what was read: emphasis around
a whole clause, a paragraph after a fixed line, and a public diary question
answered from an empty search without reaching for `look_up`. These are the
three a loop can hold without asking the model to.

The model is a stub, as in test_plan.py: what is asserted is what the loop does
with a given sequence of responses.
"""

from offload_agent.context import AnswerContext, Thread
from offload_agent.harness.plan import plan_answer

from .test_plan import Recorder, Response, StubModel, TextBlock, ToolUse

_FACTS = {"ok": True, "facts": {"displayName": "Sam", "calendars": []}}


def _ctx(*, may_search: bool = True) -> AnswerContext:
    return AnswerContext(
        question="when does it start",
        threads=[Thread(id="t1", name="Lisbon", is_default=False)],
        has_calendar=False,
        may_search=may_search,
    )


def _says(text: str) -> Response:
    return Response(content=[TextBlock(text)], stop_reason="end_turn")


async def _answer(*responses, outcomes=None, may_search=True):
    model = StubModel(list(responses))
    caller = Recorder([_FACTS, *(outcomes or [])])
    outcome = await plan_answer(model, _ctx(may_search=may_search), "claude-haiku-5-5", caller)
    return outcome, model, caller


# Emphasis. The prompt allows bold on the one or two words a sentence turns on,
# never a whole clause and never every item of a list.


async def test_bold_around_more_than_two_words_loses_it():
    outcome, _, _ = await _answer(
        _says("You have dinner on the 18th: **Dinner with Ana** at 20:00.")
    )
    assert outcome.reply == "You have dinner on the 18th: Dinner with Ana at 20:00."


async def test_bold_around_a_whole_reply_loses_it():
    outcome, _, _ = await _answer(_says("**The Alfama flat, 14th to the 17th October.**"))
    assert outcome.reply == "The Alfama flat, 14th to the 17th October."


async def test_bold_on_every_item_of_a_list_loses_it():
    outcome, _, _ = await _answer(_says("- **Dentist**, 10:00\n- **Lunch with Maya**, 13:00"))
    assert outcome.reply == "- Dentist, 10:00\n- Lunch with Maya, 13:00"


async def test_bold_on_the_word_the_sentence_turns_on_stays():
    outcome, _, _ = await _answer(_says("Yes, it feeds **Client work**."))
    assert outcome.reply == "Yes, it feeds **Client work**."


async def test_an_escaped_marker_in_their_data_stays_escaped():
    outcome, _, _ = await _answer(_says("Yes, P\\*\\*B and Work, the shared ones too."))
    assert outcome.reply == "Yes, P\\*\\*B and Work, the shared ones too."


# Fixed lines. Each is the whole reply.


async def test_a_fixed_line_followed_by_a_paragraph_is_cut_to_the_line():
    outcome, _, _ = await _answer(
        _says("Can't search that.\n\nIf you want, somebody can help with this now.")
    )
    assert outcome.reply == "Can't search that."


async def test_not_sure_followed_by_a_guess_is_cut():
    outcome, _, _ = await _answer(_says("Not sure. It might be around 10 million."))
    assert outcome.reply == "Not sure."


async def test_a_curly_apostrophe_still_reads_as_the_fixed_line():
    outcome, _, _ = await _answer(_says("Can’t search that. Try another tool."))
    assert outcome.reply == "Can't search that."


async def test_a_sentence_that_only_begins_like_a_fixed_line_is_whole():
    outcome, _, _ = await _answer(_says("Nothing yet for Friday."))
    assert outcome.reply == "Nothing yet for Friday."


# An empty search does not end a turn that could still look it up.

_EMPTY = {"ok": True, "result": {"threadId": None, "rows": [], "truncated": False}}
_ROWS = {
    "ok": True,
    "result": {
        "threadId": "t1",
        "rows": [{"contentId": "c1", "threadId": "t1", "title": "Flat"}],
        "truncated": False,
    },
}
_LOOKED = {"ok": True, "result": {"fields": {"date": "2026-10-25"}}}


def _search(id_="r1"):
    return Response(
        content=[ToolUse(id=id_, name="search", input={"query": "term start"})],
        stop_reason="tool_use",
    )


def _look_up():
    return Response(
        content=[
            ToolUse(
                id="l1",
                name="look_up",
                input={"question": "when does term start", "want": ["date"], "doing": "Checking"},
            )
        ],
        stop_reason="tool_use",
    )


def _last_user_text(request: dict) -> str:
    last = request["messages"][-1]
    assert last["role"] == "user"
    return " ".join(b.get("text", "") for b in last["content"] if isinstance(b, dict))


async def test_an_empty_search_cannot_end_the_turn_without_a_look_up_once():
    outcome, model, caller = await _answer(
        _search(),
        _says("I don't have that in anything you've put in."),
        _look_up(),
        _says("Sunday 25 October."),
        outcomes=[_EMPTY, _LOOKED],
    )
    assert outcome.reply == "Sunday 25 October."
    assert len(model.requests) == 4
    assert "look_up" in _last_user_text(model.requests[2])
    assert [c[0] for c in caller.calls] == ["account_facts", "search", "look_up"]


async def test_the_second_not_found_stands():
    outcome, model, _ = await _answer(
        _search(),
        _says("I don't have the dentist in anything you've put in."),
        _says("I don't have the dentist in anything you've put in."),
        outcomes=[_EMPTY],
    )
    assert outcome.reply == "I don't have the dentist in anything you've put in."
    assert len(model.requests) == 3


async def test_no_second_call_when_look_up_is_not_offered():
    outcome, model, _ = await _answer(
        _search(), _says("I don't have that."), outcomes=[_EMPTY], may_search=False
    )
    assert outcome.reply == "I don't have that."
    assert len(model.requests) == 2


async def test_no_second_call_when_a_read_found_rows():
    outcome, model, _ = await _answer(_search(), _says("No."), outcomes=[_ROWS])
    assert outcome.reply == "No."
    assert len(model.requests) == 2


async def test_no_second_call_after_a_fixed_line():
    outcome, model, _ = await _answer(_search(), _says("Not sure."), outcomes=[_EMPTY])
    assert outcome.reply == "Not sure."
    assert len(model.requests) == 2


async def test_no_second_call_after_a_look_up_was_made():
    outcome, model, _ = await _answer(
        _search(), _look_up(), _says("I don't have that."), outcomes=[_EMPTY, _LOOKED]
    )
    assert outcome.reply == "I don't have that."
    assert len(model.requests) == 3


async def test_rows_from_another_read_do_not_stop_the_send_back():
    """The public diary question searched, found nothing, then read the day's
    agenda, which held their own events. The search is what came back empty."""
    agenda = Response(
        content=[
            ToolUse(
                id="a1",
                name="list_agenda",
                input={"from_iso": "2026-09-17", "to_iso": "2026-09-18"},
            )
        ],
        stop_reason="tool_use",
    )
    outcome, model, _ = await _answer(
        _search(),
        agenda,
        _says("I don't have that in anything you've put in."),
        _look_up(),
        _says("7:00."),
        outcomes=[_EMPTY, _ROWS, _LOOKED],
    )
    assert outcome.reply == "7:00."
    assert outcome.sent_back


async def test_a_search_that_found_rows_anywhere_in_the_turn_is_not_empty():
    outcome, model, _ = await _answer(
        _search("r1"), _search("r2"), _says("No."), outcomes=[_EMPTY, _ROWS]
    )
    assert outcome.reply == "No."
    assert len(model.requests) == 3
    assert not outcome.sent_back


async def test_what_the_model_wrote_is_kept_beside_a_reshaped_reply():
    """For the eval's transcript, so every cut can be read. Never posted."""
    raw = "Can't search that.\n\nSomething after it."
    outcome, _, _ = await _answer(_says(raw))
    assert outcome.reply == "Can't search that."
    assert outcome.unshaped == raw


async def test_a_reply_left_alone_keeps_no_copy():
    outcome, _, _ = await _answer(_says("Two left."))
    assert outcome.unshaped is None


async def test_a_search_that_found_asides_is_not_empty():
    """A note or a message found by meaning comes back as an aside with no
    rows, and it is the answer: the turn is not sent back to look it up."""
    asides = {
        "ok": True,
        "result": {
            "threadId": None,
            "rows": [],
            "truncated": False,
            "asides": [{"kind": "note", "text": "Heater replaced in 2024"}],
        },
    }
    outcome, model, _ = await _answer(_search(), _says("In 2024."), outcomes=[asides])
    assert outcome.reply == "In 2024."
    assert not outcome.sent_back
    assert len(model.requests) == 2
