"""Every run's per-case outcomes are kept, so a case has a flip rate and any
subset has an expected pass count and a standard error, from history rather
than from rerunning the set.

Written before the code (2026-10-13), on the owner's note after the swarm
run: the eval set changes over time, the noise does not, so the pooled
history is the band.
"""

import importlib.util
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
def noise():
    return _module("noise")


def _record(when, prompts, cases):
    return {
        "when": when,
        "scope": "all",
        "commit": "abc1234",
        "prompts": prompts,
        "models": {"file": "claude-sonnet-5"},
        "cases": [{"id": i, "passed": p} for i, p in cases],
    }


def test_a_run_is_kept_as_its_passed_and_failed_ids(noise, tmp_path):
    log = tmp_path / "cases.jsonl"
    noise.record(log, _record("20261010-180146", "aaaa", [("x", True), ("y", False)]))
    rows = noise.load(log)
    assert len(rows) == 1
    assert rows[0]["passed"] == ["x"] and rows[0]["failed"] == ["y"]
    assert rows[0]["prompts"] == "aaaa" and rows[0]["models"] == {"file": "claude-sonnet-5"}


def test_rates_pool_every_run_a_case_appeared_in(noise, tmp_path):
    log = tmp_path / "cases.jsonl"
    noise.record(log, _record("1", "aaaa", [("x", True), ("y", False), ("z", True)]))
    noise.record(log, _record("2", "aaaa", [("x", True), ("y", True)]))
    noise.record(log, _record("3", "aaaa", [("x", False)]))
    rates = noise.rates(noise.load(log))
    assert rates["x"] == (2, 3)
    assert rates["y"] == (1, 2)
    assert rates["z"] == (1, 1)


def test_rates_can_be_held_to_one_prompts_hash(noise, tmp_path):
    """A run on other prompts is another app; its flips are not this app's."""
    log = tmp_path / "cases.jsonl"
    noise.record(log, _record("1", "aaaa", [("x", True)]))
    noise.record(log, _record("2", "bbbb", [("x", False)]))
    assert noise.rates(noise.load(log), prompts="aaaa")["x"] == (1, 1)
    assert noise.rates(noise.load(log))["x"] == (1, 2)


def test_band_is_the_expected_pass_count_and_its_standard_error(noise):
    """Each case is a coin with its own p; the subset's pass count has mean
    sum p and variance sum p(1-p). A case never run counts as unknown."""
    rates = {"a": (9, 10), "b": (5, 10), "c": (10, 10)}
    band = noise.band(["a", "b", "c", "d"], rates)
    assert band["cases"] == 4 and band["known"] == 3
    assert band["expected"] == pytest.approx(0.9 + 0.5 + 1.0)
    assert band["se"] == pytest.approx((0.09 + 0.25 + 0.0) ** 0.5)
    assert band["expected_rate"] == pytest.approx(2.4 / 3)


def test_flakiest_lists_the_cases_nearest_a_coin_toss(noise):
    rates = {"a": (9, 10), "b": (5, 10), "c": (10, 10), "d": (1, 2)}
    assert [c for c, _ in noise.flakiest(rates, at_least=2)][:2] == ["b", "d"]


def test_a_candidate_run_is_read_against_each_case_history(noise):
    """Paired: the candidate's pass count minus what the history expected on
    the same cases, in standard errors."""
    rates = {"a": (9, 10), "b": (5, 10), "c": (10, 10)}
    run = {
        "cases": [
            {"id": "a", "passed": True},
            {"id": "b", "passed": True},
            {"id": "c", "passed": False},
        ]
    }
    z = noise.against(run, rates)
    assert z["observed"] == 2 and z["expected"] == pytest.approx(2.4)
    assert z["z"] == pytest.approx((2 - 2.4) / (0.34**0.5))


def test_rates_can_pool_several_prompts_hashes_and_start_from_a_date(noise, tmp_path):
    """The base of the second run is two hashes apart on one answering line,
    and the pairing fix of 2026-10-10 made ten cases' earlier runs another
    app's: the band pools the hashes it is told to, from the run it is told."""
    log = tmp_path / "cases.jsonl"
    noise.record(log, _record("20261001-000000", "aaaa", [("x", False)]))
    noise.record(log, _record("20261010-000000", "aaaa", [("x", True)]))
    noise.record(log, _record("20261011-000000", "bbbb", [("x", True)]))
    noise.record(log, _record("20261012-000000", "cccc", [("x", False)]))
    rows = noise.load(log)
    assert noise.rates(rows, prompts=["aaaa", "bbbb"])["x"] == (2, 3)
    assert noise.rates(rows, prompts=["aaaa", "bbbb"], since="20261010")["x"] == (2, 2)


def test_a_case_seen_once_on_these_prompts_borrows_its_pooled_rate_as_a_prior(noise):
    """Block1 at the base hash: thirty cases seen once each, all passed, so
    the band read se 0 and any failure was infinitely unlikely. A case's
    rate on these prompts is shrunk towards its rate over every version,
    with the weight of two runs, so a thin history still has a width."""
    rates = {"a": (1, 1), "b": (1, 1)}
    prior = {"a": (8, 10), "b": (5, 10)}
    band = noise.band(["a", "b"], rates, prior=prior, weight=2.0)
    pa = (1 + 2 * 0.8) / 3
    pb = (1 + 2 * 0.5) / 3
    assert band["expected"] == pytest.approx(pa + pb)
    assert band["se"] == pytest.approx((pa * (1 - pa) + pb * (1 - pb)) ** 0.5)
    assert noise.band(["a", "b"], rates)["se"] == 0.0
    run = {"cases": [{"id": "a", "passed": True}, {"id": "b", "passed": False}]}
    assert noise.against(run, rates, prior=prior)["expected"] == pytest.approx(pa + pb)
