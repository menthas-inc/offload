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

    # The numbers from the impl-spec. Constants, not literals at a call site,
    # because three acceptance criteria are untestable without them.
    max_turns: int = 20
    max_threads: int = 12
    max_prompt_tokens: int = 8_000
    per_account_running: int = 2
    poll_seconds: float = 1.0
    model: str = "claude-sonnet-5"
    # The tiers stack.md routes by, named here rather than at a call site.
    #
    # `sort` for the question-or-note call: it is one boolean and every dump
    # already pays for a call at this tier. `reason` for answering, which
    # stack.md describes as being for "hard retrieval and cross-thread
    # reasoning", written down before this feature existed.
    sort_model: str = "claude-haiku-4-5"
    answer_model: str = "claude-opus-5"

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
        )
