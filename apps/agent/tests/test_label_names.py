"""025. The eval stub's label rule agrees with the Core API's.

The eval's `label_content` stub runs the provenance rule so a model that
invents labels fails there as it would in production. Both read one fixture;
the Core API's test is `labels-live.test.ts`.
"""

import importlib.util
import json
import sys
from pathlib import Path

EVALS = Path(__file__).resolve().parents[1] / "evals"


def _run():
    spec = importlib.util.spec_from_file_location("evals_run", EVALS / "run.py")
    module = importlib.util.module_from_spec(spec)
    # A dataclass looks its module up while the module is still loading.
    sys.modules["evals_run"] = module
    spec.loader.exec_module(module)
    return module


def test_the_stub_agrees_with_every_shared_case():
    rule = _run()._label_name_in_dump
    cases = json.loads((EVALS / "fixtures" / "label-names.json").read_text())["cases"]
    for case in cases:
        assert (case["name"], rule(case["name"], case["text"])) == (case["name"], case["ok"])
