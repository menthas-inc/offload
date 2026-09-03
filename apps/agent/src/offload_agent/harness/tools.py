"""What the planner is allowed to do.

Two tools. Every capability the product will ever have arrives as one of these,
so the shape here matters more than the two it starts with.

**One definition each.** The pydantic model is the validator and the source of
the JSON schema the model is shown. Written twice they drift, and the drift is
silent: the model is told a field is optional, the validator says it is not, and
every call is refused for a reason nobody can see from either side.

**`move_content` and `edit_content` are deliberately absent.** Nothing in the
planner's context can produce a valid content id, so a tool to move or edit one
is a tool it has no way to call correctly. They return with search.
"""

from typing import Any

from pydantic import BaseModel, Field


class CreateThread(BaseModel):
    """Start a thread."""

    name: str = Field(min_length=1, max_length=80)


class AddContent(BaseModel):
    """Put one piece of what somebody dumped into a thread."""

    # An id, never a name. Nothing makes a thread name unique within an account,
    # so a name is an ambiguous address, and resolving one server-side would
    # mean picking a thread on the model's behalf and being wrong silently.
    thread_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=4000)


SCHEMAS: dict[str, type[BaseModel]] = {
    "create_thread": CreateThread,
    "add_content": AddContent,
}


def _schema_for(model: type[BaseModel]) -> dict[str, Any]:
    """The JSON schema, with pydantic's bookkeeping removed.

    `$defs` and `title` are noise in a tool definition: they cost tokens in
    every request and say nothing to the model that the field names do not.
    """
    schema = model.model_json_schema()
    schema.pop("title", None)
    schema.pop("$defs", None)
    for field in schema.get("properties", {}).values():
        field.pop("title", None)
    return schema


TOOLS: list[dict[str, Any]] = [
    {
        "name": "create_thread",
        "description": (
            "Start a new thread with a name. Use this only when nothing in their "
            "existing threads is a reasonable home. Prefer an existing thread."
        ),
        "input_schema": _schema_for(CreateThread),
    },
    {
        "name": "add_content",
        "description": (
            "File one piece of what they dumped into a thread, by thread id. "
            "Call it once per separable piece. Anything with no obvious home "
            "goes in their default thread."
        ),
        "input_schema": _schema_for(AddContent),
    },
]

TOOL_NAMES = frozenset(SCHEMAS)
