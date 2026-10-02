"""030. A location on a row that cannot have one is a decline, not a failure."""


def test_location_refusals_are_declines() -> None:
    from offload_agent.worker import ARGUMENT_REFUSALS

    assert "location_not_here" in ARGUMENT_REFUSALS
    assert "bad_place_name" in ARGUMENT_REFUSALS


def test_add_content_takes_a_location_of_one_line_within_the_bound() -> None:
    import pytest
    from pydantic import ValidationError

    from offload_agent.harness.tools import AddContent

    base = {"thread_id": "t", "title": "Dinner", "type": "event"}
    assert AddContent(**base, location="Time Out Market").location == "Time Out Market"
    assert AddContent(**base).location is None
    for bad in ("a" * 121, "Time Out\nMarket"):
        with pytest.raises(ValidationError):
            AddContent(**base, location=bad)


def test_edit_content_sets_and_clears_a_location() -> None:
    from offload_agent.harness.tools import EditContent

    assert EditContent(content_id="c", location="Cervejaria Ramiro").location == "Cervejaria Ramiro"
    cleared = EditContent(content_id="c", clear_location=True)
    assert cleared.clear_location is True
    assert cleared.location is None
    assert EditContent(content_id="c").clear_location is False


def test_the_widget_order_no_longer_knows_the_map() -> None:
    import pytest
    from pydantic import ValidationError

    from offload_agent.harness.tools import SetThreadPreference

    kept = SetThreadPreference(thread_id="t", widgets=["todo", "files"])
    assert kept.widgets == ["todo", "files"]
    with pytest.raises(ValidationError):
        SetThreadPreference(thread_id="t", widgets=["map", "todo"])
