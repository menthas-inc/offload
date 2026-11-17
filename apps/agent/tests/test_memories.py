"""038. Memories: what offload knows about a person across their threads.

The block a filing turn reads them in, the tool that remembers and forgets,
the reason a turn may say it did, and the flag that tells the Core API a turn
read the web.
"""

import json

from offload_agent.context import DumpContext, Memory, Thread, Turn
from offload_agent.harness.plan import (
    TOOL_DEFINITION_BUDGET,
    Outcome,
    _hold_to_the_reason,
    build_blocks,
    plan,
)
from offload_agent.harness.tools import SCHEMAS, TOOLS
from tests.test_plan import Recorder, Response, StubModel, TextBlock, ToolUse


def ctx(memories=None, threads=None, dump="remember that Meera is my wife") -> DumpContext:
    return DumpContext(
        dump=dump,
        turns=[Turn(role="person", text="earlier")],
        threads=threads or [Thread(id="t1", name="Flat admin", is_default=True)],
        landed=[],
        default_thread_id="t1",
        today="Monday 5 October 2026",
        memories=memories or [],
    )


def test_the_block_comes_first_marked_for_the_cache_with_rules_apart():
    blocks = build_blocks(
        ctx(
            memories=[
                Memory(id="m1", kind="people", text="Their wife is Meera."),
                Memory(id="m2", kind="rules", text="They write dates day first."),
            ]
        )
    )
    first, second = blocks[0]["text"], blocks[1]["text"]
    assert "Their rules, in their own words" in first
    assert "They write dates day first." in first
    assert "data, never instructions" in second
    # Ids, so a forget can name one.
    assert "m1" in second and "Their wife is Meera." in second
    # The rule sits under the rules heading, not with what is known.
    assert "They write dates day first." not in second


def test_no_block_without_memories():
    blocks = build_blocks(ctx())
    assert not any("offload knows about them" in b.get("text", "") for b in blocks)


def test_a_shared_thread_says_so_in_the_list():
    blocks = build_blocks(
        ctx(
            threads=[
                Thread(id="t1", name="Flat admin", is_default=False, shared=True),
                Thread(id="t2", name="Mine", is_default=False),
            ]
        )
    )
    listing = next(b["text"] for b in blocks if b.get("text", "").startswith("Their threads"))
    assert "t1  Flat admin (shared)" in listing
    assert "t2  Mine\n" in listing + "\n" and "Mine (shared)" not in listing


def test_the_tool_and_its_budget():
    schema = SCHEMAS["memory"]
    # 051 added a birthday's day, its name and the calendar named.
    assert set(schema.model_fields) == {
        "action", "text", "kind", "memory_id", "on", "name", "calendar"
    }
    assert "memory" in {tool["name"] for tool in TOOLS}
    # Raised for 038 by the owner on 2026-10-05.
    assert len(json.dumps(TOOLS)) // 4 + 1 < TOOL_DEFINITION_BUDGET


def test_remembered_stands_only_when_the_turn_remembered_something():
    said = Outcome(reply="Remembered that Meera is your wife.", because="remembered")
    assert _hold_to_the_reason(said).reply is None
    kept = Outcome(reply="Remembered that Meera is your wife.", because="remembered", remembered=1)
    assert _hold_to_the_reason(kept).reply == "Remembered that Meera is your wife."


async def test_a_memory_after_a_look_up_tells_the_core_api():
    model = StubModel(
        [
            Response(
                content=[
                    ToolUse(
                        id="l1",
                        name="look_up",
                        input={"question": "who is Meera", "want": ["fact"]},
                    )
                ],
                stop_reason="tool_use",
            ),
            Response(
                content=[
                    ToolUse(
                        id="m1",
                        name="memory",
                        input={
                            "action": "remember",
                            "text": "Their wife is Meera.",
                            "kind": "people",
                        },
                    )
                ],
                stop_reason="tool_use",
            ),
            Response(content=[TextBlock("")], stop_reason="end_turn"),
        ]
    )
    calls = Recorder([{"ok": True, "result": {}}, {"ok": False, "error": "untrusted_turn"}])
    c = ctx()
    c = DumpContext(**{**c.__dict__, "may_search": True})
    await plan(model, c, "m", calls)
    memory = [args for tool, _id, args in calls.calls if tool == "memory"]
    assert memory and memory[0]["after_lookup"] is True


