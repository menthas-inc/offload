"""The worker. Claims a dump, files it, posts the reply back.

Long-running and single-purpose. It holds no HTTP surface because nothing calls
it: work arrives by polling the jobs table, which is also the admission control
that bounds how many model calls can be in flight at once.

It writes nothing to the canonical tables. The reply goes back through the Core
API's internal endpoint, which is what keeps one writer.
"""

import asyncio
import contextlib
import dataclasses
import re
import signal
import time
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from datetime import date, datetime, timedelta

import httpx
import structlog
from anthropic import AsyncAnthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent import context as ctx_mod
from offload_agent import ledger, reader
from offload_agent import pdfs as pdfs_mod
from offload_agent.cancels import Cancels, listen
from offload_agent.config import Config
from offload_agent.context import DumpContext, Found, Pdf, Photo
from offload_agent.countries import name_of
from offload_agent.embed import SEARCH_SECONDS, query_embedder
from offload_agent.embed_jobs import KINDS as EMBED_KINDS
from offload_agent.embed_jobs import handle_embed
from offload_agent.found import found_in, kind_of, label_ok
from offload_agent.harness.look import LookFailed, look
from offload_agent.harness.plan import (
    NOT_IN_A_THREAD,
    Judgement,
    Outcome,
    classify,
    judge_answer,
    plan,
    plan_answer,
)
from offload_agent.heartbeat import heartbeats
from offload_agent.link_place import KINDS as LINK_PLACE_KINDS
from offload_agent.link_place import handle_link_place
from offload_agent.memories import KINDS as MEMORY_KINDS
from offload_agent.memories import handle_memories
from offload_agent.nightly import KINDS as NIGHTLY_KINDS
from offload_agent.nightly import handle_nightly, post_usage
from offload_agent.og import page, picture
from offload_agent.queue import (
    INTERACTIVE,
    ClaimedJob,
    claim,
    finish,
    reap,
    release_for_retry,
    retry_or_die,
)
from offload_agent.renditions import prepare
from offload_agent.transcribe import TranscriptionFailed, forget, poll, submit

log = structlog.get_logger()


class InvalidOutput(Exception):
    """The model finished without saying anything. Kept distinct from a
    transport failure so the two retry differently."""


class ReportFailed(Exception):
    """The answer exists and could not be handed over. Distinct from a model
    failure, because the two want opposite responses: a model failure should be
    reported, and this one cannot be."""


KINDS = [
    "dump.answer",
    "voice.forget",
    *EMBED_KINDS,
    *NIGHTLY_KINDS,
    *MEMORY_KINDS,
    *LINK_PLACE_KINDS,
]


async def _post_result(
    client: httpx.AsyncClient, cfg: Config, body: dict, *, path: str = "turn-result"
) -> dict | None:
    """Report the outcome, retrying the report itself.

    Worth its own retry rather than folding into the job's. By the time this is
    called the model has already answered and been paid for, so treating a
    momentary blip on the private network as a job failure throws away an answer
    somebody is waiting on and buys it again. The endpoint is idempotent, so
    repeating the post is free.
    """
    last: Exception | None = None
    for attempt in range(3):
        try:
            response = await client.post(
                f"{cfg.api_url}/internal/v1/{path}",
                json=body,
                headers={"authorization": f"Bearer {cfg.internal_token}"},
                timeout=30.0,
            )
            response.raise_for_status()
            try:
                return response.json() if response.content else None
            except ValueError:
                return None
        except httpx.HTTPStatusError as exc:  # noqa: PERF203
            # **A 4xx is the body being wrong, and retrying it is three of the
            # same refusal.** Worse, the reason never reached a log: a turn that
            # did the work and was refused over an array length looked exactly
            # like a network blip. The status and the route, never the body,
            # which holds what the turn filed.
            last = exc
            if exc.response.status_code < 500:
                # The status and the route, never the body: a validation
                # error echoes what was sent, and what was sent is content.
                log.error("result refused", status=exc.response.status_code, path=path)
                break
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))
        except Exception as exc:  # noqa: BLE001, PERF203
            last = exc
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))

    raise ReportFailed(str(type(last).__name__)) from last


#: What the running job's lookups were, set by its lane. A timeout cancels
#: the job's task, whose budget is a local, and the paid rows still go in the
#: failure report. The task's context is a copy; the dict is the same one.
_SPENT: ContextVar[dict | None] = ContextVar("job_spent", default=None)


class Lookups:
    """The turn's own web budget, and the record of what it spent it on.

    **The bounds belong to the turn rather than to a call.** A dump can ask for
    three things and each `look_up` would otherwise get its own three searches,
    which is how a bound stated per turn becomes nine.
    """

    #: Per turn, both of them.
    SEARCHES = 3
    READS = 3

    def __init__(
        self,
        dump: str,
        *,
        may_search: bool,
        may_read_links: bool,
        maps_on: bool = True,
        country: str | None = None,
        today: str | None = None,
        links: str | None = None,
    ) -> None:
        self.dump = dump
        #: 026. What a URL has to appear in to be fetched: the dump, or for a
        #: forwarded email the person's note alone, since a link in somebody
        #: else's email can confirm, cancel or unsubscribe by being opened.
        #: A search question still draws on the whole email: it reads and
        #: does not act.
        self.links = dump if links is None else links
        #: Where they said they are, so the bound lets the query name it.
        self.country = country
        #: What day it is, for the reader. Asked when the clocks change, it
        #: read a page listing both changes of the year and returned the one
        #: in March, six months gone, because nothing had told it the date.
        self.today = today
        self.may_search = may_search
        self.may_read_links = may_read_links
        #: 034. The owner's map switch, as the turn's context read it.
        self.maps_on = maps_on
        self.searches = 0
        self.reads = 0
        self.sources: list[dict] = []
        self.rows: list[dict] = []
        if (spent := _SPENT.get()) is not None:
            spent["lookups"] = self.rows

    def left(self) -> int:
        return max(0, self.SEARCHES - self.searches)

    def record(self, *, label: str, kind: str, outcome: str, cost_micros: int = 0) -> None:
        """One row per lookup: a closed label, what became of it, what it cost.

        Never the question and never the URL. A query is somebody's own sentence
        and anonymising it does not make it not content (OFF-1).
        """
        self.rows.append(
            {"label": label, "kind": kind, "outcome": outcome, "costMicros": cost_micros}
        )
        # **A refusal leaves a line.** The used and failed outcomes were logged
        # at the call site and the refused ones only here, in the ledger, so a
        # turn refused twice by the bound logged nothing and then reported
        # `failed=['look_up', 'look_up']`, which reads as a broken tool. Label
        # and outcome only, the same as the call site.
        if outcome.startswith("refused"):
            log.info("looked up", label=label, kind=kind, outcome=outcome)


def _declined(error: str) -> dict:
    """A lookup the bound refused, as the model sees it.

    `ok: False` so the loop hands it back as an error and the model reads the
    reason; `declined` so the harness does not count it as a failed tool. The
    bound refusing is the tool working, and a turn it refused is a turn that can
    still finish: the model can ask differently or answer with what it has.
    """
    return {"ok": False, "declined": True, "error": error}


#: Words a query may add to the dump's own.
#:
#: **A closed list, and every word on it is empty.** The bound exists to stop
#: content leaving: a name, an address, a detail from somebody else's note in a
#: shared thread. "when" carries none of that, and neither does "is". What is
#: excluded is the whole point: no proper nouns, no places, no numbers, nothing
#: that could identify anybody or anything, so the list can be read and checked
#: rather than trusted.
#:
#: Why it exists at all: the first version refused the flagship example. Asked to
#: book a restaurant for mothers day, the planner sent "when is mothers day",
#: which is the dump's own words plus two function words, and the bound threw it
#: out. The eval missed it because the stub answered every lookup `ok` without
#: running the check, so a refused query looked exactly like a successful one.
_FILLER = frozenset(
    [
        "a",
        "an",
        "the",
        "this",
        "that",
        "these",
        "those",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "am",
        "do",
        "does",
        "did",
        "doing",
        "done",
        "what",
        "when",
        "where",
        "which",
        "who",
        "whom",
        "whose",
        "why",
        "how",
        "of",
        "in",
        "on",
        "at",
        "to",
        "for",
        "from",
        "by",
        "with",
        "about",
        "into",
        "over",
        "under",
        "and",
        "or",
        "not",
        "no",
        "nor",
        "but",
        "if",
        "then",
        "than",
        "it",
        "its",
        "they",
        "them",
        "their",
        "there",
        "here",
        "time",
        "date",
        "dates",
        "times",
        "day",
        "days",
        "today",
        "tomorrow",
        "year",
        "years",
        "open",
        "opens",
        "opening",
        "close",
        "closes",
        "closing",
        "hours",
        "next",
        "last",
        "this",
        "coming",
        "will",
        "would",
        "shall",
        "forecast",
        "weather",
        # Every month and every weekday. The same closed, content-free set the
        # year rule covers, and the same reason: a date the planner worked out
        # from today is not something anybody wrote. "Do the clocks change in
        # September October 2026" was refused over two month names.
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ]
)


_APOSTROPHE = re.compile(r"['\u2019]")


def _from_the_dump(text: str, dump: str, country: str | None = None) -> bool:
    """Every word of it is either in the dump or is a word that carries nothing.

    **A bound on composition rather than on judgement**, which is the only kind
    that survives an injected instruction. The planner may use everything it
    knows to decide whether to look something up; it may only send out of the
    sentence in front of it, plus the closed list of function words above.
    Without this, a note another member wrote in a shared thread can steer a
    query carrying their details to a search company, and nothing in the refusal
    list or the bounds would notice.

    Still coarse on purpose. The failure mode is a refused lookup that was fine,
    which costs a lookup; the other direction costs somebody their address.
    """
    _, haystack = _allowed(dump, country)
    return all(_passes(w, haystack) for w in _words(text))


def _within_the_dump(text: str, dump: str, country: str | None = None) -> str | None:
    """The query with every word the bound would refuse dropped, in order, or
    None when none of the person's own words is left or most were dropped.

    The owner's call, 2026-10-13: a query that strayed by one word ("march
    saturday route Portugal") was refused whole and the model retried in their
    words, a model call spent every time. **It cannot widen what leaves**: each
    word kept passes `_from_the_dump`'s own test, so the result is the same set
    of words the bound allowed before, only fewer of them. A query left with
    nothing they wrote, only filler and a country, carries nothing to search
    for and is refused as before.
    """
    theirs, haystack = _allowed(dump, country)
    words = _words(text)
    kept = [w for w in words if _passes(w, haystack)]
    if not any(w in theirs or _same_word(w, theirs) for w in kept):
        return None
    # **Mostly from somewhere else is refused whole** (security review,
    # 2026-10-14). A stray word is a slip; a query whose words mostly are not
    # theirs was composed from something other than the dump, and that was
    # the signal the all-or-nothing bound acted on.
    if (len(words) - len(kept)) * 2 > len(words):
        return None
    return " ".join(kept)


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", _APOSTROPHE.sub("", text).lower())


def _passes(word: str, haystack: set[str]) -> bool:
    return (
        word in haystack
        or word in _FILLER
        or _a_year_from_today(word)
        or _same_word(word, haystack)
    )


