The first 256KB of real pages, fetched on 2026-10-02 with offload's own user
agent, for spec 030's page reader. Kept as served so the tests read what a real
page gives inside the cap, not a fixture written to pass.

- `hotel-pestana-palace.html`: a `Hotel` in JSON-LD with a name and an address
  and no coordinates; the reader keeps the name.
- `listing-search-airbnb.html`: a listing search page; nothing usable.
