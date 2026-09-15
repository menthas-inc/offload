"""The picture a page publishes about itself, and everything it refuses.

Most of this file is the refusals, because this is the one place offload's own
server fetches a URL somebody typed. The privacy policy already says the site
receives a request from us; what it cannot cover is our network being used to
reach things only our network can see.
"""

import httpx
import pytest

from offload_agent.og import _is_public, picture

#: `example.com` throughout, and that matters: the guard resolves the image's
#: host for real, so a made-up name like `cdn.example.com` fails the check and
#: the test would be asserting the wrong thing for the wrong reason.
HEAD = b"""<html><head>
<meta property="og:image" content="https://example.com/a.jpg?x=1&amp;y=2">
</head><body>hello</body></html>"""


def html_response(body: bytes = HEAD, status: int = 200, kind: str = "text/html") -> httpx.Response:
    return httpx.Response(status, content=body, headers={"content-type": kind})


async def picture_from(body: bytes = HEAD, **kw) -> str | None:
    def handler(request: httpx.Request) -> httpx.Response:
        return html_response(body, **kw)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        return await picture(client, "https://example.com/page")


async def test_it_finds_the_tag_and_unescapes_it():
    """A meta tag is HTML, so `&amp;` is what sits between query parameters.

    Wikipedia's own og:image carries three of them, and a URL with a literal
    `&amp;` in it fetches nothing. Found by running this against three real
    pages rather than by reading it.
    """
    assert await picture_from() == "https://example.com/a.jpg?x=1&y=2"


async def test_a_relative_tag_is_resolved_against_the_page():
    body = b'<html><head><meta property="og:image" content="/img/a.png"></head></html>'
    assert await picture_from(body) == "https://example.com/img/a.png"


async def test_twitters_spelling_counts_too():
    body = b'<html><head><meta name="twitter:image" content="https://example.com/t.png"></head></html>'
    assert await picture_from(body) == "https://example.com/t.png"


async def test_a_page_with_no_picture_is_not_a_failure():
    """The ordinary case. Most pages publish none and the row draws its glyph."""
    assert await picture_from(b"<html><head><title>x</title></head></html>") is None


async def test_a_non_page_is_left_alone():
    assert await picture_from(kind="application/pdf") is None
    assert await picture_from(status=404) is None


async def test_an_image_address_pointing_inside_the_network_is_refused():
    """A page can put anything in its own meta tag, including our own metadata
    endpoint. The tag is checked exactly as the page URL is."""
    body = b'<html><head><meta property="og:image" content="https://169.254.169.254/latest/"></head></html>'
    assert await picture_from(body) is None


async def test_an_http_image_is_refused():
    """It would be blocked as mixed content on an https app anyway, so allowing
    it here would only ever produce a row whose picture fails to draw."""
    body = b'<html><head><meta property="og:image" content="http://example.com/a.jpg"></head></html>'
    assert await picture_from(body) is None


@pytest.mark.parametrize(
    "host",
    ["127.0.0.1", "localhost", "169.254.169.254", "10.0.0.1", "192.168.1.1", "::1"],
)
def test_nothing_on_our_own_network_is_public(host: str):
    """The whole SSRF guard. Without it a dumped
    `https://169.254.169.254/latest/meta-data/` is our own cloud metadata
    endpoint, fetched by our own server, and the reply would be "the page's
    picture" as far as everything downstream is concerned."""
    assert _is_public(host) is False


def test_a_real_name_is_public():
    assert _is_public("example.com") is True


async def test_a_page_that_only_answers_through_a_redirect_keeps_its_picture():
    """A redirect is a second URL that nothing has checked, and following one is
    how the guard gets walked around."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://elsewhere.example.com/"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await picture(client, "https://example.com/page") is None
