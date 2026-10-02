"""The daily fold. One thread's notes, read and resolved.

**Why this is a model call and not a query.** Three of the four things it does
are judgements: whether two sentences say the same thing, whether one replaces
another, and whether something has stopped being true. The fourth, dropping a
date that has passed, could be a query, and doing it here means one pass over
the set instead of two mechanisms that disagree at the edges.

**The model proposes, the Core API decides.** Everything this file sends is a
suggestion: the endpoint enforces that a person's words are never rewritten,
that a fold never crosses authors, and that connector-derived notes are not
touched at all. Stating those rules in the prompt as well is deliberate, and it
is 004's rule that a prompt is a request and enforcement is enforcement.

**Nothing here logs note text.** This is the first job in the product that holds
a hundred sentences of dumped text at once, and the shortest route from here to
an OFF-1 breach is a helpful log line.
"""

from __future__ import annotations

import time
from pathlib import Path

import httpx
import structlog
from anthropic import AsyncAnthropic
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import text

from offload_agent import ledger
from offload_agent.config import Config
from offload_agent.context import today_line
from offload_agent.queue import ClaimedJob, finish, retry_or_die

log = structlog.get_logger()

KINDS = ["notes.compact"]

_PROMPT = (Path(__file__).parent / "prompts" / "compact.md").read_text()

# The budget, matching NOTE_PROMPT_BUDGET in the Core API. A thread over it is
# exactly the thread this job exists for, and reading more than the model will
# ever be handed would fold notes that are not reaching it anyway.
BUDGET = 100

# Newest first for the limit, so a thread over the budget folds what is current
# rather than what is oldest, then reversed for the model so it reads them in
# the order they were written. `derived_from_untrusted` is excluded here as well
# as at the endpoint: the model should not see them as candidates at all.
_NOTES = text(
    """
    select n.id::text as id, n.text as text, n.origin as origin,
           to_char(n.updated_at, 'YYYY-MM-DD') as written_at,
           (n.account_id = :account_id) as theirs
      from notes n
     where n.scope = 'thread'
       and n.subject_id = :thread_id
       and n.deleted_at is null
       and n.superseded_at is null
       and n.muted_at is null
       and not n.derived_from_untrusted
     order by n.updated_at desc
     limit :budget
    """
)


class Folded(BaseModel):
    """One note the set says now, and what it replaces."""

    text: str = Field(min_length=1, max_length=200)
    folded_from: list[str] = Field(min_length=1, max_length=50)
    occurs_at: str | None = None
    occurs_end_at: str | None = None
    due_at: str | None = None


class Compaction(BaseModel):
    """What a day's reading concluded. Three empty lists is a valid answer."""

    supersede: list[str] = Field(default_factory=list, max_length=200)
    remove: list[str] = Field(default_factory=list, max_length=200)
    add: list[Folded] = Field(default_factory=list, max_length=100)


