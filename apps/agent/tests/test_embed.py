"""Chunking, the prefix, and one real call to Voyage.

AC-12  a row that cannot be embedded is still findable by text.
AC-14  something embeds a real string against the real API before this ships.

**The live test is the point of this file.** The credential, the request shape
and the response shape are the three things no local mock can prove, and this
repository has shipped two production failures that were exactly that: code
that read correctly, passed every gate, and had never once been executed. It
skips without a key so CI stays green for everybody, and it is run before the
feature ships rather than after.
"""

from __future__ import annotations

import os

import httpx
import pytest

from offload_agent.config import Config
from offload_agent.embed import (
    BATCH,
    CHUNK_CHARS,
    DIMENSION,
    DOCUMENT_SECONDS,
    MODEL,
    SEARCH_SECONDS,
    EmbeddingUnavailable,
    chunk,
    embed,
    to_pgvector,
    with_breadcrumb,
)
from offload_agent.queue import ClaimedJob


def test_empty_body_has_no_chunks() -> None:
    assert chunk("") == []
    assert chunk("   \n\n  ") == []


def test_short_body_is_one_chunk() -> None:
    pieces = chunk("Book the flat for the 14th.")
    assert len(pieces) == 1
    assert pieces[0].ord == 0
    assert pieces[0].text == "Book the flat for the 14th."


def test_paragraphs_pack_up_to_the_budget() -> None:
    # Three short paragraphs are one chunk, not three: the budget is what
    # decides, and a chunk per paragraph would embed a sentence at a time.
    pieces = chunk("One.\n\nTwo.\n\nThree.")
    assert len(pieces) == 1
    assert pieces[0].text == "One.\n\nTwo.\n\nThree."


def test_a_long_paragraph_splits_on_whitespace() -> None:
    body = " ".join(["word"] * (CHUNK_CHARS // 2))
    pieces = chunk(body)
    assert len(pieces) > 1
    assert all(len(p.text) <= CHUNK_CHARS for p in pieces)
    # Split on spaces, never mid-word.
    assert all("word" in p.text for p in pieces)
    assert [p.ord for p in pieces] == list(range(len(pieces)))


def test_the_breadcrumb_is_added_and_not_stored() -> None:
    prefixed = with_breadcrumb(thread_name="Lisbon trip", title="Flat", text="14th to the 17th")
    assert prefixed == "Lisbon trip / Flat\n\n14th to the 17th"
    # A chunk from the middle of a long note is a paragraph with no subject.
    # This is what gives it one, and it is why the stored text stays bare: a
    # re-embed starts from the stored text and would otherwise prefix it twice.
    assert "14th to the 17th" in prefixed


def test_the_breadcrumb_survives_a_missing_thread_or_title() -> None:
    assert with_breadcrumb(thread_name=None, title=None, text="bare") == "bare"
    assert with_breadcrumb(thread_name="Lisbon", title=None, text="bare") == "Lisbon\n\nbare"


def test_pgvector_text_form() -> None:
    # halfvec parses this. A Postgres array literal, which is what casting a
    # float8[] produces, it does not.
    assert to_pgvector([1.0, 2.5]).startswith("[")
    assert to_pgvector([1.0, 2.5]).endswith("]")
    assert "," in to_pgvector([1.0, 2.5])


async def test_an_oversized_batch_is_refused_rather_than_truncated() -> None:
    with pytest.raises(ValueError):
        async with httpx.AsyncClient() as client:
            await embed(["x"] * (BATCH + 1), client=client, api_key="unused")


async def test_an_unreachable_voyage_raises_rather_than_returning_nothing() -> None:
    # Returning [] would write null vectors and mark the row embedded, which
    # makes an outage indistinguishable from a row with nothing to say.
    transport = httpx.MockTransport(lambda _: httpx.Response(503, json={"error": "nope"}))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(EmbeddingUnavailable):
            await embed(["hello"], client=client, api_key="unused")


async def test_a_wrong_dimension_is_refused() -> None:
    # A model whose width disagrees with halfvec(1024) is an insert error a long
    # way from its cause. Caught here, where the cause is obvious.
    body = {"data": [{"index": 0, "embedding": [0.1, 0.2, 0.3]}]}
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json=body))
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(EmbeddingUnavailable):
            await embed(["hello"], client=client, api_key="unused")


async def test_results_are_returned_in_the_order_asked_for() -> None:
    # Voyage returns an `index` per item and does not promise order. Getting
    # this wrong pairs every vector with the wrong chunk, which is invisible:
    # search still works and is quietly nonsense.
    body = {
        "data": [
            {"index": 1, "embedding": [0.2] * DIMENSION},
            {"index": 0, "embedding": [0.1] * DIMENSION},
        ]
    }
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json=body))
    async with httpx.AsyncClient(transport=transport) as client:
        vectors = await embed(["first", "second"], client=client, api_key="unused")
    assert vectors[0][0] == pytest.approx(0.1)
    assert vectors[1][0] == pytest.approx(0.2)