def _allowed(dump: str, country: str | None) -> tuple[set[str], set[str]]:
    """What they wrote, and that plus their country."""
    # An apostrophe joins rather than splits: "mother's" and "mothers" are
    # one word, where the split left a bare "s" the dump never held.
    dump = _APOSTROPHE.sub("", dump)
    haystack = set(re.findall(r"[a-z0-9]+", dump.lower()))
    # "the 22nd" in the dump admits "22" in the query. The token is theirs and
    # only its shape changes, the allowance `_same_word` makes for letters. A
    # number they did not write is still refused.
    haystack |= set(re.findall(r"\b(\d{1,2})(?:st|nd|rd|th)\b", dump.lower()))
    theirs = set(haystack)

    # **Their own country, when they have set one.** It is not in the dump and it
    # has to reach the query, because a bank holiday with no country attached has
    # no answer: without this the bound refuses the one word that makes the
    # lookup correct. Safe for the same reason the year and the month names are:
    # a closed set of about 250 values, chosen by them in settings, carrying
    # nothing anybody wrote.
    if country:
        # **The code and the name.** The prompt says "They are in Portugal", so
        # that is the word the model writes into a query, and a bound that knew
        # only "PT" refused it. Both, because either spelling is theirs.
        haystack |= set(re.findall(r"[a-z0-9]+", country.lower()))
        named = name_of(country)
        if named:
            haystack |= set(re.findall(r"[a-z0-9]+", named.lower()))
    return theirs, haystack


#: How much of a word has to match before two spellings count as one word.
#:
#: Four, because three lets "car" reach "card" and "cardiff", and five refuses
#: "closes" against "close". It is a blunt instrument standing in for a stemmer,
#: and a stemmer is a dependency and a language assumption this does not need.
_STEM = 4


def _same_word(word: str, dump_words: set[str]) -> bool:
    """The dump's own word in a different shape.

    "Cycle to the coast on Sunday if the bridge is open" produced the query
    "is the bridge open sunday for cycling to the coast", and the bound threw it
    out over `cycling`, which is the dump's own `cycle` with three letters on the
    end. Every dump that becomes a question does this to at least one word.

    **It cannot widen what leaves.** A token passes only if it shares four
    letters of prefix with something the person actually wrote, so the words
    still come from the dump; what changes is that they no longer have to be
    spelled identically.
    """
    return any(
        len(other) >= _STEM
        and len(word) >= _STEM
        and (word.startswith(other[:_STEM]) and other.startswith(word[:_STEM]))
        for other in dump_words
    )


def _a_year_from_today(word: str) -> bool:
    """This year or next, and nothing else.

    **The narrowest possible hole, and it has to exist.** "Remembrance sunday" is
    a date, the planner knows what year it is because the prompt tells it, and
    "remembrance sunday 2026" was refused for the one token the dump could never
    contain. Every "when is X" lookup has that shape.

    Two values, so this carries about one bit. A year cannot hold a name, an
    address, or anything anybody wrote, which is what the bound protects. Any
    other number stays refused: "flat 34" and a phone number are exactly the
    tokens this rule exists to keep in.
    """
    if not word.isdigit() or len(word) != 4:
        return False
    this_year = date.today().year
    return int(word) in (this_year, this_year + 1)


def _in_the_dump(url: str, dump: str) -> bool:
    """The URL was dumped by this person, as a link, in this message.

    Matched against the dump rather than against the thread, so a URL somebody
    else wrote into a shared thread is not fetchable however it got into the
    model's context, and a URL the model composed is not fetchable at all.
    """
    return url in re.findall(r"https?://[^\s<>\"\')]+", dump)


async def _look_up(
    client: "AsyncAnthropic",
    cfg: Config,
    budget: Lookups,
    args: dict,
    say: "StepWriter | None" = None,
    http: httpx.AsyncClient | None = None,
) -> dict:
    """Answer a `look_up` without leaving the worker.

    Nothing here writes, so nothing crosses to the Core API: the sources and the
    counters ride home on the turn result the worker already posts.

    The one exception is 017's step, which goes out before the lookup runs. That
    ordering is the guarantee: a line written before anything is fetched cannot
    carry anything fetched.
    """
    question = (args.get("question") or "").strip() or None
    url = (args.get("url") or "").strip() or None

    if (question is None) == (url is None):
        # **Recorded and logged, like every other refusal.** This was the one
        # path that returned without touching the ledger, so a production turn
        # that hit it left `lookups` empty and the agent log silent, and there
        # was no way to tell it from a turn that never wanted a lookup. Found by
        # having to guess at exactly that, on a phone, with the table in front of
        # me saying nothing.
        budget.record(label="other", kind="search", outcome="refused_bound")
        log.info("lookup malformed", both=bool(question and url))
        return _declined("give exactly one of question and url")

    if url:
        if not budget.may_read_links:
            # **Recorded and logged like every other refusal.** These two were
            # the last paths that returned in silence, and they were the ones
            # production hit: the `lookups` table was empty, the log said
            # nothing, and a turn refused by a switch was indistinguishable from
            # a turn that never wanted a lookup. It took four phone turns to
            # find that the switch was false because `fit` had dropped it.
            budget.record(label="link_metadata", kind="read", outcome="refused_bound")
            log.info("lookup refused", why="links off")
            return _declined("reading links is switched off")
        if not _in_the_dump(url, budget.links):
            budget.record(label="link_metadata", kind="read", outcome="refused_bound")
            return _declined("that url is not in what they dumped")
        if budget.reads >= budget.READS:
            budget.record(label="link_metadata", kind="read", outcome="refused_bound")
            return _declined("limit_reached")
    else:
        if not budget.may_search:
            budget.record(label="other", kind="search", outcome="refused_bound")
            log.info("lookup refused", why="search off")
            return _declined("searching is switched off")
        kept = _within_the_dump(question or "", budget.dump, budget.country)
        if kept is None:
            budget.record(label="other", kind="search", outcome="refused_bound")
            # **The refusal says how to recover.** The loop hands this back to
            # the model, which can try again; "ask using only words from what
            # they dumped" did not say that the country was allowed or that a
            # date it worked out was not, so it retried with the same shape.
            return _declined(
                "ask using only the words they dumped, plus their country. "
                "no dates you worked out, no extra clauses. try a shorter query."
            )
        if budget.left() == 0:
            budget.record(label="other", kind="search", outcome="refused_bound")
            return _declined("limit_reached")
        # The words that passed, and only those, are what is searched.
        question = kept

    # **Before the reader, and only once the bounds have passed.** A step for a
    # lookup that was about to be refused would put a line on screen for work
    # that never happened.
    if say is not None:
        await say(args.get("doing") or "")

    reading = await reader.read(
        client,
        cfg.reader_model,
        question=question,
        url=url,
        want=list(args.get("want") or []),
        searches=budget.left() if question else 0,
        fetches=reader.FETCHES_PER_LINK
        if url
        else min(reader.FETCHES_PER_QUESTION, budget.READS - budget.reads),
        today=budget.today,
        country=budget.country,
    )

    budget.searches += reading.searches
    budget.reads += reading.fetches
    for entry in reading.usage:
        ledger.record({k: v for k, v in entry.items() if k != "webSearches"})
    for source in reading.found.sources:
        entry = {"domain": source.domain, "url": source.url}
        if entry not in budget.sources:
            budget.sources.append(entry)

    # What the sources say instead reaches the reply, so it is used, not empty.
    known = {} if reading.failed else reading.found.known
    outcome = (
        "failed" if reading.failed else ("empty" if reading.found.unsure and not known else "used")
    )
    # The label and the outcome, never the query and never the URL. Enough to
    # tell a refused turn from a quiet one without putting a word of theirs in a
    # log (OFF-1).
    log.info(
        "looked up",
        label=reading.found.label,
        kind="read" if url else "search",
        outcome=outcome,
        known=bool(known),
    )
    budget.record(
        label=reading.found.label,
        kind="read" if url else "search",
        outcome=outcome,
        cost_micros=sum(u.get("webSearches", 0) for u in reading.usage) * 10_000,
    )

    if reading.failed or reading.found.unsure:
        return {"ok": True, "found": False, **({"known": known} if known else {})}

    fields = dict(reading.found.fields)

    # The page's own picture, read from the page rather than asked of the model.
    #
    # **The model cannot see it.** The provider's fetch returns the page as text
    # and `og:image` is a meta tag in the head, so asking for it in `want`
    # produced a field that was never once populated. Tried first, measured,
    # and replaced by this.
    #
    # Only on a URL they dumped, only when the lookup already succeeded, and
    # never on a search: this is one extra request against a page we have just
    # read anyway, and it is worth that only when there is a row to put it on.
    if http is not None and url and "image" in (args.get("want") or []):
        found = await picture(http, url)
        if found:
            fields["image"] = found

    # Fields and sources. **Not the title and not a quoted excerpt**, which are
    # written by whoever owns the page.
    return {
        "ok": True,
        "found": True,
        "fields": fields,
        "sources": [s["domain"] for s in budget.sources],
    }


#: 030. The names the worker's page envelope travels under, in either spelling,
#: which nothing the model sends may carry.
_ENVELOPE_KEYS = ("worker", "pageLocation", "pageRead", "page_location", "page_read")


def resolve_actions(
    actions: list,
    *,
    found: "list[Found]",
    pdf: int | None = None,
    body: str | None = None,
) -> list[dict]:
    """044, 050. Turn the model's choices into gathered destinations.

    The model names an entry of the turn's set by its number, or on a
    picture's row quotes one from that row's own `Text:` line, and writes a
    label; it never writes a destination. This is the bound between the model
    and the worker: a number out of range, a PDF's entry on any row but that
    PDF's, a quote that gathering the `Text:` line does not find, a label
    `label_ok` refuses, a duplicate, a third. Each kept entry carries its kind
    and where it came from, for the confirm. Shared with the evals so they
    exercise this bound rather than a copy of it (the 2026-10-17 stub lesson)."""
    at = body.find("Text:") if body else -1
    text_line = body[at:] if body and at >= 0 and (at == 0 or body[at - 1] == "\n") else None
    resolved: list[dict] = []
    seen: set[str] = set()
    for action in actions or []:
        if not isinstance(action, dict) or not label_ok(action.get("label")):
            continue
        link, quoted = action.get("link"), action.get("found")
        entry: Found | None = None
        if isinstance(link, int) and not isinstance(link, bool) and quoted is None:
            if 1 <= link <= len(found):
                entry = found[link - 1]
                if entry.origin.startswith("pdf:") and entry.origin != f"pdf:{pdf}":
                    entry = None
        elif isinstance(quoted, str) and link is None:
            dest = found_in(quoted, text_line)
            entry = Found(dest, "picture", "picture") if dest else None
        if entry is None or entry.dest in seen or kind_of(entry.dest) is None:
            continue
        seen.add(entry.dest)
        one = {
            "label": action["label"].strip(),
            "url": entry.dest,
            "kind": kind_of(entry.dest),
            "source": entry.source,
        }
        if entry.sender:
            one["sender"] = entry.sender
        resolved.append(one)
        if len(resolved) >= 2:
            break
    return resolved


#: 017. One line to the Core API, which puts it on screen.
StepWriter = Callable[[str], Awaitable[None]]