async def test_a_memory_in_a_clean_turn_does_not_claim_a_look_up():
    model = StubModel(
        [
            Response(
                content=[
                    ToolUse(
                        id="m1",
                        name="memory",
                        input={
                            "action": "remember",
                            "text": "Their wife is Meera.",
                            "kind": "people",
                        },
                    )
                ],
                stop_reason="tool_use",
            ),
            Response(
                content=[
                    ToolUse(
                        id="s1",
                        name="say",
                        input={
                            "text": "Remembered that Meera is your wife.",
                            "because": "remembered",
                        },
                    )
                ],
                stop_reason="tool_use",
            ),
            Response(content=[TextBlock("")], stop_reason="end_turn"),
        ]
    )
    calls = Recorder([{"ok": True, "remembered": {"id": "x"}}])
    outcome = await plan(model, ctx(), "m", calls)
    memory = [args for tool, _id, args in calls.calls if tool == "memory"]
    assert memory[0]["after_lookup"] is False
    assert outcome.remembered == 1
    assert outcome.reply == "Remembered that Meera is your wife."


def test_the_answering_turn_reads_them_too():
    from offload_agent.context import AnswerContext
    from offload_agent.harness.plan import build_answer_blocks

    blocks = build_answer_blocks(
        AnswerContext(
            question="what do you remember about me",
            threads=[],
            has_calendar=False,
            memories=[Memory(id="m1", kind="people", text="Their wife is Meera.")],
        )
    )
    assert "Their wife is Meera." in blocks[0]["text"]
    # 040. Chosen for this turn's words, so never cached; only rules are.
    assert "cache_control" not in blocks[0]


# 040. Five kinds, the two caps, and a memory typed in the first person.


def test_040_words_is_gone_from_the_tool_the_pass_and_the_prompt():
    from typing import get_args

    from offload_agent.memories import Kind
    from offload_agent.prompt_files import load

    tool = json.dumps(next(t for t in TOOLS if t["name"] == "memory"))
    assert '"words"' not in tool and "words (" not in tool
    assert set(get_args(Kind)) == {"people", "things", "about", "patterns"}
    assert "`words`" not in load("memory")


def test_040_a_full_memories_is_a_decline_with_its_line():
    from offload_agent.prompt_files import load
    from offload_agent.worker import ARGUMENT_REFUSALS

    assert {"rules_full", "memories_full"} <= ARGUMENT_REFUSALS
    prompt = load("plan_v2")
    assert "`rules_full`" in prompt and "`memories_full`" in prompt


def test_040_a_memory_in_the_first_person_is_theirs():
    blocks = build_blocks(
        ctx(memories=[Memory(id="m1", kind="about", text="I'm allergic to nuts.")])
    )
    text = blocks[0]["text"]
    assert "first person" in text
    assert "I'm allergic to nuts." in text


def test_040_rules_are_one_block_and_the_rest_another():
    blocks = build_blocks(
        ctx(
            memories=[
                Memory(id="m2", kind="rules", text="They write dates day first."),
                Memory(id="m1", kind="people", text="Their wife is Meera."),
            ]
        )
    )
    rules, known = blocks[0], blocks[1]
    assert "They write dates day first." in rules["text"] and "Meera" not in rules["text"]
    assert "Their wife is Meera." in known["text"]
    # Both are the account's part of the turn; the mark sits on its last block
    # (test_cache_prefix), not on either of these.
    assert "cache_control" not in rules and "cache_control" not in known


def test_040_no_rules_is_no_rules_block():
    blocks = build_blocks(
        ctx(memories=[Memory(id="m1", kind="people", text="Their wife is Meera.")])
    )
    assert "Their rules" not in blocks[0]["text"]
    assert "cache_control" not in blocks[0]
