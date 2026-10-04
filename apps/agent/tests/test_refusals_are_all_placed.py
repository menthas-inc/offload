"""Every refusal a tool can answer with is placed: a decline the model reads
and says once, or a failure the worker answers for. One that is in neither set
is counted as a failed tool, the model's sentence is thrown away for "Nothing
saved." and Finish repeats the refusal every time it is pressed. 022's sharing
refusals and 023's `bad_rule` sat there unplaced until 2026-10-04."""

import re
from pathlib import Path

from offload_agent.worker import ARGUMENT_REFUSALS, SERVER_REFUSALS, _declined_if_argument

SHARE_REFUSALS = (
    "unknown_person",
    "default_thread",
    "not_connected",
    "already_in",
    "waiting",
    "too_many",
)
TOOLS = Path(__file__).resolve().parents[2] / "core-api" / "src" / "routes" / "tools.ts"


def _codes() -> set[str]:
    """The refusal enum of the tool routes, read from the source that sends it."""
    source = TOOLS.read_text()
    block = re.search(r"ok: z\.literal\(false\),\s*error: z\.enum\(\[(.*?)\]\)", source, re.S)
    assert block, "the refusal enum moved"
    codes = set(re.findall(r'^\s*"([a-z_]+)",', block.group(1), re.M))
    assert len(codes) > 20, codes
    return codes


def test_every_refusal_is_a_decline_or_a_failure_by_name() -> None:
    unplaced = _codes() - ARGUMENT_REFUSALS - SERVER_REFUSALS
    assert not unplaced, sorted(unplaced)
    assert not ARGUMENT_REFUSALS & SERVER_REFUSALS


def test_a_share_that_is_refused_is_a_decline_the_model_can_say() -> None:
    for code in SHARE_REFUSALS:
        assert _declined_if_argument({"ok": False, "error": code}).get("declined") is True, code


def test_a_rule_outside_the_grammar_is_a_decline_like_a_bad_date() -> None:
    assert _declined_if_argument({"ok": False, "error": "bad_rule"}).get("declined") is True


def _ctx():
    from offload_agent.context import DumpContext

    return DumpContext(
        dump="share Porto with Priya", turns=[], threads=[], landed=[], default_thread_id="t1"
    )


def _budget():
    from offload_agent.worker import Lookups

    return Lookups("share Porto with Priya", may_search=False, may_read_links=False)


def test_the_reply_sent_is_the_models_after_a_decline_and_ours_after_a_failure() -> None:
    """What reaches the person, decided in one place the worker and the evals
    both call."""
    from offload_agent.harness.plan import Outcome
    from offload_agent.worker import _reply_as_sent

    said = "Priya is not one of your connections yet."
    declined = Outcome(reply=said, declined=["share_thread: unknown_person"])
    assert _reply_as_sent(declined, _ctx(), _budget()) == (False, said)

    failed = Outcome(reply=said, failed=["share_thread"])
    assert _reply_as_sent(failed, _ctx(), _budget()) == (True, "Nothing saved.")


def test_the_evals_judge_the_reply_the_worker_sends() -> None:
    """The harness read the model's own sentence, before the worker replaced
    it, so a case asserting on the reply was green while production said
    "Nothing saved."."""
    import importlib.util
    import sys

    from offload_agent import worker

    path = Path(__file__).resolve().parents[1] / "evals" / "run.py"
    spec = importlib.util.spec_from_file_location("evals_run", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["evals_run"] = module
    spec.loader.exec_module(module)
    assert module._reply_as_sent is worker._reply_as_sent
    assert "_reply_as_sent(outcome, ctx, rec.budget)" in path.read_text()
