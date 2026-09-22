"""The picture a page publishes about itself, and everything it refuses.

Most of this file is the refusals, because this is the one place offload's own
server fetches a URL somebody typed. The privacy policy already says the site
receives a request from us; what it cannot cover is our network being used to
reach things only our network can see.
"""

import ipaddress

import httpx
import pytest

from offload_agent.og import MAX_BYTES, _is_public, picture

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
    ["127.0.0.1", "localhost", "169.254.169.254", "10.0.0.1", "192.168.1.1", "::1", "100.64.0.1"],
)
def test_nothing_on_our_own_network_is_public(host: str):
    """The whole SSRF guard. Without it a dumped
    `https://169.254.169.254/latest/meta-data/` is our own cloud metadata
    endpoint, fetched by our own server, and the reply would be "the page's
    picture" as far as everything downstream is concerned."""
    assert _is_public(host) is False


def test_a_real_name_is_public():
    assert _is_public("example.com") is True


async def test_the_request_goes_to_the_address_the_guard_checked():
    """Security review 2026-09-22, M14. The guard resolved the name once and the
    client resolved it again to connect, and a name can answer a public address
    to the first and a private one to the second. So the request goes to the
    address that passed, with the name carried as the Host and the SNI."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return html_response()

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await picture(client, "https://example.com/page") == "https://example.com/a.jpg?x=1&y=2"

    request = seen[0]
    ipaddress.ip_address(request.url.host)  # an address, never the name
    assert request.headers["host"] == "example.com"
    assert request.extensions.get("sni_hostname") == "example.com"


async def test_a_site_cannot_leave_a_cookie_for_the_next_person():
    """Security review 2026-09-22, L29. One client serves every fetch the
    worker makes, so a cookie a site set on one person's link would have been
    sent back on another person's. Nothing the worker talks to needs a jar."""

    def handler(request: httpx.Request) -> httpx.Response:
        response = html_response()
        response.headers["set-cookie"] = "tracker=abc; Path=/"
        return response

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await picture(client, "https://example.com/page") is not None
        assert len(client.cookies) == 0


async def test_a_page_is_read_only_as_far_as_the_cap():
    """Only the head is wanted. The cap used to be applied after the whole body
    had been read into memory, which is not a cap."""
    padding = b"<!--" + b"x" * MAX_BYTES + b"-->"
    assert await picture_from(padding + HEAD) is None
    assert await picture_from(HEAD + padding) == "https://example.com/a.jpg?x=1&y=2"


async def test_a_page_that_only_answers_through_a_redirect_keeps_its_picture():
    """A redirect is a second URL that nothing has checked, and following one is
    how the guard gets walked around."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://elsewhere.example.com/"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await picture(client, "https://example.com/page") is None


async def test_a_link_being_filed_gets_its_picture_without_a_lookup():
    """The picture is a property of filing a link, not a side effect of reading one.

    `https://www.bbc.co.uk/news` was filed without a lookup, correctly, because
    the model knows what that is. The row came out with no picture, because the
    image only arrived when `look_up` happened to run. Seen in production.
    """
    from offload_agent.config import Config
    from offload_agent.worker import Lookups, _tool_caller

    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/tool-call"):
            import json

            sent.append(json.loads(request.read()))
            return httpx.Response(200, json={"ok": True, "contentId": "c1"})
        return html_response()

    cfg = Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )
    dump = "https://example.com/page keep this"
    budget = Lookups(dump, may_search=True, may_read_links=True)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg, "job-1", lookups=(None, cfg, budget))
        await call(
            "add_content",
            "t1",
            {
                "thread_id": "th",
                "title": "A page",
                "type": "link",
                "url": "https://example.com/page",
            },
        )

    assert sent and sent[0]["imageUrl"] == "https://example.com/a.jpg?x=1&y=2"


async def test_a_url_the_model_composed_is_not_fetched():
    """Our own network making the request is the reason this rule exists."""
    from offload_agent.config import Config
    from offload_agent.worker import Lookups, _tool_caller

    fetched: list[str] = []
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/tool-call"):
            import json

            sent.append(json.loads(request.read()))
            return httpx.Response(200, json={"ok": True, "contentId": "c1"})
        fetched.append(str(request.url))
        return html_response()

    cfg = Config(
        database_url="postgresql+asyncpg://x/y",
        api_url="http://api.test",
        internal_token="t",
        anthropic_api_key="k",
    )
    budget = Lookups("nothing with a link in it", may_search=True, may_read_links=True)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        call = _tool_caller(client, cfg, "job-1", lookups=(None, cfg, budget))
        await call(
            "add_content",
            "t1",
            {
                "thread_id": "th",
                "title": "A page",
                "type": "link",
                "url": "https://example.com/invented",
            },
        )

    assert fetched == []
    assert sent and "imageUrl" not in sent[0]
