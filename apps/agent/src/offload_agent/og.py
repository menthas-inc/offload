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
import re
import socket
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

#: Carrier-grade NAT space, which `ipaddress` does not count as private and
#: which is nobody's public internet either.
_SHARED = ipaddress.ip_network("100.64.0.0/10")


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
    )


def _addresses(host: str) -> list[str]:
    """Every address the name answers with, or none on any failure."""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return []
    return [info[4][0] for info in infos]


def _is_public(host: str) -> bool:
    """Whether a hostname resolves only to addresses on the public internet.

    **Every address it resolves to**, not the first. A name can answer with one
    public address and one private one, and a client that checks the first and
    connects to whichever the stack picks has checked nothing.

    This is the whole SSRF guard. Without it, a dumped
    `https://169.254.169.254/latest/meta-data/` is our own cloud metadata
    endpoint fetched by our own server, and the reply would be the page's
    picture as far as everything downstream is concerned.
    """
    addresses = _addresses(host)
    if not addresses:
        return False
    return not any(_off_limits(ipaddress.ip_address(a)) for a in addresses)


async def _public_address(host: str) -> str | None:
    """The address to connect to, once every address the name gave has passed.

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


async def picture(client: httpx.AsyncClient, url: str) -> str | None:
    """The page's own image, or nothing. Raises nothing.

    A missing picture is the ordinary case and not a failure: most pages publish
    none, and a row without one draws its type glyph exactly as it always did.
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
                "user-agent": "offload/1.0 (+https://offload.club)",
                "host": _authority(parsed.hostname, parsed.port),
            },
            extensions={"sni_hostname": parsed.hostname},
        ) as response:
            if response.status_code != 200:
                return None
            if "html" not in response.headers.get("content-type", ""):
                return None

            head = bytearray()
            async for chunk in response.aiter_bytes():
                head.extend(chunk)
                if len(head) >= MAX_BYTES:
                    break
            head = bytes(head[:MAX_BYTES])
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

    tag = _META.search(head)
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
