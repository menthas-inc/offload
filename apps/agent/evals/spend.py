"""What the evals have spent, against a cap, across every worktree.

`history.jsonl` is committed and so lives once per checkout: twelve worktrees
running the evals at once would each see only their own spend. The spend log
is one file outside the repo, named by `EVAL_SPEND_LOG`, that every run
appends to and every run checks before it starts. A run that would take the
agent past its cap, or everyone past the total, does not start.

Pure: no model, no network. `run.py` is the only caller.
"""

import json
import os
from datetime import datetime
from pathlib import Path

#: Dollars a case costs, by surface, from the 2026-09-17 full run and the
#: nightly and memory runs since. Used for the refusal before a run, not for
#: pricing one: a run is priced from its real usage afterwards.
PER_CASE = {
    "file": 0.02,
    "answer": 0.02,
    "classify": 0.001,
    "judge": 0.001,
    "look": 0.002,
    "nightly": 0.015,
    "memory": 0.015,
    "cast-file": 0.03,
    "cast-answer": 0.03,
    "cast-memory": 0.02,
}


def estimate(counts: dict[str, int]) -> float:
    """Dollars a selection is expected to cost, by its surfaces."""
    return sum(PER_CASE.get(surface, 0.02) * n for surface, n in counts.items())


def _rows(log: Path) -> list[dict]:
    if not log.is_file():
        return []
    rows = []
    for line in log.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def total(log: Path, agent: str | None = None) -> float:
    """Dollars spent so far, by everyone or by one agent."""
    return sum(
        float(r.get("cost_usd") or 0.0)
        for r in _rows(log)
        if agent is None or r.get("agent") == agent
    )


def append(log: Path, *, agent: str, scope: str, cost_usd: float, note: str = "") -> None:
    log.parent.mkdir(parents=True, exist_ok=True)
    row = {
        "when": datetime.now().strftime("%Y%m%d-%H%M%S"),
        "agent": agent,
        "scope": scope,
        "cost_usd": round(cost_usd, 4),
        "note": note,
    }
    with log.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def refusal(
    log: Path, *, agent: str, estimate: float, agent_cap: float | None, total_cap: float | None
) -> str | None:
    """Why this run may not start, or None. The agent's cap is checked first
    because it is the one the agent can do something about."""
    if agent_cap is not None:
        mine = total(log, agent=agent)
        if mine + estimate > agent_cap:
            return (
                f"refused: agent {agent!r} has spent ${mine:.2f} of its ${agent_cap:.2f} cap "
                f"and this run is about ${estimate:.2f}"
            )
    if total_cap is not None:
        everyone = total(log)
        if everyone + estimate > total_cap:
            return (
                f"refused: total spend is ${everyone:.2f} of the ${total_cap:.2f} cap "
                f"and this run is about ${estimate:.2f}"
            )
    return None


def from_env() -> dict:
    """The cap settings a shell carries, or nothing. Every key is optional;
    without `EVAL_SPEND_LOG` the log is not kept and nothing is refused."""
    log = os.environ.get("EVAL_SPEND_LOG")
    if not log:
        return {}

    def money(name: str) -> float | None:
        raw = os.environ.get(name)
        return float(raw) if raw else None

    return {
        "log": Path(log).expanduser(),
        "agent": os.environ.get("EVAL_AGENT") or "lead",
        "agent_cap": money("EVAL_AGENT_CAP_USD"),
        "total_cap": money("EVAL_SPEND_CAP_USD"),
    }
