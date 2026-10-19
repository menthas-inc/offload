"""041. The clean copy, page 1, the ten-page cut, and the bounded child that
makes them.

AC-12  every kill-list item is gone from every object of the clean copy, and
       page 1 looks the same from the original and the clean copy.
AC-14  a PDF that cannot be cleaned is a failure with a reason, not a copy.
AC-16  the cut is the first ten pages.
AC-30  a failure is an enum, never a parser's message.
"""

from __future__ import annotations

import asyncio
import io
import re
from pathlib import Path

import pikepdf
import pypdfium2 as pdfium
import pytest
from PIL import Image, ImageChops, ImageStat

from offload_agent import pdfs

FIXTURES = Path(__file__).parent / "fixtures" / "pdfs"


def fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


KILL = re.compile(
    rb"/(JS|JavaScript|OpenAction|AA|Launch|SubmitForm|ImportData|GoToR|GoToE|URI|EmbeddedFiles?|"
    rb"FileAttachment|RichMedia|Movie|Sound|3D|XFA|AcroForm|Metadata|PieceInfo|Info|ObjStm|Encrypt|Rendition|URL|SetOCGState)(?=[\s/<>\[\]()%]|$)"
)


def every_name_in_every_stream(pdf_bytes: bytes) -> list[bytes]:
    """The clean copy rewritten uncompressed, every stream decoded, so a name
    inside an object stream or a compressed dictionary has nowhere to hide."""
    pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    out = io.BytesIO()
    pdf.save(
        out,
        qdf=True,
        compress_streams=False,
        stream_decode_level=pikepdf.StreamDecodeLevel.all,
        object_stream_mode=pikepdf.ObjectStreamMode.disable,
    )
    return [m.group(0) for m in KILL.finditer(out.getvalue())]


def page_one(pdf_bytes: bytes) -> Image.Image:
    return pdfium.PdfDocument(pdf_bytes)[0].render(scale=1).to_pil().convert("RGB")


@pytest.mark.parametrize("name", ["hostile.pdf", "objstm.pdf", "incremental.pdf"])
def test_the_clean_copy_carries_nothing_on_the_kill_list(name: str) -> None:
    assert every_name_in_every_stream(fixture(name)), "the fixture should carry something to remove"
    clean = pdfs.clean(fixture(name))
    assert every_name_in_every_stream(clean) == []
    assert clean.startswith(b"%PDF-")
    assert clean.count(b"startxref") == 1
    assert b"/ObjStm" not in clean
    assert b"Somebody Else" not in clean


@pytest.mark.parametrize("name", ["boarding.pdf", "ticket.pdf", "contract.pdf", "hostile.pdf"])
def test_page_one_looks_the_same_from_the_original_and_the_clean_copy(name: str) -> None:
    before = page_one(fixture(name))
    after = page_one(pdfs.clean(fixture(name)))
    assert before.size == after.size
    diff = ImageStat.Stat(ImageChops.difference(before, after)).mean
    assert max(diff) < 1.0, diff


def test_an_owner_password_comes_off_and_the_copy_is_not_encrypted() -> None:
    clean = pdfs.clean(fixture("restricted.pdf"))
    assert not pikepdf.open(io.BytesIO(clean)).is_encrypted


def test_a_locked_pdf_is_a_failure_with_a_reason() -> None:
    with pytest.raises(pdfs.Failed) as caught:
        pdfs.clean(fixture("locked.pdf"))
    assert caught.value.reason == "parse"


def test_the_cut_is_the_first_ten_pages_and_the_count_is_all_of_them() -> None:
    made = pdfs.make(fixture("contract.pdf"))
    assert made.pages == 48
    cut = pikepdf.open(io.BytesIO(made.cut))
    assert len(cut.pages) == 10
    assert every_name_in_every_stream(made.cut) == []


