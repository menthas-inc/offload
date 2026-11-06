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

import asyncio
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from sqlalchemy import TextClause, text
from sqlalchemy.ext.asyncio import AsyncConnection

from offload_agent.found import MAX_FOUND, gather

log = structlog.get_logger()


@dataclass(frozen=True)
class Turn:
    role: str
    text: str


@dataclass(frozen=True)
class LabelRef:
    """025. A label in one of their threads, by id. The name was written by a
    person or by offload, and the prompt carries it as data."""

    id: str
    thread_id: str
    name: str


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
    #: 038. Somebody else is in it. A memory never changes the words of what
    #: is filed into a shared thread, and the list says which ones are.
    shared: bool = False


#: A query's vector in pgvector's text form, or None when there is none in time.
Embedder = Callable[[str], Awaitable[str | None]]


@dataclass(frozen=True)
class Memory:
    """038. Something offload knows about the person across their threads.

    The text is the person's own words reworded, or offload's from what they
    said, and reaches the prompt as data; a `rules` memory is their standing
    instruction, in their words, and only they make one.
    """

    id: str
    kind: str
    text: str
    #: 040. stated, answered or learned: the pass folds only learned ones.
    origin: str = "stated"


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
class Pdf:
    """041. A PDF the message carries, as the model will read it.

    `index` is one-based among the message's PDFs, in the order they were
    attached, and it is how `add_content` names one. `cut` is the clean copy's
    first ten pages, filled by the worker, and None for a PDF it could not
    make safe. `picture` is page 1's large JPEG, sent instead when the request
    bound left no room for even one page. `clean` and `large` are the worker's
    own copies, held for the bound and never sent.
    """

    blob_id: str
    index: int
    pages: int
    cut: bytes | None = None
    picture: bytes | None = None
    clean: bytes | None = field(default=None, repr=False)
    large: bytes | None = field(default=None, repr=False)
    #: 044. http(s) links the PDF carried, harvested by the worker's child and
    #: held only for this turn. The model offers at most two of them by number.
    candidates: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Found:
    """050. One destination the turn may offer, numbered by its place in the
    turn's set. `origin` is where it was gathered (`pdf:<n>`, `dump` or
    `mail`) and holds a PDF's entry to that PDF's row; `source` and `sender`
    are what the confirm says it came from."""

    dest: str
    origin: str
    source: str
    sender: str | None = None


@dataclass(frozen=True)
class Mail:
    """026. A forwarded email, as the turn reads it.

    The stored text is whole (OFF-1); this is the bounded copy (OFF-8). The
    note is the person's own words; the forwarded part is somebody else's,
    with the reply history below it trimmed and clamped. `links` is what a
    fetched URL has to appear in: the note alone, because a link in somebody
    else's email can confirm, cancel or unsubscribe by being opened.
    """

    subject: str
    from_name: str | None
    from_address: str
    sent_at: str | None
    note: str
    forwarded: str
    left_out: dict[str, int]

    @property
    def links(self) -> str:
        return self.note

    @property
    def dump(self) -> str:
        """What the rest of the turn treats as the dump: both parts, bounded."""
        return "\n\n".join(part for part in (self.note, self.forwarded) if part)


#: The forwarded part the turn reads, and the note, in characters.
MAIL_BODY_CHARS = 12_000
MAIL_NOTE_CHARS = 2_000

_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]+")


def _line(value: str | None, limit: int) -> str:
    """One line, no control characters and no quotes, clamped: these go into
    a label we write, and none of them was written by offload."""
    cleaned = (
        _CONTROL.sub(" ", value or "").replace('"', "").replace("\u201c", "").replace("\u201d", "")
    )
    return " ".join(cleaned.split())[:limit]


def mail_of(text: str, attrs: dict) -> Mail:
    note_length = max(0, int(attrs.get("noteLength") or 0))
    history_at = attrs.get("historyAt")
    end = (
        int(history_at) if isinstance(history_at, int) and history_at >= note_length else len(text)
    )
    return Mail(
        subject=_line(attrs.get("subject"), 300),
        from_name=_line(attrs.get("fromName"), 120) or None,
        from_address=_line(attrs.get("fromAddress"), 320),
        sent_at=attrs.get("sentAt"),
        note=text[:note_length].strip()[:MAIL_NOTE_CHARS],
        forwarded=text[note_length:end].strip()[:MAIL_BODY_CHARS],
        left_out={k: int(v) for k, v in (attrs.get("leftOut") or {}).items()},
    )


