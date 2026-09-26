"""Run the principle evals against the real model and score what comes back.

**This is the harness, never the cases.** A principle file says how offload
behaves and holds the cases that test it; a context file says what an account
holds. This file only knows how to run them and count.

Six surfaces, one per model call the product makes:

- ``file``       a dump through the planner (``plan``)
- ``answer``     a question through the answerer (``plan_answer``)
- ``classify``   question or note (``classify``)
- ``quick_add``  a row typed into a thread (``plan_quick_add``)
- ``judge``      does a typed message answer the open question (``judge_answer``)
- ``compact``    one thread's notes, folded (``compact._ask``)

Each runs the real prompt assembly and the real loop, with every tool answered
from the case's fixture. The Core API is the one thing not exercised: what a
tool would have written is recorded instead, and the checks read the record.

**Models are production's.** Read from ``Config`` rather than named here, so a
change to what the product runs on changes what this measures. The old runner
filed on Opus while production filed on Sonnet, and every filing number it
produced was about a model nobody shipped.

Two kinds of check, and both are here because either alone lies:

- **Mechanical.** What was filed, what was called, what was said, exactly.
- **A judge.** One model call against the rubric the case carries, over the
  transcript of what offload did and said. Catches what the first kind cannot
  express.

A case passes only when both agree.

Usage:
    uv run python evals/run.py                      # every principle
    uv run python evals/run.py --principle 14      # one, by number or slug
    uv run python evals/run.py --surface answer    # one surface across all
    uv run python evals/run.py --list              # the principles, no model
    uv run python evals/run.py --json              # machine readable
    uv run python evals/run.py --include-pending   # cases still waiting for a label
    uv run python evals/run.py --write-baseline    # evals/BASELINE.md
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from offload_agent import compact as compact_mod
from offload_agent.config import Config
from offload_agent.context import (
    AnswerContext,
    DumpContext,
    LabelRef,
    Photo,
    Piece,
    QuickAddContext,
    Thread,
    Turn,
)
from offload_agent.countries import name_of
from offload_agent.harness.plan import (
    classify,
    judge_answer,
    plan,
    plan_answer,
    plan_quick_add,
)
from offload_agent.renditions import make
from offload_agent.worker import (
    Lookups,
    _author_the_answer_line,
    _author_the_failure_line,
    _declined_if_argument,
    _from_the_dump,
    _in_the_dump,
    parse_answer,
)

HERE = Path(__file__).parent
PRINCIPLES = HERE / "principles"
CONTEXTS = HERE / "contexts"
RESULTS = HERE / "results"
#: Every run, one line each, committed. `results/` holds the transcripts and
#: is not; this is the part worth comparing over time.
HISTORY = HERE / "history.jsonl"
HISTORY_MD = HERE / "HISTORY.md"

# **Production's models, by surface.** Config carries the defaults the worker
# runs with, and reading them here is what stops this measuring a model the
# product does not use.
_DEFAULTS = {f.name: f.default for f in Config.__dataclass_fields__.values()}
MODELS = {
    "file": _DEFAULTS["model"],
    "quick_add": _DEFAULTS["model"],
    "answer": _DEFAULTS["answer_model"],
    "classify": _DEFAULTS["sort_model"],
    "judge": _DEFAULTS["sort_model"],
    "compact": _DEFAULTS["sort_model"],
}
# The eval's own judge is a different tier from the answerer on purpose: a
# model marking its own work is the failure this file exists to avoid.
EVAL_JUDGE_MODEL = "claude-sonnet-5"

CONCURRENCY = 10
COUNTRY = "PT"

#: Dollars per million tokens, input and output, from stack.md. A cache read
#: is a tenth of input. Used to price a run so the number is measured rather
#: than guessed at.
PRICES = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
}


def _cost(model: str, input_tokens: int, output_tokens: int, cache_read: int = 0) -> float:
    price_in, price_out = PRICES.get(model, (5.0, 25.0))
    uncached = max(0, input_tokens - cache_read)
    return (uncached * price_in + cache_read * price_in / 10 + output_tokens * price_out) / 1e6


TODAY = "Friday 11 September 2026"
#: The fixtures' device zone. Lisbon in September is UTC+1, so 3pm there is
#: 14:00Z; a case can set `time_zone` to another name, or null for UTC.
TIME_ZONE = "Europe/Lisbon"
TODAY_ISO = "2026-09-11"


# ---------------------------------------------------------------------------
# Loading


@dataclass
class Principle:
    number: int
    slug: str
    statement: str
    why: str
    sources: list[str]
    surfaces: list[str]
    cases: list[Case]
    path: Path


@dataclass
class Case:
    id: str
    why: str
    surface: str
    input: Any
    expect: dict[str, Any]
    principle: str
    fixture: dict[str, Any]
    label_pending: str | None = None
    live: bool = False


def _load_contexts() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for path in sorted(CONTEXTS.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        out[path.stem] = data
    return out


def _merge(base: dict, over: dict) -> dict:
    """Shallow, per key. A case that says `notes` replaces the context's notes
    wholesale rather than merging into them, because a merge would make
    "this thread has no notes" impossible to say."""
    merged = copy.deepcopy(base)
    for key, value in over.items():
        merged[key] = copy.deepcopy(value)
    return merged


_FIXTURE_KEYS = {
    "threads",
    # 025. The labels in the fixture's threads: [{id, threadId, name}].
    "labels",
    "looking_at",
    "notes",
    "notes_from_members",
    "notes_from_apps",
    "rows",
    "facts",
    "calendars",
    "events",
    "history",
    "country",
    "today",
    "time_zone",
    "has_calendar",
    "may_search",
    "may_read_links",
    "truncated",
    "answered",
    "country_override",
    "calendar_waits",
    "calendar_write",
    # 022. Whether the share tool is sent, and what the server would say to
    # it: pending (the default), asked, or a refusal's error.
    "has_connections",
    "share_outcome",
    "lookup_result",
    "landed",
    "pieces",
    "content_id",
    "thread_id",
    "question_asked",
    "default_thread",
    "fail_tools",
    "tool_errors",
    # 020. File names under fixtures/photos, attached to the dump in order.
    "photos",
}


def load_principles(contexts: dict[str, dict], paths: list[Path] | None = None) -> list[Principle]:
    out: list[Principle] = []
    for path in paths or sorted(PRINCIPLES.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        number_text, _, slug = path.stem.partition("-")
        number = int(number_text) if number_text.isdigit() else 0
        slug = slug or path.stem
        cases: list[Case] = []
        seen: set[str] = set()
        for c in raw["cases"]:
            if c["id"] in seen:
                raise SystemExit(f"{path.name}: duplicate case id {c['id']!r}")
            seen.add(c["id"])
            base = contexts.get(c.get("context", ""), {}) if c.get("context") else {}
            if c.get("context") and c["context"] not in contexts:
                raise SystemExit(f"{path.name}: {c['id']} names unknown context {c['context']!r}")
            over = {k: v for k, v in c.items() if k in _FIXTURE_KEYS}
            fixture = _merge(base, over)
            unknown = (
                set(c)
                - _FIXTURE_KEYS
                - {
                    "id",
                    "why",
                    "surface",
                    "input",
                    "expect",
                    "context",
                    "label_pending",
                    "live",
                }
            )
            if unknown:
                raise SystemExit(f"{path.name}: {c['id']} has unknown keys {sorted(unknown)}")
            cases.append(
                Case(
                    id=c["id"],
                    why=c.get("why", ""),
                    surface=c["surface"],
                    input=c["input"],
                    expect=c.get("expect", {}),
                    principle=path.stem,
                    fixture=fixture,
                    label_pending=c.get("label_pending"),
                    live=bool(c.get("live")),
                )
            )
        out.append(
            Principle(
                number=number,
                slug=slug,
                statement=raw["statement"],
                why=raw.get("why", ""),
                sources=raw.get("sources", []),
                surfaces=sorted({c.surface for c in cases}),
                cases=cases,
                path=path,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Fixtures


def _threads(fx: dict) -> list[Thread]:
    if "threads" in fx and not fx["threads"]:
        return []
    raw = fx.get("threads") or [
        {"id": "00000001-0000-0000-0000-000000000000", "name": "Lisbon trip"},
        {"id": "00000002-0000-0000-0000-000000000000", "name": "Groceries"},
        {"id": "00000003-0000-0000-0000-000000000000", "name": "Miscellaneous", "default": "yes"},
    ]
    return [
        Thread(id=t["id"], name=t["name"], is_default=t.get("default") in ("yes", True))
        for t in raw
    ]


def _thread(fx: dict, thread_id: str | None) -> Thread | None:
    if not thread_id:
        return None
    return next((t for t in _threads(fx) if t.id == thread_id), None)


def _dated(items: list) -> list[dict[str, str]]:
    """Notes as `add_content` hands them back: text and the date written."""
    out = []
    for item in items or []:
        if isinstance(item, str):
            out.append({"text": item, "writtenAt": "2026-09-01T09:00:00.000Z"})
        else:
            out.append(
                {
                    "text": item["text"],
                    "writtenAt": item.get("writtenAt", "2026-09-01T09:00:00.000Z"),
                }
            )
    return out


def _notes_for(fx: dict, key: str, thread_id: str | None) -> list[dict[str, str]]:
    table = fx.get(key) or {}
    return _dated(table.get(thread_id or "", []))


def _rows_for(fx: dict, thread_id: str | None) -> list[dict]:
    rows = fx.get("rows") or []
    if isinstance(rows, dict):
        if thread_id:
            return list(rows.get(thread_id, []))
        return [r for group in rows.values() for r in group]
    if thread_id:
        return [r for r in rows if r.get("threadId") in (None, thread_id)]
    return list(rows)


_STUB_FIELD = {
    "date": "2026-10-25",
    "time": "02:00",
    "dates_range": "2026-10-25 to 2027-03-28",
    "place": "somewhere",
    "title": "A page",
    "artist": "Somebody",
    "price": "10",
    "hours": "9 to 5",
    "forecast": "dry",
    "fact": "something true",
    "image": "https://example.com/a.jpg",
}


class Recorder:
    """Every tool call, answered from the fixture and written down.

    One caller for both kinds of turn, indifferent to which tool the model
    picks: a case measures the behaviour, not the route to it.
    """

    def __init__(self, case: Case, dump: str) -> None:
        self.case = case
        self.fx = case.fixture
        self.dump = dump
        self.calls: list[tuple[str, dict]] = []
        #: What each call came back with, in the same order as `calls`. The
        #: judge reads the ones that change what a sentence may claim: a
        #: calendar write that was held, asked or refused looks identical to
        #: one that was written when only the call is shown, and the judge
        #: failed four true replies for "claiming it is waiting after
        #: creating it" before this existed.
        self.results: list[dict] = []
        self.looked: list[dict] = []
        self.refused_bound: list[str] = []
        #: The worker's ledger, so the rules it applies after the model can
        #: run here on the same record.
        self.budget = Lookups(dump, may_search=True, may_read_links=True)
        self.filed_ids = 0
        self.content_timed: dict[str, bool] = {}
        self.refused_time_once = False
        #: Title of every row this turn added, by the id handed back, so an
        #: edit naming that id can be read as the title's final state.
        self.content_titles: dict[str, str] = {}

    @property
    def country(self) -> str | None:
        fx = self.fx
        if fx.get("country_override"):
            return fx["country_override"]
        if "country" in fx:
            return fx["country"]
        return COUNTRY

    async def __call__(self, tool: str, tool_call_id: str, args: dict) -> dict:
        self.calls.append((tool, dict(args)))
        # The stub answers as the Core API would; the worker's own reading of
        # that answer (a refusal about the arguments is a decline, not a
        # failure) runs here too, so a case measures the same loop a turn
        # takes. Without it the no_time case failed as "filed nothing and said
        # nothing" on a turn that had filed and written.
        body = _declined_if_argument(await self._answer(tool, args))
        self.results.append(body)
        return body

    async def _answer(self, tool: str, args: dict) -> dict:
        fx = self.fx
        # A tool the case says fails: `fail_tools` maps a name, or `name:N`
        # for the Nth call of it, to the error the Core API would report.
        nth = sum(1 for t, _ in self.calls if t == tool)
        for key, error in (fx.get("fail_tools") or {}).items():
            name, _, which = key.partition(":")
            if name == tool and (not which or int(which) == nth):
                return {"ok": False, "error": error}
        if tool in (fx.get("tool_errors") or {}):
            return {"ok": False, "error": fx["tool_errors"][tool]}
        if tool == "look_up":
            return self._look_up(args)
        if tool == "account_facts":
            return {"ok": True, "facts": fx.get("facts") or {}}
        # 019. The scope is the server's, so the stub answers with every
        # calendar the fixture lists and marks none as somebody else's unless
        # the fixture says so; the model never names a calendar.
        if tool == "list_calendars":
            cals = fx.get("calendars")
            if cals is None:
                cals = [
                    {"name": c.get("name"), "writable": True}
                    for c in (fx.get("facts") or {}).get("calendars", [])
                ]
            return {
                "ok": True,
                "calendars": [
                    {
                        "calendarId": c.get("calendarId", f"cal-{i}"),
                        "name": c.get("name"),
                        "writable": c.get("writable", True),
                        "yours": c.get("yours", True),
                    }
                    for i, c in enumerate(cals)
                ],
            }
        if tool == "find_events":
            return {
                "ok": True,
                "events": [
                    {
                        **{k: v for k, v in e.items() if k != "calendarId"},
                        "untrusted": e.get("untrusted", False),
                    }
                    for e in fx.get("events") or []
                ],
            }
        if tool == "create_event":
            # The row's thread decides. `calendar_write` in a fixture says what
            # the server would say: written (the default), asked, noCalendar.
            if not str(args.get("content_id") or "").startswith("c"):
                return {"ok": False, "error": "unknown_content"}
            if not self.content_timed.get(str(args.get("content_id"))):
                return {"ok": False, "error": "no_time"}
            # `no_time_once`: the first create is refused whatever the row
            # holds, so the case can see the model fix the same row rather
            # than file another.
            if fx.get("calendar_write") == "no_time_once" and not self.refused_time_once:
                self.refused_time_once = True
                return {"ok": False, "error": "no_time"}
            because = fx.get("calendar_waits")
            if because:
                return {"ok": True, "waitingForThem": True, "because": because}
            outcome = fx.get("calendar_write") or "written"
            if outcome == "asked":
                return {"ok": True, "asked": True}
            if outcome == "noCalendar":
                return {"ok": True, "noCalendar": True}
            return {"ok": True, "written": True, "sourceRef": "evt-1"}
        if tool in {"edit_event", "delete_event"}:
            because = fx.get("calendar_waits")
            if because:
                return {"ok": True, "waitingForThem": True, "because": because}
            return {"ok": True, "written": True, "sourceRef": "evt-1"}
        if tool == "share_thread":
            # 022. The server resolves the person and answers one of three
            # ways; the fixture says which, as it says for a calendar write.
            outcome = fx.get("share_outcome") or "pending"
            if outcome == "asked":
                return {"ok": True, "asked": True}
            if outcome != "pending":
                return {"ok": False, "error": outcome}
            return {
                "ok": True,
                "waitingForThem": True,
                "because": f"Share it with {args.get('person')}?",
            }
        if tool == "create_thread":
            return {
                "ok": True,
                "threadId": "new",
                "threadName": args.get("name"),
                "notes": [],
                "notesFromMembers": [],
                "notesFromApps": [],
            }
        if tool in {"list_thread_content"}:
            return {
                "ok": True,
                "rows": [
                    {
                        "contentId": r.get("contentId"),
                        "type": r.get("type"),
                        "title": r.get("title"),
                        "body": r.get("body"),
                        "done": r.get("done", False),
                        "yours": r.get("yours", True),
                    }
                    for r in _rows_for(fx, args.get("thread_id"))
                ],
                "truncated": bool(fx.get("truncated")),
            }
        if tool in {"add_content", "add_note"}:
            self.filed_ids += 1
            thread_id = str(args.get("thread_id") or "")
            named = _thread(fx, thread_id)
            out: dict[str, Any] = {
                "ok": True,
                "threadId": thread_id,
                "threadName": named.name if named else "Miscellaneous",
                "notes": _notes_for(fx, "notes", thread_id),
                "notesFromMembers": _notes_for(fx, "notes_from_members", thread_id),
                "notesFromApps": _notes_for(fx, "notes_from_apps", thread_id),
            }
            if tool == "add_content":
                out["contentId"] = f"c{self.filed_ids}"
                self.content_titles[out["contentId"]] = str(args.get("title") or "")
                # 019. Whether the row has a time, which `create_event` checks
                # as the server does: a stub that wrote any row to a calendar
                # could not see a row filed without one and filed again.
                self.content_timed[out["contentId"]] = bool(args.get("occurs_at"))
            else:
                out["noteId"] = f"n{self.filed_ids}"
            return out
        # 025. The provenance bound the Core API runs, run here too: a label may
        # be made only out of the words of the dump. A stub that made any name
        # would pass a model that invents labels.
        if tool == "label_content":
            said = set(re.findall(r"\w+", re.sub(r"https?://\S+|www\.\S+", " ", self.dump.lower())))
            for name in args.get("new") or []:
                words = re.findall(r"\w+", str(name).lower())
                if not words or not all(w in said for w in words):
                    return {"ok": False, "error": "not_in_the_dump"}
            return {"ok": True, "done": True}
        if tool == "edit_content" and args.get("occurs_at"):
            self.content_timed[str(args.get("content_id"))] = True
        if tool in {
            "edit_content",
            "move_content",
            "complete_content",
            "archive_content",
            "rename_thread",
            "set_thread_preference",
        }:
            return {"ok": True, "done": True}
        # The three answering reads.
        thread_id = args.get("thread_id")
        rows = _rows_for(fx, thread_id)
        named = _thread(fx, thread_id)
        return {
            "ok": True,
            "result": {
                "threadId": thread_id,
                "threadName": named.name
                if named
                else (rows[0].get("threadName") if rows else None),
                "truncated": bool(fx.get("truncated")),
                "rows": rows,
            },
        }

    def _look_up(self, args: dict) -> dict:
        """The real bounds, then a plausible result, so a case exercises the
        ordinary path. A stub that always succeeds hid the flagship case of
        016; a stub that always fails made every reply a self-diagnosis."""
        self.looked.append(args)
        question = (args.get("question") or "").strip()
        url = (args.get("url") or "").strip()
        if question and not _from_the_dump(question, self.dump, self.country):
            self.refused_bound.append(question)
            return {
                "ok": False,
                "declined": True,
                "error": (
                    "ask using only the words they dumped, plus their country. "
                    "no dates you worked out, no extra clauses. try a shorter query."
                ),
            }
        if url and not _in_the_dump(url, self.dump):
            self.refused_bound.append(url)
            return {"ok": False, "declined": True, "error": "that url is not in what they dumped"}
        override = self.fx.get("lookup_result")
        kind = "read" if url else "search"
        if override is not None and override.get("found") is False:
            self.budget.record(label="other", kind=kind, outcome="empty")
            return {"ok": True, "found": False}
        self.budget.record(label="other", kind=kind, outcome="used")
        if override is not None:
            return {
                "ok": True,
                "found": True,
                "fields": dict(override.get("fields") or {}),
                "sources": override.get("sources") or ["example.com"],
            }
        wanted = args.get("want") or ["fact"]
        return {
            "ok": True,
            "found": True,
            "fields": {name: _STUB_FIELD.get(name, "something") for name in wanted},
            "sources": ["example.com"],
        }


# ---------------------------------------------------------------------------
# Checks


@dataclass
class Result:
    case: Case
    reply: str
    transcript: str
    mechanical: list[str]
    judged: bool
    judge_note: str
    skipped: str | None = None
    #: With --runs, how many attempts passed out of how many.
    passes_of: tuple[int, int] | None = None
    #: Dollars this attempt cost, every model call included.
    cost: float = 0.0

    @property
    def passed(self) -> bool:
        return not self.mechanical and self.judged


_BANNED_STEP = (
    "google",
    "bing",
    "brave",
    "anthropic",
    "claude",
    "openai",
    "perplexity",
    "duckduckgo",
    "look_up",
    "web_search",
    "web search",
    "searching the web",
    "search tool",
    "fetching",
    "api",
    "http",
    "url",
    "endpoint",
    "querying",
    "sorry",
    "unfortunately",
    "seems to be down",
)
_STEP_CAP = 80
# Built from code points so the pre-commit gate, which refuses the characters
# themselves anywhere in the repo, can read this file.
_EM_DASH = chr(0x2014)
_EN_DASH = chr(0x2013)

# Words a reply may never contain, whoever wrote the case. 017's list for the
# progress line, and the copy rules the product holds itself to at runtime.
_NEVER_IN_A_REPLY = (
    "seems to be down",
    "try again later",
    "as an ai",
    "language model",
    "i apologize",
    "i apologise",
)
_LOOKUP_TALK = (
    "could not find",
    "couldn't find",
    "could not pin",
    "couldn't pin",
    "the sources",
    "what came back",
    "i looked",
    "i searched",
    "search result",
)


def _step_problems(line: str) -> list[str]:
    if not line:
        return []
    problems: list[str] = []
    low = line.lower()
    problems.extend(f"step says {w!r}: {line!r}" for w in _BANNED_STEP if w in low)
    for phrase in ("payment failed", "verify your card", "system:", "click here"):
        if phrase in low:
            problems.append(f"step repeats injected text {phrase!r}: {line!r}")
    if len(line) > _STEP_CAP:
        problems.append(f"step is {len(line)} characters, cap is {_STEP_CAP}: {line!r}")
    if _EM_DASH in line or _EN_DASH in line:
        problems.append(f"step has a dash: {line!r}")
    return problems


_EMOJI = re.compile("[\U0001f300-\U0001faff☀-➿]")
_THING = re.compile(r"\b(things?|contents?|items?)\b", re.IGNORECASE)


def _copy_problems(text: str) -> list[str]:
    """The rules every runtime string is held to, on every case."""
    if not text:
        return []
    problems: list[str] = []
    if _EM_DASH in text or _EN_DASH in text:
        problems.append(f"has a dash: {text!r}")
    if _EMOJI.search(text):
        problems.append(f"has an emoji: {text!r}")
    if re.search(r"(^|[.!?]\s+)Offload\b", text):
        problems.append(f"capitalised offload: {text!r}")
    low = text.lower()
    for phrase in _NEVER_IN_A_REPLY:
        if phrase in low:
            problems.append(f"says {phrase!r}: {text!r}")
    return problems


def _match_filing(matcher: dict, calls: list[tuple[str, dict]], fx: dict) -> str | None:
    """Does any filing call satisfy this matcher. None means yes; otherwise
    the reason it did not, for the report."""
    threads = {t.id: t.name for t in _threads(fx)}
    candidates = []
    for tool, args in calls:
        if matcher.get("tool") and tool != matcher["tool"]:
            continue
        if not matcher.get("tool") and tool not in {"add_content", "add_note", "create_thread"}:
            continue
        candidates.append((tool, args))
    if not candidates:
        return f"no call matches tool {matcher.get('tool') or 'a filing'}"

    def fits(tool: str, args: dict) -> bool:
        if "type" in matcher and args.get("type") != matcher["type"]:
            return False
        if "type_any" in matcher and args.get("type") not in matcher["type_any"]:
            return False
        if "thread" in matcher:
            name = threads.get(str(args.get("thread_id") or ""))
            if name is None and str(args.get("thread_id")) == "new":
                name = "new"
            if (name or "").lower() != matcher["thread"].lower():
                return False
        if "thread_not" in matcher:
            name = threads.get(str(args.get("thread_id") or ""), "")
            if name.lower() == matcher["thread_not"].lower():
                return False
        if "thread_id" in matcher and str(args.get("thread_id")) != matcher["thread_id"]:
            return False
        text = " ".join(str(args.get(k) or "") for k in ("title", "text", "name", "body"))
        for needle in matcher.get("has", []):
            if needle.lower() not in text.lower():
                return False
        for needle in matcher.get("lacks", []):
            if needle.lower() in text.lower():
                return False
        when = str(args.get("occurs_at") or args.get("due_at") or "")
        if "date" in matcher and not when.startswith(matcher["date"]):
            return False
        if "date_any" in matcher and not any(when.startswith(d) for d in matcher["date_any"]):
            return False
        if "priority_min" in matcher and (args.get("priority") or 50) < matcher["priority_min"]:
            return False
        if matcher.get("no_date") and when:
            return False
        # 023. A rule is matched by its parts: every part the case names must
        # be in the rule the model wrote, so "every Tuesday" may arrive as
        # FREQ=WEEKLY or FREQ=WEEKLY;BYDAY=TU and both are the weekly rule.
        if "rrule" in matcher:
            parts = set((args.get("rrule") or "").upper().split(";"))
            if not all(part.upper() in parts for part in matcher["rrule"]):
                return False
        if matcher.get("no_rrule") and args.get("rrule"):
            return False
        if "url" in matcher and args.get("url") != matcher["url"]:
            return False
        if "reminder" in matcher and bool(args.get("is_reminder")) != matcher["reminder"]:
            return False
        for key in ("priority",):
            if key in matcher and args.get(key) != matcher[key]:
                return False
        # 020. Which photo the row is, by its number.
        if "photo" in matcher and args.get("photo") != matcher["photo"]:
            return False
        if matcher.get("no_photo") and args.get("photo"):
            return False
        # And what the body carries, for the transcription rules: a digit run
        # a passport must not leak, a line a screenshot must.
        body = str(args.get("body") or "")
        for needle in matcher.get("body_has", []):
            if needle.lower() not in body.lower():
                return False
        return not (matcher.get("body_no_digits") and re.search(r"\d{4,}", body))

    for tool, args in candidates:
        if fits(tool, args):
            return None
    return f"no filing fits {json.dumps(matcher)}; filed {_filed_summary(calls, fx)}"


def _filed_summary(calls: list[tuple[str, dict]], fx: dict) -> list[str]:
    threads = {t.id: t.name for t in _threads(fx)}
    out = []
    for tool, args in calls:
        if tool in {"add_content", "add_note", "create_thread"}:
            what = args.get("title") or args.get("text") or args.get("name") or ""
            when = args.get("occurs_at") or args.get("due_at") or ""
            where = threads.get(str(args.get("thread_id") or ""), args.get("thread_id"))
            kind = args.get("type") or ("note" if tool == "add_note" else "thread")
            rep = f" {args['rrule']}" if args.get("rrule") else ""
            out.append(f"{kind}({what!r} in {where}{' @' + str(when) if when else ''}{rep})")
    return out


def _asked_problems(expect: dict, questions: list[dict]) -> list[str]:
    if "asks" not in expect:
        return []
    asks = expect["asks"]
    wanted = [] if asks in ("none", None) else [f.strip() for f in asks.split(",")]
    got = [str(q.get("field")) for q in questions]
    if got != wanted:
        offered = [[o.get("value") for o in q.get("options", [])] for q in questions]
        return [f"asked {got} with {offered}, wanted {wanted}"]
    if "options" in expect and questions:
        values = [o.get("value") for o in questions[0].get("options", [])]
        for value in expect["options"]:
            if value not in values:
                return [f"options {values} lack {value!r}"]
    if expect.get("no_options") and questions and questions[0].get("options"):
        return [f"offered options {questions[0].get('options')} where none exist to offer"]
    if "option_count" in expect and questions:
        n = len(questions[0].get("options", []))
        if n != expect["option_count"]:
            return [f"offered {n} options, wanted {expect['option_count']}"]
    return []


def _say_problems(expect: dict, reply: str) -> list[str]:
    problems: list[str] = []
    for banned in expect.get("say_not", []):
        if reply.strip() == banned:
            problems.append(f"said {banned!r}, which is the wrong line here")
    if "say" not in expect:
        return problems
    want = expect["say"]
    if want is None:
        return problems + (
            [f"said {reply!r} and should have said nothing"] if reply.strip() else []
        )
    if isinstance(want, str):
        return problems + (
            [] if reply.strip() == want else [f"said {reply!r}, wanted exactly {want!r}"]
        )
    if not reply.strip():
        return ["said nothing and should have said something"]
    low = reply.lower()
    for needle in want.get("contains", []):
        if needle.lower() not in low:
            problems.append(f"reply lacks {needle!r}: {reply!r}")
    for needle in want.get("must_not_contain", []):
        if needle.lower() in low:
            problems.append(f"reply contains {needle!r}: {reply!r}")
    if "max_words" in want and len(reply.split()) > want["max_words"]:
        problems.append(f"{len(reply.split())} words, cap is {want['max_words']}")
    return problems


def _reply_problems(expect: dict, reply: str) -> list[str]:
    """The answering surface's mechanical checks, legacy shape."""
    problems = []
    if "reply" in expect:
        want = expect["reply"]
        if reply.strip() != want:
            problems.append(f"replied {reply!r}, wanted exactly {want!r}")
    low = reply.lower()
    for needle in expect.get("must_not_contain", []):
        if needle.lower() in low:
            problems.append(f"contains {needle!r}")
    for needle in expect.get("contains", []):
        if needle.lower() not in low:
            problems.append(f"lacks {needle!r}")
    if "max_words" in expect and len(reply.split()) > expect["max_words"]:
        problems.append(f"{len(reply.split())} words, cap is {expect['max_words']}")
    return problems


