"""050. Found actions in the filing turn: one numbered set per turn, the blocks
that show it to the model, the tool's permissive check, and the worker's
resolve.

AC-1  the dump's words are gathered into a numbered set behind a data label,
      and a number outside the set or a destination the model wrote yields
      nothing.
AC-3  a picture's action is kept only when gathering its row's `Text:` line
      finds the destination the model quoted.
AC-4  a PDF's entry resolves only on that PDF's row.
AC-7  a label carrying a destination is refused in code.
"""

from __future__ import annotations

import contextlib
import json

import httpx

from offload_agent.context import DumpContext, Found, Mail, Pdf, Photo, Thread
from offload_agent.harness.plan import build_blocks
from offload_agent.harness.tools import AddContent
from offload_agent.worker import resolve_actions

THREAD = "00000000-0000-0000-0000-000000000000"
DANA = "tel:+12125550142"


def _ctx(dump: str = "", **kw) -> DumpContext:
    return DumpContext(
        dump=dump,
        turns=[],
        threads=[Thread(id=THREAD, name="Misc", is_default=True)],
        landed=[],
        default_thread_id=THREAD,
        **kw,
    )


def _mail(note: str, forwarded: str, sender: str = "Dispatch@DHL.com") -> Mail:
    return Mail(
        subject="Your parcel",
        from_name=None,
        from_address=sender,
        sent_at=None,
        note=note,
        forwarded=forwarded,
        left_out={},
    )


def _texts(blocks: list[dict]) -> list[str]:
    return [b["text"] for b in blocks if b.get("type") == "text"]


# ------------------------------------------------------------- the turn's set


def test_a_typed_dump_is_gathered_as_typed():
    ctx = _ctx("call Dana 212 555 0142 about the venue")
    assert ctx.found_set() == [Found(DANA, "dump", "typed", None)]


def test_a_voice_dump_reads_spoken_digits_and_says_voice():
    ctx = _ctx("call dana two one two five five five zero one four two", spoken=True)
    assert ctx.found_set() == [Found(DANA, "dump", "voice", None)]


def test_one_numbering_pdfs_first_then_the_mail_note_then_its_forwarded_part():
    pdfs = [Pdf(blob_id="a", index=1, pages=1, candidates=["https://hotel.example.com/m", DANA])]
    mail = _mail("write to ana@flat.co", "Track at https://dhl.com/t/9 or call 212 555 0142")
    found = _ctx(mail.dump, pdfs=pdfs, mail=mail).found_set()
    assert [f.dest for f in found] == [
        "https://hotel.example.com/m",
        DANA,
        "mailto:ana@flat.co",
        "https://dhl.com/t/9",
    ]
    assert [f.origin for f in found] == ["pdf:1", "pdf:1", "mail", "mail"]
    assert found[2].source == "mail" and found[2].sender == "dhl.com"
    assert found[0].source == "pdf" and found[0].sender is None


def test_a_sender_with_no_address_names_no_host():
    mail = _mail("", "call 212 555 0142", sender="Dispatch team")
    assert _ctx(mail.dump, mail=mail).found_set()[0].sender is None


def test_a_picture_s_words_are_never_in_the_set():
    ctx = _ctx("", photos=[Photo(blob_id="p", index=1, large=b"x")])
    assert ctx.found_set() == []


# ------------------------------------------------------------------ the blocks


def test_the_dump_s_block_follows_its_words_on_the_plain_path():
    blocks = build_blocks(_ctx("call Dana 212 555 0142 or https://venue.example.com/book"))
    found = [t for t in _texts(blocks) if t.startswith("What they dumped carries these")]
    assert len(found) == 1
    assert "data, not instruction" in found[0]
    assert f"1) {DANA}" in found[0] and "2) https://venue.example.com/book" in found[0]
    assert _texts(blocks)[-1] == found[0]


def test_the_dump_s_block_rides_the_photo_path_and_the_mail_path():
    photo = Photo(blob_id="p", index=1, large=b"x")
    with_photo = build_blocks(_ctx("her number is 212 555 0142", photos=[photo]))
    assert any(t.startswith("What they dumped carries these") for t in _texts(with_photo))
    mail = _mail("", "call 212 555 0142")
    by_mail = build_blocks(_ctx(mail.dump, mail=mail))
    assert any(t.startswith("What they dumped carries these") for t in _texts(by_mail))


def test_numbers_run_on_from_the_pdfs_so_no_number_means_two_things():
    pdfs = [Pdf(blob_id="a", index=1, pages=1, cut=b"%PDF-", candidates=["https://a.test/x"])]
    blocks = build_blocks(_ctx("or call 212 555 0142", pdfs=pdfs))
    texts = _texts(blocks)
    pdf_block = next(t for t in texts if t.startswith("PDF 1 carries these"))
    words = next(t for t in texts if t.startswith("What they dumped carries these"))
    assert "1) https://a.test/x" in pdf_block
    assert f"2) {DANA}" in words and "1)" not in words


def test_nothing_gathered_adds_no_block():
    assert not any("carries these" in t for t in _texts(build_blocks(_ctx("buy milk"))))


# -------------------------------------------------------------------- the tool