@dataclass(frozen=True)
class ThreadNote:
    text: str
    #: ISO, as the Core API dates a note in a filing's result.
    written_at: str


@dataclass(frozen=True)
class ThreadNotes:
    """The three lists a filing's result carries, split the way the Core API's
    `notesForPrompt` splits them: theirs, other members', and those derived
    from a connected app. The split is the containment."""

    yours: list[ThreadNote] = field(default_factory=list)
    members: list[ThreadNote] = field(default_factory=list)
    from_apps: list[ThreadNote] = field(default_factory=list)


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
    #: 041. The PDFs on this message, in order. Outside the text budget like
    #: photos: two at most, ten pages each, is the bound.
    pdfs: list[Pdf] = field(default_factory=list)
    #: 021. The dump holds a transcript: its words were spoken and written
    #: down, and the label says so.
    spoken: bool = False
    #: 026. A forwarded email, bounded. None for everything else.
    mail: Mail | None = None
    # The thread that was on screen when this was dumped, if any.
    #
    # A default, not a destination. Somebody typing into the composer from
    # inside a thread means that thread nearly every time, and the prompt says
    # so, but words naming another thread override it.
    looking_at: Thread | None = None
    #: 025. The labels in the threads above, at most `LABELS_IN_PROMPT`.
    labels: list[LabelRef] = field(default_factory=list)
    # "Friday 3 October 2026", from the database's clock rather than the
    # worker's, so every worker in every region agrees with the rows it reads,
    # in the device's zone when the message carries one.
    today: str | None = None
    #: The device's IANA zone from the message, or None for UTC. The prompt
    #: names it beside today so a clock time they give is written as the
    #: right moment. Per message until the account carries one.
    time_zone: str | None = None
    #: 022. Whether this account has a connection at all, which decides
    #: whether the share tool is sent, for the reason the calendar tools are.
    has_connections: bool = False
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
    #: 034. The owner's map switch, read beside the two above. The worker's own
    #: `cfg.maps_on` still has to agree before a page is read for a place.
    maps_on: bool = True
    #: Where they said they are, ISO 3166-1 alpha-2, or None when they have not
    #: said. **None is a real answer**: offload tells the model it does not know
    #: rather than letting a search assume, which is how "when is the next bank
    #: holiday" came back with Columbus Day.
    country: str | None = None
    #: 018. A typed message answered the open question before this turn ran.
    #: The value is already on the row; the planner files the rest and not
    #: the value again. Never dropped by `fit`.
    answered: dict | None = None
    #: 022. Who an @ in the dump picked, as the Core API vouched for them:
    #: accepted connections only, at most ten. The share tool takes the id.
    mentions: list["Mention"] = field(default_factory=list)
    #: 038. What offload knows about them, at most fifty. Bounded by the query,
    #: never trimmed by `fit`.
    memories: list[Memory] = field(default_factory=list)
    #: Above fifty the memories were chosen for this turn's words, so they
    #: change every turn and sit after the cache mark rather than before it.
    memories_by_query: bool = False
    #: The notes of the thread on screen, loaded with the turn so a rule there
    #: applies to the first filing rather than to an edit after it. None when
    #: there is no thread on screen or they were not loaded; then a filing's
    #: result is the only place they arrive. Bounded as a result's are.
    looking_at_notes: ThreadNotes | None = None

    @property
    def may_look_up(self) -> bool:
        return self.may_search or self.may_read_links

    def found_set(self) -> list[Found]:
        """050. What the turn may offer, in one numbering: each PDF's entries
        (044's harvest), then the dump's own words, a mail's note before its
        forwarded part. Deduped by destination, the first origin kept. A
        picture's words are never here; its row quotes them (`found_in`)."""
        out: list[Found] = []
        seen: set[str] = set()

        def add(dest: str, origin: str, source: str, sender: str | None = None) -> None:
            if dest not in seen:
                seen.add(dest)
                out.append(Found(dest, origin, source, sender))

        for pdf in self.pdfs:
            for dest in pdf.candidates[:MAX_FOUND]:
                add(dest, f"pdf:{pdf.index}", "pdf")
        if self.mail is not None:
            local, at, host = self.mail.from_address.rpartition("@")
            host = host.strip().lower()
            sender = host if at and local and 0 < len(host) <= 255 else None
            words = [*gather(self.mail.note), *gather(self.mail.forwarded)]
            for dest in words[:MAX_FOUND]:
                add(dest, "mail", "mail", sender)
        elif self.dump:
            for dest in gather(self.dump, spoken=self.spoken):
                add(dest, "dump", "voice" if self.spoken else "typed")
        return out


