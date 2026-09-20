"""021. A voice note written down, by AssemblyAI, on their European servers.

The one place a second company receives a person's voice. What leaves is the
audio, a language-detection flag and the ten-minute bound, and nothing that
names the account. What comes back is the words, which the Core API writes
onto the message; the provider's copy is then deleted by `forget`.

**The host is a constant, not a setting.** Their published terms rule out
training on what is sent to the European servers and nowhere else, and a
base URL read from the environment is one missing variable away from the
default. Every request is built from `EU` and `_url` refuses anything else.

**The request keys are checked at import.** A field taken from documentation
and never sent is a guess (016's `use_cache`), so the keys this module sends
are a frozen set copied from the vendor's reference on 2026-09-20, and a
key outside it fails the process before it can fail a turn.

**Logging is type-only.** Never the transcript, never the reference: the
reference is a handle to a person's words at a third party, and a log line
is not where it belongs.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
import structlog

from offload_agent.config import Config

log = structlog.get_logger()

#: The European endpoint, and the only one. The host is written twice on
#: purpose: `_url` checks every URL it builds against the second copy, so a
#: change to the first that is not a change to both raises on the first call.
EU = "https://api.eu.assemblyai.com"
_EU_HOST = "api.eu.assemblyai.com"

#: The keys `POST /v2/transcript` is sent, copied from the vendor's API
#: reference as read on 2026-09-20 (`audio_url`, `language_detection`,
#: `audio_end_at`). Widen this set only from that page.
SUBMIT_KEYS: frozenset[str] = frozenset({"audio_url", "language_detection", "audio_end_at"})

#: The first ten minutes and no more, in milliseconds. This is what bounds
#: the bill per call: a browser's WebM carries no length in its header, so
#: the server cannot refuse a long file by reading it, and this parameter
#: means it never pays for one.
AUDIO_END_AT_MS = 600_000

#: How often the result is asked for, and for how long before the turn gives
#: up and retries on the job's own backoff.
POLL_SECONDS = 3.0
POLL_LIMIT_SECONDS = 360.0


def _url(path: str) -> str:
    """A URL on the European host. Anything else raises here, which is the
    test that the constant is the only host this module can reach."""
    url = f"{EU}{path}"
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc != _EU_HOST:
        raise ValueError("transcription host is not the European endpoint")
    return url


def _submit_body(audio_url: str) -> dict[str, object]:
    body: dict[str, object] = {
        "audio_url": audio_url,
        "language_detection": True,
        "audio_end_at": AUDIO_END_AT_MS,
    }
    unknown = set(body) - SUBMIT_KEYS
    if unknown:
        raise RuntimeError(
            f"transcription request carries keys the vendor does not declare: {sorted(unknown)}"
        )
    return body


# Checked once, at import, so a key added here without its reference fails the
# process rather than the first voice note.
_submit_body("https://example.invalid/checked-at-import")


class TranscriptionFailed(Exception):
    """The provider answered `error`, or did not answer in time. The type
    reaches the log; the provider's message never does."""


@dataclass(frozen=True)
class Transcript:
    text: str
    #: The provider's measurement, in milliseconds. What the ceiling counts.
    duration_ms: int
    #: What it cost, from the measurement and the configured rate.
    cost_micros: int
    #: Wall time from submission to the result, for the ledger.
    latency_ms: int


def _headers(cfg: Config) -> dict[str, str]:
    if not cfg.assemblyai_api_key:
        raise TranscriptionFailed("no key")
    return {"authorization": cfg.assemblyai_api_key}


async def submit(http: httpx.AsyncClient, cfg: Config, audio: bytes) -> str:
    """Upload the bytes and ask for a transcript. Returns the provider's
    reference, which the caller records before polling so a retry never
    sends the audio a second time."""
    headers = _headers(cfg)
    uploaded = await http.post(
        _url("/v2/upload"),
        content=audio,
        headers={**headers, "content-type": "application/octet-stream"},
        timeout=120.0,
    )
    uploaded.raise_for_status()
    audio_url = uploaded.json().get("upload_url")
    if not isinstance(audio_url, str) or not audio_url:
        raise TranscriptionFailed("no upload url")

    submitted = await http.post(
        _url("/v2/transcript"),
        json=_submit_body(audio_url),
        headers=headers,
        timeout=30.0,
    )
    submitted.raise_for_status()
    ref = submitted.json().get("id")
    if not isinstance(ref, str) or not ref:
        raise TranscriptionFailed("no reference")
    return ref


async def poll(http: httpx.AsyncClient, cfg: Config, ref: str, *, started_at: float) -> Transcript:
    """Ask until the provider is done, or until the limit."""
    headers = _headers(cfg)
    deadline = started_at + POLL_LIMIT_SECONDS
    while True:
        response = await http.get(_url(f"/v2/transcript/{ref}"), headers=headers, timeout=30.0)
        response.raise_for_status()
        body = response.json()
        status = body.get("status")
        if status == "completed":
            seconds = body.get("audio_duration")
            duration_ms = (
                int(round(float(seconds) * 1000)) if isinstance(seconds, (int, float)) else 0
            )
            text_ = body.get("text")
            return Transcript(
                text=text_.strip() if isinstance(text_, str) else "",
                duration_ms=duration_ms,
                cost_micros=int(round(duration_ms / 1000 * cfg.assemblyai_micros_per_second)),
                latency_ms=int((time.monotonic() - started_at) * 1000),
            )
        if status == "error":
            raise TranscriptionFailed("provider error")
        if time.monotonic() > deadline:
            raise TranscriptionFailed("timed out")
        await asyncio.sleep(POLL_SECONDS)


async def forget(http: httpx.AsyncClient, cfg: Config, ref: str) -> None:
    """Delete the provider's copy of the transcript. Gone and never-there
    are the same outcome; anything else raises so the job retries."""
    response = await http.delete(_url(f"/v2/transcript/{ref}"), headers=_headers(cfg), timeout=30.0)
    if response.status_code == 404:
        return
    response.raise_for_status()