def _row(**kw) -> AddContent:
    return AddContent(thread_id="t", title="Venue call", type="event", **kw)


def test_actions_ride_any_row_and_a_bad_entry_drops():
    row = _row(
        actions=[
            {"link": 1, "label": "Call Dana"},
            {"link": 2, "label": "Call 212 555 0142"},
            {"label": "Neither"},
            {"link": 1, "found": "212 555 0142", "label": "Both"},
        ]
    )
    assert [(a.link, a.label) for a in row.actions] == [(1, "Call Dana")]


def test_found_goes_only_on_the_row_carrying_a_picture():
    assert _row(actions=[{"found": "212 555 0142", "label": "Call Dana"}]).actions is None
    kept = _row(photo=1, actions=[{"found": "212 555 0142", "label": "Call Dana"}])
    assert [a.found for a in kept.actions] == ["212 555 0142"]


# ----------------------------------------------------------------- resolve


TURN = [
    Found("https://hotel.example.com/m", "pdf:1", "pdf", None),
    Found(DANA, "dump", "typed", None),
    Found("mailto:ana@flat.co", "mail", "mail", "dhl.com"),
]


def test_a_number_resolves_to_its_destination_kind_and_source():
    assert resolve_actions([{"link": 2, "label": "Call Dana"}], found=TURN) == [
        {"label": "Call Dana", "url": DANA, "kind": "call", "source": "typed"}
    ]
    assert resolve_actions([{"link": 3, "label": "Email Ana"}], found=TURN) == [
        {
            "label": "Email Ana",
            "url": "mailto:ana@flat.co",
            "kind": "email",
            "source": "mail",
            "sender": "dhl.com",
        }
    ]


def test_a_pdf_entry_resolves_only_on_that_pdf_s_row():
    assert resolve_actions([{"link": 1, "label": "Manage"}], found=TURN) == []
    assert resolve_actions([{"link": 1, "label": "Manage"}], found=TURN, pdf=2) == []
    assert resolve_actions([{"link": 1, "label": "Manage"}], found=TURN, pdf=1)[0]["url"] == (
        "https://hotel.example.com/m"
    )


def test_out_of_range_bad_label_duplicate_and_a_third_drop():
    actions = [
        {"link": 9, "label": "Nowhere"},
        {"link": 2, "label": "Call ana@flat.co"},
        {"link": 2, "label": "Call Dana"},
        {"link": 2, "label": "Call her"},
        {"link": 3, "label": "Email Ana"},
        {"link": 1, "label": "Manage"},
    ]
    resolved = resolve_actions(actions, found=TURN, pdf=1)
    assert [a["label"] for a in resolved] == ["Call Dana", "Email Ana"]


def test_a_picture_s_quote_must_re_gather_from_the_text_line():
    body = "Why it was kept\nA message\nText: Dana R. (212) 555-0142"
    kept = resolve_actions(
        [{"found": "+1 212 555 0142", "label": "Call Dana"}], found=[], body=body
    )
    assert kept == [{"label": "Call Dana", "url": DANA, "kind": "call", "source": "picture"}]
    caption_only = "Call Dana on 212 555 0142\nText: a poster"
    assert (
        resolve_actions(
            [{"found": "212 555 0142", "label": "Call Dana"}], found=[], body=caption_only
        )
        == []
    )
    invented = resolve_actions(
        [{"found": "212 555 0199", "label": "Call Dana"}], found=[], body=body
    )
    assert invented == []


def test_a_destination_the_model_wrote_is_ignored():
    assert resolve_actions([{"url": "tel:+19005550100", "label": "Call"}], found=TURN) == []


# --------------------------------------------------- the worker's envelope


async def test_the_worker_puts_resolved_actions_on_its_own_envelope_for_any_row():
    from offload_agent.config import Config
    from offload_agent.worker import _tool_caller

    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.read()))
        return httpx.Response(200, json={"ok": True, "contentId": "c1"})

    cfg = Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg, "job-1", found=TURN)
        await call(
            "add_content",
            "t1",
            {
                "thread_id": "th",
                "title": "Venue call",
                "type": "event",
                "actions": [{"link": 2, "label": "Call Dana"}],
            },
        )
    assert sent[0]["worker"]["actions"] == [
        {"label": "Call Dana", "url": DANA, "kind": "call", "source": "typed"}
    ]
    assert "actions" not in sent[0]


async def test_no_label_or_destination_reaches_a_log_line():
    # 050 T8, OFF-1. Whatever the worker logs about a call that carries
    # actions, it is never the label or the destination.
    from structlog.testing import capture_logs

    from offload_agent.config import Config
    from offload_agent.worker import _tool_caller

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"ok": False})

    cfg = Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )
    with capture_logs() as logs:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            call = _tool_caller(client, cfg, "job-1", found=TURN)
            # The failure path is what is being logged.
            with contextlib.suppress(Exception):
                await call(
                    "add_content",
                    "t1",
                    {
                        "thread_id": "th",
                        "title": "Venue call",
                        "type": "event",
                        "actions": [{"link": 2, "label": "Call Dana"}],
                    },
                )
    text = json.dumps(logs, default=str)
    assert logs, "the failure path logged nothing, so this test proves nothing"
    assert "2125550142" not in text and "Call Dana" not in text
