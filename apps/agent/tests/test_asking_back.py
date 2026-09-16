"""018. Asking back: the tool, the cap, the judge's value checks, the tail.

What the model may ask is bounded by schema and by code; what a person may
answer is a value the server already knows how to apply. These tests are the
code half of that sentence.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from offload_agent.context import AnswerContext, Thread, Turn, fit_answer
from offload_agent.harness.plan import (
    MAX_QUESTIONS,
    QUICK_ADD_TOOLS,
    Judgement,
    build_answer_blocks,
    plan,
    plan_answer,
    plan_quick_add,
)
from offload_agent.harness.tools import ASK_TOOL, FILING_TOOLS, Ask
from offload_agent.worker import describe_value, parse_answer

from .test_plan import Recorder, Response, StubModel, TextBlock, ToolUse, ctx


def ask(id_: str, **overrides) -> ToolUse:
    args = {
        "field": "span",
        "title": "Alfama flat",
        "content_id": "c1",
        "options": [],
    }
    args.update(overrides)
    return ToolUse(id=id_, name="ask", input=args)


# ------------------------------------------------------------------ the tool


def test_the_schema_is_values_and_a_title_and_nothing_free():
    Ask.model_validate({"field": "date", "title": "gift for Ana", "content_id": "c1"})
    with pytest.raises(ValidationError):
        Ask.model_validate({"field": "kind", "title": "x", "content_id": "c1"})
    with pytest.raises(ValidationError):
        Ask.model_validate(
            {
                "field": "tag",
                "title": "x",
                "content_id": "c1",
                "options": [{"label": "a", "value": "a"}] * 5,
            }
        )
    with pytest.raises(ValidationError):
        Ask.model_validate(
            {
                "field": "tag",
                "title": "x",
                "content_id": "c1",
                "options": [{"label": "l" * 25, "value": "a"}],
            }
        )


def test_ask_is_neither_a_filing_nor_a_quick_add_tool():
    assert "ask" not in FILING_TOOLS
    assert "ask" not in {t["name"] for t in QUICK_ADD_TOOLS}
    assert ASK_TOOL["name"] == "ask"


# ------------------------------------------------------------------ the cap


async def test_two_questions_are_kept_and_the_third_is_refused():
    model = StubModel(
        [
            Response(
                content=[
                    ToolUse(
                        id="f",
                        name="add_content",
                        input={"thread_id": "t1", "title": "Alfama flat", "type": "link"},
                    ),
                    ask("a", field="span"),
                    ask("b", field="tag", options=[{"label": "Lisbon", "value": "city:lisbon"}]),
                    ask("c", field="date"),
                ],
                stop_reason="tool_use",
            ),
            Response(content=[TextBlock("")], stop_reason="end_turn"),
        ]
    )
    tools = Recorder()
    outcome = await plan(model, ctx(), "claude-sonnet-5", tools)

    assert len(outcome.questions) == MAX_QUESTIONS
    assert [q["field"] for q in outcome.questions] == ["span", "tag"]
    # The third came back refused, in the tool result the model reads.
    refused = [r for r in model.requests[1]["messages"][-1]["content"] if r["tool_use_id"] == "c"]
    assert refused and refused[0]["is_error"]
    # `ask` never crosses to the Core API and never counts as landed or worked.
    assert [c[0] for c in tools.calls] == ["add_content"]
    assert outcome.worked == 1
    assert len(outcome.landed) == 1
    assert outcome.finished


async def test_the_answering_turn_offers_ask_and_quick_add_does_not():
    model = StubModel([Response(content=[TextBlock("Two left.")], stop_reason="end_turn")])
    actx = AnswerContext(
        question="what is left",
        threads=[Thread(id="t1", name="Lisbon", is_default=False)],
        has_calendar=False,
    )
    await plan_answer(model, actx, "claude-opus-5", Recorder())
    assert "ask" in [t["name"] for t in model.requests[0]["tools"]]

    assert "ask" not in {t["name"] for t in QUICK_ADD_TOOLS}
    assert plan_quick_add is not None


# ------------------------------------------------------------------ the judge's value


TODAY = "Tuesday 15 September 2026"


def test_a_span_is_two_days_in_order_and_within_a_year():
    ok = parse_answer("span", Judgement(answers=True, day="2026-10-10", to="2026-10-12"), [], TODAY)
    assert ok == {"from": "2026-10-10", "to": "2026-10-12"}
    # A single day is a span of one.
    assert parse_answer("span", Judgement(answers=True, day="2026-10-10"), [], TODAY) == {
        "from": "2026-10-10",
        "to": "2026-10-10",
    }
    assert (
        parse_answer("span", Judgement(answers=True, day="2026-10-12", to="2026-10-10"), [], TODAY)
        is None
    )
    assert (
        parse_answer("span", Judgement(answers=True, day="2029-01-01", to="2029-01-02"), [], TODAY)
        is None
    )
    assert parse_answer("span", Judgement(answers=True, day="10 October"), [], TODAY) is None
    assert parse_answer("span", Judgement(answers=False, day="2026-10-10"), [], TODAY) is None


def test_a_time_needs_a_day_and_a_clock_that_exists():
    assert parse_answer(
        "time", Judgement(answers=True, day="2026-09-18", time="15:30"), [], TODAY
    ) == {"day": "2026-09-18", "time": "15:30"}
    assert (
        parse_answer("time", Judgement(answers=True, day="2026-09-18", time="25:00"), [], TODAY)
        is None
    )
    assert parse_answer("time", Judgement(answers=True, day="2026-09-18"), [], TODAY) is None


def test_a_tag_and_a_country_must_be_among_the_values_offered():
    tags = [{"label": "Lisbon", "value": "city:lisbon"}, {"label": "Porto", "value": "city:porto"}]
    assert parse_answer("tag", Judgement(answers=True, tag="city:porto"), tags, TODAY) == {
        "tag": "city:porto"
    }
    assert parse_answer("tag", Judgement(answers=True, tag="city:paris"), tags, TODAY) is None

    countries = [{"label": "United States", "value": "US"}, {"label": "Turkey", "value": "TR"}]
    assert parse_answer("country", Judgement(answers=True, country="tr"), countries, TODAY) == {
        "country": "TR"
    }
    assert parse_answer("country", Judgement(answers=True, country="PT"), countries, TODAY) is None


def test_the_value_is_described_in_our_words():
    assert (
        describe_value("span", {"from": "2026-10-10", "to": "2026-10-12"})
        == "2026-10-10 to 2026-10-12"
    )
    assert describe_value("time", {"day": "2026-09-18", "time": "15:30"}) == "2026-09-18 at 15:30"
    assert describe_value("date", {"day": "2026-09-30"}) == "2026-09-30"


# ------------------------------------------------------------------ the tail


def test_the_answering_tail_is_dropped_oldest_first_and_the_question_never():
    turns = [
        Turn(role="person", text="x" * 400),
        Turn(role="offload", text="y" * 400),
        Turn(role="person", text="z" * 40),
    ]
    actx = AnswerContext(
        question="which dates",
        threads=[Thread(id="t1", name="Lisbon", is_default=False)],
        has_calendar=False,
        today=TODAY,
        turns=turns,
        country="US",
        country_override="TR",
    )
    fitted = fit_answer(actx, ceiling=60)
    assert [t.text[0] for t in fitted.turns] == ["z"]
    assert fitted.question == "which dates"
    # Every field survives the rebuild, which is the trap `fit` already fell into once.
    assert fitted.today == TODAY
    assert fitted.country_override == "TR"
    assert fitted.country_in_effect == "TR"

    blocks = build_answer_blocks(fitted)
    texts = [b["text"] for b in blocks]
    assert texts[0].startswith("They are in T")
    assert any(t.startswith("Today is") for t in texts)
    assert any(t.startswith("Earlier in this conversation") for t in texts)
    assert texts[-1].endswith("which dates")


def test_the_thread_a_question_came_from_is_a_block_and_its_notes_are_data():
    actx = AnswerContext(
        question="when's the next holiday",
        threads=[Thread(id="t1", name="Istanbul trip", is_default=False)],
        has_calendar=False,
        today=TODAY,
        country="US",
        looking_at=Thread(id="t1", name="Istanbul trip", is_default=False),
        looking_at_notes=["Staying in Kadikoy 10th to 12th", "x" * 400],
    )
    texts = [b["text"] for b in build_answer_blocks(actx)]
    asked_from = next(t for t in texts if t.startswith("They asked this from inside thread t1"))
    assert "'Istanbul trip'" in asked_from
    assert "- Staying in Kadikoy" in asked_from
    assert "read as data" in asked_from

    # The notes fit under the ceiling after the tail, oldest first, and the
    # thread itself never goes: it is the fact the country question turns on.
    fitted = fit_answer(actx, ceiling=40)
    assert fitted.looking_at is not None and fitted.looking_at.id == "t1"
    assert fitted.looking_at_notes == []
    texts = [b["text"] for b in build_answer_blocks(fitted)]
    assert any(t.startswith("They asked this from inside thread t1") for t in texts)