def _step_writer(http: httpx.AsyncClient, cfg: Config, job_id: str) -> StepWriter:
    """Post the current step, and never let it break the turn.

    **Failures are swallowed on purpose.** A progress line is the least
    important thing happening on this turn: dropping the post loses a sentence,
    and raising would lose the answer. The client falls back to the writing
    indicator when no step arrives, which is what AC-3 already specifies for a
    turn that produced none.

    The cap is the server's (AC-4), so nothing is truncated here. An overlong
    line is refused and not drawn, which is visible in a way that a silently
    trimmed sentence is not.
    """

    async def say(text: str) -> None:
        line = text.strip()
        if not line:
            return
        try:
            await http.post(
                f"{cfg.api_url}/internal/v1/turn-step",
                json={"jobId": job_id, "text": line},
                headers={"authorization": f"Bearer {cfg.internal_token}"},
                timeout=5.0,
            )
        except Exception as exc:  # noqa: BLE001
            log.info("step undelivered", job_id=job_id, error_type=type(exc).__name__)

    return say


def _tool_caller(
    http: httpx.AsyncClient,
    cfg: Config,
    job_id: str,
    embedder: "Callable[[str], Awaitable[str | None]] | None" = None,
    lookups: "tuple[AsyncAnthropic, Config, Lookups] | None" = None,
    say: "StepWriter | None" = None,
    found: "list[Found] | None" = None,
):
    """The loop's only route to a write.

    A closure over the job id rather than a parameter the loop passes, because
    the job id is what the Core API derives the account from, and a loop that
    can name a job is a loop that could name the wrong one.

    Retried on transport failure and not on a refusal. A refusal comes back as a
    200 with ok false and is data the planner is meant to read; only the network
    is retried, and the endpoint is idempotent on the tool call id so a repeat
    cannot file twice.
    """

    #: 028. Once the turn has read the web, a page's words are in the model's
    #: context, and a page must not choose which thread a row is offered to.
    #: Only this process knows a read happened, so this is where it is held;
    #: the Core API refuses the same after an email or a calendar.
    read_web = False

    async def call(tool: str, tool_call_id: str, args: dict) -> dict:
        nonlocal read_web
        # The one tool that never reaches the Core API, because it writes
        # nothing. It reads the web in a call that holds none of this person's
        # data, and what comes back is fields.
        if tool == "look_up":
            if lookups is None:
                return {"ok": False, "error": "not available on this turn"}
            read_web = True
            return await _look_up(lookups[0], lookups[1], lookups[2], args, say, http)

        # 038. A memory after a web read is refused by the Core API, which
        # cannot see the read for itself. The loop sets this too; either is
        # enough.
        if tool == "memory":
            args = {**args, "after_lookup": bool(args.get("after_lookup")) or read_web}

        if read_web and tool in ("add_content", "add_note"):
            args = {key: value for key, value in args.items() if key != "suggest_thread_id"}

        # **The page's picture, on any link being filed.**
        #
        # Not only when the model happened to call `look_up` first. It filed
        # `https://www.bbc.co.uk/news` without reading it, correctly, because it
        # knows what that is, and the row came out with no picture: the image was
        # a side effect of a lookup rather than a property of filing a link. One
        # request against a page somebody chose to keep is the whole cost.
        #
        # Bounded by the same rule the lookup uses: the URL has to be one they
        # dumped. A URL the model composed is not fetched, which matters because
        # this is our own network making the request.
        #
        # 030. The same one request also reads where the page says it is, when
        # the dumper's *Read links I paste* and the map are both on, even if the
        # model already gave a picture. What it finds rides in the worker's own
        # envelope, which the model has no field for.
        envelope: dict | None = None
        if (
            tool == "add_content"
            and args.get("type") == "link"
            and args.get("url")
            and lookups is not None
            and _in_the_dump(str(args["url"]), lookups[2].links)
        ):
            read_location = cfg.maps_on and lookups[2].maps_on and lookups[2].may_read_links
            if read_location or not args.get("image_url"):
                meta = await page(http, str(args["url"]), read_location=read_location)
                if meta.image and not args.get("image_url"):
                    args = {**args, "image_url": meta.image}
                if read_location:
                    envelope = {"pageRead": True}
                    if meta.location:
                        envelope["pageLocation"] = meta.location

        # 044, 050. A row's actions. The model named entries of the turn's set
        # by number, or quoted a picture's from its row's `Text:` line; resolve
        # each here, where the set lives, and put the resolved entries on the
        # worker's own envelope. The model has no field for a destination, so
        # the only trust boundary is model-to-worker (`resolve_actions`). The
        # model's own `actions` never reach the Core API (stripped below with
        # the envelope names).
        if tool == "add_content" and args.get("actions"):
            resolved = resolve_actions(
                args["actions"],
                found=found or [],
                pdf=args.get("pdf"),
                body=args.get("body") if args.get("photo") is not None else None,
            )
            if resolved:
                envelope = {**(envelope or {}), "actions": resolved}

        payload = {"tool": tool, "jobId": job_id, "toolCallId": tool_call_id, **_camel(args)}
        # Whatever the model put under the envelope's names is dropped before the
        # worker's own is added. Pydantic drops undeclared keys first
        # (`plan.py`); this holds if that ever changes. 044's `actions` is a real
        # model field (candidate numbers), so it is dropped explicitly: only the
        # worker's resolved copy on the envelope reaches the Core API.
        for key in (*_ENVELOPE_KEYS, "actions"):
            payload.pop(key, None)
        if envelope is not None:
            payload["worker"] = envelope

        # The query embedding is attached here, not asked of the model.
        #
        # The agent plane owns the Voyage client, so this is where a query can
        # become a vector. **The model has no field it could set**, which is the
        # same reasoning 012 gives for confirmation: some of what it read was
        # written by somebody else, and a field it can fill is a decision handed
        # to whoever wrote that. Absent means the text arm answers alone: search
        # is worse, not broken, and there is nothing for the person to do about
        # it so nothing is said.
        if tool == "search" and embedder is not None:
            payload["queryVector"] = await embedder(str(args.get("query", "")))
        last: Exception | None = None
        for attempt in range(3):
            try:
                response = await http.post(
                    f"{cfg.api_url}/internal/v1/tool-call",
                    json=payload,
                    headers={"authorization": f"Bearer {cfg.internal_token}"},
                    timeout=30.0,
                )

                # A 4xx is a decision, not a blip.
                #
                # **This cost a real turn.** The endpoint refused a malformed
                # argument with a 400, this retried it three times as though the
                # network had dropped, and then reported "unavailable" to the
                # model, which told somebody "the task tool seems to be down".
                # It was up. It had said no, clearly, and the answer was thrown
                # away and replaced with a lie.
                #
                # A malformed request will be malformed again, so retrying is
                # pure delay. It comes back as a refusal the planner can read
                # and act on, which is what it should have been all along.
                if response.status_code in (400, 422):
                    log.warning("tool call refused", job_id=job_id, status=response.status_code)
                    return {"ok": False, "declined": True, "error": "invalid_arguments"}
                # A 401, a 403, a 404 or a 429 is not the model's to fix: a
                # rotated token, a job that is not this one, a rate. Told as
                # the model's own mistake it would spend every round trip
                # fixing what it did not break.
                if 400 <= response.status_code < 500:
                    log.warning("tool call refused", job_id=job_id, status=response.status_code)
                    return {"ok": False, "error": "unavailable"}

                response.raise_for_status()
                return _declined_if_argument(response.json())
            except Exception as exc:  # noqa: BLE001, PERF203
                last = exc
                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))

        # Three failures is the network. Reported to the model as a failed tool
        # so the turn can still finish and say what landed, rather than raised,
        # which would throw away everything already filed.
        log.error("tool call undeliverable", job_id=job_id, error_type=type(last).__name__)
        return {"ok": False, "error": "unavailable"}

    return call


# The Core API's refusals that are about the arguments the model sent, as
# against the server being unable: a row with no time, a thread it cannot see,
# a date it cannot parse. The model reads the reason and
# fixes the call, and the turn is not partial for it.
#
# **Refused `no_time`, the model did the right thing and the person still saw
# "That did not finish."** It filed, was refused, put the time on the same row
# and wrote the event: five calls, every one right, and the loop counted the
# refusal as a failed tool, so the reply was built as a partial turn with a
# Finish control against a turn that had finished. A refusal the model can
# answer is a decline, the way the lookup bound's are.
#
# **Two of these are permanent, and are here on purpose.** `not_yours` and
# `read_only` cannot be fixed by different arguments, but a failed tool has
# the worker replace whatever the model said with "That did not finish." and
# a Finish control that repeats the refusal every time. The prompt scripts
# both: somebody else's row is refused "and that is correct", said once, and
# a calendar it may only read is said once. Declined, the sentence reaches
# the person; failed, it never does. `needs_reconnect` and `unavailable` stay
# failures: the server could not, and a Finish control is the right offer.
ARGUMENT_REFUSALS = frozenset(
    {
        # 038. A memory refused: the model says the fixed line for it once.
        "untrusted_turn",
        "not_their_words",
        "never_list",
        "too_long",
        "empty",
        "unknown_memory",
        # 040. No room: the person makes it in Memories.
        "rules_full",
        "memories_full",
        "unknown_thread",
        # 025. label_content's, each answerable by a different call.
        "not_in_the_dump",
        "label_limit",
        "person_set",
        "person_deleted",
        "unknown_photo",
        # 041. The same for a PDF's index.
        "unknown_pdf",
        "bad_place_name",
        # 030. A location on a row that is not an event.
        "location_not_here",
        "unknown_content",
        "not_yours",
        "bad_date",
        # 023. A rule outside the grammar, on the same three tools as a bad
        # date and for the same reason: the model reads it and files without.
        "bad_rule",
        # 022. share_thread's, each a sentence the person should get once:
        # nobody by that name, the default thread, somebody already in.
        "unknown_person",
        "default_thread",
        "not_connected",
        "already_in",
        "waiting",
        "too_many",
        "unknown_calendar",
        "read_only",
        "already_on_calendar",
        "no_time",
        "unknown_event",
        "different_time",
        "invalid_arguments",
    }
)


# The refusals that stay failures, by name, so that a code the tool routes add
# later is in one set or the other and never in neither: the test reads the
# routes' own enum. The server could not, and the worker answers for it.
SERVER_REFUSALS = frozenset({"limit_reached", "needs_reconnect", "thread_memory_full"})


def _declined_if_argument(body: dict) -> dict:
    """Mark a refusal about the arguments as declined, so the loop does not
    count it as a tool that failed. The loop records the name and the reason
    on `Outcome.declined`, so a refusal the server made is still in the log."""
    if isinstance(body, dict) and not body.get("ok") and body.get("error") in ARGUMENT_REFUSALS:
        return {**body, "declined": True}
    return body


def _camel(args: dict) -> dict:
    """snake_case in Python, camelCase on the wire. One mapping, here, rather
    than a second spelling of every field in the pydantic models."""
    out = {}
    for key, value in args.items():
        head, *rest = key.split("_")
        out[head + "".join(part.title() for part in rest)] = value
    return out


def _questions_wire(outcome: Outcome) -> list[dict]:
    """018. What the turn asked back, camelCased for the Core API, which renders
    the sentence and validates every value against the field."""
    # Values only. A label the model did not write is not sent as null: the
    # Core API words every option itself and refused the whole result for one.
    return [
        _camel({**q, "options": [{"value": o["value"]} for o in q.get("options", [])]})
        for q in outcome.questions
    ]


