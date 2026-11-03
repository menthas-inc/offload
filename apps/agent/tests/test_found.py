"""050. Gathering what a dump says one tap can act on, and the label and
destination rules the Core API and the clients apply again.

The label and destination cases come from the table the TypeScript tests read
(`packages/widgets/src/actions.fixtures.json`), so the two languages are held to
one list and cannot drift.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

from offload_agent.found import MAX_FOUND, found_in, gather, is_action_url, kind_of, label_ok

TABLE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/widgets/src/actions.fixtures.json").read_text()
)


@pytest.mark.parametrize("case", TABLE["labels"], ids=lambda c: repr(c["label"]))
def test_label_rule_matches_the_shared_table(case):
    assert label_ok(case["label"]) is case["ok"]


@pytest.mark.parametrize("case", TABLE["urls"], ids=lambda c: repr(c["url"]))
def test_destination_rule_matches_the_shared_table(case):
    assert is_action_url(case["url"]) is case["ok"]
    assert kind_of(case["url"]) == (case.get("kind") if case["ok"] else None)


# ------------------------------------------------------------------ gathering

DANA = "tel:+12125550142"


def test_gathers_each_kind_in_text_order_normalised():
    text = (
        "Her number is (212) 555-0142, write to Ana@Flat.co or track it at "
        "https://dhl.com/track?id=9."
    )
    assert gather(text) == [DANA, "mailto:Ana@flat.co", "https://dhl.com/track?id=9"]


@pytest.mark.parametrize(
    "written",
    [
        "(212) 555-0142",
        "212.555.0142",
        "212-555-0142",
        "1 212 555 0142",
        "+1 (212) 555-0142",
        "2125550142",
    ],
)
def test_the_usual_north_american_forms(written):
    assert gather(f"call {written} now") == [DANA]


def test_a_number_from_another_country_with_a_plus():
    assert gather("Office +44 20 7946 0958, ask for Ana") == ["tel:+442079460958"]


@pytest.mark.parametrize(
    "text",
    [
        "2026-11-02 11:30",
        "around 70 people",
        "Order 12345678901234567890",
        "Booking 1234567",
        "Ref 0123456789",
        "price 2,125,550,142",
        "call 212 555\n0142",
        "id ab2125550142",
        "",
    ],
)
def test_no_phone_in_dates_counts_prices_and_ids(text):
    assert gather(text) == []


def test_digits_inside_a_link_are_not_a_phone():
    assert gather("https://example.com/orders/2125550142") == [
        "https://example.com/orders/2125550142"
    ]


def test_an_address_takes_nothing_after_it():
    assert gather("mail a@b.co?bcc=x@y.z&body=hi") == ["mailto:a@b.co"]


def test_trailing_punctuation_is_not_part_of_a_link():
    assert gather("See https://a.co/x. Or https://b.co/y, then") == [
        "https://a.co/x",
        "https://b.co/y",
    ]


def test_only_http_links_and_the_number_not_its_scheme():
    assert gather("javascript:alert(1) ftp://a.co") == []
    assert gather("sms:+12125550142") == ["tel:+12125550142"]


def test_dedupes_and_caps():
    numbers = " ".join(f"+44 20 7946 {i:04d}" for i in range(40))
    found = gather(numbers + " +44 20 7946 0000")
    assert len(found) == MAX_FOUND
    assert len(set(found)) == len(found)


def test_bounded_and_linear_on_a_hostile_line():
    hostile = ("+1" + " (" * 5000 + "a@" * 5000 + "http://" + "a" * 5000) * 4
    started = time.perf_counter()
    gather(hostile)
    assert time.perf_counter() - started < 1.0


# ---------------------------------------------------------- spoken numbers


def test_a_spoken_run_of_ten_digits_is_a_number():
    said = "call dana on two one two five five five zero one four two about the venue"
    assert gather(said, spoken=True) == [DANA]
    assert gather(said) == []


def test_a_spoken_run_with_commas_and_oh_and_a_plus():
    said = "it's plus four four two oh, seven nine four six, oh nine five eight"
    assert gather(said, spoken=True) == ["tel:+442079460958"]


@pytest.mark.parametrize(
    "said",
    [
        "two one two double five zero one four two",
        "two one two triple five zero one four two",
        "two one two five five five and zero one four two",
        "two one two five five five zero one four",
        "two one two five five five zero one four two three four",
        "in twenty twenty six",
        "it costs two hundred and twelve",
        "seventy people",
        "two one two five five five zero one four twenty",
    ],
)
def test_spoken_confusables_are_not_numbers(said):
    assert gather(said, spoken=True) == []


# ---------------------------------------------------------------- found_in


def test_found_in_accepts_the_same_number_written_differently():
    assert found_in("+1 (212) 555-0142", "Text: Dana R. 212 555 0142") == DANA


def test_found_in_refuses_what_the_line_does_not_hold():
    assert found_in("212 555 0199", "Text: Dana R. 212 555 0142") is None


def test_found_in_wants_exactly_one_destination():
    line = "Text: 212 555 0142 or ana@flat.co"
    assert found_in("212 555 0142 ana@flat.co", line) is None
    assert found_in("nothing here", line) is None
