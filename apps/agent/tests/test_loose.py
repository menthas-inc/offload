"""028. Not in a thread, the agent's side.

T2.1 the default thread is read as "not in a thread" and its stored name never
reaches a prompt; T2.2 the filing tools carry `suggest_thread_id` inside the
raised budget; T2.3 the worker strips it after a web read; T2.4 a stopped turn
says "Saved." for what landed loose.
"""

import json

import httpx

from offload_agent.context import AnswerContext, DumpContext, Thread
from offload_agent.harness.plan import (
    TOOL_DEFINITION_BUDGET,
    TOOLS,
    Landed,
    Outcome,
    build_answer_blocks,
    build_blocks,
)
from offload_agent.harness.tools import AddContent, AddNote

DEFAULT = Thread(id="00000000-0000-0000-0000-000000000000", name="Miscellaneous", is_default=True)
LISBON = Thread(id="00000000-0000-0000-0000-000000000001", name="Lisbon trip", is_default=False)


def _text(blocks: list[dict]) -> str:
    return "\n".join(b.get("text", "") for b in blocks)


def test_a_dump_turn_reads_the_default_thread_as_not_in_a_thread():
    ctx = DumpContext(
        dump="ana's shoe size is 38",
        turns=[],
        threads=[LISBON, DEFAULT],
        landed=[],
        default_thread_id=DEFAULT.id,
    )
    text = _text(build_blocks(ctx))
    assert "Miscellaneous" not in text
    assert f"{DEFAULT.id}  not in a thread" in text
    # A person still calls it what they used to.
    assert "miscellaneous, unsorted or the inbox" in text


def test_an_answer_turn_reads_it_the_same_way():
    ctx = AnswerContext(
        question="where did I put the passport number",
        threads=[LISBON, DEFAULT],
        has_calendar=False,
    )
    text = _text(build_answer_blocks(ctx))
    assert "Miscellaneous" not in text
    assert f"{DEFAULT.id}  not in a thread" in text


def test_the_filing_tools_carry_a_suggested_thread():
    assert (
        AddContent(thread_id="t", title="x", type="task", suggest_thread_id="u").suggest_thread_id
        == "u"
    )
    assert AddNote(thread_id="t", text="x", suggest_thread_id="u").suggest_thread_id == "u"
    by_name = {tool["name"]: tool for tool in TOOLS}
    for name in ("add_content", "add_note"):
        assert "suggest_thread_id" in json.dumps(by_name[name]["input_schema"])


def test_the_tool_set_fits_the_raised_budget():
    # Raised from 1,800 by the product owner on 2026-10-01, and to 2,100 on
    # 2026-10-04 for 037's icon names, both logged in docs/tech/decisions.md,
    # rather than moving the tail behind defer_loading.
    assert TOOL_DEFINITION_BUDGET == 2_100
    assert len(json.dumps(TOOLS)) // 4 + 1 < TOOL_DEFINITION_BUDGET


async def test_the_worker_strips_a_suggestion_made_after_a_web_read(monkeypatch):
    from offload_agent import worker
    from offload_agent.config import Config

    seen: list[dict] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(
            200, json={"ok": True, "threadId": "t1", "threadName": "not in a thread"}
        )

    async def looked(*args, **kwargs):
        return {"ok": True, "fields": {}}

    monkeypatch.setattr(worker, "_look_up", looked)
    cfg = Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )
    lookups = (None, cfg, worker.Lookups("a dump", may_search=True, may_read_links=True))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = worker._tool_caller(client, cfg, "job-1", lookups=lookups)
        await call(
            "add_content",
            "c1",
            {"thread_id": "t1", "title": "x", "type": "task", "suggest_thread_id": "u1"},
        )
        await call("look_up", "l1", {"question": "a dump", "want": ["fact"]})
        await call(
            "add_content",
            "c2",
            {"thread_id": "t1", "title": "y", "type": "task", "suggest_thread_id": "u1"},
        )
        await call("add_note", "n1", {"thread_id": "t1", "text": "z", "suggest_thread_id": "u1"})

    assert seen[0]["suggestThreadId"] == "u1"
    assert "suggestThreadId" not in seen[1]
    assert "suggestThreadId" not in seen[2]


def test_a_stopped_turn_says_saved_for_what_landed_loose():
    from offload_agent.worker import _partial_reply

    loose = Landed(
        tool="add_content", thread_id=DEFAULT.id, thread_name="not in a thread", content_id="c1"
    )
    lisbon = Landed(
        tool="add_content", thread_id=LISBON.id, thread_name="Lisbon trip", content_id="c2"
    )
    assert _partial_reply(Outcome(reply=None, landed=[loose])) == "Saved."
    assert _partial_reply(Outcome(reply=None, landed=[loose, lisbon])) == "Saved to Lisbon trip."
    assert _partial_reply(Outcome(reply=None, landed=[lisbon])) == "Saved to Lisbon trip."


def _evals():
    import importlib.util
    import sys
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "evals" / "run.py"
    spec = importlib.util.spec_from_file_location("evals_run", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["evals_run"] = module
    spec.loader.exec_module(module)
    return module


async def test_the_eval_stub_answers_not_in_a_thread_as_the_server_does():
    run = _evals()
    case = run.Case(
        id="x", why="", surface="file", input="x", expect={}, principle="02", fixture={}
    )
    recorder = run.Recorder(case, "x")
    out = await recorder(
        "add_content",
        "c1",
        {"thread_id": "00000003-0000-0000-0000-000000000000", "title": "x", "type": "task"},
    )
    assert out["threadName"] == "not in a thread"
    out = await recorder(
        "add_content",
        "c2",
        {"thread_id": "00000001-0000-0000-0000-000000000000", "title": "x", "type": "task"},
    )
    assert out["threadName"] == "Lisbon trip"


def test_an_eval_case_can_ask_for_a_suggestion_or_for_none():
    run = _evals()
    loose = "00000003-0000-0000-0000-000000000000"
    lisbon = "00000001-0000-0000-0000-000000000000"
    with_one = [
        ("add_content", {"thread_id": loose, "title": "hotel", "suggest_thread_id": lisbon})
    ]
    without = [("add_content", {"thread_id": loose, "title": "hotel"})]
    assert (
        run._match_filing({"thread": "Miscellaneous", "suggest": "Lisbon trip"}, with_one, {})
        is None
    )
    assert (
        run._match_filing({"thread": "Miscellaneous", "suggest": "Lisbon trip"}, without, {})
        is not None
    )
    assert run._match_filing({"no_suggest": True}, without, {}) is None
    assert run._match_filing({"no_suggest": True}, with_one, {}) is not None
