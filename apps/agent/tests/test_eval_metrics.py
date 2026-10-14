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


def test_the_record_keeps_a_row_per_call_that_sums_to_the_case(run):
    """A case's sums hide which call spent them: the record keeps each call in
    order too, and the rows add up to the case exactly (2026-10-13)."""
    case = run.Case(id="c", why="", surface="file", input="x", expect={}, principle="1", fixture={})
    first = run.Usage(
        model="claude-sonnet-5",
        input_tokens=900,
        output_tokens=400,
        cache_read_tokens=0,
        cache_write_tokens=6000,
        latency_ms=3100,
    )
    second = run.Usage(
        model="claude-sonnet-5",
        input_tokens=120,
        output_tokens=60,
        cache_read_tokens=6000,
        cache_write_tokens=500,
        latency_ms=900,
    )
    r = run.Result(case, "", "", [], True, "", calls=[run.call_of(first), run.call_of(second)])
    row = run.case_row(r)
    rows = row["per_call"]
    assert [c["output_tokens"] for c in rows] == [400, 60]
    for key in ("input_tokens", "output_tokens", "cache_read_tokens", "latency_ms"):
        assert sum(c[key] for c in rows) == row[key]
    assert rows[1]["cache_write_tokens"] == 500
    assert rows[0]["model"] == "claude-sonnet-5"


def test_a_small_call_from_the_sink_is_marked_apart_from_the_turns_own(run, monkeypatch):
    """The turn's calls come first and the sink's after them, though the reader
    ran in the middle of the loop. Each row says which it was, so call 2 means
    the turn's second call."""
    from offload_agent import ledger

    case = run.Case(id="c", why="", surface="stub", input="x", expect={}, principle="1", fixture={})

    async def stub(client, case, model):
        ledger.record({"model": "claude-haiku-4-5", "inputTokens": 50, "latencyMs": 400})
        return run.Result(
            case, "", "", [], True, "", calls=[run.call_of({"model": "m", "latencyMs": 7})]
        )

    monkeypatch.setitem(run._SURFACES, "stub", stub)
    monkeypatch.setitem(run.MODELS, "stub", "m")
    import asyncio

    r = asyncio.run(run._run_one(None, case, asyncio.Semaphore(1), {}))
    assert [c["via"] for c in run.case_row(r)["per_call"]] == ["turn", "ledger"]


def test_compare_reads_where_a_surface_spends_its_output(compare):
    """Per surface, the share of the turn's output on its first call, and the
    second call's cache write against the first call's output: whether the
    first call's thinking is written to the cache again."""

    def call(out, write=0, via="turn"):
        return {
            "model": "m",
            "input_tokens": 0,
            "output_tokens": out,
            "cache_read_tokens": 0,
            "cache_write_tokens": write,
            "latency_ms": 0,
            "via": via,
        }

    record = {
        "cases": [
            {"id": "a", "surface": "file", "per_call": [call(300, 4000), call(100, 600)]},
            {
                "id": "b",
                "surface": "file",
                "per_call": [call(100), call(100, 200), call(50, via="ledger")],
            },
            {"id": "c", "surface": "answer", "per_call": [call(80)]},
        ]
    }
    out = compare.per_call(record)
    assert out["file"]["cases"] == 2
    assert out["file"]["looped"] == 2
    assert out["file"]["first_call_output_share"] == pytest.approx(400 / 600)
    assert out["file"]["second_write_over_first_output"] == pytest.approx(800 / 400)
    assert out["answer"]["looped"] == 0
    assert out["answer"]["second_write_over_first_output"] is None


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


def test_the_gate_can_read_cost_and_latency_on_one_surface(compare):
    """Block1 is mostly filing, so a lever that touches only the judge (a
    third of a call a day) reads as "neither moved" on the whole block while
    its own cases halved. With a surface named, the gate reads that
    surface's warm cost and latency; accuracy stays paired over every case
    (2026-10-13)."""
    rates = {str(i): (9, 10) for i in range(30)}
    rows = [(str(i), True, 1000, 0.02) for i in range(30)]
    before = _record(rows)
    after = _record(rows)
    for rec in (before, after):
        for c in rec["cases"]:
            c["warm_cost_usd"] = 0.01
            if int(c["id"]) < 7:
                c["surface"] = "judge"
    for c in after["cases"]:
        if c["surface"] == "judge":
            c["warm_cost_usd"] = 0.004
            c["latency_ms"] = 400
    out = compare.compare(before, after)
    p = compare.paired(after, rates)
    assert compare.gate(out, p)["kept"] is False
    g = compare.gate(out, p, surface="judge")
    assert g["kept"] is True and "judge" in g["why"]
    assert out["surfaces"]["judge"]["warm_cost_usd"]["ratio"] == pytest.approx(0.4)


