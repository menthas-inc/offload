"""038. The memory pass. One account, one model call, once a night.

It reads what the person said since the last pass, their own thread notes and
the memories already held, and proposes what to add, what is now true instead
and what to fold. **The model proposes, the Core API decides**: the endpoint
re-derives which messages and notes may be cited and holds every rule again.

**Bounded whatever the account's age (OFF-8):** 60 messages of 500
characters, 40 thread notes, 50 memories, under one fixed system prompt.

**Entries, not lines**, as the nightly pass has it: each item is a JSON object
on its own line, so words inside one cannot pass for another.

**Nothing here logs a word.** Counts, ids, latency and outcomes only (OFF-1).
"""

from __future__ import annotations

import json
import time
from typing import Literal

import httpx
import structlog
from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import text

from offload_agent import ledger
from offload_agent.config import Config
from offload_agent.context import QUERY_LONGEST, Embedder, memories_for, query_words, today_line
from offload_agent.embed import query_embedder
from offload_agent.prompt_files import load
from offload_agent.queue import ClaimedJob, finish, retry_or_die

log = structlog.get_logger()

KINDS = ["account.memories"]

#: Matching PASS_MESSAGES, PASS_MESSAGE_CHARS and PASS_NOTES in the Core API.
MESSAGE_CAP = 60
MESSAGE_CHARS = 500
NOTE_CAP = 40

_PROMPT = load("memory")

_ACCOUNT = text("select time_zone from accounts where id = cast(:account_id as uuid)")

# The Core API's `passMessages`, read here to build the prompt and re-derived
# there before anything is applied.
_MESSAGES = text(
    """
    select m.id::text as id, to_char(m.created_at, 'YYYY-MM-DD') as day,
           said(m.text, m.transcript) as text
      from messages m
     where m.account_id = cast(:account_id as uuid)
       and m.role = 'person'
       and m.source not in ('mail', 'gmail', 'calendar', 'browser')
       and not m.derived_from_untrusted
       and m.deleted_at is null
       and said(m.text, m.transcript) is not null
       and m.created_at > greatest(
             coalesce((select a.memories_at from accounts a where a.id = cast(:account_id as uuid)),
                      now() - interval '25 hours'),
             now() - interval '7 days')
       and not exists (select 1 from memory_forgotten f
                        where f.message_id = m.id and f.account_id = cast(:account_id as uuid))
     order by m.created_at desc
     limit :limit
    """
)

# Their own active thread notes in threads only they are in, never another
# member's, never untrusted or muted: a note in a shared thread may summarise
# somebody else's words.
_NOTES = text(
    """
    select n.id::text as id, n.text as text, to_char(n.created_at, 'YYYY-MM-DD') as day
      from notes n
     where n.scope = 'thread'
       and n.account_id = cast(:account_id as uuid)
       and not n.derived_from_untrusted
       and n.deleted_at is null
       and n.superseded_at is null
       and n.muted_at is null
       and exists (select 1 from thread_members tm
                    where tm.thread_id = n.subject_id
                      and tm.account_id = cast(:account_id as uuid)
                      and tm.state = 'accepted')
       and not exists (select 1 from thread_members other
                        where other.thread_id = n.subject_id
                          and other.account_id <> cast(:account_id as uuid)
                          and other.state = 'accepted')
     order by n.updated_at desc
     limit :limit
    """
)

Kind = Literal["people", "things", "about", "patterns"]


class Add(BaseModel):
    kind: Kind
    text: str = Field(min_length=1, max_length=200)
    cites: str = Field(min_length=1, max_length=40)


class Supersede(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=200)
    cites: str = Field(min_length=1, max_length=40)


class Fold(BaseModel):
    ids: list[str] = Field(min_length=2, max_length=10)
    text: str = Field(min_length=1, max_length=200)


class MemoryPlan(BaseModel):
    """What the pass proposes. `rules` is not a kind it may write."""

    add: list[Add] = Field(default_factory=list, max_length=5)
    supersede: list[Supersede] = Field(default_factory=list, max_length=20)
    fold: list[Fold] = Field(default_factory=list, max_length=20)


