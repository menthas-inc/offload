"""What a job's model calls used, for the ledger.

core-api prices every call from these tokens (src/pricing.ts) and the daily
budget reads the result, so every call a job makes has to be sent, not just
the planner's. The planner's calls ride on its `Outcome`; the small calls
around it (the classifier, the open-question judge, the mail look, the reader)
record here, into a sink the job opens, and the job's result drains it.

Tokens, never a price: a price sent from here would be a second price table.
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_SINK: ContextVar[list[dict] | None] = ContextVar("ledger_sink", default=None)


def usage_of(model: str, usage, started: float) -> dict:
    """One call as the ledger takes it. Anthropic's input count excludes both
    cache counts, so all four are sent and none is derived from another."""
    return {
        "model": model,
        "inputTokens": getattr(usage, "input_tokens", 0) or 0,
        "outputTokens": getattr(usage, "output_tokens", 0) or 0,
        "cacheReadTokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
        "cacheWriteTokens": getattr(usage, "cache_creation_input_tokens", 0) or 0,
        "latencyMs": int((time.monotonic() - started) * 1000),
    }


def record(entry: dict) -> None:
    """Keep a call for the job's result. Outside a job there is nowhere to
    send it, which is the evals and the tests, and that is not an error."""
    sink = _SINK.get()
    if sink is not None:
        sink.append(entry)


def drain() -> list[dict]:
    """What the job has recorded since the last drain, once."""
    sink = _SINK.get()
    if not sink:
        return []
    taken = list(sink)
    sink.clear()
    return taken


@contextmanager
def collecting() -> Iterator[None]:
    """Open a sink for one job. Each job runs in its own task, whose context is
    its own copy, so two jobs never share one."""
    token = _SINK.set([])
    try:
        yield
    finally:
        _SINK.reset(token)
