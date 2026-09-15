"""The server tool specs are the ones the API actually accepts.

**Every field here was taken from documentation and never sent anywhere.** One
of them did not exist: `use_cache` on `web_fetch_20250910` was invented from a
reading of the docs, the API answered `Extra inputs are not permitted`, and
because the reader is stubbed in every other test the first thing to notice was a
phone. The turn looked like a model choosing not to look something up.

The SDK ships a TypedDict per server tool, so the check costs nothing and needs
no network: it is the vendor's own list of what a spec may contain, read from the
package that will be upgraded alongside the API.
"""

from typing import get_type_hints

from anthropic.types import WebFetchTool20250910Param, WebSearchTool20250305Param

from offload_agent.reader import _server_tools


def _allowed(param: type) -> set[str]:
    return set(get_type_hints(param).keys())


def test_the_fetch_tool_sends_only_fields_the_sdk_declares():
    spec = next(t for t in _server_tools(searches=0, fetches=1) if t["name"] == "web_fetch")
    extra = set(spec) - _allowed(WebFetchTool20250910Param)
    assert not extra, f"the API will refuse these: {extra}"


def test_the_search_tool_sends_only_fields_the_sdk_declares():
    spec = next(t for t in _server_tools(searches=3, fetches=0) if t["name"] == "web_search")
    extra = set(spec) - _allowed(WebSearchTool20250305Param)
    assert not extra, f"the API will refuse these: {extra}"


def test_a_turn_with_no_budget_sends_no_server_tools():
    """Not sent at all rather than sent and refused, so no call is spent on
    something that cannot work."""
    assert _server_tools(searches=0, fetches=0) == []
