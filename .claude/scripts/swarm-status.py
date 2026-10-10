"""Fold a try workflow's journal and the spend log into the run state.

    python3 .claude/scripts/swarm-status.py <round> <journal.jsonl>

Reads the journal's `started` lines (agent id to label) and `result` lines
(a worker's structured result, a skeptic's verdict), the spend log for what
each worker spent, and each worktree for whether RESULT.md exists, and
rewrites the matching worker rows in rounds/state.json. The dashboard's data
file is assembled from that by swarm-dash.py. No model, no network.
"""

import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "docs/experiments/2026-10-swarm-tuning/rounds/state.json"
HOME = Path.home() / ".offload-swarm"


def _parse(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        for loader in (json.loads, ast.literal_eval):
            try:
                out = loader(value)
                if isinstance(out, dict):
                    return out
            except Exception:  # noqa: BLE001
                continue
    return None


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    rnd = int(argv[1])
    journal = Path(argv[2])
    labels: dict[str, str] = {}
    results: dict[str, dict] = {}
    if journal.is_file():
        for line in journal.read_text().splitlines():
            try:
                r = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            if r.get("type") == "started":
                labels[r["agentId"]] = r.get("label", "")
            elif r.get("type") == "result":
                label = labels.get(r.get("agentId"), "")
                parsed = _parse(r.get("result"))
                if label and parsed is not None:
                    results[label] = parsed
    spent: dict[str, float] = {}
    log = HOME / "spend.jsonl"
    if log.is_file():
        for line in log.read_text().splitlines():
            if line.strip():
                row = json.loads(line)
                spent[row["agent"]] = spent.get(row["agent"], 0.0) + float(row["cost_usd"])

    state = json.loads(STATE.read_text())
    for w in state.get("workers", []):
        if w.get("round") != rnd:
            continue
        name = w["name"]
        worktree = ROOT.parent / f"{ROOT.name}-swarm-{name}"
        started = f"try:{name}" in labels.values()
        res = results.get(f"try:{name}")
        ver = results.get(f"skeptic:{name}")
        w["spent_usd"] = round(spent.get(name, 0.0), 2)
        if res:
            w["status"] = "done" if res.get("implemented") else "not implemented"
            for k in ("acc_before", "acc_after", "cost_ratio", "warm_ratio", "latency_ratio"):
                if k in res:
                    w[k] = res[k]
            if "screen_accuracy_before" in res:
                w["acc_before"] = res["screen_accuracy_before"]
            if "screen_accuracy_after" in res:
                w["acc_after"] = res["screen_accuracy_after"]
            w["verdict"] = res.get("verdict", "")
            w["recommend"] = res.get("recommend", "")
            w["summary"] = (res.get("summary") or "")[:400]
            w["learned"] = (res.get("learned") or "")[:600]
        elif started:
            w["status"] = "running" if not (worktree / "RESULT.md").is_file() else "reporting"
        if ver:
            w["skeptic"] = "kept" if ver.get("keep") else "refused"
            w["skeptic_why"] = (ver.get("why") or "")[:400]
            w["eval_tampering"] = ver.get("eval_tampering", "")
    # Worker learnings become findings once, keyed by worker.
    seen = {f.get("key") for f in state.setdefault("findings", [])}
    for w in state.get("workers", []):
        if w.get("round") == rnd and w.get("learned") and f"worker:{rnd}:{w['name']}" not in seen:
            state["findings"].append(
                {
                    "key": f"worker:{rnd}:{w['name']}",
                    "round": rnd,
                    "source": w["name"],
                    "when": "",
                    "title": f"{w['name']}: {w.get('verdict', '')}, {w.get('recommend', '')}".strip(", "),
                    "text": w["learned"],
                }
            )
        if w.get("round") == rnd and w.get("skeptic_why") and f"skeptic:{rnd}:{w['name']}" not in seen:
            state["findings"].append(
                {
                    "key": f"skeptic:{rnd}:{w['name']}",
                    "round": rnd,
                    "source": "skeptic",
                    "when": "",
                    "title": f"{w['name']}: {w.get('skeptic', '')}",
                    "text": w["skeptic_why"],
                }
            )
    STATE.write_text(json.dumps(state, indent=1))
    done = sum(1 for w in state["workers"] if w.get("round") == rnd and w.get("status") == "done")
    print(f"round {rnd}: {done} done of {sum(1 for w in state['workers'] if w.get('round') == rnd)}; results {len(results)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
