"""Assembling what the model sees.

Two rules govern this file and they pull in different directions, so both are
enforced here rather than left to the caller.

**Bounded (OFF-8).** Nothing in a prompt may grow with the age of an account.
Threads run to 300 on a heavy account and grow every week; a conversation runs
to hundreds of turns. Both are capped, and the cap is a number, not a hope.

**Separated (SEC-1).** Thread names come from our database and are trusted. The
dump came from a person and is not. They travel as separate blocks and are never
concatenated, because the whole value of the boundary is that the model can tell
which is which.
"""

from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


@dataclass(frozen=True)
class Turn:
    role: str
    text: str


@dataclass(frozen=True)
class Thread:
    """A thread the planner may file into.

    The id is here because tools address threads by id and never by name: two
    threads in one account may share a name, so a name is an ambiguous address
    and resolving one server-side would mean guessing on the model's behalf.
    """

    id: str
    name: str
    is_default: bool


@dataclass(frozen=True)
class Filed:
    """Something this dump already put somewhere.

    Empty on a first attempt, which is the common case. Non-empty on a resume,
    where it is the whole mechanism stopping a finished piece being filed twice.
    """

    title: str
    thread_name: str


@dataclass(frozen=True)
class Photo:
    """020. A photo the message carries, as the model will see it.

    `index` is one-based and in the order the photos were attached, and it is
    the only way the model names one: `add_content` takes the index, never an
    id. `large` is the rendition's bytes, filled by the worker after it made
    them, and None for a file that could not be opened.
    """

    blob_id: str
    index: int
    large: bytes | None = None


@dataclass(frozen=True)
class DumpContext:
    dump: str
    turns: list[Turn]
    threads: list[Thread]
    landed: list[Filed]
    default_thread_id: str | None
    #: 020. The photos on this message, in order. Outside the text budget:
    #: their cost is bounded by the ten-photo cap per message, not by `fit`.
    photos: list[Photo] = field(default_factory=list)
    #: 021. The dump holds a transcript: its words were spoken and written
    #: down, and the label says so.
    spoken: bool = False
    # The thread that was on screen when this was dumped, if any.
    #
    # A default, not a destination. Somebody typing into the composer from
    # inside a thread means that thread nearly every time, and the prompt says
    # so, but words naming another thread override it. Distinct from the hard
    # pin a quick add carries, where the section they pressed + in is the
    # choice and nothing may leave it.
    looking_at: Thread | None = None
    # "Friday 3 October 2026", from the database's clock rather than the
    # worker's, so every worker in every region agrees with the rows it reads.
    # The account's own timezone is not stored yet; when it is, this is the one
    # place that changes.
    today: str | None = None
    # Whether this account has a calendar connected at all, which decides
    # whether the calendar tools are sent. Offering create_event to somebody
    # with no calendar is offering a tool that can only fail, and it costs every
    # one of them the definitions on every call.
    has_calendar: bool = False
    # Whether offload may reach the web for this turn, from the two switches on
    # the account. Read here, from the database, on every turn: the switches are
    # authorization and a flag on a request would be the client deciding.
    may_search: bool = False
    may_read_links: bool = False
    #: Where they said they are, ISO 3166-1 alpha-2, or None when they have not
    #: said. **None is a real answer**: offload tells the model it does not know
    #: rather than letting a search assume, which is how "when is the next bank
    #: holiday" came back with Columbus Day.
    country: str | None = None
    #: 018. A typed message answered the open question before this turn ran.
    #: The value is already on the row; the planner files the rest and not
    #: the value again. Never dropped by `fit`.
    answered: dict | None = None

    @property
    def may_look_up(self) -> bool:
        return self.may_search or self.may_read_links


# Resolved through thread_members, which is the only path there is: `threads`
# has no owner column at all, by design, because a thread has members and the
# creator is simply the first one. Filtering by anything else would either hide
# a shared thread from a member or show one to somebody who is not (OFF-3).
_THREADS = text(
    """
    select t.id, t.name
    from threads t
    join thread_members m on m.thread_id = t.id
    where m.account_id = :account_id
      and m.state = 'accepted'
      and t.deleted_at is null
    order by t.last_activity_at desc
    limit :limit
    """
)

