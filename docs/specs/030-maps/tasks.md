# 030 A thread's map, tasks

Every task starts with its test, run and seen red for the reason the task exists (QUAL-1). Tracks: server and agent first, because both clients read what they produce; then web, then the phones, which need a native build.

## 0. Setup

- [ ] **T0.1** Worktree `030-maps` (done). Its own databases (`offload_030_maps` for servers and devices, `offload_030_maps_test` for the suites), `env.sh` and `env-test.sh` in the scratchpad, launch entries that cd into it. *(process)*
- [ ] **T0.2** Design sync of 2026-10-02 on `main` (done, `09ba56b`). Nothing under `.claude/skills/offload-design/`, `docs/tech/` or `docs/constitution/` is edited in the worktree; those edits are T5.x, on `main`. *(OFF-7, process)*
- [ ] **T0.3** Owner, day one: a MapTiler account and a key, enough to capture fixtures (T0.4). Owner, in parallel and blocking only T5.4: a paid plan (commercial use, the European endpoint), four restricted keys, a spend cap and alert, and MapTiler's written no-training and retention terms and billing terms captured into `docs/tech/vendor-terms/maptiler/` with the date. Record whether a map is billed per page load or per map created against the impl-spec's web note. *(AC-30)*
- [ ] **T0.4** Before `MAPTILER_HOST`, `MIN_RELEVANCE` or `STYLE_URLS` are written: capture from `api.maptiler.eu`, with the key in a shell variable and never committed, geocoding responses for a POI, an address, a neighbourhood, a postcode, a country and a weak match, and the light and dark `style.json`. Confirm the European host answers for both geocoding and tiles; if it does not, stop and ask, since the privacy page's *European servers* rests on it. Also the first 256KB of a real listing, restaurant, hotel and event page. *(AC-2, AC-3, AC-7, AC-30)*
- [ ] **T0.5** On `main`, before any client work: tokens `--shadow-point`, `--shadow-callout`, `--map-attribution-ground` in the design system's token files; `pnpm tokens`; both generated files checked against each other; the worktree merges `main`. *(OFF-7)*

## 1. Server

### Foundation

- [ ] **T1.1** Migration `0068_places_maptiler.sql` and `schema.ts`. Tests: a `google` place and its pointers are gone and `place_lookups` is empty after migrating a seeded database; `provider` refuses `google`; `places.name` accepts null; `places.provider` has no default; `content.location` refuses a type other than event or link, 0 or 121 characters, and a newline; deleting a place nulls `connector_events.place_id`; `places` and `place_lookups` have no account column (column-list assertion). *(AC-1, AC-5, AC-8, OFF-3, DATA-1)*
- [ ] **T1.2** `places/query.ts`: `placeQuery`, `queryKey`, `isNoPlace`. Tests: trims, collapses, strips control characters; refuses a newline, `https://`, `www.`, 121 characters; `queryKey` differs with a different pepper and is stable for case and spacing; `isNoPlace` catches each listed word whole and not inside a name (*Zoomarine* is a place). *(AC-5, AC-6, AC-7, AC-8)*
- [ ] **T1.3** `maptilerGeocoder`. Tests on the captured fixtures with a stub `fetch`: POI and address exact; neighbourhood and postcode approximate with the area name; country null; weak match null; no `text` gives a null name, never the query; a request to any host but `api.maptiler.eu` throws before `fetch` is called; the request carries the query, the key, `limit=1` and `autocomplete=false` and nothing else, with no cookie, referrer or identifying header. *(AC-3, AC-7)*
- [ ] **T1.4** `resolvePlace` generalised. Tests: off (no key) is `skipped` and writes no `place_lookups` row; a location, an event's location and a link's page query each resolve; a miss older than 30 days is looked up again and a newer one is not; a stale job after a rename or an event-location edit ends `skipped` through `attach`'s query guard and the new job attaches; `places.provider` is `maptiler`; the log line carries id, outcome and latency and no query (asserted on the captured log). `reverseGeocodingOn()` is false with only `MAPTILER_GEOCODING_KEY` set. *(AC-7, AC-8, AC-31)*
- [ ] **T1.5** `attachPagePoint`. Tests: finite in-range coordinates attach a `page` place keyed on five decimals with a null name; 0,0, NaN, `1e999` and out-of-range are refused; two links with the same rounded point share one place. *(AC-2)*