def test_harvest_collects_link_annotations_and_printed_urls() -> None:
    # 044 T3. The check-in hyperlink annotation and the printed manage URL
    # become candidates, in that order (annotations first, then text). The same
    # URL carried both as an annotation and as text is one entry. A javascript:
    # link and an over-2048-byte URL are dropped. http(s) only.
    made = pdfs.make(fixture("links.pdf"))
    assert made.candidates == [
        "https://lufthansa.com/checkin",
        "https://example.com/manage",
    ]


def test_harvest_is_empty_when_a_pdf_carries_no_links() -> None:
    assert pdfs.make(fixture("boarding.pdf")).candidates == []


def test_page_one_becomes_the_same_two_jpegs_a_photo_gets() -> None:
    made = pdfs.make(fixture("boarding.pdf"))
    thumb = Image.open(io.BytesIO(made.thumb))
    large = Image.open(io.BytesIO(made.large))
    assert thumb.format == large.format == "JPEG"
    assert thumb.size == (400, 400)
    assert max(large.size) == 2048
    assert made.pages == 1


def test_the_thumbnail_is_the_top_of_page_one_where_a_document_says_what_it_is() -> None:
    # A centred square of an A4 page is white margin; the top is the heading.
    # The eval's boarding pass: five lines of text, the first 72pt from the top
    # of an A4 page, nothing below the fifth. A centred square starts 123pt
    # down and misses the heading; a square from the top holds it, about 48px
    # into a 400px tile.
    page = (
        Path(__file__).parents[1] / "evals" / "fixtures" / "pdfs" / "boarding-pass.pdf"
    ).read_bytes()
    thumb = Image.open(io.BytesIO(pdfs.make(page).thumb)).convert("L")
    heading = thumb.crop((0, 30, 400, 60))
    assert heading.getextrema()[0] < 120, "the heading's ink should be in the tile"


def test_a_two_hundred_inch_page_is_drawn_under_sixty_megapixels() -> None:
    poster = pikepdf.new()
    poster.add_blank_page(page_size=(14400, 14400))
    out = io.BytesIO()
    poster.save(out)
    made = pdfs.make(out.getvalue())
    large = Image.open(io.BytesIO(made.large))
    assert max(large.size) == 2048


def test_the_look_gets_a_small_picture_of_page_one() -> None:
    picture = Image.open(io.BytesIO(pdfs.look_picture(fixture("ticket.pdf"))))
    assert picture.format == "JPEG"
    assert max(picture.size) == 400


async def test_the_child_makes_the_copies() -> None:
    result = await pdfs.run_pdf(fixture("boarding.pdf"))
    assert result.pages == 1
    assert result.clean.startswith(b"%PDF-")
    assert result.cut.startswith(b"%PDF-")
    assert Image.open(io.BytesIO(result.thumb)).size == (400, 400)


async def test_the_child_fails_with_an_enum_and_no_message() -> None:
    with pytest.raises(pdfs.Failed) as caught:
        await pdfs.run_pdf(b"%PDF-1.7 this is not a pdf")
    assert caught.value.reason == "parse"
    assert str(caught.value) == "parse"


async def test_the_child_is_killed_at_its_wall_clock() -> None:
    with pytest.raises(pdfs.Failed) as caught:
        await pdfs.run_pdf(fixture("contract.pdf"), timeout=0.001)
    assert caught.value.reason == "timeout"


async def test_the_child_runs_with_an_empty_environment(monkeypatch) -> None:
    seen: dict = {}
    real = asyncio.create_subprocess_exec

    async def spy(*args, **kwargs):
        seen.update(kwargs)
        return await real(*args, **kwargs)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spy)
    await pdfs.run_pdf(fixture("boarding.pdf"))
    assert seen["env"] == {}
    assert seen["stderr"] == asyncio.subprocess.DEVNULL


async def test_the_look_mode_returns_only_the_picture() -> None:
    picture = await pdfs.run_look(fixture("boarding.pdf"))
    assert max(Image.open(io.BytesIO(picture)).size) == 400
