"""Tool definitions carry no null branches and no dangling references.

Every optional field used to render as `anyOf: [X, {type: null}]` with
`default: null`, eleven times on add_content alone, in the cached prefix of
every call. The model only needs X and the `required` list; pydantic still
validates, so a null the model sends anyway is accepted as not stated.

`ask` sent `options.items` as `{"$ref": "#/$defs/AskOption"}` with the
`$defs` popped, so the model never saw an option's shape and guessed bare
strings, which the schema then refused.
"""

import json

from offload_agent.harness.plan import Judgement, Question
from offload_agent.harness.tools import (
    ANSWER_CALENDAR_TOOL_DEFS,
    ANSWER_TOOLS,
    ASK_TOOL,
    CALENDAR_TOOL_DEFS,
    LOOK_UP_TOOL,
    SAY_TOOL,
    SHARE_TOOL_DEF,
    TOOLS,
    AddContent,
    Ask,
    EditContent,
    _schema_for,
)

ALL = [
    *TOOLS,
    *CALENDAR_TOOL_DEFS,
    *ANSWER_TOOLS,
    *ANSWER_CALENDAR_TOOL_DEFS,
    SHARE_TOOL_DEF,
    SAY_TOOL,
    ASK_TOOL,
    LOOK_UP_TOOL,
    {"name": "Question", "input_schema": _schema_for(Question)},
    {"name": "Judgement", "input_schema": _schema_for(Judgement)},
]


def test_no_tool_schema_has_a_null_branch_or_a_reference() -> None:
    for tool in ALL:
        text = json.dumps(tool["input_schema"])
        assert '"null"' not in text, tool["name"]
        assert "anyOf" not in text, tool["name"]
        assert "$ref" not in text, tool["name"]
        assert "$defs" not in text, tool["name"]
        assert '"title": "' not in text.replace('"title": {', ""), tool["name"]


def test_an_ask_option_has_its_shape_on_the_wire() -> None:
    items = ASK_TOOL["input_schema"]["properties"]["options"]["items"]
    assert items == {
        "type": "object",
        "properties": {
            "value": {"type": "string", "minLength": 1, "maxLength": 40},
            "label": {"type": "string", "maxLength": 24},
        },
        "required": ["value"],
    }


def test_the_constraints_of_the_kept_branch_survive() -> None:
    props = next(t for t in TOOLS if t["name"] == "add_content")["input_schema"]["properties"]
    assert props["url"] == {"type": "string", "maxLength": 2000}
    assert props["photo"] == {"type": "integer"}
    assert props["body"]["default"] == ""
    assert props["priority"]["default"] == 50
    memory = next(t for t in TOOLS if t["name"] == "memory")["input_schema"]["properties"]
    assert memory["kind"]["enum"] == ["people", "things", "about", "rules", "patterns"]


def test_an_explicit_null_still_validates() -> None:
    row = AddContent.model_validate(
        {"thread_id": "t", "title": "x", "type": "task", "url": None, "due_at": None, "photo": None}
    )
    assert row.url is None and row.due_at is None and row.photo is None
    assert EditContent.model_validate({"content_id": "c", "location": None}).location is None
    ask = Ask.model_validate(
        {"field": "date", "title": "When", "options": [{"value": "2026-10-11", "label": None}]}
    )
    assert ask.options[0].label is None
