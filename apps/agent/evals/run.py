"""Run the principle evals against the real model and score what comes back.

**This is the harness, never the cases.** A principle file says how offload
behaves and holds the cases that test it; a context file says what an account
holds. This file only knows how to run them and count.

Six surfaces, one per model call the product makes:

- ``file``       a dump through the planner (``plan``)
- ``answer``     a question through the answerer (``plan_answer``)
- ``classify``   question or note (``classify``)
- ``judge``      does a typed message answer the open question (``judge_answer``)
- ``nightly``    one thread's nightly pass (``nightly._ask``)

Each runs the real prompt assembly and the real loop, with every tool answered
from the case's fixture. The Core API is the one dated not exercised: what a
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
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from offload_agent import ledger
from offload_agent import memories as memories_mod
from offload_agent import nightly as nightly_mod
from offload_agent import pdfs as pdfs_mod
from offload_agent.config import Config
from offload_agent.context import (
    AnswerContext,
    DumpContext,
    LabelRef,
    Mail,
    Memory,
    Pdf,
    Photo,
    Thread,
    ThreadNote,
    ThreadNotes,
    Turn,
    mail_of,
)
from offload_agent.countries import name_of
from offload_agent.harness.look import look
from offload_agent.harness.plan import (
    NOT_IN_A_THREAD,
    Usage,
    classify,
    judge_answer,
    plan,
    plan_answer,
)
from offload_agent.harness.thread_icons import THREAD_ICON_NAMES
from offload_agent.renditions import make
from offload_agent.worker import (
    Lookups,
    _author_the_answer_line,
    _declined_if_argument,
    _from_the_dump,
    _in_the_dump,
    _reply_as_sent,
    fit_documents,
    parse_answer,
)

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import noise  # noqa: E402
import spend  # noqa: E402

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
    # 041. The cheap look at an email's pictures and PDF pages.
    "look": _DEFAULTS["look_model"],
    "answer": _DEFAULTS["answer_model"],
    "classify": _DEFAULTS["sort_model"],
    "judge": _DEFAULTS["sort_model"],
    "nightly": _DEFAULTS["nightly_model"],
    # 038.
    "memory": _DEFAULTS["memory_model"],
    "cast-memory": _DEFAULTS["memory_model"],
    "cast-file": _DEFAULTS["model"],
    "cast-answer": _DEFAULTS["answer_model"],
}
# The eval's own judge is a different tier from the answerer on purpose: a
# model marking its own work is the failure this file exists to avoid.
EVAL_JUDGE_MODEL = "claude-sonnet-5"

CONCURRENCY = 10
COUNTRY = "PT"

#: Dollars per million tokens, input and output, from stack.md. A cache read
#: is a tenth of input and a cache write a quarter more than it. Used to price
#: a run so the number is measured rather than guessed at.
PRICES = {
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
    # Up to a 100K prompt; beyond it is $0.50 / $2.50, which nothing here sends.
    "claude-haiku-5-5": (0.1, 0.5),
}


#: A cache read as a share of input: a tenth, except Opus 5.5's twentieth.
#: Sonnet 5.5 reads at $0.20 on $2.00, a tenth. (claude-api skill, 2026-10-06.)
CACHE_READ_SHARE = {"claude-opus-5-5": 0.05}


def _cost(
    model: str, input_tokens: int, output_tokens: int, cache_read: int = 0, cache_write: int = 0
) -> float:
    """Anthropic's input count excludes both cache counts, so nothing is
    subtracted from it; until 2026-10-02 a cache read was, and every run with a
    warm prefix was priced low."""
    price_in, price_out = PRICES.get(model, (5.0, 25.0))
    read_share = CACHE_READ_SHARE.get(model, 0.1)
    cached = cache_read * price_in * read_share + cache_write * price_in * 1.25
    return (input_tokens * price_in + cached + output_tokens * price_out) / 1e6


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
    # 038. What offload knows about them: [{id, kind, text}].
    "memories",
    # 040. No room in Memories: "rules" or "memories".
    "full",
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
    # 2026-10-07. What a search returns beside its rows: the notes and
    # messages the Core API found by words or meaning, [{kind, who,
    # threadName, text}]. Search only; the filters never carry them.
    "asides",
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
    # 041. File names under fixtures/pdfs, attached in order; and for the look
    # surface, the PDFs and photos an email carried.
    "pdfs",
    "look_pdfs",
    "look_photos",
    # 026. A forwarded email: {subject, from_name, from_address, sent_at, note,
    # forwarded}. The dump is built from it through the worker's own `mail_of`.
    "mail",
    # 021. The dump is a voice note's transcript: the label says so and the
    # prompt reads it with its own rules. The input is the transcript's text.
    "spoken",
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
        Thread(
            id=t["id"],
            name=t["name"],
            is_default=t.get("default") in ("yes", True),
            shared=bool(t.get("shared")),
        )
        for t in raw
    ]


def _memories(fx: dict) -> list[Memory]:
    """038. What offload knows about them, from the fixture."""
    return [
        Memory(id=str(m.get("id") or f"mem{n}"), kind=str(m["kind"]), text=str(m["text"]))
        for n, m in enumerate(fx.get("memories") or [], start=1)
    ]


# 038. The Core API's memory gate, mirrored so the stub can refuse what the
# server refuses: `memories/ground.ts`, `memories/shapes.ts` and the turn's
# taint in `routes/tools.ts`. A stub that always remembers tests nothing.
_IGNORED = {
    "they",
    "their",
    "theirs",
    "them",
    "themselves",
    "s",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "a",
    "an",
    "the",
    "of",
    "in",
    "on",
    "at",
    "to",
    "for",
    "with",
    "and",
    "or",
    "as",
    "by",
    "from",
    "it",
    "its",
    "has",
    "have",
    "had",
    "that",
    "this",
    "which",
    "who",
    "what",
    "when",
    "where",
    "call",
    "calls",
    "called",
    "mean",
    "means",
    "always",
    "never",
    "every",
    "everywhere",
    "now",
    "place",
    "one",
    "ones",
}


def _flat(text: str) -> str:
    return re.sub(r"[^\w]+|_", " ", unicodedata.normalize("NFKC", text).lower()).strip()


def _grounded(text: str, said: str) -> bool:
    own = set(_flat(said).split())
    mine = [w for w in _flat(text).split() if w and w not in _IGNORED]
    if not mine or not all(w in own for w in mine if re.search(r"\d", w)):
        return False

    def heard(w: str) -> bool:
        return w in own or (
            len(w) >= 4
            and not re.search(r"\d", w)
            and any(len(o) >= 4 and o[:4] == w[:4] for o in own)
        )

    return sum(heard(w) for w in mine) * 2 >= len(mine)


def _never_holds(text: str) -> bool:
    text = unicodedata.normalize("NFKC", text)
    return bool(
        re.search(r"\d(?:[\s./-]?\d){8,}", text) or re.search(r"\b\d{3}-\d{2}-\d{4}\b", text)
    )


def _asked(said: str, action: str) -> bool:
    """The Core API's `askedToRemember` and `askedToForget`."""
    pattern = (
        r"\b(forget|don'?t remember|stop remembering|no longer remember)\b"
        if action == "forget"
        else r"\b(remember|from now on|keep in mind|don'?t forget)\b"
    )
    return bool(re.search(pattern, unicodedata.normalize("NFKC", said), re.I))


def _rule_grounded(text: str, said: str) -> bool:
    """The Core API's `ruleGrounded`: every word theirs, and an always, a never
    or a from now on in what they said."""
    if not re.search(r"\b(always|never|from now on)\b", said, re.I):
        return False
    own = set(_flat(said).split())
    mine = [w for w in _flat(text).split() if w and w not in _IGNORED]
    return bool(mine) and all(
        w in own or (len(w) >= 4 and any(len(o) >= 4 and o[:4] == w[:4] for o in own)) for w in mine
    )


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


