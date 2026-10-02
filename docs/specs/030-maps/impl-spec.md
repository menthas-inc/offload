# 030 A thread's map: implementation

Reads with `feature-spec.md`. Where the two disagree, the feature spec wins and this file is wrong. Google's terms are quoted from the pages as read on 2026-10-02 (captured in T0.3); where this file says "the terms", it means those captures.

## What is already true, and what that settles

- **The lookup boundary exists** (`apps/core-api/src/places/resolve.ts`, 006): a `Geocoder` function type, `resolvePlace(contentId, geocode)`, two caches (`places`, `place_lookups`), a `location.resolve` job booked in the same transaction as a `location` row (`routes/tools.ts:1838`), a payload of an id and nothing else (`jobs/handlers.ts:315`), and a log line of id, outcome and latency (`jobs/handlers.ts:320`). This feature generalises it rather than adding a second one. `googleGeocoder` today asks Text Search for `places.id,places.displayName,places.formattedAddress,places.location`, which is the Pro tier and stores what the terms forbid storing; it is replaced.
- **Google was never on.** `GOOGLE_MAPS_API_KEY` is unset in production (`docs/tech/going-public.md` item 13), so `googleGeocoder` returned null for every lookup and `resolvePlace` wrote **a remembered miss for every location ever saved**. No `places` row exists in production.
- **What Google allows us to keep** (Service Specific Terms, Places API): place ids indefinitely; latitude and longitude "for up to 30 consecutive calendar days"; nothing else, so no name, address, address component or type. Results may be shown next to a Google map and must not be used with a non-Google map (billing outside the EEA, owner, 2026-10-02). **What we must not send**: any end user's personally identifiable information, or any European end user's personal data (Terms of Service 4.4(c)(ii)). **What Google does with what it receives**: keeps it and uses it "to provide and improve Google products and services", as an independent controller (4.4(a), (b)). **What it costs**: Text Search Essentials (IDs only) and the phones' Maps SDK are free without limit; Place Details Essentials and web map loads are free to 10,000 a month; a cloud map id on a phone moves its loads onto the billed web SKU.
- **The link's page is already fetched by code, outside the model**: `og.picture()` in the agent worker (`og.py`), called for a link in the dump (`worker.py:659-669`, gated by `_in_the_dump`, and today only when the model gave no `image_url`), with the SSRF guard, no redirects, 4s and 256KB.
- **The quarantined reader already has a `place` field** (`reader.py:52`), the bounded way a page's venue reaches the model.
- **`connector_events.location` is already stored** (0049); `threadEvents` deliberately does not select it today.
- **The thread's list is paged** (30 a page, 025), so the map's points are their own read.
- **Shared pure logic lives in `packages/widgets`**, read by both clients and the API.
- **Tokens are generated from the design system's own files** (`packages/tokens/src/generate.mjs` reads `.claude/skills/offload-design/tokens/`), so new tokens are added there, on `main`.
- **`runtimeVersion` is `appVersion`** (`apps/mobile/app.json:175`), so an update reaches only builds of the same app version.
- **The web has its own theme setting** (`apps/web/src/lib/appearance.ts`: light, dark, system; light by default). The phones follow the device.
- **The turn's Undo** (`routes/dumps.ts` `undoTurn`) soft-deletes what a turn created and restores question answers; it has no path for a field edited on an existing row. A separate task covers that in general; this feature restores its own place fields.
- **The agent worker claims jobs by kind** (`worker.py:72`).

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Places attached: 20 typical, 300 heavy. Links: 50 typical, 1,000 heavy. Events with a location: 10 typical, 100 heavy. Picked calendar events in the window (yesterday to +60 days): 20 typical, 400 heavy. |
| Fan-out | Points per thread: 5 typical, 60 heavy for content; plus up to the window's calendar events, 100 heavy. The read stops at 500. |
| Growth | 1 to 3 new points a week for an active account. Every attached Google place costs one Place Details call a month to stay under the thirty-day rule. |
| Read pattern | `hasPoint` on every thread bundle read (an EXISTS, both clients, every thread open). The points read once per Map or column visit and after a change to the thread. |
| Write pattern | Two calls per new located row (a free id search and a Details call), in a background job. Calendar lookups after each sync (15 minutes) for new or changed locations only, at most 100 an account a day. The refresh, once a day, for places whose coordinates are 25 days old. The backfill once. |
| Sort and filter | Points: `content.thread_id = ? and place_id is not null and deleted_at is null and archived_at is null` joined to `places.lat is not null`, plus picked calendar events by `calendar_id in (picks) and occurs_at between`. `hasPoint`: the same as an EXISTS. Calendar candidates: `deleted_at is null and location is not null and location is distinct from located_location` per calendar. Refresh: `places.provider = 'google' and coords_at < now() - 25 days`. Backfill: `type='link' and place_read_at is null and account_id = ?`; `type='location' and place_id is null`. |

