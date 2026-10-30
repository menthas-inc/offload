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
    # 030. The map, switched on in the same change as the privacy page. Off,
    # no page is read for a place, whatever the dumper's switch says.
    maps_on: bool = False
    # 034. The commit this worker runs, for its heartbeat. Railway's variable;
    # unset, the panel reads the commit as unknown. To verify on the platform.
    commit: str | None = None

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
    # Haiku 5.5 since the second swarm run (2026-10-13): with the same prompt
    # it held the principle evals (block1 28 of 30, block2 26 of 30, 13 at 50
    # of 56, 01 at 17 of 17, the screen at 66 of 68 against 67) at about a
    # quarter of the warm day and a p90 filing latency of x0.77. Sonnet 5 was
    # kept on cost over Opus on 2026-09-17 (255 of 274 to 242); the holdout
    # decides whether Haiku stays. The model decision is in decisions.md.
    model: str = "claude-haiku-5-5"
    # The tiers stack.md routes by, named here rather than at a call site.
    #
    # `sort` for the question-or-note call: it is one boolean and every dump
    # already pays for a call at this tier. `reason` for answering, which
    # stack.md describes as being for "hard retrieval and cross-thread
    # reasoning", written down before this feature existed.
    sort_model: str = "claude-haiku-4-5"
    # 026 and 041. The look at an email's pictures and a PDF's first page: one
    # forced call with a list of verdicts. Haiku 5.5 accepts the forced tool
    # and answers it without thinking, at a twentieth of Haiku 4.5's price.
    # Swarm round 1 and 2, 2026-10-10: principle 31 held. Classify stays on
    # `sort_model`, where Haiku 5.5 was slower on every dump.
    look_model: str = "claude-haiku-5-5"
    # The web reader, since 2026-10-30. Asked when Waking Life tickets go on
    # sale, Haiku 4.5 searched the year it was rather than the year of the next
    # edition and returned dates already gone; Haiku 5.5 searched 2027 and read
    # the raffle page, about five seconds slower per lookup at the same cost.
    reader_model: str = "claude-haiku-5-5"
    # Opus 5 still. Opus 5.5 was measured on 2026-10-02 on the 112 answering
    # cases, same code: 98 passed against Opus 5's 109, for 30% less. Nothing
    # it was sent is one it refuses, so the gap is behaviour: past the word
    # caps, a softened "I couldn't find", an offer to file, and one refused
    # subject answered. The prompts were tuned on Opus 5 and its effort
    # defaults to medium; /test-llm against 5.5 is what would earn the switch.
    # Haiku 5.5 since 2026-10-13, the owner's call after the second swarm run,
    # with answer.md rewritten for a small model: on the sealed holdout it
    # answered 31 of 35 against Opus 5's 35 of 35 at about a thirtieth of the
    # cost per question, every miss copy-shaped (markup, a paragraph after a
    # fixed line, a diary question that stopped after an empty search). The
    # rewrite costs Opus nothing (principle 17 at 35 of 37 either way), so
    # Opus 5 is a one-line fallback. The run's record is in decisions.md.
    answer_model: str = "claude-haiku-5-5"
    # 032. The nightly pass: compaction, what the day's dumps add, and on the
    # default thread the threads to suggest. On 2026-10-02 Haiku 4.5 passed 23
    # of 26 (its misses restated rows as notes) and Sonnet 5 26 of 26. Haiku
    # 5.5 is a twentieth of Sonnet 5's price per token; the forced tool call
    # skips thinking on it, and forced it folded another member's note, so
    # nightly.py offers the tool at low effort instead. Swarm round 1,
    # 2026-10-10: 27 of 27 offered, 24 of 27 forced, Sonnet 5 26 of 27.
    nightly_model: str = "claude-haiku-5-5"
    # 038. The memory pass: what offload learned about one person across their
    # threads. Sonnet 5: on Haiku 5.5 it answered nothing where a memory was
    # due, 5 of 6 forced and 4 of 6 offered, against Sonnet 5's 6 of 6.
    memory_model: str = "claude-sonnet-5"

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
            maps_on=os.environ.get("MAPS") == "on",
            commit=os.environ.get("RAILWAY_GIT_COMMIT_SHA") or None,
            assemblyai_micros_per_second=float(
                os.environ.get("ASSEMBLYAI_MICROS_PER_SECOND") or 41.67
            ),
        )