@dataclass(frozen=True)
class Mention:
    account_id: str
    name: str


# Resolved through thread_members, which is the only path there is: `threads`
# has no owner column at all, by design, because a thread has members and the
# creator is simply the first one. Filtering by anything else would either hide
# a shared thread from a member or show one to somebody who is not (OFF-3).
#: 025. Labels offered to a filing turn, across the threads it is shown: ten
#: per thread at most, so this bounds the block rather than any one thread,
#: and it does not grow with the age of the account (OFF-8).
LABELS_IN_PROMPT = 60

# The labels of the threads a turn is shown, the one on screen first, then in
# the order the threads are listed. The threads are already the account's own.
_LABELS = text(
    """
    select l.id::text as id, l.thread_id::text as thread_id, l.name as name
      from labels l
     where l.thread_id = any(cast(:thread_ids as uuid[]))
       and l.deleted_at is null
     order by array_position(cast(:thread_ids as uuid[]), l.thread_id), l.created_at
     limit :limit
    """
)

_THREADS = text(
    """
    select t.id, t.name,
           exists (select 1 from thread_members o
                    where o.thread_id = t.id and o.account_id <> :account_id
                      and o.state = 'accepted') as shared
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
    select c.title,
           -- 028. The default thread's stored name never reaches the model.
           case when t.id = (select default_thread_id from accounts where id = :account_id)
                then 'not in a thread' else t.name end as thread_name
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
#
# 026, amended 2026-10-15. An earlier forwarded email reads as a line we write
# and how many rows it filed, never its body, and never their titles either:
# the model wrote those from the body, so they are its author's words too.
# Its body is somebody else's words, labelled as such only on the turn it
# arrived on; here it read as `person:`, so a second email forwarded minutes
# later filed the first one again, and anything written inside it reached
# later turns as the person's own request (SEC-1). And only what came before
# the turn's own message: an email that arrived after a message but before
# its job ran was in its tail. A message from a calendar or the browser is
# somebody else's words the same way, and the other untrusted readers already
# leave out all four sources.
_TURNS = text(
    """
    select m.role,
           case when m.derived_from_untrusted
                then '(picked a calendar shared with them)'
                when m.source in ('mail', 'gmail')
                then '(forwarded an email'
                     || coalesce(', filed ' || (
                          select nullif(count(*), 0)::text
                            from content c
                           where c.derived_from_message_id = m.id
                             and c.account_id = :account_id
                             and c.deleted_at is null), '')
                     || ')'
                when m.source in ('calendar', 'browser')
                then '(added from somewhere else)'
                else said(m.text, m.transcript) end as text,
           (select count(*) from blobs b
             where b.message_id = m.id and b.kind = 'image' and b.deleted_at is null) as photos,
           (select count(*) from blobs b
             where b.message_id = m.id and b.kind = 'pdf' and b.deleted_at is null) as pdfs,
           (select string_agg(c.title, ', ' order by c.created_at)
              from content c
             where c.derived_from_message_id = m.id
               and m.source not in ('mail', 'gmail', 'calendar', 'browser')
               and c.deleted_at is null
               and exists (select 1 from content_blobs cb where cb.content_id = c.id)
           ) as photo_titles
    from messages m
    where m.conversation_id = :conversation_id
      and m.account_id = :account_id
      and m.deleted_at is null
      and (said(m.text, m.transcript) is not null
           or exists (select 1 from blobs b
                       where b.message_id = m.id and b.kind in ('image', 'pdf')
                         and b.deleted_at is null))
      and (m.created_at, m.id) < (select x.created_at, x.id from messages x
                                   where x.id = :exclude_id)
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

# 041. The PDFs on the dump, in the order they were attached, numbered among
# themselves.
_PDFS = text(
    """
    select b.id, b.pages
    from blobs b
    join messages m on m.id = b.message_id
    where b.message_id = :message_id
      and m.account_id = :account_id
      and b.kind = 'pdf'
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


def turn_text(text_: str | None, photos: int, photo_titles: str | None, pdfs: int = 0) -> str:
    """How a message reads in the tail: its words, then its photos and PDFs
    (041) as counts and the titles they became. Never a picture or a page."""
    words = text_ or ""
    counts = [
        f"{n} {noun if n == 1 else noun + 's'}"
        for n, noun in ((photos, "photo"), (pdfs, "PDF"))
        if n
    ]
    if not counts:
        return words
    what = ", ".join(counts)
    tail = f"({what}: {photo_titles})" if photo_titles else f"({what})"
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
           m.time_zone,
           a.time_zone as account_time_zone,
           m.attrs->'mentions' as mentions,
           case when m.source = 'mail' then m.attrs->'mail' end as mail,
           -- 040. Whether the words are the person's own, for the memory query.
           -- A mail message's are its note alone, read from `mail` above.
           (m.source = 'person' and not m.derived_from_untrusted) as own_words,
           lt.id as looking_at_id,
           case when lt.id = a.default_thread_id then 'not in a thread' else lt.name end
             as looking_at_name
    from messages m
    join accounts a on a.id = m.account_id
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
#
# **In the account's clock since 023, and the device's before it.** The
# account has one zone, set at first run and changed only by the person, and
# every timed date is drawn in it; reading "3pm" in the same zone it is drawn
# in is what keeps what somebody typed and what they see the same. A message
# from an account with no clock yet is read in the zone the device named,
# and one with neither is read in UTC, which put a day boundary at 1am for
# somebody in Lisbon and is what every message before 2026-09-20 was. Postgres
# knows the same IANA names ICU does, and the API checked the name before
# storing it, so an unknown one here is a fault worth a fallback rather than
# a refusal.
_TODAY = text("select to_char(now() at time zone :tz, 'FMDay FMDD FMMonth YYYY')")

UTC = "UTC"


def clock_zone(account_zone: str | None, message_zone: str | None) -> str | None:
    """The zone a dump is read in: where the device was when it was sent, else
    the account's clock. "Tomorrow" on a trip is the trip's tomorrow."""
    return message_zone or account_zone or None


def known_zone(time_zone: str | None) -> str:
    """The zone to read the clock in: theirs when Python's tzdata knows the
    name, else UTC. Checked here rather than by letting Postgres refuse it,
    because a refused statement aborts the connection's transaction and every
    query after it on that connection, the fallback included: the first
    version of this fell back inside the aborted transaction and would have
    raised a worse error in place of the one it was catching. Python and
    Postgres read the same IANA names, so a name that passes here is one
    Postgres knows too."""
    if not time_zone or time_zone == UTC:
        return UTC
    try:
        ZoneInfo(time_zone)
    except (ZoneInfoNotFoundError, ValueError):
        log.warning("time zone unknown here, reading today in UTC")
        return UTC
    return time_zone


async def today_in(conn: AsyncConnection, time_zone: str | None) -> str:
    """What day it is where they are, as the prompt says it."""
    return str((await conn.execute(_TODAY, {"tz": known_zone(time_zone)})).scalar_one())


def clock_line(time_zone: str | None) -> str:
    """How the prompt says which zone today is in, with the offset the clock
    shows there right now, so "3pm" can be written as a moment. The offset on
    another date is the model's arithmetic with the zone's name; the one for
    today keeps it honest about which side of UTC the person is on."""
    zone = known_zone(time_zone)
    if zone == UTC:
        return "in UTC"
    offset = datetime.now(ZoneInfo(zone)).strftime("%z")
    return f"in {zone}, where the clock is UTC{offset[:3]}:{offset[3:]} today"


async def load(
    conn: AsyncConnection,
    *,
    account_id: str,
    conversation_id: str,
    message_id: str,
    max_turns: int,
    max_threads: int,
    embedder: Embedder | None = None,
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
    mail = mail_of(dump_row.text or "", dump_row.mail) if dump_row.mail else None
    # 040. The memory query starts now and runs while the rest is read.
    memory_words = query_words(dump_row.text, mail=mail, trusted=bool(dump_row.own_words))
    memory_query = await start_memory_query(conn, account_id, memory_words, embedder)
    # 020. A photo with no words is a dump. Nothing else without words is.
    photo_rows = (
        await conn.execute(_PHOTOS, {"message_id": message_id, "account_id": account_id})
    ).all()
    # 041. And so is a PDF.
    pdf_rows = (
        await conn.execute(_PDFS, {"message_id": message_id, "account_id": account_id})
    ).all()
    if not dump_row.text and not photo_rows and not pdf_rows:
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
        Thread(id=str(r.id), name=r.name, is_default=str(r.id) == default_id, shared=bool(r.shared))
        for r in thread_rows
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

    zone = clock_zone(dump_row.account_time_zone, dump_row.time_zone)
    today = await today_in(conn, zone)
    shown = ([str(dump_row.looking_at_id)] if dump_row.looking_at_id else []) + [
        t.id for t in threads if not dump_row.looking_at_id or t.id != str(dump_row.looking_at_id)
    ]
    label_rows = (
        (await conn.execute(_LABELS, {"thread_ids": shown, "limit": LABELS_IN_PROMPT})).all()
        if shown
        else []
    )
    has_calendar = bool((await conn.execute(_HAS_CALENDAR, {"account_id": account_id})).scalar())
    has_connections = bool(
        (await conn.execute(_HAS_CONNECTIONS, {"account_id": account_id})).scalar()
    )
    switches = (await conn.execute(_MAY_REACH, {"account_id": account_id})).first()

    looking_at_notes = (
        await notes_on_screen(conn, str(dump_row.looking_at_id), account_id)
        if dump_row.looking_at_id
        else None
    )

    memories, by_query = await memories_chosen(
        conn, account_id, memory_words, embedder, started=memory_query
    )
    return DumpContext(
        dump=mail.dump if mail else (dump_row.text or ""),
        mail=mail,
        turns=[
            Turn(
                role=r.role,
                text=turn_text(r.text, int(r.photos or 0), r.photo_titles, int(r.pdfs or 0)),
            )
            for r in reversed(turn_rows)
        ],
        photos=[Photo(blob_id=str(r.id), index=at + 1) for at, r in enumerate(photo_rows)],
        pdfs=[
            Pdf(blob_id=str(r.id), index=at + 1, pages=int(r.pages or 1))
            for at, r in enumerate(pdf_rows)
        ],
        spoken=bool(dump_row.spoken),
        threads=threads,
        landed=[Filed(title=r.title, thread_name=r.thread_name) for r in landed_rows],
        default_thread_id=default_id,
        labels=[LabelRef(id=r.id, thread_id=r.thread_id, name=r.name) for r in label_rows],
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
        time_zone=zone,
        has_calendar=has_calendar,
        has_connections=has_connections,
        may_search=bool(switches and switches.web_search_enabled),
        may_read_links=bool(switches and switches.web_links_enabled),
        maps_on=bool(switches and switches.maps_on),
        country=(switches.country if switches else None),
        mentions=[
            Mention(account_id=str(m["accountId"]), name=str(m["name"]))
            for m in (dump_row.mentions or [])
            if isinstance(m, dict) and m.get("accountId") and m.get("name")
        ][:10],
        memories=memories,
        memories_by_query=by_query,
        looking_at_notes=looking_at_notes,
    )


#: The Core API's `NOTE_PROMPT_BUDGET`: what one filing's result would carry.
NOTES_ON_SCREEN = 100

# The Core API's `notesForPrompt`, read here so the turn carries what the
# first filing into the thread would have handed back. The thread is the one
# `_DUMP` resolved for this account, membership checked there.
_NOTES_ON_SCREEN = text(
    """
    select n.text, n.updated_at, (n.account_id = :account_id) as theirs,
           n.derived_from_untrusted as from_app
      from notes n
     where n.scope = 'thread'
       and n.subject_id = :thread_id
       and n.deleted_at is null
       and n.superseded_at is null
       and n.muted_at is null
     order by n.updated_at desc
     limit :limit
    """
)


async def notes_on_screen(conn: AsyncConnection, thread_id: str, account_id: str) -> ThreadNotes:
    """Newest first so the budget keeps what is current, then oldest first so
    the newer of two that disagree is the one read last."""
    rows = (
        await conn.execute(
            _NOTES_ON_SCREEN,
            {"thread_id": thread_id, "account_id": account_id, "limit": NOTES_ON_SCREEN},
        )
    ).all()
    out = ThreadNotes()
    for r in reversed(rows):
        note = ThreadNote(text=r.text, written_at=r.updated_at.isoformat())
        if r.from_app:
            out.from_apps.append(note)
        elif r.theirs:
            out.yours.append(note)
        else:
            out.members.append(note)
    return out


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
        time_zone=ctx.time_zone,
        has_calendar=ctx.has_calendar,
        has_connections=ctx.has_connections,
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
        maps_on=ctx.maps_on,
        country=ctx.country,
        answered=ctx.answered,
        # 022. Bounded by the ten on the message, never trimmed.
        mentions=ctx.mentions,
        # 025. Bounded by LABELS_IN_PROMPT, and they follow their threads: a
        # thread trimmed out takes its labels with it, the one on screen keeps
        # its own.
        labels=[
            label
            for label in ctx.labels
            if any(t.id == label.thread_id for t in threads)
            or (ctx.looking_at is not None and ctx.looking_at.id == label.thread_id)
        ],
        # 020. Never dropped and never counted here: the ten-photo cap is the
        # bound, and a photo dropped from the prompt is a photo filed blind.
        photos=ctx.photos,
        # 041. The same: two PDFs at most, cut to ten pages, is the bound.
        pdfs=ctx.pdfs,
        spoken=ctx.spoken,
        # Bounded as a filing's result is, by the hundred the query takes, and
        # never trimmed: a rule dropped here is a rule the first filing breaks.
        looking_at_notes=ctx.looking_at_notes,
        # 026. Bounded by its own clamps, never trimmed here.
        mail=ctx.mail,
        # 038. Bounded at fifty by the query, never trimmed here.
        memories=ctx.memories,
        memories_by_query=ctx.memories_by_query,
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
        # 038. Bounded at fifty by the query, never trimmed here.
        memories=ctx.memories,
        memories_by_query=ctx.memories_by_query,
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
#
# **034. The owner's switches ride on the same read.** Web search, reading
# links and the map can each be turned off for everyone on Limits, and the path
# has to stop within seconds here as it does in the Core API. No cache in the
# worker: this query already runs once a turn. A person's own setting is not
# touched; what the turn may do is theirs and the switch together.


_SWITCH_KEY = re.compile(r"switch\.[a-z_]+")


def _switch_bind(key: str) -> str:
    """The parameter a switch's key is bound under: `switch.maps` is
    `:switch_maps`. Anything that is not a switch's key is refused, so the
    name is never more than letters and underscores."""
    if not _SWITCH_KEY.fullmatch(key):
        raise ValueError("not a switch")
    return key.replace(".", "_")


def switch_on(key: str) -> str:
    """SQL for whether an owner's switch is on: anything but a stored `false`.

    The registry's rule (`settings.ts` in the Core API): a switch defaults to
    on, and a row that is missing or makes no sense reads as the default.
    The key is a bound parameter, never part of the statement: build the
    statement with `switched`, which binds it.
    """
    return (
        f"(coalesce((select s.value from app_settings s where s.key = :{_switch_bind(key)}), "
        "'true'::jsonb) <> 'false'::jsonb)"
    )


def switched(sql: str, *keys: str) -> TextClause:
    """A statement that reads switches, with each one's key bound."""
    return text(sql).bindparams(**{_switch_bind(key): key for key in keys})


_MAY_REACH = switched(
    f"""
    select web_search_enabled and {switch_on("switch.web_search")} as web_search_enabled,
           web_links_enabled and {switch_on("switch.web_links")} as web_links_enabled,
           country,
           {switch_on("switch.maps")} as maps_on
      from accounts
     where id = :account_id
    """,
    "switch.web_search",
    "switch.web_links",
    "switch.maps",
)

# 019. Any approved calendar on the account. The tools are sent whenever there
# is one: in a thread they read through the calendars it picked, which may be
# none, and a write from a thread with none is what raises the question that
# picks one. From Today every approved calendar is in reach. Scoping the tools
# to the thread's picks would leave a thread with none unable to ask.
# 022. One row either way is a connection. The worker reads the pair table
# for this and nothing else; who is connected to whom it already knows from
# thread_members, which it reads whole.
_HAS_CONNECTIONS = text(
    """
    select 1 from connections
     where account_a = :account_id or account_b = :account_id
     limit 1
    """
)

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
# 038. What offload knows about the person, at most fifty (OFF-8): their own
# (asked and answered) before learned, then newest first. Their account only,
# and by subject as the Core API writes it.
MEMORIES_IN_PROMPT = 50

#: 040. At most this many rules, all of them, ahead of everything else.
RULES_IN_PROMPT = 20
#: 040. The person's own words a query embeds, and how long a turn waits for
#: its vector once the rest of its context is loaded. The query starts as soon
#: as the dump is read (`start_memory_query`), because a cold connection to
#: the provider took 302ms on 2026-10-06 and a warm one 209ms.
QUERY_CHARS = 2_000
QUERY_SECONDS = 0.3
#: How long the query itself may take from its start, overlapping the load.
QUERY_LONGEST = 2.0

_ACTIVE = """
     from notes n
    where n.scope = 'account'
      and n.subject_id = :account_id
      and n.account_id = :account_id
      and n.deleted_at is null
      and n.superseded_at is null
"""

_MEMORY_COUNT = text("select count(*)" + _ACTIVE)

# Fifty or fewer: all of them, rules, then their own, then learned.
_MEMORIES = text(
    "select n.id::text as id, n.kind, n.text, n.origin"
    + _ACTIVE
    + """
    order by (n.kind <> 'rules'), (n.origin = 'learned'), n.created_at desc, n.id desc
    limit :limit
    """
)

_RULES = text(
    "select n.id::text as id, n.kind, n.text, n.origin"
    + _ACTIVE
    + " and n.kind = 'rules' order by n.created_at desc, n.id desc limit :limit"
)

# Above fifty: their own before learned, a learned memory never pushing out
# one of theirs, and inside each the nearest the turn's words first.
_NEAREST = text(
    "select n.id::text as id, n.kind, n.text, n.origin"
    + _ACTIVE
    + """
      and n.kind <> 'rules'
    order by (n.origin = 'learned'),
             n.embedding <=> cast(:query as halfvec) nulls last,
             n.created_at desc, n.id desc
    limit :limit
    """
)

_NEWEST = text(
    "select n.id::text as id, n.kind, n.text, n.origin"
    + _ACTIVE
    + """
      and n.kind <> 'rules'
    order by (n.origin = 'learned'), n.created_at desc, n.id desc
    limit :limit
    """
)


def query_words(said: str | None, *, mail: Mail | None = None, trusted: bool = True) -> str:
    """040. What a turn's memories are chosen against: the person's own words,
    and nothing else. A forwarded email's note and never its body; nothing
    from a message somebody else's words reached; at most 2,000 characters.
    Mail, pages and other people's words never go to the embedding provider as
    a query, and never choose what a prompt carries."""
    if mail is not None:
        said, trusted = mail.note, True
    if not trusted or not said:
        return ""
    return said.strip()[:QUERY_CHARS]


def _memory(r) -> Memory:
    return Memory(id=r.id, kind=r.kind, text=r.text, origin=r.origin)


async def _count(conn: AsyncConnection, account_id: str) -> int:
    return (await conn.execute(_MEMORY_COUNT, {"account_id": account_id})).scalar_one()


async def start_memory_query(
    conn: AsyncConnection, account_id: str, query: str, embedder: Embedder | None
) -> asyncio.Future | None:
    """040. Start the turn's memory query as soon as its words are known, so
    it overlaps the rest of the context load. Nothing is asked of the provider
    for fifty or fewer, or with no words of the person's own."""
    if not embedder or not query or await _count(conn, account_id) <= MEMORIES_IN_PROMPT:
        return None
    return asyncio.ensure_future(embedder(query))


async def memories_for(
    conn: AsyncConnection,
    account_id: str,
    query: str,
    embedder: Embedder | None,
    *,
    started: asyncio.Future | None = None,
    wait: float = QUERY_SECONDS,
) -> list[Memory]:
    """The memories alone, for a caller that does not cache them."""
    memories, _ = await memories_chosen(
        conn, account_id, query, embedder, started=started, wait=wait
    )
    return memories


async def memories_chosen(
    conn: AsyncConnection,
    account_id: str,
    query: str,
    embedder: Embedder | None,
    *,
    started: asyncio.Future | None = None,
    wait: float = QUERY_SECONDS,
) -> tuple[list[Memory], bool]:
    """040. The memories a call is given, at most fifty: every rule, then the
    person's own nearest `query`, then offload's learned nearest. Fifty or
    fewer are all given and nothing is embedded; with no vector within `wait`
    of asking (a query `started` early has had the load as well), the newest
    stand in and the turn goes on. The flag says whether the set was chosen
    for this turn, which decides where the prompt puts it against the cache."""
    params = {"account_id": account_id}
    if await _count(conn, account_id) <= MEMORIES_IN_PROMPT:
        rows = (await conn.execute(_MEMORIES, {**params, "limit": MEMORIES_IN_PROMPT})).all()
        return [_memory(r) for r in rows], False

    rules = [
        _memory(r) for r in (await conn.execute(_RULES, {**params, "limit": RULES_IN_PROMPT})).all()
    ]
    room = {**params, "limit": MEMORIES_IN_PROMPT - len(rules)}
    if started is None and embedder and query:
        started = asyncio.ensure_future(embedder(query))
    vector = None
    if started is not None:
        try:
            vector = await asyncio.wait_for(asyncio.shield(started), wait)
        except TimeoutError:
            started.cancel()
    log.info("memory query", outcome="near" if vector else ("unavailable" if query else "no_words"))
    if vector:
        rows = (await conn.execute(_NEAREST, {**room, "query": vector})).all()
    else:
        rows = (await conn.execute(_NEWEST, room)).all()
    return rules + [_memory(r) for r in rows], True


async def memories_of(conn: AsyncConnection, account_id: str) -> list[Memory]:
    """The newest fifty, rules first: a call with no words of the person's
    to measure against."""
    return await memories_for(conn, account_id, "", None)


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
    time_zone: str | None = None
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
    #: 038. What offload knows about them, at most fifty; "what do you
    #: remember about me" is answered from it.
    memories: list[Memory] = field(default_factory=list)
    #: The same as on a dump: chosen for the question's words, past the mark.
    memories_by_query: bool = False

    @property
    def may_look_up(self) -> bool:
        return self.may_search or self.may_read_links

    @property
    def country_in_effect(self) -> str | None:
        return self.country_override or self.country


# As `clock_zone` reads a dump, the device's zone first: an answer and a dump
# read in two zones filed the wrong hour from a phone that was somewhere else.
_MESSAGE_ZONE = text(
    """
    select coalesce(m.time_zone, a.time_zone)
      from messages m
      join accounts a on a.id = m.account_id
     where m.id = :message_id and m.account_id = :account_id
    """
)


async def message_zone(conn: AsyncConnection, *, message_id: str, account_id: str) -> str | None:
    """The zone the message is read in: the device's zone it came with, else
    the account's clock, else None for UTC."""
    return (
        await conn.execute(_MESSAGE_ZONE, {"message_id": message_id, "account_id": account_id})
    ).scalar()


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
    embedder: Embedder | None = None,
) -> AnswerContext:
    """The thread list, the day, and since 018 the conversation's tail.

    The same queries the dump context uses, because a thread list or a tail
    that differed between filing and answering would be two ideas of what a
    person has.
    """
    # 040. The memory query starts now and runs while the rest is read, and
    # only from the person's own words, as on the dump's path: a message
    # somebody else's words reached never goes to the provider as a query.
    own = (
        (
            await conn.execute(_OWN_WORDS, {"message_id": message_id, "account_id": account_id})
        ).scalar()
        if message_id
        else False
    )
    memory_words = query_words(question, trusted=bool(own))
    memory_query = await start_memory_query(conn, account_id, memory_words, embedder)
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
        Thread(id=str(r.id), name=r.name, is_default=str(r.id) == default_id, shared=bool(r.shared))
        for r in thread_rows
    ]
    # Always offered, even when too stale to make the cap: it is where anything
    # with no obvious home lives, so a question about "that thing I saved" has
    # nowhere to look without it.
    if default_row is not None and not any(t.is_default for t in threads):
        threads.append(Thread(id=default_id, name=default_row.name, is_default=True))

    switches = (await conn.execute(_MAY_REACH, {"account_id": account_id})).first()
    time_zone = (
        await message_zone(conn, message_id=message_id, account_id=account_id)
        if message_id
        else None
    )
    today = await today_in(conn, time_zone)

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

    memories, by_query = await memories_chosen(
        conn, account_id, memory_words, embedder, started=memory_query
    )
    return AnswerContext(
        question=question,
        threads=threads,
        has_calendar=bool(calendar.scalar()),
        may_search=bool(switches and switches.web_search_enabled),
        may_read_links=bool(switches and switches.web_links_enabled),
        country=(switches.country if switches else None),
        today=today,
        time_zone=time_zone,
        turns=[
            Turn(
                role=r.role,
                text=turn_text(r.text, int(r.photos or 0), r.photo_titles, int(r.pdfs or 0)),
            )
            for r in reversed(turn_rows)
        ],
        country_override=country_override,
        looking_at=looking_at,
        looking_at_notes=looking_at_notes,
        memories=memories,
        memories_by_query=by_query,
    )


_OWN_WORDS = text(
    """
    select (m.source = 'person' and not m.derived_from_untrusted)
      from messages m
     where m.id = :message_id and m.account_id = :account_id and m.deleted_at is null
    """
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
    where message_id = :message_id and kind in ('image', 'pdf') and deleted_at is null
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


async def today_line(conn: AsyncConnection, time_zone: str | None = None) -> str:
    """What day it is, as the prompt says it."""
    return await today_in(conn, time_zone)


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
