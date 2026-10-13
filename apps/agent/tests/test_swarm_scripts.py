"""The lead's mechanical scripts for the swarm: de-duplicating the ideation
pool without an embedding API, and findings that are appended as records and
rendered, never rewritten.

Written before the code (2026-10-13).
"""

import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[3] / ".claude" / "scripts"


def _module(name: str):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name.replace("-", "_")] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def dedup():
    return _module("swarm-dedup")


@pytest.fixture(scope="module")
def findings():
    return _module("swarm-findings")


def _h(lens, title, change):
    return {"lens": lens, "title": title, "change": change}


def test_near_duplicate_hypotheses_group_and_distinct_ones_do_not(dedup):
    pool = [
        _h(
            "model",
            "Haiku 5.5 for the nightly pass",
            "Switch nightly_model in config.py to claude-haiku-5-5 with tool_choice auto and "
            "effort low; principles 21 and 28 catch a regression.",
        ),
        _h(
            "small",
            "Nightly pass on Haiku 5.5",
            "Set nightly_model to claude-haiku-5-5 in config.py, tool_choice auto, effort low, "
            "and run principles 21 and 28.",
        ),
        _h(
            "effort",
            "Filing at medium effort",
            "Pass output_config effort medium on the filing call in plan.py; most of its "
            "output is thinking.",
        ),
        _h(
            "caching",
            "Account block first in the user turn",
            "Move the account context block before the dump in build_blocks so it caches "
            "across turns.",
        ),
    ]
    groups = dedup.groups(pool, threshold=0.5)
    assert len(groups) == 3
    merged = [g for g in groups if len(g) == 2]
    assert len(merged) == 1 and {pool[i]["lens"] for i in merged[0]} == {"model", "small"}


def test_the_similarity_is_cosine_over_tf_idf(dedup):
    docs = ["nightly haiku effort low", "nightly haiku effort low", "filing medium effort"]
    vectors = dedup.tfidf(docs)
    assert dedup.cosine(vectors[0], vectors[1]) == pytest.approx(1.0)
    assert dedup.cosine(vectors[0], vectors[2]) < 0.5


def test_a_finding_is_appended_and_rendered_never_rewritten(findings, tmp_path):
    log = tmp_path / "findings.jsonl"
    findings.append(
        log,
        {
            "round": 1,
            "candidate": "model-nightly-haiku55",
            "change": "The nightly pass on Haiku 5.5, tool offered, effort low",
            "accuracy_z": 0.4,
            "warm_cost_ratio": 0.06,
            "latency_ratio": 0.7,
            "accepted": True,
            "flip_condition": "a nightly case the tool is skipped on",
            "records": ["results/20261013-1.json"],
        },
    )
    findings.append(
        log,
        {
            "round": 1,
            "candidate": "prompt-prune",
            "change": "Prose pruning of the planner prompt",
            "accuracy_z": -2.4,
            "warm_cost_ratio": 0.98,
            "latency_ratio": 1.0,
            "accepted": False,
            "flip_condition": "a pruning that keeps the ask-back rule and the calendar rule",
            "records": [],
        },
    )
    rows = findings.load(log)
    assert [r["candidate"] for r in rows] == ["model-nightly-haiku55", "prompt-prune"]
    text = findings.render(rows)
    assert "model-nightly-haiku55" in text and "prompt-prune" in text
    assert text.index("model-nightly-haiku55") < text.index("prompt-prune")
    assert "a pruning that keeps" in text
    assert "x0.06" in text
    assert "–" not in text and "—" not in text
