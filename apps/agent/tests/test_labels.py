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
    assert TOOL_DEFINITION_BUDGET == 1_800
    assert len(json.dumps(TOOLS)) // 4 + 1 < TOOL_DEFINITION_BUDGET
