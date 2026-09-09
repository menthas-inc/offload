"""Turning rows into vectors.

Chunking, the breadcrumb prefix, and the one HTTP call. Nothing here decides
what to embed or when: the Core API enqueues a job per row and the worker drains
it, so a dump is never waiting on a third party to be filed.

**Three things are deliberate and each has cost something somewhere before.**

The prefix is added here and only here, on the first embed and on any re-embed,
so the two cannot disagree about what a vector represents.

The model id and the dimension are one constant. A wrong model string is a 400
that reads like a credential fault, and a dimension that disagrees with
`halfvec(1024)` is an insert error a long way from its cause.

Nothing in this module logs the text. OFF-1 is about egress and a chunk is
content; ids, counts and latencies only.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

# voyage-4 at its default width, which is what halfvec(1024) was chosen for.
# The family also has -large, -lite, -nano and -code, all at 32K context and all
# supporting 256, 512, 1024 and 2048. Read off Voyage's reference on 2026-09-09
# rather than recalled.
MODEL = "voyage-4"
DIMENSION = 1024

# decisions.md: roughly 400-token chunks with breadcrumb prefixes. Measured in
# characters here because we are not tokenising client-side to decide where to
# split, and four characters per token is the ordinary English approximation.
CHUNK_TOKENS = 400
CHUNK_CHARS = CHUNK_TOKENS * 4

# Voyage takes 1,000 texts per request. The real bound is tokens, so this is
# well under it and leaves the backfill room to pack rows together.
BATCH = 128

_ENDPOINT = "https://api.voyageai.com/v1/embeddings"


class EmbeddingUnavailable(RuntimeError):
    """Voyage could not be reached, or refused.

    Raised rather than swallowed so the job retries. The row stays filed and
    stays findable by text; only meaning is missing, and only until this
    succeeds.
    """


@dataclass(frozen=True)
class Chunk:
    ord: int
    text: str


def chunk(body: str) -> list[Chunk]:
    """Split on paragraphs, then pack up to the chunk size.

    Paragraph boundaries rather than a sliding window, because a dump is
    written by a person and its paragraphs are already the unit they thought in.
    A single paragraph longer than the budget is split on whitespace rather than
    mid-word.
    """
    text = (body or "").strip()
    if not text:
        return []

    pieces: list[str] = []
    for para in text.split("\n\n"):
        para = para.strip()
        if not para:
            continue
        while len(para) > CHUNK_CHARS:
            cut = para.rfind(" ", 0, CHUNK_CHARS)
            if cut <= 0:
                cut = CHUNK_CHARS
            pieces.append(para[:cut].strip())
            para = para[cut:].strip()
        if para:
            pieces.append(para)

    packed: list[str] = []
    current = ""
    for piece in pieces:
        if not current:
            current = piece
        elif len(current) + 2 + len(piece) <= CHUNK_CHARS:
            current = f"{current}\n\n{piece}"
        else:
            packed.append(current)
            current = piece
    if current:
        packed.append(current)

    return [Chunk(ord=i, text=t) for i, t in enumerate(packed)]


def with_breadcrumb(*, thread_name: str | None, title: str | None, text: str) -> str:
    """What actually gets embedded.

    A chunk from the middle of a long note is a paragraph with no subject, and
    "the 14th to the 17th" embeds near nothing useful. The thread and the title
    give it one.

    The prefix is never stored in `text`: the stored chunk is what a re-embed
    starts from, and a prefix baked into it would be embedded twice the second
    time around.
    """
    crumbs = " / ".join(part for part in (thread_name, title) if part)
    return f"{crumbs}\n\n{text}" if crumbs else text


def available() -> bool:
    """Whether embedding can happen at all.

    Absent in development and in CI, where the text half of search still works
    and only meaning is missing. Refused in production by config, the way the
    vault key is.
    """
    return bool(os.environ.get("VOYAGE_API_KEY"))


async def embed(
    texts: list[str],
    *,
    client: httpx.AsyncClient,
    api_key: str,
    input_type: str = "document",
) -> list[list[float]]:
    """One call, one batch, vectors in the order the texts came in.

    `input_type` is Voyage's asymmetric hint: `document` for what is being
    indexed and `query` for what somebody asked. Getting it the wrong way round
    is a quiet quality loss rather than an error, which is why it is a named
    argument with no clever default.
    """
    if not texts:
        return []
    if len(texts) > BATCH:
        raise ValueError(f"batch of {len(texts)} exceeds {BATCH}")

    try:
        response = await client.post(
            _ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "input": texts,
                "model": MODEL,
                "input_type": input_type,
                "output_dimension": DIMENSION,
            },
            timeout=30.0,
        )
    except httpx.HTTPError as error:  # network, DNS, timeout
        raise EmbeddingUnavailable(type(error).__name__) from error

    if response.status_code != 200:
        # The body can echo the input, so it is not carried into the message.
        raise EmbeddingUnavailable(f"voyage {response.status_code}")

    body = response.json()
    vectors = [item["embedding"] for item in sorted(body["data"], key=lambda d: d["index"])]
    if len(vectors) != len(texts):
        raise EmbeddingUnavailable(f"asked {len(texts)}, got {len(vectors)}")
    for vector in vectors:
        if len(vector) != DIMENSION:
            raise EmbeddingUnavailable(f"dimension {len(vector)}, expected {DIMENSION}")
    return vectors


def to_pgvector(vector: list[float]) -> str:
    """pgvector's text form. `halfvec` parses this and not a Postgres array."""
    return "[" + ",".join(repr(float(v)) for v in vector) + "]"
