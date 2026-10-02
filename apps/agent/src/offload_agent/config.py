"""Configuration, read once at import and never guessed.

Every value here has to be set. There is no default that quietly points at
production and no fallback that makes a misconfigured worker look healthy: a
worker that starts with the wrong database or no API key should fail at boot,
where it is obvious, rather than at the first dump.
"""

import os
from dataclasses import dataclass


def _asyncpg(url: str) -> str:
    """Normalise either Postgres URL spelling onto the asyncpg driver."""
    for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix) :]
    raise RuntimeError(f"AGENT_DATABASE_URL has an unexpected scheme: {url.split(':', 1)[0]}")


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set. The worker refuses to start rather than run "
            f"against a default nobody chose."
        )
    return value


@dataclass(frozen=True)
class Config:
    database_url: str
    api_url: str
    internal_token: str
    anthropic_api_key: str
    # Optional on purpose. Without it the text half of search still answers and
    # only meaning is missing, which is a worse product and not a broken one.
    # Production refuses to start without it, in the deploy config rather than
    # here, the way the vault key does.
    voyage_api_key: str | None = None
    # 021. Optional the same way: unset, every voice note fails
    # `transcription_failed` after its retry and the boot line says so. The
    # rate is what the ledger row is priced from, in micros per second of
    # audio the provider measured; the default is their published price on
    # 2026-09-20, $0.15 an hour.
    assemblyai_api_key: str | None = None
    assemblyai_micros_per_second: float = 41.67

    # The numbers from the impl-spec. Constants, not literals at a call site,
    # because three acceptance criteria are untestable without them.
    max_turns: int = 20
    max_threads: int = 12
    max_prompt_tokens: int = 8_000
    per_account_running: int = 2
    poll_seconds: float = 1.0
    # How long a claimed job may sit untouched before another worker takes it
    # for gone. See `queue.STALE_AFTER_SECONDS`.
    stale_after_seconds: int = 900
    # Sonnet, kept on cost (2026-09-17). Opus was measured on the principle
    # evals with the same prompt and did better, 255 of 274 filing cases to
    # 242 and asking back where Sonnet did not, at about 1.7 times the price
    # per dump. The prefix was cut instead; the model decision is open in
    # decisions.md.
    model: str = "claude-sonnet-5"
    # The tiers stack.md routes by, named here rather than at a call site.
    #
    # `sort` for the question-or-note call: it is one boolean and every dump
    # already pays for a call at this tier. `reason` for answering, which
    # stack.md describes as being for "hard retrieval and cross-thread
    # reasoning", written down before this feature existed.
    sort_model: str = "claude-haiku-4-5"
    # Opus 5 still. Opus 5.5 was measured on 2026-10-02 on the 112 answering
    # cases, same code: 98 passed against Opus 5's 109, for 30% less. Nothing
    # it was sent is one it refuses, so the gap is behaviour: past the word
    # caps, a softened "I couldn't find", an offer to file, and one refused
    # subject answered. The prompts were tuned on Opus 5 and its effort
    # defaults to medium; /test-llm against 5.5 is what would earn the switch.
    answer_model: str = "claude-opus-5"
    # 032. The nightly pass: compaction, what the day's dumps add, and on the
    # default thread the threads to suggest. Sonnet 5, the owner's choice on
    # 2026-10-02 from the nightly principles: Haiku passed 23 of 26 and its
    # misses restated rows as notes, Sonnet 5 passed 26 of 26, at twice the
    # price per token, about a cent a pass.
    nightly_model: str = "claude-sonnet-5"

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            # asyncpg wants postgresql+asyncpg://. Rewritten here rather than
            # stored twice, so there is one connection string in the
            # environment and not two that can drift.
            #
            # Both spellings, because Postgres accepts postgres:// and
            # postgresql:// interchangeably and different tools emit different
            # ones. Handling only the long form failed on a URL that used the
            # short one, with SQLAlchemy reporting a missing dialect plugin
            # rather than anything resembling the actual problem.
            database_url=_asyncpg(_required("AGENT_DATABASE_URL")),
            api_url=_required("API_URL"),
            internal_token=_required("INTERNAL_SERVICE_TOKEN"),
            anthropic_api_key=_required("ANTHROPIC_API_KEY"),
            voyage_api_key=os.environ.get("VOYAGE_API_KEY") or None,
            assemblyai_api_key=os.environ.get("ASSEMBLYAI_API_KEY") or None,
            assemblyai_micros_per_second=float(
                os.environ.get("ASSEMBLYAI_MICROS_PER_SECOND") or 41.67
            ),
        )