def test_a_candidate_run_is_not_its_own_history(compare, tmp_path):
    """Every worker read its block1 from its worktree's copy of cases.jsonl,
    which held the candidate's own run and little else at the base hash, so
    the expected count was the candidate's own count shrunk to the prior and
    every z was near +0.4 or +1.6 (2026-10-13). A run stamped `when` is left
    out of the history it is read against."""
    log = tmp_path / "cases.jsonl"
    hist = {
        "when": "20261013-100000",
        "scope": "block1",
        "commit": "x",
        "prompts": "aaaa",
        "models": {},
        "agent": "lead",
        "passed": ["a", "b"],
        "failed": ["c"],
    }
    own = {
        "when": "20261013-120000",
        "scope": "block1",
        "commit": "x",
        "prompts": "aaaa",
        "models": {},
        "agent": "w",
        "passed": ["a", "b", "c"],
        "failed": [],
    }
    log.write_text(json.dumps(hist) + "\n" + json.dumps(own) + "\n")
    after = {
        "when": "20261013-120000",
        "prompts": "aaaa",
        "cases": [{"id": i, "passed": True, "surface": "file"} for i in "abc"],
    }
    rates_ = compare.history_for(after, log, prompts=["aaaa"])
    assert rates_["c"] == (0, 1)


def test_metrics_price_per_turn_writes_as_production_pays_them(run):
    """The warm day prices every cache write as a read, the turn's own tail
    included, and that tail can never be warm in production: the account part
    and the question are written on the first call of every turn, and each
    later call writes what the one before it added. `prod_cost_usd` keeps only
    the surface's shared prefix warm (round 2, 2026-10-13).

    Two calls on Opus 5 ($5 in, $25 out, read at a tenth, write at 1.25x),
    shared prefix P = 1,000. The eval read 1,200 on call 0 because the same
    fixture ran minutes earlier; production reads P and writes the 200 past
    it. Call 1 reads the 1,200 call 0 cached and writes its own 300."""
    calls = [
        {
            **run.call_of(
                {
                    "model": "claude-opus-5",
                    "inputTokens": 4,
                    "outputTokens": 50,
                    "cacheReadTokens": 1200,
                    "cacheWriteTokens": 0,
                }
            ),
            "via": "turn",
            "prefix_tokens": 1000,
        },
        {
            **run.call_of(
                {
                    "model": "claude-opus-5",
                    "inputTokens": 2,
                    "outputTokens": 30,
                    "cacheReadTokens": 1200,
                    "cacheWriteTokens": 300,
                }
            ),
            "via": "turn",
            "prefix_tokens": 1000,
        },
    ]
    m = run.metrics_of(calls)
    # call 0: 4 x 5 + 1000 x 0.5 + 200 x 6.25 + 50 x 25 = 3,020
    # call 1: 2 x 5 + 1200 x 0.5 + 300 x 6.25 + 30 x 25 = 3,235
    assert run.prod_cost(calls) == pytest.approx(6255 / 1e6)
    assert m["prod_cost_usd"] == pytest.approx(6255 / 1e6, abs=1e-5)
    # call 0: 20 + 600 + 1250 = 1,870; call 1: 10 + 750 + 750 = 1,510
    assert m["warm_cost_usd"] == pytest.approx(3380 / 1e6)


