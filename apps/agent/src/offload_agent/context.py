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
class DumpContext:
    dump: str
    turns: list[Turn]
    threads: list[str]


# Resolved through thread_members, which is the only path there is: `threads`
# has no owner column at all, by design, because a thread has members and the
# creator is simply the first one. Filtering by anything else would either hide
# a shared thread from a member or show one to somebody who is not (OFF-3).
_THREADS = text(
    """
    select t.name
    from threads t
    join thread_members m on m.thread_id = t.id
    where m.account_id = :account_id
      and t.deleted_at is null
    order by t.last_activity_at desc
    limit :limit
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
        threads=[r.name for r in thread_rows],
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
            + sum(approx_tokens(name) for name in threads)
        )

    while total() > ceiling and turns:
        turns.pop(0)
    while total() > ceiling and threads:
        threads.pop()

    return DumpContext(dump=ctx.dump, turns=turns, threads=threads)