_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CLOCK = re.compile(r"^\d{2}:\d{2}$")


def _parse_day(value: str | None, today: date | None) -> str | None:
    """A YYYY-MM-DD day within a year of today, or nothing."""
    if not value or not _DAY.match(value):
        return None
    try:
        day = date.fromisoformat(value)
    except ValueError:
        return None
    if today is not None and abs((day - today).days) > 366:
        return None
    return value


def _today_date(today: str | None) -> date | None:
    """The day the context names, back into a date. Formatted by the database
    as 'Tuesday 15 September 2026'; anything else is simply unknown."""
    if not today:
        return None
    try:
        return datetime.strptime(today, "%A %d %B %Y").date()
    except ValueError:
        return None


def parse_answer(
    field: str, verdict: Judgement, options: list[dict], today: str | None
) -> dict | None:
    """018. The judge's value, checked for shape and sense in code.

    A value that fails is not an answer, whatever the model said. Dates within a
    year, a span in order, a country among the values offered.
    """
    if not verdict.answers:
        return None
    anchor = _today_date(today)
    if field == "date":
        day = _parse_day(verdict.day, anchor)
        return {"day": day} if day else None
    if field == "span":
        start = _parse_day(verdict.day, anchor)
        end = _parse_day(verdict.to, anchor)
        if start and not end:
            # One date typed for a stay is one night (decided 2026-09-17).
            end = (date.fromisoformat(start) + timedelta(days=1)).isoformat()
        if not start or not end or end < start:
            return None
        return {"from": start, "to": end}
    if field == "time":
        day = _parse_day(verdict.day, anchor)
        clock = verdict.time if verdict.time and _CLOCK.match(verdict.time) else None
        if not day or not clock:
            return None
        hours, minutes = clock.split(":")
        if int(hours) > 23 or int(minutes) > 59:
            return None
        return {"day": day, "time": clock}
    offered = {str(o.get("value")) for o in options if o.get("value") is not None}
    if field == "country":
        code = (verdict.country or "").upper()
        return {"country": code} if code and code in offered else None
    if field == "thread":
        # 020. One of the threads offered, by id, or by the name the person
        # typed matching an option's label. Never a thread not on the list.
        picked = (verdict.thread or "").strip()
        if picked in offered:
            return {"thread": picked}
        lowered = picked.lower()
        for option in options:
            label = str(option.get("label", "")).lower()
            if option.get("value") is not None and label == lowered:
                return {"thread": str(option["value"])}
        return None
    return None


def describe_value(field: str, value: dict) -> str:
    """The value as the planner's block names it. Ours, never a page's."""
    if field == "span":
        return f"{value.get('from')} to {value.get('to')}"
    if field == "time":
        return f"{value.get('day')} at {value.get('time')}"
    if field == "thread":
        # An id would mean nothing in the planner's block; the server records
        # the thread's name against the answering message.
        return "a thread they chose"
    return str(next(iter(value.values()), ""))


def _usage_wire(outcome: Outcome | None) -> list[dict]:
    """Every call the job made: the planner's, and the small calls around it
    that recorded into the job's sink. Tokens only; core-api prices them."""
    planner = [
        {
            "model": u.model,
            "inputTokens": u.input_tokens,
            "outputTokens": u.output_tokens,
            "cacheReadTokens": u.cache_read_tokens,
            "cacheWriteTokens": u.cache_write_tokens,
            "latencyMs": u.latency_ms,
        }
        for u in (outcome.usage if outcome else [])
    ]
    return planner + ledger.drain()


USAGE_ON_CANCEL_SECONDS = 10


async def handle(
    job: ClaimedJob,
    *,
    cfg: Config,
    engine,
    anthropic: AsyncAnthropic,
    http: httpx.AsyncClient,
) -> None:
    """One job, with a ledger sink open for the small calls it makes."""
    with ledger.collecting():
        try:
            await _handle(job, cfg=cfg, engine=engine, anthropic=anthropic, http=http)
        except asyncio.CancelledError:
            # The lane's timeout, after a call was made: still paid for. A
            # dump's failure carries no usage on any path, so only the rest.
            # Bounded: the lane cannot retry until this returns, and the lock
            # goes stale a minute after the timeout fired.
            if job.kind != "dump.answer":
                with contextlib.suppress(TimeoutError):
                    async with asyncio.timeout(USAGE_ON_CANCEL_SECONDS):
                        await post_usage(http, cfg, job.id)
            raise


