"""021. Voice notes in the worker: the provider client, the write-down, the
readers, the label.

AC-13: every reader of the person's words reads the transcript beside them.
AC-14: the transcript is written before the classifier, and a cancel during
       it waits for the write.
AC-16: a retry polls the provider's reference and never uploads again.
AC-17: nothing to hear settles with the line and no model call.
AC-19: a spoken dump is labelled as spoken.
AC-27: the host is the European endpoint and nothing else; the request
       carries the declared keys and nothing else; the forget lands.
"""

import asyncio
import json
import os
import time
import uuid

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from offload_agent import transcribe
from offload_agent.config import Config, _asyncpg
from offload_agent.context import (
    DumpContext,
    Thread,
    Voice,
    fit,
    load,
    photo_count,
    question_text,
    voice_of,
)
from offload_agent.harness.plan import build_blocks
from offload_agent.queue import ClaimedJob
from offload_agent.transcribe import (
    SUBMIT_KEYS,
    Transcript,
    TranscriptionFailed,
    _submit_body,
    _url,
    forget,
    poll,
    submit,
)
from offload_agent.worker import HEARD_NOTHING, _write_down, handle

API = "http://api.test"


def cfg(key: str | None = "k-eu") -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url=API,
        internal_token="t",
        anthropic_api_key="k",
        assemblyai_api_key=key,
        assemblyai_micros_per_second=100.0,
    )


# ---------------------------------------------------------------- the host and the keys


def test_every_url_is_on_the_european_host():
    assert _url("/v2/upload") == "https://api.eu.assemblyai.com/v2/upload"
    assert _url("/v2/transcript/abc").startswith("https://api.eu.assemblyai.com/")


def test_the_us_host_raises_even_if_the_constant_is_changed(monkeypatch):
    monkeypatch.setattr(transcribe, "EU", "https://api.assemblyai.com")
    with pytest.raises(ValueError):
        _url("/v2/upload")
    monkeypatch.setattr(transcribe, "EU", "http://api.eu.assemblyai.com")
    with pytest.raises(ValueError):
        _url("/v2/upload")


def test_the_request_carries_the_declared_keys_and_nothing_else(monkeypatch):
    body = _submit_body("https://cdn.example/x")
    assert set(body) == SUBMIT_KEYS == {"audio_url", "language_detection", "audio_end_at"}
    assert body["audio_end_at"] == 600_000
    assert body["language_detection"] is True
    # A key the vendor stopped declaring fails before a request is built.
    monkeypatch.setattr(transcribe, "SUBMIT_KEYS", frozenset({"audio_url"}))
    with pytest.raises(RuntimeError):
        _submit_body("https://cdn.example/x")


# ---------------------------------------------------------------- the provider client


class Provider:
    """AssemblyAI on the European host, as a MockTransport handler, beside a
    Core API that records what the worker posted."""

    def __init__(self, *, statuses: list[str] | None = None, text_: str = "call the plumber"):
        self.uploads = 0
        self.submits: list[dict] = []
        self.polls = 0
        self.deletes: list[str] = []
        self.statuses = statuses or ["processing", "completed"]
        self.text = text_
        self.api: list[tuple[str, str, dict]] = []
        self.original = b"\x00\x00\x00\x18ftypM4A " + b"\x11" * 64

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        path = request.url.path
        if host == "api.eu.assemblyai.com":
            assert request.headers["authorization"] == "k-eu"
            if path == "/v2/upload":
                self.uploads += 1
                assert request.content == self.original
                return httpx.Response(200, json={"upload_url": "https://cdn.eu.assemblyai.com/u/1"})
            if path == "/v2/transcript" and request.method == "POST":
                self.submits.append(json.loads(request.content))
                return httpx.Response(200, json={"id": "tr_1", "status": "queued"})
            if path.startswith("/v2/transcript/") and request.method == "GET":
                status = self.statuses[min(self.polls, len(self.statuses) - 1)]
                self.polls += 1
                body = {"id": "tr_1", "status": status}
                if status == "completed":
                    body.update({"text": self.text, "audio_duration": 13.4})
                return httpx.Response(200, json=body)
            if path.startswith("/v2/transcript/") and request.method == "DELETE":
                self.deletes.append(path.rsplit("/", 1)[1])
                return httpx.Response(200, json={})
            return httpx.Response(404)
        if host == "api.test":
            assert request.headers["authorization"] == "Bearer t"
            payload = json.loads(request.content) if request.content else {}
            self.api.append((request.method, path, payload))
            if path.endswith("/original"):
                return httpx.Response(200, content=self.original)
            return httpx.Response(200, json={"ok": True})
        raise AssertionError(f"unexpected host {host}")


