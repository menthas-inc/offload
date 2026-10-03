"""030. A kept link's page read once more, for where it is.

The one pass the Core API runs when the map is switched on books this for each
link a person pasted themselves while *Read links I paste* was on. Production
holds one account, so it is a short list, read one at a time with no retry.

**Everything the pass checked is checked again here, before any request
leaves**, because a link can be deleted, read, or have its author's switch
turned off between booking and now, and the page seeing our server again is
exactly what that switch is for. The Core API checks the same once more when the
result arrives: the worker is not trusted for an access decision.

**Nothing here logs a URL or what the page said.** The outcome kind only.
"""

from __future__ import annotations

import httpx
import structlog
from sqlalchemy import text

from offload_agent.config import Config
from offload_agent.og import page
from offload_agent.queue import ClaimedJob, finish

log = structlog.get_logger()

KINDS = ["link.place"]

_READABLE = text(
    """
    select c.url
    from content c
    join accounts a on a.id = c.account_id
    join messages m on m.id = c.derived_from_message_id
    where c.id = :content_id
      and c.type = 'link'
      and c.deleted_at is null
      and c.place_read_at is null
      and c.url is not null
      and a.web_links_enabled = true
      and m.account_id = c.account_id
      and position(c.url in coalesce(m.text, '')) > 0
    """
)


async def handle_link_place(
    job: ClaimedJob, *, cfg: Config, engine, http: httpx.AsyncClient
) -> None:
    content_id = str(job.payload.get("contentId") or "")
    url = None
    if cfg.maps_on and content_id:
        async with engine.connect() as conn:
            url = (await conn.execute(_READABLE, {"content_id": content_id})).scalar_one_or_none()

    if not url:
        log.info("link place", outcome="not_readable")
        async with engine.begin() as conn:
            await finish(conn, job.id)
        return

    meta = await page(http, str(url), read_location=True)
    try:
        response = await http.post(
            f"{cfg.api_url}/internal/v1/content/{content_id}/page-location",
            json={"jobId": job.id, "found": meta.location},
            headers={"authorization": f"Bearer {cfg.internal_token}"},
            timeout=30.0,
        )
        outcome = "posted" if response.status_code == 200 else f"refused_{response.status_code}"
    except Exception as exc:  # noqa: BLE001
        outcome = f"unposted_{type(exc).__name__}"
    found = "none" if not meta.location else "point" if "lat" in meta.location else "name"
    log.info("link place", outcome=outcome, found=found)
    async with engine.begin() as conn:
        await finish(conn, job.id)
