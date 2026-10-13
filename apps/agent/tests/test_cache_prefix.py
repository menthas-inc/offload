"""The account's part of a turn is one cached prefix.

A burst of dumps from one account shares its rules, memories, threads,
labels, today and country, and only the dump and what is around it changes.
Those come first, the last of them carries the cache mark, and the turn's own
parts follow it, so the next dump within five minutes reads the account's
context instead of writing it again.
"""

from offload_agent.context import (
    AnswerContext,
    DumpContext,
    Filed,
    LabelRef,
    Memory,
    Mention,
    Thread,
    Turn,
    fit,
    fit_answer,
)
from offload_agent.harness.plan import build_answer_blocks, build_blocks, plan, plan_answer
from tests.test_plan import Recorder, Response, StubModel, TextBlock

THREADS = [
    Thread(id="t1", name="Flat admin", is_default=True),
    Thread(id="t2", name="Lisbon trip", is_default=False),
]
MEMORIES = [
    Memory(id="m2", kind="rules", text="They write dates day first."),
    Memory(id="m1", kind="people", text="Their wife is Meera."),
]


def dump_ctx(**over) -> DumpContext:
    base = dict(
        dump="dentist after the 20th",
        turns=[],
        threads=THREADS,
        landed=[],
        default_thread_id="t1",
        today="Thursday 3 September 2026",
        time_zone="Europe/Lisbon",
        country="PT",
        labels=[LabelRef(id="l1", thread_id="t2", name="flights")],
        memories=MEMORIES,
    )
    return DumpContext(**{**base, **over})


def answer_ctx(**over) -> AnswerContext:
    base = dict(
        question="when is the dentist",
        threads=THREADS,
        has_calendar=False,
        today="Thursday 3 September 2026",
        time_zone="Europe/Lisbon",
        country="PT",
        memories=MEMORIES,
    )
    return AnswerContext(**{**base, **over})


def marked(blocks: list[dict]) -> list[int]:
    return [i for i, b in enumerate(blocks) if b.get("cache_control")]


def prefix(blocks: list[dict]) -> list[dict]:
    (mark,) = marked(blocks)
    return blocks[: mark + 1]


def test_two_dumps_from_one_account_share_the_marked_prefix():
    first = build_blocks(dump_ctx())
    second = build_blocks(
        dump_ctx(
            dump="and the plumber on friday",
            looking_at=THREADS[1],
            turns=[Turn(role="person", text="earlier")],
            landed=[Filed(title="Dentist", thread_name="Flat admin")],
            answered={"field": "country", "label": "Portugal"},
            mentions=[Mention(account_id="a2", name="Meera")],
        )
    )
    assert prefix(first) == prefix(second)
    text = "\n".join(b["text"] for b in prefix(first))
    for stable in ("Their rules", "Meera", "Lisbon trip", "flights", "Today is", "Portugal"):
        assert stable in text
    for moving in ("dentist after", "looking at", "Earlier in", "interrupted"):
        assert moving not in text


def test_memories_chosen_by_the_turns_words_sit_after_the_mark():
    blocks = build_blocks(dump_ctx(memories_by_query=True))
    text = "\n".join(b["text"] for b in prefix(blocks))
    assert "Their rules" in text
    assert "Meera" not in text
    assert any("Meera" in b.get("text", "") for b in blocks[len(prefix(blocks)) :])


def test_two_questions_from_one_account_share_the_marked_prefix():
    first = build_answer_blocks(answer_ctx())
    second = build_answer_blocks(
        answer_ctx(
            question="what is on friday",
            looking_at=THREADS[1],
            looking_at_notes=["Flights are booked."],
            turns=[Turn(role="person", text="earlier")],
        )
    )
    assert prefix(first) == prefix(second)
    text = "\n".join(b["text"] for b in prefix(first))
    for stable in ("Their rules", "Meera", "Lisbon trip", "Today is", "Portugal"):
        assert stable in text


def test_answer_memories_chosen_by_the_question_sit_after_the_mark():
    blocks = build_answer_blocks(answer_ctx(memories_by_query=True))
    text = "\n".join(b["text"] for b in prefix(blocks))
    assert "Their rules" in text and "Meera" not in text


def test_a_bare_account_still_has_one_mark():
    assert len(marked(build_blocks(dump_ctx(memories=[], labels=[], threads=[])))) == 1
    assert len(marked(build_answer_blocks(answer_ctx(memories=[], threads=[])))) == 1