async def test_submit_then_poll_returns_the_words_the_measurement_and_the_cost(monkeypatch):
    monkeypatch.setattr(transcribe, "POLL_SECONDS", 0.0)
    provider = Provider()
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as http:
        ref = await submit(http, cfg(), provider.original)
        assert ref == "tr_1"
        assert provider.submits == [
            {
                "audio_url": "https://cdn.eu.assemblyai.com/u/1",
                "language_detection": True,
                "audio_end_at": 600_000,
            }
        ]
        got = await poll(http, cfg(), ref, started_at=time.monotonic())
    assert isinstance(got, Transcript)
    assert got.text == "call the plumber"
    assert got.duration_ms == 13_400
    assert got.cost_micros == 1340
    assert provider.polls == 2


async def test_an_error_from_the_provider_and_a_missing_key_both_fail_the_turn(monkeypatch):
    monkeypatch.setattr(transcribe, "POLL_SECONDS", 0.0)
    provider = Provider(statuses=["error"])
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as http:
        with pytest.raises(TranscriptionFailed):
            await poll(http, cfg(), "tr_1", started_at=time.monotonic())
        with pytest.raises(TranscriptionFailed):
            await submit(http, cfg(key=None), provider.original)
    assert provider.uploads == 0


async def test_forget_treats_gone_and_never_there_the_same_and_raises_otherwise():
    calls: list[int] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "DELETE"
        assert request.url.host == "api.eu.assemblyai.com"
        code = [200, 404, 500][len(calls)]
        calls.append(code)
        return httpx.Response(code)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await forget(http, cfg(), "tr_1")
        await forget(http, cfg(), "tr_1")
        with pytest.raises(httpx.HTTPStatusError):
            await forget(http, cfg(), "tr_1")


# ---------------------------------------------------------------- the write-down


def _voice(ref: str | None = None) -> Voice:
    return Voice(blob_id="b1", message_id="m1", provider_ref=ref, transcribed=False)


async def test_a_fresh_note_is_uploaded_recorded_then_written_and_a_retry_only_polls(monkeypatch):
    monkeypatch.setattr(transcribe, "POLL_SECONDS", 0.0)
    provider = Provider()
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as http:
        await _write_down(http, cfg(), "job1", _voice())
        assert provider.uploads == 1
        paths = [(m, p) for m, p, _ in provider.api]
        assert paths == [
            ("GET", "/internal/v1/blobs/b1/original"),
            ("POST", "/internal/v1/blobs/b1/submitted"),
            ("POST", "/internal/v1/messages/m1/transcript"),
        ]
        assert provider.api[1][2] == {"jobId": "job1", "providerRef": "tr_1"}
        written = provider.api[2][2]
        assert written["text"] == "call the plumber"
        assert written["durationMs"] == 13_400
        assert written["costMicros"] == 1340
        assert written["jobId"] == "job1"

        # The retry: the reference is on the row, so nothing is uploaded again.
        provider.api.clear()
        await _write_down(http, cfg(), "job1", _voice(ref="tr_1"))
        assert provider.uploads == 1
        assert [p for _, p, _ in provider.api] == ["/internal/v1/messages/m1/transcript"]


async def test_a_cancel_during_the_poll_still_writes_the_transcript_then_stops(monkeypatch):
    monkeypatch.setattr(transcribe, "POLL_SECONDS", 0.01)
    provider = Provider(statuses=["processing", "processing", "completed"])
    async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as http:
        task = asyncio.create_task(_write_down(http, cfg(), "job1", _voice()))
        # Let it reach the poll, then stop the turn.
        while provider.polls < 1:
            await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert [p for _, p, _ in provider.api][-1] == "/internal/v1/messages/m1/transcript"


