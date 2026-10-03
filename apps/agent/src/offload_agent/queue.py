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
      where (
          (j.state = 'queued' and j.run_after <= now())
          or (
            j.state = 'running'
            and j.locked_at < now() - (:stale_seconds * interval '1 second')
            and j.attempts < j.max_attempts
          )
        )
        and j.kind = any(:kinds)
        and (
          j.account_id is null
          or (
            select count(*) from jobs r
            where r.state = 'running'
              and r.account_id = j.account_id
              and (
                r.locked_at is null
                or r.locked_at >= now() - (:stale_seconds * interval '1 second')
              )
          ) < :per_account
        )
      order by j.priority, j.run_after
      for update skip locked
      limit 1
    )
    returning id, kind, payload, account_id, attempts, max_attempts
    """
)

# A `running` row whose worker died: the claim above takes it again while it
# has attempts left, and this marks it dead once it has none, so a job that
# kills its worker every time stops at `max_attempts` like a job that fails
# politely. Without either, a row a killed worker left behind stayed `running`
# for good, and two of them locked an account out of the worker with nothing
# that cleared it (security review 2026-09-22, M10).
_REAP = text(
    """
    update jobs set
      state = 'dead',
      locked_at = null,
      locked_by = null,
      last_error = 'stale',
      error_code = 'stale',
      updated_at = now()
    where state = 'running'
      and locked_at < now() - (:stale_seconds * interval '1 second')
      and attempts >= max_attempts
      and kind = any(:kinds)
    """
)

#: How long a worker may hold a job before another may assume it is dead.
#: Longer than anything a turn legitimately does: the transcription poll
#: allows six minutes, and a turn with photos and ten model calls is under
#: that.
STALE_AFTER_SECONDS = 900


async def claim(
    conn: AsyncConnection,
    worker_id: str,
    kinds: list[str],
    per_account: int,
    *,
    stale_after_seconds: int = STALE_AFTER_SECONDS,
) -> ClaimedJob | None:
    """Claim one runnable job, or None.

    Scoped by kind so this worker never takes a job the TypeScript runner owns.
    Both drain the same table and neither should surprise the other. A
    `running` row nobody has touched for `stale_after_seconds` is runnable
    too: its worker is gone.
    """
    row = (
        await conn.execute(
            _CLAIM,
            {
                "worker_id": worker_id,
                "kinds": kinds,
                "per_account": per_account,
                "stale_seconds": stale_after_seconds,
            },
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
      error_code = :reason,
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

    034. The same string goes to `jobs.error_code`, the column the admin panel
    reads: the Core API keeps the closed set (`src/jobs/errors.ts`), and a new
    reason here is a new entry there.
    """
    await conn.execute(
        _RELEASE, {"job_id": job_id, "reason": reason, "delay_seconds": delay_seconds}
    )


_DIE = text(
    """
    update jobs set
      state = 'dead',
      locked_at = null,
      locked_by = null,
      last_error = :reason,
      error_code = :reason,
      updated_at = now()
    where id = :job_id
    """
)


async def retry_or_die(
    conn: AsyncConnection, job: ClaimedJob, reason: str, delay_seconds: int = 2
) -> bool:
    """Another attempt while the row has one left, else dead.

    Every release used to be unconditional, and `max_attempts` was read on one
    path only. An outage between here and the Core API re-ran a whole paid turn
    every thirty seconds for its length, and a fold that kept failing cost two
    model calls an hour forever (security review 2026-09-22, M13). Returns
    whether the job was released.
    """
    if job.attempts < job.max_attempts:
        await release_for_retry(conn, job.id, reason, delay_seconds)
        return True
    await conn.execute(_DIE, {"job_id": job.id, "reason": reason})
    return False


async def reap(conn: AsyncConnection, kinds: list[str], stale_after_seconds: int) -> None:
    """Mark dead the `running` rows whose worker is gone and whose attempts are spent."""
    await conn.execute(_REAP, {"kinds": kinds, "stale_seconds": stale_after_seconds})


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
      error_code = null,
      updated_at = now()
    where id = :job_id
    """
)


async def finish(conn: AsyncConnection, job_id: str) -> None:
    """Mark a job done. For work with no result to report anywhere else."""
    await conn.execute(_FINISH, {"job_id": job_id})