async def _handle(
    job: ClaimedJob,
    *,
    cfg: Config,
    engine,
    anthropic: AsyncAnthropic,
    http: httpx.AsyncClient,
) -> None:
    """One job. Never raises: the outcome always reaches the Core API, because a
    dump that silently stops being answered is indistinguishable from one still
    being thought about."""
    if job.kind in MEMORY_KINDS:
        # 038. As the nightly pass: nobody is waiting, so a failure releases
        # the job and the account keeps every memory it has. The type, never
        # the value (OFF-1).
        try:
            await handle_memories(job, cfg=cfg, engine=engine, http=http, client=anthropic)
        except Exception as exc:  # noqa: BLE001
            log.error("memory pass failed", kind=job.kind, error=type(exc).__name__)
            # A call made before the failure was still paid for.
            await post_usage(http, cfg, job.id)
            async with engine.begin() as conn:
                await retry_or_die(conn, job, "memory_error", delay_seconds=3600)
        return

    if job.kind in NIGHTLY_KINDS:
        # 032. Nobody is waiting on a nightly pass, so a failure releases the
        # job and the thread keeps every note it has. Wrapped because it
        # returns before the catch-all, and a stuck `running` row is nothing's
        # job to reap.
        try:
            await handle_nightly(job, cfg=cfg, engine=engine, http=http, client=anthropic)
        except Exception as exc:
            # **`log.error`, never `log.exception`.** The type, never the value:
            # an SDK exception can echo the request body, and the request body
            # here is somebody's notes and dumps (OFF-1).
            log.error("nightly failed", kind=job.kind, error=type(exc).__name__)
            # A call made before the failure was still paid for.
            await post_usage(http, cfg, job.id)
            async with engine.begin() as conn:
                await retry_or_die(conn, job, "nightly_error", delay_seconds=3600)
        return

    if job.kind in LINK_PLACE_KINDS:
        # 030. One page read for one kept link. No retry: a page that does not
        # answer leaves the link as it is. The type, never the value.
        try:
            await handle_link_place(job, cfg=cfg, engine=engine, http=http)
        except Exception as exc:
            log.error("link place failed", kind=job.kind, error=type(exc).__name__)
            async with engine.begin() as conn:
                await retry_or_die(conn, job, "link_place_error")
        return

    if job.kind == "voice.forget":
        # 021. No model call and nobody waiting. Its own guard for the same
        # reason the embed branch has one: it returns before the catch-all.
        try:
            await _handle_forget(job, cfg=cfg, engine=engine, http=http)
            async with engine.begin() as conn:
                await finish(conn, job.id)
        except Exception as exc:  # noqa: BLE001
            # The type only. The reference and the provider's message are
            # both things a log must not carry.
            log.error(
                "forget failed", job_id=job.id, attempt=job.attempts, error_type=type(exc).__name__
            )
            async with engine.begin() as conn:
                await retry_or_die(conn, job, "forget_error", delay_seconds=300)
        return

    if job.kind in EMBED_KINDS:
        # No model call and nobody waiting, so it closes its own job rather
        # than reporting an outcome the Core API has no use for.
        #
        # **Its own guard, because it returns before the one below.** Everything
        # past this point is wrapped; this was not, and `handle_embed` catches
        # only `EmbeddingUnavailable`. A malformed Voyage body, a KeyError, a
        # database error inside its own transaction: any of those reached the
        # loop's catch-all, which logs and sleeps without releasing the job.
        #
        # Nothing reaps a stuck `running` row, and the sweep cannot re-enqueue
        # it because the idempotency key is `kind:rowId:version` and the version
        # only moves when somebody edits the row. So one bad response left a row
        # permanently unsearchable, silently, with no way back short of an edit.
        try:
            await handle_embed(job, cfg=cfg, engine=engine, http=http)
        except Exception as exc:
            # The type, never the value: an SDK exception can echo the request
            # body, and the request body here is content (OFF-1).
            #
            # **This said `log.exception` until 2026-09-10**, which sets
            # `exc_info=True`, and structlog renders the traceback with
            # `str(exc)` in it however few fields are passed. The comment above
            # was right and the call under it was not. Found by the review of
            # 014, in the identical line it had just written.
            log.error("embed failed", kind=job.kind, error=type(exc).__name__)
            async with engine.begin() as conn:
                await retry_or_die(conn, job, "embed_error", delay_seconds=300)
        return

    # **Past its attempts, the turn is not run again.** Only one path gets a
    # dump here: `_give_up_or_retry` releasing it because even the failure
    # could not be posted. Without this the next claim re-ran the whole paid
    # turn every thirty seconds of an outage. `model_error` because the Core
    # API takes no `undeliverable`, and the reason the turn failed went with
    # the release.
    if job.attempts > job.max_attempts:
        await _give_up_or_retry(job, "model_error", cfg=cfg, engine=engine, http=http)
        return

    payload = job.payload
    message_id = payload.get("messageId")
    conversation_id = payload.get("conversationId")

    if not (message_id and conversation_id and job.account_id):
        # Nothing to answer and nothing to answer it for. Reported rather than
        # retried: a malformed payload will be malformed again.
        await _post_result(
            http, cfg, {"outcome": "failed", "jobId": job.id, "reason": "invalid_output"}
        )
        return

    budget: Lookups | None = None
    try:
        # 021. **The words first.** A voice note has no words until the
        # provider has written them down, and everything below, the classifier
        # included, reads the message's words. So this runs ahead of all of it,
        # and once the transcript is on the message the message is text to
        # every path that follows. A retry after the write, and a resume,
        # find the transcript there and skip this.
        async with engine.connect() as conn:
            voice = await ctx_mod.voice_of(conn, message_id=message_id)
        if voice is not None and not voice.transcribed:
            await _step_writer(http, cfg, job.id)("Listening")
            try:
                await _write_down(http, cfg, job.id, voice)
            except (TranscriptionFailed, httpx.HTTPError) as exc:
                log.warning(
                    "transcription failed",
                    job_id=job.id,
                    attempt=job.attempts,
                    error_type=type(exc).__name__,
                )
                await _give_up_or_retry(
                    job, "transcription_failed", cfg=cfg, engine=engine, http=http
                )
                return
            # Nothing to hear, and nothing else on the message: the turn
            # settles with our line and no model is called on silence. Words
            # or photos with it carry on below, and the silence goes unsaid.
            async with engine.connect() as conn:
                said = await ctx_mod.question_text(conn, message_id=message_id)
                photos = await ctx_mod.photo_count(conn, message_id=message_id)
            if not said and photos == 0:
                await _post_result(
                    http, cfg, {"outcome": "answered", "jobId": job.id, "replyText": HEARD_NOTHING}
                )
                log.info("dump answered", job_id=job.id, calls=0, filed=0, heard_nothing=True)
                return

        # 026. A forwarded email is filed, never answered: its words are mostly
        # somebody else's, and "can you confirm by Friday?" in a booking email
        # is not a question to offload. Its images are looked at first, so the
        # ones it keeps are on the message before anything below reads it.
        mail_turn = bool(payload.get("mail"))
        look_ids = [str(i) for i in (payload.get("mailLook") or [])]
        if look_ids:
            await _step_writer(http, cfg, job.id)("Looking at the pictures")
            await _run_look(http, cfg, anthropic, job.id, str(message_id), look_ids)

        # Question or note, decided on the message alone and before anything is
        # read. Its own call, because the toolset has to be chosen before the
        # model is invoked: a mode the model picks mid-turn is a mode it can be
        # talked into. See `classify`.
        async with engine.connect() as conn:
            asked = await ctx_mod.question_text(conn, message_id=message_id)
            # 020. A photo makes the message a dump whatever its words: the
            # answering path cannot see a picture and the picture has to land.
            with_photos = await ctx_mod.photo_count(conn, message_id=message_id) > 0

        # **No step of our own here.** "Looking through your threads" was
        # written at this point until 2026-10-07 so that a line was on screen
        # before Stop. The thinking row's animation says working from the
        # first frame, so the line was filler, and on "what time is it" it was
        # untrue. A step is written when the turn really does something:
        # listening, looking at a picture, a lookup's `doing`.

        # 018. A country picked with a tap. The question is already answered;
        # this job re-runs the answer for the country they chose, read-only.
        if payload.get("questionId") and payload.get("country"):
            async with engine.connect() as conn:
                picked = await ctx_mod.open_question(
                    conn,
                    question_id=str(payload["questionId"]),
                    account_id=job.account_id,
                    require_open=False,
                )
            await _handle_answer(
                job,
                question=(picked.asked_about if picked and picked.asked_about else asked or ""),
                cfg=cfg,
                engine=engine,
                anthropic=anthropic,
                http=http,
                country_override=str(payload["country"]),
            )
            return

        # 018. A typed message while a question is open is read as a possible
        # answer first, on the text and the question alone, before the
        # classifier. A message is never consumed by it: whatever it carries
        # beyond the answer files below.
        answered: dict | None = None
        open_id = payload.get("openQuestionId")
        if open_id and asked:
            async with engine.connect() as conn:
                open_q = await ctx_mod.open_question(
                    conn, question_id=str(open_id), account_id=job.account_id
                )
                today = await ctx_mod.today_line(
                    conn,
                    await ctx_mod.message_zone(
                        conn, message_id=str(message_id), account_id=job.account_id
                    ),
                )
            if open_q is not None and open_q.field in ("calendar", "person"):
                # 019. A calendar's name is matched in the Core API, in code,
                # against what was typed: no judge, since a label may be a
                # name somebody else wrote. Applied means the whole message
                # was the answer and the event is on its way; otherwise the
                # question is closed there and the dump files as itself.
                # 022. A person question's labels are connections' names,
                # which never reach a model, so the same path.
                result = await _post_result(
                    http,
                    cfg,
                    {"jobId": job.id, "questionId": open_q.id, "value": {"text": asked}},
                    path="question-answer",
                )
                applied = bool(result and result.get("applied"))
                log.info("question answered", field=open_q.field, how="typed", applied=applied)
                if applied:
                    await _post_result(
                        http,
                        cfg,
                        {"outcome": "answered", "jobId": job.id, "usage": _usage_wire(None)},
                    )
                    return
            elif open_q is not None:
                try:
                    verdict = await judge_answer(
                        anthropic,
                        asked,
                        field=open_q.field,
                        question=open_q.text,
                        options=open_q.options,
                        today=today,
                        model=cfg.sort_model,
                    )
                except Exception as exc:  # noqa: BLE001
                    # Not an answer, then. The question closes and the dump
                    # files; nothing is lost. The type only (OFF-1).
                    log.warning("judge failed", error_type=type(exc).__name__)
                    verdict = Judgement(answers=False)
                value = parse_answer(open_q.field, verdict, open_q.options, today)
                if value is None:
                    await _post_result(
                        http, cfg, {"jobId": job.id, "questionId": open_q.id}, path="question-close"
                    )
                    log.info("question closed", field=open_q.field, how="typed")
                elif open_q.field == "country":
                    await _post_result(
                        http,
                        cfg,
                        {"jobId": job.id, "questionId": open_q.id, "value": value},
                        path="question-answer",
                    )
                    log.info("question answered", field=open_q.field, how="typed")
                    await _handle_answer(
                        job,
                        question=open_q.asked_about or asked,
                        cfg=cfg,
                        engine=engine,
                        anthropic=anthropic,
                        http=http,
                        country_override=value["country"],
                    )
                    return
                else:
                    result = await _post_result(
                        http,
                        cfg,
                        {"jobId": job.id, "questionId": open_q.id, "value": value},
                        path="question-answer",
                    )
                    applied = bool(result and result.get("applied"))
                    log.info("question answered", field=open_q.field, how="typed", applied=applied)
                    if applied and verdict.whole:
                        # The message was nothing but the answer. Settled with no
                        # reply: the row's change is what they see.
                        await _post_result(
                            http,
                            cfg,
                            {"outcome": "answered", "jobId": job.id, "usage": _usage_wire(None)},
                        )
                        return
                    if applied:
                        answered = {
                            "field": open_q.field,
                            "label": describe_value(open_q.field, value),
                        }

        if asked and answered is None and not with_photos and not mail_turn:
            verdict = await classify(anthropic, asked, cfg.sort_model)
            if verdict.asking and verdict.confident:
                await _handle_answer(
                    job,
                    question=asked,
                    cfg=cfg,
                    engine=engine,
                    anthropic=anthropic,
                    http=http,
                )
                return

        async with engine.connect() as conn:
            loaded = await ctx_mod.load(
                conn,
                account_id=job.account_id,
                conversation_id=conversation_id,
                message_id=message_id,
                max_turns=cfg.max_turns,
                max_threads=cfg.max_threads,
                embedder=_embed_query(cfg, http, timeout=ctx_mod.QUERY_LONGEST),
            )

        if loaded is None:
            await _post_result(
                http, cfg, {"outcome": "failed", "jobId": job.id, "reason": "invalid_output"}
            )
            return

        # 020. The photos, before the model sees anything. The renditions are
        # made here and posted back, and the large copy of each is what the
        # planner is handed; one that cannot be opened is named as such in the
        # prompt and takes the plain-title path on the way out.
        if loaded.photos:
            await _step_writer(http, cfg, job.id)(
                "Looking at the photo" if len(loaded.photos) == 1 else "Looking at the photos"
            )
            loaded = dataclasses.replace(
                loaded, photos=await _prepare_photos(http, cfg, engine, job.id, loaded.photos)
            )
        # 041. The PDFs, made safe and cut, then fitted to one request beside
        # the photos.
        if loaded.pdfs:
            await _step_writer(http, cfg, job.id)(
                "Reading the PDF" if len(loaded.pdfs) == 1 else "Reading the PDFs"
            )
            prepared = await _prepare_pdfs(http, cfg, engine, job.id, loaded.pdfs)
            fitted_pdfs, steps = await fit_documents(
                prepared,
                other_bytes=sum(len(p.large or b"") for p in loaded.photos),
            )
            log.info(
                "pdfs read",
                job_id=job.id,
                documents=sum(1 for p in fitted_pdfs if p.cut is not None),
                document_bytes=sum(len(p.cut or b"") for p in fitted_pdfs),
                pictures=sum(1 for p in fitted_pdfs if p.picture is not None),
                bound_steps=steps,
            )
            loaded = dataclasses.replace(loaded, pdfs=fitted_pdfs)

        if answered is not None:
            loaded = dataclasses.replace(loaded, answered=answered)
        fitted = ctx_mod.fit(loaded, cfg.max_prompt_tokens)
        budget = Lookups(
            fitted.dump,
            links=fitted.mail.links if fitted.mail else None,
            may_search=fitted.may_search,
            may_read_links=fitted.may_read_links,
            maps_on=fitted.maps_on,
            country=fitted.country,
            today=fitted.today,
        )
        outcome = await plan(
            anthropic,
            fitted,
            cfg.model,
            _tool_caller(
                http,
                cfg,
                job.id,
                lookups=(anthropic, cfg, budget),
                say=_step_writer(http, cfg, job.id),
                found=fitted.found_set(),
            ),
        )

        partial, reply_text = _reply_as_sent(outcome, fitted, budget)

        # Not finished means either the loop ran out of round trips or a tool
        # failed. Both are partial, and in both the reply is ours: a model that
        # could not do something is not a reliable narrator of what it did.
        if partial:
            # The loop ran out of round trips. Everything in `landed` is
            # committed, so this is partial rather than failed, and the person
            # is offered a way to finish it rather than a way to start again.
            #
            # The reply is written here rather than asked of the model, because
            # the model is the thing that did not finish. It names threads from
            # `landed`, which is the record of what actually happened.
            await _post_result(
                http,
                cfg,
                {
                    "outcome": "partial",
                    "jobId": job.id,
                    "replyText": reply_text,
                    "usage": _usage_wire(outcome),
                    # A turn cut off partway still read what it read, and the
                    # chip is a record of that rather than of the turn finishing.
                    **_web_wire(budget),
                },
            )
            log.warning(
                "dump partial",
                job_id=job.id,
                calls=len(outcome.usage),
                filed=len(outcome.landed),
                # **The names, not the count.** A count says a tool failed and
                # leaves you reading the whole loop to find out which; `refused`
                # has carried names since the day it was added and this did not,
                # which cost an hour on a phone. A tool name is not content.
                failed=outcome.failed,
                # See above: this is the count that was missing while three
                # turns in production looked like they had done nothing.
                refused=outcome.refused,
                out_of_calls=outcome.out_of_calls,
            )
            return

        # **No reply is an outcome, not a failure.** A dump that was simply
        # filed says everything it has to say through the Done mark and the
        # pill naming the thread, and a sentence repeating what somebody just
        # typed is noise wearing offload's voice. `finished` above already
        # refused to call a silent turn finished unless something landed.
        await _post_result(
            http,
            cfg,
            {
                "outcome": "answered",
                "jobId": job.id,
                **({"replyText": outcome.reply} if outcome.reply else {}),
                **({"questions": _questions_wire(outcome)} if outcome.questions else {}),
                # What the turn read, and what kind of lookup it was. They ride
                # home here rather than through an endpoint of their own,
                # because the reader writes nothing and one fewer route is one
                # fewer thing to authenticate.
                **_web_wire(budget),
                "usage": _usage_wire(outcome),
            },
        )
        # Ids and counts only. Never the dump, never the reply, never a thread
        # name: a thread the model named after a diagnosis is as identifying as
        # the sentence it came from (OFF-1).
        log.info(
            "dump answered",
            job_id=job.id,
            calls=len(outcome.usage),
            filed=len(outcome.landed),
            # Which of the two answered turns this was: one that did something,
            # or a resume that found the work already done. They read the same
            # in a log otherwise, and telling them apart is what turned "the
            # retry fails every time" into one line of code.
            nothing_left=not outcome.finished,
            # A tool call the schema refused never reaches the Core API, so it
            # is in neither `filed` nor `failed`, and a turn that spent every
            # round trip on rejected arguments logged as though it had done
            # nothing at all. Field names and error types only (OFF-1).
            refused=outcome.refused,
            declined=outcome.declined,
            latency_ms=sum(u.latency_ms for u in outcome.usage),
            # 020. How many pictures the turn read, and how many bytes of
            # them. A count and a size, never the pictures (OFF-1).
            photos=len(fitted.photos),
            photo_bytes=sum(len(p.large) for p in fitted.photos if p.large),
        )

    except ReportFailed as exc:
        # The answer was produced and could not be delivered. Do not report a
        # failure, because there is nothing to report it through, and do not
        # leave the job running, because a running job counts against the
        # account's concurrency cap forever. Put it back and let it be tried
        # again when the Core API is reachable.
        log.error("result undeliverable", job_id=job.id, error_type=str(exc))
        # While it has attempts left, and each one later than the last: a
        # retry here re-runs the whole turn, model calls included.
        delay = min(600, 30 * 2 ** max(0, job.attempts - 1))
        async with engine.begin() as conn:
            await retry_or_die(conn, job, "undeliverable", delay_seconds=delay)
    except InvalidOutput:
        log.warning("model output invalid", job_id=job.id, attempt=job.attempts)
        await _give_up_or_retry(
            job,
            "invalid_output",
            cfg=cfg,
            engine=engine,
            http=http,
            lookups=budget.rows if budget else None,
        )
    except Exception as exc:  # noqa: BLE001
        # The type, never the message. An SDK exception can embed the request
        # body, which is the person's dump, and this line would carry it into a
        # log (OFF-1).
        # The type and where it came from, never the message: a NameError
        # seen once on a device test could not be placed without the module.
        log.error(
            "dump failed",
            job_id=job.id,
            attempt=job.attempts,
            error_type=type(exc).__name__,
            error_module=type(exc).__module__,
        )
        await _give_up_or_retry(
            job,
            "model_error",
            cfg=cfg,
            engine=engine,
            http=http,
            lookups=budget.rows if budget else None,
        )


