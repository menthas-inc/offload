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

from dataclasses import dataclass

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
class DumpContext:
    dump: str
    turns: list[Turn]
    threads: list[Thread]
    landed: list[Filed]
    default_thread_id: str | None


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
_TURNS = text(
    """
    select role, text
    from messages
    where conversation_id = :conversation_id
      and account_id = :account_id
      and deleted_at is null
      and text is not null
      and id <> :exclude_id
    order by created_at desc
    limit :limit
    """
)

_DUMP = text(
    """
    select text from messages
    where id = :message_id and account_id = :account_id and deleted_at is null
    """
)


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
    if dump_row is None or not dump_row.text:
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

    return DumpContext(
        dump=dump_row.text,
        turns=[Turn(role=r.role, text=r.text) for r in reversed(turn_rows)],
        threads=threads,
        landed=[Filed(title=r.title, thread_name=r.thread_name) for r in landed_rows],
        default_thread_id=default_id,
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
    )