# The default thread, read separately rather than inferred from the list above.
#
# It is an ordinary thread and may well be too stale to make the cap, so finding
# it by position would work until somebody had a busy month. Named by
# accounts.default_thread_id, never by matching the name "Miscellaneous", which
# a person can rename.
_DEFAULT_THREAD = text(
    """
    select t.id, t.name
    from accounts a
    join threads t on t.id = a.default_thread_id
    where a.id = :account_id
      and t.deleted_at is null
    """
)

# What this dump already filed. Empty on a first attempt: one indexed lookup
# returning nothing, which is the price of a resume never duplicating.
_LANDED = text(
    """
    select c.title, t.name as thread_name
    from content c
    join threads t on t.id = c.thread_id
    where c.derived_from_message_id = :message_id
      and c.account_id = :account_id
      and c.deleted_at is null
    order by c.created_at
    """
)

# The tail, newest first, then reversed by the caller. Reading the whole
# conversation and slicing in Python would pull 40,000 rows on a heavy account
# to use twenty of them.
#
# 020. A message that carried photos reads as its words and the titles of the
# rows those photos became, never as an image again: the picture is read once,
# on its own turn, and the tail carries text (OFF-8).
#
# 019. A message written for a tapped answer whose label was a calendar
# somebody else named carries `derived_from_untrusted`, and what the prompt
# reads of it is that they picked a shared calendar, never the words its owner
# chose. The client draws the real text; the prompt does not.
_TURNS = text(
    """
    select m.role,
           case when m.derived_from_untrusted
                then '(picked a calendar shared with them)'
                else said(m.text, m.transcript) end as text,
           (select count(*) from blobs b
             where b.message_id = m.id and b.kind = 'image' and b.deleted_at is null) as photos,
           (select string_agg(c.title, ', ' order by c.created_at)
              from content c
             where c.derived_from_message_id = m.id
               and c.deleted_at is null
               and exists (select 1 from content_blobs cb where cb.content_id = c.id)
           ) as photo_titles
    from messages m
    where m.conversation_id = :conversation_id
      and m.account_id = :account_id
      and m.deleted_at is null
      and (said(m.text, m.transcript) is not null
           or exists (select 1 from blobs b
                       where b.message_id = m.id and b.kind = 'image' and b.deleted_at is null))
      and m.id <> :exclude_id
    order by m.created_at desc
    limit :limit
    """
)

# 020. The photos on the dump, in the order they were attached. 021: the
# voice note on the same message is not one of them.
_PHOTOS = text(
    """
    select b.id
    from blobs b
    join messages m on m.id = b.message_id
    where b.message_id = :message_id
      and m.account_id = :account_id
      and b.kind = 'image'
      and b.deleted_at is null
    order by b.created_at, b.id
    """
)

# 021. The voice note on the dump, if any: enough to know whether the words
# exist yet and whether a retry can poll the provider rather than upload.
_VOICE = text(
    """
    select b.id, b.message_id, b.provider_ref, m.transcribed_at is not null as transcribed
    from blobs b
    join messages m on m.id = b.message_id
    where b.message_id = :message_id
      and b.kind = 'audio'
      and b.deleted_at is null
    limit 1
    """
)


@dataclass(frozen=True)
class Voice:
    """021. The voice note a message carries, as the worker needs it."""

    blob_id: str
    message_id: str
    provider_ref: str | None
    transcribed: bool


async def voice_of(conn: AsyncConnection, *, message_id: str) -> Voice | None:
    row = (await conn.execute(_VOICE, {"message_id": message_id})).first()
    if row is None:
        return None
    return Voice(
        blob_id=str(row.id),
        message_id=str(row.message_id),
        provider_ref=row.provider_ref,
        transcribed=bool(row.transcribed),
    )


def turn_text(text_: str | None, photos: int, photo_titles: str | None) -> str:
    """How a message reads in the tail: its words, then its photos as a count
    and the titles they became."""
    words = text_ or ""
    if not photos:
        return words
    noun = "photo" if photos == 1 else "photos"
    tail = f"({photos} {noun}: {photo_titles})" if photo_titles else f"({photos} {noun})"
    return f"{words} {tail}".strip()