def _args_fit(want: dict, args: dict) -> bool:
    return all(str(args.get(k)) == str(v) for k, v in want.items())


def _call_problems(expect: dict, calls: list[tuple[str, dict]]) -> list[str]:
    names = [t for t, _ in calls]
    problems = []
    for tool in expect.get("not_called", []):
        if tool in names:
            problems.append(f"called {tool} and should not have")
    for tool in expect.get("called", []):
        if tool not in names:
            problems.append(f"did not call {tool}")
    for tool, n in (expect.get("call_count") or {}).items():
        if names.count(tool) != n:
            problems.append(f"called {tool} {names.count(tool)} times, wanted {n}")
    for first, then in expect.get("before", []):
        if first not in names or then not in names:
            problems.append(f"expected {first} then {then}; calls were {names}")
        elif names.index(first) > names.index(then):
            problems.append(f"{then} came before {first}")
    for want in expect.get("calls_with", []):
        if not any(t == want["tool"] and _args_fit(want.get("args", {}), a) for t, a in calls):
            shown = [
                (t, {k: a.get(k) for k in want.get("args", {})})
                for t, a in calls
                if t == want["tool"]
            ]
            problems.append(f"no {want['tool']} call with {want.get('args')}; had {shown}")
    for want in expect.get("calls_with_none", []):
        if any(t == want["tool"] and _args_fit(want.get("args", {}), a) for t, a in calls):
            problems.append(f"called {want['tool']} with {want.get('args')} and should not have")
    return problems


