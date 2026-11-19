"""The picture a page publishes about itself.

**Why this exists at all.** The obvious route was to ask the reader for it, and
that was tried first: `image` went into the wanted set, the model was asked, and
nothing came back. The provider's fetch returns the page as text, and
`og:image` lives in a `<meta>` tag in the head, which that text does not
contain. A field that can never be populated is the silent failure this codebase
has spent a week removing, so either we read the tag ourselves or the feature is
not real.

**This is our server fetching a URL somebody typed**, which is a different thing
from the provider doing it, and it is the reason most of this file is refusals.
The privacy policy already says the site receives a request from us; what it
cannot cover is our network being used as a way to reach things only our network
can see.
"""

from __future__ import annotations

import asyncio
import html
import ipaddress
import json
import re
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx
import structlog

log = structlog.get_logger(__name__)

#: Long enough for a head, short enough that nobody waits on it. The whole point
#: of the picture is that it is free; a slow one is not worth having.
TIMEOUT_SECONDS = 4.0

#: Only the head is wanted, and a head that is not in the first chunk is a page
#: whose markup nobody should be scraping anyway. Read up to here and no
#: further: the cap used to be applied after the whole body was in memory,
#: which is not a cap.
MAX_BYTES = 256_000

#: `og:image` first, then Twitter's, which is what pages that predate it use.
_META = re.compile(
    rb"""<meta[^>]+(?:property|name)\s*=\s*["'](og:image(?::secure_url)?|twitter:image)["'][^>]*>""",
    re.I,
)
_CONTENT = re.compile(rb"""content\s*=\s*["']([^"']+)["']""", re.I)
_META_OPEN = re.compile(rb"<meta", re.I)


def _tag(
    pattern: re.Pattern[bytes], opener: re.Pattern[bytes], head: bytes, position: int = 0
) -> re.Match[bytes] | None:
    """`pattern.search(head, position)`, in linear time.

    Searched directly, a pattern that starts `<meta[^>]+` retries from every
    later `<meta` when none of them is ever closed: over a minute for a head of
    unclosed tags, holding the whole process. No tag spans a `>`, so each stretch
    between two is tried once, from its first opener, which matches whenever a
    later one in the same stretch would.
    """
    while (close := head.find(b">", position)) != -1:
        start = opener.search(head, position, close)
        if start is not None and (found := pattern.match(head, start.start())):
            return found
        position = close + 1
    return None


#: Carrier-grade NAT space, which `ipaddress` does not count as private and
#: which is nobody's public internet either.
_SHARED = ipaddress.ip_network("100.64.0.0/10")

#: Deprecated IPv6 site-local space (RFC 3879), which `ipaddress` counts as
#: neither private nor reserved, so it would otherwise reach a legacy internal
#: network the same way a private v4 address would.
_SITE_LOCAL = ipaddress.ip_network("fec0::/10")


def _off_limits(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # An IPv4 address carried inside an IPv6 one is that IPv4 address; older
    # interpreters answer `is_private` for the wrapper rather than the payload.
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
        or (address.version == 4 and address in _SHARED)
        or (address.version == 6 and address in _SITE_LOCAL)
    )


def _addresses(host: str) -> list[str]:
    """Every address the name answers with, or none on any failure."""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return []
    return [info[4][0] for info in infos]


async def _public_address(host: str) -> str | None:
    """The address to connect to, once every address the name gave has passed.

    This is the whole SSRF guard. Without it, a dumped
    `https://169.254.169.254/latest/meta-data/` is our own cloud metadata
    endpoint fetched by our own server, and the reply would be the page's
    picture as far as everything downstream is concerned. **Every address**,
    not the first: a name can answer with one public address and one private
    one.

    Resolved off the event loop, since a slow resolver would otherwise stall
    every job, and resolved once: the request below goes to this address
    rather than to the name, so a name that answers differently a second time
    has nothing to answer to. That second answer is the rebinding window the
    security review of 2026-09-22 named (M14).
    """
    addresses = await asyncio.to_thread(_addresses, host)
    if not addresses:
        return None
    if any(_off_limits(ipaddress.ip_address(a)) for a in addresses):
        return None
    return addresses[0]


def _authority(host: str, port: int | None) -> str:
    """`host` as a URL wants it, brackets and all, with the port if it had one."""
    literal = f"[{host}]" if ":" in host else host
    return literal if port is None else f"{literal}:{port}"