def test_fit_carries_which_way_the_memories_were_chosen():
    assert fit(dump_ctx(memories_by_query=True), 100_000).memories_by_query
    assert fit_answer(answer_ctx(memories_by_query=True), 100_000).memories_by_query


def _marks(request: dict) -> int:
    count = sum(1 for b in request["system"] if b.get("cache_control"))
    for message in request["messages"]:
        if isinstance(message["content"], list):
            count += sum(
                1 for b in message["content"] if isinstance(b, dict) and b.get("cache_control")
            )
    return count


async def test_a_call_never_sends_more_than_four_marks():
    model = StubModel([Response(content=[TextBlock("ok")], stop_reason="end_turn")])
    await plan(model, dump_ctx(memories_by_query=True), "claude-sonnet-5", Recorder())
    model2 = StubModel([Response(content=[TextBlock("ok")], stop_reason="end_turn")])
    await plan_answer(model2, answer_ctx(memories_by_query=True), "claude-opus-5", Recorder())
    for request in model.requests + model2.requests:
        assert _marks(request) <= 4


# The burst that broke the mark: a dump filed into the third thread from
# another screen. The next dump's threads come back with that one first, and
# its labels with the on-screen thread's first. Neither is the account's
# context changing, so neither may move a byte before the mark.
BURST = [
    Thread(id="t1", name="Flat admin", is_default=True),
    Thread(id="t2", name="Lisbon trip", is_default=False),
    Thread(id="t3", name="Groceries", is_default=False),
]
BURST_LABELS = [
    LabelRef(id="l1", thread_id="t2", name="flights"),
    LabelRef(id="l2", thread_id="t3", name="weekly"),
    LabelRef(id="l3", thread_id="t2", name="hotels"),
]


def recent_first(order: list[str]) -> list[Thread]:
    by_id = {t.id: t for t in BURST}
    return [by_id[i] for i in order]


def labels_first(thread_id: str) -> list[LabelRef]:
    return sorted(BURST_LABELS, key=lambda label: label.thread_id != thread_id)


def test_a_burst_across_threads_and_screens_keeps_the_dump_prefix():
    first = build_blocks(
        dump_ctx(
            threads=recent_first(["t2", "t1", "t3"]), labels=labels_first("t2"), looking_at=BURST[1]
        )
    )
    second = build_blocks(
        dump_ctx(
            threads=recent_first(["t3", "t2", "t1"]), labels=labels_first("t3"), looking_at=BURST[2]
        )
    )
    assert prefix(first) == prefix(second)


def test_a_burst_across_threads_and_screens_keeps_the_answer_prefix():
    first = build_answer_blocks(
        answer_ctx(threads=recent_first(["t2", "t1", "t3"]), looking_at=BURST[1])
    )
    second = build_answer_blocks(
        answer_ctx(threads=recent_first(["t3", "t2", "t1"]), looking_at=BURST[2])
    )
    assert prefix(first) == prefix(second)


def test_recency_is_still_said_after_the_mark():
    # Recency is a filing signal: where an unlabelled dump goes.
    blocks = build_blocks(dump_ctx(threads=recent_first(["t3", "t2", "t1"])))
    before = "\n".join(b["text"] for b in prefix(blocks))
    after = "\n".join(b.get("text", "") for b in blocks[len(prefix(blocks)) :])
    assert "most recent" not in before
    assert "t3, t2, t1" in after


def test_a_question_carries_no_recency_line():
    # Nothing in answering reads it, and after the mark it is written fresh on
    # every question. The threads are listed once, in the cached part.
    blocks = build_answer_blocks(answer_ctx(threads=recent_first(["t3", "t2", "t1"])))
    text = "\n".join(b.get("text", "") for b in blocks)
    assert "most recent use" not in text
    assert "t3, t2, t1" not in text


async def test_a_turn_with_a_photo_never_sends_more_than_four_marks():
    from offload_agent.context import Photo

    model = StubModel([Response(content=[TextBlock("ok")], stop_reason="end_turn")])
    await plan(
        model,
        dump_ctx(memories_by_query=True, photos=[Photo(blob_id="b1", index=1, large=b"x")]),
        "claude-sonnet-5",
        Recorder(),
    )
    assert _marks(model.requests[0]) <= 4
    assert len(model.requests[0]["system"]) == 2
