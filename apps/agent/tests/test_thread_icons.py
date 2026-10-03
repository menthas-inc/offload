"""037. The icon the model may name when it starts a thread.

The seventy names live in `@offload/widgets`, which the server and both
clients read. The agent holds a copy, because it is shown to the model in the
tool's schema, and the first test holds the copy to the original.
"""

import re
from pathlib import Path

import pytest

from offload_agent.harness.thread_icons import THREAD_ICON_NAMES
from offload_agent.harness.tools import SCHEMAS, TOOLS, CreateThread

SHARED = Path(__file__).resolve().parents[3] / "packages" / "widgets" / "src" / "thread-icons.ts"


def test_the_copy_is_the_shared_list() -> None:
    if not SHARED.exists():
        pytest.skip("the shared module is not in this checkout")
    names = re.findall(r'\{ icon: "([a-z0-9-]+)", words: \[', SHARED.read_text())
    assert len(names) == 70
    assert list(THREAD_ICON_NAMES) == names


def test_an_icon_from_the_list_is_kept() -> None:
    assert CreateThread(name="Lisbon", icon="plane").icon == "plane"


def test_no_icon_is_fine() -> None:
    assert CreateThread(name="Lisbon").icon is None
    assert "icon" not in CreateThread(name="Lisbon").model_dump(exclude_none=True)


@pytest.mark.parametrize("icon", ["present-box", "../../etc", "", "Plane", "lasso", 7, ["plane"]])
def test_anything_else_is_dropped_and_the_call_is_not_refused(icon: object) -> None:
    """A thread is still made: the server picks from the name instead."""
    assert CreateThread.model_validate({"name": "Lisbon", "icon": icon}).icon is None


def test_the_model_is_shown_the_seventy() -> None:
    tool = next(one for one in TOOLS if one["name"] == "create_thread")
    shown = tool["input_schema"]["properties"]["icon"]
    assert shown["description"] == "One of: " + " ".join(THREAD_ICON_NAMES)
    assert "enum" not in shown
    assert "icon" not in tool["input_schema"].get("required", [])
    assert "icon" in tool["description"]
    assert SCHEMAS["create_thread"] is CreateThread
