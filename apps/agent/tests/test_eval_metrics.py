"""The optimisation run measures cost and latency per case, not just pass or
fail, and spends against a cap shared by every worktree.

Written before the code (2026-10-10). Each test names one thing the swarm's
scoring relies on: a per-case latency and token count read from the real
calls, the product's cost kept apart from the eval's own judge, a named
subset of cases, and a spend log one cap can be checked against.
"""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parents[1] / "evals"


def _module(name: str):
    spec = importlib.util.spec_from_file_location(f"evals_{name}", EVALS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[f"evals_{name}"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def run():
    return _module("run")


@pytest.fixture(scope="module")
def spend():
    return _module("spend")


@pytest.fixture(scope="module")
def compare():
    return _module("compare")


# ---------------------------------------------------------------------------
# Calls and metrics


def test_a_planner_usage_and_a_ledger_entry_read_as_the_same_call(run):
    """The planner's Usage dataclass and the ledger's wire dict carry the same
    five numbers under different names. Both become one shape."""
    planner = run.Usage(
        model="claude-sonnet-5",
        input_tokens=100,
        output_tokens=20,
        cache_read_tokens=4000,
        cache_write_tokens=0,
        latency_ms=850,
    )
    wire = {
        "model": "claude-haiku-4-5",
        "inputTokens": 300,
        "outputTokens": 10,
        "cacheReadTokens": 0,
        "cacheWriteTokens": 0,
        "latencyMs": 200,
    }
    a, b = run.call_of(planner), run.call_of(wire)
    assert a == {
        "model": "claude-sonnet-5",
        "input_tokens": 100,
        "output_tokens": 20,
        "cache_read_tokens": 4000,
        "cache_write_tokens": 0,
        "latency_ms": 850,
    }
    assert b["model"] == "claude-haiku-4-5" and b["latency_ms"] == 200


def test_metrics_sum_latency_and_tokens_and_price_the_product_only(run):
    """A turn of three calls is their latency end to end, every token, and
    the product's price. The eval's own judge is not the product's cost."""
    calls = [
        run.call_of(
            {
                "model": "claude-haiku-4-5",
                "inputTokens": 400,
                "outputTokens": 30,
                "cacheReadTokens": 0,
                "cacheWriteTokens": 0,
                "latencyMs": 300,
            }
        ),
        run.call_of(
            {
                "model": "claude-sonnet-5",
                "inputTokens": 1000,
                "outputTokens": 200,
                "cacheReadTokens": 8000,
                "cacheWriteTokens": 0,
                "latencyMs": 2000,
            }
        ),
        run.call_of(
            {
                "model": "claude-sonnet-5",
                "inputTokens": 50,
                "outputTokens": 100,
                "cacheReadTokens": 9000,
                "cacheWriteTokens": 0,
                "latencyMs": 1500,
            }
        ),
    ]
    m = run.metrics_of(calls)
    assert m["calls"] == 3
    assert m["latency_ms"] == 3800
    assert m["input_tokens"] == 1450
    assert m["output_tokens"] == 330
    assert m["cache_read_tokens"] == 17000
    expected = (
        run._cost("claude-haiku-4-5", 400, 30)
        + run._cost("claude-sonnet-5", 1000, 200, 8000)
        + run._cost("claude-sonnet-5", 50, 100, 9000)
    )
    assert m["product_cost_usd"] == pytest.approx(expected)


def test_a_result_carries_its_calls_and_the_record_writes_them(run):
    """`Result.calls` is the list the record reads, and the record's per-case
    row carries latency_ms, product_cost_usd and the token counts."""
    case = run.Case(
        id="c", why="", surface="classify", input="x", expect={}, principle="19", fixture={}
    )
    r = run.Result(case, "", "", [], True, "", calls=[run.call_of({"model": "m", "latencyMs": 7})])
    row = run.case_row(r)
    assert row["latency_ms"] == 7
    assert row["calls"] == 1
    assert "product_cost_usd" in row and "input_tokens" in row


# ---------------------------------------------------------------------------
# Subsets


def test_a_subset_selects_exactly_its_cases(run, tmp_path):
    """A subset is a committed list of case ids. Selecting one picks those
    cases and nothing else, whatever principle they sit in."""
    contexts = run._load_contexts()
    principles = run.load_principles(contexts)
    ids = [c.id for p in principles for c in p.cases][:5]
    subset = tmp_path / "five.json"
    subset.write_text(json.dumps({"cases": ids}))
    args = run.argparse.Namespace(
        principle=None,
        surface=None,
        case=None,
        include_pending=False,
        live=False,
        subset=str(subset),
    )
    picked = run._select(principles, args)
    assert sorted(c.id for _, c in picked) == sorted(ids)


def test_a_subset_naming_a_case_that_does_not_exist_is_refused(run, tmp_path):
    """A typo in a subset would silently shrink the measurement."""
    contexts = run._load_contexts()
    principles = run.load_principles(contexts)
    subset = tmp_path / "bad.json"
    subset.write_text(json.dumps({"cases": ["no-such-case-anywhere"]}))
    args = run.argparse.Namespace(
        principle=None,
        surface=None,
        case=None,
        include_pending=False,
        live=False,
        subset=str(subset),
    )
    with pytest.raises(SystemExit):
        run._select(principles, args)


# ---------------------------------------------------------------------------
# Spend


def test_spend_log_sums_per_agent_and_overall(spend, tmp_path):
    log = tmp_path / "spend.jsonl"
    spend.append(log, agent="a", scope="screen", cost_usd=1.25)
    spend.append(log, agent="b", scope="screen", cost_usd=0.75)
    spend.append(log, agent="a", scope="13", cost_usd=0.5)
    assert spend.total(log) == pytest.approx(2.5)
    assert spend.total(log, agent="a") == pytest.approx(1.75)
    assert spend.total(log, agent="zz") == 0.0


def test_a_run_over_the_cap_is_refused_before_it_starts(spend, tmp_path):
    """The check is estimate plus what is spent against the cap, for the
    agent and for everyone, and a refusal says which."""
    log = tmp_path / "spend.jsonl"
    spend.append(log, agent="a", scope="screen", cost_usd=2.6)
    spend.append(log, agent="b", scope="screen", cost_usd=60.0)
    assert spend.refusal(log, agent="a", estimate=0.3, agent_cap=3.0, total_cap=70.0) is None
    why = spend.refusal(log, agent="a", estimate=0.5, agent_cap=3.0, total_cap=70.0)
    assert why and "agent" in why
    why = spend.refusal(log, agent="c", estimate=8.0, agent_cap=50.0, total_cap=70.0)
    assert why and "total" in why


def test_estimate_prices_a_selection_by_surface(spend):
    """A filing case is about two cents, a classify case a tenth of one."""
    est = spend.estimate({"file": 10, "classify": 10, "answer": 10})
    assert 0.3 < est < 0.8


def test_an_empty_or_missing_log_spends_nothing(spend, tmp_path):
    assert spend.total(tmp_path / "none.jsonl") == 0.0


# ---------------------------------------------------------------------------
# Compare


def _record(cases):
    return {
        "models": {"file": "claude-sonnet-5"},
        "cases": [
            {
                "id": i,
                "principle": "01-x",
                "surface": "file",
                "passed": p,
                "latency_ms": lat,
                "product_cost_usd": cost,
                "calls": 2,
                "input_tokens": 100,
                "output_tokens": 10,
                "cache_read_tokens": 0,
            }
            for i, p, lat, cost in cases
        ],
    }


def test_compare_reports_deltas_and_flips(compare):
    before = _record([("a", True, 1000, 0.02), ("b", True, 2000, 0.02), ("c", False, 3000, 0.02)])
    after = _record([("a", True, 500, 0.01), ("b", False, 1000, 0.01), ("c", True, 1500, 0.01)])
    out = compare.compare(before, after)
    assert out["accuracy"]["before"] == pytest.approx(2 / 3)
    assert out["accuracy"]["after"] == pytest.approx(2 / 3)
    assert out["latency_ms"]["median_before"] == 2000
    assert out["latency_ms"]["median_after"] == 1000
    assert out["product_cost_usd"]["before"] == pytest.approx(0.06)
    assert out["product_cost_usd"]["after"] == pytest.approx(0.03)
    assert out["flipped"]["to_fail"] == ["b"] and out["flipped"]["to_pass"] == ["c"]
    assert set(out["surfaces"]) == {"file"}


def test_compare_only_counts_cases_both_runs_have(compare):
    before = _record([("a", True, 1000, 0.02), ("b", True, 2000, 0.02)])
    after = _record([("a", True, 500, 0.01), ("z", True, 10, 0.0)])
    out = compare.compare(before, after)
    assert out["cases"] == 1
    assert out["only_before"] == ["b"] and out["only_after"] == ["z"]


def test_compare_verdict_is_a_pareto_read(compare):
    """Cheaper and faster with accuracy inside the noise band is better;
    accuracy down past the band is worse whatever it saved."""
    before = _record([(str(i), True, 1000, 0.02) for i in range(20)])
    after = _record([(str(i), i != 0, 800, 0.015) for i in range(20)])
    assert compare.compare(before, after, band=0.06)["verdict"] == "better"
    worse = _record([(str(i), i > 4, 800, 0.015) for i in range(20)])
    assert compare.compare(before, worse, band=0.06)["verdict"] == "worse"
    same = _record([(str(i), True, 1000, 0.02) for i in range(20)])
    assert compare.compare(before, same, band=0.06)["verdict"] == "same"


def test_the_price_table_knows_the_current_generation(run):
    """A model missing from PRICES is priced as Opus 5, so a swap to Haiku 5.5
    would read as dearer than Haiku 4.5. The three 5.5 models are listed."""
    for model in ("claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"):
        assert model in run.PRICES
    assert run._cost("claude-haiku-5-5", 1_000_000, 0) == pytest.approx(0.10)


def test_compare_weights_a_day_by_the_production_mix(compare):
    """One person's day is about five filing turns, five classify calls, one
    question and two nightly passes. The daily number is what the product
    pays, not what the eval set happens to hold."""
    rows = []
    for i in range(10):
        rows.append((f"f{i}", True, 1000, 0.02))
    before = _record(rows)
    before["cases"] += [
        {**c, "surface": "classify", "product_cost_usd": 0.001, "id": "c" + c["id"]}
        for c in before["cases"][:5]
    ]
    out = compare.compare(before, before)
    day = out["daily_cost_usd"]
    expected = compare.DAY["file"] * 0.02 + compare.DAY["classify"] * 0.001
    assert day["before"] == pytest.approx(expected)
    assert day["after"] == day["before"]


def test_metrics_price_a_warm_cache_beside_the_cold_one(run):
    """An eval run starts cold and pays every cache write at 1.25x input; a
    production turn mostly reads a prefix another turn wrote. `warm_cost_usd`
    prices the writes as reads, which is what the day pays once it is going."""
    calls = [
        run.call_of(
            {
                "model": "claude-sonnet-5",
                "inputTokens": 100,
                "outputTokens": 50,
                "cacheReadTokens": 0,
                "cacheWriteTokens": 8000,
                "latencyMs": 1000,
            }
        )
    ]
    m = run.metrics_of(calls)
    assert m["product_cost_usd"] == pytest.approx(run._cost("claude-sonnet-5", 100, 50, 0, 8000))
    assert m["warm_cost_usd"] == pytest.approx(run._cost("claude-sonnet-5", 100, 50, 8000, 0))
    assert m["warm_cost_usd"] < m["product_cost_usd"]


def test_compare_verdict_reads_the_warm_day_not_the_cold_screen(compare):
    """A candidate that changes the model, the prompt or the tool list starts
    with an empty cache, so its cold cost reads 1.3 to 1.8 against a baseline
    screened warm. The verdict reads the warm day (round 1, 2026-10-10)."""
    before = _record([(str(i), True, 1000, 0.02) for i in range(20)])
    for c in before["cases"]:
        c["warm_cost_usd"] = 0.010
    after = _record([(str(i), True, 1000, 0.03) for i in range(20)])
    for c in after["cases"]:
        c["warm_cost_usd"] = 0.008
    out = compare.compare(before, after)
    assert out["product_cost_usd"]["ratio"] == pytest.approx(1.5)
    assert out["daily_warm_cost_usd"]["ratio"] == pytest.approx(0.8)
    assert out["verdict"] == "better"


def test_a_subset_given_as_a_path_records_under_its_stem(run, tmp_path):
    """`--subset evals/subsets/screen.json` once ran, charged, and crashed
    writing results/<stamp>-<whole path>.json. The scope is the stem."""
    assert run.scope_of(argparse_ns(subset="/x/y/screen.json")) == "screen"
    assert run.scope_of(argparse_ns(subset="screen")) == "screen"
    assert run.scope_of(argparse_ns(principle="13")) == "13"
    assert run.scope_of(argparse_ns()) == "all"


def argparse_ns(**kw):
    import argparse

    base = {"subset": None, "principle": None, "surface": None, "case": None}
    base.update(kw)
    return argparse.Namespace(**base)


def test_a_candidate_is_gated_against_the_history_not_against_one_run(compare):
    """Paired: the candidate's pass count on its cases against what the
    history expects of those same cases. Kept when accuracy is no worse than
    about two standard errors and the warm day or the latency moved past
    the band. One baseline run is the cost and latency reference only."""
    rates = {str(i): (9, 10) for i in range(30)}
    before = _record([(str(i), True, 1000, 0.02) for i in range(30)])
    after = _record([(str(i), i > 1, 700, 0.012) for i in range(30)])
    for rec in (before, after):
        for c in rec["cases"]:
            c["warm_cost_usd"] = c["product_cost_usd"] / 2
    out = compare.compare(before, after)
    p = compare.paired(after, rates)
    assert p["observed"] == 28 and p["expected"] == pytest.approx(27.0)
    assert p["z"] == pytest.approx((28 - 27) / (30 * 0.09) ** 0.5)
    g = compare.gate(out, p)
    assert g["kept"] is True
    fell = _record([(str(i), i > 7, 700, 0.012) for i in range(30)])
    assert compare.gate(out, compare.paired(fell, rates))["kept"] is False
    nothing_moved = compare.compare(before, before)
    assert compare.gate(nothing_moved, p)["kept"] is False
    assert compare.gate(out, compare.paired(after, {}))["kept"] is False


def test_the_gate_reads_as_one_line(compare):
    rates = {str(i): (9, 10) for i in range(30)}
    before = _record([(str(i), True, 1000, 0.02) for i in range(30)])
    after = _record([(str(i), True, 700, 0.012) for i in range(30)])
    out = compare.compare(before, after)
    out["paired"] = compare.paired(after, rates)
    out["gate"] = compare.gate(out, out["paired"])
    text = compare.render(out)
    assert "paired" in text and "z = " in text and "gate      kept" in text
