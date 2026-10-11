"""The look and the judge each name their own model, apart from classify's.

Swarm round 2: the look moves to Haiku 5.5, a twentieth of Haiku 4.5's price,
and the forced tool call it makes is one Haiku 5.5 accepts and answers without
thinking. Classify and the reader stay on `sort_model`.
"""

import io
import json
from types import SimpleNamespace

import httpx
from PIL import Image

from offload_agent.config import Config
from offload_agent.harness.look import look
from offload_agent.harness.plan import judge_answer
from offload_agent.worker import _run_look


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (200, 30, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


class _Messages:
    def __init__(self, name: str, answer: dict):
        self.name = name
        self.answer = answer
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(type="tool_use", id="t1", name=self.name, input=self.answer)],
            usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0),
        )


def _cfg() -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )


def test_the_look_has_its_own_model_and_classify_keeps_haiku_4_5():
    fields = Config.__dataclass_fields__
    assert fields["look_model"].default == "claude-haiku-5-5"
    assert fields["sort_model"].default == "claude-haiku-4-5"


async def test_the_worker_hands_the_look_its_own_model():
    messages = _Messages("decide", {"verdicts": [{"index": 0, "keep": True}]})
    client = SimpleNamespace(messages=messages)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, content=_png())
        return httpx.Response(200, json={"kept": json.loads(request.content)["keep"]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await _run_look(http, _cfg(), client, "job-1", "msg-1", ["a"])
    [call] = messages.calls
    assert call["model"] == "claude-haiku-5-5"


async def test_the_look_leaves_room_for_the_larger_tokenizer():
    messages = _Messages("decide", {"verdicts": [{"index": 0, "keep": True}]})
    await look(SimpleNamespace(messages=messages), "claude-haiku-5-5", [_png()])
    [call] = messages.calls
    assert call["max_tokens"] >= 1024
    # Haiku 5.5 accepts a forced tool and answers it without thinking.
    assert call["tool_choice"] == {"type": "tool", "name": "decide"}


async def test_the_judge_on_haiku_4_5_sends_no_effort():
    """Effort 400s on Haiku 4.5."""
    messages = _Messages("answer", {"answers": False})
    await judge_answer(
        SimpleNamespace(messages=messages),
        "the 20th",
        field="date",
        question="Which day?",
        options=[],
        today="2026-10-10",
        model="claude-haiku-4-5",
    )
    [call] = messages.calls
    assert "output_config" not in call
    assert call["tool_choice"] == {"type": "tool", "name": "answer"}


def test_the_eval_runs_the_look_on_the_model_production_runs():
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evals"))
    import run

    assert run.MODELS["look"] == Config.__dataclass_fields__["look_model"].default
    assert run.MODELS["classify"] == Config.__dataclass_fields__["sort_model"].default