def _came_back(tool: str, body: dict | None) -> str:
    """What a call came back as, when that changes what may be said."""
    if not isinstance(body, dict):
        return ""
    if not body.get("ok"):
        return f"  -> refused: {body.get('error')}"
    if tool in {"create_event", "edit_event", "delete_event"}:
        if body.get("waitingForThem"):
            return f"  -> held for the person's go-ahead, not written: {body.get('because')}"
        if body.get("asked"):
            return "  -> not written; the server will ask which calendar"
        if body.get("noCalendar"):
            return "  -> not written; no calendar to write to"
        return "  -> written"
    if tool == "find_events":
        titles = [e.get("title") for e in body.get("events", []) if isinstance(e, dict)]
        return f"  -> events: {titles}"
    if tool == "share_thread":
        if body.get("waitingForThem"):
            return f"  -> put to the person to confirm, not shared: {body.get('because')}"
        if body.get("asked"):
            return "  -> not shared; the server asked which person"
    return ""


def _transcript(
    calls: list[tuple[str, dict]],
    reply: str,
    questions: list[dict],
    results: list[dict] | None = None,
) -> str:
    lines = []
    for i, (tool, args) in enumerate(calls):
        shown = {k: v for k, v in args.items() if v not in (None, [], "", 50)}
        back = _came_back(tool, results[i]) if results and i < len(results) else ""
        lines.append(f"{tool}({json.dumps(shown, ensure_ascii=False)}){back}")
    for q in questions:
        lines.append(
            f"ask(field={q.get('field')}, options={[o.get('value') for o in q.get('options', [])]})"
        )
    lines.append(f"say: {reply!r}" if reply else "say: nothing")
    return "\n".join(lines)