@pytest.mark.skipif(not os.environ.get("VOYAGE_API_KEY"), reason="no VOYAGE_API_KEY")
async def test_a_real_string_against_the_real_api() -> None:
    """AC-14. The one that cannot be faked.

    Proves three things a mock cannot: the credential is accepted, the request
    shape is what Voyage expects, and the response is the shape we parse. Each
    of those has been a production failure in this repository before, in the
    calendar, for exactly the reason that nothing local had ever executed them.
    """
    async with httpx.AsyncClient() as client:
        vectors = await embed(
            ["Lisbon trip / Flat\n\nThe Alfama flat, 14th to the 17th."],
            client=client,
            api_key=os.environ["VOYAGE_API_KEY"],
        )

    assert len(vectors) == 1
    assert len(vectors[0]) == DIMENSION, f"{MODEL} returned {len(vectors[0])}, expected {DIMENSION}"
    # A real embedding, not a zero vector: every dimension identical would pass
    # a length check and mean nothing.
    assert len(set(vectors[0])) > 1
    # And it survives the round trip into the form Postgres will parse.
    assert to_pgvector(vectors[0]).count(",") == DIMENSION - 1


async def test_an_unexpected_embed_failure_releases_the_job_rather_than_stranding_it(
    monkeypatch,
) -> None:
    """The dispatch used to sit outside the loop's try, so anything other than
    `EmbeddingUnavailable` escaped to the catch-all in `run()`, which logs and
    sleeps. The job stayed `running` forever.

    Nothing reaps a stuck row, and the sweep cannot re-enqueue it: the
    idempotency key carries the row's version, and the version only moves when
    somebody edits the row. One malformed response made a row permanently
    unsearchable with no way back.
    """
    from offload_agent import worker as worker_mod

    released: list[tuple[str, str]] = []

    async def boom(job, **kwargs):
        raise KeyError("data")

    async def fake_retry_or_die(conn, job, reason, delay_seconds=0):
        released.append((job.id, reason))
        return True

    class _Conn:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    class _Engine:
        def begin(self):
            return _Conn()

    monkeypatch.setattr(worker_mod, "handle_embed", boom)
    monkeypatch.setattr(worker_mod, "retry_or_die", fake_retry_or_die)

    job = ClaimedJob(
        id="job-1",
        kind="embed.content",
        payload={"rowId": "r1"},
        account_id="a1",
        attempts=0,
        max_attempts=5,
    )

    # Never raises: that is `handle`'s documented invariant, and the embed kinds
    # were the one path that did not hold it.
    await worker_mod.handle(
        job,
        cfg=Config(
            database_url="postgresql+asyncpg://x/y",
            api_url="http://api.test",
            internal_token="t",
            anthropic_api_key="k",
        ),
        engine=_Engine(),
        anthropic=object(),
        http=object(),
    )

    assert released == [("job-1", "embed_error")]


def _voyage(seen: list[httpx.Request], fail: Exception | None = None) -> httpx.MockTransport:
    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if fail is not None:
            raise fail
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1] * DIMENSION}]})

    return httpx.MockTransport(answer)


def _search_cfg() -> Config:
    return Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
        voyage_api_key="v",
    )


async def test_a_question_waits_ten_seconds_for_its_vector_and_a_document_thirty() -> None:
    """2026-10-07. The search tool's query embed sits inside a turn somebody is
    watching, and it used to take the document embed's thirty seconds."""
    from offload_agent.worker import _embed_query

    seen: list[httpx.Request] = []
    async with httpx.AsyncClient(transport=_voyage(seen)) as client:
        assert await _embed_query(_search_cfg(), client)("flat in Lisbon") is not None
        await embed(["a row"], client=client, api_key="unused")

    assert SEARCH_SECONDS == 10
    assert DOCUMENT_SECONDS == 30
    assert seen[0].extensions["timeout"]["read"] == SEARCH_SECONDS
    assert seen[1].extensions["timeout"]["read"] == DOCUMENT_SECONDS


async def test_a_question_whose_vector_times_out_is_searched_by_text() -> None:
    """None is what the tool call carries as `queryVector`, and the Core API's
    search answers from its text arm alone. The turn is not failed for it."""
    from offload_agent.worker import _embed_query

    seen: list[httpx.Request] = []
    slow = httpx.ReadTimeout("slow")
    async with httpx.AsyncClient(transport=_voyage(seen, slow)) as client:
        assert await _embed_query(_search_cfg(), client)("flat in Lisbon") is None
    assert len(seen) == 1, "asked once and not retried inside the turn"
