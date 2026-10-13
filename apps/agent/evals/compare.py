"""Two eval records side by side: accuracy, the product's cost, and latency.

    uv run python evals/compare.py results/<before>.json results/<after>.json
    uv run python evals/compare.py <before> <after> --paired [--prompts h1,h2] [--since stamp]

Reads the per-case rows `run.py` writes and compares only the cases both runs
have, so a subset against a full run reads as the subset. The verdict is a
Pareto read with a noise band: a single run moves by a few points on its own
(two full runs an hour apart disagreed on 39 cases), so accuracy inside the
band is "the same" and the decision falls to cost and latency.

With `--paired`, the accuracy is read against the history instead of against
the one `before` run: `noise.py` gives each case's pass rate on the base
prompts (the `before` record's hash unless `--prompts` says otherwise), so
the candidate's pass count has an expected value and a standard error on
exactly its cases, and the gate line says whether the candidate is kept:
accuracy no worse than about two standard errors below what the history
expects, and the warm day or the latency past the band. A single baseline
run is a noisy band; thirty runs of the same cases are not (2026-10-13).

Pure: no model, no network.
"""

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import noise  # noqa: E402

#: Standard errors a candidate's pass count may sit below the history's
#: expectation and still be read as no worse: one sided, about p = 0.025.
GATE_Z = 1.96

#: Points of accuracy one run moves by on its own. Below this, two runs are the
#: same run; measured as about four points on the full set, wider on a subset.
NOISE_BAND = 0.04


def _by_id(record: dict) -> dict[str, dict]:
    return {c["id"]: c for c in record.get("cases", [])}


def _median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0


def _p90(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(0.9 * (len(ordered) - 1))))]


def _block(before: list[dict], after: list[dict]) -> dict:
    acc_b = sum(1 for c in before if c["passed"]) / len(before) if before else 0.0
    acc_a = sum(1 for c in after if c["passed"]) / len(after) if after else 0.0
    cost_b = sum(c.get("product_cost_usd") or 0.0 for c in before)
    cost_a = sum(c.get("product_cost_usd") or 0.0 for c in after)
    lat_b = [c.get("latency_ms") or 0 for c in before]
    lat_a = [c.get("latency_ms") or 0 for c in after]
    return {
        "cases": len(before),
        "accuracy": {"before": acc_b, "after": acc_a, "delta": acc_a - acc_b},
        "product_cost_usd": {
            "before": cost_b,
            "after": cost_a,
            "ratio": (cost_a / cost_b) if cost_b else None,
        },
        "latency_ms": {
            "median_before": _median(lat_b),
            "median_after": _median(lat_a),
            "p90_before": _p90(lat_b),
            "p90_after": _p90(lat_a),
            "ratio": (_median(lat_a) / _median(lat_b)) if _median(lat_b) else None,
        },
    }


#: What one person's active day asks of each surface, from the cost sheet's
#: "normal" behaviour (.claude/skills/cost-report/assumptions.json): four text
#: dumps, 0.6 photo dumps and 0.1 mail forwards file; every text dump pays a
#: classify; one question; about a third of questions reach a typed answer; two
#: threads touched get a nightly pass; one memory pass; a look at a tenth of
#: a mail. A surface not named here weighs nothing in the day.
DAY = {
    "file": 4.7,
    "classify": 4.1,
    "answer": 1.0,
    "judge": 0.3,
    "nightly": 2.0,
    "memory": 1.0,
    "look": 0.1,
}


def _daily(rows: list[dict], key: str = "product_cost_usd") -> float:
    """Dollars a day costs at the production mix, from the mean case cost of
    each surface. A surface with no case in the run contributes nothing."""
    by: dict[str, list[float]] = defaultdict(list)
    for c in rows:
        by[c["surface"]].append(c.get(key) or 0.0)
    return sum(DAY[s] * (sum(costs) / len(costs)) for s, costs in by.items() if s in DAY and costs)