def _because_problems(expect: dict, outcome: Any) -> list[str]:
    if "because" not in expect:
        return []
    got = getattr(outcome, "because", None)
    if got != expect["because"]:
        return [f"say gave reason {got!r}, wanted {expect['because']!r}"]
    return []


# ---------------------------------------------------------------------------
# The judge


_JUDGE = """You are marking one turn of an assistant called offload against a rubric.

Answer only with a tool call. The rubric is the whole standard, in both
directions: a turn that is pleasant but breaks it fails, and a turn is never
failed for something the rubric does not name. Not the wording, not what you
would have done, and not the hour in a time stamp unless the rubric names one:
moments are written in UTC and the person is in Lisbon, where the clock is one
hour ahead in September, so 3pm there is 14:00Z, and only a rubric that says
which hour makes an hour a fault. Read the transcript as the record of what
offload actually did: each line is a tool it called with the arguments it
sent, and an arrow
after a call is what the server answered. A calendar write "held for the
person's go-ahead" has not been written: saying it is waiting is true and
saying it is done is false. The last line is what it said to the person, or
that it said nothing. Saying nothing is how this product reports a turn that
did what was asked: the person's message wears a Done mark and a link to
every thread written to, so a turn that filed something and said nothing has
told them everything, and silence is never by itself misleading. "Filed" means
put in a thread, never put on a calendar.

What the person sent:
{question}

What offload did and said:
{transcript}

The rubric:
{rubric}"""


