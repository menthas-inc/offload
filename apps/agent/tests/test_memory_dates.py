"""042. The memory pass dates a birthday or an anniversary it holds.

Shown only the People and About memories no date has been worked out for, at
most twenty; answers a month and a day, a lead and a name copied from the
memory, by the id it was shown and no other.
"""

import json

import pytest
from pydantic import ValidationError

from offload_agent import memories

TO_DATE = [
    {"id": "k1", "kind": "people", "text": "Meera's birthday is 14 March."},
    {"id": "k2", "kind": "about", "text": "Their birthday is 2 May."},
]


def test_the_memories_to_date_are_their_own_section():
    listing = memories.listing(today="today", memories=[], notes=[], messages=[], to_date=TO_DATE)
    head = listing.index("Memories to date, for reminders:")
    lines = listing[head:].splitlines()[1:3]
    assert [json.loads(line) for line in lines] == TO_DATE


def test_no_section_when_nothing_needs_a_date():
    assert "to date" not in memories.listing(
        today="t", memories=[], notes=[], messages=[], to_date=[]
    )


def test_what_it_is_shown_to_date_is_bounded():
    many = [{"id": f"k{i}", "kind": "people", "text": "x" * 500} for i in range(40)]
    listing = memories.listing(today="t", memories=[], notes=[], messages=[], to_date=many)
    shown = [json.loads(line) for line in listing.splitlines() if line.startswith('{"id": "k')]
    assert len(shown) == memories.TO_DATE_CAP == 20


def test_a_date_is_a_real_month_and_day_a_closed_lead_and_a_short_name():
    date = memories.Dated.model_validate
    assert (
        date({"id": "k1", "on": "02-29", "lead": "weeks", "name": "Meera's birthday"}).on == "02-29"
    )
    for bad in (
        {"id": "k1", "on": "14-03", "lead": "weeks", "name": "x"},
        {"id": "k1", "on": "03-14", "lead": "years", "name": "x"},
        {"id": "k1", "on": "03-14", "lead": "weeks", "name": "x" * 61},
    ):
        with pytest.raises(ValidationError):
            date(bad)
    assert "dates" in memories.MemoryPlan.model_json_schema()["properties"]


def test_dates_go_back_only_for_what_it_was_shown():
    plan = memories.MemoryPlan.model_validate(
        {
            "dates": [
                {"id": "k1", "on": "03-14", "lead": "weeks", "name": "Meera's birthday"},
                {"id": "k9", "on": "01-01", "lead": "none", "name": "Invented"},
            ]
        }
    )
    assert memories.dates_wire(plan.dates, TO_DATE) == [
        {"id": "k1", "on": "03-14", "lead": "weeks", "name": "Meera's birthday"}
    ]


def test_the_prompt_says_how_to_date_and_never_their_own_birthday():
    prompt = memories._PROMPT
    assert "## Dates that come round every year" in prompt
    assert "their own birthday" in prompt
    assert "`dates`" in prompt