_NO_PLACE = re.compile(
    r"\b(zoom|google meet|meet|teams|webex|whereby|jitsi|online|phone|call|tbc|tbd)\b", re.I
)
_POSSESSIVE = re.compile(
    r"\w['\u2019\u02bc]s\b|\ws['\u2019\u02bc](?=\s|$)|\bcasa d[aeo]s?\s|\bchez\s|\bbei\s", re.I
)
_STREET = re.compile(
    r"^(rua|r\.|avenida|av\.?|travessa|tv\.?|cal\u00e7ada|largo|pra\u00e7a|estrada|street|st\.|"
    r"road|rd\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|way)(\s|$)",
    re.I,
)


def _place_refused(raw: str) -> bool:
    """030. The Core API's `placeQuery`, as far as the stub needs it: what it
    would not send to Google is refused here as `bad_place_name` too."""
    if "\n" in raw or "\r" in raw:
        return True
    q = " ".join(unicodedata.normalize("NFKC", raw).split())
    if not q or len(q) > 120 or any(c.isdigit() for c in q):
        return True
    if "@" in q or "/" in q or q.lower().startswith("www."):
        return True
    if re.search(r"\.[a-z]{2,6}\b", q, re.I):
        return True
    return bool(_POSSESSIVE.search(q) or _STREET.search(q) or _NO_PLACE.search(q))


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


# 025. The Core API's nameInDump, word for word: letters and digits only (an
# underscore splits, as it does there), and a link's words do not count.
# tests/test_label_names.py holds both to evals/fixtures/label-names.json.
_LABEL_LINK = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)
_LABEL_WORD = re.compile(r"[^\W_]+")


def _label_name_in_dump(name: str, dump: str) -> bool:
    said = set(_LABEL_WORD.findall(_LABEL_LINK.sub(" ", dump).lower()))
    words = _LABEL_WORD.findall(name.lower())
    return bool(words) and all(word in said for word in words)


