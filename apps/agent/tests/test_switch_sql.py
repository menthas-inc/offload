"""034. An owner's switch is read by a bound key, never one spliced into SQL.

`switch_on` is only ever called with constants from this package, and the SQL
it builds still does not carry them: the key travels as a parameter, so a key
that was ever something else could not change the statement.
"""

from __future__ import annotations

import pytest

from offload_agent.context import _MAY_REACH, switch_on, switched
from offload_agent.link_place import _READABLE


def test_the_key_is_a_parameter_and_not_in_the_sql() -> None:
    fragment = switch_on("switch.maps")
    assert "switch.maps" not in fragment
    assert "s.key = :switch_maps" in fragment


def test_a_statement_carries_each_key_as_a_bound_value() -> None:
    statement = switched(f"select {switch_on('switch.maps')} as on", "switch.maps")
    assert "switch.maps" not in statement.text
    assert statement.compile().params == {"switch_maps": "switch.maps"}


_NOT_SWITCHES = ["x' or '1'='1", "switch.maps'; drop table accounts; --", "", "maps"]


@pytest.mark.parametrize("key", _NOT_SWITCHES)
def test_a_key_that_is_not_a_switch_is_refused(key: str) -> None:
    with pytest.raises(ValueError):
        switch_on(key)


def test_the_statements_that_read_switches_spell_no_key() -> None:
    for statement in (_MAY_REACH, _READABLE):
        assert "'switch." not in statement.text
    assert _MAY_REACH.compile().params == {
        "account_id": None,
        "switch_web_search": "switch.web_search",
        "switch_web_links": "switch.web_links",
        "switch_maps": "switch.maps",
    }
