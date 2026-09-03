"""What the planner is allowed to do.

Eight tools. Every capability the product will ever have arrives as one of
these, so the shape here matters more than the eight it has today.

**One definition each.** The pydantic model is the validator and the source of
the JSON schema the model is shown. Written twice they drift, and the drift is
silent: the model is told a field is optional, the validator says it is not, and
every call is refused for a reason nobody can see from either side.

**There is no delete tool and its absence is asserted rather than assumed.**
Deletion is author-only, offload is not an author, and a model that can delete
is a model that can lose somebody's dump on a misread. `archive_content` is the
reversible thing offload is allowed to do and it covers every case a person
would phrase as "get rid of that".

**`set_thread_preference` arrived in 007**, with the column it writes and the
screen that reads it. It was drafted for 006 and held back, because a tool
shipped a version ahead of its storage is a tool that cannot work.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# Mirrors apps/core-api/src/threads/tags.ts. Six is generous for one piece of
# content and finite.
MAX_TAGS = 6
TAG_CHARS = 48

# A location's title is the one string that ever reaches a geocoder, so it is
# held to a tighter shape than any other title. Enforced again server-side,
# because the agent plane is not the enforcement point for anything.
PLACE_NAME_CHARS = 120

ContentType = Literal[
    "note", "link", "image", "screenshot", "voice", "file", "task", "event", "location"
]


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
    type: ContentType = "note"

    # ISO 8601. Only ever set when the dump states or clearly implies one:
    # "after the 20th" is a date, "soon" is not, and inventing one puts a wrong
    # thing on somebody's agenda, which is worse than putting nothing there.
    due_at: str | None = None
    occurs_at: str | None = None
    occurs_end_at: str | None = None

    # A flag on a task or an event, never a type of its own. A task that becomes
    # a reminder must not change type.
    is_reminder: bool = False

    # 0 to 100, higher first. Orders content inside a thread.
    priority: int = Field(default=50, ge=0, le=100)

    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)

    @field_validator("title")
    @classmethod
    def title_is_usable(cls, v: str) -> str:
        return v.strip()


class ListThreadContent(BaseModel):
    """Read what is already in a thread."""

    thread_id: str = Field(min_length=1)


class EditContent(BaseModel):
    """Change a piece of content you filed."""

    content_id: str = Field(min_length=1)
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = Field(default=None, max_length=MAX_TAGS)
    priority: int | None = Field(default=None, ge=0, le=100)


class MoveContent(BaseModel):
    """Put a piece of content in a different thread."""

    content_id: str = Field(min_length=1)
    thread_id: str = Field(min_length=1)


class CompleteContent(BaseModel):
    """Tick something off, or put it back."""

    content_id: str = Field(min_length=1)
    done: bool = True


class ArchiveContent(BaseModel):
    """Take something out of a thread's active list, reversibly."""

    content_id: str = Field(min_length=1)
    archived: bool = True


class SetThreadPreference(BaseModel):
    """Say how a thread should be arranged."""

    thread_id: str = Field(min_length=1)
    # Which tag dimension each widget groups by, e.g. {"todo": "city"}.
    group_by: dict[str, str] | None = None
    # What order the widgets come in, e.g. ["map", "todo"].
    widgets: list[str] | None = None


class RenameThread(BaseModel):
    """Rename a thread."""

    thread_id: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=80)


SCHEMAS: dict[str, type[BaseModel]] = {
    "create_thread": CreateThread,
    "add_content": AddContent,
    "list_thread_content": ListThreadContent,
    "edit_content": EditContent,
    "move_content": MoveContent,
    "complete_content": CompleteContent,
    "archive_content": ArchiveContent,
    "set_thread_preference": SetThreadPreference,
    "rename_thread": RenameThread,
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


_DESCRIPTIONS = {
    "create_thread": (
        "Start a new thread with a name. Use this only when nothing in their "
        "existing threads is a reasonable home. Prefer an existing thread."
    ),
    "add_content": (
        "File one piece of what they dumped into a thread, by thread id. Call it "
        "once per separable piece. Anything with no obvious home goes in their "
        "default thread. Set a date only when they gave you one."
    ),
    "list_thread_content": (
        "Read what is already in a thread, so you do not file something twice or "
        "contradict what is there. Returns one page, newest first."
    ),
    "edit_content": (
        "Change something you filed for them: its title, body, tags or priority. "
        "Only content this account wrote."
    ),
    "move_content": (
        "Put a piece of content in a different thread. Only content this account "
        "wrote, and only into a thread they are in."
    ),
    "complete_content": "Tick a task off, or put it back if they say it is not done.",
    "archive_content": (
        "Take something out of a thread's active list without destroying it. This "
        "is what to use when they say to get rid of something. You cannot delete."
    ),
    "set_thread_preference": (
        "Say how a thread should be arranged: which tag dimension a widget groups "
        "by, and what order the widgets come in. Use it when they ask for one, not "
        "on your own initiative."
    ),
    "rename_thread": "Rename a thread.",
}

TOOLS: list[dict[str, Any]] = [
    {"name": name, "description": _DESCRIPTIONS[name], "input_schema": _schema_for(model)}
    for name, model in SCHEMAS.items()
]

TOOL_NAMES = frozenset(SCHEMAS)

# The tools that change content somebody else may have written. Refused by the
# Core API when the row is not this account's, and named here so the loop can
# say something useful rather than passing an opaque refusal back.
AUTHOR_ONLY = frozenset({"edit_content", "move_content"})

# The tools that actually put something somewhere.
#
# This is the definition of "landed", and it is narrower than "a tool call that
# succeeded". Reading a thread succeeds; it files nothing. Ticking something off
# succeeds; it files nothing either. Counting those as filings makes the record
# the reply is checked against say "added to Lisbon trip" about a thread the
# turn only looked at, which is the exact untruth the record exists to catch.
#
# Found by the eval: a dump saying "add tomatoes, basil and anchovies to the
# list" made the planner read three threads looking for a shopping list, and all
# three were recorded as places it had filed things.
FILING_TOOLS = frozenset({"add_content", "create_thread"})