# ---------------------------------------------------------------- the label


def test_a_spoken_dump_is_labelled_as_spoken_and_a_typed_one_is_not():
    base = dict(
        turns=[],
        threads=[Thread(id="00000000-0000-0000-0000-000000000000", name="Misc", is_default=True)],
        landed=[],
        default_thread_id="00000000-0000-0000-0000-000000000000",
    )
    spoken = build_blocks(DumpContext(dump="um the plumber thursday", spoken=True, **base))
    assert "spoken and written down" in spoken[-1]["text"]
    assert spoken[-1]["text"].endswith("um the plumber thursday")
    assert "data, not" in spoken[-1]["text"].lower()
    typed = build_blocks(DumpContext(dump="the plumber thursday", **base))
    assert "spoken" not in typed[-1]["text"]
    # fit() carries the flag, as it must carry every field.
    assert fit(DumpContext(dump="x", spoken=True, **base), 8_000).spoken is True


# ---------------------------------------------------------------- the readers, on the database

ADMIN_DB = os.environ.get("DATABASE_URL")
AGENT_DB = os.environ.get("AGENT_DATABASE_URL")

needs_db = pytest.mark.skipif(
    not (ADMIN_DB and AGENT_DB), reason="needs both the admin and the worker database urls"
)


async def _seed(conn, *, words: str | None, transcript: str | None, photo: bool = False) -> dict:
    account = (
        await conn.execute(
            text(
                "insert into accounts (email, state, email_verified, analytics_subject_id) "
                "values (:email, 'active', true, gen_random_uuid()) returning id"
            ),
            {"email": f"{uuid.uuid4()}@example.invalid"},
        )
    ).scalar_one()
    thread = (
        await conn.execute(text("insert into threads (name) values ('Misc') returning id"))
    ).scalar_one()
    await conn.execute(
        text(
            "insert into thread_members (thread_id, account_id, state) values (:t, :a, 'accepted')"
        ),
        {"t": thread, "a": account},
    )
    await conn.execute(
        text("update accounts set default_thread_id = :t where id = :a"),
        {"t": thread, "a": account},
    )
    conversation = (
        await conn.execute(
            text("insert into conversations (account_id) values (:a) returning id"), {"a": account}
        )
    ).scalar_one()
    # An earlier voice message in the tail, already written down.
    earlier = (
        await conn.execute(
            text(
                "insert into messages (conversation_id, account_id, role, type, turn_id, text, "
                "transcript, transcribed_at, state) values (:c, :a, 'person', 'voice', "
                "gen_random_uuid(), null, 'buy oak brackets', now(), 'answered') returning id"
            ),
            {"c": conversation, "a": account},
        )
    ).scalar_one()
    await conn.execute(
        text(
            "insert into blobs (account_id, message_id, client_key, kind, content_type, byte_size, "
            "duration_ms, sha256) values (:a, :m, :k, 'audio', 'audio/mp4', 10, 5000, '\\x00')"
        ),
        {"a": account, "m": earlier, "k": str(uuid.uuid4())},
    )
    message = (
        await conn.execute(
            text(
                "insert into messages (conversation_id, account_id, role, type, turn_id, text, "
                "transcript, transcribed_at, state) values (:c, :a, 'person', 'voice', "
                "gen_random_uuid(), cast(:words as text), cast(:transcript as text), "
                "case when cast(:transcript as text) is null then null else now() end, 'seen') "
                "returning id"
            ),
            {"c": conversation, "a": account, "words": words, "transcript": transcript},
        )
    ).scalar_one()
    blob = (
        await conn.execute(
            text(
                "insert into blobs (account_id, message_id, client_key, kind, content_type, "
                "byte_size, duration_ms, sha256) values (:a, :m, :k, 'audio', 'audio/mp4', 10, "
                "14000, '\\x00') returning id"
            ),
            {"a": account, "m": message, "k": str(uuid.uuid4())},
        )
    ).scalar_one()
    if photo:
        await conn.execute(
            text(
                "insert into blobs (account_id, message_id, client_key, kind, content_type, "
                "byte_size, width, height, sha256) values (:a, :m, :k, 'image', 'image/png', 10, "
                "1, 1, '\\x00')"
            ),
            {"a": account, "m": message, "k": str(uuid.uuid4())},
        )
    return {
        "account": str(account),
        "conversation": str(conversation),
        "message": str(message),
        "blob": str(blob),
    }


