"""023: the rule, as the agent's tool models take it.

The server is the one validator. The models carry a shape check drawn from
the same fixture the TypeScript suite reads, so the two cannot disagree about
what a rule looks like, and everything the shape cannot see is the server's
to refuse by name (AC-8, AC-10).
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from offload_agent.harness.tools import AddContent, AddNote, EditContent

FIXTURE = Path(__file__).resolve().parents[3] / "packages" / "widgets" / "fixtures" / "rules.json"
RULES = json.loads(FIXTURE.read_text())

# What a regex can see. The rest is a decision the server makes and the
# model reads back as `bad_rule`.
SHAPE_REFUSES = {"bytes", "bad_freq", "no_freq", "unknown_part"}


def _content(**over):
    return AddContent.model_validate(
        {"thread_id": "t", "title": "Rent", "type": "task", "due_at": "2026-09-25", **over}
    )


@pytest.mark.parametrize("case", RULES["accepted"], ids=lambda c: c["in"])
def test_every_accepted_rule_passes_the_shape_check(case):
    assert _content(rrule=case["in"]).rrule == case["in"].strip()
    assert AddNote.model_validate({"thread_id": "t", "text": "Yoga", "occurs_at": "2026-09-25", "rrule": case["in"]}).rrule
    assert EditContent.model_validate({"content_id": "c", "rrule": case["in"]}).rrule


@pytest.mark.parametrize(
    "case",
    [c for c in RULES["refused"] if c["reason"] in SHAPE_REFUSES],
    ids=lambda c: f'{c["in"]!r}:{c["reason"]}',
)
def test_what_the_shape_can_see_is_refused_here(case):
    with pytest.raises(ValidationError):
        _content(rrule=case["in"])


def test_an_empty_rule_is_no_rule():
    assert _content(rrule="").rrule is None
    assert _content(rrule="   ").rrule is None
    assert _content().rrule is None


def test_the_old_enum_is_gone():
    # The models ignore a field they do not declare, as they always have, so
    # the old enum is neither refused nor carried: it is simply not a field.
    assert not hasattr(_content(repeats="week"), "repeats")
    note = AddNote.model_validate({"thread_id": "t", "text": "Yoga", "repeats_until": "2026-12-31"})
    assert not hasattr(note, "repeats_until")
    assert "rrule" in AddContent.model_fields and "repeats" not in AddContent.model_fields
    assert "rrule" in AddNote.model_fields and "rrule" in EditContent.model_fields