def _schema(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()
    schema.pop("title", None)
    for field in schema.get("properties", {}).values():
        field.pop("title", None)
    return schema


def _lines(rows: list) -> str:
    """One note per line: id, date, author, text.

    The author is `you` or `someone else` rather than a name or an id. The model
    needs to know a fold cannot cross the boundary; who the other person is adds
    nothing and puts a name in a prompt that did not need one.
    """
    return "\n".join(
        f"{row['id']} | {row['written_at']} | "
        f"{'you' if row['theirs'] else 'someone else'} | "
        f"{'offload wrote this' if row['origin'] == 'learned' else 'they typed this'} | "
        f"{row['text']}"
        for row in rows
    )


def _held_to_the_rules(plan: Compaction, rows: list) -> Compaction:
    """The two rules compact.md states that the model breaks most, held here.

    A note a person typed is never removed: Haiku removed "asdf" and a hostile
    note another member wrote, both typed. And a fold needs two sources when
    its one source is a person's note: re-adding a stated note under
    `folded_from` naming only itself turns their words into offload's, which
    is the rewrite the prompt forbids. A learned note may be rewritten alone,
    because offload wrote it.
    """
    by_id = {row["id"]: row for row in rows}
    typed = {i for i, row in by_id.items() if row["origin"] != "learned"}
    remove = [i for i in plan.remove if i not in typed]
    add = [
        entry
        for entry in plan.add
        if not (len(entry.folded_from) == 1 and entry.folded_from[0] in typed)
    ]
    if len(remove) != len(plan.remove) or len(add) != len(plan.add):
        log.info(
            "compaction held to the rules",
            removals_dropped=len(plan.remove) - len(remove),
            rewrites_dropped=len(plan.add) - len(add),
        )
    return plan.model_copy(update={"remove": remove, "add": add})


async def handle_compact(
    job: ClaimedJob, *, cfg: Config, engine, http: httpx.AsyncClient, client: AsyncAnthropic
) -> None:
    """Read one thread's notes, ask what the set says now, post the answer."""
    thread_id = job.payload.get("threadId")
    if not thread_id or not job.account_id:
        async with engine.begin() as conn:
            await finish(conn, job.id)
        return

    async with engine.begin() as conn:
        rows = (
            (
                await conn.execute(
                    _NOTES,
                    {
                        "thread_id": thread_id,
                        "account_id": job.account_id,
                        "budget": BUDGET,
                    },
                )
            )
            .mappings()
            .all()
        )

    # One note cannot be folded with anything and cannot contradict anything.
    if len(rows) < 2:
        async with engine.begin() as conn:
            await finish(conn, job.id)
        return

    ordered = list(reversed(rows))
    async with engine.connect() as conn:
        today = await today_line(conn)
    # The date, because the prompt asks for passed dates to be set aside and
    # the model had no way to know what day it was.
    listing = f"Today is {today}.\n\n" + _lines(ordered)
    started = time.monotonic()

    plan, usage = await _ask(client, cfg, listing)
    if plan is None:
        # Unparseable twice is a broken model, not a near miss. The job is
        # released for its one retry and the thread keeps every note it has,
        # which is the floor this feature never goes below.
        async with engine.begin() as conn:
            await retry_or_die(conn, job, "compact_unparseable", delay_seconds=3600)
        return

    plan = _held_to_the_rules(plan, ordered)

    body = {
        "jobId": job.id,
        "usage": usage,
        "supersede": plan.supersede,
        "remove": plan.remove,
        "add": [
            {
                "text": entry.text,
                "foldedFrom": entry.folded_from,
                "occursAt": entry.occurs_at,
                "occursEndAt": entry.occurs_end_at,
                "dueAt": entry.due_at,
            }
            for entry in plan.add
        ],
    }

    response = await http.post(
        f"{cfg.api_url}/internal/v1/notes-compacted",
        json=body,
        headers={"authorization": f"Bearer {cfg.internal_token}"},
        timeout=30.0,
    )
    response.raise_for_status()

    # Counts only. Never a note, never an id's text, never a reason.
    log.info(
        "notes compacted",
        read=len(rows),
        superseded=len(plan.supersede),
        removed=len(plan.remove),
        added=len(plan.add),
        latency_ms=int((time.monotonic() - started) * 1000),
    )


async def _ask(
    client: AsyncAnthropic, cfg: Config, listing: str
) -> tuple[Compaction | None, list[dict]]:
    """One call, one repair, then give up (OFF-5).

    Forced `tool_choice`, so the model cannot answer in prose. The repair turn
    is given the shape it broke and never the values it sent, for the same
    reason the log lines carry counts.

    **Both attempts are paid for whether or not either parses**, so the usage
    comes back alongside the plan rather than being dropped on the failure path.
    Compaction was the one model call in the product invisible to the ledger.
    """
    messages: list[dict] = [{"role": "user", "content": listing}]
    usage: list[dict] = []

    for attempt in range(2):
        started = time.monotonic()
        response = await client.messages.create(
            model=cfg.sort_model,
            max_tokens=4096,
            system=[
                {"type": "text", "text": _PROMPT, "cache_control": {"type": "ephemeral"}}
            ],
            messages=messages,
            tools=[
                {
                    "name": "compaction",
                    "description": "Say what this thread's notes say now.",
                    "input_schema": _schema(Compaction),
                }
            ],
            tool_choice={"type": "tool", "name": "compaction"},
        )

        usage.append(ledger.usage_of(cfg.sort_model, response.usage, started))

        # **The plan block, or nothing at all.** A response with no `tool_use`
        # in it should not be possible under a forced `tool_choice`, and a
        # truncated or refused one is where "should not" stops holding. It gets
        # the repair turn like any other unusable answer rather than ending the
        # loop early, which is what the previous for/else did.
        block = next((one for one in response.content if one.type == "tool_use"), None)
        if block is not None:
            try:
                return Compaction.model_validate(block.input), usage
            except ValidationError as exc:
                # **Shape only, never the value.** A pydantic error echoes the
                # input it rejected, and the input here is a hundred notes.
                log.warning(
                    "compaction unparseable",
                    attempt=attempt,
                    errors=[e["type"] for e in exc.errors()],
                )
        else:
            log.warning("compaction answered without a plan", attempt=attempt)

        if attempt == 0:
            messages = messages + [
                {"role": "assistant", "content": response.content},
                {
                    "role": "user",
                    "content": (
                        "That did not match the schema. Send it again, with the "
                        "same conclusion in the right shape."
                    ),
                },
            ]

    return None, usage
