"""Run a set of cases against the real model and score what comes back.

**This is the harness, never the cases.** A case file says what somebody asks,
what the account holds, and what a good reply would be. This file only knows how
to run them all at once and count.

Two kinds of check, and both are here because either alone lies:

- **Mechanical.** Substrings that must not appear, a word cap, whether the reply
  is a list. Cheap, exact, and blind to whether the sentence is any good.
- **A judge.** One model call per case against the rubric the case carries.
  Catches everything the first kind cannot express, and is the reason a case can
  say "no context nobody asked for" instead of enumerating the words that would
  prove it.

A case passes only when both agree, because a reply that is short and useless
should not score.

Usage:
    uv run python evals/run_eval.py evals/cases/<file>.json
    uv run python evals/run_eval.py evals/cases/<file>.json --json
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from dataclasses import dataclass, field
from typing import Any

from anthropic import AsyncAnthropic

from offload_agent.context import AnswerContext, DumpContext, Thread
from offload_agent.harness.plan import plan, plan_answer

ANSWER_MODEL = "claude-opus-5"
# The judge is a different tier on purpose. It reads a short reply against a
# short rubric, which is not the hard part of this system, and using the same
# model to write and mark its own work is the failure mode this whole file
# exists to avoid.
JUDGE_MODEL = "claude-sonnet-5"

# Ten at a time. The API is fine with more; this keeps a failing run cheap to
# stop and keeps the output readable while it streams.
CONCURRENCY = 10


@dataclass
class Case:
    id: str
    question: str
    why: str
    """What this case is testing, in one line, for the report."""
    rubric: str = ""
    """What a good reply does, written for the judge to mark against."""
    #: What kind of turn this is.
    #:
    #: **"answer" is a question judged on its reply; "file" is a dump judged on
    #: what it reached for.** 016 added rules about when the web is touched at
    #: all, and no rubric about a sentence can measure a tool that was or was
    #: not called. So a filing case states `look_up` and `refuses` instead of a
    #: rubric, and the judge never runs on it: there is nothing to mark.
    kind: str = "answer"
    #: For a filing case: whether this dump should reach the web at all.
    look_up: bool | None = None
    #: And whether it should produce the refusal line.
    refuses: bool = False
    facts: dict[str, Any] | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)
    threads: list[dict[str, str]] = field(default_factory=list)
    must_not_contain: list[str] = field(default_factory=list)
    max_words: int | None = None
    truncated: bool = False
    """The read hit its page. A case about absence needs this, because a flat
    'no' is correct when the read was complete and wrong when it was not."""


@dataclass
class Result:
    case: Case
    reply: str
    mechanical: list[str]
    """Failures. Empty is a pass."""
    judged: bool
    judge_note: str

    @property
    def passed(self) -> bool:
        return not self.mechanical and self.judged


def _threads(case: Case) -> list[Thread]:
    if case.threads:
        return [
            Thread(id=t["id"], name=t["name"], is_default=t.get("default") == "yes")
            for t in case.threads
        ]
    return [
        Thread(id="00000001-0000-0000-0000-000000000000", name="Lisbon trip", is_default=False),
        Thread(id="00000002-0000-0000-0000-000000000000", name="Groceries", is_default=False),
        Thread(id="00000003-0000-0000-0000-000000000000", name="Miscellaneous", is_default=True),
    ]


def _caller(case: Case):
    """Every read returns the case's fixture, whichever tool is reached for.

    Deliberately indifferent to which tool the model picks: this measures the
    reply, and a case that only passes when the model chooses one particular
    read is measuring two things at once.
    """

    async def call_tool(tool: str, tool_call_id: str, args: dict) -> dict:
        if tool == "account_facts":
            return {"ok": True, "facts": case.facts or {}}
        # **Every tool the model can reach for needs an answer here.**
        #
        # A case asking how many calendars there are came back "None." for two
        # rounds and looked like a wrong answer from the model. It was not: the
        # model reached for `list_calendars`, which this did not know about, so
        # it fell through to the empty rows below and answered honestly about
        # nothing. A fixture that is silent about a tool measures the fixture.
        #
        # Derived from the same `calendars` the facts carry, so a case states
        # the account once and both reads agree about it.
        if tool == "list_calendars":
            return {
                "ok": True,
                "calendars": [
                    {
                        "calendarId": f"cal-{i}",
                        "name": c.get("name"),
                        "writable": c.get("writable", True),
                        "shared": c.get("shared", False),
                    }
                    for i, c in enumerate((case.facts or {}).get("calendars", []))
                ],
            }
        return {
            "ok": True,
            "result": {
                "threadId": case.rows[0]["threadId"] if case.rows else None,
                "threadName": case.rows[0]["threadName"] if case.rows else None,
                "truncated": case.truncated,
                "rows": case.rows,
            },
        }

    return call_tool


_JUDGE = """You are marking one reply from an assistant called offload against a rubric.

Answer only with a tool call. Be strict: the rubric is the whole standard, and a
reply that is pleasant but breaks it fails. Do not reward extra helpfulness.

The question somebody asked:
{question}

The rubric:
{rubric}

