"""Draining the embed queue.

One job per row, off the turn. A dump must never wait on a third party to be
filed, and a failed embed must never fail a filing.

**The chunks are written whether or not Voyage answers.** That is the whole
failure design: a row with chunks and no vectors is found by exact terms and
missed only by meaning, and `embedded_at is null` is a backlog with a retry
rather than an error state. The alternative, writing nothing until the embedding
succeeds, makes an outage look like data loss.
"""

from __future__ import annotations

import httpx
import structlog
from sqlalchemy import text

from offload_agent.config import Config
from offload_agent.embed import (
    BATCH,
    MODEL,
    EmbeddingUnavailable,
    chunk,
    embed,
    to_pgvector,
    with_breadcrumb,
)
from offload_agent.queue import ClaimedJob, finish, release_for_retry

log = structlog.get_logger()

KINDS = ["embed.content", "embed.note", "embed.message"]


_CONTENT = text(
    """
    select threads.name as thread_name, content.title as title,
           coalesce(content.title, '') || case when content.body is null then ''
             else E'\\n\\n' || content.body end as body,
           content.thread_id::text as owner_id
    from content join threads on threads.id = content.thread_id
    where content.id = :id and content.deleted_at is null
    """
)

_NOTE = text(
    """
    select threads.name as thread_name, null as title,
           notes.text as body, notes.subject_id::text as owner_id
    from notes left join threads on threads.id = notes.subject_id
    where notes.id = :id and notes.deleted_at is null
    """
)

# `state` is filtered here as well as at search time. A queued message has no
# settled text yet, and embedding one would index a draft. 021: the body is
# what the person said, typed words and transcript through `said()`.
_MESSAGE = text(
    """
    select null as thread_name, null as title,
           said(messages.text, messages.transcript) as body,
           messages.account_id::text as owner_id,
           messages.role as role
    from messages
    where messages.id = :id and messages.deleted_at is null
      and said(messages.text, messages.transcript) is not null
      and messages.state in ('seen', 'answered')
    """
)

_SOURCES = {
    "embed.content": ("content_chunks", "content_id", "thread_id", _CONTENT),
    "embed.note": ("note_chunks", "note_id", "subject_id", _NOTE),
    "embed.message": ("message_chunks", "message_id", "account_id", _MESSAGE),
}


async def handle_embed(job: ClaimedJob, *, cfg: Config, engine, http: httpx.AsyncClient) -> None:
    """One row, chunked, stored, and embedded if we can reach Voyage."""
    row_id = job.payload.get("rowId")
    spec = _SOURCES.get(job.kind)
    if not row_id or spec is None:
        async with engine.begin() as conn:
            await finish(conn, job.id)
        return

    chunk_table, id_column, owner_column, query = spec

    async with engine.begin() as conn:
        found = (await conn.execute(query, {"id": row_id})).mappings().first()
        if found is None:
            # Deleted, or never eligible. Nothing to embed and nothing wrong.
            await finish(conn, job.id)
            return

        pieces = chunk(found["body"] or "")
        if not pieces:
            await finish(conn, job.id)
            return

        # **Nothing to do if the text did not change.**
        #
        # The sweep finds work by comparing `updated_at`, and almost everything
        # touches that: ticking a task, editing tags, changing priority,
        # archiving, moving. None of them change a word of the text. Replacing
        # the chunks anyway pays Voyage for a vector we already have and leaves
        # the old entries dead in the HNSW graph, where an iterative scan walks
        # them and returns fewer rows, or none at all.
        #
        # So a tick costs one comparison rather than an embedding.
        existing = (
            (
                await conn.execute(
                    text(
                        f"""
                        select ord, text, model, embedded_at
                        from {chunk_table} where {id_column} = :id order by ord
                        """
                    ),
                    {"id": row_id},
                )
            )
            .mappings()
            .all()
        )

        unchanged = (
            len(existing) == len(pieces)
            and all(r["model"] == MODEL and r["embedded_at"] is not None for r in existing)
            and all(r["text"] == p.text for r, p in zip(existing, pieces, strict=True))
        )
        if unchanged:
            # Touched rather than rebuilt, so the sweep stops finding it.
            await conn.execute(
                text(f"update {chunk_table} set embedded_at = now() where {id_column} = :id"),
                {"id": row_id},
            )
            await finish(conn, job.id)
            log.info("embed unchanged", kind=job.kind, chunks=len(pieces))
            return

        # Replace rather than merge. A row whose body changed has different
        # chunk boundaries, and a partial overwrite would leave orphans from the
        # old split that still match a search.
        await conn.execute(
            text(f"delete from {chunk_table} where {id_column} = :id"), {"id": row_id}
        )
        # `role` only exists on message_chunks, so the column list is built
        # rather than branched on in SQL. Both are interpolated from the table
        # above and never from anything a person wrote.
        columns = [id_column, owner_column, "ord", "text"]
        values = [":id", ":owner", ":ord", ":text"]
        extra: dict[str, object] = {}
        if job.kind == "embed.message":
            columns.append("role")
            values.append(":role")
            extra["role"] = found["role"]

        insert = text(
            f"insert into {chunk_table} ({', '.join(columns)}) values ({', '.join(values)})"
        )
        for piece in pieces:
            await conn.execute(
                insert,
                {
                    "id": row_id,
                    "owner": found["owner_id"],
                    "ord": piece.ord,
                    "text": piece.text,
                    **extra,
                },
            )

    if not cfg.voyage_api_key:
        # Development and CI. The chunks are stored, the text half of search
        # works, and the backlog drains whenever a key exists.
        log.info("embed skipped, no key", kind=job.kind, chunks=len(pieces))
        async with engine.begin() as conn:
            await finish(conn, job.id)
        return

    inputs = [
        with_breadcrumb(thread_name=found["thread_name"], title=found["title"], text=p.text)
        for p in pieces
    ]

    try:
        # Batched, because `embed` refuses more than one request's worth and a
        # ValueError here would kill the job rather than retry it. A note long
        # enough to need two batches is far-fetched; a crash on the day one
        # arrives is not.
        vectors: list[list[float]] = []
        for start in range(0, len(inputs), BATCH):
            vectors.extend(
                await embed(inputs[start : start + BATCH], client=http, api_key=cfg.voyage_api_key)
            )
    except EmbeddingUnavailable as error:
        # The row is filed and its chunks are stored. Only meaning is missing,
        # and only until this retries.
        log.warning("embed unavailable", kind=job.kind, reason=str(error))
        async with engine.begin() as conn:
            await release_for_retry(conn, job.id, "embed_unavailable", delay_seconds=60)
        return

    async with engine.begin() as conn:
        for piece, vector in zip(pieces, vectors, strict=True):
            await conn.execute(
                text(
                    f"""
                    update {chunk_table}
                    set embedding = :embedding, model = :model, embedded_at = now()
                    where {id_column} = :id and ord = :ord
                    """
                ),
                {
                    "id": row_id,
                    "ord": piece.ord,
                    "embedding": to_pgvector(vector),
                    "model": MODEL,
                },
            )
        await finish(conn, job.id)

    log.info("embedded", kind=job.kind, chunks=len(pieces))
