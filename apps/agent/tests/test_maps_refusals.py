"""030. A location on a row that cannot have one is a decline, not a failure."""


def test_location_refusals_are_declines() -> None:
    from offload_agent.worker import ARGUMENT_REFUSALS

    assert "location_not_here" in ARGUMENT_REFUSALS
    assert "bad_place_name" in ARGUMENT_REFUSALS
