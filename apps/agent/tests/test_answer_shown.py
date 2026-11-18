"""052 T2.1. What an answer showed beside its words, for the reply's calendar.

One agenda read's window: one day is `on`, longer is `span`. A lookup's
structured date is `on`. Anything else shows nothing. The window comes from
the read's own arguments and the reader's structured fields, never from the
sentence the model wrote.
"""

from offload_agent.context import AnswerContext, Thread
from offload_agent.harness.plan import plan_answer, shown_from

from .test_plan import Recorder, Response, StubModel, TextBlock, ToolUse

_FACTS = {"ok": True, "facts": {"displayName": "Sam", "calendars": []}}


def _ctx(has_calendar: bool = False) -> AnswerContext:
    return AnswerContext(
        question="what's on this week?",
        threads=[Thread(id="t1", name="Lisbon", is_default=False)],
        has_calendar=has_calendar,
        may_search=True,
    )


async def _answer(*responses, outcomes, has_calendar=False):
    model = StubModel(list(responses))
    caller = Recorder([_FACTS, *outcomes])
    return await plan_answer(model, _ctx(has_calendar), "claude-haiku-5-5", caller)


def _agenda(start: str, end: str) -> Response:
    return Response(
        content=[
            ToolUse(
                id="a1",
                name="list_agenda",
                input={"from_iso": start, "to_iso": end, "when": "occurs"},
            )
        ],
        stop_reason="tool_use",
    )


_said = Response(content=[TextBlock("Three this week.")], stop_reason="end_turn")
_read = {"ok": True, "result": {"rows": [], "truncated": False}}


async def test_a_week_read_shows_its_span():
    outcome = await _answer(_agenda("2026-11-16", "2026-11-23T00:00"), _said, outcomes=[_read])
    assert shown_from(outcome) == {"span": {"from": "2026-11-16", "to": "2026-11-22"}}


async def test_a_one_day_read_shows_that_day():
    outcome = await _answer(
        _agenda("2026-11-20T00:00", "2026-11-21T00:00"), _said, outcomes=[_read]
    )
    assert shown_from(outcome) == {"on": "2026-11-20"}


async def test_a_dated_lookup_shows_its_day():
    look = Response(
        content=[
            ToolUse(
                id="l1",
                name="look_up",
                input={"question": "when do the clocks go forward", "want": ["date"]},
            )
        ],
        stop_reason="tool_use",
    )
    found = {
        "ok": True,
        "found": True,
        "fields": {"date": "2027-03-28"},
        "sources": ["timeanddate.com"],
    }
    outcome = await _answer(
        look,
        Response(content=[TextBlock("Sunday 28 March, at 1am.")], stop_reason="end_turn"),
        outcomes=[found],
    )
    assert shown_from(outcome) == {"on": "2027-03-28"}


async def test_a_thread_read_shows_no_calendar():
    read = Response(
        content=[ToolUse(id="r1", name="list_content", input={"thread_id": "t1"})],
        stop_reason="tool_use",
    )
    outcome = await _answer(read, _said, outcomes=[_read])
    assert shown_from(outcome) is None


async def test_two_agenda_reads_or_a_window_too_wide_show_nothing():
    outcome = await _answer(
        _agenda("2026-11-16", "2026-11-23"),
        _agenda("2026-12-01", "2026-12-08"),
        _said,
        outcomes=[_read, _read],
    )
    assert shown_from(outcome) is None
    wide = await _answer(_agenda("2026-01-01", "2026-06-01"), _said, outcomes=[_read])
    assert shown_from(wide) is None


async def test_the_calendar_read_of_the_same_week_counts_as_the_same_window():
    events = Response(
        content=[
            ToolUse(
                id="e1",
                name="find_events",
                input={"from_iso": "2026-11-16", "to_iso": "2026-11-23T00:00"},
            )
        ],
        stop_reason="tool_use",
    )
    alone = await _answer(events, _said, outcomes=[{"ok": True, "events": []}], has_calendar=True)
    assert shown_from(alone) == {"span": {"from": "2026-11-16", "to": "2026-11-22"}}
    both = await _answer(
        _agenda("2026-11-16", "2026-11-23T00:00"),
        events,
        _said,
        outcomes=[_read, {"ok": True, "events": []}],
        has_calendar=True,
    )
    assert shown_from(both) == {"span": {"from": "2026-11-16", "to": "2026-11-22"}}


async def test_the_same_window_written_two_ways_is_one_read():
    events = Response(
        content=[
            ToolUse(
                id="e1",
                name="find_events",
                input={"from_iso": "2026-11-16T00:00:00", "to_iso": "2026-11-23"},
            )
        ],
        stop_reason="tool_use",
    )
    outcome = await _answer(
        _agenda("2026-11-16", "2026-11-23T00:00"),
        events,
        _said,
        outcomes=[_read, {"ok": True, "events": []}],
        has_calendar=True,
    )
    assert shown_from(outcome) == {"span": {"from": "2026-11-16", "to": "2026-11-22"}}