# The dump, and the thread it was typed in front of.
#
# The join re-resolves membership rather than trusting the stored id. The id was
# checked when it was written, and the person may have left the thread since; a
# name that reaches a prompt should be one they can still see today.
_DUMP = text(
    """
    select said(m.text, m.transcript) as text,
           m.transcribed_at is not null as spoken,
           lt.id as looking_at_id,
           lt.name as looking_at_name
    from messages m
    left join threads lt
      on lt.id = m.looking_at_thread_id
     and lt.deleted_at is null
     and exists (
       select 1 from thread_members mm
       where mm.thread_id = lt.id
         and mm.account_id = m.account_id
         and mm.state = 'accepted'
     )
    where m.id = :message_id
      and m.account_id = :account_id
      and m.deleted_at is null
    """
)

# The database's clock, not the worker's. Two workers in two regions must not
# disagree about what day it is with each other or with the rows they read.
# `accounts` has no timezone column yet, so this is UTC and the day boundary is
# wrong for somebody dumping at 11pm in Lisbon; when a timezone lands, this
# query is the one place that changes.
_TODAY = text("select to_char(now(), 'FMDay FMDD FMMonth YYYY')")


async def load(
    conn: AsyncConnection,
    *,
    account_id: str,
    conversation_id: str,
    message_id: str,
    max_turns: int,
    max_threads: int,
) -> DumpContext | None:
    """Everything the prompt needs, already bounded.

    Every query is filtered by account_id, including the ones that look like
    they do not need it: conversation_id is enough to find the rows, and is not
    enough to prove they are this account's. A missing filter here does not
    mis-serve a page, it puts one person's text into another person's model
    call.
    """
    dump_row = (
        await conn.execute(_DUMP, {"message_id": message_id, "account_id": account_id})
    ).first()
    if dump_row is None:
        return None
    # 020. A photo with no words is a dump. Nothing else without words is.
    photo_rows = (
        await conn.execute(_PHOTOS, {"message_id": message_id, "account_id": account_id})
    ).all()
    if not dump_row.text and not photo_rows:
        return None

    thread_rows = (
        await conn.execute(_THREADS, {"account_id": account_id, "limit": max_threads})
    ).all()

    default_row = (await conn.execute(_DEFAULT_THREAD, {"account_id": account_id})).first()
    default_id = str(default_row.id) if default_row else None

    landed_rows = (
        await conn.execute(_LANDED, {"message_id": message_id, "account_id": account_id})
    ).all()

    threads = [
        Thread(id=str(r.id), name=r.name, is_default=str(r.id) == default_id) for r in thread_rows
    ]
    # The default thread is always offered, even when it is too stale to make
    # the cap. It is where anything with no obvious home goes, so a prompt
    # missing it has no answer for the commonest case.
    if default_row is not None and not any(t.is_default for t in threads):
        threads.append(Thread(id=default_id, name=default_row.name, is_default=True))

    turn_rows = (
        await conn.execute(
            _TURNS,
            {
                "conversation_id": conversation_id,
                "account_id": account_id,
                "exclude_id": message_id,
                "limit": max_turns,
            },
        )
    ).all()

    today = (await conn.execute(_TODAY)).scalar_one()
    has_calendar = bool((await conn.execute(_HAS_CALENDAR, {"account_id": account_id})).scalar())
    switches = (await conn.execute(_MAY_REACH, {"account_id": account_id})).first()

    return DumpContext(
        dump=dump_row.text or "",
        turns=[
            Turn(role=r.role, text=turn_text(r.text, int(r.photos or 0), r.photo_titles))
            for r in reversed(turn_rows)
        ],
        photos=[Photo(blob_id=str(r.id), index=at + 1) for at, r in enumerate(photo_rows)],
        spoken=bool(dump_row.spoken),
        threads=threads,
        landed=[Filed(title=r.title, thread_name=r.thread_name) for r in landed_rows],
        default_thread_id=default_id,
        looking_at=(
            Thread(
                id=str(dump_row.looking_at_id),
                name=dump_row.looking_at_name,
                is_default=str(dump_row.looking_at_id) == default_id,
            )
            if dump_row.looking_at_id
            else None
        ),
        today=today,
        has_calendar=has_calendar,
        may_search=bool(switches and switches.web_search_enabled),
        may_read_links=bool(switches and switches.web_links_enabled),
        country=(switches.country if switches else None),
    )


# Four characters a token is the usual rough figure for English. Deliberately
# approximate: this is a guard rail, not an accounting boundary, and the exact
# count comes back from the API afterwards for the ledger.
def approx_tokens(s: str) -> int:
    return len(s) // 4 + 1


