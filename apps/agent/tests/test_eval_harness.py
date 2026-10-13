"""The eval stub answers as the Core API would.

Found by the full run of 2026-10-02: two faults in the stub that failed turns
production would have passed, and that read in the report as the model's.
"""

import asyncio
import importlib.util
import sys
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parents[1] / "evals"


def _run():
    spec = importlib.util.spec_from_file_location("evals_run", EVALS / "run.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["evals_run"] = module
    spec.loader.exec_module(module)
    return module


def _recorder(run, dump: str):
    case = run.Case(
        id="t",
        why="",
        surface="file",
        input=dump,
        expect={},
        principle="t",
        fixture={"threads": [{"id": "t1", "name": "Miscellaneous", "is_default": True}]},
    )
    return run.Recorder(case, dump)


def test_a_row_added_to_a_thread_this_turn_made_lands_there():
    """create_thread hands back `new`; a row added to it came back as filed in
    Miscellaneous, and the model filed everything a second time."""
    run = _run()
    tools = _recorder(run, "starting to plan the wedding: venue shortlist")

    async def turn():
        await tools("create_thread", "a", {"name": "Wedding planning"})
        added = await tools(
            "add_content", "b", {"thread_id": "new", "title": "Venues", "type": "task"}
        )
        listed = await tools("list_thread_content", "c", {"thread_id": "new"})
        return added, listed

    added, listed = asyncio.run(turn())
    assert added["threadName"] == "Wedding planning"
    assert [row["title"] for row in listed["rows"]] == ["Venues"]


def test_a_date_set_by_an_edit_to_a_row_just_filed_counts():
    """Production applies the edit; the matcher read the add alone."""
    run = _run()
    calls = [
        ("add_content", {"thread_id": "t1", "title": "Book a table", "type": "task"}),
        ("edit_content", {"content_id": "c1", "due_at": "2026-10-10"}),
    ]
    assert run._match_filing({"date": "2026-10-10"}, calls, {"threads": []}) is None


def test_a_run_is_priced_with_the_cache_counted_apart_from_input():
    # Anthropic's input count excludes both cache counts: nothing is subtracted
    # from it, and a cache write costs a quarter more than input.
    assert _run()._cost("claude-sonnet-5", 1_000, 500, 8_000, 2_000) == pytest.approx(
        (1_000 * 2 + 500 * 10 + 8_000 * 0.2 + 2_000 * 2.5) / 1e6
    )


def test_the_evals_price_opus_5_5_when_it_is_tried():
    # `--model answer=claude-opus-5-5` was priced as an unknown model, at Opus
    # 5's rate, until 2026-10-02.
    assert _run().PRICES["claude-opus-5-5"] == (4.0, 20.0)


def test_an_opus_5_5_cache_read_is_a_twentieth_of_input():
    assert _run()._cost("claude-opus-5-5", 0, 0, 1_000_000) == pytest.approx(0.20)


def test_a_new_threads_icon_is_held_to_the_expectation():
    """037. `thread_icon` reads the icon off the `create_thread` call."""
    _icon_problems = _run()._icon_problems

    made = [
        ("create_thread", {"name": "Lisbon", "icon": "plane"}),
        ("add_content", {"thread_id": "new"}),
    ]
    bare = [("create_thread", {"name": "Lisbon", "icon": None})]
    assert _icon_problems({"thread_icon": {"one_of": ["plane", "luggage"]}}, made) == []
    assert _icon_problems({"thread_icon": {"one_of": ["luggage"]}}, made) != []
    assert _icon_problems({"thread_icon": {"one_of": ["plane"]}}, bare) != []
    assert _icon_problems({"thread_icon": {"one_of": ["plane"]}}, []) != []
    # `known` passes an icon from the list or none at all, and nothing made up.
    assert _icon_problems({"thread_icon": {"known": True}}, made) == []
    assert _icon_problems({"thread_icon": {"known": True}}, bare) == []
    made_up = [("create_thread", {"icon": "suitcase"})]
    assert _icon_problems({"thread_icon": {"known": True}}, made_up) != []
    assert _icon_problems({}, made) == []


# 042. The label and date checks hold the model to what the Core API keeps.

SHOWN = [
    {"of": "content", "id": "t1", "type": "task", "text": "Get the visa"},
    {"of": "note", "id": "t2", "type": "note", "text": "We're in Lisbon 12 to 19 November"},
]


def test_a_label_check_reads_a_missing_label_as_none_and_pins_kind_lead_and_before():
    run = _run()
    wire = [
        {
            "id": "t1",
            "of": "content",
            "kind": "deadline",
            "lead": "months",
            "before": {"id": "a1", "of": "note"},
        },
    ]
    want = {
        "1": {"kind": "deadline", "lead_any": ["weeks", "months"], "before": 1},
        "2": {"kind": "trip"},
    }
    problems = run._label_problems(want, wire, SHOWN, [{"id": "a1"}])
    assert problems == ["entry 2 was none, wanted kind trip"]


def test_a_note_name_must_be_a_run_of_its_own_words():
    run = _run()
    wire = [{"id": "t2", "of": "note", "kind": "trip", "lead": "weeks", "name": "Your trip"}]
    problems = run._label_problems({"2": {"kind": "trip", "named": True}}, wire, SHOWN, [])
    assert problems == ["entry 2 named 'Your trip', not a run of its own words"]


def test_a_date_check_pins_the_day_the_lead_and_what_is_not_dated():
    run = _run()
    wire = [{"id": "d1", "on": "03-14", "lead": "days", "name": "Meera's birthday"}]
    problems = run._date_problems(
        {"dates": {"d1": {"on": "03-14", "lead": "weeks"}}, "no_date": ["d2"]},
        wire,
        [{"id": "d1", "text": "Meera's birthday is 14 March."}, {"id": "d2", "text": "x"}],
    )
    assert problems == ["d1 lead days, wanted weeks"]


# 2026-10-13, the flaky-cases hand-off.


def _args(**kw):
    import argparse

    base = dict(
        principle=None, surface=None, case=None, subset=None, include_pending=False, live=False
    )
    return argparse.Namespace(**{**base, **kw})


def _principle(run, cases):
    return run.Principle(
        number=30,
        slug="the-cast",
        statement="",
        why="",
        sources=[],
        surfaces=[],
        cases=cases,
        path=Path("30-the-cast.json"),
    )


def _case(run, cid, surface):
    return run.Case(
        id=cid, why="", surface=surface, input="x", expect={}, principle="30", fixture={}
    )


def test_cast_cases_are_skipped_not_failed_without_a_cast_database(monkeypatch):
    """Sixteen cast cases failed every run with 'the cast needs
    EVAL_CAST_DATABASE_URL', before any model was called."""
    run = _run()
    monkeypatch.delenv("EVAL_CAST_DATABASE_URL", raising=False)
    p = _principle(run, [_case(run, "a", "cast-file"), _case(run, "b", "file")])
    assert [c.id for _, c in run._select([p], _args())] == ["b"]


def test_cast_cases_run_when_a_cast_database_is_set(monkeypatch):
    run = _run()
    monkeypatch.setenv("EVAL_CAST_DATABASE_URL", "postgresql://x/offload_cast")
    p = _principle(run, [_case(run, "a", "cast-file"), _case(run, "b", "file")])
    assert [c.id for _, c in run._select([p], _args())] == ["a", "b"]


def test_one_left_passes_a_fold_of_both_or_one_set_aside():
    """The nightly duplicate cases: the same answer, both notes folded into
    one, was judged pass in one run and fail in the next."""
    run = _run()
    fold = [{"text": "Ana is doing the electrics", "folded_from": ["n1", "n2"]}]
    assert run._one_left(["n1", "n2"], [], [], fold) is None
    assert run._one_left(["n1", "n2"], ["n1"], [], fold) is None
    assert run._one_left(["n1", "n2"], ["n2"], [], []) is None
    assert run._one_left(["n1", "n2"], [], ["n1"], []) is None


def test_one_left_fails_both_standing_both_gone_or_a_partial_fold():
    run = _run()
    assert run._one_left(["n1", "n2"], [], [], [])
    assert run._one_left(["n1", "n2"], ["n1", "n2"], [], [])
    assert run._one_left(["n1", "n2"], [], [], [{"text": "x", "folded_from": ["n1"]}])
    assert run._one_left(["n1", "n2"], ["n1"], [], [{"text": "x", "folded_from": ["n2"]}])


def test_the_judge_is_not_shown_the_harness_label_on_the_last_line(monkeypatch):
    """The judge failed a correct waiting line for 'because waiting', a label
    the harness adds after what offload said, which the person never sees
    (2026-10-13). The record keeps the label."""
    run = _run()
    from offload_agent.harness.plan import Outcome

    async def fake_plan(client, ctx, model, rec):
        return Outcome(reply="Waiting for your go-ahead.", because="waiting")

    seen = []

    async def fake_judge(client, case, transcript):
        seen.append(transcript)
        return True, ""

    monkeypatch.setattr(run, "plan", fake_plan)
    monkeypatch.setattr(run, "_judge", fake_judge)
    case = run.Case(
        id="t",
        why="",
        surface="file",
        input="dentist tuesday 3pm",
        expect={"rubric": "Says it is waiting."},
        principle="t",
        fixture={"threads": [{"id": "t1", "name": "Miscellaneous", "is_default": True}]},
    )
    from types import SimpleNamespace

    ctx = SimpleNamespace(photos=[], pdfs=[])
    result = asyncio.run(run._file_with(None, case, "m", ctx, run.Recorder(case, case.input)))
    assert seen and "because" not in seen[0]
    assert "(because waiting)" in result.transcript


def test_a_subset_narrowed_by_surface_is_not_a_subset_naming_missing_cases(tmp_path):
    """--subset block1 --surface file stopped on 'subset names cases that do
    not exist' for every answer case in the block (2026-10-13)."""
    run = _run()
    sub = tmp_path / "s.json"
    sub.write_text('{"cases": ["a", "b"]}')
    p = _principle(run, [_case(run, "a", "answer"), _case(run, "b", "file")])
    assert [c.id for _, c in run._select([p], _args(subset=str(sub), surface="file"))] == ["b"]


def test_a_subset_naming_a_case_that_does_not_exist_still_stops(tmp_path):
    run = _run()
    sub = tmp_path / "s.json"
    sub.write_text('{"cases": ["a", "typo"]}')
    p = _principle(run, [_case(run, "a", "file")])
    with pytest.raises(SystemExit):
        run._select([p], _args(subset=str(sub)))