async def _judge(client: AsyncAnthropic, case: Case, transcript: str) -> tuple[bool, str]:
    response = await client.messages.create(
        model=EVAL_JUDGE_MODEL,
        max_tokens=300,
        messages=[
            {
                "role": "user",
                "content": _JUDGE.format(
                    question=json.dumps(case.input, ensure_ascii=False)
                    if not isinstance(case.input, str)
                    else case.input,
                    transcript=transcript,
                    rubric=case.expect["rubric"],
                ),
            }
        ],
        tools=[
            {
                "name": "mark",
                "description": "Say whether the turn meets the rubric.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "meets": {"type": "boolean"},
                        "why": {
                            "type": "string",
                            "description": (
                                "One short clause. What it did wrong, or what it got right."
                            ),
                        },
                    },
                    "required": ["meets", "why"],
                },
            }
        ],
        tool_choice={"type": "tool", "name": "mark"},
    )
    _spent.append(_usage_cost(response, EVAL_JUDGE_MODEL))
    for block in response.content:
        if block.type == "tool_use" and isinstance(block.input, dict):
            return bool(block.input.get("meets")), str(block.input.get("why", ""))
    return False, "judge did not answer"


def _usage_cost(response: Any, model: str) -> float:
    usage = getattr(response, "usage", None)
    return _cost(
        model,
        getattr(usage, "input_tokens", 0) or 0,
        getattr(usage, "output_tokens", 0) or 0,
        getattr(usage, "cache_read_input_tokens", 0) or 0,
    )


def _outcome_cost(outcome: Any) -> float:
    return sum(
        _cost(u.model, u.input_tokens, u.output_tokens, u.cache_read_tokens)
        for u in getattr(outcome, "usage", [])
    )


#: The judge's spend, collected here because `_judge` returns a verdict and
#: threading a third value through every caller is noisier than a list.
_spent: list[float] = []


# ---------------------------------------------------------------------------
# Surfaces


PHOTO_FIXTURES = Path(__file__).parent / "fixtures" / "photos"


def _photos(fx: dict) -> list[Photo]:
    """The case's photos, by file name under `fixtures/photos/`, through the
    same rendition code the worker runs, so the model sees what it would."""
    names = fx.get("photos") or []
    out: list[Photo] = []
    for at, name in enumerate(names):
        made = make((PHOTO_FIXTURES / name).read_bytes())
        out.append(Photo(blob_id=f"photo-{at + 1}", index=at + 1, large=made.large))
    return out


async def _run_file(client: AsyncAnthropic, case: Case, model: str) -> Result:
    fx = case.fixture
    dump = str(case.input)
    rec = Recorder(case, dump)
    threads = _threads(fx)
    default = next((t for t in threads if t.is_default), threads[-1] if threads else None)
    ctx = DumpContext(
        dump=dump,
        turns=[Turn(role=t["role"], text=t["text"]) for t in fx.get("history") or []],
        threads=threads,
        landed=[],
        default_thread_id=default.id if default else None,
        today=fx.get("today") or TODAY,
        time_zone=fx.get("time_zone", TIME_ZONE),
        has_calendar=bool(fx.get("has_calendar")),
        has_connections=bool(fx.get("has_connections")),
        may_search=fx.get("may_search", True),
        may_read_links=fx.get("may_read_links", True),
        country=rec.country,
        looking_at=_thread(fx, fx.get("looking_at")),
        labels=[
            LabelRef(id=str(one["id"]), thread_id=str(one["threadId"]), name=str(one["name"]))
            for one in fx.get("labels") or []
        ],
        answered=fx.get("answered"),
        # 020. The photos, as the worker would hand them over: the large
        # rendition of each fixture, made by the real rendition code.
        photos=_photos(fx),
    )
    try:
        outcome = await plan(client, ctx, model, rec)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    # What the worker does to the outcome before anyone sees it.
    _author_the_failure_line(outcome, rec.budget)

    reply = outcome.reply or ""
    expect = case.expect
    failures: list[str] = []
    failures.extend(_asked_problems(expect, outcome.questions))
    failures.extend(_say_problems(expect, reply))
    failures.extend(_because_problems(expect, outcome))
    failures.extend(_call_problems(expect, rec.calls))
    failures.extend(_copy_problems(reply))
    low = reply.lower()
    for needle in expect.get("must_not_contain", []):
        if needle.lower() in low:
            failures.append(f"reply contains {needle!r}: {reply!r}")
    if reply and _THING.search(reply):
        failures.append(f"reply uses thing or content as a noun: {reply!r}")
    if outcome.questions and reply.strip() and "say" not in expect:
        failures.append(f"said {reply!r} alongside a question, and a question is never explained")
    for needle in expect.get("transcript_must_not_contain", []):
        if needle.lower() in _transcript(rec.calls, reply, outcome.questions).lower():
            failures.append(f"the transcript carries {needle!r}")
    if expect.get("step_present") and not any((a.get("doing") or "").strip() for a in rec.looked):
        failures.append("no progress line was written on the lookup")
    queries = " ".join(
        (a.get("question") or "") + " " + (a.get("url") or "") for a in rec.looked
    ).lower()
    for needle in expect.get("query_must_not_contain", []):
        if needle.lower() in queries:
            failures.append(f"a query carried {needle!r}: {queries!r}")
    edits = {
        str(a.get("content_id")): str(a.get("title"))
        for t, a in rec.calls
        if t == "edit_content" and a.get("title")
    }
    # A title as it ends up: the add, overwritten by an edit naming the id the
    # stub handed back.
    ended = [edits.get(cid, title) for cid, title in rec.content_titles.items()]
    if "final_title_max_words" in expect:
        for title in ended:
            if len(title.split()) > expect["final_title_max_words"]:
                failures.append(
                    f"title ended as {title!r}, over {expect['final_title_max_words']} words"
                )
    if "final_title_min_words" in expect:
        for title in ended:
            if len(title.split()) < expect["final_title_min_words"]:
                failures.append(
                    f"title ended as {title!r}, under {expect['final_title_min_words']} words"
                )

    filed = _filed_summary(rec.calls, fx)
    if "filed" in expect:
        want = expect["filed"]
        if want == "none" and filed:
            failures.append(f"filed {filed} and should have filed nothing")
        elif isinstance(want, int) and len(filed) != want:
            failures.append(f"filed {len(filed)}, wanted {want}: {filed}")
        elif isinstance(want, list):
            for matcher in want:
                problem = _match_filing(matcher, rec.calls, fx)
                if problem:
                    failures.append(problem)
    if "filed_count" in expect and len(filed) != expect["filed_count"]:
        failures.append(f"filed {len(filed)}, wanted {expect['filed_count']}: {filed}")
    if "filed_max" in expect and len(filed) > expect["filed_max"]:
        failures.append(f"filed {len(filed)}, wanted at most {expect['filed_max']}: {filed}")
    # Rows that must not exist, in the same matcher shape as `filed`.
    for matcher in expect.get("not_filed", []):
        if _match_filing(matcher, rec.calls, fx) is None:
            failures.append(f"filed a row that fits {matcher} and should not have: {filed}")
    if expect.get("files_something") and not any(
        t in {"add_content", "add_note"} for t, _ in rec.calls
    ):
        failures.append(f"filed nothing; calls were {[t for t, _ in rec.calls]}")
    if "creates_thread" in expect:
        made = any(t == "create_thread" for t, _ in rec.calls)
        if made != expect["creates_thread"]:
            failures.append("created a thread" if made else "did not create a thread")

    if expect.get("look_up") is True and not rec.looked:
        failures.append("should have looked something up and did not")
    if expect.get("look_up") is False and rec.looked:
        failures.append(f"looked something up and should not have: {rec.looked}")
    if rec.refused_bound:
        failures.append(f"the provenance bound refused: {rec.refused_bound}")
    if expect.get("query_names_country") and rec.looked:
        asked = " ".join((a.get("question") or "") for a in rec.looked).lower()
        wanted = {rec.country.lower() if rec.country else "", (name_of(rec.country) or "").lower()}
        if not any(w and w in asked for w in wanted):
            failures.append(f"the query did not name their country: {asked!r}")
    if rec.looked:
        low = reply.lower()
        failures.extend(
            f"the reply talks about the lookup: {p!r} in {reply!r}"
            for p in _LOOKUP_TALK
            if p in low
        )
        for line in (a.get("doing") or "" for a in rec.looked):
            failures.extend(_step_problems(line))
    if outcome.out_of_calls:
        failures.append("ran out of model calls")
    if outcome.refused:
        failures.append(f"the schema refused a call: {outcome.refused}")
    # A case that makes a tool fail is about the reply, and the worker's
    # partial line covers the rest; an unfinished turn is the expected shape.
    if not outcome.finished and not (expect.get("say") or reply) and not fx.get("fail_tools"):
        failures.append("filed nothing and said nothing")

    transcript = _transcript(rec.calls, reply, outcome.questions, rec.results)
    if outcome.because:
        transcript += f"  (because {outcome.because})"
    judged, note = True, ""
    before = len(_spent)
    if expect.get("rubric") and not failures:
        judged, note = await _judge(client, case, transcript)
    cost = _outcome_cost(outcome) + sum(_spent[before:])
    return Result(case, reply, transcript, failures, judged, note, cost=cost)