**What follows.**
- **Pagination:** none for points; a hard limit of 500, content first by `created_at desc`, then events nearest now, with `truncated: true` past it.
- **Indexes:** `content (thread_id) where place_id is not null and deleted_at is null` (partial) serves `hasPoint` and the points read. `places (coords_at) where provider = 'google' and lat is not null` serves the refresh. `connector_events (calendar_id, occurs_at)` exists (019).
- **Normalisation:** `hasPoint` is computed, not stored.
- **Cost at a thousand people** (feature spec, *Why*): Details calls a few thousand a month (new places plus refreshes), inside the free 10,000; web loads inside 10,000; phones and id searches free.
- **Partitioning:** none.

## Data model

Migration `0068_places_google.sql` (0067 is taken):

```sql
-- No place ever resolved in production; a local database may hold some, each
-- carrying a name and an address Google's terms do not let us keep. Every
-- remembered miss was written with no key set and is not a miss.
update content set place_id = null where place_id is not null;
update notes set place_id = null where place_id is not null;
delete from place_lookups;
delete from places;

-- What Google lets us keep: its place id (provider_place_id) indefinitely,
-- and the coordinates for at most thirty days. Never its name, its address
-- or its types. A page place keeps its coordinates as long as it likes:
-- they are the page's, not Google's.
alter table places drop column name;
alter table places drop column formatted_address;
alter table places drop constraint places_provider_check;
alter table places add constraint places_provider_check
  check (provider in ('google', 'page'));
alter table places alter column provider drop default;
alter table places add column approximate boolean not null default false;
-- When the coordinates were fetched; the refresh keys on it, and nulls the
-- coordinates of a Google place at thirty days whatever else happens.
alter table places add column coords_at timestamptz;
alter table places drop column resolved_at;

-- What a row that is not a `location` is looked up by, or shown as: an
-- event's location (written by the model from the dump or the reader's
-- `place` field), or the address or place name a link's page gave, kept
-- with the link (privacy page, section 5). On the row, never in a job
-- payload. Bounded here as well as in code.
alter table content add column location text;
alter table content add constraint content_location_shape check (
  location is null or (
    type in ('event', 'link')
    and char_length(location) between 1 and 120
    and location !~ '[\r\n]'
  )
);

-- A link's page was read for a location, at filing or by the backfill. Set
-- whether or not anything was found, and kept when a person clears the
-- point, so a cleared link is never read again.
alter table content add column place_read_at timestamptz;

-- The place fields as they were before a turn's edit_content changed them,
-- so that turn's Undo can put them back. Written and read by the server
-- alone, never accepted from a request body.
alter table content add column place_prior jsonb;

alter table connector_events add column place_id uuid
  references places (id) on delete set null;
-- The location text last looked up, so an unchanged location is never looked
-- up twice; plaintext beside `location` in the same row, and never written to
-- place_lookups. Goes with the row when the copy goes (019).
alter table connector_events add column located_location text;
-- When, which the per-account daily ceiling counts.
alter table connector_events add column located_at timestamptz;

create index content_points on content (thread_id)
  where place_id is not null and deleted_at is null;
create index places_refresh on places (coords_at)
  where provider = 'google' and lat is not null;
```

`schema.ts` mirrors it. `notes.place_id` (0033) stays, unused, as before. `places` and `place_lookups` stay account-free; a test asserts both tables' column lists.

