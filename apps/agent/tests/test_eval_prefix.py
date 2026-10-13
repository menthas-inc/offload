"""The frozen prefix of each surface, measured through the real loader, so a
candidate that grew it with nothing else changed is refused before a model
call is spent. Characters, not tokens: no network, deterministic, and the
gate reads a ratio on the same measure.

Written before the code (2026-10-13).
"""

import importlib.util
import sys
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parents[1] / "evals"


@pytest.fixture(scope="module")
def prefix():
    spec = importlib.util.spec_from_file_location("evals_prefix", EVALS / "prefix.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["evals_prefix"] = module
    spec.loader.exec_module(module)
    return module


def test_every_surface_is_measured_through_the_real_loader(prefix):
    m = prefix.measure()
    for surface in ("file", "answer", "classify", "judge", "nightly", "memory"):
        assert m[surface]["chars"] > 500, surface
    assert m["file"]["tools_chars"] > 1000
    assert m["file"]["chars"] > m["classify"]["chars"]


def test_a_grown_prefix_is_named_and_a_shrunk_one_is_credited(prefix):
    base = {
        "file": {"chars": 10_000, "tools_chars": 5_000},
        "answer": {"chars": 2_000, "tools_chars": 500},
    }
    cand = {
        "file": {"chars": 10_400, "tools_chars": 5_000},
        "answer": {"chars": 1_500, "tools_chars": 500},
    }
    d = prefix.against(base, cand, tolerance=0.01)
    assert d["grown"] == ["file"] and d["shrunk"] == ["answer"]
    assert d["ratio"]["file"] == pytest.approx(15_400 / 15_000)
    same = prefix.against(base, base)
    assert same["grown"] == [] and same["shrunk"] == []
