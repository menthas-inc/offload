"""051. A birthday is a memory, and the Core API is told when the turn read
another member's words, which it cannot see for itself."""

import pytest
from pydantic import ValidationError

from offload_agent.context import DumpContext, Thread, ThreadNote, ThreadNotes, Turn
from offload_agent.harness.plan import plan
from offload_agent.harness.tools import SCHEMAS, Memory
from tests.test_plan import Recorder, Response, StubModel, TextBlock, ToolUse

KRISTINA = {
    "action": "remember",
    "text": "Kristina's birthday is 1 February.",
    "kind": "people",
    "on": "02-01",
    "name": "Kristina's birthday",
}


def ctx(
    notes: ThreadNotes | None = None, dump: str = "Kristina's birthday is Feb 1st"
) -> DumpContext:
    thread = Thread(id="t1", name="Family", is_default=False)
    return DumpContext(
        dump=dump,
        turns=[Turn(role="person", text="earlier")],
        threads=[thread],
        landed=[],
        default_thread_id="t1",
        today="Monday 16 November 2026",
        looking_at=thread if notes is not None else None,
        looking_at_notes=notes,
    )


def remembering(*before: Response) -> StubModel:
    return StubModel(
        [
            *before,
            Response(
                content=[ToolUse(id="m1", name="memory", input=KRISTINA)], stop_reason="tool_use"
            ),
            Response(content=[TextBlock("")], stop_reason="end_turn"),
        ]
    )


def test_the_memory_tool_carries_a_day_a_name_and_a_calendar():
    parsed = SCHEMAS["memory"].model_validate({**KRISTINA, "calendar": "my personal calendar"})
    assert (parsed.on, parsed.name, parsed.calendar) == (
        "02-01",
        "Kristina's birthday",
        "my personal calendar",
    )


def test_a_day_that_is_not_mm_dd_is_refused_by_the_schema():
    with pytest.raises(ValidationError):
        Memory.model_validate({**KRISTINA, "on": "Feb 1"})


async def test_a_clean_turn_does_not_claim_another_member_s_words():
    calls = Recorder([{"ok": True, "remembered": {"id": "x"}, "calendar": "written"}])
    await plan(remembering(), ctx(), "m", calls)
    memory = [args for tool, _id, args in calls.calls if tool == "memory"]
    assert memory and memory[0]["after_members"] is False


async def test_a_member_s_note_on_screen_is_another_member_s_words():
    notes = ThreadNotes(
        members=[ThreadNote(text="Kristina's birthday is 1 February.", written_at="2026-11-01")]
    )
    calls = Recorder([{"ok": False, "error": "untrusted_turn"}])
    await plan(remembering(), ctx(notes=notes), "m", calls)
    memory = [args for tool, _id, args in calls.calls if tool == "memory"]
    assert memory[0]["after_members"] is True


async def test_a_result_carrying_a_member_s_notes_is_too():
    listed = Response(
        content=[ToolUse(id="l1", name="list_thread_content", input={"thread_id": "t1"})],
        stop_reason="tool_use",
    )
    calls = Recorder(
        [
            {
                "ok": True,
                "rows": [],
                "notesFromMembers": [{"text": "Kristina's birthday is 1 February."}],
            },
            {"ok": False, "error": "untrusted_turn"},
        ]
    )
    await plan(remembering(listed), ctx(), "m", calls)
    memory = [args for tool, _id, args in calls.calls if tool == "memory"]
    assert memory[0]["after_members"] is True


async def test_a_read_returning_a_member_s_row_is_too():
    read = Response(
        content=[ToolUse(id="l1", name="list_thread_content", input={"thread_id": "t1"})],
        stop_reason="tool_use",
    )
    calls = Recorder(
        [
            {
                "ok": True,
                "result": {
                    "rows": [{"contentId": "c1", "title": "Kristina 1 Feb", "yours": False}]
                },
            },
            {"ok": False, "error": "untrusted_turn"},
        ]
    )
    await plan(remembering(read), ctx(), "m", calls)
    memory = [args for tool, _id, args in calls.calls if tool == "memory"]
    assert memory[0]["after_members"] is True