def fit(ctx: DumpContext, ceiling: int) -> DumpContext:
    """Drop context until the prompt fits, oldest turns first, then threads.

    The dump itself is never dropped. If someone's dump alone exceeds the
    ceiling it goes anyway: the API's own limit is the backstop, and answering a
    long dump badly beats refusing to answer it at all after we already accepted
    and stored it.
    """
    turns = list(ctx.turns)
    threads = list(ctx.threads)

    def total() -> int:
        return (
            approx_tokens(ctx.dump)
            + sum(approx_tokens(t.text) for t in turns)
            # A uuid is 36 characters and travels with every thread now, so the
            # estimate counts it rather than pretending a thread costs its name.
            + sum(approx_tokens(t.name) + 10 for t in threads)
            + sum(approx_tokens(f.title) + approx_tokens(f.thread_name) for f in ctx.landed)
            + (approx_tokens(str(ctx.answered)) if ctx.answered else 0)
        )

    while total() > ceiling and turns:
        turns.pop(0)
    # Never the default thread, however tight it gets. Dropping it does not
    # shrink the prompt meaningfully and it removes the only answer the planner
    # has for a dump with no obvious home.
    while total() > ceiling and any(not t.is_default for t in threads):
        for i in range(len(threads) - 1, -1, -1):
            if not threads[i].is_default:
                threads.pop(i)
                break

    # `landed` is never dropped. It is what stops a resume filing a second copy
    # of something already in a thread, and a prompt that fits by forgetting
    # that is worse than one that is slightly too long.
    return DumpContext(
        dump=ctx.dump,
        turns=turns,
        threads=threads,
        landed=ctx.landed,
        default_thread_id=ctx.default_thread_id,
        # Not a candidate for trimming. It is one short line, and it is the line
        # that decides where things land.
        looking_at=ctx.looking_at,
        today=ctx.today,
        has_calendar=ctx.has_calendar,
        # **Not context, and not trimmable.** These two are permissions, and
        # they were missing here: this function rebuilds the context field by
        # field, so anything it does not name silently takes its default, and
        # both of these default to False. Every dump therefore ran with the web
        # switched off while the account said it was on, the tool was offered
        # because `may_look_up` was read from the unfitted context, and the call
        # came back "searching is switched off" with nothing logged.
        #
        # A rebuild that drops a field is the same defect as a `select *` view
        # that does not follow its table, and this is the fourth time this repo
        # has met that shape. If a new field is added to `DumpContext`, it has
        # to be added here too.
        may_search=ctx.may_search,
        may_read_links=ctx.may_read_links,
        country=ctx.country,
        answered=ctx.answered,
        # 020. Never dropped and never counted here: the ten-photo cap is the
        # bound, and a photo dropped from the prompt is a photo filed blind.
        photos=ctx.photos,
        spoken=ctx.spoken,
    )


def fit_answer(ctx: "AnswerContext", ceiling: int) -> "AnswerContext":
    """018. The answering path's tail, under the same ceiling as filing.

    Oldest turns first, the question itself never. Threads stay: they are the
    only thing an answer can address and there are at most twelve. Every field
    is named here for the reason `fit` names every field.
    """
    turns = list(ctx.turns)
    notes = list(ctx.looking_at_notes)

    def total() -> int:
        return (
            approx_tokens(ctx.question)
            + sum(approx_tokens(t.text) for t in turns)
            + sum(approx_tokens(t.name) + 10 for t in ctx.threads)
            + sum(approx_tokens(n) for n in notes)
        )

    while total() > ceiling and turns:
        turns.pop(0)
    # The thread's notes go after the tail, oldest first, and the thread itself
    # stays: it is one name, and it is the fact the country question turns on.
    while total() > ceiling and notes:
        notes.pop(0)

    return AnswerContext(
        question=ctx.question,
        threads=ctx.threads,
        has_calendar=ctx.has_calendar,
        may_search=ctx.may_search,
        may_read_links=ctx.may_read_links,
        country=ctx.country,
        today=ctx.today,
        turns=turns,
        country_override=ctx.country_override,
        looking_at=ctx.looking_at,
        looking_at_notes=notes,
    )


