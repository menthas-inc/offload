"""Findings of a swarm round as records, appended and rendered, never rewritten.

    python3 .claude/scripts/swarm-findings.py <findings.jsonl> add '<json>'
    python3 .claude/scripts/swarm-findings.py <findings.jsonl> render > FINDINGS.md

One line per change tried: round, candidate, change, accuracy_z (paired
against the history), warm_cost_ratio, latency_ratio, accepted, the flip
condition (what would change the verdict), the record paths, and a note.
The rendered page puts what was kept first, then what was refused with the
condition to flip it, then the dead ends. The first run's FINDINGS.md was an
LLM rewrite each round and lost precision between rounds; a record does not.
"""

import json
import sys
from pathlib import Path

FIELDS = (
    "round",
    "candidate",
    "change",
    "accuracy_z",
    "warm_cost_ratio",
    "latency_ratio",
    "accepted",
    "flip_condition",
    "records",
)


def append(log: Path, entry: dict) -> None:
    missing = [f for f in FIELDS if f not in entry]
    if missing:
        raise ValueError(f"finding is missing {', '.join(missing)}")
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load(log: Path) -> list[dict]:
    if not log.is_file():
        return []
    lines = log.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def _ratio(x) -> str:
    return f"x{x:.2f}" if isinstance(x, (int, float)) else "-"


def _line(r: dict) -> str:
    z = r.get("accuracy_z")
    z_text = f"z {z:+.2f}" if isinstance(z, (int, float)) else "z -"
    text = (
        f"- **{r['candidate']}** (round {r['round']}): {r['change']}. "
        f"Accuracy {z_text}, warm day {_ratio(r.get('warm_cost_ratio'))}, "
        f"latency {_ratio(r.get('latency_ratio'))}."
    )
    if r.get("flip_condition"):
        text += f" Flips if: {r['flip_condition']}."
    if r.get("note"):
        text += f" {r['note']}"
    if r.get("records"):
        text += " Records: " + ", ".join(r["records"]) + "."
    return text


def render(rows: list[dict]) -> str:
    kept = [r for r in rows if r.get("accepted")]
    refused = [r for r in rows if not r.get("accepted") and r.get("flip_condition")]
    dead = [r for r in rows if not r.get("accepted") and not r.get("flip_condition")]
    out = ["# Findings", ""]
    out.append(f"{len(rows)} changes tried, {len(kept)} kept.")
    out.append("")
    if kept:
        out += ["## Kept", ""] + [_line(r) for r in kept] + [""]
    if refused:
        out += ["## Refused, with the condition that flips it", ""]
        out += [_line(r) for r in refused] + [""]
    if dead:
        out += ["## Dead ends", ""] + [_line(r) for r in dead] + [""]
    return "\n".join(out)


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    log = Path(argv[1])
    if argv[2] == "add":
        append(log, json.loads(argv[3]))
        print(f"{len(load(log))} findings in {log}")
        return 0
    if argv[2] == "render":
        print(render(load(log)))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