def compare(before: dict, after: dict, band: float = NOISE_BAND) -> dict:
    b, a = _by_id(before), _by_id(after)
    shared = sorted(set(b) & set(a))
    rows_b = [b[i] for i in shared]
    rows_a = [a[i] for i in shared]
    out = _block(rows_b, rows_a)
    out["only_before"] = sorted(set(b) - set(a))
    out["only_after"] = sorted(set(a) - set(b))
    out["flipped"] = {
        "to_fail": [i for i in shared if b[i]["passed"] and not a[i]["passed"]],
        "to_pass": [i for i in shared if not b[i]["passed"] and a[i]["passed"]],
    }
    by_surface_b: dict[str, list[dict]] = defaultdict(list)
    by_surface_a: dict[str, list[dict]] = defaultdict(list)
    for i in shared:
        by_surface_b[b[i]["surface"]].append(b[i])
        by_surface_a[a[i]["surface"]].append(a[i])
    out["surfaces"] = {s: _block(by_surface_b[s], by_surface_a[s]) for s in sorted(by_surface_b)}
    day_b, day_a = _daily(rows_b), _daily(rows_a)
    out["daily_cost_usd"] = {
        "before": day_b,
        "after": day_a,
        "ratio": (day_a / day_b) if day_b else None,
    }
    warm_b, warm_a = _daily(rows_b, "warm_cost_usd"), _daily(rows_a, "warm_cost_usd")
    out["daily_warm_cost_usd"] = {
        "before": warm_b,
        "after": warm_a,
        "ratio": (warm_a / warm_b) if warm_b else None,
    }
    out["models"] = {"before": before.get("models"), "after": after.get("models")}
    out["band"] = band
    out["verdict"] = _verdict(out, band)
    return out


def _verdict(out: dict, band: float) -> str:
    """better: accuracy within the band and cheaper or faster by more than
    noise; worse: accuracy fell past the band, or nothing improved and
    something got dearer or slower; same: nothing moved."""
    acc = out["accuracy"]["delta"]
    if acc < -band:
        return "worse"
    # The warm day, not the cold screen: a candidate that changes the model,
    # the prompt or the tool list starts with an empty cache and pays every
    # write, so its cold cost read 1.3 to 1.8 against a baseline screened
    # warm while its warm cost fell (round 1, 2026-10-10).
    cost = out["daily_warm_cost_usd"]["ratio"]
    if cost is None:
        cost = out["product_cost_usd"]["ratio"]
    lat = out["latency_ms"]["ratio"]
    # Two baseline screens an hour apart, nothing changed: cost x0.97,
    # median latency x1.13, accuracy 3.1 points apart (2026-10-10). Cost is
    # near deterministic; latency is not, so its thresholds sit outside that.
    cheaper = cost is not None and cost < 0.95
    faster = lat is not None and lat < 0.80
    dearer = cost is not None and cost > 1.05
    slower = lat is not None and lat > 1.25
    if (cheaper or faster) and not dearer:
        return "better"
    if dearer or slower:
        return "worse"
    return "same"


def paired(
    after: dict,
    rates_: dict[str, tuple[int, int]],
    prior: dict[str, tuple[int, int]] | None = None,
) -> dict:
    """The candidate's run read against each case's history: the pass count
    the history expected on these cases, its standard error, and the
    distance in standard errors. `no_worse` is the accuracy half of the gate.
    `prior` is the cases' rates over every prompts version, which keeps a
    case seen once on the base from reading as a certainty."""
    a = noise.against(after, rates_, prior=prior)
    a["known"] = a.pop("cases")
    a["cases"] = len(after.get("cases", []))
    a["no_worse"] = a["known"] > 0 and a["z"] >= -GATE_Z
    a["better"] = a["known"] > 0 and a["z"] >= GATE_Z
    return a


def gate(out: dict, paired_: dict) -> dict:
    """Kept when accuracy is no worse against the history and the warm day
    or the latency moved past the band without the other getting dearer.
    No history on the cases is a refusal, not a pass."""
    if not paired_.get("known"):
        return {"kept": False, "why": "no history on these cases; run noise.py --subset first"}
    if not paired_["no_worse"]:
        return {
            "kept": False,
            "why": f"accuracy fell: z = {paired_['z']:+.2f} against the history",
        }
    cost = out["daily_warm_cost_usd"]["ratio"]
    if cost is None:
        cost = out["product_cost_usd"]["ratio"]
    lat = out["latency_ms"]["ratio"]
    cheaper = cost is not None and cost < 0.95
    faster = lat is not None and lat < 0.80
    dearer = cost is not None and cost > 1.05
    slower = lat is not None and lat > 1.25
    if dearer:
        return {"kept": False, "why": f"warm day dearer: x{cost:.2f}"}
    if cheaper or faster:
        gains = []
        if cheaper:
            gains.append(f"warm day x{cost:.2f}")
        if faster:
            gains.append(f"latency x{lat:.2f}")
        why = f"accuracy no worse (z = {paired_['z']:+.2f}), " + ", ".join(gains)
        if slower:
            why += f"; but slower, x{lat:.2f}"
        return {"kept": not slower, "why": why}
    return {"kept": False, "why": "neither cost nor latency moved past the band"}