**Place keys.** A `google` place keys on Google's place id (`provider_place_id`). A `page` place keys on its coordinates rounded to five decimals (`"38.71130,-9.13010"`), never approximate, never refreshed, no `place_lookups` row.

**Places on rows.** `content.place_id` attaches to `location`, `link` and `event` rows. **A page place drives nothing on the server**: its coordinates are drawn and handed to Google Maps when a person taps Directions.

## Interfaces

### Core API

**`places/query.ts`** (new):
- `placeQuery(raw: string): string | null`. NFC, remove control characters, trim, collapse whitespace; null when it holds a newline, is empty or over 120 characters, **holds a digit**, an `@`, `://` or a leading `www.`, a possessive (`'s` or `’s` at a word's end), or is a no-place word (whole-word, case-insensitive: *zoom, google meet, meet, teams, webex, whereby, jitsi, online, phone, call, tbc, tbd*). The one gate in front of Google.
- `queryKey(q)`: HMAC-SHA256 of the lowercased query with `PLACE_HASH_PEPPER`. Used by `place_lookups` only.

**`places/google.ts`** (new), the only module that calls Google's place APIs:
- `PLACES_HOST = "places.googleapis.com"`, a constant; a test asserts no other host is reached.
- `searchId(q)`: `POST https://places.googleapis.com/v1/places:searchText`, header `X-Goog-Api-Key`, `X-Goog-FieldMask: places.id` (Text Search Essentials, IDs only), body `{ textQuery: q, pageSize: 1 }`. Nothing else: no language, region or location bias derived from a person. Returns the first id or null.
- `details(id)`: `GET https://places.googleapis.com/v1/places/{id}`, `X-Goog-FieldMask: location,types` (Place Details Essentials). Returns `{ lat, lng, types }` or null.
- `kindOf(types)`: `coarse` for `country`, `administrative_area_level_1`, `administrative_area_level_2`, `continent`; `area` for `locality`, `sublocality*`, `neighborhood`, `postal_code*`, `administrative_area_level_3` and below, `colloquial_area`, `political` alone; `spot` otherwise.
- 8s timeout each, `fetch` with no cookie or referrer, errors not inspected. A test asserts the field masks exactly, since the mask is the bill.

**`places/resolve.ts`**, rewritten around those:
- `mapsOn()`: `Boolean(env.GOOGLE_MAPS_API_KEY) && env.MAPS === "on"`. Off: `resolvePlace` returns `skipped` before reading the cache and writes nothing; everything below that says "while on" checks it.
- `Geocoder` becomes `(q) => Promise<{ placeId: string; lat: number; lng: number; approximate: boolean } | null>`; `googleGeocoder` is `searchId`, then `details`, then `kindOf` (`coarse` → null). Tests pass a stub.
- `resolvePlace(contentId, geocode = googleGeocoder)`: reads the row; the query is the row's `title` for a `location` and its `location` for an `event` or a `link`; `placeQuery` it; null → `skipped`. Cache read by `queryKey`: a hit whose place still has coordinates attaches; a hit whose place lost them (past thirty days, detached) is fetched again by `details`; a miss older than 30 days is deleted and looked up again. On a result, upsert `places` on `(provider, provider_place_id)` with coordinates and `coords_at = now()`, write `place_lookups`, attach.
- `attach(contentId, placeId, query)`: sets `place_id` only while it is null **and** the row's query (its `title` for a location, its `location` otherwise) still equals `query`, so a lookup a rename or an edit overtook ends `skipped`.
- `attachPagePoint(contentId, lat, lng)`: finite, `-90..90`, `-180..180`, not `0,0`; upserts the `page` place; attaches.
- `resolveEventPlace(eventId)`: a live event's `location`; `placeQuery`; equal to `located_location` → `skipped`; otherwise `geocode` **without reading or writing `place_lookups`**, upsert the place, set `place_id`, `located_location`, `located_at` together (a miss sets `located_location` with `place_id` null).
- `googleGeocoder` today's version, with its display-name and address fields, is deleted. `GOOGLE_MAPS_API_KEY` keeps its name and now serves the lookup; `reverse.ts` is untouched and its gate still needs `PHOTO_TOWNS=on` as well (AC-33). The key is restricted to the Places API (New) and the Geocoding API in Google's console (T0.3), since `reverse.ts` uses the latter.

**`places/refresh.ts`** (new), the thirty-day rule:
- `refreshPlaces()`: for `google` places with `coords_at` older than 25 days: attached to a live content row or a live connector event → `details(provider_place_id)`, update coordinates and `coords_at` (a failure leaves them); then, for every `google` place with `coords_at` older than 30 days, set `lat`, `lng` and `coords_at` to null whatever happened. A place with no coordinates draws nothing and `hasPoint` ignores it. Booked daily by the scheduler as its own kind, `places.refresh`, keyed by the day.

**Jobs** (`jobs/handlers.ts`):
- `location.resolve` `{ contentId }` now serves every content type. Log line unchanged.
- `event.locate` `{ calendarId }`: live candidates in the calendar from yesterday to +60 days whose `location` differs from `located_location`, oldest-first by `occurs_at`, up to what remains of the account's 100 for the day (its events with `located_at` since the account's local midnight), each through `resolveEventPlace`. Booked while on, after `syncConnection`'s upsert loop (`connectors/sync.ts`) for each selected calendar at least one thread picks (key `event.locate:<calendarId>:<15-minute slot>`), and by `setPick(..., true)` (`routes/threads.ts:1587`, key `event.locate:pick:<calendarId>:<threadId>`).
- `places.refresh` (above).
- `maps.backfill`: booked at boot while on, key `maps.backfill:030`. Deletes every `place_lookups` miss; books `location.resolve` for every `location` row with `place_id` null (key `location.resolve:<id>:030`), and `link.place` for every `link` row whose author's `web_links_enabled` is true and `place_read_at` is null, selected by `content.account_id` and never by membership (key `link.place:<id>`). Re-running books nothing done.
- `link.place` `{ contentId }`: claimed by the **agent worker** (`maxAttempts: 1`). Before any request it reads the row and its author's switch and stops unless the row is a live link, `place_read_at` is null and `web_links_enabled` is true; then fetches and posts to the internal route, which checks all three again.
- No job payload in this feature carries anything but ids.

