"""026. A forwarded email in the worker: the look at its images, and the blocks.

AC-9: the look keeps only what it answers yes to, and keeps nothing when it
      cannot answer.
OFF-5: validated, one repair, then raised; the caller degrades and logs.
"""

import io
import json
from types import SimpleNamespace

import httpx
import pytest
from PIL import Image

from offload_agent.config import Config
from offload_agent.harness.look import LookFailed, look
from offload_agent.worker import _run_look


def _png(size=(320, 400)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


class _Messages:
    """Answers with the tool inputs given, in order, one per call."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        answer = self.answers.pop(0)
        return SimpleNamespace(
            content=[
                SimpleNamespace(
                    type="tool_use", id=f"t{len(self.calls)}", name="decide", input=answer
                )
            ],
            usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0),
        )


def _client(*answers):
    return SimpleNamespace(messages=_Messages(answers))


async def test_look_keeps_what_it_answers_yes_to():
    client = _client({"verdicts": [{"index": 0, "keep": False}, {"index": 1, "keep": True}]})
    kept = await look(client, "claude-haiku-4-5", [_png(), _png()])
    assert kept == [1]


async def test_look_sends_each_image_behind_a_label_in_one_call():
    client = _client({"verdicts": [{"index": 0, "keep": True}]})
    await look(client, "claude-haiku-4-5", [_png()])
    [call] = client.messages.calls
    content = call["messages"][0]["content"]
    assert [block["type"] for block in content] == ["text", "image", "text"]
    assert call["tool_choice"] == {"type": "tool", "name": "decide"}
    assert call["model"] == "claude-haiku-4-5"


async def test_look_ignores_an_index_it_was_not_shown():
    client = _client({"verdicts": [{"index": 7, "keep": True}, {"index": 0, "keep": True}]})
    assert await look(client, "claude-haiku-4-5", [_png()]) == [0]


async def test_look_repairs_once_then_raises():
    client = _client({"verdicts": "yes"}, {"verdicts": [{"index": "zero"}]})
    with pytest.raises(LookFailed):
        await look(client, "claude-haiku-4-5", [_png()])
    assert len(client.messages.calls) == 2


async def test_look_recovers_on_the_repair():
    client = _client({"nope": 1}, {"verdicts": [{"index": 0, "keep": True}]})
    assert await look(client, "claude-haiku-4-5", [_png()]) == [0]


# ---------------------------------------------------------------- the worker step


def _cfg() -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )


def _api(originals: dict[str, bytes], posted: list[dict]):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            blob = request.url.path.split("/")[-2]
            if blob not in originals:
                return httpx.Response(404, json={"error": "unknown_blob"})
            assert request.url.params["jobId"] == "job-1"
            return httpx.Response(200, content=originals[blob])
        posted.append({"path": request.url.path, "body": json.loads(request.content)})
        body = json.loads(request.content)
        return httpx.Response(200, json={"kept": body["keep"]})

    return handler


async def test_the_step_posts_the_ids_the_look_kept():
    posted: list[dict] = []
    originals = {"a": _png(), "b": _png()}
    client = _client({"verdicts": [{"index": 0, "keep": False}, {"index": 1, "keep": True}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(_api(originals, posted))) as http:
        kept = await _run_look(http, _cfg(), client, "job-1", "msg-1", ["a", "b"])
    assert kept == ["b"]
    assert posted == [
        {"path": "/internal/v1/messages/msg-1/look", "body": {"jobId": "job-1", "keep": ["b"]}}
    ]


async def test_the_step_keeps_nothing_when_the_look_fails():
    posted: list[dict] = []
    client = _client({"bad": 1}, {"bad": 2})
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(_api({"a": _png()}, posted))
    ) as http:
        kept = await _run_look(http, _cfg(), client, "job-1", "msg-1", ["a"])
    assert kept == []
    assert posted[0]["body"]["keep"] == []


async def test_the_step_skips_a_candidate_it_cannot_fetch():
    posted: list[dict] = []
    client = _client({"verdicts": [{"index": 0, "keep": True}]})
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(_api({"b": _png()}, posted))
    ) as http:
        kept = await _run_look(http, _cfg(), client, "job-1", "msg-1", ["gone", "b"])
    assert kept == ["b"]
