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
