"""The prompt's today is where the person is.

The zone the message carried first, then the account's clock, then UTC, which
is what a message with neither was always read in. 023 had the account first;
"tomorrow" said on a trip is the trip's tomorrow (owner, 2026-11-06).
"""

from offload_agent.context import clock_zone


def test_the_message_zone_comes_first():
    assert clock_zone("Europe/Lisbon", "Asia/Tokyo") == "Asia/Tokyo"


def test_the_account_zone_stands_in_for_a_message_with_none():
    assert clock_zone("Europe/Lisbon", None) == "Europe/Lisbon"


def test_nothing_is_utc():
    assert clock_zone(None, None) is None
    assert clock_zone("", "") is None
