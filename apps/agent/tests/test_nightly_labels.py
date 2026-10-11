"""042. The nightly pass labels its member's dated things for reminders.

What reaches the model is two more lists of entries, bounded; what comes back
is two closed answers per dated, mapped back by number to what the pass was
shown and to nothing else. The Core API checks it all again.
"""

import json

import pytest
from pydantic import ValidationError

from offload_agent import nightly

TO_LABEL = [
    {
        "of": "content",
        "id": "c1",
        "type": "task",
        "text": "Get the visa",
        "when": None,
        "rrule": None,
        "asked": False,
    },
    {
        "of": "note",
        "id": "n1",
        "type": "note",
        "text": "We're in Lisbon 12 to 19 November",
        "when": "2026-11-12",
        "rrule": None,
        "asked": False,
    },
    {
        "of": "content",
        "id": "c2",
        "type": "event",
        "text": "Standup",
        "when": "2026-11-12 09:30",
        "rrule": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        "asked": True,
    },
]
ANCHORS = [
    {"of": "note", "id": "n1", "text": "We're in Lisbon 12 to 19 November", "when": "2026-11-12"}
]


def entries(listing: str, key: str) -> list[dict]:
    return [json.loads(line) for line in listing.splitlines() if line.startswith(f'{{"{key}"')]


def test_the_things_to_label_and_what_a_task_could_be_for_are_entries():
    listing = nightly.listing(
        thread_name="Lisbon",
        today="Monday 2 November 2026",
        notes=[],
        messages=[],
        to_label=TO_LABEL,
        anchors=ANCHORS,
    )
    assert entries(listing, "entry") == [
        {"entry": 1, "kind": "to-do", "text": "Get the visa"},
        {
            "entry": 2,
            "kind": "note",
            "text": "We're in Lisbon 12 to 19 November",
            "when": "2026-11-12",
        },
        {
            "entry": 3,
            "kind": "event",
            "text": "Standup",
            "when": "2026-11-12 09:30",
            "repeats": "weekly",
            "asked": True,
        },
    ]
    assert entries(listing, "dated") == [
        {"dated": 1, "text": "We're in Lisbon 12 to 19 November", "when": "2026-11-12"}
    ]


def test_no_section_when_there_is_nothing_to_label():
    listing = nightly.listing(thread_name="T", today="today", notes=[], messages=[], to_label=[])
    assert "for reminders" not in listing


def test_what_it_is_shown_to_label_is_bounded():
    many = [{**TO_LABEL[0], "id": f"c{i}", "text": "x" * 900} for i in range(80)]
    listing = nightly.listing(thread_name="T", today="today", notes=[], to_label=many, anchors=many)
    things = entries(listing, "entry")
    dated = entries(listing, "dated")
    assert len(things) == nightly.LABEL_CAP == 30
    assert len(dated) == nightly.ANCHOR_CAP == 20
    assert all(len(e["text"]) == nightly.LABEL_CHARS == 200 for e in things + dated)


def test_labels_map_back_to_what_it_was_shown_and_nothing_else():
    label = nightly.Label.model_validate
    wire = nightly.labels_wire(
        [
            label({"entry": 1, "kind": "deadline", "lead": "months", "before": 1}),
            label({"entry": 2, "kind": "trip", "lead": "weeks", "name": "Lisbon"}),
            label({"entry": 9, "kind": "day", "lead": "none"}),
            label({"entry": 3, "kind": "meeting", "lead": "none", "before": 5}),
            label({"entry": 1, "kind": "none", "lead": "none"}),
        ],
        TO_LABEL,
        ANCHORS,
    )
    assert wire == [
        {
            "id": "c1",
            "of": "content",
            "kind": "deadline",
            "lead": "months",
            "before": {"id": "n1", "of": "note"},
        },
        {"id": "n1", "of": "note", "kind": "trip", "lead": "weeks", "name": "Lisbon"},
        {"id": "c2", "of": "content", "kind": "meeting", "lead": "none"},
    ]


def test_a_label_is_two_closed_answers():
    with pytest.raises(ValidationError):
        nightly.Label.model_validate({"entry": 1, "kind": "alarm", "lead": "none"})
    with pytest.raises(ValidationError):
        nightly.Label.model_validate({"entry": 1, "kind": "day", "lead": "years"})
    with pytest.raises(ValidationError):
        nightly.Label.model_validate({"entry": 1, "kind": "trip", "lead": "days", "name": "x" * 61})
    for shape in (nightly.LearnPlan, nightly.ProposePlan, nightly._Fold):
        assert "labels" in shape.model_json_schema()["properties"]


def test_every_prompt_says_how_to_label():
    for mode in ("learn", "propose", "keep"):
        prompt = nightly.prompt_for(mode=mode)
        assert "## Reminders" in prompt
        assert "`labels`" in prompt
        for kind in ("meeting", "appointment", "occasion", "deadline", "trip", "day", "none"):
            assert f"`{kind}`" in prompt
        for lead in ("days", "weeks", "months"):
            assert f"`{lead}`" in prompt
        assert "dash" in prompt
