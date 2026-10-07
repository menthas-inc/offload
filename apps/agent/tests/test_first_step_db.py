"""017, as changed by the thinking row (2026-10-07): the worker writes no step
of its own before the model has done anything.

"Looking through your threads" was written ahead of the classifier on every
dump turn so the line would not land after Stop. The thinking row's animation
says working from the first frame now, so that line was filler, and on a turn
like "what time is it" it was also untrue.
"""

import json
import os
import uuid

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent import worker as worker_mod
from offload_agent.config import Config, _asyncpg
from offload_agent.queue import ClaimedJob
from offload_agent.worker import handle

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

needs_db = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


def cfg() -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )


@pytest.fixture
async def engines():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    worker = create_async_engine(_asyncpg(AGENT_DB))
    yield admin, worker
    await admin.dispose()
    await worker.dispose()


async def _seed_typed(conn, words: str) -> dict:
    account = (
        await conn.execute(
            text(
                "insert into accounts (email, state, email_verified, analytics_subject_id) "
                "values (:email, 'active', true, gen_random_uuid()) returning id"
            ),
            {"email": f"{uuid.uuid4()}@example.invalid"},
        )
    ).scalar_one()
    conversation = (
        await conn.execute(
            text("insert into conversations (account_id) values (:a) returning id"), {"a": account}
        )
    ).scalar_one()
    message = (
        await conn.execute(
            text(
                "insert into messages (conversation_id, account_id, role, type, turn_id, text, "
                "state) values (:c, :a, 'person', 'text', gen_random_uuid(), :w, 'seen') "
                "returning id"
            ),
            {"c": conversation, "a": account, "w": words},
        )
    ).scalar_one()
    return {"account": str(account), "conversation": str(conversation), "message": str(message)}


@needs_db
async def test_a_typed_turn_writes_no_step_before_the_model_does_anything(engines, monkeypatch):
    admin, worker = engines
    async with admin.begin() as conn:
        seeded = await _seed_typed(conn, "what time is it")

    posted: list[tuple[str, dict]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        posted.append((request.url.path, json.loads(request.content or b"{}")))
        return httpx.Response(200, json={})

    # The classifier is the first model call on a typed turn. Stopping the turn
    # there leaves exactly what the worker wrote before any model ran.
    reached: list[str] = []

    async def classify(_client, asked, _model):
        reached.append(asked)
        raise RuntimeError("stop here")

    monkeypatch.setattr(worker_mod, "classify", classify)

    job = ClaimedJob(
        id=str(uuid.uuid4()),
        kind="dump.answer",
        payload={"messageId": seeded["message"], "conversationId": seeded["conversation"]},
        attempts=1,
        max_attempts=2,
        account_id=seeded["account"],
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await handle(job, cfg=cfg(), engine=worker, anthropic=None, http=http)  # type: ignore[arg-type]

    assert reached == ["what time is it"]
    assert [body for path, body in posted if path == "/internal/v1/turn-step"] == []