_RENDITIONS_STATE = text(
    """
    select id, renditions_at
    from blobs
    where id = any(:ids)
    """
)


async def _run_look(
    http: httpx.AsyncClient,
    cfg: Config,
    anthropic: AsyncAnthropic,
    job_id: str,
    message_id: str,
    candidates: list[str],
) -> list[str]:
    """026. Which of an email's image candidates to keep, posted to the Core
    API, which claims those and deletes the rest. A candidate that cannot be
    fetched is left out; a look that fails keeps nothing (OFF-5), because
    keeping a logo is worse than keeping no picture and the text still files.
    """
    headers = {"authorization": f"Bearer {cfg.internal_token}"}
    fetched: list[tuple[str, bytes]] = []
    for blob_id in candidates:
        try:
            response = await http.get(
                f"{cfg.api_url}/internal/v1/blobs/{blob_id}/original",
                params={"jobId": job_id},
                headers=headers,
                timeout=60.0,
            )
        except httpx.HTTPError as exc:
            log.warning("look fetch failed", error_type=type(exc).__name__)
            continue
        if response.status_code != 200:
            continue
        content = response.content
        # 041. A PDF is shown to the look as page 1, drawn in a bounded child;
        # one that cannot be drawn is left out of the look like an image
        # that cannot be fetched.
        if content[:5] == b"%PDF-":
            try:
                content = await pdfs_mod.run_look(content)
            except pdfs_mod.Failed as failure:
                log.warning("look pdf unreadable", reason=failure.reason)
                continue
        fetched.append((blob_id, content))
    keep: list[str] = []
    failed = False
    if fetched:
        try:
            indices = await look(anthropic, cfg.look_model, [b for _, b in fetched])
            keep = [fetched[i][0] for i in indices]
        except LookFailed:
            failed = True
            log.error("look failed", candidates=len(fetched))
        except Exception as exc:  # noqa: BLE001
            failed = True
            log.error("look failed", candidates=len(fetched), error_type=type(exc).__name__)
    response = await http.post(
        f"{cfg.api_url}/internal/v1/messages/{message_id}/look",
        # 041. `failed` so the Core API can name every PDF the look never
        # judged in Activity.
        json={"jobId": job_id, "keep": keep, **({"failed": True} if failed else {})},
        headers=headers,
        timeout=30.0,
    )
    response.raise_for_status()
    log.info("look applied", candidates=len(candidates), kept=len(keep))
    return [str(i) for i in response.json().get("kept", [])]


async def _prepare_photos(
    http: httpx.AsyncClient, cfg: Config, engine, job_id: str, photos: list[Photo]
) -> list[Photo]:
    """Each photo with its large rendition attached, making and posting the
    renditions the Core API does not have yet. A retry of the turn finds them
    made and only re-reads the original for the model's copy."""
    async with engine.connect() as conn:
        rows = (await conn.execute(_RENDITIONS_STATE, {"ids": [p.blob_id for p in photos]})).all()
    made = {str(r.id): r.renditions_at is not None for r in rows}

    # Three at a time: each is a fetch, a decode and two posts, and ten in a
    # row is most of the turn on a phone's worth of photos.
    gate = asyncio.Semaphore(3)

    async def one(photo: Photo) -> Photo:
        async with gate:
            try:
                large = await prepare(
                    http, cfg, job_id, photo.blob_id, already_made=made.get(photo.blob_id, False)
                )
            except Exception as exc:  # noqa: BLE001
                # The type only. A failed rendition is a photo the model does
                # not see this turn; the server still files it, with a plain
                # title.
                log.error("rendition failed", blob_id=photo.blob_id, error_type=type(exc).__name__)
                large = None
        return dataclasses.replace(photo, large=large)

    return list(await asyncio.gather(*(one(photo) for photo in photos)))


# ---------------------------------------------------------------- 041 PDFs

#: 041. What the PDFs and photos of one turn may add up to, raw, before
#: base64: about 29 MB once encoded, under the 32 MB a request may be, with
#: room for the text.
REQUEST_BYTES = 22 * 1024 * 1024


async def _prepare_pdfs(
    http: httpx.AsyncClient, cfg: Config, engine, job_id: str, pdfs: list[Pdf]
) -> list[Pdf]:
    """041. Each PDF made safe and cut for the model, in a bounded child, and
    its renditions posted when the Core API has none yet: page 1's two JPEGs
    and the clean copy, with the page count. A PDF that cannot be made safe is
    posted as unreadable and reaches the model as a line saying so."""
    async with engine.connect() as conn:
        rows = (await conn.execute(_RENDITIONS_STATE, {"ids": [p.blob_id for p in pdfs]})).all()
    made = {str(r.id): r.renditions_at is not None for r in rows}
    headers = {"authorization": f"Bearer {cfg.internal_token}"}

    async def one(pdf: Pdf) -> Pdf:
        response = await http.get(
            f"{cfg.api_url}/internal/v1/blobs/{pdf.blob_id}/original",
            params={"jobId": job_id},
            headers=headers,
            timeout=60.0,
        )
        if response.status_code == 404:
            return pdf
        response.raise_for_status()
        try:
            copies = await pdfs_mod.run_pdf(response.content)
        except pdfs_mod.Failed as failure:
            # The reason, never the parser's words, which can quote the file.
            log.warning("pdf unreadable", blob_id=pdf.blob_id, reason=failure.reason)
            await http.post(
                f"{cfg.api_url}/internal/v1/blobs/{pdf.blob_id}/unreadable",
                json={"jobId": job_id},
                headers=headers,
                timeout=30.0,
            )
            return pdf
        if not made.get(pdf.blob_id, False):
            posted = await http.post(
                f"{cfg.api_url}/internal/v1/blobs/{pdf.blob_id}/renditions",
                params={"jobId": job_id},
                headers=headers,
                data={"pages": str(copies.pages)},
                files={
                    "thumb": ("thumb.jpg", copies.thumb, "image/jpeg"),
                    "large": ("large.jpg", copies.large, "image/jpeg"),
                    "clean": ("clean.pdf", copies.clean, "application/pdf"),
                },
                timeout=120.0,
            )
            posted.raise_for_status()
            log.info(
                "pdf made",
                blob_id=pdf.blob_id,
                pages=copies.pages,
                clean_bytes=len(copies.clean),
                cut_bytes=len(copies.cut),
            )
        return dataclasses.replace(
            pdf,
            pages=copies.pages,
            cut=copies.cut,
            clean=copies.clean,
            large=copies.large,
            candidates=copies.candidates,
        )

    out: list[Pdf] = []
    # One at a time: two at most, and each child holds up to a gigabyte.
    for pdf in pdfs:
        try:
            out.append(await one(pdf))
        except Exception as exc:  # noqa: BLE001
            log.error("pdf failed", blob_id=pdf.blob_id, error_type=type(exc).__name__)
            out.append(pdf)
    return out


async def fit_documents(
    pdfs: list[Pdf], *, other_bytes: int, limit: int = REQUEST_BYTES
) -> tuple[list[Pdf], int]:
    """041. The PDFs as they fit one request beside `other_bytes` of photos:
    the larger cut one page shorter at a time, from the end, until they fit,
    and a PDF that does not fit as one page, or whose shorter cut fails, sent
    as page 1's picture. Every cut is made in the bounded child; this process
    counts pages and never opens a PDF. Returns the PDFs and how many steps it
    took, which is logged as a count and never a page."""
    out = list(pdfs)
    pages = [min(p.pages, pdfs_mod.CUT_PAGES) for p in out]
    steps = 0

    def total() -> int:
        return other_bytes + sum(len(p.cut or p.picture or b"") for p in out)

    while total() > limit:
        candidates = [at for at, p in enumerate(out) if p.cut is not None]
        if not candidates:
            break
        at = max(candidates, key=lambda i: len(out[i].cut or b""))
        pdf = out[at]
        steps += 1
        if pages[at] > 1 and pdf.clean is not None:
            pages[at] -= 1
            try:
                out[at] = dataclasses.replace(pdf, cut=await pdfs_mod.run_cut(pdf.clean, pages[at]))
                continue
            except pdfs_mod.Failed:
                pass
        out[at] = dataclasses.replace(pdf, cut=None, picture=pdf.large)
    return out, steps


#: How many sources cross to the Core API, and it is the server's number too.
#:
#: **One search comes back with nine citations**, which is the thing nobody
#: guessed: the cap was written for three lookups of two sources each, the real
#: provider cites everything it touched, and the first production turn that ever
#: completed a lookup posted nine and was refused by the schema. The turn had
#: already done the work and paid for it, and it was thrown away over an array
#: length.
#:
#: Twelve, and deduplicated by domain first, because the chip shows a domain: two
#: URLs on wikipedia.org are one chip and counting them twice makes "and 4 more"
#: a lie about how many places were read.
MAX_SOURCES = 12


def _web_wire(budget: "Lookups | None") -> dict:
    """The web half of a turn result: sources for the chips, rows for the counts.

    Omitted entirely on a turn that reached nothing, which is almost all of
    them, so an ordinary filing result is the shape it has always been.

    **Bounded here as well as at the schema.** The server's cap is the contract;
    a worker that sends past it loses a finished turn to a 400, which is a worse
    outcome than a short list by every measure.
    """
    if budget is None or (not budget.sources and not budget.rows):
        return {}

    seen: dict[str, dict] = {}
    for source in budget.sources:
        # The route's rule: https only, at most 2000 characters.
        if source["url"].startswith("https://") and len(source["url"]) <= 2000:
            seen.setdefault(source["domain"], source)

    return {
        "sources": list(seen.values())[:MAX_SOURCES],
        "lookups": budget.rows,
    }


