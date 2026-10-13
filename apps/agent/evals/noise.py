"""Every run's per-case outcomes, pooled, so a case has a flip rate and any
subset has an expected pass count with a standard error, from history
rather than from running the set again.

    uv run python evals/noise.py                      # the flakiest cases, all runs
    uv run python evals/noise.py --subset screen      # the band for a subset
    uv run python evals/noise.py --prompts 91ff6dcb   # runs on those prompts only
    uv run python evals/noise.py --against results/<record>.json   # a run read paired
    uv run python evals/noise.py --production --top 40   # on the models production runs

`cases.jsonl` is committed, one line per run: when, scope, commit, the
prompts hash, the models, the agent, and the passed and failed case ids.
`run.py` appends to it after every run. The owner's note after the swarm run
(2026-10-13): the eval set changes over time, the noise does not, so the
pooled history is the band and a full rerun is not.

Each case is a coin with its own pass rate p, estimated from the runs it
appeared in. A subset's pass count then has mean sum p and variance
sum p(1 - p), which is the band a candidate's count is read against. A run
on other prompts or models is a different app; filter by `prompts` and
`models` when that matters, pool when it does not (the owner's call: the
set's changes move the noise little).

Pure: no model, no network.
"""

import argparse
import json
import sys
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = HERE / "cases.jsonl"


def record(log: Path, rec: dict, agent: str | None = None) -> None:
    """Append one run's outcomes. The ids are enough: the record itself keeps
    the transcripts and is not committed."""
    row = {
        "when": rec["when"],
        "scope": rec.get("scope", ""),
        "commit": rec.get("commit", ""),
        "prompts": rec.get("prompts", ""),
        "models": rec.get("models") or {},
        "agent": agent or rec.get("agent") or "",
        "passed": sorted(c["id"] for c in rec.get("cases", []) if c.get("passed")),
        "failed": sorted(
            c["id"] for c in rec.get("cases", []) if not c.get("passed") and not errored(c)
        ),
        "errored": sorted(c["id"] for c in rec.get("cases", []) if errored(c)),
    }
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def errored(case: dict) -> bool:
    """A case that never reached a verdict: the API or the harness raised
    (a dropped connection, an empty credit balance, no cast database). It says
    nothing about the product, so it is kept apart from the failures."""
    if case.get("passed"):
        return False
    return any(m.startswith(("raised ", "harness raised ")) for m in case.get("mechanical") or [])


def load(log: Path = CASES) -> list[dict]:
    if not log.is_file():
        return []
    rows = []
    for line in log.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def _on_model(case_id: str, ran: dict, on: dict[str, tuple[str, str]] | None) -> bool:
    if not on or case_id not in on:
        return True
    surface, model = on[case_id]
    return ran.get(surface) == model


def rates(
    rows: list[dict],
    prompts: str | Iterable[str] | None = None,
    models: dict | None = None,
    since: str | None = None,
    on: dict[str, tuple[str, str]] | None = None,
) -> dict[str, tuple[int, int]]:
    """Per case: (passed, appeared) over the runs that match. `prompts` is one
    hash or several (the base of a run can be two hashes apart on one line
    that touched one surface); `since` is a run stamp, for a fix that made
    earlier runs another app's (the pairing fix of 2026-10-10). `on` maps a
    case to (surface, model): that case is read only from runs whose model
    for its surface is that one, which is how a swarm candidate's model stops
    counting against production's (2026-10-13). Errored ids are never counted."""
    hashes = {prompts} if isinstance(prompts, str) else set(prompts or [])
    out: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for r in rows:
        if hashes and r.get("prompts") not in hashes:
            continue
        if models and any(r.get("models", {}).get(k) != v for k, v in models.items()):
            continue
        if since and r.get("when", "") < since:
            continue
        ran = r.get("models", {})
        for i in r.get("passed", []):
            if _on_model(i, ran, on):
                out[i][0] += 1
                out[i][1] += 1
        for i in r.get("failed", []):
            if _on_model(i, ran, on):
                out[i][1] += 1
    return {k: (v[0], v[1]) for k, v in out.items()}


def production_on(principles: Path, models: dict[str, str]) -> dict[str, tuple[str, str]]:
    """Each case in the principle files, mapped to its surface and the model
    production runs that surface on: the `on` that `rates` takes."""
    out: dict[str, tuple[str, str]] = {}
    for path in sorted(principles.glob("*.json")):
        for c in json.loads(path.read_text(encoding="utf-8")).get("cases", []):
            if c.get("surface") in models:
                out[c["id"]] = (c["surface"], models[c["surface"]])
    return out


