"""041. What a PDF becomes before anybody sees it or the model reads it.

The **clean copy** is the PDF rewritten whole by qpdf (through pikepdf), with
every page drawn as it was and nothing else: annotations burned into their
pages and removed, which takes link actions, widget scripts, attachments,
media and form submission with them; the catalog's scripts, actions, forms,
attachments, outlines and metadata gone; every `/Metadata` on any object
gone; the document information gone. It is saved as one revision with no
object streams, so every dictionary sits in plain bytes for the Core API's
own scan, and then verified here by walking every object before it is
returned. It is the only form of a PDF any route serves.

Page 1 of the clean copy is rendered by PDFium (through pypdfium2) into the
same thumbnail and large JPEG a photo gets. The clean copy cut to its first
ten pages is what the model reads.

All of it runs in a child process: `run_pdf` starts `python -m
offload_agent.pdfs` with an empty environment, so a parser a hostile file
talked into something holds no token, no database URL and no API key; with
limits on memory, CPU time and file writes; killed at a wall clock; its
stderr discarded. A failure comes back as an enum, never a message, because
qpdf's and PDFium's errors can quote the file (OFF-1).
"""

from __future__ import annotations

import asyncio
import contextlib
import io
import json
import math
import struct
import sys
from dataclasses import dataclass

#: What the clean copy never carries, as a dictionary key or a name value.
KILL = frozenset(
    {
        "/JS",
        "/JavaScript",
        "/OpenAction",
        "/AA",
        "/Launch",
        "/SubmitForm",
        "/ImportData",
        "/GoToR",
        "/GoToE",
        "/URI",
        "/EmbeddedFile",
        "/EmbeddedFiles",
        "/FileAttachment",
        "/RichMedia",
        "/Movie",
        "/Sound",
        "/3D",
        "/XFA",
        "/AcroForm",
        "/Metadata",
        "/PieceInfo",
        "/Info",
        "/ObjStm",
        "/Encrypt",
        "/Rendition",
        "/URL",
        "/SetOCGState",
    }
)

_CATALOG = (
    "/OpenAction",
    "/AA",
    "/AcroForm",
    "/Names",
    "/Outlines",
    "/Metadata",
    "/PieceInfo",
    "/URI",
    "/Threads",
    "/SpiderInfo",
    "/Collection",
)
_PAGE = ("/AA", "/Annots", "/PieceInfo", "/Metadata")

#: Pages the model reads.
CUT_PAGES = 10
THUMB_PX = 400
LARGE_PX = 2048
LOOK_PX = 400
MAX_PIXELS = 60_000_000

#: The child's limits. Memory and CPU are set inside it before it reads a
#: byte; the wall clock is the parent's.
CHILD_MEMORY = 1024 * 1024 * 1024
CHILD_CPU_SECONDS = 30
WALL_SECONDS = 45.0


class Failed(Exception):
    """A PDF that could not be made safe or drawn. The reason is all it says."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class Made:
    clean: bytes
    cut: bytes
    thumb: bytes
    large: bytes
    pages: int


def _open(data: bytes):
    import pikepdf

    try:
        return pikepdf.open(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001
        # Locked, broken or not a PDF: the parser's words stay here.
        raise Failed("parse") from exc


def _save(pdf) -> bytes:
    import pikepdf

    out = io.BytesIO()
    pdf.save(
        out,
        encryption=False,
        object_stream_mode=pikepdf.ObjectStreamMode.disable,
        compress_streams=True,
        linearize=False,
        fix_metadata_version=False,
        deterministic_id=True,
    )
    return out.getvalue()


def _names(value, seen: set[tuple[int, int]]):
    """Every name in a value, as a key or a value, through arrays and
    dictionaries, each indirect object once."""
    import pikepdf

    if isinstance(value, pikepdf.Object) and value.is_indirect:
        ref = value.objgen
        if ref in seen:
            return
        seen.add(ref)
    if isinstance(value, pikepdf.Name):
        yield str(value)
    elif isinstance(value, pikepdf.Array):
        for item in value:
            yield from _names(item, seen)
    elif isinstance(value, pikepdf.Dictionary | pikepdf.Stream):
        for key in value.keys():  # noqa: SIM118 - a pikepdf Stream does not iterate its keys
            yield key
            yield from _names(value.get(key), seen)


def verify(clean: bytes) -> None:
    """Refuse a copy that still carries anything on the kill list, in any
    object reachable or not, or that is more than one revision."""
    if not clean.startswith(b"%PDF-") or clean.count(b"startxref") != 1:
        raise Failed("verify")
    pdf = _open(clean)
    seen: set[tuple[int, int]] = set()
    for name in _names(pdf.trailer, seen):
        if name in KILL:
            raise Failed("verify")
    for obj in pdf.objects:
        for name in _names(obj, seen):
            if name in KILL:
                raise Failed("verify")


def clean(original: bytes) -> bytes:
    """The clean copy, verified."""
    import pikepdf

    pdf = _open(original)
    try:
        pdf.flatten_annotations(mode="all")
        root = pdf.Root
        for key in _CATALOG:
            if key in root:
                del root[key]
        for page in pdf.pages:
            for key in _PAGE:
                if key in page.obj:
                    del page.obj[key]
        for obj in pdf.objects:
            if isinstance(obj, pikepdf.Dictionary | pikepdf.Stream) and "/Metadata" in obj:
                del obj["/Metadata"]
        if "/Info" in pdf.trailer:
            del pdf.trailer["/Info"]
        pdf.remove_unreferenced_resources()
        out = _save(pdf)
    except Failed:
        raise
    except Exception as exc:  # noqa: BLE001
        raise Failed("parse") from exc
    verify(out)
    return out


def cut(clean_copy: bytes, pages: int = CUT_PAGES) -> bytes:
    """The clean copy's first pages, for the model."""
    pdf = _open(clean_copy)
    try:
        if len(pdf.pages) > pages:
            del pdf.pages[pages:]
        pdf.remove_unreferenced_resources()
        return _save(pdf)
    except Exception as exc:  # noqa: BLE001
        raise Failed("parse") from exc