The reply:
{reply}"""


async def _judge(client: AsyncAnthropic, case: Case, reply: str) -> tuple[bool, str]:
    response = await client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": _JUDGE.format(
                    question=case.question,
                    rubric=case.rubric,
                    reply=reply,
                ),
            }
        ],
        tools=[
            {
                "name": "mark",
                "description": "Say whether the reply meets the rubric.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "meets": {"type": "boolean"},
                        "why": {
                            "type": "string",
                            "description": (
                                "One short clause. What it did wrong, "
                                "or what it got right."
                            ),
                        },
                    },
                    "required": ["meets", "why"],
                },
            }
        ],
        tool_choice={"type": "tool", "name": "mark"},
    )
    for block in response.content:
        if block.type == "tool_use":
            data = block.input
            if isinstance(data, dict):
                return bool(data.get("meets")), str(data.get("why", ""))
    return False, "judge did not answer"


def _mechanical(case: Case, reply: str) -> list[str]:
    failures: list[str] = []
    low = reply.lower()
    for banned in case.must_not_contain:
        if banned.lower() in low:
            failures.append(f"contains {banned!r}")
    if case.max_words is not None:
        words = len(reply.split())
        if words > case.max_words:
            failures.append(f"{words} words, cap is {case.max_words}")
    return failures


async def _run_filing(client: AsyncAnthropic, case: Case) -> Result:
    """A dump, judged on what it reached for rather than on what it said.

    The stub caller answers every filing tool and records every `look_up`, so a
    case asserts the thing 016's rules are actually about: whether the web was
    touched, and whether the refusal line came out. No judge, because there is
    no sentence to mark.
    """
    looked: list[dict] = []

    async def call_tool(tool: str, tool_call_id: str, args: dict) -> dict:
        if tool == "look_up":
            looked.append(args)
            return {"ok": True, "found": False}
        if tool == "create_thread":
            return {"ok": True, "threadId": "new", "threadName": args.get("name"), "notes": []}
        if tool == "list_thread_content":
            return {"ok": True, "result": {"rows": [], "truncated": False}}
        return {
            "ok": True,
            "threadId": args.get("thread_id"),
            "threadName": "Miscellaneous",
            "contentId": "c1",
            "notes": [],
        }

    threads = _threads(case)
    ctx = DumpContext(
        dump=case.question,
        turns=[],
        threads=threads,
        landed=[],
        default_thread_id=threads[-1].id,
        today="Friday 11 September 2026",
        has_calendar=False,
        may_search=True,
        may_read_links=True,
    )

    try:
        outcome = await plan(client, ctx, ANSWER_MODEL, call_tool)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", [f"raised {type(exc).__name__}"], False, "")

    reply = outcome.reply or ""
    failures: list[str] = []

    if case.look_up is True and not looked:
        failures.append("should have looked something up and did not")
    if case.look_up is False and looked:
        failures.append(f"looked something up and should not have: {looked}")

    refused = reply.strip() == "I don't search that."
    if case.refuses and not refused:
        failures.append(f"should have refused, said {reply!r}")
    if not case.refuses and refused:
        failures.append("refused something that is not on the list")

    return Result(case, reply, failures, True, "")


async def _run_one(client: AsyncAnthropic, case: Case, gate: asyncio.Semaphore) -> Result:
    if case.kind == "file":
        async with gate:
            return await _run_filing(client, case)

    async with gate:
        ctx = AnswerContext(
            question=case.question,
            threads=_threads(case),
            has_calendar=case.facts is not None,
        )
        try:
            outcome = await plan_answer(client, ctx, ANSWER_MODEL, _caller(case))
            reply = outcome.reply or ""
        except Exception as exc:  # noqa: BLE001
            return Result(case, "", [f"raised {type(exc).__name__}"], False, "")

        mechanical = _mechanical(case, reply)
        judged, note = await _judge(client, case, reply)
        return Result(case, reply, mechanical, judged, note)


async def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    path = sys.argv[1]
    as_json = "--json" in sys.argv
    with open(path, encoding="utf-8") as handle:
        raw = json.load(handle)
    cases = [Case(**c) for c in raw["cases"]]

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. This calls the real model.")
        return 2

    client = AsyncAnthropic()
    gate = asyncio.Semaphore(CONCURRENCY)
    results = await asyncio.gather(*(_run_one(client, c, gate) for c in cases))

    passed = [r for r in results if r.passed]
    accuracy = len(passed) / len(results) if results else 0.0

    if as_json:
        print(
            json.dumps(
                {
                    "file": path,
                    "total": len(results),
                    "passed": len(passed),
                    "accuracy": round(accuracy, 3),
                    "failures": [
                        {
                            "id": r.case.id,
                            "why": r.case.why,
                            "question": r.case.question,
                            "reply": r.reply,
                            "mechanical": r.mechanical,
                            "judge": r.judge_note,
                        }
                        for r in results
                        if not r.passed
                    ],
                },
                indent=2,
            )
        )
        # The same signal the human readable path gives. A caller checking the
        # exit code rather than parsing the body saw success on a run where
        # every case failed.
        return 0 if accuracy == 1.0 else 1

    print(f"\n{path}: {len(passed)}/{len(results)} = {accuracy:.0%}\n")
    for r in results:
        mark = "PASS" if r.passed else "FAIL"
        print(f"[{mark}] {r.case.id}  ({r.case.why})")
        print(f"       Q: {r.case.question}")
        print(f"       A: {r.reply!r}")
        if not r.passed:
            for failure in r.mechanical:
                print(f"       mechanical: {failure}")
            if not r.judged:
                print(f"       judge: {r.judge_note}")
        print()
    return 0 if accuracy == 1.0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