#: 016 AC-19. The one thing offload says when a lookup did not produce the
#: fact, authored here rather than phrased by the model at runtime.
NOT_SURE = "Not sure."


#: 020. What offload says about a photo it could not open. One clause, no
#: diagnosis; the row is filed under a plain title by the server, so the
#: sentence names what happened and the row is the way forward.
COULD_NOT_READ_ONE = "Could not make out one of the photos."
COULD_NOT_READ_ANY = "Could not make out the photos."
#: 021. A voice note with nothing to hear in it. No question and no retry,
#: because the same recording gives the same answer.
HEARD_NOTHING = "Heard nothing in that one."


async def _write_down(
    http: httpx.AsyncClient, cfg: Config, job_id: str, voice: ctx_mod.Voice
) -> None:
    """021. The transcript onto the message, as the one thing a cancel waits
    for.

    The worker's cancel raises at the next await, and a note left half
    written down would be audio nobody can hear with no control to reach it.
    So the write runs under a shield: a cancel that lands here is caught,
    the inner task is awaited to completion, and then the cancel is re-raised,
    which is 017's "a cancel in the middle of a write waits for that one
    thing" applied to the first write of the turn.

    A retry finds the provider's reference on the row and polls it rather
    than sending the audio a second time (AC-16).
    """
    headers = {"authorization": f"Bearer {cfg.internal_token}"}

    async def inner() -> None:
        started = time.monotonic()
        ref = voice.provider_ref
        if ref is None:
            fetched = await http.get(
                f"{cfg.api_url}/internal/v1/blobs/{voice.blob_id}/original",
                params={"jobId": job_id},
                headers=headers,
                timeout=60.0,
            )
            fetched.raise_for_status()
            ref = await submit(http, cfg, fetched.content)
            recorded = await http.post(
                f"{cfg.api_url}/internal/v1/blobs/{voice.blob_id}/submitted",
                json={"jobId": job_id, "providerRef": ref},
                headers=headers,
                timeout=30.0,
            )
            recorded.raise_for_status()
        transcript = await poll(http, cfg, ref, started_at=started)
        written = await http.post(
            f"{cfg.api_url}/internal/v1/messages/{voice.message_id}/transcript",
            json={
                "jobId": job_id,
                "text": transcript.text,
                "durationMs": transcript.duration_ms,
                "costMicros": transcript.cost_micros,
                "latencyMs": transcript.latency_ms,
            },
            headers=headers,
            timeout=30.0,
        )
        written.raise_for_status()
        # A length, a cost and whether anything was heard. Never the words.
        log.info(
            "voice note written down",
            blob_id=voice.blob_id,
            duration_ms=transcript.duration_ms,
            latency_ms=transcript.latency_ms,
            empty=not transcript.text,
        )

    task = asyncio.ensure_future(inner())
    try:
        await asyncio.shield(task)
    except asyncio.CancelledError:
        try:
            await task
        except Exception as exc:  # noqa: BLE001
            # The type only, as everywhere in this file. The turn settles
            # as cancelled either way; this keeps the failure visible.
            log.warning("write-down failed under a cancel", error_type=type(exc).__name__)
        raise


_PROVIDER_REF = text("select provider_ref from blobs where id = :id")


async def _handle_forget(job: ClaimedJob, *, cfg: Config, engine, http: httpx.AsyncClient) -> None:
    """021. Delete the provider's copy of a transcript, then tell the Core
    API so the reference goes. Gone and never-there are the same; anything
    else raises and the job retries on its backoff."""
    blob_id = job.payload.get("blobId")
    if not blob_id:
        return
    headers = {"authorization": f"Bearer {cfg.internal_token}"}
    async with engine.connect() as conn:
        ref = (await conn.execute(_PROVIDER_REF, {"id": str(blob_id)})).scalar()
    if ref:
        await forget(http, cfg, str(ref))
    done = await http.post(
        f"{cfg.api_url}/internal/v1/blobs/{blob_id}/forgotten",
        json={"jobId": job.id},
        headers=headers,
        timeout=30.0,
    )
    done.raise_for_status()
    log.info("voice note forgotten", blob_id=str(blob_id), had_reference=bool(ref))


def _photos_land_anyway(outcome: Outcome, ctx: DumpContext) -> bool:
    """A photo turn the model stopped without filing is still a turn that
    filed something, because the server files every photo no row claims
    before the turn settles (020).

    Seen on a phone on 2026-09-19: the same shop sign sent twice, and the
    second time the model read the thread, found the first, and stopped with
    nothing filed and nothing said. Reported as partial, that turn said
    "Nothing saved." under a Files grid that had just gained the photo, and
    offered a Finish that would have read the thread again. Narrow, as
    `_nothing_left` is: the model has to have stopped of its own accord,
    with nothing refused and nothing half done, and the message has to carry
    a photo the server can open.
    """
    if outcome.failed or outcome.refused or outcome.out_of_calls:
        return False
    if outcome.landed or outcome.reply is not None:
        return False
    return any(p.large is not None for p in ctx.photos)


def _reply_as_sent(
    outcome: Outcome, ctx: DumpContext, budget: "Lookups"
) -> tuple[bool, str | None]:
    """What the person is sent, and whether the turn is partial.

    One function because the evals have to judge this and not the model's own
    sentence. They read `outcome.reply` before the partial rewrite, so a case
    about a refused share was green while production answered "Nothing saved.".
    Authors the lines on `outcome` as it goes, as the turn always did.
    """
    nothing_left = _nothing_left(outcome, ctx) or _photos_land_anyway(outcome, ctx)
    _author_the_failure_line(outcome, budget)
    _author_the_photo_line(outcome, ctx)
    _author_the_server_lines(outcome)
    if not outcome.finished and not nothing_left:
        return True, _partial_reply(outcome)
    return False, outcome.reply


def _author_the_server_lines(outcome: Outcome) -> None:
    """S36. What the Core API said the reply has to carry, said once. Done is
    silent, so a model would drop "Only this one changed." as a routine edit."""
    for line in dict.fromkeys(outcome.lines):
        if line not in (outcome.reply or ""):
            outcome.reply = f"{outcome.reply.rstrip()} {line}" if outcome.reply else line


def _author_the_photo_line(outcome: Outcome, ctx: DumpContext) -> None:
    """Say so when a photo could not be opened, in offload's own words rather
    than the model's, which never saw it and cannot describe what it missed."""
    unreadable = [p for p in ctx.photos if p.large is None]
    if not unreadable:
        return
    line = COULD_NOT_READ_ANY if len(unreadable) == len(ctx.photos) else COULD_NOT_READ_ONE
    outcome.reply = f"{outcome.reply.rstrip()} {line}" if outcome.reply else line


def _author_the_failure_line(outcome: Outcome, budget: "Lookups") -> None:
    """Replace whatever the model said about a lookup that failed.

    "Couldn't pin down the route for Saturday" is offload explaining its own
    machinery, and it came out twice in one eval run against a prompt that
    quotes that exact sentence as the thing never to say. A rule the prompt
    cannot hold is held here: when this turn looked something up and nothing
    came back, the reply is the authored line if nothing was filed and nothing
    at all if something was, because the row is the answer.
    """
    outcomes = {row["outcome"] for row in budget.rows}
    if "used" in outcomes or not (outcomes & {"empty", "failed"}):
        return
    if outcome.questions:
        return
    filed = any(item.tool != "create_thread" for item in outcome.landed)
    outcome.reply = None if filed else NOT_SURE
    if outcome.reply == NOT_SURE:
        budget.sources.clear()


def _author_the_answer_line(outcome: Outcome, budget: "Lookups") -> None:
    """The answering path's two authored rules, held in code.

    A lookup that found nothing, with no rows to answer from, is the authored
    line rather than a sentence about what the search did not find (016
    AC-19). And a turn that asked which country ends with no reply (018): the
    model wrote "*(awaiting their pick)*" and "undefined" beside the question
    in one eval run, and either would have reached a screen.
    """
    if outcome.questions:
        outcome.reply = None
        return
    looked = {row["outcome"] for row in budget.rows}
    if looked & {"empty", "failed"} and "used" not in looked and not outcome.found:
        outcome.reply = NOT_SURE
    # Rows and chips the answer did not come from. A search's meaning arm
    # always returns its nearest rows, and a chip says where an answer came
    # from: under "Not sure." there was none.
    if outcome.reply == NOT_SURE:
        outcome.found = []
        budget.sources.clear()


def _nothing_left(outcome: Outcome, ctx: DumpContext) -> bool:
    """A resume that found the work already done.

    **Finished, not partial.** The rule everywhere else is that a turn which
    filed nothing and said nothing did not happen, and on a first attempt that
    is right. On a resume it is the opposite: the earlier attempt filed, this
    one reads what already landed, finds nothing left and stops. Reported as
    partial, that turn said "Nothing saved." about eight rows sitting in the
    thread, and offered a Finish that would say it again, every time. The
    product owner pressed it three times.

    Narrow on purpose. The model has to have stopped of its own accord, with
    nothing refused and nothing half done, and this message has to have filed
    something already. Anything else is still a turn that needs finishing.
    """
    return (
        not outcome.finished
        and not outcome.out_of_calls
        and not outcome.failed
        and outcome.worked == 0
        and bool(ctx.landed)
    )


def _partial_reply(outcome: Outcome) -> str:
    """What offload says when a turn did not finish.

    Built from `landed`, never from the model's own account of itself. The model
    either stopped mid-turn or had a tool refused, and in both cases its last
    word on the subject is unreliable by construction: asked to explain, it
    wrote "the task tool seems to be down" about a tool that was up.
    """
    names: list[str] = []
    for item in outcome.landed:
        # 028. What landed in the default thread is saved, not saved somewhere:
        # it has no name a person would know.
        if item.thread_name == NOT_IN_A_THREAD:
            continue
        if item.thread_name and item.thread_name not in names:
            names.append(item.thread_name)

    # Short, and only what happened. No apology, no explanation, no mechanism,
    # and nothing about what went wrong: the screen says that, next to the way
    # to fix it, where somebody can act on it. A sentence cannot be clicked.
    if names:
        placed = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
        return f"Saved to {placed}."

    # **"Nothing saved." is a claim about the database and it can be false.**
    # `landed` holds filings, and a move, a tick, an archive and a rename are
    # none of them: a turn that moved a piece and then stopped told somebody
    # nothing had been saved about a move that had already happened. If a tool
    # did something, say the true thing instead, which is that the turn did not
    # finish, and let the screen offer the way to finish it.
    if any(item.thread_name == NOT_IN_A_THREAD for item in outcome.landed):
        return "Saved."
    if outcome.worked:
        return "That did not finish."
    return "Nothing saved."


