"""025. Labels, as the model plane sees them.

AC-30 the model's `tags`, `group_by` and the tag question are gone, and the
      definitions still fit their budget without the number moving.
"""

from __future__ import annotations

import json
import typing

from offload_agent.harness.plan import TOOL_DEFINITION_BUDGET, TOOLS, Judgement
from offload_agent.harness.tools import SCHEMAS, Ask


def test_the_filing_tools_take_no_tags():
    assert "tags" not in SCHEMAS["add_content"].model_fields
    assert "tags" not in SCHEMAS["edit_content"].model_fields


def test_a_thread_preference_has_no_grouping():
    assert "group_by" not in SCHEMAS["set_thread_preference"].model_fields


def test_there_is_no_tag_question():
    fields = typing.get_args(Ask.model_fields["field"].annotation)
    assert "tag" not in fields
    assert "tag" not in Judgement.model_fields


def test_no_definition_mentions_tags():
    serialised = json.dumps(TOOLS).lower()
    assert "tags" not in serialised
    assert "group_by" not in serialised


def test_the_definitions_fit_at_the_same_number():
    # 028 raised it to 1,900 by the owner's decision; see plan.py.
    assert TOOL_DEFINITION_BUDGET == 1_900
    assert len(json.dumps(TOOLS)) // 4 + 1 < TOOL_DEFINITION_BUDGET


# ------------------------------------------------------------------ live filing


def test_label_content_carries_ids_and_names_only_as_new_labels():
    from offload_agent.harness.tools import SCHEMAS as S

    model = S["label_content"]
    ok = model.model_validate(
        {"content_ids": ["c1"], "add": ["l1"], "new": ["Istanbul"], "remove": ["l2"]}
    )
    assert ok.new == ["Istanbul"]
    definition = next(t for t in TOOLS if t["name"] == "label_content")
    # The definition names no label: the thread's labels are data in the turn.
    assert "Istanbul" not in json.dumps(definition)


def test_the_threads_labels_are_data_in_the_user_turn():
    from offload_agent.context import DumpContext, LabelRef, Thread
    from offload_agent.harness.plan import build_blocks

    ctx = DumpContext(
        dump="ferry on tuesday",
        turns=[],
        threads=[Thread(id="t1", name="Europe, October", is_default=False)],
        landed=[],
        default_thread_id="t1",
        labels=[LabelRef(id="l1", thread_id="t1", name="Istanbul")],
    )
    text = "\n".join(b.get("text", "") for b in build_blocks(ctx))
    assert "l1" in text and "Istanbul" in text
    assert "data" in text.lower()


def test_no_labels_means_no_block():
    from offload_agent.context import DumpContext, Thread
    from offload_agent.harness.plan import build_blocks

    ctx = DumpContext(
        dump="ferry",
        turns=[],
        threads=[Thread(id="t1", name="A", is_default=True)],
        landed=[],
        default_thread_id="t1",
    )
    assert not any("Labels in" in b.get("text", "") for b in build_blocks(ctx))


def test_a_label_refusal_is_a_decline_the_model_can_read():
    from offload_agent.worker import ARGUMENT_REFUSALS

    for code in ("not_in_the_dump", "label_limit", "person_set", "person_deleted"):
        assert code in ARGUMENT_REFUSALS
