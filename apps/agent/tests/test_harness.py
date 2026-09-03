"""The output boundary.

AC-22 / OFF-5: the model's answer crosses back through a validated schema, with
one repair-and-revalidate retry, then it raises.
"""

import pytest

from offload_agent.context import DumpContext
from offload_agent.harness.answer import Answer, InvalidOutput, answer


class FakeUsage:
    input_tokens = 100
    output_tokens = 20
    cache_read_input_tokens = 0


class FakeBlock:
    def __init__(self, text: str):
        self.type = "text"
        self.text = text


class FakeResponse:
    def __init__(self, text: str):
        self.content = [FakeBlock(text)]
        self.usage = FakeUsage()


class FakeMessages:
    def __init__(self, replies: list[str]):
        self.replies = list(replies)
        self.calls: list[dict] = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return FakeResponse(self.replies.pop(0))


class FakeClient:
    def __init__(self, replies: list[str]):
        self.messages = FakeMessages(replies)


CTX = DumpContext(dump="dentist after the 20th", turns=[], threads=["Flat admin"])


async def test_a_valid_answer_comes_back_typed():
    client = FakeClient(['{"reply": "That would go in Flat admin."}'])
    result, usage = await answer(client, CTX, "claude-sonnet-5")
    assert isinstance(result, Answer)
    assert result.reply == "That would go in Flat admin."
    assert usage.input_tokens == 100


async def test_a_fenced_answer_is_accepted_because_the_schema_still_decides():
    client = FakeClient(['```json\n{"reply": "Noted."}\n```'])
    result, _ = await answer(client, CTX, "claude-sonnet-5")
    assert result.reply == "Noted."


async def test_a_malformed_answer_gets_exactly_one_repair_retry():
    client = FakeClient(["not json at all", '{"reply": "Second time lucky."}'])
    result, _ = await answer(client, CTX, "claude-sonnet-5")
    assert result.reply == "Second time lucky."
    assert len(client.messages.calls) == 2

    # The repair turn asks for the shape and does not resend the dump: the
    # conversation already holds it and a second copy is a second copy of
    # someone's private text.
    repair = client.messages.calls[1]["messages"][-1]["content"]
    assert "dentist" not in repair


async def test_two_malformed_answers_raise_rather_than_loop():
    client = FakeClient(["nope", "still nope"])
    with pytest.raises(InvalidOutput):
        await answer(client, CTX, "claude-sonnet-5")
    assert len(client.messages.calls) == 2


async def test_an_empty_reply_is_a_validation_failure_not_a_blank_turn():
    client = FakeClient(['{"reply": ""}', '{"reply": "Actually here it is."}'])
    result, _ = await answer(client, CTX, "claude-sonnet-5")
    assert result.reply == "Actually here it is."


async def test_the_system_prompt_is_cached_and_carries_no_account_data():
    client = FakeClient(['{"reply": "ok"}'])
    await answer(client, CTX, "claude-sonnet-5")
    system = client.messages.calls[0]["system"]

    assert system[0]["cache_control"] == {"type": "ephemeral"}
    # The account's own words and its thread names are both absent from the
    # system prompt. They live in user turns (SEC-1, AC-7).
    assert "dentist" not in system[0]["text"]
    assert "Flat admin" not in system[0]["text"]