def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def render(out: dict) -> str:
    lines = [
        f"{out['cases']} cases in both runs"
        + (f", {len(out['only_before'])} only before" if out["only_before"] else "")
        + (f", {len(out['only_after'])} only after" if out["only_after"] else ""),
        f"accuracy  {_pct(out['accuracy']['before'])} -> {_pct(out['accuracy']['after'])}"
        f"  ({out['accuracy']['delta'] * 100:+.1f} points, band {_pct(out['band'])})",
        f"cost      ${out['product_cost_usd']['before']:.3f} -> "
        f"${out['product_cost_usd']['after']:.3f}"
        + (
            f"  (x{out['product_cost_usd']['ratio']:.2f})"
            if out["product_cost_usd"]["ratio"] is not None
            else ""
        ),
        f"latency   median {out['latency_ms']['median_before']:.0f} -> "
        f"{out['latency_ms']['median_after']:.0f} ms, p90 {out['latency_ms']['p90_before']:.0f} -> "
        f"{out['latency_ms']['p90_after']:.0f} ms"
        + (
            f"  (x{out['latency_ms']['ratio']:.2f})"
            if out["latency_ms"]["ratio"] is not None
            else ""
        ),
        f"per day   ${out['daily_cost_usd']['before']:.4f} -> ${out['daily_cost_usd']['after']:.4f}"
        + (
            f"  (x{out['daily_cost_usd']['ratio']:.2f}, at the cost sheet's normal mix)"
            if out["daily_cost_usd"]["ratio"] is not None
            else ""
        ),
        f"warm day  ${out['daily_warm_cost_usd']['before']:.4f} -> "
        f"${out['daily_warm_cost_usd']['after']:.4f}"
        + (
            f"  (x{out['daily_warm_cost_usd']['ratio']:.2f}, cache writes priced as reads)"
            if out["daily_warm_cost_usd"]["ratio"] is not None
            else ""
        ),
        f"verdict   {out['verdict']}",
    ]
    if out.get("paired"):
        p = out["paired"]
        lines.append(
            f"paired    {p['observed']} passed of {p['known']} cases the history knows "
            f"(of {p['cases']}), expected {p['expected']:.1f} +/- {p['se']:.1f}: z = {p['z']:+.2f}"
        )
    if out.get("gate"):
        word = "kept" if out["gate"]["kept"] else "refused"
        lines.append(f"gate      {word}: {out['gate']['why']}")
    lines += [
        "",
        f"{'surface':<14}{'cases':>6}{'acc before':>12}{'acc after':>11}"
        f"{'cost x':>8}{'latency x':>11}",
    ]
    for s, blk in out["surfaces"].items():
        cost = blk["product_cost_usd"]["ratio"]
        lat = blk["latency_ms"]["ratio"]
        lines.append(
            f"{s:<14}{blk['cases']:>6}{_pct(blk['accuracy']['before']):>12}"
            f"{_pct(blk['accuracy']['after']):>11}"
            f"{(f'{cost:.2f}' if cost is not None else '-'):>8}"
            f"{(f'{lat:.2f}' if lat is not None else '-'):>11}"
        )
    if out["flipped"]["to_fail"]:
        lines += ["", "now failing: " + ", ".join(out["flipped"]["to_fail"])]
    if out["flipped"]["to_pass"]:
        lines += ["now passing: " + ", ".join(out["flipped"]["to_pass"])]
    return "\n".join(lines)


def _flag(argv: list[str], name: str) -> str | None:
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) else None
    return None


def main(argv: list[str]) -> int:
    paths = [
        a
        for a in argv[1:]
        if not a.startswith("--")
        and a != _flag(argv, "--prompts")
        and a != _flag(argv, "--since")
        and a != _flag(argv, "--log")
    ]
    if len(paths) < 2:
        print(__doc__)
        return 2
    before = json.loads(Path(paths[0]).read_text(encoding="utf-8"))
    after = json.loads(Path(paths[1]).read_text(encoding="utf-8"))
    out = compare(before, after)
    if "--paired" in argv:
        hashes = (_flag(argv, "--prompts") or before.get("prompts") or "").split(",")
        log = Path(_flag(argv, "--log") or noise.CASES)
        rows = noise.load(log)
        rates_ = noise.rates(rows, prompts=[h for h in hashes if h], since=_flag(argv, "--since"))
        out["paired"] = paired(after, rates_, prior=noise.rates(rows))
        out["paired"]["prompts"] = hashes
        out["gate"] = gate(out, out["paired"])
    if "--json" in argv:
        print(json.dumps(out, indent=2))
    else:
        print(render(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
