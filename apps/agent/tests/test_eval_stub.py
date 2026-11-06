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


def test_a_row_finding_its_event_runs_the_server_s_bound():
    # The Core API refuses an event it does not hold and one at another moment.
    # A stub that took any `event` would pass a model that links a double
    # booking, so it compares the row's time, read in the case's zone.
    case = _case_with_rows(
        [
            {"contentId": "e1", "type": "event", "title": "Review", "occursAt": "2026-09-17T14:00"},
            {"contentId": "e2", "type": "event", "title": "Lunch", "occursAt": "2026-09-17T12:00"},
        ]
    )
    case.fixture["events"] = [
        {"sourceRef": "cal-1:r", "title": "Review", "startsAt": "2026-09-17T13:00:00Z"}
    ]
    found = _call(case, "create_event", {"content_id": "e1", "event": "cal-1:r"})
    assert found == {"ok": True, "alreadyOn": True}
    other = _call(case, "create_event", {"content_id": "e2", "event": "cal-1:r"})
    assert other["error"] == "different_time"
    unknown = _call(case, "create_event", {"content_id": "e1", "event": "e1"})
    assert unknown["error"] == "unknown_event"


# ------------------------------------------------------------------ 050 actions


def test_the_actions_stub_resolves_a_typed_number_and_a_picture_s_quote():
    # 050 T6b. The stub runs the worker's own resolve over the turn's set the
    # model was shown, so a case about a typed dump or a picture can pass and,
    # more to the point, fail. Before 050 it returned nothing unless the row
    # was a PDF's, so every such case passed vacuously.
    from offload_agent.context import Found

    run = _run()
    fx = {"_found": [Found("tel:+12125550142", "dump", "typed")]}
    typed = {"type": "event", "actions": [{"link": 1, "label": "Call Dana"}]}
    assert [a["url"] for a in run._resolve_actions(fx, typed)] == ["tel:+12125550142"]
    picture = {
        "type": "event",
        "photo": 1,
        "body": "A message\nText: Dana R. 212 555 0142",
        "actions": [{"found": "212 555 0142", "label": "Call Dana"}],
    }
    assert [a["kind"] for a in run._resolve_actions({}, picture)] == ["call"]
    assert run._resolve_actions({}, {**picture, "photo": None}) == []


def test_no_actions_looks_at_every_row_not_only_a_pdf_s():
    from offload_agent.context import Found

    run = _run()
    fx = {"_found": [Found("tel:+12125550142", "dump", "typed")]}
    calls = [
        (
            "add_content",
            {"type": "task", "title": "Call Dana", "actions": [{"link": 1, "label": "Call Dana"}]},
        )
    ]
    assert run._carried_actions(calls, fx) == [
        [{"label": "Call Dana", "url": "tel:+12125550142", "kind": "call", "source": "typed"}]
    ]