async def _fetch_head(client: httpx.AsyncClient, url: str) -> bytes | None:
    """The first `MAX_BYTES` of a page, or nothing. Raises nothing.

    One request, through the guard, for both the picture and (030) the place:
    a page is asked once whatever is read from it.
    """
    parsed = urlparse(url)
    # https only, matching the column and the client. An http page cannot have
    # its image drawn on an https app anyway.
    if parsed.scheme != "https" or not parsed.hostname:
        return None
    address = await _public_address(parsed.hostname)
    if address is None:
        log.info("picture refused", why="not public")
        return None

    # The request goes to the address that passed, and the name rides along as
    # the Host header and the SNI, which is also what the certificate is
    # checked against.
    target = parsed._replace(netloc=_authority(address, parsed.port)).geturl()
    try:
        # A deadline for the whole request. The client's timeout is per read, so
        # a site sending a byte every few seconds would otherwise never end.
        async with asyncio.timeout(TIMEOUT_SECONDS):
            # **No redirects.** A redirect is a second URL that nothing has checked,
            # and following one is how the guard above gets walked around. A page
            # that only serves through a redirect keeps its picture to itself.
            async with client.stream(
                "GET",
                target,
                timeout=TIMEOUT_SECONDS,
                follow_redirects=False,
                headers={
                    "accept": "text/html",
                    "accept-encoding": "identity",
                    "user-agent": "offload/1.0 (+https://offload.club)",
                    "host": _authority(parsed.hostname, parsed.port),
                },
                extensions={"sni_hostname": parsed.hostname},
            ) as response:
                if response.status_code != 200:
                    return None
                if "html" not in response.headers.get("content-type", ""):
                    return None
                # Uncompressed only: a decoder inflates each read in full before
                # the cap below sees it, so 1 MB of gzip can arrive as one 67 MB
                # chunk. Past this check the bytes below are the bytes sent.
                if response.headers.get("content-encoding", "identity") not in ("", "identity"):
                    return None

                head = bytearray()
                async for chunk in response.aiter_bytes():
                    head.extend(chunk)
                    if len(head) >= MAX_BYTES:
                        break
                return bytes(head[:MAX_BYTES])
    except Exception as exc:  # noqa: BLE001
        # The type only. A URL is somebody's own content and an exception string
        # from a fetch carries it (OFF-1).
        log.info("picture unavailable", error_type=type(exc).__name__)
        return None
    finally:
        # Whatever the site set, forgotten. The client is shared across every
        # fetch the worker makes, and nothing it talks to needs a jar, so a
        # cookie kept here would be one person's link answering on another's.
        client.cookies.clear()


async def _image_from(head: bytes, url: str) -> str | None:
    tag = _tag(_META, _META_OPEN, head)
    if tag is None:
        return None
    content = _CONTENT.search(tag.group(0))
    if content is None:
        return None

    try:
        # **Unescaped, because a meta tag is HTML.** Wikipedia's own og:image
        # carries `&amp;` between its query parameters, and a URL with a literal
        # `&amp;` in it fetches nothing. Caught by running this against three
        # real pages rather than by reading it.
        found = html.unescape(content.group(1).decode("utf-8", "ignore")).strip()
    except Exception:  # noqa: BLE001
        return None

    # Relative is legal in the tag and useless to a client, so it is resolved
    # against the page. The result still has to be https and public: a page can
    # put anything in its own meta tag, including an address on our network.
    absolute = urljoin(url, found)
    where = urlparse(absolute)
    if where.scheme != "https" or not where.hostname:
        return None
    if await _public_address(where.hostname) is None:
        log.info("picture refused", why="image not public")
        return None
    if len(absolute) > 2000:
        return None

    return absolute


# 030. Where a page says it is.
#
# **Somebody else's bytes, read for two things and nothing else**: coordinates
# the page publishes, or the name of the place it is about. Never an address,
# which cannot be sent to Google and with no coordinates would draw nowhere,
# and never the page's other words. Every bound below is a refusal, silent,
# because a page with no location is the ordinary case.

#: A place's name is held to the bound a saved place's name has.
PLACE_NAME_CHARS = 120

#: At most this many JSON-LD blocks are looked at, each at most this big and
#: nested at most this deep before it is parsed at all.
LD_BLOCKS = 10
LD_BLOCK_BYTES = 64_000
LD_DEPTH = 20

_GEO_META = re.compile(
    rb"""<meta[^>]+(?:property|name)\s*=\s*["'](og:latitude|og:longitude|place:location:latitude|place:location:longitude)["'][^>]*>""",
    re.I,
)
_LD = re.compile(rb"""<script[^>]+type\s*=\s*["']application/ld\+json["'][^>]*>""", re.I)
_LD_OPEN = re.compile(rb"<script", re.I)
_LD_END = re.compile(rb"</script\s*>", re.I)

#: schema.org types that are a place, so their name is a place's name. An
#: Organization or a Brand is not: a hotel group is not a hotel.
_PLACE_TYPES = {
    "Place",
    "LocalBusiness",
    "Hotel",
    "LodgingBusiness",
    "Hostel",
    "Motel",
    "Resort",
    "BedAndBreakfast",
    "Restaurant",
    "FoodEstablishment",
    "BarOrPub",
    "CafeOrCoffeeShop",
    "Bakery",
    "Winery",
    "Brewery",
    "TouristAttraction",
    "Museum",
    "LandmarksOrHistoricalBuildings",
    "EventVenue",
    "MusicVenue",
    "StadiumOrArena",
    "Park",
    "Beach",
    "Zoo",
    "Aquarium",
    "MovieTheater",
    "PerformingArtsTheater",
    "Accommodation",
    "VacationRental",
    "Campground",
    "Store",
    "ShoppingCenter",
    "CivicStructure",
    "PlaceOfWorship",
    "Church",
    "Airport",
    "TrainStation",
    "BusStation",
}