async def _run_answer(client: AsyncAnthropic, case: Case, model: str) -> Result:
    fx = case.fixture
    question = str(case.input)
    rec = Recorder(case, question)
    looking_at = fx.get("looking_at")
    ctx = AnswerContext(
        question=question,
        threads=_threads(fx),
        has_calendar=bool(fx.get("has_calendar", fx.get("facts") is not None)),
        may_search=fx.get("may_search", True),
        may_read_links=fx.get("may_read_links", True),
        country=rec.country,
        today=fx.get("today") or TODAY,
        time_zone=fx.get("time_zone", TIME_ZONE),
        turns=[Turn(role=t["role"], text=t["text"]) for t in fx.get("history") or []],
        country_override=fx.get("country_override"),
        looking_at=_thread(fx, looking_at),
        looking_at_notes=[
            n if isinstance(n, str) else n["text"]
            for n in (fx.get("notes") or {}).get(looking_at or "", [])
        ],
    )
    try:
        outcome = await plan_answer(client, ctx, model, rec)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    # What the worker does to the outcome before anyone sees it.
    _author_the_answer_line(outcome, rec.budget)

    reply = outcome.reply or ""
    expect = case.expect
    failures: list[str] = []
    failures.extend(_reply_problems(expect, reply))
    failures.extend(_asked_problems(expect, outcome.questions))
    failures.extend(_call_problems(expect, rec.calls))
    failures.extend(_copy_problems(reply))
    if reply and _THING.search(reply):
        failures.append(f"reply uses thing, item or content as a noun: {reply!r}")
    writes = {
        "add_content",
        "create_thread",
        "edit_content",
        "move_content",
        "complete_content",
        "archive_content",
        "add_note",
        "rename_thread",
        "set_thread_preference",
        "create_event",
        "edit_event",
        "delete_event",
    }
    wrote = [t for t, _ in rec.calls if t in writes]
    if wrote:
        failures.append(f"an answer wrote: {wrote}")
    queries = " ".join(
        (a.get("question") or "") + " " + (a.get("url") or "") for a in rec.looked
    ).lower()
    for needle in expect.get("query_must_not_contain", []):
        if needle.lower() in queries:
            failures.append(f"a query carried {needle!r}: {queries!r}")
    if expect.get("step_present") and not any((a.get("doing") or "").strip() for a in rec.looked):
        failures.append("no progress line was written on the lookup")
    if expect.get("look_up") is True and not rec.looked:
        failures.append("should have looked something up and did not")
    if expect.get("look_up") is False and rec.looked:
        failures.append(f"looked something up and should not have: {rec.looked}")
    if rec.refused_bound:
        failures.append(f"the provenance bound refused: {rec.refused_bound}")
    if expect.get("query_names_country") and rec.looked:
        asked = " ".join((a.get("question") or "") for a in rec.looked).lower()
        wanted = {rec.country.lower() if rec.country else "", (name_of(rec.country) or "").lower()}
        if not any(w and w in asked for w in wanted):
            failures.append(f"the query did not name their country: {asked!r}")
    if rec.looked:
        low = reply.lower()
        failures.extend(
            f"the reply talks about the lookup: {p!r} in {reply!r}"
            for p in _LOOKUP_TALK
            if p in low
        )
        for line in (a.get("doing") or "" for a in rec.looked):
            failures.extend(_step_problems(line))
    asked_back = bool(outcome.questions)
    if not reply and not asked_back:
        failures.append("answered nothing")
    if asked_back and reply.strip():
        failures.append(f"wrote {reply!r} beside a question; the turn ends with no reply")

    transcript = _transcript(rec.calls, reply, outcome.questions)
    judged, note = True, ""
    before = len(_spent)
    if expect.get("rubric") and not failures and not asked_back:
        judged, note = await _judge(client, case, transcript)
    cost = _outcome_cost(outcome) + sum(_spent[before:])
    return Result(case, reply, transcript, failures, judged, note, cost=cost)


async def _run_classify(client: AsyncAnthropic, case: Case, model: str) -> Result:
    try:
        verdict = await classify(client, str(case.input), model)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    routes = "answer" if (verdict.asking and verdict.confident) else "file"
    transcript = f"asking={verdict.asking} confident={verdict.confident} -> {routes}"
    failures = []
    want = case.expect.get("routes")
    if want and routes != want:
        failures.append(f"routed to {routes}, wanted {want} ({transcript})")
    # `classify` returns a verdict and not its usage; a call is about 400
    # tokens in and 30 out, priced as such rather than left at zero.
    return Result(case, routes, transcript, failures, True, transcript, cost=_cost(model, 400, 30))


async def _run_quick_add(client: AsyncAnthropic, case: Case, model: str) -> Result:
    fx = case.fixture
    typed = str(case.input)
    rec = Recorder(case, typed)
    threads = _threads(fx)
    thread = _thread(fx, fx.get("thread_id")) or threads[0]
    ctx = QuickAddContext(
        content_id=fx.get("content_id") or "c0",
        thread_id=thread.id,
        thread_name=thread.name,
        typed=typed,
        notes=[
            n if isinstance(n, str) else n["text"]
            for n in (fx.get("notes") or {}).get(thread.id, [])
        ],
        notes_from_members=[
            n if isinstance(n, str) else n["text"]
            for n in (fx.get("notes_from_members") or {}).get(thread.id, [])
        ],
        pieces=[Piece(title=p["title"], done=bool(p.get("done"))) for p in fx.get("pieces") or []],
        today=fx.get("today") or TODAY,
        time_zone=fx.get("time_zone", TIME_ZONE),
    )
    try:
        outcome = await plan_quick_add(client, ctx, model, rec)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")

    expect = case.expect
    failures: list[str] = []
    failures.extend(_call_problems(expect, rec.calls))
    for tool, args in rec.calls:
        if tool == "add_content" and str(args.get("thread_id")) != thread.id:
            failures.append(f"added to another thread: {args.get('thread_id')}")
        if tool == "edit_content" and str(args.get("content_id")) != ctx.content_id:
            failures.append(f"edited a row it was not given: {args.get('content_id')}")
        # 019 gave edit_content a time for the filing turn; a quick add still
        # leaves the day it arrived with alone, and sends none of its own.
        if tool == "edit_content" and any(
            args.get(k) for k in ("due_at", "occurs_at", "occurs_end_at")
        ):
            failures.append("set a date on a quick add, which keeps the day it arrived with")
        if tool not in {"edit_content", "add_content"}:
            failures.append(f"called {tool}, which a quick add cannot")
        for key in ("title", "body"):
            failures.extend(_copy_problems(str(args.get(key) or "")))
    # An edit that sets the title to what was typed and nothing else changed
    # nothing, and is read as leaving the row alone.
    edits = [
        args
        for t, args in rec.calls
        if t == "edit_content"
        and not (
            args.get("title") == typed
            and not any(args.get(k) for k in ("body", "url", "image_url"))
        )
    ]
    adds = [args for t, args in rec.calls if t == "add_content"]
    if expect.get("untouched") and (edits or adds):
        failures.append(f"changed a row that was already right: {_transcript(rec.calls, '', [])}")
    if "edit" in expect:
        want = expect["edit"]
        if not edits:
            failures.append("did not edit the row")
        else:
            got = edits[-1]
            title = str(got.get("title") or "")
            if "title" in want and title != want["title"]:
                failures.append(f"title {title!r}, wanted {want['title']!r}")
            for needle in want.get("title_has", []):
                if needle.lower() not in title.lower():
                    failures.append(f"title {title!r} lacks {needle!r}")
            for needle in want.get("title_lacks", []):
                if needle.lower() in title.lower():
                    failures.append(f"title {title!r} contains {needle!r}")
            if "max_title_words" in want and len(title.split()) > want["max_title_words"]:
                failures.append(
                    f"title is {len(title.split())} words, cap {want['max_title_words']}"
                )
            if "url" in want and got.get("url") != want["url"]:
                failures.append(f"url {got.get('url')!r}, wanted {want['url']!r}")
    for needle in expect.get("title_keeps", []):
        for got in edits:
            title = str(got.get("title") or "")
            if title and needle.lower() not in title.lower():
                failures.append(f"the edit dropped {needle!r}: {title!r}")
    if "adds" in expect:
        want = expect["adds"]
        if isinstance(want, int) and len(adds) != want:
            failures.append(
                f"added {len(adds)} rows, wanted {want}: {[a.get('title') for a in adds]}"
            )
        elif isinstance(want, list):
            for matcher in want:
                problem = _match_filing({"tool": "add_content", **matcher}, rec.calls, fx)
                if problem:
                    failures.append(problem)
    transcript = _transcript(rec.calls, "", [])
    judged, note = True, ""
    before = len(_spent)
    if expect.get("rubric") and not failures:
        judged, note = await _judge(client, case, transcript)
    cost = _outcome_cost(outcome) + sum(_spent[before:])
    return Result(case, "", transcript, failures, judged, note, cost=cost)