# ---------------------------------------------------------------- quick add
#
# A row somebody typed straight into a thread, with the + on a section heading.
# The thread is already chosen, so none of the account-wide context a dump needs
# applies: no thread list, no conversation, no default thread. What replaces it
# is the one thread's own contents and its standing rules, which is what
# "grounded in the thread" means.


@dataclass(frozen=True)
class Piece:
    """One thing already in the thread, so offload does not file a second copy
    of something that is there and can match how the others are written."""

    title: str
    done: bool


@dataclass(frozen=True)
class QuickAddContext:
    content_id: str
    thread_id: str
    thread_name: str
    typed: str
    notes: list[str]
    notes_from_members: list[str]
    pieces: list[Piece]
    today: str | None = None


_TYPED = text(
    """
    select c.id, c.title, c.thread_id, t.name as thread_name,
           to_char(now(), 'FMDay FMDD FMMonth YYYY') as today
      from content c
      join threads t on t.id = c.thread_id
     where c.id = :content_id
       and c.account_id = :account_id
       and c.deleted_at is null
    """
)

# Membership, not authorship: a shared thread's contents are everybody's, and
# the person typing is a member or the write would not have happened.
_PIECES = text(
    """
    select c.title, c.done_at is not null as done
      from content c
     where c.thread_id = :thread_id
       and c.id <> :content_id
       and c.deleted_at is null
       and c.archived_at is null
     order by c.created_at desc
     limit :limit
    """
)

# Is there a calendar to talk to at all. One row or none; the tools are sent
# only when there is, so an account with no connector never pays for their
# definitions and is never offered a tool that can only fail.
# The two switches, read from the account on every turn.
#
# **Authorization, so it is read here rather than passed in.** A flag on the job
# payload would be a value some other process decided, and the rule is that the
# server decides (SEC-2). This is one indexed read on a row the turn is about to
# touch anyway.
#
# **No `deleted_at` filter, and that is not an oversight.** This role holds
# column-level select on `accounts`, three columns since 0010 and five now, and
# a column named in a where clause needs the grant as much as one in the select
# list. The other account queries here filter it for the same reason: a turn
# whose account has gone is a turn whose message is already gone, and `_DUMP`
# checks that.
_MAY_REACH = text(
    """
    select web_search_enabled, web_links_enabled, country
      from accounts
     where id = :account_id
    """
)

# 019. Any approved calendar on the account. The tools are sent whenever there
# is one: in a thread they read through the calendars it picked, which may be
# none, and a write from a thread with none is what raises the question that
# picks one. From Today every approved calendar is in reach. Scoping the tools
# to the thread's picks would leave a thread with none unable to ask.
_HAS_CALENDAR = text(
    """
    select 1
      from connector_calendars c
      join connector_connections n on n.id = c.connection_id
     where n.account_id = :account_id
       and n.deleted_at is null
       and c.selected
     limit 1
    """
)

# Newest first for the budget, since what is current has to survive it, and the
# caller reverses them so the model reads them in the order they were written.
# `superseded_at` is filtered because the daily job sets it on what a thread no
# longer says.
_THREAD_NOTES = text(
    """
    select n.text, (n.account_id = :account_id) as theirs
      from notes n
     where n.scope = 'thread'
       and n.subject_id = :thread_id
       and n.deleted_at is null
       and n.superseded_at is null
       and n.muted_at is null
       and not n.derived_from_untrusted
     order by n.updated_at desc
     limit 100
    """
)


async def load_quick_add(
    conn: AsyncConnection,
    *,
    account_id: str,
    content_id: str,
    max_pieces: int = 30,
) -> QuickAddContext | None:
    """The one thread, and the row that was typed into it.

    Filtered by account_id like everything else here: the content id is enough
    to find the row and not enough to prove it is this account's, and a missing
    filter puts one person's thread into another person's model call.
    """
    row = (await conn.execute(_TYPED, {"content_id": content_id, "account_id": account_id})).first()
    if row is None or not row.title:
        return None

    pieces = (
        await conn.execute(
            _PIECES,
            {"thread_id": row.thread_id, "content_id": content_id, "limit": max_pieces},
        )
    ).all()
    notes = (
        await conn.execute(_THREAD_NOTES, {"thread_id": row.thread_id, "account_id": account_id})
    ).all()

    return QuickAddContext(
        content_id=str(row.id),
        thread_id=str(row.thread_id),
        thread_name=row.thread_name,
        typed=row.title,
        # **Split the way `notesForPrompt` splits it.** A note another member
        # of a shared thread wrote is read and weighed, not obeyed; giving it
        # the same standing as your own here would leave the one surface where
        # 014's containment does not apply.
        notes=[n.text for n in reversed(notes) if n.theirs],
        notes_from_members=[n.text for n in reversed(notes) if not n.theirs],
        pieces=[Piece(title=p.title, done=p.done) for p in pieces],
        today=row.today,
    )


