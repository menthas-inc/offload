"""Bounds on what the model sends back that refused real input, or let
impossible input through."""

import pytest
from pydantic import ValidationError

from offload_agent.harness.look import LookAnswer
from offload_agent.harness.tools import AddContent, AddNote, EditContent


def test_an_email_with_thirty_attachments_keeps_its_verdicts():
    """Core API sends up to 20 images and 10 PDF pages to the look. A bound of
    20 refused the answer for the 21st twice, and nothing was kept."""
    verdicts = [{"index": i, "keep": True} for i in range(30)]
    answer = LookAnswer.model_validate({"verdicts": verdicts})
    assert len(answer.verdicts) == 30


def test_a_thirty_first_verdict_is_refused():
    """30 is everything the Core API can send (OFF-5)."""
    verdicts = [{"index": i, "keep": True} for i in range(31)]
    with pytest.raises(ValidationError):
        LookAnswer.model_validate({"verdicts": verdicts})


def _add(when: str) -> dict:
    return {"thread_id": "t", "title": "Rent", "type": "task", "due_at": when}


def _edit(when: str) -> dict:
    return {"content_id": "c", "due_at": when}


def _note(when: str) -> dict:
    return {"thread_id": "t", "text": "Yoga", "occurs_at": when}


_MODELS = [(AddContent, _add), (EditContent, _edit), (AddNote, _note)]

# Every shape the check accepted before impossible days were refused.
_SHAPES = [
    "2026-09-25",
    "2026-09-25T10:00",
    "2026-09-25 10:00",
    "2026-09-25T10:00:30",
    "2026-09-25T10:00:30.123",
    "2026-09-25T10:00:30Z",
    "2026-09-25T10:00+02:00",
    "2026-09-25T10:00-0500",
    "2026-09-25Z",
    "2026-09-25+02:00",
]


@pytest.mark.parametrize(("model", "make"), _MODELS)
@pytest.mark.parametrize("when", _SHAPES)
def test_every_date_shape_is_still_accepted(model, make, when):
    data = model.model_validate(make(when)).model_dump()
    assert when in data.values()


@pytest.mark.parametrize(("model", "make"), _MODELS)
@pytest.mark.parametrize("when", ["2026-02-30", "2026-13-01 10:00", "2026-09-25T25:00", "2026"])
def test_an_impossible_date_is_refused_rather_than_rolled_over(model, make, when):
    """Core API rolls 30 February over to 2 March, so the row lands on a day
    nobody said."""
    with pytest.raises(ValidationError):
        model.model_validate(make(when))
