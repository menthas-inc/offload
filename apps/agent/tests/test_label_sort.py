"""025. The nightly sort's own control flow, and what it reads.

The model half is stubbed. What the Core API does with the plan is tested
there. What matters here: a bad answer costs one repair and then gives up; a
good one comes back parsed and paid for; the plan has no way to say remove;
the listing carries ids, types and titles and never a body; the rows are
bounded; and nobody outside the thread has a thread read for them.
"""

from dataclasses import dataclass

import pytest

from offload_agent.label_sort import (
    KINDS,
    LABEL_SORT_BUDGET,
    SortPlan,
    _ask,
    _listing,
)


@dataclass
class ToolUse:
    id: str
    name: str
    input: dict
    type: str = "tool_use"


@dataclass
class Usage:
    input_tokens: int = 100
    output_tokens: int = 20
    cache_read_input_tokens: int = 0


@dataclass
class Response:
    content: list
    stop_reason: str = "tool_use"
    usage: Usage = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.usage is None:
            self.usage = Usage()


class StubModel:
    def __init__(self, responses):
        self._responses = list(responses)
        self.requests: list[dict] = []
        self.messages = self

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        return self._responses.pop(0)


class Cfg:
    sort_model = "claude-haiku-4-5"


def test_its_own_kind_and_a_fixed_budget():
    assert KINDS == ["labels.sort"]
    assert LABEL_SORT_BUDGET == 200


def test_the_plan_cannot_say_remove():
    assert set(SortPlan.model_fields) == {"create", "apply"}


def test_the_listing_is_ids_types_and_titles_as_data():
    rows = [{"id": "c1", "type": "task", "title": "Ferry across the Bosphorus"}]
    labels = [{"id": "l1", "name": "Istanbul"}]
    text = _listing("Europe, October", rows, labels)
    assert "c1" in text and "task" in text and "Ferry across the Bosphorus" in text
    assert "l1" in text and "Istanbul" in text
    assert "data" in text.lower()


@pytest.mark.asyncio
async def test_a_good_answer_comes_back_parsed_and_paid_for():
    body = {"create": [{"name": "Istanbul", "content_ids": ["c1"]}], "apply": []}
    model = StubModel([Response(content=[ToolUse("a", "sort", body)])])
    plan, usage = await _ask(model, Cfg(), "a listing")
    assert plan is not None and plan.create[0].name == "Istanbul"
    assert len(usage) == 1 and usage[0]["model"] == "claude-haiku-4-5"
    assert model.requests[0]["tool_choice"] == {"type": "tool", "name": "sort"}


@pytest.mark.asyncio
async def test_one_repair_then_nothing():
    bad = {"create": [{"name": "", "content_ids": []}], "apply": "no"}
    first = Response(content=[ToolUse("a", "sort", bad)])
    second = Response(content=[ToolUse("b", "sort", bad)])
    model = StubModel([first, second])
    plan, usage = await _ask(model, Cfg(), "a listing")
    assert plan is None
    assert len(usage) == 2


# ------------------------------------------------------------------ as the worker

import os  # noqa: E402
import uuid  # noqa: E402

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from offload_agent.config import _asyncpg  # noqa: E402
from offload_agent.label_sort import _LABELS, _MEMBER, _ROWS  # noqa: E402

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")
needs_db = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


@needs_db
@pytest.mark.asyncio
async def test_the_worker_reads_a_members_thread_and_nothing_for_a_leaver():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    worker = create_async_engine(_asyncpg(AGENT_DB))
    try:
        async with admin.begin() as conn:
            ids = {}
            for who in ("in", "out"):
                ids[who] = (
                    await conn.execute(
                        text(
                            "insert into accounts (email, state, email_verified, "
                            "analytics_subject_id) values (:e, 'active', true, "
                            "gen_random_uuid()) returning id"
                        ),
                        {"e": f"{uuid.uuid4()}@example.invalid"},
                    )
                ).scalar_one()
            thread = (
                await conn.execute(
                    text("insert into threads (name) values ('Europe') returning id")
                )
            ).scalar_one()
            for who, state in (("in", "accepted"), ("out", "removed")):
                await conn.execute(
                    text(
                        "insert into thread_members (thread_id, account_id, state) "
                        "values (:t, :a, :s)"
                    ),
                    {"t": thread, "a": ids[who], "s": state},
                )
            await conn.execute(
                text(
                    "insert into content (account_id, thread_id, type, title, body) "
                    "values (:a, :t, 'task', 'Ferry', 'a private paragraph')"
                ),
                {"a": ids["in"], "t": thread},
            )
            await conn.execute(
                text(
                    "insert into labels (thread_id, name, colour, set_by) "
                    "values (:t, 'Istanbul', 1, 'person')"
                ),
                {"t": thread},
            )

        async with worker.connect() as conn:
            member = await conn.execute(
                _MEMBER, {"thread_id": str(thread), "account_id": str(ids["in"])}
            )
            leaver = await conn.execute(
                _MEMBER, {"thread_id": str(thread), "account_id": str(ids["out"])}
            )
            assert member.scalar() is True
            assert leaver.scalar() is False
            rows = (
                (await conn.execute(_ROWS, {"thread_id": str(thread), "budget": 200}))
                .mappings()
                .all()
            )
            assert [dict(r) for r in rows] == [
                {"id": rows[0]["id"], "type": "task", "title": "Ferry"}
            ]
            labels = (
                (await conn.execute(_LABELS, {"thread_id": str(thread)})).mappings().all()
            )
            assert [r["name"] for r in labels] == ["Istanbul"]
    finally:
        await admin.dispose()
        await worker.dispose()