@dataclass(frozen=True)
class AnswerContext:
    """What a question turn is shown before it reads anything.

    Deliberately thin. A dump's context carries what already landed and the
    conversation so far; a question carries the question and the threads it
    might name, and everything else it wants it goes and reads. That keeps the
    prompt a constant rather than a function of account age (OFF-8), and it is
    why there is no conversation tail here: the reads are the memory.
    """

    question: str
    threads: list[Thread]
    has_calendar: bool
    # The same two switches, read the same way. "Will it rain on Saturday" is an
    # answering turn, so a web tool offered only on the filing path answers half
    # the questions this feature exists for.
    may_search: bool = False
    may_read_links: bool = False
    #: Where they said they are, ISO 3166-1 alpha-2, or None when they have not
    #: said. **None is a real answer**: offload tells the model it does not know
    #: rather than letting a search assume, which is how "when is the next bank
    #: holiday" came back with Columbus Day.
    country: str | None = None
    #: What day it is, for the reader and for a date in the question. It was
    #: missing here while the worker already read it: a frozen dataclass turns
    #: that into an AttributeError on every answering turn.
    today: str | None = None
    #: 018. The same tail the filing turn sees, oldest first. A question and
    #: its answer are conversation, and an answer that cannot see them cannot
    #: use them. Bounded by `fit_answer`.
    turns: list[Turn] = field(default_factory=list)
    #: 018. The country they picked when asked, in place of the account's.
    country_override: str | None = None
    #: 018. The thread the question was asked from, with its notes, so a
    #: question whose answer depends on where they are can see that the thread
    #: puts them somewhere other than the account says. None from Today.
    looking_at: Thread | None = None
    looking_at_notes: list[str] = field(default_factory=list)

    @property
    def may_look_up(self) -> bool:
        return self.may_search or self.may_read_links

    @property
    def country_in_effect(self) -> str | None:
        return self.country_override or self.country


async def load_answer(
    conn: AsyncConnection,
    *,
    account_id: str,
    question: str,
    max_threads: int,
    conversation_id: str | None = None,
    message_id: str | None = None,
    max_turns: int = 0,
    country_override: str | None = None,
) -> AnswerContext:
    """The thread list, the day, and since 018 the conversation's tail.

    The same queries the dump context uses, because a thread list or a tail
    that differed between filing and answering would be two ideas of what a
    person has.
    """
    thread_rows = (
        await conn.execute(_THREADS, {"account_id": account_id, "limit": max_threads})
    ).all()

    # **`_THREADS` does not select `is_default` and never did.** It selects id
    # and name. Reading `row.is_default` off the result raises rather than
    # returning None, and `_handle_answer` catches everything, so the whole
    # feature came back "failed" for any account with a thread while looking
    # like a model problem. Which thread is the default is a separate read here
    # exactly as it is in `load`, and comparing ids is the only way to know.
    default_row = (await conn.execute(_DEFAULT_THREAD, {"account_id": account_id})).first()
    default_id = str(default_row.id) if default_row else None

    threads = [
        Thread(id=str(r.id), name=r.name, is_default=str(r.id) == default_id) for r in thread_rows
    ]
    # Always offered, even when too stale to make the cap: it is where anything
    # with no obvious home lives, so a question about "that thing I saved" has
    # nowhere to look without it.
    if default_row is not None and not any(t.is_default for t in threads):
        threads.append(Thread(id=default_id, name=default_row.name, is_default=True))

    switches = (await conn.execute(_MAY_REACH, {"account_id": account_id})).first()
    today = (await conn.execute(_TODAY)).scalar_one()

    turn_rows = []
    if conversation_id and message_id and max_turns > 0:
        turn_rows = (
            await conn.execute(
                _TURNS,
                {
                    "conversation_id": conversation_id,
                    "account_id": account_id,
                    "exclude_id": message_id,
                    "limit": max_turns,
                },
            )
        ).all()

    # 018. Where the question was asked from, resolved the way a dump's is:
    # membership re-checked, deleted threads dropped. Its own notes only, the
    # same split `load` makes, because a note another member wrote is not this
    # person's statement of where they are.
    looking_at: Thread | None = None
    looking_at_notes: list[str] = []
    if message_id:
        dump_row = (
            await conn.execute(_DUMP, {"message_id": message_id, "account_id": account_id})
        ).first()
        if dump_row is not None and dump_row.looking_at_id:
            looking_at = Thread(
                id=str(dump_row.looking_at_id),
                name=dump_row.looking_at_name,
                is_default=str(dump_row.looking_at_id) == default_id,
            )
            note_rows = (
                await conn.execute(
                    _THREAD_NOTES,
                    {"thread_id": str(dump_row.looking_at_id), "account_id": account_id},
                )
            ).all()
            looking_at_notes = [n.text for n in reversed(note_rows) if n.theirs]

    calendar = await conn.execute(_HAS_CALENDAR, {"account_id": account_id})

    return AnswerContext(
        question=question,
        threads=threads,
        has_calendar=bool(calendar.scalar()),
        may_search=bool(switches and switches.web_search_enabled),
        may_read_links=bool(switches and switches.web_links_enabled),
        country=(switches.country if switches else None),
        today=today,
        turns=[Turn(role=r.role, text=r.text) for r in reversed(turn_rows)],
        country_override=country_override,
        looking_at=looking_at,
        looking_at_notes=looking_at_notes,
    )


