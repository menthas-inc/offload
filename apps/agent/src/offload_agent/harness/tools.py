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

import re
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

# A day, or a timestamp with or without a zone. Mirrors what
# apps/core-api/src/threads/dates.ts accepts, and exists so a model writing
# "2026-09-28" is corrected here rather than by a 400 it cannot read.
_DATE_ISH = re.compile(
    r"^\d{4}-\d{2}-\d{2}"
    r"([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?"
    r"(Z|[+-]\d{2}:?\d{2})?$"
)

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

    @field_validator("due_at", "occurs_at", "occurs_end_at")
    @classmethod
    def looks_like_a_date(cls, v: str | None) -> str | None:
        """Caught here so it never becomes a refusal the model has to interpret.

        The Core API accepts a day, a naive time and a full ISO string, and
        refuses anything else. Checking the same shape here turns "the tool said
        no for a reason I have to guess at" into a validation message naming the
        field, which is the difference between the model fixing it on the next
        call and the model telling somebody the tool is broken.
        """
        if v is None or v == "":
            return None
        if not _DATE_ISH.match(v.strip()):
            raise ValueError("expected YYYY-MM-DD or an ISO 8601 timestamp")
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


class AddMemory(BaseModel):
    """Remember how a thread should be handled."""

    thread_id: str = Field(min_length=1)
    # 200 characters, matching MEMORY_TEXT_CHARS in the Core API. Long enough
    # for a rule and short enough that ten of them stay readable.
    text: str = Field(min_length=1, max_length=200)


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
    "add_memory": AddMemory,
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
    "add_memory": (
        "Remember a standing rule about a thread: how they want it handled, or "
        "something that stays true about it. Only when they say one, and never "
        "for something you could file instead. A rule is not a task. A thread "
        "holds ten at most."
    ),
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

# Writing a memory is not filing.
#
# It changes how a thread behaves rather than putting anything in it, so a turn
# that only wrote a memory has filed nothing and the reply must not claim it
# did. Same reasoning as reading a thread: FILING_TOOLS below is the definition
# of "landed" and this is deliberately outside it.

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


# 012: the calendar. Five tools, and the three that write do not decide whether
# they are confirmed.
#
# **There is no field here for confirmation, on purpose.** Whether a write
# reaches somebody else is decided on the server, from the event and the
# calendar, and handed back as a result. Some of what this model reads came out
# of a calendar somebody else can write into, so a field it could set to skip a
# confirmation would be the whole defence handed to whoever wrote the event.


class ListCalendars(BaseModel):
    """Which calendars this person has connected."""


class FindEvents(BaseModel):
    """What is on a calendar between two moments."""

    calendar_id: str = Field(min_length=1)
    # ISO 8601. The model already reasons about dates in the prompt's timezone.
    from_iso: str = Field(min_length=1, max_length=40)
    to_iso: str = Field(min_length=1, max_length=40)


class CreateEvent(BaseModel):
    """Put something on a calendar."""

    calendar_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    starts_at: str = Field(min_length=1, max_length=40)
    ends_at: str = Field(min_length=1, max_length=40)
    location: str | None = Field(default=None, max_length=200)
    # Addresses, because that is what an invitation needs. Adding one is what
    # makes a write reach somebody else, which the server notices.
    guests: list[str] | None = None


class EditEvent(BaseModel):
    """Change an event that is already there."""

    calendar_id: str = Field(min_length=1)
    source_ref: str = Field(min_length=1, max_length=400)
    title: str | None = Field(default=None, max_length=200)
    starts_at: str | None = Field(default=None, max_length=40)
    ends_at: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=200)
    # **Read from what they said, never asked as a question.** "Move this week's
    # standup" is one; "standup is at 3pm from now on" is following. Default to
    # one: its blast radius is a day, and the other rewrites a year.
    scope: Literal["one", "following"] = "one"


class DeleteEvent(BaseModel):
    """Take an event off a calendar."""

    calendar_id: str = Field(min_length=1)
    source_ref: str = Field(min_length=1, max_length=400)
    scope: Literal["one", "following"] = "one"


SCHEMAS.update(
    {
        "list_calendars": ListCalendars,
        "find_events": FindEvents,
        "create_event": CreateEvent,
        "edit_event": EditEvent,
        "delete_event": DeleteEvent,
    }
)

_DESCRIPTIONS.update(
    {
        "list_calendars": (
            "The calendars they have connected, with whether you may write to "
            "each one. Call this before writing if you do not already know the "
            "calendar id."
        ),
        "find_events": (
            "What is on a calendar between two moments. Use it before saying "
            "anything about their week, and before moving something, so you "
            "know what is actually there."
        ),
        "create_event": (
            "Put something on their calendar. If it needs guests, add them and "
            "say so in your reply: offload will ask them to confirm before "
            "anybody is emailed."
        ),
        "edit_event": (
            "Change an event. `scope` comes from what they said: 'move this "
            "week's standup' is one occurrence, 'standup is at 3pm from now on' "
            "is this one and every one after. When they have not said, it is "
            "one."
        ),
        "delete_event": (
            "Take an event off a calendar. `scope` works as it does for "
            "edit_event. Past occurrences are never touched."
        ),
    }
)

# Writing to a calendar is the only thing in this product that leaves offload,
# so these are not filing and do not belong in FILING_TOOLS.
CALENDAR_TOOLS = frozenset(
    {"list_calendars", "find_events", "create_event", "edit_event", "delete_event"}
)


# **Sent only to somebody who has connected a calendar**, which is what keeps
# the definition budget honest and is also just correct: offering create_event
# to an account with no calendar is offering a tool that can only fail.
#
# `TOOLS` stays the ten every turn carries. These are added beside them when the
# context says there is a calendar to talk to, which is the shape the budget
# test measures separately.
CALENDAR_TOOL_DEFS = [
    {"name": name, "description": _DESCRIPTIONS[name], "input_schema": _schema_for(SCHEMAS[name])}
    for name in ("list_calendars", "find_events", "create_event", "edit_event", "delete_event")
]