async def _stopped(job: ClaimedJob, *, cfg: Config, engine, http: httpx.AsyncClient) -> None:
    """Report a turn somebody stopped. 017.

    **Not a failure and not a retry.** Both of those exist because offload got
    something wrong; this one is somebody exercising a control, and a turn that
    retried itself after being stopped would be the product ignoring them
    (AC-12). The job is closed by the Core API in the same transaction as the
    state, exactly as every other outcome is.

    Everything already filed stays filed (AC-10). Cancel stops work; Undo is the
    thing that reverses it.
    """
    try:
        await _post_result(http, cfg, {"outcome": "cancelled", "jobId": job.id})
        log.info("turn stopped", job_id=job.id)
    except ReportFailed:
        # **Nothing else to do, and deliberately no retry.** The person's screen
        # already moved on when they pressed it. Releasing it would put the
        # cancelled job back in the queue, which is the one thing that must not
        # happen here. The row stays `running` with `cancelled_at` set, and once
        # its lock goes stale the claim reads that and this runs again, while it
        # has attempts left; the turn is never run.
        log.error("stop undeliverable", job_id=job.id)


async def _give_up_or_retry(
    job: ClaimedJob,
    reason: str,
    *,
    cfg: Config,
    engine,
    http: httpx.AsyncClient,
    lookups: list[dict] | None = None,
) -> None:
    """One retry, then tell the person.

    AC-5 asks for a retry before a failure is shown, and the first version of
    this did not have one: any error posted `failed` immediately and the
    composer said so on the first transient blip. The attempt count comes from
    the claim, so the decision is made against what the database recorded rather
    than against anything held in this process.
    """
    if job.attempts < job.max_attempts:
        async with engine.begin() as conn:
            await release_for_retry(conn, job.id, reason)
        log.info("dump requeued", job_id=job.id, attempt=job.attempts)
        return

    try:
        await _post_result(
            http,
            cfg,
            {
                "outcome": "failed",
                "jobId": job.id,
                "reason": reason,
                # What the turn searched before failing was still paid for.
                **({"lookups": lookups} if lookups else {}),
            },
        )
    except ReportFailed:
        # Even the failure could not be delivered. Same treatment: release it
        # rather than leave it locked, and it terminates on its own once the
        # Core API answers, because the attempt count is already spent.
        log.error("failure undeliverable", job_id=job.id)
        async with engine.begin() as conn:
            await release_for_retry(conn, job.id, "undeliverable", delay_seconds=30)


async def _lane(
    name: str,
    max_priority: int | None,
    *,
    cfg: Config,
    stop: asyncio.Event,
    engine,
    anthropic: AsyncAnthropic,
    http: httpx.AsyncClient,
    cancels: Cancels,
    worker_id: str,
) -> None:
    """Claim and run jobs, one at a time, until the worker stops.

    `max_priority` bounds what this lane may claim. The interactive lane takes
    only work somebody is waiting on; the general lane takes anything, in
    priority order.
    """
    while not stop.is_set():
        try:
            async with engine.begin() as conn:
                await reap(conn, KINDS, cfg.stale_after_seconds)
                job = await claim(
                    conn,
                    worker_id,
                    KINDS,
                    cfg.per_account_running,
                    stale_after_seconds=cfg.stale_after_seconds,
                    max_priority=max_priority,
                )

            if job is None:
                # Nothing to do. Wait, but wake immediately on shutdown
                # rather than sleeping through it.
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=cfg.poll_seconds)
                continue

            # **Cancelled before it was claimed.** The notification and the
            # claim race, and this is the half of the race the listener
            # cannot win: the job is already ours before the id arrives. The
            # row says so too, which covers a Stop the listener never heard:
            # during a deploy, while it was reconnecting, or one whose report
            # failed and whose row came back after the stale timeout.
            if job.cancelled or cancels.asked(str(job.id)):
                await _stopped(job, engine=engine, http=http, cfg=cfg)
                cancels.done(str(job.id))
                continue

            # **In a task rather than awaited directly**, which is the whole
            # mechanism: a coroutine being awaited cannot be interrupted, and
            # a task can. Cancelling it raises at the next await, which
            # inside an Anthropic call is the socket read.
            spent: dict = {}
            _SPENT.set(spent)
            running = asyncio.create_task(
                handle(job, cfg=cfg, engine=engine, anthropic=anthropic, http=http)
            )
            cancels.watching(str(job.id), running)
            try:
                # **A minute short of the lock going stale.** Nothing renews
                # it, so a turn still running past it is claimed again by the
                # other lane and runs twice at once. Cancelling `running` is
                # what the timeout does, and it lands here as TimeoutError.
                async with asyncio.timeout(cfg.stale_after_seconds - 60):
                    await running
            except TimeoutError:
                log.error("job timed out", job_id=job.id, kind=job.kind)
                if job.kind == "dump.answer":
                    await _give_up_or_retry(
                        job,
                        "timeout",
                        cfg=cfg,
                        engine=engine,
                        http=http,
                        lookups=spent.get("lookups"),
                    )
                else:
                    async with engine.begin() as conn:
                        await retry_or_die(conn, job, "timeout", delay_seconds=300)
            except asyncio.CancelledError:
                # **Ours, not the loop's.** A cancel aimed at this job must
                # not read as a shutdown, so it is caught here and the worker
                # carries on. If the process is actually stopping, `stop` is
                # set and the `while` ends on its own.
                if stop.is_set():
                    raise
                await _stopped(job, engine=engine, http=http, cfg=cfg)
            finally:
                cancels.done(str(job.id))

        except Exception as exc:  # noqa: BLE001
            # The loop itself must not die. A worker that exits on a
            # transient database blip stops answering everybody.
            log.error("worker loop error", lane=name, error_type=type(exc).__name__)
            await asyncio.sleep(cfg.poll_seconds)


async def run(cfg: Config, stop: asyncio.Event) -> None:
    # Five kept open: the cancel listener holds one for the life of the process,
    # and each lane can hold two at once (the nightly pass writes while it
    # reads). The ceiling is fifteen, not five: SQLAlchemy's default
    # max_overflow of 10 opens up to ten more under load. Size Postgres for 15.
    engine = create_async_engine(cfg.database_url, pool_size=5, pool_pre_ping=True)
    anthropic = AsyncAnthropic(api_key=cfg.anthropic_api_key)
    worker_id = f"agent-{uuid.uuid4().hex[:8]}"

    log.info(
        "worker started",
        worker_id=worker_id,
        kinds=KINDS,
        # 021. Which way voice notes will go: written down, or failed after
        # the retry because nothing can write them down.
        transcription="assemblyai-eu" if cfg.assemblyai_api_key else "off",
    )

    # 017. One listening connection for the process, alongside the poll rather
    # than instead of it: jobs still arrive by claim, and this is only how a
    # request to stop one reaches a worker already inside a model call.
    cancels = Cancels()
    listener = asyncio.create_task(listen(engine, cancels, stop))

    async with httpx.AsyncClient() as http:
        # 034. One beat a minute, beside the loop rather than inside it.
        beats = asyncio.create_task(heartbeats(http, cfg, stop))

        # **Two lanes, because priority decides what is claimed and never what
        # is interrupted.** With one loop, a dump that arrived during a nightly
        # pass or an embed batch waited for the whole of it. The interactive
        # lane claims only work somebody is waiting on, so a dump is always
        # claimable here even while the general lane is inside background work.
        shared = dict(
            cfg=cfg,
            stop=stop,
            engine=engine,
            anthropic=anthropic,
            http=http,
            cancels=cancels,
            worker_id=worker_id,
        )
        await asyncio.gather(
            _lane("interactive", INTERACTIVE, **shared),
            _lane("general", None, **shared),
        )

        beats.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await beats

    listener.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await listener

    await engine.dispose()
    log.info("worker stopped", worker_id=worker_id)


def main() -> None:
    cfg = Config.from_env()
    stop = asyncio.Event()

    async def _main() -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            # Finish the jobs in hand rather than dropping them mid-model-call
            # and leaving the rows locked until their visibility timeout.
            loop.add_signal_handler(sig, stop.set)
        await run(cfg, stop)

    asyncio.run(_main())


async def _handle_answer(
    job: ClaimedJob,
    *,
    question: str,
    cfg: Config,
    engine,
    anthropic: AsyncAnthropic,
    http: httpx.AsyncClient,
    country_override: str | None = None,
) -> None:
    """A question. Reads, answers, files nothing.

    Never raises, for the same reason `handle` does not: a turn that stops
    without reporting leaves somebody watching a spinner.

    **Failure here is cheap and that is deliberate.** Nothing was written, so
    there is nothing to unwind. The worst case is a sentence saying it could not
    answer, which is the honest outcome anyway.
    """
    assert job.account_id is not None

    say = _step_writer(http, cfg, job.id)
    budget: Lookups | None = None

    try:
        async with engine.connect() as conn:
            loaded = await ctx_mod.load_answer(
                conn,
                account_id=job.account_id,
                question=question,
                max_threads=cfg.max_threads,
                conversation_id=str(job.payload.get("conversationId") or "") or None,
                message_id=str(job.payload.get("messageId") or "") or None,
                max_turns=cfg.max_turns,
                country_override=country_override,
                embedder=_embed_query(cfg, http, timeout=ctx_mod.QUERY_LONGEST),
            )
        ctx = ctx_mod.fit_answer(loaded, cfg.max_prompt_tokens)

        budget = Lookups(
            question,
            may_search=ctx.may_search,
            may_read_links=ctx.may_read_links,
            country=ctx.country_in_effect,
            today=ctx.today,
        )
        caller = _tool_caller(
            http,
            cfg,
            job.id,
            embedder=_embed_query(cfg, http),
            lookups=(anthropic, cfg, budget),
            say=say,
        )
        outcome = await plan_answer(anthropic, ctx, cfg.answer_model, caller)
        _author_the_answer_line(outcome, budget)

        reply = outcome.reply
        if reply is None and not outcome.questions:
            # A question with no sentence back is a failure, unlike a dump,
            # where filing something and saying nothing is merely terse.
            raise InvalidOutput("answered without a reply")

        await _post_result(
            http,
            cfg,
            {
                "outcome": "answered",
                "jobId": job.id,
                "replyText": reply,
                "usage": _usage_wire(outcome),
                **_web_wire(budget),
                # The rows the answer showed, as ids. The reply resolves them
                # when it is read, so a row ticked or deleted later is never
                # stale in an old answer. Three, the turn-result route's cap.
                "found": outcome.found[:3],
                **({"questions": _questions_wire(outcome)} if outcome.questions else {}),
            },
        )
        log.info(
            "question answered",
            job_id=job.id,
            calls=len(outcome.usage),
            rows=len(outcome.found),
        )

    except Exception as exc:  # noqa: BLE001
        log.error("answer failed", job_id=job.id, error_type=type(exc).__name__)
        await _post_result(
            http,
            cfg,
            {
                "outcome": "failed",
                "jobId": job.id,
                "reason": "model_error",
                # What it searched before failing was still paid for.
                **({"lookups": budget.rows} if budget and budget.rows else {}),
            },
        )


def _embed_query(cfg: Config, http: httpx.AsyncClient, timeout: float = SEARCH_SECONDS):
    """Turn a question into a vector, or into nothing. See `query_embedder`.

    Bounded by default: a slow Voyage costs a question its vector arm, never
    half a minute, and the text arm answers alone.
    """
    return query_embedder(cfg.voyage_api_key, http, timeout)


if __name__ == "__main__":
    main()