@pytest.fixture
async def engines():
    admin = create_async_engine(_asyncpg(ADMIN_DB))
    worker = create_async_engine(_asyncpg(AGENT_DB))
    yield admin, worker
    await admin.dispose()
    await worker.dispose()


@needs_db
async def test_the_readers_compose_words_and_transcript_and_count_only_photos(engines):
    admin, worker = engines
    async with admin.begin() as conn:
        seeded = await _seed(
            conn, words="these ones", transcript="for the hallway shelves", photo=True
        )
        silent = await _seed(conn, words=None, transcript=None)
    async with worker.connect() as conn:
        assert (
            await question_text(conn, message_id=seeded["message"])
            == "these ones\n\nfor the hallway shelves"
        )
        assert await photo_count(conn, message_id=seeded["message"]) == 1
        assert await photo_count(conn, message_id=silent["message"]) == 0
        v = await voice_of(conn, message_id=silent["message"])
        assert v == Voice(
            blob_id=silent["blob"],
            message_id=silent["message"],
            provider_ref=None,
            transcribed=False,
        )
        assert (await voice_of(conn, message_id=seeded["message"])).transcribed is True

        ctx = await load(
            conn,
            account_id=seeded["account"],
            conversation_id=seeded["conversation"],
            message_id=seeded["message"],
            max_turns=10,
            max_threads=10,
        )
    assert ctx is not None
    assert ctx.dump == "these ones\n\nfor the hallway shelves"
    assert ctx.spoken is True
    assert len(ctx.photos) == 1
    # The earlier voice message reads as its words, with no photo count.
    assert [t.text for t in ctx.turns] == ["buy oak brackets"]


@needs_db
async def test_nothing_to_hear_settles_with_the_line_and_no_model_call(engines, monkeypatch):
    monkeypatch.setattr(transcribe, "POLL_SECONDS", 0.0)
    admin, worker = engines
    async with admin.begin() as conn:
        seeded = await _seed(conn, words=None, transcript=None)
        job_id = (
            await conn.execute(
                text(
                    "insert into jobs (kind, payload, account_id, state, attempts, max_attempts) "
                    "values ('dump.answer', :p, :a, 'running', 1, 2) returning id"
                ),
                {
                    "p": json.dumps(
                        {
                            "messageId": seeded["message"],
                            "conversationId": seeded["conversation"],
                            "turnId": str(uuid.uuid4()),
                        }
                    ),
                    "a": seeded["account"],
                },
            )
        ).scalar_one()

    provider = Provider(text_="")

    async def handler(request: httpx.Request) -> httpx.Response:
        response = await provider(request)
        # The Core API's transcript write, mirrored onto the row so the
        # readers after it see what it wrote.
        if request.url.host == "api.test" and request.url.path.endswith("/transcript"):
            payload = json.loads(request.content)
            async with admin.begin() as conn:
                await conn.execute(
                    text(
                        "update messages set transcript = :t, transcribed_at = now() where id = :m"
                    ),
                    {"t": payload["text"], "m": seeded["message"]},
                )
        return response

    job = ClaimedJob(
        id=str(job_id),
        kind="dump.answer",
        payload={"messageId": seeded["message"], "conversationId": seeded["conversation"]},
        attempts=1,
        max_attempts=2,
        account_id=seeded["account"],
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await handle(job, cfg=cfg(), engine=worker, anthropic=None, http=http)  # type: ignore[arg-type]

    steps = [p for m, p, body in provider.api if p == "/internal/v1/turn-step"]
    assert steps, "Listening was never written"
    listening = [body for _, p, body in provider.api if p == "/internal/v1/turn-step"][0]
    assert listening.get("text") == "Listening"
    results = [body for _, p, body in provider.api if p == "/internal/v1/turn-result"]
    assert results == [{"outcome": "answered", "jobId": str(job_id), "replyText": HEARD_NOTHING}]
    assert provider.uploads == 1
