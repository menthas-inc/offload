"""032. Every system prompt is a file, and the parts two prompts share are
written once.

AC-16: every system prompt the worker sends is read from a file under
`prompts/`, and a prompt built from shared parts is fully assembled at import.
AC-17: the filing and answering prompts as sent both contain the shared
paragraph on what offload is and the shared policy, word for word.
"""

import re
from pathlib import Path

import pytest

PROMPTS = Path(__file__).parent.parent / "src" / "offload_agent" / "prompts"
SHARED = ["what-offload-is", "refused-subjects", "not-offloads", "query-shape"]


def _shared(name: str) -> str:
    return (PROMPTS / "shared" / f"{name}.md").read_text().strip()


def test_the_judge_and_the_look_are_files() -> None:
    from offload_agent.harness import look, plan
    from offload_agent.prompt_files import load

    assert load("judge") == plan._JUDGE_PROMPT
    assert load("look") == look._PROMPT


def test_filing_and_answering_carry_the_shared_parts_word_for_word() -> None:
    from offload_agent.harness.plan import _ANSWER_PROMPT, filing_prompt

    for sent in (filing_prompt(True), filing_prompt(False), _ANSWER_PROMPT):
        for name in SHARED:
            assert _shared(name) in sent, f"{name} is missing from a prompt as sent"


def test_no_include_marker_survives_assembly() -> None:
    from offload_agent.harness.plan import _ANSWER_PROMPT, filing_prompt

    for sent in (filing_prompt(True), filing_prompt(False), _ANSWER_PROMPT):
        assert "<!-- include" not in sent


def test_an_include_that_names_nothing_fails_at_load(tmp_path: Path) -> None:
    from offload_agent.prompt_files import load

    (tmp_path / "broken.md").write_text("Before.\n\n<!-- include: shared/nowhere -->\n")
    with pytest.raises(RuntimeError, match="nowhere"):
        load("broken", root=tmp_path)


def test_the_shared_parts_hold_no_dashes() -> None:
    for name in SHARED:
        assert not re.search(r"[–—]", _shared(name))


def test_the_small_calls_do_not_say_offload() -> None:
    """A single-purpose call is never told what offload is, so the name is
    noise to it. The filing and answering prompts are offload, and say so in
    the shared paragraph instead."""
    from offload_agent.prompt_files import load

    for name in ("judge", "classify", "reader", "look"):
        assert "offload" not in load(name).lower(), f"{name} says offload"


def test_a_nested_include_fails_at_load_and_names_itself(tmp_path: Path) -> None:
    """No shared part includes another today, so a nested include is refused
    rather than expanded: it fails at import, never in a prompt as sent."""
    from offload_agent.prompt_files import load

    (tmp_path / "shared").mkdir()
    (tmp_path / "shared" / "outer.md").write_text("Outer.\n\n<!-- include: shared/inner -->\n")
    (tmp_path / "shared" / "inner.md").write_text("Inner.\n")
    (tmp_path / "top.md").write_text("Top.\n\n<!-- include: shared/outer -->\n")
    with pytest.raises(RuntimeError, match="shared/outer includes shared/inner"):
        load("top", root=tmp_path)
