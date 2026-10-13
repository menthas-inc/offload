"""The eval stub's account_facts and answering reads agree with the Core API.

A stub that hands back more than production succeeds where production cannot:
the facts stub returned `filesInto` for two releases after 019 took it off
the Core API, and the default thread's stored name after 028 masked it, so
cases passed or failed on a field no person's turn would ever see.
"""

import asyncio
import importlib.util
import json
import re
import sys
from pathlib import Path

import pytest

from offload_agent.harness.plan import NOT_IN_A_THREAD

EVALS = Path(__file__).resolve().parents[1] / "evals"
READ_TS = Path(__file__).resolve().parents[3] / "apps" / "core-api" / "src" / "search" / "read.ts"
SHAPE = json.loads((EVALS / "fixtures" / "account-facts-shape.json").read_text())


def _run():
    spec = importlib.util.spec_from_file_location("evals_run", EVALS / "run.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["evals_run"] = module
    spec.loader.exec_module(module)
    return module


RUN = _run()
CASES = [
    c
    for p in RUN.load_principles(RUN._load_contexts())
    for c in p.cases
    if (c.fixture.get("facts") or c.fixture.get("threads"))
]


def _call(case, tool: str, args: dict) -> dict:
    rec = RUN.Recorder(case, "x")
    return asyncio.run(rec(tool, "t", args))


def _default(case):
    return next((t for t in RUN._threads(case.fixture) if t.is_default), None)


def test_the_shape_fixture_is_the_core_apis_interface():
    if not READ_TS.exists():
        pytest.skip("the Core API is not beside this checkout")
    body = re.search(r"export interface AccountFacts \{(.*?)\n\}", READ_TS.read_text(), re.S)
    assert body, "AccountFacts moved"
    text = re.sub(r"/\*.*?\*/", "", body.group(1), flags=re.S)
    fields = re.findall(r"^\s*(\w+)\s*:", text, re.M)
    assert fields == SHAPE["fields"]
    assert (
        f'NOT_IN_A_THREAD = "{SHAPE["notInAThread"]}"'
        in (READ_TS.parents[1] / "threads" / "default.ts").read_text()
    )
    assert SHAPE["notInAThread"] == NOT_IN_A_THREAD


@pytest.mark.parametrize("case", [c for c in CASES if c.fixture.get("facts")], ids=lambda c: c.id)
def test_account_facts_carries_exactly_the_core_apis_fields(case):
    facts = _call(case, "account_facts", {})["facts"]
    assert list(facts) == SHAPE["fields"]
    for cal in facts["calendars"]:
        assert list(cal) == SHAPE["calendar"]
    if facts["defaultThread"] is not None:
        assert list(facts["defaultThread"]) == SHAPE["defaultThread"]
        assert facts["defaultThread"]["name"] == NOT_IN_A_THREAD
    assert facts["knowsDevicePreferences"] is False


@pytest.mark.parametrize("case", [c for c in CASES if _default(c)], ids=lambda c: c.id)
def test_no_answering_read_names_the_default_thread(case):
    default = _default(case)
    for tool, args in [
        ("account_facts", {}),
        ("search", {"query": "x"}),
        ("list_content", {"thread_id": default.id}),
        ("list_agenda", {}),
    ]:
        said = json.dumps(_call(case, tool, args))
        assert f'"{default.name}"' not in said, (tool, said)


def _case_with_rows(rows: list[dict]):
    return RUN.Case(
        id="rows",
        why="",
        surface="file",
        input="add the rest",
        expect={},
        principle="08",
        fixture={"rows": rows, "looking_at": "00000013-0000-0000-0000-000000000000"},
    )


def test_a_fixture_row_is_a_row_create_event_can_take():
    # 2026-10-13. The Core API takes any row of the account's own, whichever
    # turn filed it; the stub refused every id it had not handed out itself,
    # so no case could see "add the rest" about rows already in the thread.
    case = _case_with_rows(
        [
            {"contentId": "e1", "type": "event", "title": "Class", "occursAt": "2026-11-30T18:00"},
            {"contentId": "e2", "type": "task", "title": "Loose", "occursAt": None},
        ]
    )
    assert _call(case, "create_event", {"content_id": "e1"}).get("ok") is True
    assert _call(case, "create_event", {"content_id": "e2"})["error"] == "no_time"
    assert _call(case, "create_event", {"content_id": "e9"})["error"] == "unknown_content"
