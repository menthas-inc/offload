"""The quarantined reader. One lookup, in its own conversation, with no way out.

**This is the whole security design of 016 in one file**, so the reasoning is
here rather than in a spec nobody reads at three in the morning.

The planner can file, reply, move and tick. It must therefore never read a web
page, because a page is written by somebody who would like it to do those things
on their behalf. So the page is read here instead, by a call that has:

- no client tools at all, so nothing it decides can reach a database;
- no thread contents, no notes, no conversation, so there is nothing to steal;
- a throwaway conversation, so no encrypted block and no page text is ever
  persisted or round-tripped;
- an output schema, so what crosses back to the planner is fields rather than
  prose.

**And no client tools is also why this is two calls rather than one.** Mixing a
server tool and a client tool in one turn makes the API defer the server tool
until the client tool result comes back, so forcing an output tool in the same
call as `web_search` would mean the search never runs. Gather first with server
tools only, then shape the conversation into fields with the output tool alone.

**What crosses back is two fields per source**, a domain and a URL. A provider's
citation also carries the page's title and a quoted excerpt, and forwarding
either walks attacker-controlled prose past everything above.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import structlog
from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, ValidationError

from .countries import name_of

log = structlog.get_logger()

_PROMPT = (Path(__file__).parent / "prompts" / "reader.md").read_text()

#: The fields a lookup may ask for. Closed, because it selects the shape of the
#: answer and an open set is a free-text field with extra steps.
WANT = {
    "date",
    "time",
    "place",
    "dates_range",
    "title",
    "artist",
    "price",
    "hours",
    "forecast",
    "fact",
    # The picture the page publishes about itself, as an address.
    #
    # **Only ever `og:image` or its equivalent**, which is the one image a page
    # chooses to be represented by. Not an image found in the body, which is
    # whatever the layout happened to contain, and not one composed from the
    # URL.
    "image",
}

#: What kind of lookup this was, for the counters that decide which narrow tool
#: gets built next. Anything outside this set becomes "other" and the string the
#: model produced is discarded rather than stored (016 AC-28).
LABELS = {
    "weather",
    "when_is",
    "place",
    "opening_hours",
    "price_or_availability",
    "link_metadata",
    "person_or_org",
    "how_to",
    "other",
}

#: Page text per fetch. It lands in this conversation and nowhere else, so this
#: bounds the bill and bounds how much one poisoned page can spend arguing,
#: rather than bounding the planner's prompt, which never sees any of it.
MAX_CONTENT_TOKENS = 10_000

#: Searches are bounded per turn rather than per call, so the number is passed
#: in. A pasted link gets exactly one read: the provider counts an earlier fetch
#: result as prior context, so a page printing another URL has made it fetchable,
#: and one read makes the second impossible rather than merely discouraged.
FETCHES_PER_LINK = 1

#: The one refusal category that is never a judgement call gets a backstop that
#: is not the model's compliance.
BLOCKED_DOMAINS: list[str] = []

#: A paused turn is resent unchanged. Capped like any retry loop.
MAX_PAUSES = 3


class Source(BaseModel):
    domain: str
    url: str


class Found(BaseModel):
    """What crosses back into the turn. Everything else stops here."""

    fields: dict[str, str] = Field(default_factory=dict)
    sources: list[Source] = Field(default_factory=list)
    unsure: bool = False
    label: str = "other"


class Answer(BaseModel):
    """What the model is asked for, which is less than what comes back.

    **`sources` is deliberately absent.** It is on `Found` because the caller
    reads it, and it is filled from the record of what was actually fetched, not
    from the model's account of it, exactly as a turn's thread pills come from
    the content rows rather than from the reply.

    Asking for it anyway cost a production turn. The schema had `domain`
    required, the model returned a source without one, validation rejected the
    whole lookup, and the field it rejected was one the very next line
    overwrote. "Book the restaurant for mothers day" came back as
    "Didn't finish that one." because of a field nobody read.
    """

    fields: dict[str, str] = Field(default_factory=dict)
    unsure: bool = False
    label: str = "other"


@dataclass
class Reading:
    """The outcome, plus what it cost and what it touched."""

    found: Found
    usage: list[dict] = field(default_factory=list)
    searches: int = 0
    fetches: int = 0
    failed: str | None = None


def _domain(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _schema(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()
    schema.pop("$defs", None)
    return schema


def _server_tools(*, searches: int, fetches: int) -> list[dict]:
    """The basic versions on purpose.

    The newer ones filter results with code execution before they reach the
    context window, which is worth real money at volume and costs zero data
    retention eligibility, because the filtering runs in a container. At one
    account and three searches a turn, retention is worth more than the tokens.
    """
    tools: list[dict] = []
    if searches:
        tools.append(
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": searches,
                **({"blocked_domains": BLOCKED_DOMAINS} if BLOCKED_DOMAINS else {}),
            }
        )
    if fetches:
        tools.append(
            {
                "type": "web_fetch_20250910",
                "name": "web_fetch",
                "max_uses": fetches,
                "max_content_tokens": MAX_CONTENT_TOKENS,
            }
        )
    return tools


def _sources_from(content: list) -> list[Source]:
    """Domains and URLs, from the record of what was read.

    Never from the model's own account of what it read, which is 005's rule
    about links applied one layer down, and never carrying a title or a quoted
    excerpt, which are the page's words rather than ours.
    """
    seen: dict[str, Source] = {}
    for block in content:
        kind = getattr(block, "type", None)
        if kind == "web_search_tool_result":
            for result in getattr(block, "content", []) or []:
                url = getattr(result, "url", None)
                if url:
                    seen.setdefault(url, Source(domain=_domain(url), url=url))
        if kind == "web_fetch_tool_result":
            body = getattr(block, "content", None)
            url = getattr(body, "url", None)
            if url:
                seen.setdefault(url, Source(domain=_domain(url), url=url))
    return list(seen.values())


async def read(
    client: AsyncAnthropic,
    model: str,
    *,
    question: str | None,
    url: str | None,
    want: list[str],
    searches: int,
    today: str | None = None,
    country: str | None = None,
) -> Reading:
    """Answer one lookup. Raises nothing: a failure is a `Reading` that says so."""
    asked = [w for w in want if w in WANT] or ["fact"]
    fetches = FETCHES_PER_LINK if url else 0

    # **The date and the country, from our database, on every lookup.** "When
    # do the clocks change" found a page listing both changes of the year and
    # came back with the March one, six months gone, because the reader had no
    # idea what day it was. Both are ours rather than theirs, so neither is
    # content leaving (OFF-1): the date is the server's clock and the country
    # is a setting they chose from a closed list.
    known = " ".join(
        part
        for part in (
            f"Today is {today}." if today else None,
            f"They are in {name_of(country) or country}." if country else None,
        )
        if part
    )

    # The seed. **This is the only place a URL can enter this conversation**,
    # which is what makes the provider's prior-context rule an argument we pass
    # rather than a promise we make: nothing else is in here to be fetched.
    opening = (
        f"Read this page and find: {', '.join(asked)}.\n\n{url}"
        if url
        else f"Find: {', '.join(asked)}.\n\nThe question: {question}"
    )
    if known:
        opening = f"{opening}\n\n{known}"

    messages: list[dict] = [{"role": "user", "content": opening}]
    usage: list[dict] = []
    tools = _server_tools(searches=searches, fetches=fetches)
    gathered: list = []

    try:
        for _ in range(MAX_PAUSES):
            started = time.monotonic()
            response = await client.messages.create(
                model=model,
                max_tokens=2048,
                system=[
                    {"type": "text", "text": _PROMPT, "cache_control": {"type": "ephemeral"}}
                ],
                messages=messages,
                tools=tools,
            )
            usage.append(_usage(response, model, started))
            gathered.extend(response.content)

            # A long server-side turn comes back paused and is continued by
            # sending the assistant content back unchanged, with the same tools.
            if response.stop_reason != "pause_turn":
                break
            messages.append({"role": "assistant", "content": response.content})
        else:
            log.warning("reader still paused", pauses=MAX_PAUSES)

        messages.append({"role": "assistant", "content": response.content})

        # Second call, and the tools are gone. Nothing is pending by now, so the
        # output tool is alone in the turn and is therefore actually reached.
        shaped = await _shape(client, model, messages, asked, usage)
    except Exception as exc:  # noqa: BLE001
        # The type, never the message. An SDK exception can embed the request
        # body, which by this point holds page text (OFF-1).
        log.warning("reader failed", error_type=type(exc).__name__)
        return Reading(found=Found(unsure=True), usage=usage, failed=type(exc).__name__)

    shaped.sources = _sources_from(gathered)
    counted = _counts(gathered)
    return Reading(found=shaped, usage=usage, searches=counted[0], fetches=counted[1])


def _counts(content: list) -> tuple[int, int]:
    searches = fetches = 0
    for block in content:
        if getattr(block, "type", None) != "server_tool_use":
            continue
        if getattr(block, "name", None) == "web_search":
            searches += 1
        if getattr(block, "name", None) == "web_fetch":
            fetches += 1
    return searches, fetches


async def _shape(
    client: AsyncAnthropic,
    model: str,
    messages: list[dict],
    asked: list[str],
    usage: list[dict],
) -> Found:
    """Turn the conversation into fields, through a schema rather than a parse."""
    ask = {
        "role": "user",
        "content": (
            "Now answer, using the tool. Only these fields, and only what you "
            f"actually read: {', '.join(asked)}."
        ),
    }
    turn = [*messages, ask]

    for attempt in range(2):
        started = time.monotonic()
        response = await client.messages.create(
            model=model,
            max_tokens=1024,
            system=[{"type": "text", "text": _PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=turn,
            tools=[
                {
                    "name": "found",
                    "description": "The fields you were asked for, and nothing else.",
                    "input_schema": _schema(Answer),
                }
            ],
            tool_choice={"type": "tool", "name": "found"},
        )
        usage.append(_usage(response, model, started))

        block = next((b for b in response.content if getattr(b, "type", "") == "tool_use"), None)
        if block is None:
            return Found(unsure=True)

        try:
            answer = Answer.model_validate(block.input)
        except ValidationError as exc:
            # **Field names and error types only.** This is the one place in the
            # product where injected page text sits closest to a log line, and
            # OFF-5's "log the failure" read naively means logging a completion
            # that a hostile page helped write.
            shape = "; ".join(
                ".".join(str(p) for p in e["loc"]) + ": " + e["type"] for e in exc.errors()
            )
            log.warning("reader output invalid", attempt=attempt, shape=shape)
            if attempt == 1:
                return Found(unsure=True)
            # **The correction goes back as a tool result, not as a message.**
            # A `tool_use` block has to be answered by a `tool_result` with the
            # same id; following it with a plain user turn is a 400, which is
            # what the retry did in production and why a recoverable shape error
            # became a failed lookup.
            turn = [
                *turn,
                {"role": "assistant", "content": response.content},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "is_error": True,
                            "content": f"That did not validate: {shape}. Again.",
                        }
                    ],
                },
            ]
            continue

        # Only what was asked for, and the label coerced. Both are the same
        # rule: a set is closed or it is not a set.
        found = Found(
            fields={k: v for k, v in answer.fields.items() if k in asked and v},
            unsure=answer.unsure,
            label=answer.label if answer.label in LABELS else "other",
        )
        return found

    return Found(unsure=True)


def _usage(response, model: str, started: float) -> dict:
    use = getattr(response, "usage", None)
    server = getattr(use, "server_tool_use", None)
    return {
        "model": model,
        "inputTokens": getattr(use, "input_tokens", 0) or 0,
        "outputTokens": getattr(use, "output_tokens", 0) or 0,
        "cacheReadTokens": getattr(use, "cache_read_input_tokens", 0) or 0,
        "webSearches": getattr(server, "web_search_requests", 0) or 0,
        "latencyMs": int((time.monotonic() - started) * 1000),
    }