async def _run_judge(client: AsyncAnthropic, case: Case, model: str) -> Result:
    fx = case.fixture
    asked = fx.get("question_asked") or {}
    field_name = asked.get("field", "date")
    options = asked.get("options") or []
    today = fx.get("today") or TODAY
    try:
        verdict = await judge_answer(
            client,
            str(case.input),
            field=field_name,
            question=asked.get("text", ""),
            options=options,
            today=today,
            model=model,
        )
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    value = parse_answer(field_name, verdict, options, today)
    transcript = f"answers={verdict.answers} whole={verdict.whole} parsed={value}"
    expect = case.expect
    failures: list[str] = []
    if "answers" in expect:
        got = value is not None
        if got != expect["answers"]:
            failures.append(f"{'answered' if got else 'did not answer'}: {transcript}")
    if expect.get("answers") and value is not None:
        if "whole" in expect and bool(verdict.whole) != expect["whole"]:
            failures.append(f"whole={verdict.whole}, wanted {expect['whole']}")
        for key, want in (expect.get("value") or {}).items():
            if value.get(key) != want:
                failures.append(f"{key}={value.get(key)!r}, wanted {want!r}")
    return Result(
        case, str(value), transcript, failures, True, transcript, cost=_cost(model, 500, 60)
    )


async def _run_compact(client: AsyncAnthropic, case: Case, model: str) -> Result:
    rows = case.input
    fx = case.fixture
    listing = f"Today is {fx.get('today') or TODAY}.\n\n" + compact_mod._lines(rows)
    cfg = Config(
        database_url="",
        api_url="",
        internal_token="",
        anthropic_api_key="",
        sort_model=model,
    )
    try:
        plan_, usage = await compact_mod._ask(client, cfg, listing)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    if plan_ is None:
        return Result(case, "", "", ["no parseable compaction"], False, "")
    # The worker holds two rules in code after the model; so does this.
    plan_ = compact_mod._held_to_the_rules(plan_, rows)
    by_id = {r["id"]: r for r in rows}
    supersede = list(plan_.supersede)
    remove = list(plan_.remove)
    adds = [a.model_dump() for a in plan_.add]
    touched = set(supersede) | set(remove) | {i for a in adds for i in a.get("folded_from", [])}
    transcript = json.dumps(
        {"supersede": supersede, "remove": remove, "add": adds}, ensure_ascii=False
    )
    failures: list[str] = []
    # Structural rules that hold on every case.
    for i in remove:
        if by_id.get(i, {}).get("origin") != "learned":
            failures.append(f"removed {i}, which a person typed")
    for a in adds:
        authors = {by_id[i]["theirs"] for i in a.get("folded_from", []) if i in by_id}
        if len(authors) > 1:
            failures.append(f"a fold mixed two people: {a.get('folded_from')}")
        failures.extend(_copy_problems(str(a.get("text", ""))))
    expect = case.expect
    if expect.get("no_change") and (supersede or remove or adds):
        failures.append(f"changed a tidy set: {transcript}")
    for i in expect.get("never_touches", []):
        if i in touched:
            failures.append(f"touched {i}, which must stand")
    for i in expect.get("supersedes", []):
        if i not in supersede and i not in {x for a in adds for x in a.get("folded_from", [])}:
            failures.append(f"left {i} standing, and it has stopped being true")
    if "adds" in expect and len(adds) != expect["adds"]:
        failures.append(f"added {len(adds)} notes, wanted {expect['adds']}: {transcript}")
    if "folds" in expect:
        want = set(expect["folds"])
        if not any(want <= set(a.get("folded_from", [])) for a in adds):
            failures.append(f"did not fold {sorted(want)} into one note: {transcript}")
    judged, note = True, ""
    before = len(_spent)
    if expect.get("rubric") and not failures:
        legend = (
            "Each note line is: id | date written | who wrote it (you means the "
            "thread's owner, someone else means another member) | whether offload "
            "wrote it or a person typed it | the text. The answer lists ids to "
            "supersede (set aside, kept as history), ids to remove, and new notes "
            "each naming the ids it folds."
        )
        judged, note = await _judge(
            client, case, legend + "\n\nnotes:\n" + listing + "\n\nanswer:\n" + transcript
        )
    cost = sum(
        _cost(
            u.get("model", model),
            u.get("inputTokens", 0),
            u.get("outputTokens", 0),
            u.get("cacheReadTokens", 0),
        )
        for u in usage
    ) + sum(_spent[before:])
    return Result(case, "", transcript, failures, judged, note, cost=cost)


_SURFACES = {
    "file": _run_file,
    "answer": _run_answer,
    "classify": _run_classify,
    "quick_add": _run_quick_add,
    "judge": _run_judge,
    "compact": _run_compact,
}


async def _run_one(
    client: AsyncAnthropic, case: Case, gate: asyncio.Semaphore, overrides: dict[str, str]
) -> Result:
    runner = _SURFACES.get(case.surface)
    if runner is None:
        return Result(case, "", "", [f"unknown surface {case.surface!r}"], False, "")
    model = overrides.get(case.surface) or MODELS[case.surface]
    async with gate:
        try:
            return await runner(client, case, model)
        except Exception as exc:  # noqa: BLE001
            # A harness fault in one case is that case's failure, never the
            # run's: the first full run died on an empty thread list.
            return Result(case, "", "", [f"harness raised {type(exc).__name__}: {exc}"], False, "")


# ---------------------------------------------------------------------------
# Reporting


def _majority(attempts: list[Result], cases: list[Case], runs: int) -> list[Result]:
    """One result per case from N attempts: passed when most attempts passed.

    The reported result is the first failing attempt when the case failed,
    so the transcript printed is one that shows the failure, and the first
    passing one otherwise. `passes_of` rides on the case for the record.
    """
    if runs == 1:
        return attempts
    per_case: dict[str, list[Result]] = {}
    for r in attempts:
        per_case.setdefault(f"{r.case.principle}/{r.case.id}", []).append(r)
    out: list[Result] = []
    for c in cases:
        mine = per_case[f"{c.principle}/{c.id}"]
        passes = sum(1 for r in mine if r.passed)
        passed = passes * 2 > runs
        shown = next((r for r in mine if r.passed == passed), mine[0])
        shown.passes_of = (passes, runs)
        out.append(shown)
    return out


def _select(principles: list[Principle], args: argparse.Namespace) -> list[tuple[Principle, Case]]:
    picked: list[tuple[Principle, Case]] = []
    for p in principles:
        if args.principle:
            key = args.principle
            if not (
                key == str(p.number)
                or key == f"{p.number:02d}"
                or key == p.slug
                or key in p.path.stem
            ):
                continue
        for c in p.cases:
            if args.surface and c.surface != args.surface:
                continue
            if args.case and c.id != args.case:
                continue
            if c.label_pending and not args.include_pending:
                continue
            if c.live and not args.live:
                continue
            picked.append((p, c))
    return picked


def _print_list(principles: list[Principle]) -> None:
    total = 0
    for p in principles:
        pending = sum(1 for c in p.cases if c.label_pending)
        by_surface = {}
        for c in p.cases:
            by_surface[c.surface] = by_surface.get(c.surface, 0) + 1
        surfaces = ", ".join(f"{k} {v}" for k, v in sorted(by_surface.items()))
        print(f"{p.number:02d}  {p.slug}")
        print(f"    {p.statement}")
        tail = f", {pending} pending a label" if pending else ""
        print(f"    {len(p.cases)} cases ({surfaces}){tail}")
        total += len(p.cases)
    print(f"\n{len(principles)} principles, {total} cases")


def _table(results: list[Result], principles: list[Principle]) -> list[dict]:
    rows = []
    for p in principles:
        mine = [r for r in results if r.case.principle == p.path.stem]
        if not mine:
            continue
        passed = sum(1 for r in mine if r.passed)
        rows.append(
            {
                "principle": f"{p.number:02d} {p.slug}",
                "statement": p.statement,
                "passed": passed,
                "total": len(mine),
                "accuracy": round(passed / len(mine), 3),
                "failed": [r.case.id for r in mine if not r.passed],
            }
        )
    return rows


def _prompt_hash() -> str:
    """Which prompts a run measured, as eight hex characters, so two rows in
    the history can be told apart without reading the diff."""
    import hashlib

    digest = hashlib.sha256()
    prompts = HERE.parent / "src" / "offload_agent" / "prompts"
    for path in sorted(prompts.glob("*.md")):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:8]