**Filing** (`routes/tools.ts`):
- **Everything the privacy page will describe turns on together, with `mapsOn()`.** While off: `add_content` ignores the `worker` envelope (so `place_read_at` stays null and the backfill reads those links later), `threadEvents` selects no location or place, `hasPoint` and the points read return nothing, `event.locate` and `places.refresh` are not booked, `/api/me` says `maps: false`. The merge changes nothing a person sees or anything that leaves.
- `add_content` gains `location?: string`, accepted only on `type: 'event'` (any other type: 400 `location_not_here`). It is stored if it passes the shape (one line, at most 120); **a value `placeQuery` refuses is 400 `bad_place_name`**, the refusal a location's name already uses, so the model hears that a street address or a person's place is not a venue. `location_not_here` joins `ARGUMENT_REFUSALS` (`worker.py:753`); both are `declined`, not failed. With a location, book `location.resolve` in the transaction.
- A `location` row's title now also goes through `placeQuery` for the lookup; a title it refuses is kept as the row's title and simply not looked up (the row is still the person's place, with no point). The existing title bound is unchanged.
- `add_content` accepts a reserved `worker` envelope, `{ pageRead: true, pageLocation?: { lat, lng, text? } | { text } }`, never in the model's schema, only on `type: 'link'`. **The Core API reads the author's `web_links_enabled` in the same transaction** and ignores the envelope when it is off or the map is off. Sets `place_read_at`; coordinates go through `attachPagePoint` (and the page's text, if any, is kept in `location` for the Address row); text alone is stored in `location` (shape-bounded) and books `location.resolve`, which looks it up only if `placeQuery` passes it, so a street address is kept and never sent.
- `edit_content` gains `location`: on an event, a string sets it (shape-bounded and through `placeQuery` as on create, clears `place_id`, books `location.resolve`) and null clears it and `place_id`; on a link, only null is accepted and clears `place_id` (keeping `location` as the page's text and `place_read_at`); on a location row, refused (`location_not_here`; rename instead); a rename of a location row clears `place_id` and books `location.resolve`. **Undo:** before changing any of these, the write stores `place_prior = { messageId, placeId, location, placeReadAt }`; `undoTurn` restores them for rows whose `place_prior.messageId` is the turn's message, clears it, and books no lookup. Nothing in a request body can set `place_prior`, `place_id` or `place_read_at`.
- `list_thread_content`, `find_events` and every other tool result: unchanged. A test asserts their output keys contain no `place`, `location`, `address`, `lat` or `lng`.

**Internal.** `POST /internal/v1/content/:id/page-location` `{ jobId, found: { lat, lng, text? } | { text } | null }`, internal token, from `link.place`: refuses unless `jobId` is a running `link.place` job whose payload names this row, the row is a live link with `place_read_at` null, and its author's switch is on; then as the `worker` envelope does.

**Reads.**
- `ThreadBundle.hasPoint: boolean`, while on: EXISTS a live content row in the thread whose place has coordinates, or a picked, selected calendar's live event from yesterday to +60 days with one, through `threadEvents`' own scoping.
- `ThreadBundle.preference.widgets` drops `map` at read (`readPreference`); nothing writes the filtered value back.
- The content row's `place` becomes `{ id, lat, lng, approximate } | null` (no name, no address), and the row gains `location: string | null`; both clients' `lib/threads.ts` types follow, and the web's placeholder `Pins` that read `place.lat` goes with the Places section.
- `GET /v1/threads/:id/points` → `{ points: Point[], truncated: boolean }`, member only (`memberOf`, 404 otherwise), empty while off:
  ```ts
  type Point = {
    key: string;                    // "c:<contentId>" | "e:<eventId>"
    source: "row" | "calendar";
    contentId: string | null;
    type: ContentType | "event";    // a calendar's event is "event"
    title: string;                  // the row's or the event's own title
    address: string | null;         // offload's own text: content.location or the event's location
    approximate: boolean;
    lat: number; lng: number;
    googlePlaceId: string | null;   // for Directions; null for a page place
    labelIds: string[];             // the thread's label order; [] for calendar events
    when: { at: string; endAt: string | null; allDay: boolean } | null;
    url: string | null;             // a link's
    imageUrl: string | null;        // a link's picture
    authorId: string | null;        // for Added by; null for a calendar event
    calendarName: string | null;    // a calendar event's, as threadEvents names it
  };
  ```
  Content first (live rows with a place with coordinates, newest first), then `threadEvents` for yesterday to +60 days now selecting `e.location` and the place, events nearest now first, together cut at 500.
- `threadEvents` and `GET /v1/threads/:id/events` gain `location: string | null` and the place for every member while on (the owner's decision); `today/day.ts` is per account and unchanged. The comments at `threads/calendars.ts:207`, `routes/threads.ts:1598`, `apps/web/src/lib/threads.ts:178` and `apps/mobile/lib/threads.ts:131` change to the new rule and say what still does not cross.
- `GET /api/me` and its PATCH (both through `meFor`) gain `maps: boolean`, which is `mapsOn()`. The server's switch for the whole feature on every surface.

### Agent

- `og.py`: `picture()` becomes `page(client, url, read_location: bool) -> PageMeta(image, location)`, one request, same guard and caps (`MAX_BYTES` unchanged). With `read_location`: `og:latitude`/`og:longitude` and `place:location:latitude`/`longitude` (anchored meta regexes like `_META`, no nested quantifiers); at most ten `<script type="application/ld+json">` blocks within the bytes read, each at most 64KB, refused before parsing if its brackets nest deeper than 20, parsed with `RecursionError` and `ValueError` caught and silent; from them `geo.latitude`/`longitude` (first found), else `address` (a `PostalAddress` joined as street, locality, country, or a string), else a `Place`'s `name`; `og:street-address` (with `og:locality`, `og:country-name`). Coordinates must be finite, in range and not `0,0`. Text is cut to 120 characters. The result is `{ lat, lng, text? } | { text } | None`. Logs: the outcome kind only.
- `worker.py`: today the page is fetched only when the model gave no `image_url` (`worker.py:658-666`). It becomes: fetch when the link is in the dump and either the picture is wanted or a location is (`read_location = lookups[2].may_read_links and MAPS_ON`, where `MAPS_ON` is the agent's own `MAPS=on`); attach `image_url` only when the model gave none, and the `worker` envelope when the location was read. **The final payload, after `_camel`, has `worker`, `pageLocation`, `pageRead`, `page_location` and `page_read` removed before the worker's own envelope is added.** New job kind `link.place`, as above.
- `harness/tools.py`: `AddContent.location: str | None = Field(None, max_length=120)` with a single-line validator; `EditContent.location` with explicit null meaning clear (`model_fields_set`); `SetThreadPreference.widgets` loses `map`.
- Prompts (`prompts/`): the filing prompt says an event takes the name of the public place it happens at, from the person's words or the reader's `place`, never a street address, a person's home or a guess; that a refusal of a location means it is not a public place and the event is filed without one. `/harness-map` regenerated after.
- Evals: `08-the-calendar.json` gains cases: *dinner at Time Out Market on Friday at 8* files one event with location *Time Out Market* and no separate `location` row; *dinner at Ana's on Friday* files none; *dentist Tuesday 3pm* files none; an invitation link whose reader `place` is the venue files it; *actually it's at Cervejaria Ramiro* edits it; *that Airbnb isn't where we're staying, take it off the map* clears the link's point. Any case ordering widgets drops `map`. Running them is a separate ask.

### Shared (`packages/widgets`)

- `WIDGET_KINDS` becomes `["todo", "files"]`; the `map` earning rule goes.
- `src/map.ts` (new), pure and tested: `pointFill(labelIds, threadLabels)`; `pointShape(type, source)`; `cluster(points, zoom, sizePx)` (grid clustering at 44px in projected pixels); `fitBounds(points, view, padding, maxZoom = 15)`; `calloutPadding(height)`; `directionsUrl({ lat, lng, googlePlaceId })` → `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` plus `&destination_place_id=<id>` when there is one, nothing else; `ANDROID_DARK_STYLE` (Google's JSON map style for dark, a constant).

### Mobile (`apps/mobile`)

- `react-native-maps` at the version `npx expo install` picks for SDK 57, with its own config plugin, keys `iosGoogleMapsApiKey` and `androidGoogleMapsApiKey` read from the build's environment (`GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY`, EAS environment variables). `app.json` becomes `app.config.ts` extending it, so the keys are read from the environment rather than written into a file (a string in `app.json` is not expanded). A build without the keys has no map: `PROVIDER_GOOGLE` does not exist on iOS without the key, and the client draws the switched-off state. App version bump (runtime version follows). EAS development builds for both phones.
- `components/map/ThreadMap.tsx`, `Point.tsx`, `Callout.tsx`, `PlaceSheet.tsx`: `MapView provider={PROVIDER_GOOGLE}`, **no `googleMapId`** (it would bill every load); one per thread visit, created on first entry to Map and kept mounted through List and Map toggles until the screen unmounts, hidden under List (absolute, zero opacity, no pointer events); `mapPadding` bottom = the plate's height, so Google's logo sits above it; iOS dark through `userInterfaceStyle` (updated in place), Android dark through `customMapStyle={ANDROID_DARK_STYLE}` (applied in place; Android's own colour scheme prop is set only at creation); points as `Marker`s with offload's views as children and `tracksViewChanges` off after first draw; approximate places as `Circle` with `radius={300}`; camera moves with duration 0 under reduced motion.
- `screens/Thread.tsx`: the switch (an icon variant of `components/settings/Segmented.tsx`, moved out of `settings/` to be shared) in `Bar` while `bundle.hasPoint`, with labels and calendars moved into More; the Map body; the title rule; back returns to List; `lib/mapView.ts` keeps the per-thread choice in AsyncStorage under one key, an ordered map trimmed to 100.
- `PlaceSheet` on `DragSheet` at a half detent, scrim `--surface-scrim`; Edit closes it and calls the row's existing open handler.
- Directions: `Linking.openURL(directionsUrl(point))`.
- `shell/Widgets.tsx`, `labels/LabelList.tsx`: the `map` heading and block go.
- `/api/me.maps` false, or no Google provider in the build → no switch.

### Web (`apps/web`)

- `@vis.gl/react-google-maps` (Google's own React library for the Maps JavaScript API), mounted only by `components/map/ThreadMap.tsx`, so the script loads when a map first shows. The key is `NEXT_PUBLIC_GOOGLE_MAPS_KEY` and the cloud map id (light and dark styles, needed for HTML markers) `NEXT_PUBLIC_GOOGLE_MAP_ID`, both set on the `web` service at switch-on; either unset → no map.
- `components/map/ThreadMap.tsx`, `Point.tsx`, `Callout.tsx`, `PlaceSheet.tsx`: points as `AdvancedMarker`s with offload's React views; approximate places as `google.maps.Circle`; `colorScheme` from `appearance.ts` (`light` → LIGHT, `dark` → DARK, `system` → FOLLOW_SYSTEM), fixed at creation, so the map is keyed by the resolved setting and a Settings change makes one new map. **One map per thread-pane mount and theme setting**: kept across the column and the switch, filters and resizes. Google's default controls off except its logo and legal line, which are never hidden.
- `apps/web/src/components/panes/Thread.tsx`: a `ResizeObserver` on the pane's content box sets split mode at 1000px with 16px either way (split at 1016 and wider, unsplit below 984); **one map container is always rendered in the same place in the tree** and only its grid area changes, so React never unmounts it; the switch in `PaneHead` below the line; a thread in `.paneLeft` draws neither; in switch mode the map's foot stops above the composer.
- The composer: the top pane reports its split state through a shell context value, and the composer's card ends at the list column's edge while it is on.
- `PlaceSheet` as a 360px right-anchored pane over the map area; Directions as `<a href={directionsUrl(point)} target="_blank" rel="noreferrer noopener">`.
- `apps/web/src/components/panes/Widgets.tsx`: the `map` heading, `<Pins>` and its placeholder surface go.
- Settings: the *Read links I paste* note, in the switch-on change (T5.4), not before.
- The Content Security Policy gains Google's map hosts (`maps.googleapis.com`, `maps.gstatic.com`, `*.googleapis.com` for tiles and fonts) in `script-src`, `img-src`, `connect-src` and `font-src`, as their documentation lists, and nothing wider.

### Design system and docs (on `main`, as their own commits)

- **Tokens first**, before the clients consume them (T0.5): `--shadow-point: 0 1px 4px rgb(11 11 11 / .35)` and `--shadow-callout: 0 6px 20px rgb(11 11 11 / .22)` in `.claude/skills/offload-design/tokens/elevation.css`, both themes; `pnpm tokens`.
- `.claude/skills/offload-design/decisions.md` and `docs/tech/decisions.md` entries as the feature spec's section 13 lists; `docs/tech/going-public.md` item 13 rewritten (four keys, each app- and API-restricted, quotas on Places and map loads set in Google's console, a budget alert, and that a budget does not cap spending).
- `docs/specs/019-calendars/feature-spec.md:98` and `docs/specs/025-labels/feature-spec.md:77` amended in place with a dated note.
- `docs/tech/vendor-terms/google-maps/` with the Terms of Service, the Service Specific Terms, the Places policies and the Controller-Controller terms as served on the capture date, and a README section saying what they establish and that the owner accepted them without the vendor bar.

## Edge cases

- **A rename or an event-location edit while a lookup is in flight**: `attach`'s query guard.
- **Undo after a lookup already ran for the new value**: `place_prior` restores the old `place_id` and `location`; the new place stays in the cache.
- **A place passes thirty days while a thread is open**: the next points read no longer carries it; the open map keeps it until the visit ends.
- **Google returns the same place id for two queries**: one `places` row by `(provider, provider_place_id)`, two `place_lookups` rows.
- **A refresh that fails** keeps the coordinates until the thirtieth day, then they go; the next lookup or refresh brings them back.
- **A calendar's text that matches a place somewhere else** (Text Search has no score): drawn where Google put it; the calendar is where it is corrected. Accepted.
- **The same calendar picked by two threads**: one `event.locate` per calendar per slot.
- **Two members connect the same calendar**: two copies, each looked up; both land on one `places` row by Google's id.
- **A calendar unticked**: its events, `place_id` and `located_location` go with the copy (`routes/connectors.ts:397`); the `places` row stays and is refreshed only while something live points at it.
- **A link in a shared thread**: its point is the author's read; the backfill never reads it for anyone else.
- **Page coordinates are attacker-controlled within range**: drawn and handed to Google Maps on a person's tap, nothing more.
- **A page that gives a street address and coordinates**: the point is the page's coordinates, the Address row is the page's text, and nothing goes to Google.
- **The web theme set to `system` and the device switching**: Google's map follows by itself.
- **A phone build from before the version bump**: receives no update with the map; its thread looks as today.

## Constitution check

Audited against `docs/constitution/principles.md`, read fresh on 2026-10-02.

- **DEV-1 (MUST), compliant.** The lookup is the existing module rewritten, not a second one; the backfill is a one-off for one account; no setting for place lookup; pure logic in the existing shared package; Google's own React library on the web rather than a hand wrapper.
- **DEV-2 (MUST), compliant.** Every divergence from the design is listed for the log, including the provider; 019 and 025 are amended in place.
- **DEV-3 (SHOULD), compliant.** Google's own SDKs and libraries.
- **QUAL-1 (MUST), compliant.** Every task starts red; clustering, fitting, the filter and the field masks are unit-tested; device checks are named where a unit test cannot see.
- **SEC-1 (MUST), compliant.** Page metadata and calendar text never reach a prompt and reach Google only through `placeQuery`; JSON-LD parsing is bounded; the server key and pepper are server env; the client keys are public by nature and restricted by app, site and API.
- **SEC-2 (MUST), compliant.** `hasPoint`, the points and events reads go through `memberOf`; the internal route checks job, author, switch and row state.
- **DATA-1 (SHOULD), compliant.** This file.
- **OFF-1 (MUST), compliant.** Lookups log id, outcome, latency; `og.py` the outcome kind; the backfill and the refresh counts; no job payload carries more than ids.
- **OFF-2 (MUST), compliant.** Nothing claims encryption it does not have.
- **OFF-3 (MUST), compliant.** Points read member-scoped; backfill by author; `places` and `place_lookups` stay account-free (tested).
- **OFF-4 (MUST), compliant.** A calendar location is looked up and its result kept as derived state; the text never enters `place_lookups`; `place_id` and `located_location` go with the copy.
- **OFF-5 (MUST), compliant.** The model's location crosses through pydantic and zod schemas, with the declined-not-failed refusal.
- **OFF-6 (MUST), compliant.** Setting and clearing a location and a link's point are `edit_content`, made reversible for these fields by `place_prior`. A lookup is egress to a company, as 006 and 016 established, not an outward action to a person.
- **OFF-7 (SHOULD), compliant with the log entry.**
- **OFF-8 (MUST), compliant.** The model reads no place data; the location it writes is bounded.

The vendor bar in `docs/tech/decisions.md` (a published no-training term and short retention) is not met by Google and is **waived for this one company by the product owner, 2026-10-02**, with the privacy page saying so by name. It is a decision, not a principle, so it does not block the gate; it is recorded as a superseding entry, not left standing beside the integration.

`GATE: PASS`

## Dependencies and open decisions

- **Owner actions**: a Google Cloud project for Maps with billing (non-EEA address), four keys (server: Places API (New) and Geocoding API; web: Maps JavaScript API, offload's domains; iOS: Maps SDK for iOS, the bundle id; Android: Maps SDK for Android, the package with the EAS and Play signing SHA-1s), a cloud map id with light and dark styles for the web, quotas on Place Details and map loads, a budget alert. The fixtures (T0.4) need only the server key.
- **New environment**: on `core-api`, `GOOGLE_MAPS_API_KEY` (existing name), `PLACE_HASH_PEPPER`, `MAPS=on`; on `agent`, `MAPS=on`; on `web`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID`; on EAS, `GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY`. `MAPS` unset is everything off.
- **The cost sheet** (`/cost-report`) gains the Maps line after switch-on.
- No open decision at the bottom of `docs/tech/decisions.md` blocks this.
