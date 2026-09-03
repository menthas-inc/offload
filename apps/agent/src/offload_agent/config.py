"""Configuration, read once at import and never guessed.

Every value here has to be set. There is no default that quietly points at
production and no fallback that makes a misconfigured worker look healthy: a
worker that starts with the wrong database or no API key should fail at boot,
where it is obvious, rather than at the first dump.
"""

import os
from dataclasses import dataclass


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

    # The numbers from the impl-spec. Constants, not literals at a call site,
    # because three acceptance criteria are untestable without them.
    max_turns: int = 20
    max_threads: int = 12
    max_prompt_tokens: int = 8_000
    per_account_running: int = 2
    poll_seconds: float = 1.0
    model: str = "claude-sonnet-5"

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            # asyncpg wants postgresql+asyncpg://, the Core API's URL is plain
            # postgresql://. Rewritten here rather than stored twice, so there is
            # one connection string in the environment and not two that can drift.
            database_url=_required("AGENT_DATABASE_URL").replace(
                "postgresql://", "postgresql+asyncpg://", 1
            ),
            api_url=_required("API_URL"),
            internal_token=_required("INTERNAL_SERVICE_TOKEN"),
            anthropic_api_key=_required("ANTHROPIC_API_KEY"),
        )
