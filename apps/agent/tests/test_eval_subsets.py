"""The race set: three blocks a candidate buys one at a time, cut from the
train cases, disjoint from the screen and the holdout, stratified like the
screen, and without the cases the history says are a coin toss.

Written before the code (2026-10-13), for the second swarm run: a worker's
stake buys block1; the lead's pool buys block2 and block3 for survivors.
"""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

SUBSETS = Path(__file__).resolve().parents[1] / "evals" / "subsets"


@pytest.fixture(scope="module")
def make():
    spec = importlib.util.spec_from_file_location("evals_subsets_make", SUBSETS / "make.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["evals_subsets_make"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def subsets(make):
    return make.cut()


def test_the_blocks_are_disjoint_from_each_other_and_from_the_fixed_subsets(subsets):
    blocks = [set(subsets[b]) for b in ("block1", "block2", "block3")]
    fixed = set(subsets["screen"]) | set(subsets["holdout"])
    for i, b in enumerate(blocks):
        assert not (b & fixed)
        for other in blocks[i + 1 :]:
            assert not (b & other)
    assert set().union(*blocks) <= set(subsets["train"])


def test_the_blocks_are_the_sizes_the_race_advances_by(subsets):
    assert len(subsets["block1"]) == 30
    assert len(subsets["block2"]) == 30
    assert 30 <= len(subsets["block3"]) <= 60


def test_the_blocks_leave_out_the_cases_that_measure_nothing(make, subsets):
    flaky = set(json.loads(make.FLAKY.read_text(encoding="utf-8"))["cases"])
    assert len(flaky) >= 12
    for b in ("block1", "block2", "block3"):
        assert not (set(subsets[b]) & flaky)


def test_each_block_is_the_set_in_miniature(make, subsets):
    """Stratified by principle: thirty cases from at least twenty principles,
    not thirty from the three largest."""
    by_id = {c["id"]: c for c in make._cases()}
    for b in ("block1", "block2"):
        principles = {by_id[i]["principle"] for i in subsets[b]}
        assert len(principles) >= 20, (b, len(principles))
        surfaces = {by_id[i]["surface"] for i in subsets[b]}
        assert {"file", "answer", "classify"} <= surfaces


def test_the_block_files_on_disk_match_the_cut(make, capsys):
    assert make.main(["make.py", "--check"]) == 0, capsys.readouterr().out
