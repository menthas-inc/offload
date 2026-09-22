"""023: the prompt's today is in the account's clock.

AC-5: the account's zone first, then the zone the message carried, then UTC,
which is what every message before this was read in.
"""

from offload_agent.context import clock_zone


def test_the_account_zone_comes_first():
    assert clock_zone("Europe/Lisbon", "Asia/Tokyo") == "Europe/Lisbon"


def test_the_message_zone_stands_in_for_an_account_with_none():
    assert clock_zone(None, "Asia/Tokyo") == "Asia/Tokyo"


def test_nothing_is_utc():
    assert clock_zone(None, None) is None
    assert clock_zone("", "") is None