def _schema(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()
    schema.pop("title", None)
    for definition in schema.get("$defs", {}).values():
        definition.pop("title", None)
        for field in definition.get("properties", {}).values():
            field.pop("title", None)
    for field in schema.get("properties", {}).values():
        field.pop("title", None)
    return schema


def _entry(**fields) -> str:
    return json.dumps(fields, ensure_ascii=False)


def listing(*, today: str | None, memories: list, notes: list, messages: list) -> str:
    """The turn, as three labelled lists of JSON entries."""
    parts = [f"Today is {today}." if today else "Today's date is not known."]
    parts.append(
        "Memories already held:\n"
        + (
            "\n".join(
                _entry(id=m["id"], kind=m["kind"], origin=m["origin"], text=m["text"])
                for m in memories
            )
            or "(none)"
        )
    )
    parts.append(
        "Their own thread notes, newest first:\n"
        + ("\n".join(_entry(id=n["id"], day=n["day"], text=n["text"]) for n in notes) or "(none)")
    )
    parts.append(
        "Their own messages since the last pass, newest first:\n"
        + (
            "\n".join(
                _entry(
                    id=m["id"], day=m["day"], text=" ".join(str(m["text"]).split())[:MESSAGE_CHARS]
                )
                for m in messages
            )
            or "(none)"
        )
    )
    return "\n\n".join(parts)


async def _ask(
    client: AsyncAnthropic, cfg: Config, turn: str
) -> tuple[MemoryPlan | None, list[dict]]:
    """One call, one repair as a `tool_result`, then give up (OFF-5)."""
    messages: list[dict] = [{"role": "user", "content": turn}]
    usage: list[dict] = []
    model = cfg.memory_model
    for attempt in range(2):
        started = time.monotonic()
        response = await client.messages.create(
            model=model,
            max_tokens=2048,
            system=[{"type": "text", "text": _PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=messages,
            tools=[
                {
                    "name": "memory",
                    "description": "Say what to add, what is now true instead, and what to fold.",
                    "input_schema": _schema(MemoryPlan),
                }
            ],
            tool_choice={"type": "tool", "name": "memory"},
        )
        usage.append(ledger.usage_of(model, response.usage, started))
        block = next((one for one in response.content if one.type == "tool_use"), None)
        if block is None:
            if attempt == 0:
                messages = messages + [
                    {"role": "assistant", "content": response.content},
                    {"role": "user", "content": "Answer with the memory tool."},
                ]
            continue
        try:
            return MemoryPlan.model_validate(block.input), usage
        except ValidationError as exc:
            # Field names and error types, never the values.
            complaint = "; ".join(
                (str(e["loc"][0]) if e["loc"] else "(root)") + ": " + e["type"]
                for e in exc.errors()
            )
            log.warning(
                "memory pass unparseable", attempt=attempt, errors=[e["type"] for e in exc.errors()]
            )
            if attempt == 0:
                messages = messages + [
                    {"role": "assistant", "content": response.content},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "is_error": True,
                                "content": f"That did not match the schema: {complaint}. "
                                "Send the same conclusion again in the right shape.",
                            }
                        ],
                    },
                ]
    return None, usage


async def read(
    conn, account_id: str, embedder: Embedder | None = None
) -> tuple[str | None, list, list, list]:
    """Today, the memories, the notes and the messages, already bounded.

    040. The messages first: the memories it is shown are the fifty nearest
    what the person said, their own before learned, as a turn's are."""
    params = {"account_id": account_id}
    account = (await conn.execute(_ACCOUNT, params)).mappings().first()
    today = await today_line(conn, account["time_zone"] if account else None)
    notes = list((await conn.execute(_NOTES, {**params, "limit": NOTE_CAP})).mappings().all())
    messages = list(
        (await conn.execute(_MESSAGES, {**params, "limit": MESSAGE_CAP})).mappings().all()
    )
    words = query_words("\n".join(str(m["text"] or "") for m in messages))
    memories = [
        {"id": m.id, "kind": m.kind, "text": m.text, "origin": m.origin}
        for m in await memories_for(conn, account_id, words, embedder, wait=QUERY_LONGEST)
    ]
    return today, memories, notes, messages


async def handle_memories(
    job: ClaimedJob, *, cfg: Config, engine, http: httpx.AsyncClient, client: AsyncAnthropic
) -> None:
    """Read one account, ask once, post the plan."""
    if not job.account_id:
        async with engine.begin() as conn:
            await finish(conn, job.id)
        return

    async with engine.connect() as conn:
        today, memories, notes, messages = await read(
            conn, job.account_id, query_embedder(cfg.voyage_api_key, http, QUERY_LONGEST)
        )
    if not messages:
        # Nothing new of theirs since the booking.
        async with engine.begin() as conn:
            await finish(conn, job.id)
        return

    started = time.monotonic()
    plan, usage = await _ask(
        client, cfg, listing(today=today, memories=memories, notes=notes, messages=messages)
    )
    if plan is None:
        async with engine.begin() as conn:
            await retry_or_die(conn, job, "memory_unparseable", delay_seconds=3600)
        return

    response = await http.post(
        f"{cfg.api_url}/internal/v1/memory-result",
        json={"jobId": job.id, "usage": usage, **plan.model_dump()},
        headers={"authorization": f"Bearer {cfg.internal_token}"},
        timeout=30.0,
    )
    response.raise_for_status()
    applied = response.json()
    # Counts only. Never a memory, a note or a message.
    log.info(
        "memory pass",
        memories=len(memories),
        notes=len(notes),
        messages=len(messages),
        added=applied.get("added"),
        superseded=applied.get("superseded"),
        folded=applied.get("folded"),
        ignored=applied.get("ignored"),
        latency_ms=int((time.monotonic() - started) * 1000),
    )