def test_prod_cost_is_the_warm_cost_where_the_prefix_is_unknown_or_shared(run):
    """A call with no measured prefix (an older record, a small call through
    the ledger) is priced warm, never guessed at. A prefix larger than what
    the call cached is clamped to it: nothing is a write that was not sent."""
    ledger = {
        **run.call_of({"model": "claude-haiku-4-5", "inputTokens": 900, "outputTokens": 10}),
        "via": "ledger",
    }
    shared = {
        **run.call_of(
            {
                "model": "claude-haiku-5-5",
                "inputTokens": 300,
                "outputTokens": 40,
                "cacheReadTokens": 4152,
            }
        ),
        "via": "turn",
        "prefix_tokens": 5000,
    }
    unknown = {
        **run.call_of(
            {
                "model": "claude-opus-5",
                "inputTokens": 2,
                "outputTokens": 40,
                "cacheReadTokens": 7000,
            }
        ),
        "via": "turn",
    }
    for calls in ([ledger], [shared], [unknown]):
        m = run.metrics_of(calls)
        assert m["prod_cost_usd"] == pytest.approx(m["warm_cost_usd"])


def test_a_turn_prefix_is_the_largest_request_on_the_turn_model(run):
    """The tap keeps what each request sent before the conversation; the
    turn's shared prefix is its largest system and tools on the turn's model,
    so a classify or a look on the way through is never taken for it."""
    tap = run._PrefixTap(object())
    tap.seen = [
        {"model": "claude-haiku-4-5", "system": "x" * 5000, "tools": []},
        {"model": "claude-haiku-5-5", "system": "short", "tools": []},
        {"model": "claude-haiku-5-5", "system": "the filing prompt", "tools": [{"name": "a"}]},
    ]
    assert tap.turn_request("claude-haiku-5-5")["system"] == "the filing prompt"
    assert tap.turn_request("claude-opus-5") is None


def test_compare_prints_a_prod_day_and_gates_on_the_warm_one(compare):
    """The prod day is read beside the warm day; the gate is unchanged."""
    before = _record([(str(i), True, 1000, 0.02) for i in range(20)])
    for c in before["cases"]:
        c["warm_cost_usd"] = 0.010
        c["prod_cost_usd"] = 0.013
    out = compare.compare(before, before)
    assert out["daily_prod_cost_usd"]["before"] == pytest.approx(
        out["daily_warm_cost_usd"]["before"] * 1.3
    )
    assert out["surfaces"][before["cases"][0]["surface"]]["prod_cost_usd"][
        "before"
    ] == pytest.approx(0.26)
    assert "prod day" in compare.render(out)


def test_compare_gives_no_prod_ratio_against_a_record_without_one(compare):
    """A base recorded before the prod cost existed reads as warm, and a ratio
    of prod over that is a pricing change, not a candidate's: none is given."""
    before = _record([(str(i), True, 1000, 0.02) for i in range(20)])
    for c in before["cases"]:
        c["warm_cost_usd"] = 0.010
    after = _record([(str(i), True, 1000, 0.02) for i in range(20)])
    for c in after["cases"]:
        c["warm_cost_usd"] = 0.010
        c["prod_cost_usd"] = 0.013
    out = compare.compare(before, after)
    assert out["daily_prod_cost_usd"]["ratio"] is None
    assert "no prod cost before" in compare.render(out)


def test_an_accuracy_fix_is_gated_on_accuracy_rising(compare):
    """The gate refused every fix that did not move cost or latency, so a
    prompt round aimed at accuracy could not pass it (2026-10-13). With
    aim="accuracy" it is kept when accuracy rose at least one standard error
    over the history and neither cost nor latency got worse past its band."""
    rates = {str(i): (5, 10) for i in range(30)}
    rows = [(str(i), i < 22, 1000, 0.02) for i in range(30)]
    before = _record([(str(i), i < 15, 1000, 0.02) for i in range(30)])
    after = _record(rows)
    out = compare.compare(before, after)
    p = compare.paired(after, rates)
    assert p["z"] > 1
    assert compare.gate(out, p)["kept"] is False
    assert compare.gate(out, p, aim="accuracy")["kept"] is True
    flat = compare.paired(_record([(str(i), i < 16, 1000, 0.02) for i in range(30)]), rates)
    assert compare.gate(out, flat, aim="accuracy")["kept"] is False
    dear = _record([(str(i), i < 22, 1000, 0.05) for i in range(30)])
    out_dear = compare.compare(before, dear)
    assert compare.gate(out_dear, compare.paired(dear, rates), aim="accuracy")["kept"] is False