_QUESTION = text(
    """
    select said(text, transcript) from messages
    where id = :message_id and role = 'person' and deleted_at is null
    """
)


async def question_text(conn: AsyncConnection, *, message_id: str) -> str | None:
    """What they actually typed, for the question-or-note call.

    The message alone, with no thread list and no conversation: the decision is
    made on the text and nothing else, so that the same sentence always lands
    the same way whatever the corpus happens to hold that day.
    """
    row = (await conn.execute(_QUESTION, {"message_id": message_id})).scalar()
    return row.strip() if isinstance(row, str) and row.strip() else None


_PHOTO_COUNT = text(
    """
    select count(*) from blobs
    where message_id = :message_id and kind = 'image' and deleted_at is null
    """
)


async def photo_count(conn: AsyncConnection, *, message_id: str) -> int:
    """020. How many photos the message carries, before anything is loaded.

    A message with a photo on it files, whatever its words: the answering
    path never sees a picture, and the picture has to land somewhere. So the
    classifier is not consulted, and "what is this?" with a photo is a dump
    whose row describes the picture.
    """
    row = (await conn.execute(_PHOTO_COUNT, {"message_id": message_id})).scalar()
    return int(row or 0)


# ---------------------------------------------------------------- 018 questions

_OPEN_QUESTION = text(
    """
    select q.id, q.field, q.text, q.options, q.state, said(m.text, m.transcript) as asked_about
    from questions q
    left join messages m on m.id = q.message_id
    where q.id = :question_id and q.account_id = :account_id
    """
)


async def today_line(conn: AsyncConnection) -> str:
    """What day it is, as the prompt says it."""
    return str((await conn.execute(_TODAY)).scalar_one())


@dataclass(frozen=True)
class OpenQuestion:
    id: str
    field: str
    text: str
    options: list[dict]
    #: What the person dumped that led to the question, for a country re-run.
    asked_about: str | None


async def open_question(
    conn: AsyncConnection, *, question_id: str, account_id: str, require_open: bool = True
) -> OpenQuestion | None:
    """The question a typed message may be answering. Scoped to the account,
    and by default only while it is open: a question closed on another device
    is not one this message can answer. A country re-run reads an answered one."""
    row = (
        await conn.execute(_OPEN_QUESTION, {"question_id": question_id, "account_id": account_id})
    ).first()
    if row is None or (require_open and row.state != "open"):
        return None
    options = row.options if isinstance(row.options, list) else []
    return OpenQuestion(
        id=str(row.id),
        field=row.field,
        text=row.text,
        options=[o for o in options if isinstance(o, dict)],
        asked_about=row.asked_about,
    )
