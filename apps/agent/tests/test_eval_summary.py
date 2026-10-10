"""The baseline summary the ideation agents read: one table per surface from a
record, so a hypothesis is grounded in measured numbers rather than guesses."""

import importlib.util
import sys
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parents[1] / "evals"


@pytest.fixture(scope="module")
def summary():
    spec = importlib.util.spec_from_file_location("evals_summary", EVALS / "summary.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["evals_summary"] = module
    spec.loader.exec_module(module)
    return module


def _record():
    def row(i, surface, passed, lat, cost, warm, calls, inp, out, read):
        return {
            "id": f"{surface}-{i}",
            "principle": "01-x",
            "surface": surface,
            "passed": passed,
            "latency_ms": lat,
            "product_cost_usd": cost,
            "warm_cost_usd": warm,
            "calls": calls,
            "input_tokens": inp,
            "output_tokens": out,
            "cache_read_tokens": read,
        }

    return {
        "models": {"file": "claude-sonnet-5", "classify": "claude-haiku-4-5"},
        "commit": "abc1234",
        "cases": [
            row(0, "file", True, 2000, 0.04, 0.01, 2, 100, 200, 16000),
            row(1, "file", False, 4000, 0.06, 0.02, 3, 100, 300, 24000),
            row(0, "classify", True, 1000, 0.001, 0.001, 1, 1000, 50, 0),
        ],
    }


def test_summary_has_one_row_per_surface_with_means(summary):
    rows = summary.by_surface(_record())
    assert [r["surface"] for r in rows] == ["classify", "file"]
    f = next(r for r in rows if r["surface"] == "file")
    assert f["cases"] == 2
    assert f["accuracy"] == pytest.approx(0.5)
    assert f["mean_cost_usd"] == pytest.approx(0.05)
    assert f["mean_warm_cost_usd"] == pytest.approx(0.015)
    assert f["median_latency_ms"] == 3000
    assert f["mean_calls"] == pytest.approx(2.5)
    assert f["mean_output_tokens"] == pytest.approx(250)
    assert f["cache_read_share"] == pytest.approx(40000 / (40000 + 200))
    assert f["model"] == "claude-sonnet-5"


def test_render_names_the_commit_and_every_surface(summary):
    text = summary.render(_record())
    assert "abc1234" in text
    assert "file" in text and "classify" in text
    assert "claude-sonnet-5" in text
