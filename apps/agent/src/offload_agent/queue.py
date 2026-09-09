"""Claiming work.

This is the second implementation of the claim query in this codebase. The
TypeScript one in apps/core-api/src/jobs/queue.ts drains email; this one drains
model jobs. Two languages, one table, and they must not drift: a shared test
asserts both honour the priority order and the per-account cap.

That duplication is the two-plane split's first real cost, and it is worth
naming rather than discovering. The alternative, one runner calling the other
over HTTP, trades a duplicated forty-line query for a network hop on every job.
"""

from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


@dataclass(frozen=True)
class ClaimedJob:
    id: str
    kind: str
    payload: dict[str, Any]
    account_id: str | None
    attempts: int
    max_attempts: int


# The per-account subquery is the whole of AC-12. Without it one account sending
# fifty dumps occupies the worker and everyone else waits behind them, which the
# priority column cannot express because they are all the same priority.
#
# It counts `running` rather than `queued`: the cap is on work in flight, not on
# work waiting. Someone who dumps ten times still gets all ten answered, two at
# a time, while another account's first dump is claimed in between.
_CLAIM = text(
    """
    update jobs set
      state = 'running',
      locked_at = now(),
      locked_by = :worker_id,
      attempts = attempts + 1,
      updated_at = now()
    where id = (
      select j.id from jobs j
      where j.state = 'queued'
        and j.run_after <= now()
        and j.kind = any(:kinds)
        and (
          j.account_id is null
          or (
            select count(*) from jobs r
            where r.state = 'running' and r.account_id = j.account_id
          ) < :per_account
        )
      order by j.priority, j.run_after
      for update skip locked
      limit 1
    )
    returning id, kind, payload, account_id, attempts, max_attempts
    """
)


async def claim(
    conn: AsyncConnection, worker_id: str, kinds: list[str], per_account: int
) -> ClaimedJob | None:
    """Claim one runnable job, or None.

    Scoped by kind so this worker never takes a job the TypeScript runner owns.
    Both drain the same table and neither should surprise the other.
    """
    row = (
        await conn.execute(
            _CLAIM, {"worker_id": worker_id, "kinds": kinds, "per_account": per_account}
        )
    ).first()
    if row is None:
        return None
    return ClaimedJob(
        id=str(row.id),
        kind=row.kind,
        payload=row.payload if isinstance(row.payload, dict) else {},
        account_id=str(row.account_id) if row.account_id else None,
        attempts=row.attempts,
        max_attempts=row.max_attempts,
    )


# Backoff before a retry. Deliberately short: somebody is waiting on this, and
# an interactive job that sulks for a minute has failed as far as they are
# concerned even if it eventually succeeds.
_RELEASE = text(
    """
    update jobs set
      state = 'queued',
      locked_at = null,
      locked_by = null,
      run_after = now() + (:delay_seconds * interval '1 second'),
      last_error = :reason,
      updated_at = now()
    where id = :job_id
    """
)


async def release_for_retry(
    conn: AsyncConnection, job_id: str, reason: str, delay_seconds: int = 2
) -> None:
    """Put a job back for another attempt.

    `reason` is an enum-shaped string, never an exception message: jobs.last_error
    is a column a person reads while debugging and an SDK error can embed the
    request body, which is somebody's dump (OFF-1).
    """
    await conn.execute(
        _RELEASE, {"job_id": job_id, "reason": reason, "delay_seconds": delay_seconds}
    )


# Work that finishes here rather than at the Core API.
#
# A dump's job is closed by `turn-result`, because the Core API is the only
# writer and the turn's outcome has to reach it anyway. An embed job writes
# nothing the Core API owns and has nobody waiting on it, so a round trip to
# close it would be a network hop bought for symmetry.
_FINISH = text(
    """
    update jobs set
      state = 'done',
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = :job_id
    """
)


async def finish(conn: AsyncConnection, job_id: str) -> None:
    """Mark a job done. For work with no result to report anywhere else."""
    await conn.execute(_FINISH, {"job_id": job_id})