### Filing and editing

- [ ] **T1.6** `add_content.location`. Tests: an event with a location stores it and books `location.resolve` in the transaction; a location on a link is 400 `location_not_here`; 121 characters or a newline is 400 `bad_place_name`; `location_not_here` is added to `ARGUMENT_REFUSALS` and both map to `declined`. *(AC-5, OFF-5)*
- [ ] **T1.7** The `worker` envelope on `add_content`. Tests: coordinates attach in the transaction and set `place_read_at`; a query is stored in `content.location` and books `location.resolve` whose `jobs.payload` is exactly `{ contentId }`; `pageRead` alone sets `place_read_at`; the envelope on a non-link is refused; with the author's switch off, or the geocoder off, the envelope is ignored and `place_read_at` stays null. *(AC-2, AC-7, SEC-2)*
- [ ] **T1.8** `edit_content.location`, the rename rule and `place_prior`. Tests: set and clear on an event, re-booking on set; null on a link clears `location` and the point and keeps `place_read_at`; a string on a link and any location on a location row are refused; renaming a location row re-books; the turn's Undo restores `location`, `place_id` and `place_read_at` from `place_prior` and books nothing; `PATCH /v1/content/:id` and every tool body refuse `placePrior`, `placeId`, `placeReadAt`, and a `location` that fails `placeQuery`. *(AC-9, OFF-6, SEC-2)*
- [ ] **T1.9** No place in a tool result or a prompt. Tests: the output keys of `list_thread_content`, `find_events` and every tool that returns rows contain none of `place`, `location`, `address`, `area`, `lat`, `lng`; agent side, a turn's built context for a thread with a located row and a located picked calendar event contains no place name, address, area or coordinate. *(AC-4, AC-6, OFF-8)*

### Calendars

- [ ] **T1.10** `resolveEventPlace` and `event.locate`. Tests: an event in the window with a location resolves and sets `place_id`, `located_location` and `located_at`; an unchanged location is not looked up again, a changed one is; a soft-deleted event is not a candidate; a URL or a no-place word is skipped; nothing is written to `place_lookups`; an event outside yesterday to +60 days is not a candidate; the account's 101st lookup in a day waits for tomorrow; the job's log lines carry ids, counts and outcomes only. *(AC-6, AC-7, OFF-4)*
- [ ] **T1.11** The triggers. Tests: a sync books `event.locate` only for selected calendars at least one thread picks; `setPick(true)` books it even inside a slot a sync already booked; unticking a calendar deletes the events and their place pointers and leaves the `places` row. *(AC-6, OFF-4)*
- [ ] **T1.12** The location crosses. Tests: `threadEvents` and `/v1/threads/:id/events` carry `location` and the place for another member's picked calendar; guests, description and `involved` for another member are as before; `today/day.ts` unchanged; with the geocoder off, neither carries a location. The four comments and 019's line updated in the same commit. *(AC-6)*

### Reads

- [ ] **T1.13** `ThreadBundle.hasPoint`. Tests: false for everything with the geocoder off; false for a thread with only a name-only location; true with a resolved location, link or event; true with an in-window picked event with a place; false once the last one is deleted, archived, moved out or its calendar unpicked; a stored `preference.widgets` of `["map","todo"]` reads as `["todo"]` and the stored row is unchanged. *(AC-10, AC-11, AC-24)*
- [ ] **T1.14** `GET /v1/threads/:id/points`. Tests: content and calendar points with every field the `Point` type names; labels in the thread's order; a non-member is 404; deleted and archived rows absent; a photo with coordinates and a note are absent; with the geocoder off, empty; 501 points returns 500, content first, and `truncated: true`; events nearest now first. *(AC-1, AC-29, SEC-2, OFF-3)*
- [ ] **T1.15** `/api/me.map`, GET and PATCH. Tests: each allowlisted `X-Offload-Client` gets its own key; an unset variable, a missing header or an unknown value gives `map: null`; the header never appears in a log line. *(AC-26)*

### The backfill