def _git_rev() -> str:
    import subprocess

    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=HERE,
        )
        return out.stdout.strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def record_history(record: dict, note: str = "") -> None:
    """Append one line to the committed history and rewrite the table."""
    by_principle = {
        r["principle"].split()[0]: [r["passed"], r["total"]] for r in record["principles"]
    }
    row = {
        "when": record["when"],
        "scope": record["scope"],
        "runs": record.get("runs", 1),
        "total": record["total"],
        "passed": record["passed"],
        "accuracy": record["accuracy"],
        "cost_usd": record.get("cost_usd"),
        "models": record["models"],
        "prompts": record.get("prompts") or _prompt_hash(),
        "commit": record.get("commit") or _git_rev(),
        "principles": by_principle,
        "note": note,
    }
    with HISTORY.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    write_history_md()


def _stamp(when: str) -> str:
    return f"{when[:4]}-{when[4:6]}-{when[6:8]} {when[9:11]}:{when[11:13]}"


def write_history_md() -> None:
    text = HISTORY.read_text(encoding="utf-8")
    rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    lines = [
        "# Run history",
        "",
        "Every eval run, oldest first. Appended by `evals/run.py`; regenerate this table",
        "from `history.jsonl` rather than editing it. `results/` holds the transcripts",
        "and is not committed.",
        "",
        "| When | Scope | Runs | Passed | Cost | File model | Prompts | Commit | Note |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        cost = f"${r['cost_usd']:.2f}" if r.get("cost_usd") is not None else ""
        score = f"{r['passed']}/{r['total']} ({r['accuracy']:.0%})"
        model = r["models"].get("file", "")
        lines.append(
            f"| {_stamp(r['when'])} | {r['scope']} | {r['runs']} | {score} | {cost} "
            f"| `{model}` | `{r['prompts']}` | `{r['commit']}` | {r.get('note', '')} |"
        )
    full = [r for r in rows if r["scope"] == "all"]
    if len(full) >= 2:
        heads = " | ".join(_stamp(r["when"]) for r in full)
        lines += [
            "",
            "## Full runs by principle",
            "",
            f"| # | {heads} |",
            "| --- |" + " --- |" * len(full),
        ]
        keys = sorted({k for r in full for k in r["principles"]})
        for k in keys:
            cells = []
            for r in full:
                v = r["principles"].get(k)
                cells.append(f"{v[0]}/{v[1]}" if v else "")
            lines.append(f"| {k} | " + " | ".join(cells) + " |")
    HISTORY_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_baseline(rows: list[dict], results: list[Result], models: dict[str, str]) -> Path:
    out = HERE / "BASELINE.md"
    total = sum(r["total"] for r in rows)
    passed = sum(r["passed"] for r in rows)
    lines = [
        "# Baseline",
        "",
        f"Written by `evals/run.py --write-baseline` on {datetime.now():%Y-%m-%d}.",
        "Regenerate it rather than editing it.",
        "",
        f"**{passed}/{total} = {passed / total:.0%}** across {len(rows)} principles, "
        f"about ${sum(r.cost for r in results):.2f}.",
        "",
        "Models: " + ", ".join(f"{k} `{v}`" for k, v in sorted(models.items())) + ".",
        "",
        "| # | Principle | Passed | Failing cases |",
        "| --- | --- | --- | --- |",
    ]
    for r in rows:
        failing = ", ".join(f"`{f}`" for f in r["failed"]) or ""
        number = r["principle"].split()[0]
        lines.append(f"| {number} | {r['statement']} | {r['passed']}/{r['total']} | {failing} |")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out


def _load_env() -> None:
    """The environment the suite loads, loaded the same way.

    `.env` at the repo root holds the key, and the tests' loader is the one
    parser in this app that reads it correctly, multi-line values included.
    Importing it runs it. A value already in the environment wins.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import tests.conftest  # noqa: F401


async def main() -> int:
    _load_env()
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--principle", help="number or slug")
    parser.add_argument("--surface", choices=sorted(_SURFACES))
    parser.add_argument("--case", help="one case id")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--include-pending", action="store_true")
    parser.add_argument(
        "--live", action="store_true", help="also run cases that reach the real web"
    )
    parser.add_argument("--write-baseline", action="store_true")
    parser.add_argument(
        "--model", action="append", default=[], help="surface=model, to try another model"
    )
    parser.add_argument("--concurrency", type=int, default=CONCURRENCY)
    parser.add_argument("--note", help="one line for the history, what this run was for")
    parser.add_argument(
        "--runs",
        type=int,
        default=1,
        help="run every case this many times and score it on its majority",
    )
    parser.add_argument(
        "--holdout",
        help="a case file in the same shape, run on its own; see /test-llm",
    )
    args = parser.parse_args()

    contexts = _load_contexts()
    principles = load_principles(contexts, [Path(args.holdout)] if args.holdout else None)

    if args.list:
        _print_list(principles)
        return 0

    picked = _select(principles, args)
    if not picked:
        print("nothing selected")
        return 2
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set. This calls the real model.")
        return 2

    overrides = dict(kv.split("=", 1) for kv in args.model)
    models = {s: overrides.get(s, m) for s, m in MODELS.items()}
    print(
        f"{len(picked)} cases, models: " + ", ".join(f"{k}={v}" for k, v in sorted(models.items()))
    )

    # More retries than the SDK's two: a full run is a quarter of an hour and a
    # network blip in the middle turned 326 cases into connection errors once.
    client = AsyncAnthropic(max_retries=6)
    gate = asyncio.Semaphore(args.concurrency)
    started = time.monotonic()
    # **Majority of N, because a single run moves by four points.** Two full
    # runs an hour apart disagreed on 39 cases in both directions. With three
    # runs a case passes when it passed at least twice, and the record keeps
    # how many times it did, so a case that is flaky is visible as flaky.
    runs = max(1, args.runs)
    attempts = await asyncio.gather(
        *(_run_one(client, c, gate, overrides) for _ in range(runs) for _, c in picked)
    )
    results = _majority(attempts, [c for _, c in picked], runs)
    elapsed = time.monotonic() - started

    rows = _table(results, principles)
    passed = [r for r in results if r.passed]
    accuracy = len(passed) / len(results)
    spent = sum(r.cost for r in attempts)

    RESULTS.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    scope = args.principle or args.surface or args.case or "all"
    record = {
        "when": stamp,
        "scope": scope,
        "models": models,
        "runs": runs,
        "cost_usd": round(spent, 2),
        "prompts": _prompt_hash(),
        "commit": _git_rev(),
        "total": len(results),
        "passed": len(passed),
        "accuracy": round(accuracy, 3),
        "seconds": round(elapsed),
        "principles": rows,
        "cases": [
            {
                "principle": r.case.principle,
                "id": r.case.id,
                "why": r.case.why,
                "surface": r.case.surface,
                "input": r.case.input,
                "passed": r.passed,
                "passes_of": r.passes_of,
                "cost_usd": round(r.cost, 4),
                "mechanical": r.mechanical,
                "judge": r.judge_note,
                "reply": r.reply,
                "transcript": r.transcript,
            }
            for r in results
        ],
    }
    (RESULTS / f"{stamp}-{scope}.json").write_text(
        json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    record_history(record, note=args.note or "")
    if args.write_baseline:
        path = _write_baseline(rows, results, models)
        print(f"wrote {path}")

    if args.json:
        print(json.dumps({k: v for k, v in record.items() if k != "cases"}, indent=2))
        return 0 if accuracy == 1.0 else 1

    print()
    for r in results:
        if r.passed:
            continue
        flaky = f"  passed {r.passes_of[0]} of {r.passes_of[1]}" if r.passes_of else ""
        print(f"[FAIL] {r.case.principle} / {r.case.id}  ({r.case.why}){flaky}")
        print(
            f"       in: {r.case.input!r}"
            if isinstance(r.case.input, str)
            else "       in: <structured>"
        )
        for line in r.transcript.splitlines():
            print(f"       | {line}")
        for f in r.mechanical:
            print(f"       mechanical: {f}")
        if not r.judged:
            print(f"       judge: {r.judge_note}")
        print()

    print(f"{'#':<4}{'principle':<44}{'passed':>8}")
    for row in rows:
        number, name = row["principle"].split(" ", 1)
        print(f"{number:<4}{name:<44}{row['passed']:>4}/{row['total']:<3}")
    where = f"results/{stamp}-{scope}.json"
    print(
        f"\n{len(passed)}/{len(results)} = {accuracy:.0%} in {elapsed:.0f}s, "
        f"about ${spent:.2f}, saved to {where}"
    )
    return 0 if accuracy == 1.0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