def band(
    case_ids: list[str],
    rates_: dict[str, tuple[int, int]],
    prior: dict[str, tuple[int, int]] | None = None,
    weight: float = 2.0,
) -> dict:
    """What the history expects of these cases: the pass count, its standard
    error, and the rate, over the cases the history knows. With a `prior`
    (the same cases' rates over every prompts version), a case's rate on
    these prompts is shrunk towards it with the weight of `weight` runs: a
    case seen once is a coin seen once, not a certainty (2026-10-13)."""
    known = [i for i in case_ids if i in rates_ and rates_[i][1] > 0]
    ps = []
    for i in known:
        k, n = rates_[i]
        if prior and i in prior and prior[i][1] > 0:
            p0 = prior[i][0] / prior[i][1]
            ps.append((k + weight * p0) / (n + weight))
        else:
            ps.append(k / n)
    expected = sum(ps)
    var = sum(p * (1 - p) for p in ps)
    return {
        "cases": len(case_ids),
        "known": len(known),
        "expected": expected,
        "se": var**0.5,
        "expected_rate": (expected / len(known)) if known else 0.0,
        "se_rate": (var**0.5 / len(known)) if known else 0.0,
    }


def flakiest(
    rates_: dict[str, tuple[int, int]], at_least: int = 2
) -> list[tuple[str, tuple[int, int]]]:
    """Cases nearest a coin toss, seen at least `at_least` times."""
    seen = [(i, v) for i, v in rates_.items() if v[1] >= at_least]
    return sorted(seen, key=lambda iv: abs(iv[1][0] / iv[1][1] - 0.5))


def against(
    run: dict,
    rates_: dict[str, tuple[int, int]],
    prior: dict[str, tuple[int, int]] | None = None,
) -> dict:
    """A run read against each case's history: observed passes minus the
    expected count, in standard errors, over the cases the history knows."""
    ids = [c["id"] for c in run.get("cases", []) if c["id"] in rates_]
    b = band(ids, rates_, prior=prior)
    observed = sum(1 for c in run.get("cases", []) if c["id"] in rates_ and c.get("passed"))
    z = (observed - b["expected"]) / b["se"] if b["se"] else 0.0
    return {
        "observed": observed,
        "expected": b["expected"],
        "se": b["se"],
        "z": z,
        "cases": len(ids),
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", default=str(CASES))
    parser.add_argument("--prompts", help="only runs on these prompts hashes, comma separated")
    parser.add_argument("--since", help="only runs stamped at or after this (YYYYMMDD-HHMMSS)")
    parser.add_argument(
        "--model", action="append", default=[], help="surface=model, only runs with it"
    )
    parser.add_argument("--subset", help="a subsets/<name>.json or a path: the band for its cases")
    parser.add_argument("--against", help="a results record: read it against the history")
    parser.add_argument(
        "--prior",
        action="store_true",
        help="shrink each case's rate towards its rate over every prompts version",
    )
    parser.add_argument(
        "--production",
        action="store_true",
        help="read each case only from runs on production's model for its surface",
    )
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args(argv[1:])
    rows = load(Path(args.log))
    models = dict(kv.split("=", 1) for kv in args.model) or None
    hashes = args.prompts.split(",") if args.prompts else None
    on = None
    if args.production:
        from run import MODELS  # the agent's Config, read the way run.py reads it

        on = production_on(HERE / "principles", MODELS)
    r = rates(rows, prompts=hashes, models=models, since=args.since, on=on)
    prior = rates(rows) if args.prior else None
    print(
        f"{len(rows)} runs, {len(r)} cases seen"
        + (f", prompts {args.prompts}" if args.prompts else "")
        + (", each on production's model for its surface" if args.production else "")
    )
    if args.subset:
        path = Path(args.subset)
        if not path.is_file():
            path = HERE / "subsets" / f"{args.subset}.json"
        ids = json.loads(path.read_text(encoding="utf-8"))["cases"]
        b = band(ids, r, prior=prior)
        print(
            f"{path.stem}: {b['known']} of {b['cases']} cases known; expected "
            f"{b['expected']:.1f} passes, se {b['se']:.1f} ({b['expected_rate'] * 100:.1f}% "
            f"+/- {b['se_rate'] * 100:.1f} points)"
        )
    if args.against:
        run = json.loads(Path(args.against).read_text(encoding="utf-8"))
        a = against(run, r, prior=prior)
        print(
            f"{Path(args.against).name}: {a['observed']} passed of {a['cases']} known cases, "
            f"history expected {a['expected']:.1f} +/- {a['se']:.1f}: z = {a['z']:+.2f}"
        )
    print()
    print(f"{'case':<48}{'passed':>8}{'of':>5}{'rate':>7}")
    for i, (k, n) in flakiest(r)[: args.top]:
        print(f"{i:<48}{k:>8}{n:>5}{k / n * 100:>6.0f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