- [ ] **T1.16** `maps.backfill`. Tests: booked at boot only with the geocoder on, once by key; books `location.resolve` for each unresolved location row; books `link.place` only for links authored by an account whose switch is on, never for a link another member put in a thread that account is in; a second run books nothing. *(AC-25, OFF-3)*
- [ ] **T1.17** `POST /internal/v1/content/:id/page-location`. Tests: internal token required; refused when `jobId` is not a running `link.place` job naming this row; refused for a row already read, not a link, deleted, or whose author's switch is now off; coordinates attach and a query books a lookup; `place_read_at` is set either way. *(AC-25)*

## 2. Agent

- [ ] **T2.1** `og.page()`. Tests on the T0.4 captures and hand-made hostile fixtures: `og:latitude`/`longitude`, `place:location:*`, JSON-LD `geo`, JSON-LD `PostalAddress`, a `Place` name and `og:street-address` each give the right `PageLocation`; with `read_location=False` none is read and the image still is; a 70KB JSON-LD block, depth 50, a thousand small blocks, malformed JSON, `1e999`, and an address of 10,000 characters are dropped or cut to 120 without raising; `MAX_BYTES` unchanged; the log carries the outcome kind only. *(AC-2, SEC-1, OFF-1)*
- [ ] **T2.2** The worker's link path. Tests: with the switch on and `MAPS=on`, the payload carries the `worker` envelope; with either off, none and no location is parsed; a link where the model gave `image_url` is still read for a location and keeps the model's picture; model arguments carrying `page_location`, `pageLocation`, `worker` or `page_read` are removed from the final payload; a URL not in the dump gets no read. *(AC-2, AC-4)*
- [ ] **T2.3** `link.place` job kind. Tests: claimed by the worker, one attempt, posts the result with its `jobId`; a page that fails posts `found: null`; **a link whose author turned the switch off, was deleted or was already read after the job was booked is never fetched** (the stub fetcher records no request); the failure log carries the outcome kind only. *(AC-25, AC-7)*
- [ ] **T2.4** Tool models. Tests: `AddContent.location` refuses 121 characters and a newline; `EditContent` distinguishes absent from explicit null; `SetThreadPreference` refuses `map`. *(AC-5, AC-9, AC-24)*
- [ ] **T2.5** Filing prompt and eval cases in `08-the-calendar.json` (the six in the impl-spec, including clearing a link's point), plus widget-order cases without `map`. Running them is asked for separately. `/harness-map` regenerated. *(AC-5)*

## 3. Shared

- [ ] **T3.1** `packages/widgets`: `map` retired from `WIDGET_KINDS` and the earning rules. Tests: no thread earns `map`; `readPreference` drops it. *(AC-24)*
- [ ] **T3.2** `packages/widgets/src/map.ts`. Tests: `pointFill` for zero, one, two and three labels in thread order; `pointShape` for an event, a calendar event and a place; `cluster` merges points within 44px at a zoom and splits them one zoom in; `fitBounds` fits all with the stated padding and caps the fit at 15 for one point, while the cluster split may exceed 15; `calloutPadding` is min(190, 40%); `directionsUrl` for each platform carries only coordinates and the name where the platform takes one, and the web URL only coordinates. *(AC-14, AC-15, AC-18, AC-22)*

## 4. Clients

### Web

- [ ] **T4.1** Places retired: the heading, `<Pins>` and its placeholder surface go from `panes/Widgets.tsx`. Test: a thread with a resolved place renders no *Places*. *(AC-24)*
- [ ] **T4.2** `ThreadMap` with `maplibre-gl` loaded dynamically: style from `/api/me`, swapped on theme without a new instance; points, circles, count dot, callout and attribution as offload's views; reduced motion. Tests (jsdom with the map stubbed at its module boundary): one `new Map` per pane mount across a filter change, a theme change, a resize, a split change and a List and Map round trip, with the container never unmounted; no map module requested for a thread without a point; `map: null` draws nothing; the failure path logs no style URL. *(AC-18, AC-19, AC-20, AC-26, AC-28)*
- [ ] **T4.3** The split and the switch: the pane's `ResizeObserver` at 1000px with hysteresis; the switch in `PaneHead` below it; a `.paneLeft` thread draws neither; the per-thread choice in `localStorage` trimmed to 100; the composer held to the list column. Tests: splits at 1016, unsplits below 984, and does not flip between; the choice survives a reload; the composer's right edge at the list's, through the shell context. *(AC-12, AC-13)*
- [ ] **T4.4** Hover and pick: row hover scales its point; picking a point highlights its loaded row; an unloaded row's point still opens its callout; label pick filters both and calendar points hide; *Nothing under <label> on the map.* *(AC-14, AC-16, AC-17, AC-18)*
- [ ] **T4.5** `PlaceSheet` and Directions: rows present only, footer per source, Edit opens the row's existing edit; Directions an anchor with `rel="noreferrer noopener"` and the coordinates-only URL. Accessible names and keyboard order. *(AC-21, AC-22, AC-23)*
- [ ] **T4.6** *Couldn't load the map* with Try again on a style or tile failure. *(AC-27)*
- [ ] **T4.7** `X-Offload-Client: web` on every request. *(AC-26)*
- [ ] **T4.8** In the browser, both themes, at 1280 and 1000 and 900 wide, with and without a second pane: screenshots against `explorations/maps.html`. `dead-classes.mjs`, `dead-css.mjs`, `dead-icons.mjs`. *(AC-12 to AC-21)*

### Mobile (iOS and Android)

- [ ] **T4.9** Native: `@maplibre/maplibre-react-native` and its config plugin, `LSApplicationQueriesSchemes`, the app version bump; EAS development builds for both phones from the worktree. *(AC-26)*
- [ ] **T4.10** Places retired from `shell/Widgets.tsx` and `labels/LabelList.tsx`. *(AC-24)*
- [ ] **T4.11** The switch and the bar: `Segmented` moved out of `settings/` with an icon variant, drawn while `hasPoint`, labels and calendars moved first into More, iOS and Android treatments; Map body with the floating chips (no counts) and the composer; back returns to List; `lib/mapView.ts` per-thread choice trimmed to 100. Tests (jest): the bar's items with and without a point; the stored choice; back from Map. *(AC-11, AC-12)*
- [ ] **T4.12** `ThreadMap`, `Point`, `Callout`: one `MapView` per visit across toggles, filter, theme, kept mounted and hidden under List; `MarkerView` points, `CircleLayer` circles in metres, count dot, callout kept in frame; keyboard closes the callout and does not re-fit; a point arriving does not re-fit; reduced motion. *(AC-14, AC-15, AC-16, AC-18, AC-20, AC-21a, AC-28)*
- [ ] **T4.13** `PlaceSheet` on `DragSheet` at a half detent over `--surface-scrim`; Edit closes it and opens the row; Directions: Apple Maps, the action sheet when `comgooglemaps://` opens, `geo:` on Android. Accessible names. *(AC-21, AC-22, AC-23)*
- [ ] **T4.14** `X-Offload-Client: ios | android`; no switch with `map: null`; *Couldn't load the map*. *(AC-26, AC-27)*
- [ ] **T4.15** On a device, both phones, both themes: the bar at 390pt and at the largest text size; two neighbouring points' targets and the count dot's split; the keyboard over Map (AC-21a); the calendar point; Directions handing off; screenshots against the exploration. Leave each phone's settings as found. *(AC-12 to AC-23)*

## 5. On `main`, at the merge

- [ ] **T5.2** `.claude/skills/offload-design/decisions.md`: *2026-10-02 · A thread's map, as built (030)*, with **Design system impact** filled. *(OFF-7)*
- [ ] **T5.3** `docs/tech/decisions.md`: the superseding entries (feature spec section 13); `docs/tech/going-public.md` item 13 rewritten; 019's and 025's lines amended with a dated note. *(DEV-2)*
- [ ] **T5.4** The switch-on change, **only after T0.3**: the privacy policy's sections 3, 5, 6 and 11; the *Read links I paste* note and the calendar pick sheet copy on all three surfaces; `CONSENT_VERSION` moved; the five variables on `core-api` and `MAPS=on` on `agent`. Tests: the page carries each passage and no longer says *as a title and a time*; each client's note and pick sheet carry the new copy; the consent version test moves. *(AC-30, CLAUDE.md)*
- [ ] **T5.5** After switch-on: watch `maps.backfill` drain in the logs (counts only), then the cost sheet regenerated with MapTiler. *(AC-25)*

## Unresolved SHOULD-level flags

None. OFF-7 is satisfied by T0.5 and T5.2.