class Recorder:
    """Every tool call, answered from the fixture and written down.

    One caller for both kinds of turn, indifferent to which tool the model
    picks: a case measures the behaviour, not the route to it.
    """

    def __init__(self, case: Case, dump: str, links: str | None = None) -> None:
        self.case = case
        self.fx = case.fixture
        self.dump = dump
        #: 026. What a URL must appear in: the dump, or an email's note alone,
        #: the worker's own bound.
        self.links = dump if links is None else links
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
        #: 041. The PDF indexes filed, each once.
        self.pdfs_filed: set[int] = set()
        self.content_timed: dict[str, bool] = {}
        #: 2026-10-13. A fixture row is a row an earlier turn filed, and the
        #: server takes any of the account's own: timed ones go on, the rest
        #: are refused `no_time`, as a row this turn filed would be.
        for fixture_row in _rows_for(self.fx, None):
            row_id = str(fixture_row.get("contentId"))
            self.content_timed[row_id] = bool(fixture_row.get("occursAt"))
        self.refused_time_once = False
        #: Title of every row this turn added, by the id handed back, so an
        #: edit naming that id can be read as the title's final state.
        self.content_titles: dict[str, str] = {}
        #: The thread this turn made, by name, and the rows filed into it.
        #: `create_thread` answers with the id `new`, so a row added to `new`
        #: lands there; the stub said Miscellaneous and the model filed the
        #: whole dump twice (2026-10-02).
        self.made_thread: str | None = None
        self.made_rows: list[dict] = []

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

    def _memory(self, args: dict) -> dict:
        """038. As the Core API answers it: refused in a turn that read
        anybody else's words, refused for what no memory holds, refused for
        words not in the person's own message."""
        fx = self.fx
        tainted = (
            bool(args.get("after_lookup"))
            or bool(fx.get("mail"))
            or bool(fx.get("photos"))
            or bool(fx.get("pdfs"))
            or bool(re.search(r"https?://|\bwww\.", self.dump, re.I))
        )
        if tainted:
            return {"ok": False, "error": "untrusted_turn"}
        if args.get("action") == "forget":
            if not _asked(self.dump, "forget"):
                return {"ok": False, "error": "not_their_words"}
            ids = {m.id for m in _memories(fx)}
            if args.get("memory_id") in ids:
                return {"ok": True, "forgot": {"id": args["memory_id"]}}
            return {"ok": False, "error": "unknown_memory"}
        text = str(args.get("text") or "")
        if not text or not args.get("kind"):
            return {"ok": False, "error": "empty"}
        if len(text) > 200:
            return {"ok": False, "error": "too_long"}
        if _never_holds(text):
            return {"ok": False, "error": "never_list"}
        if not _asked(self.dump, "remember") or not _grounded(text, self.dump):
            return {"ok": False, "error": "not_their_words"}
        if args.get("kind") == "rules" and not _rule_grounded(text, self.dump):
            return {"ok": False, "error": "not_their_words"}
        # 040. A case may say Memories has no room: `full` is "rules" or "memories".
        if fx.get("full") == "rules" and args.get("kind") == "rules":
            return {"ok": False, "error": "rules_full"}
        if fx.get("full") == "memories":
            return {"ok": False, "error": "memories_full"}
        return {"ok": True, "remembered": {"id": f"remembered{len(self.calls)}"}}

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
        if tool == "memory":
            return self._memory(args)
        if tool == "account_facts":
            return {"ok": True, "facts": self._facts()}
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
                        # 027: the server marks whose each event is; a
                        # fixture's event is the person's unless it says not.
                        "yours": e.get("yours", True),
                    }
                    for e in fx.get("events") or []
                ],
            }
        if tool == "create_event":
            # The row's thread decides. `calendar_write` in a fixture says what
            # the server would say: written (the default), asked, noCalendar.
            content_id = str(args.get("content_id") or "")
            if not content_id.startswith("c") and content_id not in self.content_timed:
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
            # 2026-10-13. The Core API answers `unknown_event` to a ref it does
            # not hold, and a stub that wrote anything let the model pass a
            # row's id here: the fixture's events, and one this turn created.
            known = {e.get("sourceRef") for e in fx.get("events") or []} | {"evt-1"}
            if args.get("source_ref") not in known:
                return {"ok": False, "error": "unknown_event"}
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
            self.made_thread = str(args.get("name") or "")
            return {
                "ok": True,
                "threadId": "new",
                "threadName": args.get("name"),
                "notes": [],
                "notesFromMembers": [],
                "notesFromApps": [],
            }
        if tool in {"list_thread_content"} and args.get("thread_id") == "new":
            return {"ok": True, "rows": list(self.made_rows), "truncated": False}
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
                        # 030. As the server says it.
                        "onMap": r.get("onMap", False),
                    }
                    for r in _rows_for(fx, args.get("thread_id"))
                ],
                "truncated": bool(fx.get("truncated")),
            }
        # 030. The filter the Core API stands in front of Google, run here too:
        # a stub that took any location would pass a model that files a street
        # address or somebody's home as a venue.
        if tool in {"add_content", "edit_content"} and args.get("location"):
            if tool == "add_content" and args.get("type") != "event":
                return {"ok": False, "error": "location_not_here"}
            if _place_refused(str(args["location"])):
                return {"ok": False, "error": "bad_place_name"}
        # 041. The PDF index as the Core API resolves it: a `file` row only
        # with a PDF this message carries, and each PDF once. A stub that took
        # any index would pass a model that files a PDF twice or as a task.
        if tool == "add_content" and (args.get("pdf") or args.get("type") == "file"):
            index = args.get("pdf")
            count = len(fx.get("pdfs") or [])
            if args.get("type") != "file" or not index or not 1 <= int(index) <= count:
                return {"ok": False, "error": "unknown_pdf"}
            if index in self.pdfs_filed:
                return {"ok": False, "error": "unknown_pdf"}
            self.pdfs_filed.add(index)
        if tool in {"add_content", "add_note"}:
            self.filed_ids += 1
            thread_id = str(args.get("thread_id") or "")
            named = _thread(fx, thread_id)
            out: dict[str, Any] = {
                "ok": True,
                "threadId": thread_id,
                # 028. The default thread's name never reaches the model, as on
                # the server: a stub that answered "Miscellaneous" would let a
                # reply say it back and pass. A thread this turn made keeps its.
                "threadName": named.name
                if named and not named.is_default
                else (
                    self.made_thread if thread_id == "new" and self.made_thread else NOT_IN_A_THREAD
                ),
                "notes": _notes_for(fx, "notes", thread_id),
                "notesFromMembers": _notes_for(fx, "notes_from_members", thread_id),
                "notesFromApps": _notes_for(fx, "notes_from_apps", thread_id),
            }
            if thread_id == "new":
                self.made_rows.append(
                    {
                        "contentId": f"c{self.filed_ids}",
                        "type": args.get("type") or "note",
                        "title": args.get("title") or args.get("text"),
                        "body": args.get("body"),
                        "done": False,
                        "yours": True,
                    }
                )
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
            for name in args.get("new") or []:
                if not _label_name_in_dump(str(name), self.dump):
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
        # 028. Every thread name in them goes through the Core API's
        # shownToModel: the default thread reads as "not in a thread".
        thread_id = args.get("thread_id")
        rows = [self._shown(r) for r in _rows_for(fx, thread_id)]
        named = _thread(fx, thread_id)
        result: dict[str, Any] = {
            "threadId": thread_id,
            "threadName": (NOT_IN_A_THREAD if named.is_default else named.name)
            if named
            else (rows[0].get("threadName") if rows else None),
            "truncated": bool(fx.get("truncated")),
            "rows": rows,
        }
        if tool == "search" and fx.get("asides"):
            result["asides"] = [self._shown(a) for a in fx["asides"]]
        return {"ok": True, "result": result}

    def _shown(self, row: dict) -> dict:
        """A row as the Core API hands it to the model: a default thread's
        name never reaches it, by id or by the stored name a fixture wrote."""
        default = next((t for t in _threads(self.fx) if t.is_default), None)
        if not default or "threadName" not in row:
            return row
        if row.get("threadId") == default.id or row.get("threadName") == default.name:
            return {**row, "threadName": NOT_IN_A_THREAD}
        return row

    def _facts(self) -> dict:
        """The Core API's AccountFacts, field for field. 019 took filesInto
        off a calendar, so a stub that passed it on answered "which calendar
        goes into which thread" where production cannot; 028 names the
        default thread by the prompt's words, never its stored name."""
        fx = self.fx
        facts = fx.get("facts") or {}
        default = next((t for t in _threads(fx) if t.is_default), None)
        default_id = (facts.get("defaultThread") or {}).get("id") or (
            default.id if default else None
        )
        calendars = facts.get("calendars")
        if calendars is None:
            calendars = fx.get("calendars") or []

        def threads_of(c: dict) -> list[str]:
            # The fixture names one thread a calendar files into, as the
            # contexts were written before 019; production names every
            # thread this account picked it for, shown as the model sees
            # them, so the default thread's stored name never appears.
            into = c.get("filesInto")
            if not into:
                return []
            if default is not None and into in (default.name, default.id):
                return [NOT_IN_A_THREAD]
            return [into]

        return {
            "displayName": facts.get("displayName"),
            "defaultThread": {"id": default_id, "name": NOT_IN_A_THREAD} if default_id else None,
            "calendars": sorted(
                ({"name": c.get("name"), "threads": threads_of(c)} for c in calendars),
                key=lambda c: c["name"] or "",
            ),
            "knowsDevicePreferences": False,
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
        if url and not _in_the_dump(url, self.links):
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
    #: Dollars this attempt cost, every model call included, the eval's own
    #: judge too. What the run spends, for the budget.
    cost: float = 0.0
    #: Every model call the product made for this case, in `call_of`'s shape.
    #: The small calls arrive through the ledger sink `_run_one` opens; the
    #: planner's come from its outcome. What cost and latency are read from.
    calls: list[dict] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.mechanical and self.judged


def call_of(entry: Any) -> dict:
    """One model call, whichever shape it arrived in: the planner's `Usage`
    or the ledger's wire dict."""
    if isinstance(entry, Usage):
        return {
            "model": entry.model,
            "input_tokens": entry.input_tokens,
            "output_tokens": entry.output_tokens,
            "cache_read_tokens": entry.cache_read_tokens,
            "cache_write_tokens": entry.cache_write_tokens,
            "latency_ms": entry.latency_ms,
        }
    return {
        "model": entry.get("model", ""),
        "input_tokens": int(entry.get("inputTokens", entry.get("input_tokens", 0)) or 0),
        "output_tokens": int(entry.get("outputTokens", entry.get("output_tokens", 0)) or 0),
        "cache_read_tokens": int(
            entry.get("cacheReadTokens", entry.get("cache_read_tokens", 0)) or 0
        ),
        "cache_write_tokens": int(
            entry.get("cacheWriteTokens", entry.get("cache_write_tokens", 0)) or 0
        ),
        "latency_ms": int(entry.get("latencyMs", entry.get("latency_ms", 0)) or 0),
    }


def metrics_of(calls: list[dict]) -> dict:
    """What a case cost the product and how long its calls took, end to end.
    Latency is the sum because a turn's calls run one after another; the
    stubbed tools between them take no time, so this is the model's share."""
    return {
        "calls": len(calls),
        "latency_ms": sum(c["latency_ms"] for c in calls),
        "input_tokens": sum(c["input_tokens"] for c in calls),
        "output_tokens": sum(c["output_tokens"] for c in calls),
        "cache_read_tokens": sum(c["cache_read_tokens"] for c in calls),
        "product_cost_usd": round(
            sum(
                _cost(
                    c["model"],
                    c["input_tokens"],
                    c["output_tokens"],
                    c["cache_read_tokens"],
                    c["cache_write_tokens"],
                )
                for c in calls
            ),
            5,
        ),
        # The same calls with every cache write priced as a read: what a turn
        # costs once the prefix is warm, which in production is most turns.
        # An eval run starts cold, so the cold number overstates the day.
        "warm_cost_usd": round(
            sum(
                _cost(
                    c["model"],
                    c["input_tokens"],
                    c["output_tokens"],
                    c["cache_read_tokens"] + c["cache_write_tokens"],
                    0,
                )
                for c in calls
            ),
            5,
        ),
        # The warm cost with only the surface's shared prefix warm: what
        # production pays. See `prod_cost`.
        "prod_cost_usd": round(prod_cost(calls), 5),
    }


def prod_cost(calls: list[dict]) -> float:
    """The calls priced the way production pays its cache.

    The warm cost prices every write as a read, and the turn's own tail can
    never be warm in production: the account part and the question are
    written on the first call of every turn, and each later call writes what
    the one before it added. An eval reads them only because the same
    fixtures ran minutes earlier. So a turn call reads at most its surface's
    shared prefix (`prefix_tokens`, tools and system, the same for every
    account) on its first call and what the previous call cached on later
    ones, and the rest of what it cached is a write. A call with no measured
    prefix, the small calls through the ledger among them, is priced warm.
    """
    total = 0.0
    held: int | None = None
    model = None
    for c in calls:
        cached = c["cache_read_tokens"] + c["cache_write_tokens"]
        prefix = c.get("prefix_tokens")
        if c.get("via", "turn") != "turn" or prefix is None:
            total += _cost(c["model"], c["input_tokens"], c["output_tokens"], cached, 0)
            continue
        if held is None or c["model"] != model:
            held, model = prefix, c["model"]
        warm = min(held, cached)
        total += _cost(c["model"], c["input_tokens"], c["output_tokens"], warm, cached - warm)
        held = cached
    return total


class _TapMessages:
    def __init__(self, tap: _PrefixTap) -> None:
        self._tap = tap

    def __getattr__(self, name: str) -> Any:
        return getattr(self._tap._client.messages, name)

    async def create(self, **kw: Any) -> Any:
        self._tap.seen.append({k: kw.get(k) for k in ("model", "system", "tools")})
        return await self._tap._client.messages.create(**kw)


class _PrefixTap:
    """The client, passed through, keeping what each request sent ahead of the
    conversation, so a turn's shared prefix is measured rather than guessed."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self.seen: list[dict] = []
        self.messages = _TapMessages(self)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)

    def turn_request(self, model: str) -> dict | None:
        """The largest system and tools sent on the turn's model: the turn's
        own loop, never a classify or a look on the way through."""
        mine = [r for r in self.seen if r["model"] == model]
        size = lambda r: len(json.dumps([r["system"], r["tools"]], default=str))  # noqa: E731
        return max(mine, key=size) if mine else None


#: count_tokens per request prefix, which is free and is not a model call.
_PREFIX_TOKENS: dict[str, int | None] = {}


async def _prefix_tokens(client: Any, request: dict | None) -> int | None:
    """Tokens in a request's tools and system, from the API's own counter,
    less what a bare one-word message counts. None when it cannot be read."""
    if not request:
        return None
    key = hashlib.sha256(
        json.dumps(request, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    if key not in _PREFIX_TOKENS:
        msg = [{"role": "user", "content": "x"}]
        kw = {k: v for k, v in request.items() if v}
        try:
            full = await client.messages.count_tokens(messages=msg, **kw)
            bare = await client.messages.count_tokens(model=request["model"], messages=msg)
            _PREFIX_TOKENS[key] = full.input_tokens - bare.input_tokens
        except Exception:  # noqa: BLE001
            _PREFIX_TOKENS[key] = None
    return _PREFIX_TOKENS[key]


def case_row(r: Result) -> dict:
    """One case as the record writes it."""
    return {
        "principle": r.case.principle,
        "id": r.case.id,
        "why": r.case.why,
        "surface": r.case.surface,
        "input": r.case.input,
        "passed": r.passed,
        "passes_of": r.passes_of,
        "cost_usd": round(r.cost, 4),
        **metrics_of(r.calls),
        # Each call in order, the turn's own first and the sink's after them,
        # so a cost can be placed on the call that spent it. They sum to the
        # aggregates above exactly.
        "per_call": [dict(c) for c in r.calls],
        "mechanical": r.mechanical,
        "judge": r.judge_note,
        "reply": r.reply,
        "transcript": r.transcript,
    }


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
    # An edit to a row this turn filed is part of that filing, as it is in
    # production: the model files, reads the thread's notes off the result,
    # and sets the date with `edit_content`. Ids follow the stub's own count.
    folded: list[tuple[str, dict]] = []
    by_id: dict[str, int] = {}
    for tool, args in calls:
        if tool in {"add_content", "add_note"}:
            folded.append((tool, dict(args)))
            by_id[f"c{sum(1 for t, _ in folded if t in {'add_content', 'add_note'})}"] = (
                len(folded) - 1
            )
        elif tool == "edit_content" and str(args.get("content_id")) in by_id:
            target = folded[by_id[str(args.get("content_id"))]][1]
            target.update({k: v for k, v in args.items() if k != "content_id" and v is not None})
            folded.append((tool, args))
        else:
            folded.append((tool, args))
    calls = folded
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
        # 028. The suggested thread on a filing into the default thread.
        if "suggest" in matcher:
            name = threads.get(str(args.get("suggest_thread_id") or ""), "")
            if name.lower() != matcher["suggest"].lower():
                return False
        if matcher.get("no_suggest") and args.get("suggest_thread_id"):
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
        # 041. Which PDF, the same way.
        if "pdf" in matcher and args.get("pdf") != matcher["pdf"]:
            return False
        if matcher.get("no_pdf") and args.get("pdf"):
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


def _icon_problems(expect: dict, calls: list[tuple[str, dict]]) -> list[str]:
    """037. The icon a new thread was given, read off the `create_thread` call.

    `one_of` names the icons that fit; `known` passes any of the seventy or
    none at all, which the server then picks from the name."""
    want = expect.get("thread_icon")
    if not want:
        return []
    made = [args for tool, args in calls if tool == "create_thread"]
    if not made:
        return ["created no thread, so there is no icon to read"]
    icon = made[0].get("icon")
    if "one_of" in want and icon not in want["one_of"]:
        return [f"the new thread's icon is {icon!r}, not one of {want['one_of']}"]
    if want.get("known") and icon is not None and icon not in THREAD_ICON_NAMES:
        return [f"the new thread's icon is {icon!r}, which is not in the list"]
    return []


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
        getattr(usage, "cache_creation_input_tokens", 0) or 0,
    )


def _outcome_cost(outcome: Any) -> float:
    return sum(
        _cost(u.model, u.input_tokens, u.output_tokens, u.cache_read_tokens, u.cache_write_tokens)
        for u in getattr(outcome, "usage", [])
    )


#: The judge's spend, collected here because `_judge` returns a verdict and
#: threading a third value through every caller is noisier than a list.
_spent: list[float] = []


# ---------------------------------------------------------------------------
# Surfaces


PHOTO_FIXTURES = Path(__file__).parent / "fixtures" / "photos"
PDF_FIXTURES = Path(__file__).parent / "fixtures" / "pdfs"


async def _pdfs(fx: dict) -> list[Pdf]:
    """041. The case's PDFs, by file name under `fixtures/pdfs/`, through the
    worker's own clean, cut and request bound, so the model reads what it
    would."""
    out: list[Pdf] = []
    for at, name in enumerate(fx.get("pdfs") or []):
        made = pdfs_mod.make((PDF_FIXTURES / name).read_bytes())
        out.append(
            Pdf(
                blob_id=f"pdf-{at + 1}",
                index=at + 1,
                pages=made.pages,
                cut=made.cut,
                clean=made.clean,
                large=made.large,
            )
        )
    fitted, _ = await fit_documents(out, other_bytes=0)
    return fitted


async def _run_look(client: AsyncAnthropic, case: Case, model: str) -> Result:
    """041. The look at an email's pictures: page 1 of each PDF, as the worker
    draws it, then the photos, and which it keeps by index."""
    fx = case.fixture
    pictures = [
        pdfs_mod.look_picture((PDF_FIXTURES / n).read_bytes()) for n in fx.get("look_pdfs") or []
    ]
    pictures += [(PHOTO_FIXTURES / n).read_bytes() for n in fx.get("look_photos") or []]
    try:
        kept = await look(client, model, pictures)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    transcript = f"kept {sorted(kept)} of {len(pictures)}"
    failures = []
    want = sorted(case.expect.get("keep", []))
    if sorted(kept) != want:
        failures.append(f"kept {sorted(kept)}, wanted {want}")
    cost = _cost(model, 600 * len(pictures), 60)
    return Result(case, "", transcript, failures, True, transcript, cost=cost)


def _mail(fx: dict) -> Mail | None:
    """026. The case's forwarded email, through the worker's own `mail_of`, so
    the note and the forwarded part are split and clamped exactly as a real
    one is."""
    spec = fx.get("mail")
    if not spec:
        return None
    note = spec.get("note") or ""
    forwarded = spec.get("forwarded") or ""
    text = f"{note}\n\n{forwarded}" if note and forwarded else note or forwarded
    return mail_of(
        text,
        {
            "subject": spec.get("subject") or "",
            "fromName": spec.get("from_name"),
            "fromAddress": spec.get("from_address") or "",
            "sentAt": spec.get("sent_at"),
            "noteLength": len(note),
            "historyAt": None,
            "leftOut": spec.get("left_out") or {},
        },
    )


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
    mail = _mail(fx)
    dump = mail.dump if mail else str(case.input)
    rec = Recorder(case, dump, links=mail.links if mail else None)
    threads = _threads(fx)
    default = next((t for t in threads if t.is_default), threads[-1] if threads else None)
    ctx = DumpContext(
        dump=dump,
        mail=mail,
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
        pdfs=await _pdfs(fx),
        memories=_memories(fx),
        spoken=bool(fx.get("spoken")),
        looking_at_notes=_notes_on_screen(fx),
    )
    return await _file_with(client, case, model, ctx, rec)


def _notes_on_screen(fx: dict) -> ThreadNotes | None:
    """The thread on screen's notes, as `context.load` reads them: the
    fixture's three lists for that thread only, dated as the stub's results
    date them. The stub still hands them back and the loop drops them, as
    the Core API and the loop do."""
    looking_at = fx.get("looking_at")
    if not looking_at:
        return None

    def notes(key: str) -> list[ThreadNote]:
        return [
            ThreadNote(text=n["text"], written_at=n["writtenAt"])
            for n in _notes_for(fx, key, looking_at)
        ]

    return ThreadNotes(
        yours=notes("notes"),
        members=notes("notes_from_members"),
        from_apps=notes("notes_from_apps"),
    )


async def _file_with(
    client: AsyncAnthropic, case: Case, model: str, ctx: Any, rec: Recorder
) -> Result:
    """The turn run and judged, on a context built from a fixture or from the cast."""
    fx = case.fixture
    try:
        outcome = await plan(client, ctx, model, rec)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    # What the worker does to the outcome before anyone sees it, by the
    # worker's own function: the reply judged is the reply sent.
    _partial, sent = _reply_as_sent(outcome, ctx, rec.budget)

    reply = sent or ""
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
        failures.append(f"reply uses dated or content as a noun: {reply!r}")
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

    # 038. Words that must or must not be in what was filed: a title or a note.
    written = " ".join(
        str(args.get("title") or args.get("text") or "")
        for tool, args in rec.calls
        if tool in {"add_content", "add_note", "edit_content"}
    ).lower()
    for word in expect.get("written_lacks", []):
        if word.lower() in written:
            failures.append(f"wrote {word!r} into what it filed: {written!r}")
    for word in expect.get("written_has", []):
        if word.lower() not in written:
            failures.append(f"did not write {word!r} into what it filed: {written!r}")

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
    failures.extend(_icon_problems(expect, rec.calls))

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
    return Result(
        case,
        reply,
        transcript,
        failures,
        judged,
        note,
        cost=cost,
        calls=[call_of(u) for u in outcome.usage],
    )


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
        memories=_memories(fx),
    )
    return await _answer_with(client, case, model, ctx, rec)


async def _answer_with(
    client: AsyncAnthropic, case: Case, model: str, ctx: Any, rec: Recorder
) -> Result:
    """The turn run and judged, on a context built from a fixture or from the cast."""
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
        failures.append(f"reply uses dated, item or content as a noun: {reply!r}")
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
    # After the judge, which reads the reply as the person would: what the
    # loop did to the turn, so every cut and every send back can be read.
    if getattr(outcome, "sent_back", False):
        transcript += "\n(sent back once: the search found nothing)"
    if getattr(outcome, "unshaped", None):
        transcript += f"\n(reshaped from: {outcome.unshaped!r})"
    cost = _outcome_cost(outcome) + sum(_spent[before:])
    return Result(
        case,
        reply,
        transcript,
        failures,
        judged,
        note,
        cost=cost,
        calls=[call_of(u) for u in outcome.usage],
    )


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


# 042. What the Core API keeps of a label, mirrored so a case fails on what
# production would refuse: a name that is not a run of the thing's own words.
_ADDRESS = re.compile(r"://|www\.|@|[a-z0-9-]\.[a-z]{2,}", re.I)


def _name_is_own(name: str, text: str) -> bool:
    def flat(words: str) -> str:
        return " ".join(words.split()).lower()

    wanted = flat(name)
    if not wanted or len(wanted) > 60 or _ADDRESS.search(wanted) or re.search(r"\d{4}", wanted):
        return False
    return wanted in flat(text)


def _label_problems(
    want: dict, wire: list[dict], shown: list[dict], anchors: list[dict]
) -> list[str]:
    """`labels` in a case: keyed by dated number, each with `kind` or
    `kind_any`, `lead` or `lead_any`, `before` (a dated number, or null), and
    `named`. A dated the model left out is none, as the Core API keeps it."""
    problems: list[str] = []
    by_id = {one["id"]: one for one in wire}
    anchor_number = {a["id"]: n for n, a in enumerate(anchors, start=1)}
    for n, dated in enumerate(shown, start=1):
        label = by_id.get(dated["id"], {"kind": "none", "lead": "none"})
        if (
            label.get("name")
            and dated.get("of") == "note"
            and not _name_is_own(label["name"], dated["text"])
        ):
            problems.append(f"entry {n} named {label['name']!r}, not a run of its own words")
        rule = want.get(str(n))
        if rule is None:
            continue
        kinds = rule.get("kind_any") or ([rule["kind"]] if "kind" in rule else None)
        if kinds and label["kind"] not in kinds:
            problems.append(f"entry {n} was {label['kind']}, wanted kind {' or '.join(kinds)}")
            continue
        leads = rule.get("lead_any") or ([rule["lead"]] if "lead" in rule else None)
        if leads and label["lead"] not in leads:
            problems.append(f"entry {n} lead {label['lead']}, wanted {' or '.join(leads)}")
        if "before" in rule:
            got = anchor_number.get((label.get("before") or {}).get("id"))
            if got != rule["before"]:
                problems.append(f"entry {n} before {got}, wanted {rule['before']}")
        if rule.get("named") and not label.get("name"):
            problems.append(f"entry {n} has no name")
    return problems


def _date_problems(expect: dict, wire: list[dict], shown: list[dict]) -> list[str]:
    """`dates` keyed by memory id with `on` and `lead` or `lead_any`;
    `no_date` the ids that must not be dated."""
    problems: list[str] = []
    by_id = {one["id"]: one for one in wire}
    text_of = {m["id"]: m["text"] for m in shown}
    for one in wire:
        if not _name_is_own(one["name"], text_of.get(one["id"], "")):
            problems.append(f"{one['id']} named {one['name']!r}, not a run of its own words")
    for memory_id, rule in (expect.get("dates") or {}).items():
        got = by_id.get(memory_id)
        if got is None:
            problems.append(f"{memory_id} was not dated")
            continue
        if "on" in rule and got["on"] != rule["on"]:
            problems.append(f"{memory_id} on {got['on']}, wanted {rule['on']}")
        leads = rule.get("lead_any") or ([rule["lead"]] if "lead" in rule else None)
        if leads and got["lead"] not in leads:
            problems.append(f"{memory_id} lead {got['lead']}, wanted {' or '.join(leads)}")
    for memory_id in expect.get("no_date") or []:
        if memory_id in by_id:
            problems.append(f"{memory_id} was dated, and must not be")
    return problems


async def _run_nightly(client: AsyncAnthropic, case: Case, model: str) -> Result:
    """032. One thread's nightly pass for one member.

    The input is either a list of notes, for a case about keeping them true, or
    {thread, notes, messages: [{day, text}], candidates: [{type, text}]}: the
    messages make it an ordinary thread's pass that may learn, the candidates
    make it the default thread's, which suggests threads. Notes are
    {id, written_at, theirs, origin, text}; `theirs` false is another member's.

    Structural rules hold on every case, as the Core API holds them: nothing
    removed that a person typed, nothing touched that is not theirs, no fold
    across two people, at most three learned notes and every one citing a dump
    it was shown."""
    fx = case.input if isinstance(case.input, dict) else {"notes": case.input}
    rows = fx.get("notes") or []
    messages = [{"id": f"m{n}", **m} for n, m in enumerate(fx.get("messages") or [], start=1)]
    candidates = [{"id": f"c{n}", **c} for n, c in enumerate(fx.get("candidates") or [], start=1)]
    propose = "candidates" in fx
    # 042. Dated things to label, and what a to-do could be for.
    to_label = [
        {
            "of": "note" if t.get("type") == "note" else "content",
            "id": f"t{n}",
            "type": t.get("type", "task"),
            "text": t["text"],
            "when": t.get("when"),
            "rrule": t.get("rrule"),
            "asked": t.get("asked", False),
        }
        for n, t in enumerate(fx.get("to_label") or [], start=1)
    ]
    anchors = [
        {"of": a.get("of", "note"), "id": f"a{n}", "text": a["text"], "when": a["when"]}
        for n, a in enumerate(fx.get("anchors") or [], start=1)
    ]
    listing = nightly_mod.listing(
        thread_name=str(fx.get("thread") or "A thread"),
        today=case.fixture.get("today") or TODAY,
        notes=rows,
        messages=None if propose else messages,
        candidates=candidates if propose else None,
        to_label=to_label,
        anchors=anchors,
    )
    cfg = Config(
        database_url="", api_url="", internal_token="", anthropic_api_key="", nightly_model=model
    )
    try:
        plan_, usage = await nightly_mod._ask(client, cfg, listing, propose=propose)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    if plan_ is None:
        return Result(case, "", "", ["no parseable nightly plan"], False, "")
    by_id = {r["id"]: r for r in rows}
    supersede, remove = list(plan_.supersede), list(plan_.remove)
    adds = [a.model_dump() for a in plan_.add]
    learned_raw = [n.model_dump() for n in getattr(plan_, "learned", [])]
    groups_raw = [g.model_dump() for g in getattr(plan_, "groups", [])]
    labels_raw = nightly_mod.labels_wire(plan_.labels, to_label, anchors)
    touched = set(supersede) | set(remove) | {i for a in adds for i in a.get("folded_from", [])}
    transcript = json.dumps(
        {
            "supersede": supersede,
            "remove": remove,
            "add": adds,
            "learned": learned_raw,
            "groups": groups_raw,
            "labels": labels_raw,
        },
        ensure_ascii=False,
    )
    failures: list[str] = []
    # What the model did, before the code holds it: a broken rule is a finding
    # about the prompt even when the Core API would have caught it.
    for i in remove:
        if by_id.get(i, {}).get("origin") != "learned":
            failures.append(f"removed {i}, which a person typed")
    for i in touched:
        if i in by_id and not by_id[i].get("theirs", True):
            failures.append(f"touched {i}, which is another member's")
    for a in adds:
        failures.extend(_copy_problems(str(a.get("text", ""))))
    for n in learned_raw:
        failures.extend(_copy_problems(str(n.get("text", ""))))
        if any(not 1 <= k <= len(messages) for k in n.get("from_messages", [])):
            failures.append(f"cited a dump it was not shown: {n.get('from_messages')}")
    for g in groups_raw:
        failures.extend(_copy_problems(str(g.get("name", ""))))
    for one in labels_raw:
        if one.get("name"):
            failures.extend(_copy_problems(str(one["name"])))
    failures.extend(_label_problems(case.expect.get("labels") or {}, labels_raw, to_label, anchors))
    for needle in case.expect.get("transcript_must_not_contain", []):
        if needle in transcript:
            failures.append(f"the answer carries {needle!r}")
    learned_text = [str(n.get("text", "")) for n in learned_raw]
    expect = case.expect
    if expect.get("no_change") and (supersede or remove or adds or learned_raw or groups_raw):
        failures.append(f"changed a set that needed nothing: {transcript}")
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
    if "learns" in expect and len(learned_raw) != expect["learns"]:
        got = len(learned_raw)
        failures.append(f"learned {got} notes, wanted {expect['learns']}: {transcript}")
    for word in expect.get("learned_has", []):
        if not any(word.lower() in t.lower() for t in learned_text):
            failures.append(f"no learned note says {word!r}: {transcript}")
    for word in expect.get("learned_lacks", []):
        if any(word.lower() in t.lower() for t in learned_text):
            failures.append(f"a learned note says {word!r}: {transcript}")
    if "groups" in expect and len(groups_raw) != expect["groups"]:
        failures.append(f"suggested {len(groups_raw)} threads, wanted {expect['groups']}")
    judged, note = True, ""
    before = len(_spent)
    if expect.get("rubric") and not failures:
        legend = (
            "The pass is shown a thread's notes, one JSON entry per line, its own "
            "member's under 'Your notes' and other members' under their own heading; "
            "by is typed for a person's sentence and assistant for one offload wrote. "
            "Then either the "
            "person's dumps into the thread since yesterday, numbered, or a numbered "
            "list of what they put down without a thread. The answer lists notes to "
            "supersede, notes to remove, folded notes naming what they replace, new "
            "learned notes naming the dumps they came from, and suggested threads."
        )
        judged, note = await _judge(
            client, case, legend + "\n\nshown:\n" + listing + "\n\nanswer:\n" + transcript
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
    return Result(
        case, "", transcript, failures, judged, note, cost=cost, calls=[call_of(u) for u in usage]
    )


# ---------------------------------------------------------------- the cast
#
# 038. Seven people in a database of their own (cast/cast.sql), measured
# through the same queries the worker runs: what a pass reads, what a turn's
# context holds, what the agent role may see. Needs EVAL_CAST_DATABASE_URL,
# a database whose name has "cast" in it, migrated; the seed is applied at
# the start of a run. EVAL_CAST_AGENT_DATABASE_URL, when set, reads as the
# worker's role, which is how 038 found a missing grant.

CAST = HERE / "cast"
_cast_lock = asyncio.Lock()
_cast_engine: Any = None


def _cast_ids() -> dict:
    return json.loads((CAST / "ids.json").read_text())


async def _cast() -> Any:
    """The cast's database, seeded once per run."""
    global _cast_engine
    async with _cast_lock:
        if _cast_engine is not None:
            return _cast_engine
        url = os.environ.get("EVAL_CAST_DATABASE_URL")
        if not url:
            raise RuntimeError("the cast needs EVAL_CAST_DATABASE_URL")
        if "cast" not in url.rsplit("/", 1)[-1]:
            raise RuntimeError("EVAL_CAST_DATABASE_URL must name a database with 'cast' in it")
        import asyncpg
        from sqlalchemy.ext.asyncio import create_async_engine

        from offload_agent.config import _asyncpg

        seed = await asyncpg.connect(url.replace("postgresql+asyncpg://", "postgresql://"))
        try:
            await seed.execute((CAST / "cast.sql").read_text())
        finally:
            await seed.close()
        _cast_engine = create_async_engine(
            _asyncpg(os.environ.get("EVAL_CAST_AGENT_DATABASE_URL") or url)
        )
        await _embed_cast_memories(url)
        return _cast_engine


async def _embed_cast_memories(url: str) -> None:
    """040. The cast's memories, embedded as the sweep's job would, so a turn
    is given the nearest of them. Once per run, and only with a Voyage key:
    without one, every turn falls back to the newest."""
    key = os.environ.get("VOYAGE_API_KEY")
    if not key:
        return
    import asyncpg
    import httpx

    from offload_agent.embed import BATCH, MODEL, embed, to_pgvector

    conn = await asyncpg.connect(url.replace("postgresql+asyncpg://", "postgresql://"))
    try:
        rows = await conn.fetch(
            "select id, text from notes where scope = 'account' and embedded_at is null "
            "and id::text like '0ca50000-0000-4000-8004-%' and deleted_at is null"
        )
        async with httpx.AsyncClient() as http:
            for start in range(0, len(rows), BATCH):
                batch = rows[start : start + BATCH]
                vectors = await embed([r["text"] for r in batch], client=http, api_key=key)
                for row, vector in zip(batch, vectors, strict=True):
                    await conn.execute(
                        "update notes set embedding = $1::halfvec, embedding_model = $2, "
                        "embedded_at = now() where id = $3",
                        to_pgvector(vector),
                        MODEL,
                        row["id"],
                    )
    finally:
        await conn.close()


def _cast_embedder(http: Any) -> Any:
    """The worker's query embedder, as the worker builds it, or none without a key."""
    from offload_agent.context import QUERY_LONGEST
    from offload_agent.embed import query_embedder

    key = os.environ.get("VOYAGE_API_KEY")
    return query_embedder(key, http, QUERY_LONGEST) if key else None


async def _cast_turn(case: Case, writer: Any) -> tuple[str, str, str]:
    """A dump of theirs in a conversation of its own, as the route writes one:
    the account, the conversation and the message. Removed after the case."""
    ids = _cast_ids()
    who = ids["people"][case.input["character"]]
    looking = ids["threads"].get(case.input.get("looking_at", ""))
    async with writer.begin() as conn:
        from sqlalchemy import text as sql_text

        conversation = (
            await conn.execute(
                sql_text("insert into conversations (account_id) values (:a) returning id::text"),
                {"a": who},
            )
        ).scalar_one()
        message = (
            await conn.execute(
                sql_text(
                    "insert into messages (conversation_id, account_id, role, type, turn_id, "
                    "text, state, source, looking_at_thread_id, created_at) "
                    "values (:c, :a, 'person', 'text', gen_random_uuid(), :t, 'seen', "
                    "'person', :l, "
                    # Eight days back: outside every pass's seven-day window,
                    # so a pass case running beside this one never reads it.
                    "now() - interval '8 days') returning id::text"
                ),
                {"c": conversation, "a": who, "t": case.input["dump"], "l": looking},
            )
        ).scalar_one()
    return who, conversation, message


async def _cast_forget(writer: Any, conversation: str) -> None:
    from sqlalchemy import text as sql_text

    async with writer.begin() as conn:
        await conn.execute(sql_text("delete from conversations where id = :c"), {"c": conversation})


def _cast_writer() -> Any:
    from sqlalchemy.ext.asyncio import create_async_engine

    from offload_agent.config import _asyncpg

    return create_async_engine(_asyncpg(os.environ["EVAL_CAST_DATABASE_URL"]))


def _with_memories(case: Case, memories: list) -> Case:
    """The stub answers a forget against the memories the context really holds."""
    fixture = {
        **case.fixture,
        "memories": [{"id": m.id, "kind": m.kind, "text": m.text} for m in memories],
    }
    return Case(**{**case.__dict__, "fixture": fixture})


async def _run_cast_file(client: AsyncAnthropic, case: Case, model: str) -> Result:
    """A filing turn by one of the cast, its context loaded from the database."""
    from offload_agent import context as ctx_mod

    await _cast()
    writer = _cast_writer()
    who, conversation, message = await _cast_turn(case, writer)
    try:
        import httpx

        async with httpx.AsyncClient() as http, (await _cast()).connect() as conn:
            ctx = await ctx_mod.load(
                conn,
                account_id=who,
                conversation_id=conversation,
                message_id=message,
                max_turns=20,
                max_threads=12,
                embedder=_cast_embedder(http),
            )
        case = _with_memories(case, ctx.memories)
        rec = Recorder(case, ctx.dump)
        return await _file_with(client, case, model, ctx, rec)
    finally:
        await _cast_forget(writer, conversation)
        await writer.dispose()


async def _run_cast_answer(client: AsyncAnthropic, case: Case, model: str) -> Result:
    """A question asked by one of the cast, its context loaded from the database."""
    from offload_agent import context as ctx_mod

    await _cast()
    writer = _cast_writer()
    who, conversation, message = await _cast_turn(case, writer)
    try:
        import httpx

        async with httpx.AsyncClient() as http, (await _cast()).connect() as conn:
            ctx = await ctx_mod.load_answer(
                conn,
                account_id=who,
                question=case.input["dump"],
                max_threads=12,
                conversation_id=conversation,
                message_id=message,
                max_turns=20,
                embedder=_cast_embedder(http),
            )
        case = _with_memories(case, ctx.memories)
        rec = Recorder(case, case.input["dump"])
        return await _answer_with(client, case, model, ctx, rec)
    finally:
        await _cast_forget(writer, conversation)
        await writer.dispose()


async def _run_cast_memory(client: AsyncAnthropic, case: Case, model: str) -> Result:
    """One of the cast's memory pass, reading exactly what the worker reads."""
    ids = _cast_ids()
    who = ids["people"][case.input["character"]]
    import httpx

    async with httpx.AsyncClient() as http, (await _cast()).connect() as conn:
        today, held, notes, messages = await memories_mod.read(conn, who, _cast_embedder(http))
    return await _memory_with(
        client,
        case,
        model,
        [dict(m) for m in held],
        [dict(n) for n in notes],
        [dict(m) for m in messages],
        today,
    )


async def _run_memory(client: AsyncAnthropic, case: Case, model: str) -> Result:
    """038. One account's memory pass.

    The input is {messages: [{day, text}], notes: [{day, text}], memories:
    [{id, kind, origin, text}]}. Structural rules hold on every case, as the
    Core API holds them: at most five adds, never a rule, every add and
    supersede citing something it was shown, folds of learned memories only."""
    fx = case.input if isinstance(case.input, dict) else {"messages": case.input}
    messages = [{"id": f"m{n}", **m} for n, m in enumerate(fx.get("messages") or [], start=1)]
    notes = [{"id": f"n{n}", **m} for n, m in enumerate(fx.get("notes") or [], start=1)]
    held = [
        {"id": m.get("id") or f"k{n}", "origin": m.get("origin", "learned"), **m}
        for n, m in enumerate(fx.get("memories") or [], start=1)
    ]
    # 042. Memories to date, by the id the case gives.
    to_date = [
        {"id": m.get("id") or f"d{n}", "kind": m.get("kind", "people"), "text": m["text"]}
        for n, m in enumerate(fx.get("to_date") or [], start=1)
    ]
    return await _memory_with(
        client, case, model, held, notes, messages, case.fixture.get("today") or TODAY, to_date
    )


async def _memory_with(
    client: AsyncAnthropic,
    case: Case,
    model: str,
    held: list[dict],
    notes: list[dict],
    messages: list[dict],
    today: str | None,
    to_date: list[dict] | None = None,
) -> Result:
    """The pass run and judged, on a set from a fixture or from the cast."""
    to_date = to_date or []
    listing = memories_mod.listing(
        today=today, memories=held, notes=notes, messages=messages, to_date=to_date
    )
    cfg = Config(
        database_url="", api_url="", internal_token="", anthropic_api_key="", memory_model=model
    )
    try:
        plan_, usage = await memories_mod._ask(client, cfg, listing)
    except Exception as exc:  # noqa: BLE001
        return Result(case, "", "", [f"raised {type(exc).__name__}: {exc}"], False, "")
    if plan_ is None:
        return Result(case, "", "", ["no parseable memory plan"], False, "")
    adds = [a.model_dump() for a in plan_.add]
    supersedes = [s_.model_dump() for s_ in plan_.supersede]
    folds = [f.model_dump() for f in plan_.fold]
    dates = memories_mod.dates_wire(plan_.dates, to_date)
    transcript = json.dumps(
        {"add": adds, "supersede": supersedes, "fold": folds, "dates": dates}, ensure_ascii=False
    )
    shown = {m["id"] for m in messages} | {n["id"] for n in notes}
    by_id = {m["id"]: m for m in held}
    failures: list[str] = []
    for one in adds + supersedes:
        failures.extend(_copy_problems(str(one.get("text", ""))))
        if one.get("cites") not in shown:
            failures.append(f"cited something it was not shown: {one.get('cites')}")
    for f in folds:
        if any(by_id.get(i, {}).get("origin") != "learned" for i in f.get("ids", [])):
            failures.append(f"folded a memory the person gave: {f.get('ids')}")
    expect = case.expect
    failures.extend(_date_problems(expect, dates, to_date))
    for one in dates:
        failures.extend(_copy_problems(str(one["name"])))
    texts = [str(a.get("text", "")) for a in adds] + [str(x.get("text", "")) for x in supersedes]
    if expect.get("no_change") and (adds or supersedes or folds):
        failures.append(f"changed what needed nothing: {transcript}")
    if "adds" in expect and len(adds) != expect["adds"]:
        failures.append(f"added {len(adds)}, wanted {expect['adds']}: {transcript}")
    for word in expect.get("has", []):
        if not any(word.lower() in t.lower() for t in texts):
            failures.append(f"no memory says {word!r}: {transcript}")
    for word in expect.get("lacks", []):
        if any(word.lower() in t.lower() for t in texts):
            failures.append(f"a memory says {word!r}: {transcript}")
    for kind in expect.get("kinds", []):
        if not any(a.get("kind") == kind for a in adds):
            failures.append(f"no memory of kind {kind!r}: {transcript}")
    for i in expect.get("supersedes", []):
        if i not in {x.get("id") for x in supersedes} and not any(
            i in f.get("ids", []) for f in folds
        ):
            failures.append(f"left {i} standing: {transcript}")
    for i in expect.get("never_touches", []):
        if i in {x.get("id") for x in supersedes} or any(i in f.get("ids", []) for f in folds):
            failures.append(f"touched {i}, which must stand: {transcript}")
    if expect.get("folds") and not any(
        set(expect["folds"]) <= set(f.get("ids", [])) for f in folds
    ):
        failures.append(f"did not fold {expect['folds']}: {transcript}")
    cost = sum(
        _cost(
            u.get("model", model),
            u.get("inputTokens", 0),
            u.get("outputTokens", 0),
            u.get("cacheReadTokens", 0),
        )
        for u in usage
    )
    return Result(
        case, "", transcript, failures, True, "", cost=cost, calls=[call_of(u) for u in usage]
    )


_SURFACES = {
    "memory": _run_memory,
    "cast-memory": _run_cast_memory,
    "cast-file": _run_cast_file,
    "cast-answer": _run_cast_answer,
    "file": _run_file,
    "look": _run_look,
    "answer": _run_answer,
    "classify": _run_classify,
    "judge": _run_judge,
    "nightly": _run_nightly,
}


async def _run_one(
    client: AsyncAnthropic, case: Case, gate: asyncio.Semaphore, overrides: dict[str, str]
) -> Result:
    runner = _SURFACES.get(case.surface)
    if runner is None:
        return Result(case, "", "", [f"unknown surface {case.surface!r}"], False, "")
    model = overrides.get(case.surface) or MODELS[case.surface]
    async with gate:
        # The sink the worker opens per job, opened per case: classify, judge,
        # the reader and the look record what they used here, so a case's
        # cost and latency are read from the calls rather than guessed at.
        tap = _PrefixTap(client)
        with ledger.collecting():
            try:
                result = await runner(tap, case, model)
            except Exception as exc:  # noqa: BLE001
                # A harness fault in one case is that case's failure, never the
                # run's: the first full run died on an empty thread list.
                result = Result(
                    case, "", "", [f"harness raised {type(exc).__name__}: {exc}"], False, ""
                )
            small = [{**call_of(e), "via": "ledger"} for e in ledger.drain()]
        turn_model = next((c["model"] for c in result.calls), None)
        prefix = await _prefix_tokens(client, tap.turn_request(turn_model)) if turn_model else None
        result.calls = [
            {**c, "via": "turn", **({"prefix_tokens": prefix} if prefix is not None else {})}
            for c in result.calls
        ] + small
        if small and result.case.surface in ("classify", "judge", "look"):
            # These three priced themselves by a fixed guess before the sink
            # existed; the measured calls replace it.
            result.cost = metrics_of(small)["product_cost_usd"]
        return result


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


def scope_of(args: argparse.Namespace) -> str:
    """What the record and the history call this run. A subset given as a
    path is named by its stem: the whole path once went into a file name and
    the run crashed after it had charged."""
    subset = getattr(args, "subset", None)
    if subset:
        return Path(subset).stem
    return args.principle or args.surface or args.case or "all"


def _subset_ids(spec: str) -> set[str]:
    path = Path(spec)
    if not path.is_file():
        path = HERE / "subsets" / f"{spec}.json"
    if not path.is_file():
        print(f"no subset at {spec}")
        raise SystemExit(2)
    ids = json.loads(path.read_text(encoding="utf-8"))["cases"]
    return set(ids)


def _select(principles: list[Principle], args: argparse.Namespace) -> list[tuple[Principle, Case]]:
    picked: list[tuple[Principle, Case]] = []
    subset = _subset_ids(args.subset) if getattr(args, "subset", None) else None
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
            if subset is not None and c.id not in subset:
                continue
            if c.label_pending and not args.include_pending:
                continue
            if c.live and not args.live:
                continue
            picked.append((p, c))
    if subset is not None:
        missing = subset - {c.id for _, c in picked}
        if missing:
            # A typo would silently shrink the measurement.
            print(f"subset names cases that do not exist: {', '.join(sorted(missing))}")
            raise SystemExit(2)
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
    parser.add_argument(
        "--subset",
        help="a subsets/<name>.json, or a path to one: run exactly the cases it lists",
    )
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

    cap = spend.from_env()
    if cap:
        counts: dict[str, int] = {}
        for _, c in picked:
            counts[c.surface] = counts.get(c.surface, 0) + 1
        guess = spend.estimate(counts) * max(1, args.runs)
        why = spend.refusal(
            cap["log"],
            agent=cap["agent"],
            estimate=guess,
            agent_cap=cap["agent_cap"],
            total_cap=cap["total_cap"],
        )
        if why:
            print(why)
            return 3

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
    scope = scope_of(args)
    if cap:
        spend.append(
            cap["log"], agent=cap["agent"], scope=scope, cost_usd=spent, note=args.note or ""
        )
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
        "agent": cap.get("agent") if cap else None,
        # The product's cost and latency over the whole selection, which is
        # what the optimisation run scores. `cost_usd` above is the spend.
        **{
            k: v
            for k, v in metrics_of([c for r in results for c in r.calls]).items()
            if k in ("product_cost_usd", "warm_cost_usd", "prod_cost_usd", "latency_ms", "calls")
        },
        "principles": rows,
        "cases": [case_row(r) for r in results],
    }
    (RESULTS / f"{stamp}-{scope}.json").write_text(
        json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    record_history(record, note=args.note or "")
    # Every case's outcome, pooled across runs, is the noise band: see noise.py.
    noise.record(noise.CASES, record, agent=record.get("agent"))
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
    product = metrics_of([c for r in results for c in r.calls])
    lat = sorted(metrics_of(r.calls)["latency_ms"] for r in results)
    median = lat[len(lat) // 2] if lat else 0
    print(
        f"\n{len(passed)}/{len(results)} = {accuracy:.0%} in {elapsed:.0f}s, "
        f"about ${spent:.2f}, saved to {where}\n"
        f"product: ${product['product_cost_usd']:.3f} over {product['calls']} calls, "
        f"median case latency {median} ms"
    )
    return 0 if accuracy == 1.0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