def _coordinate(raw: object, bound: float) -> float | None:
    try:
        value = float(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if value != value or value in (float("inf"), float("-inf")) or abs(value) > bound:
        return None
    return value


def _point(lat: object, lng: object) -> dict | None:
    a, b = _coordinate(lat, 90.0), _coordinate(lng, 180.0)
    if a is None or b is None or (a == 0 and b == 0):
        return None
    return {"lat": a, "lng": b}


def _meta_point(head: bytes) -> dict | None:
    seen: dict[str, str] = {}
    position = 0
    while (tag := _tag(_GEO_META, _META_OPEN, head, position)) is not None:
        position = tag.end()
        content = _CONTENT.search(tag.group(0))
        if content:
            seen[tag.group(1).decode().lower()] = html.unescape(
                content.group(1).decode("utf-8", "ignore")
            )
    for lat, lng in (
        ("og:latitude", "og:longitude"),
        ("place:location:latitude", "place:location:longitude"),
    ):
        if lat in seen and lng in seen:
            point = _point(seen[lat], seen[lng])
            if point:
                return point
    return None


def _too_deep(raw: bytes) -> bool:
    depth = 0
    for byte in raw:
        if byte in (0x5B, 0x7B):  # [ {
            depth += 1
            if depth > LD_DEPTH:
                return True
        elif byte in (0x5D, 0x7D):  # ] }
            depth -= 1
    return False


def _ld_blocks(head: bytes) -> list[object]:
    out: list[object] = []
    position = 0
    while len(out) < LD_BLOCKS:
        start = _tag(_LD, _LD_OPEN, head, position)
        if start is None:
            break
        end = _LD_END.search(head, start.end())
        if end is None:
            break
        position = end.end()
        raw = head[start.end() : end.start()]
        if len(raw) > LD_BLOCK_BYTES or _too_deep(raw):
            out.append(None)
            continue
        try:
            out.append(json.loads(raw.decode("utf-8", "ignore")))
        except (ValueError, RecursionError):
            out.append(None)
    return out


#: A page about many places is not about one: a search result's list of
#: listings would otherwise give the first listing's name (seen on a real
#: listing search page, 2026-10-02).
_LIST_TYPES = {"ItemList", "SearchResultsPage", "CollectionPage", "OfferCatalog"}


def _walk(node: object, depth: int = 0):
    if depth > LD_DEPTH:
        return
    if isinstance(node, dict):
        if _types(node) & _LIST_TYPES:
            return
        yield node
        for value in node.values():
            yield from _walk(value, depth + 1)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value, depth + 1)


def _types(node: dict) -> set[str]:
    kind = node.get("@type")
    if isinstance(kind, str):
        return {kind}
    if isinstance(kind, list):
        return {k for k in kind if isinstance(k, str)}
    return set()


def _location_from(head: bytes) -> dict | None:
    point = _meta_point(head)
    if point:
        return point
    nodes = [n for block in _ld_blocks(head) for n in _walk(block)]
    for node in nodes:
        geo = node.get("geo")
        if isinstance(geo, dict):
            found = _point(geo.get("latitude"), geo.get("longitude"))
            if found:
                return found
    for node in nodes:
        name = node.get("name")
        if _types(node) & _PLACE_TYPES and isinstance(name, str):
            clean = " ".join(html.unescape(name).split())[:PLACE_NAME_CHARS]
            if clean:
                return {"name": clean}
    return None


@dataclass(frozen=True)
class PageMeta:
    image: str | None
    location: dict | None


async def page(client: httpx.AsyncClient, url: str, read_location: bool = False) -> PageMeta:
    """A page's own picture and, when asked, where it says it is. Raises nothing.

    `read_location` is the dumper's *Read links I paste* and the map being on,
    both decided by the caller; without it the page is read for its picture
    alone, exactly as before 030.
    """
    head = await _fetch_head(client, url)
    if head is None:
        return PageMeta(image=None, location=None)
    image = await _image_from(head, url)
    location = None
    if read_location:
        try:
            location = _location_from(head)
        except Exception as exc:  # noqa: BLE001
            log.info("place unreadable", error_type=type(exc).__name__)
        log.info(
            "place read",
            outcome="point" if location and "lat" in location else "name" if location else "none",
        )
    return PageMeta(image=image, location=location)


async def picture(client: httpx.AsyncClient, url: str) -> str | None:
    """The page's own image, or nothing. Raises nothing.

    A missing picture is the ordinary case and not a failure: most pages publish
    none, and a row without one draws its type glyph exactly as it always did.
    """
    return (await page(client, url)).image
