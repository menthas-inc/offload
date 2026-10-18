"""The two copies a photo has, and what the file says about itself.

The worker is the one process that opens a photo, so it is the one reader of
its metadata and the one maker of its renditions: a thumbnail for tiles and a
large copy for the viewer and for the model, both JPEG, both without the
metadata the original carried. Bytes in over the internal route, bytes out the
same way; the worker never holds a key, and it never keeps a copy past the
turn (020).

Pillow, with the HEIC decoder registered, and a pixel bound the Core API
already enforced from the header, stated again here so a decoder cannot be
talked past it by a file that lied about its size.
"""

from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
import structlog
from PIL import Image, ImageOps

try:  # pragma: no cover - the wheel ships on Linux and macOS; a machine without it still runs
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:  # pragma: no cover
    pillow_heif = None

from offload_agent.config import Config

log = structlog.get_logger()

MAX_PIXELS = 60_000_000
# Pillow warns at the number and raises at twice it, so the bound the Core
# API already checks from the header is stated here at half, which puts the
# raise at the bound rather than at 120 megapixels.
Image.MAX_IMAGE_PIXELS = MAX_PIXELS // 2

THUMB_PX = 400
LARGE_PX = 2048

# EXIF tags, by number, so no dictionary lookup is one Pillow version away
# from returning a different name.
_EXIF_IFD = 0x8769
_GPS_IFD = 0x8825
_DATETIME_ORIGINAL = 0x9003
_MAKE = 0x010F
_MODEL = 0x0110


@dataclass(frozen=True)
class Made:
    thumb: bytes
    large: bytes
    taken_at: str | None
    latitude: float | None
    longitude: float | None
    device: str | None


class Unreadable(Exception):
    """Pillow could not open the file. Named rather than logged with its
    message, which can quote the bytes."""


def _dms(value, ref: str | None) -> float | None:
    try:
        deg, minutes, seconds = (float(v) for v in value)
    except (TypeError, ValueError):
        return None
    out = deg + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        out = -out
    return out


def _metadata(im: Image.Image) -> tuple[str | None, float | None, float | None, str | None]:
    try:
        exif = im.getexif()
    except Exception:  # noqa: BLE001
        return None, None, None, None
    taken_at: str | None = None
    raw = exif.get_ifd(_EXIF_IFD).get(_DATETIME_ORIGINAL)
    if isinstance(raw, str):
        try:
            taken_at = (
                datetime.strptime(raw.strip(), "%Y:%m:%d %H:%M:%S").replace(tzinfo=UTC).isoformat()
            )
        except ValueError:
            taken_at = None
    gps = exif.get_ifd(_GPS_IFD)
    lat = _dms(gps.get(2), gps.get(1)) if gps.get(2) else None
    lng = _dms(gps.get(4), gps.get(3)) if gps.get(4) else None
    if lat is not None and (abs(lat) > 90 or lng is None or abs(lng) > 180):
        lat, lng = None, None
    make = str(exif.get(_MAKE) or "").strip()
    model = str(exif.get(_MODEL) or "").strip()
    if make and model.startswith(make):
        model = model[len(make) :].strip()
    device = " ".join(p for p in (make, model) if p)[:80] or None
    return taken_at, lat, lng, device


def make(original: bytes) -> Made:
    """Both renditions and the metadata, from the bytes as they arrived."""
    try:
        im = Image.open(io.BytesIO(original))
        im.load()
    except Exception as exc:  # noqa: BLE001
        raise Unreadable() from exc

    # Read before transposing: the transpose resets the orientation tag, and
    # the rest of the record is read from the same object.
    taken_at, lat, lng, device = _metadata(im)

    # Down to the large copy's size before anything else touches it: turned,
    # flattened and converted at full size, a photo near the pixel bound cost
    # about 800 MB. In place, so the orientation tag is still there to read.
    # Pillow shrinks a palette or 1-bit image by nearest neighbour, so those
    # are widened first, as the flatten below would have.
    if im.mode in ("P", "1"):
        im = im.convert("RGBA")
    im.thumbnail((LARGE_PX, LARGE_PX), Image.Resampling.LANCZOS)
    im = ImageOps.exif_transpose(im) or im
    if im.mode in ("RGBA", "LA", "P"):
        # Flattened onto white. A screenshot with transparency is a screenshot
        # of a white page as far as a JPEG is concerned.
        base = Image.new("RGB", im.size, "white")
        rgba = im.convert("RGBA")
        base.paste(rgba, mask=rgba.getchannel("A"))
        im = base
    elif im.mode != "RGB":
        im = im.convert("RGB")

    thumb = ImageOps.fit(im, (THUMB_PX, THUMB_PX), Image.Resampling.LANCZOS)
    large = im

    # Nothing the file arrived with: no EXIF, no XMP, no ICC, and no JPEG
    # comment, which Pillow would otherwise copy from `info` into both
    # writes. A comment is arbitrary text an editor left behind, and both
    # renditions reach the model and every member of the thread.
    for image in (thumb, large):
        image.info.pop("comment", None)
    thumb_bytes = io.BytesIO()
    thumb.save(thumb_bytes, format="JPEG", quality=80, optimize=True, comment=b"")
    large_bytes = io.BytesIO()
    large.save(large_bytes, format="JPEG", quality=85, optimize=True, comment=b"")
    return Made(
        thumb=thumb_bytes.getvalue(),
        large=large_bytes.getvalue(),
        taken_at=taken_at,
        latitude=lat,
        longitude=lng,
        device=device,
    )


async def prepare(
    http: httpx.AsyncClient,
    cfg: Config,
    job_id: str,
    blob_id: str,
    *,
    already_made: bool,
) -> bytes | None:
    """The large rendition for the model, making and posting both when the
    Core API has none yet. None when the file could not be opened, which is
    posted so the row takes the plain-title path."""
    headers = {"authorization": f"Bearer {cfg.internal_token}"}
    response = await http.get(
        f"{cfg.api_url}/internal/v1/blobs/{blob_id}/original",
        params={"jobId": job_id},
        headers=headers,
        timeout=60.0,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()

    try:
        # Off the event loop: decoding and two encodes of a 60 megapixel file
        # is real CPU time, and a Stop lands at the next await. In a thread
        # the loop keeps its awaits and the cancel listener stays live.
        made = await asyncio.to_thread(make, response.content)
    except Unreadable:
        log.warning("photo unreadable", blob_id=blob_id, bytes=len(response.content))
        await http.post(
            f"{cfg.api_url}/internal/v1/blobs/{blob_id}/unreadable",
            json={"jobId": job_id},
            headers=headers,
            timeout=30.0,
        )
        return None

    if not already_made:
        fields: dict[str, str] = {}
        if made.taken_at:
            fields["takenAt"] = made.taken_at
        if made.latitude is not None and made.longitude is not None:
            fields["latitude"] = repr(made.latitude)
            fields["longitude"] = repr(made.longitude)
        if made.device:
            fields["device"] = made.device
        posted = await http.post(
            f"{cfg.api_url}/internal/v1/blobs/{blob_id}/renditions",
            params={"jobId": job_id},
            headers=headers,
            data=fields,
            files={
                "thumb": ("thumb.jpg", made.thumb, "image/jpeg"),
                "large": ("large.jpg", made.large, "image/jpeg"),
            },
            timeout=60.0,
        )
        posted.raise_for_status()
        # Sizes and a flag, never the metadata (OFF-1).
        log.info(
            "renditions made",
            blob_id=blob_id,
            thumb_bytes=len(made.thumb),
            large_bytes=len(made.large),
            located=made.latitude is not None,
        )
    return made.large
