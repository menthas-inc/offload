"""030 T2.1. What a page says about where it is, read from the same request as
its picture, and everything that reading refuses.

The page is somebody else's bytes. What comes out is coordinates or a place's
name, bounded, or nothing; never an address, never the page's words otherwise.
"""

import json
from pathlib import Path

import httpx
import pytest

from offload_agent.og import MAX_BYTES, page

FIXTURES = Path(__file__).parent / "fixtures" / "pages"


async def read(body: bytes, read_location: bool = True):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body, headers={"content-type": "text/html"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        return await page(client, "https://example.com/page", read_location=read_location)


def ld(obj: object) -> bytes:
    return b'<script type="application/ld+json">' + json.dumps(obj).encode() + b"</script>"


def html(*parts: bytes) -> bytes:
    return b"<html><head>" + b"".join(parts) + b"</head><body>hi</body></html>"


async def test_open_graph_coordinates():
    body = html(
        b'<meta property="og:latitude" content="38.7071">'
        b'<meta property="og:longitude" content="-9.1459">'
    )
    assert (await read(body)).location == {"lat": 38.7071, "lng": -9.1459}


async def test_place_location_coordinates():
    body = html(
        b'<meta property="place:location:latitude" content="38.7113">'
        b'<meta property="place:location:longitude" content="-9.1301">'
    )
    assert (await read(body)).location == {"lat": 38.7113, "lng": -9.1301}


async def test_json_ld_geo_on_a_restaurant():
    body = html(
        ld(
            {
                "@type": "Restaurant",
                "name": "Cervejaria Ramiro",
                "geo": {"latitude": 38.7208, "longitude": -9.1356},
            }
        )
    )
    assert (await read(body)).location == {"lat": 38.7208, "lng": -9.1356}


async def test_json_ld_place_name_on_an_event_venue():
    body = html(
        ld(
            {
                "@type": "Event",
                "name": "A concert",
                "location": {"@type": "Place", "name": "Coliseu dos Recreios"},
            }
        )
    )
    assert (await read(body)).location == {"name": "Coliseu dos Recreios"}


async def test_a_real_hotel_page_gives_its_name_and_not_its_address():
    body = (FIXTURES / "hotel-pestana-palace.html").read_bytes()
    assert (await read(body)).location == {"name": "Pestana Palace Lisboa"}


async def test_a_real_listing_search_gives_nothing():
    body = (FIXTURES / "listing-search-airbnb.html").read_bytes()
    assert (await read(body)).location is None


async def test_an_address_alone_gives_nothing():
    body = html(
        ld(
            {
                "@type": "Organization",
                "address": {"@type": "PostalAddress", "streetAddress": "Rua Augusta 12"},
            }
        ),
        b'<meta property="og:street-address" content="Rua Augusta 12">',
    )
    assert (await read(body)).location is None


async def test_nothing_is_read_for_a_place_unless_asked_and_the_picture_still_is():
    body = html(
        b'<meta property="og:image" content="https://example.com/a.jpg">',
        b'<meta property="og:latitude" content="38.7">'
        b'<meta property="og:longitude" content="-9.1">',
    )
    found = await read(body, read_location=False)
    assert found.location is None
    assert found.image == "https://example.com/a.jpg"


@pytest.mark.parametrize(
    "lat,lng",
    [("0", "0"), ("1e999", "1"), ("91", "0"), ("0", "181"), ("NaN", "1"), ("north", "1")],
)
async def test_coordinates_that_are_not_a_place_on_earth_are_dropped(lat: str, lng: str):
    body = html(
        f'<meta property="og:latitude" content="{lat}">'
        f'<meta property="og:longitude" content="{lng}">'.encode()
    )
    assert (await read(body)).location is None


async def test_a_name_is_cut_to_the_bound():
    body = html(ld({"@type": "Hotel", "name": "A" * 10_000}))
    assert (await read(body)).location == {"name": "A" * 120}


async def test_hostile_json_is_dropped_without_raising():
    deep = b'<script type="application/ld+json">' + b"[" * 50 + b"]" * 50 + b"</script>"
    big = (
        b'<script type="application/ld+json">'
        + json.dumps({"@type": "Hotel", "name": "x" * 70_000}).encode()
        + b"</script>"
    )
    broken = b'<script type="application/ld+json">{"@type": "Hotel", "name": </script>'
    many = ld({"@type": "Thing"}) * 1000
    for body in (html(deep), html(big), html(broken), html(many)):
        assert (await read(body)).location is None


async def test_a_place_past_ten_blocks_is_not_looked_for():
    body = html(ld({"@type": "Thing"}) * 10, ld({"@type": "Hotel", "name": "Late Hotel"}))
    assert (await read(body)).location is None


async def test_the_cap_is_unchanged():
    assert MAX_BYTES == 256_000