def _page_one(data: bytes, long_edge: int):
    """Page 1 as a PIL image at `long_edge` on its longer side, never over
    sixty megapixels, whatever size the page claims."""
    import pypdfium2 as pdfium

    try:
        doc = pdfium.PdfDocument(data)
        page = doc[0]
        width, height = page.get_size()
        scale = long_edge / max(width, height)
        if width * height * scale * scale > MAX_PIXELS:
            scale = math.sqrt(MAX_PIXELS / (width * height))
        return page.render(scale=scale).to_pil().convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise Failed("render") from exc


def _jpeg(image, quality: int) -> bytes:
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue()


def make(original: bytes) -> Made:
    """The clean copy, its cut, its count, and page 1's two JPEGs."""
    from PIL import Image, ImageOps

    copy = clean(original)
    page = _page_one(copy, LARGE_PX)
    # From the top, not the centre: a document says what it is in its heading,
    # and a centred square of a page is mostly margin.
    thumb = ImageOps.fit(page, (THUMB_PX, THUMB_PX), Image.Resampling.LANCZOS, centering=(0.5, 0.0))
    large = page.copy()
    large.thumbnail((LARGE_PX, LARGE_PX), Image.Resampling.LANCZOS)
    return Made(
        clean=copy,
        cut=cut(copy),
        thumb=_jpeg(thumb, 80),
        large=_jpeg(large, 85),
        pages=len(_open(copy).pages),
    )


def look_picture(original: bytes) -> bytes:
    """Page 1, small, for 026's look at an email's PDF. Drawn from the file as
    it arrived: rendering runs no script, and a PDF the look turns down never
    gets a clean copy."""
    return _jpeg(_page_one(original, LOOK_PX), 80)


# ------------------------------------------------------------------ the child

_PARTS = ("clean", "cut", "thumb", "large")


def _write(header: dict, parts: list[bytes]) -> None:
    raw = json.dumps(header).encode()
    out = sys.stdout.buffer
    out.write(struct.pack(">I", len(raw)))
    out.write(raw)
    for part in parts:
        out.write(part)
    out.flush()


def _limit() -> None:
    import resource

    for which, value in (
        (resource.RLIMIT_AS, CHILD_MEMORY),
        (resource.RLIMIT_CPU, CHILD_CPU_SECONDS),
        (resource.RLIMIT_FSIZE, 0),
    ):
        # macOS refuses RLIMIT_AS; Linux, where the worker runs, takes all three.
        with contextlib.suppress(ValueError, OSError):
            resource.setrlimit(which, (value, value))


def _main(mode: str) -> None:
    _limit()
    data = sys.stdin.buffer.read()
    try:
        if mode == "look":
            picture = look_picture(data)
            _write({"ok": True, "sizes": [len(picture)]}, [picture])
            return
        if mode.startswith("cut:"):
            shorter = cut(data, int(mode.removeprefix("cut:")))
            _write({"ok": True, "sizes": [len(shorter)]}, [shorter])
            return
        made = make(data)
        parts = [getattr(made, name) for name in _PARTS]
        _write({"ok": True, "pages": made.pages, "sizes": [len(p) for p in parts]}, parts)
    except Failed as failure:
        _write({"ok": False, "reason": failure.reason}, [])
    except MemoryError:
        _write({"ok": False, "reason": "memory"}, [])
    except Exception:  # noqa: BLE001
        _write({"ok": False, "reason": "parse"}, [])


async def _child(data: bytes, mode: str, timeout: float) -> tuple[dict, list[bytes]]:
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "offload_agent.pdfs",
        mode,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env={},
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(data), timeout)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise Failed("timeout") from None
    if len(out) < 4:
        raise Failed("memory" if proc.returncode and proc.returncode < 0 else "parse")
    (length,) = struct.unpack(">I", out[:4])
    header = json.loads(out[4 : 4 + length])
    if not header.get("ok"):
        raise Failed(str(header.get("reason", "parse")))
    parts: list[bytes] = []
    at = 4 + length
    for size in header["sizes"]:
        parts.append(out[at : at + size])
        at += size
    return header, parts


async def run_pdf(original: bytes, *, timeout: float = WALL_SECONDS) -> Made:
    """The copies, made in a bounded child."""
    header, parts = await _child(original, "make", timeout)
    return Made(**dict(zip(_PARTS, parts, strict=True)), pages=int(header["pages"]))


async def run_look(original: bytes, *, timeout: float = WALL_SECONDS) -> bytes:
    """Page 1's small picture, made in a bounded child."""
    _, parts = await _child(original, "look", timeout)
    return parts[0]


async def run_cut(clean_copy: bytes, pages: int, *, timeout: float = WALL_SECONDS) -> bytes:
    """The clean copy's first `pages` pages, cut in a bounded child: the clean
    copy still carries a stranger's page content, so the worker process never
    opens it either."""
    _, parts = await _child(clean_copy, f"cut:{int(pages)}", timeout)
    return parts[0]


if __name__ == "__main__":
    _main(sys.argv[1] if len(sys.argv) > 1 else "make")
