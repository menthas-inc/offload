"""Assemble the swarm run's state into one row file for the dashboard.

    python3 .claude/scripts/swarm-dash.py > ~/.offload-swarm/run.json

Rows carry a `kind`: surface (the baseline per surface), spend (the shared
spend log), phase and worker (from docs/experiments/2026-10-swarm-tuning/
rounds/state.json, which the lead edits by hand as the run moves). Every row
has a unique `key`. No model, no network.
"""

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HOME = Path.home() / ".offload-swarm"
ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "docs/experiments/2026-10-swarm-tuning/rounds/state.json"
DAY = {
    "file": 4.7,
    "classify": 4.1,
    "answer": 1.0,
    "judge": 0.3,
    "nightly": 2.0,
    "memory": 1.0,
    "look": 0.1,
}


def _surfaces(record: dict) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for c in record.get("cases", []):
        if c["surface"].startswith("cast"):
            continue
        groups[c["surface"]].append(c)
    rows = []
    for surface, cases in sorted(groups.items()):
        n = len(cases)
        cost = sum(c.get("product_cost_usd") or 0 for c in cases) / n
        warm = sum(c.get("warm_cost_usd") or 0 for c in cases) / n
        read = sum(c.get("cache_read_tokens") or 0 for c in cases)
        inp = sum(c.get("input_tokens") or 0 for c in cases)
        rows.append(
            {
                "kind": "surface",
                "key": f"surface:{surface}",
                "name": surface,
                "model": (record.get("models") or {}).get(surface, ""),
                "cases": n,
                "accuracy": round(sum(1 for c in cases if c.get("passed")) / n, 4),
                "cost_usd": round(cost, 5),
                "warm_usd": round(warm, 5),
                "day_usd": round(DAY.get(surface, 0) * cost, 5),
                "day_warm_usd": round(DAY.get(surface, 0) * warm, 5),
                "latency_ms": statistics.median(c.get("latency_ms") or 0 for c in cases),
                "calls": round(sum(c.get("calls") or 0 for c in cases) / n, 2),
                "out_tokens": round(sum(c.get("output_tokens") or 0 for c in cases) / n),
                "cached": round(read / (read + inp), 3) if (read + inp) else 0,
            }
        )
    return rows


def _spend() -> list[dict]:
    log = HOME / "spend.jsonl"
    rows = []
    if log.is_file():
        for i, line in enumerate(log.read_text().splitlines()):
            if line.strip():
                r = json.loads(line)
                rows.append(
                    {
                        "kind": "spend",
                        "key": f"spend:{i}",
                        "when": r["when"],
                        "agent": r["agent"],
                        "scope": r["scope"],
                        "cost_usd": r["cost_usd"],
                        "note": r.get("note", ""),
                    }
                )
    return rows


def main() -> int:
    rows: list[dict] = []
    full = HOME / "baseline/full.json"
    if full.is_file():
        rows += _surfaces(json.loads(full.read_text()))
    rows += _spend()
    if STATE.is_file():
        state = json.loads(STATE.read_text())
        for p in state.get("phases", []):
            rows.append({"kind": "phase", "key": f"phase:{p['name']}", **p})
        for w in state.get("workers", []):
            rows.append({"kind": "worker", "key": f"worker:{w['round']}:{w['name']}", **w})
    json.dump(rows, sys.stdout, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
