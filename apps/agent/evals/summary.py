"""One record as a table per surface: the baseline the ideation agents read.

    uv run python evals/summary.py results/<record>.json

Pure: no model, no network.
"""

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path


def by_surface(record: dict) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for c in record.get("cases", []):
        groups[c["surface"]].append(c)
    models = record.get("models") or {}
    rows = []
    for surface, cases in sorted(groups.items()):
        n = len(cases)

        def mean(key: str, cases: list[dict] = cases, n: int = n) -> float:
            return sum(c.get(key) or 0 for c in cases) / n

        read = sum(c.get("cache_read_tokens") or 0 for c in cases)
        inp = sum(c.get("input_tokens") or 0 for c in cases)
        rows.append(
            {
                "surface": surface,
                "model": models.get(surface, ""),
                "cases": n,
                "accuracy": sum(1 for c in cases if c.get("passed")) / n,
                "mean_cost_usd": mean("product_cost_usd"),
                "mean_warm_cost_usd": mean("warm_cost_usd"),
                "median_latency_ms": statistics.median(c.get("latency_ms") or 0 for c in cases),
                "mean_calls": mean("calls"),
                "mean_input_tokens": mean("input_tokens"),
                "mean_output_tokens": mean("output_tokens"),
                "cache_read_share": (read / (read + inp)) if (read + inp) else 0.0,
            }
        )
    return rows


def render(record: dict) -> str:
    lines = [
        f"commit {record.get('commit', '?')}, {len(record.get('cases', []))} cases, "
        f"{record.get('accuracy', 0) * 100:.1f}% passed, "
        f"product ${record.get('product_cost_usd', 0):.2f} cold "
        f"(${record.get('warm_cost_usd', 0):.2f} warm)",
        "",
        f"{'surface':<10}{'model':<18}{'cases':>6}{'acc':>7}{'cost':>8}{'warm':>8}"
        f"{'lat ms':>8}{'calls':>6}{'in tok':>8}{'out tok':>8}{'cached':>8}",
    ]
    for r in by_surface(record):
        lines.append(
            f"{r['surface']:<10}{r['model']:<18}{r['cases']:>6}{r['accuracy'] * 100:>6.0f}%"
            f"{r['mean_cost_usd']:>8.4f}{r['mean_warm_cost_usd']:>8.4f}"
            f"{r['median_latency_ms']:>8.0f}{r['mean_calls']:>6.1f}"
            f"{r['mean_input_tokens']:>8.0f}{r['mean_output_tokens']:>8.0f}"
            f"{r['cache_read_share'] * 100:>7.0f}%"
        )
    lines += [
        "",
        "cost is the product's per case, cold; warm prices cache writes as reads; "
        "in tok excludes cache reads; cached is the share of input that was read from cache.",
    ]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    print(render(json.loads(Path(argv[1]).read_text(encoding="utf-8"))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
