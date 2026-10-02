# 030 A thread's map: implementation

Reads with `feature-spec.md`. Where the two disagree, the feature spec wins and this file is wrong.

## What is already true, and what that settles

- **The geocoder boundary exists** (`apps/core-api/src/places/resolve.ts`, 006): a `Geocoder` function type, `resolvePlace(contentId, geocode)`, two caches (`places`, `place_lookups`), a `location.resolve` job booked in the same transaction as a `location` row (`routes/tools.ts:1838`), and a log line of id, outcome and latency (`jobs/handlers.ts:320`). This feature generalises it rather than adding a second one.
- **Google was never on.** `GOOGLE_MAPS_API_KEY` is unset in production (`docs/tech/going-public.md` item 13), so `googleGeocoder` returned null for every lookup and `resolvePlace` wrote **a remembered miss for every location ever saved**. No `places` row exists in production. The handoff's "re-resolve every Google place" becomes: forget the misses, drop any `google` place (local databases may hold some), look everything up once.
- **The link's page is already fetched by code, outside the model**: `og.picture()` in the agent worker (`og.py`), called for a link in the dump (`worker.py:659-669`, gated by `_in_the_dump`), with the SSRF guard, no redirects, 4s and 256KB. The location read rides on that same response.
- **The quarantined reader already has a `place` field** (`reader.py:52`), the bounded way a page's venue reaches the model; an event's location may come from it (feature spec, section 1).
- **`connector_events.location` is already stored** (0049), from Google's `location` string; `threadEvents` deliberately does not select it today.
- **The thread's list is paged** (30 a page, 025), so the map's points are their own read.
- **Shared pure logic lives in `packages/widgets`**, already read by both clients and the API. The point rules, clustering, fitting and directions URLs go there, so the three surfaces cannot disagree and the gesture outcomes are unit-testable.
- **Tokens are generated from the design system's own files** (`packages/tokens/src/generate.mjs` reads `.claude/skills/offload-design/tokens/`), so new tokens are added there, on `main`, and logged.
- **`runtimeVersion` is `appVersion`** (`apps/mobile/app.json:175`), so an update is only delivered to builds of the same app version. The map's native module ships with an app version bump, and no build without the module can receive JS that imports it.
- **The agent worker claims jobs by kind** (`worker.py:72`); a new kind it owns is one entry in that list.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Places attached: 20 typical, 300 heavy. Links: 50 typical, 1,000 heavy. Events with a location: 10 typical, 100 heavy. Picked calendar events in the map's window (yesterday to +60 days): 20 typical, 400 heavy (a work calendar). |
| Fan-out | Points per thread: 5 typical, 60 heavy for content; plus up to the window's calendar events, 100 heavy. The read stops at 500. |
| Growth | 1 to 3 new points a week for an active account; the `places` cache grows by at most that, less with reuse. |
| Read pattern | `hasPoint` on every thread bundle read (an EXISTS, both clients, every thread open). The points read once per Map or column visit and after a change to the thread (the same invalidation the bundle has). |
| Write pattern | One lookup per new located row, in a background job. Calendar lookups after each sync (15 minutes) for new or changed locations only, capped at 100 an account a day. The backfill once. |
| Sort and filter | Points: `content.thread_id = ? and place_id is not null and deleted_at is null and archived_at is null`, plus picked calendar events by `calendar_id in (picks) and occurs_at between`. `hasPoint`: the same as an EXISTS. Calendar lookup candidates: `deleted_at is null and location is not null and location is distinct from located_location` per calendar. Backfill: `type='link' and place_read_at is null and account_id = ?`; `type='location' and place_id is null`. |

**What follows.**
- **Pagination:** none for points; a hard limit of 500, events ordered by distance in time from now, content by `created_at desc`, with `truncated: true` past it. 60 content points is the heavy case, so the limit is a guard, not a page.
- **Indexes:** `content (thread_id) where place_id is not null and deleted_at is null` (partial, small) serves both `hasPoint` and the points read. `connector_events (calendar_id, occurs_at)` exists (019) and serves the event half. No index for the backfill or the calendar candidates: both are bounded scans by an indexed parent (account, calendar).
- **Normalisation:** `hasPoint` is computed, not stored. The heavy case is an EXISTS over a partial index, cheaper than keeping a flag right across delete, archive, move, undo and calendar unpick.
- **Partitioning:** none.

## Data model

Migration `0068_places_maptiler.sql` (0067 is taken):

```sql
-- Google was never switched on in production, so nothing resolved there; a
-- local database may hold some. Every remembered miss was written with no
-- key set and is not a miss.
update content set place_id = null
  where place_id in (select id from places where provider = 'google');
update notes set place_id = null
  where place_id in (select id from places where provider = 'google');
delete from places where provider = 'google';
delete from place_lookups;  -- also: the key is peppered from now on

alter table places drop constraint places_provider_check;
alter table places add constraint places_provider_check
  check (provider in ('maptiler', 'page'));
alter table places alter column provider drop default;   -- 'google' would fail the check
alter table places alter column name drop not null;      -- never the query
alter table places add column approximate boolean not null default false;
alter table places add column area text;                  -- geocoder's own area name

-- What is looked up for a row that is not a `location`: an event's location,
-- written by the model from the dump or the reader's `place` field, or the
-- address or place name a link's page gave, kept with the link (privacy page,
-- section 5). On the row, never in a job payload (AC-7, and handlers.ts's own
-- rule that a payload carries an id and nothing else). The same bound as a
-- location's name, here as well as in code, because what reaches a geocoder
-- is a claim about a third party.
alter table content add column location text;
alter table content add constraint content_location_shape check (
  location is null or (
    type in ('event', 'link')
    and char_length(location) between 1 and 120
    and location !~ '[\r\n]'
  )
);

-- A link's page was read for a location: at filing (switch on) or by the
-- backfill. Set whether or not anything was found, and kept when a person
-- clears the point, so a cleared link is never read again.
alter table content add column place_read_at timestamptz;

-- The place fields as they were before a turn's edit_content changed them, so
-- that turn's Undo can put them back. 004's Undo soft-deletes what a turn
-- created and has no path for a field edited on an existing row; this is the
-- narrow version of questions.previous_value for these three fields only.
-- Written and read by the server alone, never accepted from a request body.
alter table content add column place_prior jsonb;

alter table connector_events add column place_id uuid
  references places (id) on delete set null;
-- The location text last looked up, so an unchanged location is never looked
-- up twice. Plaintext beside `location` in the same row, so a hash would
-- protect nothing, and it is never written to place_lookups. Goes with the row
-- when the copy goes (019).
alter table connector_events add column located_location text;
-- When it was looked up, which is what the per-account daily ceiling counts.
alter table connector_events add column located_at timestamptz;

create index content_points on content (thread_id)
  where place_id is not null and deleted_at is null;
```

`notes.place_id` (0033) stays, unused, as it was before this feature; the migration nulls it only so the `google` places can go.

`schema.ts` mirrors it. `places` stays account-free, and so does `place_lookups`; nothing in this feature adds an account column to either, and a test asserts both tables' column lists.

**Place keys.** A `maptiler` place keys on MapTiler's feature `id`. A `page` place keys on its coordinates rounded to five decimals (`"38.71130,-9.13010"`), name null (the row's own title is drawn), never approximate, no `place_lookups` row.

**Places on rows.** `content.place_id` now attaches to `location`, `link` and `event` rows. **A page place drives nothing on the server**: its coordinates are drawn and handed to a maps app when a person taps Directions, and are never a query, a fetch or a decision.

## Interfaces

### Core API

**`places/query.ts`** (new): `placeQuery(raw: string): string | null`. Trim, NFC, remove control characters, collapse whitespace, refuse a newline, a URL (`://` or a leading `www.`), or over 120 characters; returns the cleaned string or null. `queryKey(q)` (used by `place_lookups` only) is HMAC-SHA256 of the lowercased query with `PLACE_HASH_PEPPER` (a new required variable when the geocoder is on; boot refuses `MAPTILER_GEOCODING_KEY` without it). `isNoPlace(q)` is the closed word list from the feature spec, whole-word, case-insensitive.

**`places/resolve.ts`**, generalised:
- `maptilerGeocoder: Geocoder`. `GET https://api.maptiler.eu/geocoding/{encodeURIComponent(q)}.json?key=…&limit=1&autocomplete=false`. The host is a module constant, `MAPTILER_HOST`, and a test asserts that any other host throws before a request is made. Same 8s timeout, same "the error is not inspected" rule. Maps the first feature: `id` → `providerPlaceId`; `text` → `name` (null when absent, never the query); `place_name` → `formattedAddress`; `center` → `lng, lat`; `relevance` below `MIN_RELEVANCE` (0.8, tuned against captured responses in the test fixtures) → null; `place_type` of `country`, `region`, `subregion`, `continental_marine`, `major_landform` → null (too coarse to draw); `address` or `poi` → exact; anything else (`postal_code`, `municipality`, `locality`, `neighbourhood`, `place` and the rest) → `approximate: true`, `area: text`.
- `googleGeocoder` is deleted. `GOOGLE_MAPS_API_KEY` stays in `env.ts` for `reverse.ts`, untouched (AC-31).
- `geocodingOn()`: `Boolean(env.MAPTILER_GEOCODING_KEY)`. Off → `resolvePlace` returns `skipped` **before reading the cache and writes nothing**.
- `resolvePlace(contentId, geocode = maptilerGeocoder)`: reads the row; the query is the row's `title` for a `location` and its `location` for an `event` or a `link`; `placeQuery` it; null → `skipped`. Cache read by `queryKey`; a miss whose `looked_up_at` is older than 30 days is deleted and looked up again. Writes `provider: 'maptiler'`.
- `attach(contentId, placeId, query)`: sets `place_id` only while it is null **and** the row's query (its `title` for a location, its `location` otherwise) still equals the query the job looked up, so a lookup that a rename or an edit overtook ends `skipped` and the job booked by the change attaches the new place.
- `attachPagePoint(contentId, lat, lng)`: validates `-90..90`, `-180..180`, finite; upserts the `page` place; attaches.
- `resolveEventPlace(eventId)`: reads `connector_events.location` of a live event (`deleted_at is null`); `placeQuery` and `isNoPlace`; equal to `located_location` → `skipped`; otherwise geocodes **without reading or writing `place_lookups`**, upserts the `places` row, and sets `place_id`, `located_location` and `located_at` together (a miss sets `located_location` with `place_id` null, so an unchanged miss is not retried).

**Jobs** (`jobs/handlers.ts`):
- `location.resolve` keeps its name and its `{ contentId }` payload and now serves every content type. Log line unchanged. No job payload in this feature carries anything but ids.
- `event.locate` `{ calendarId }`: live candidates (`deleted_at is null`) in the calendar from yesterday to +60 days whose `location` is set and differs from `located_location`, oldest-first by `occurs_at`, up to what remains of the account's 100 for the day (its events with `located_at` since the account's local midnight), each through `resolveEventPlace`. Booked after `syncConnection` upserts (`connectors/sync.ts` after the upsert loop) for each selected calendar that **at least one thread picks**, and by `setPick(..., true)` (`routes/threads.ts:1587`). Idempotency keys `event.locate:<calendarId>:<15-minute slot>` after a sync and `event.locate:pick:<calendarId>:<threadId>` on a pick, so a pick inside a slot a sync already booked still runs.
- `maps.backfill`: booked at boot when `geocodingOn()`, idempotency key `maps.backfill:030`. Books `location.resolve` for every `location` row with `place_id` null (key `location.resolve:<id>:030`), and `link.place` for every `link` row whose author's `web_links_enabled` is true and `place_read_at` is null, selected by `content.account_id = accounts.id` and never by membership (key `link.place:<id>`). Re-running books nothing done, by row state and by key.
- `link.place` `{ contentId }` is claimed by the **agent worker** (it owns the fetcher and the guard; one at a time, no retry: `maxAttempts: 1`). **Before any request**, the handler reads the row and its author's switch and stops unless the row is a live link, `place_read_at` is null, and `web_links_enabled` is true; only then does it fetch, and it posts to the internal route below, which checks all three again.

**Filing.** `routes/tools.ts`:
- `add_content` gains `location?: string`, accepted only on `type: 'event'` (any other type: 400 `location_not_here`), through `placeQuery`; a value it refuses is 400 `bad_place_name`, the refusal a location's name already uses. `location_not_here` joins `ARGUMENT_REFUSALS` (`worker.py:753`); `bad_place_name` is in it already. Both are `declined`, not failed. On insert with a location, book `location.resolve` in the same transaction, as a `location` row does.
- **Everything the privacy page will describe turns on together, with `geocodingOn()`.** While it is off, `add_content` ignores `pageLocation` and `pageRead` (so `place_read_at` stays null and the backfill reads those links later), `threadEvents` does not select a location or a place, `hasPoint` and the points read return nothing, and `event.locate` is not booked. The merge therefore changes nothing a person can see or anything that leaves; the switch-on change (T5.4) sets the keys and the page in one go.
- `add_content` accepts a reserved `worker` envelope, `{ pageRead: true, pageLocation?: { lat, lng } | { query } }`, never in the model's schema (AC-4), only on `type: 'link'`. **The Core API reads the author's `web_links_enabled` in the same transaction** and ignores the envelope when it is off (the worker is not trusted for an access decision, `routes/internal.ts`). Sets `place_read_at = now()`; coordinates go through `attachPagePoint`; a query is stored in `content.location` through `placeQuery` and books `location.resolve` with `{ contentId }`.
- `edit_content` gains `location`: on an event, a string sets it (through `placeQuery`, clears `place_id`, books `location.resolve`) and null clears it and `place_id`; on a link, only null is accepted and clears `location` and `place_id` (keeping `place_read_at`); on a location row, refused (`location_not_here`; rename instead); a rename of a location row clears `place_id` and books `location.resolve`. **Undo:** before changing any of the three, the write stores `place_prior = { messageId, placeId, location, placeReadAt }`; `undoTurn` (`routes/dumps.ts`) restores those for rows whose `place_prior.messageId` is the turn's message, then clears it, and books no lookup since the old place comes back. Nothing in a request body can set `place_prior`, `place_id` or `place_read_at`. `edit_content` is already on the reversible allowlist; this makes that true for these fields. (The wider gap, that the turn's Undo restores no field `edit_content` changed, is flagged as its own task.)
- `list_thread_content`, `find_events` and every other tool result: unchanged. A test asserts their output keys contain no `place`, `location`, `address`, `lat` or `lng` (AC-4, AC-6).

**Internal.** `POST /internal/v1/content/:id/page-location` `{ jobId, found: {lat,lng} | {query} | null }`, internal token, from `link.place`: refuses unless `jobId` is a running `link.place` job whose payload names this row, the row is a live link whose `place_read_at` is null, and its author's switch is still on; sets `place_read_at`; attaches or stores and books as filing does.

**Reads.**
- `ThreadBundle.hasPoint: boolean`: EXISTS a live content row in the thread with a place with coordinates, or a picked, selected calendar's event from yesterday to +60 days with one, through `threadEvents`' own scoping.
- `ThreadBundle.preference.widgets` no longer contains `map` (read-time filter, `readPreference`); nothing writes the filtered value back.
- `GET /v1/threads/:id/points` → `{ points: Point[], truncated: boolean }`, member only (`memberOf`, 404 otherwise). `Point`:
  ```ts
  type Point = {
    key: string;                    // "c:<contentId>" | "e:<eventId>"
    source: "row" | "calendar";
    contentId: string | null;
    type: ContentType | "event";    // a calendar's event is "event"
    title: string;                  // the row's title, or the event's
    placeName: string | null;       // the geocoder's name; null for a page place
    address: string | null;
    area: string | null;
    approximate: boolean;
    lat: number; lng: number;
    labelIds: string[];             // the thread's label order; [] for calendar events
    when: { at: string; endAt: string | null; allDay: boolean } | null;
    url: string | null;             // a link's
    imageUrl: string | null;        // a link's picture
    authorId: string | null;        // for Added by; null for a calendar event
    calendarName: string | null;    // a calendar event's, as threadEvents names it
  };
  ```
  Content half: live rows (not deleted, not archived) with a place with coordinates, newest first. Event half: `threadEvents` for yesterday to +60 days, now selecting `e.location` and the place, events nearest now first. Content first, then events fill what is left of 500.
- `threadEvents` and `GET /v1/threads/:id/events` gain `location: string | null` and `place` for every member while the geocoder is on (the owner's decision); `today/day.ts` is per account and is not changed. The comments at `threads/calendars.ts:207`, `routes/threads.ts:1598`, `apps/web/src/lib/threads.ts:178` and `apps/mobile/lib/threads.ts:131` change to the new rule and say what still does not cross.
- `GET /api/me` and its PATCH (both through `meFor`) gain `map: { key: string } | null`. The key is chosen by the client's `X-Offload-Client` header (new, one line per client, as `X-Time-Zone` is), allowlisted to exactly `web`, `ios`, `android`, never echoed or logged, from `MAPTILER_KEY_WEB`, `MAPTILER_KEY_IOS`, `MAPTILER_KEY_ANDROID`; `null` for an unset variable, a missing header or any other value (AC-26). The style URLs are one constant, `STYLE_URLS` in `packages/widgets/src/map.ts`, confirmed against a real `style.json` from the European host before it is written (T0.4); the client appends the key. No error path logs a style or tile URL, since it carries the key.

### Agent

- `og.py`: `picture()` becomes `page(client, url, read_location: bool) -> PageMeta(image: str | None, location: PageLocation | None)`, one request, same guard and caps (`MAX_BYTES` unchanged). With `read_location`: `og:latitude`/`og:longitude`, `place:location:latitude`/`longitude` (anchored meta regexes like `_META`, no nested quantifiers); `<script type="application/ld+json">` blocks within the bytes read, each at most 64KB, at most ten blocks; each refused before parsing if a scan of its brackets nests deeper than 20, then parsed with `RecursionError` and `ValueError` caught and silent; from them `geo.latitude`/`longitude` (any `@type`, first found), else `address` (a `PostalAddress` joined as street, locality, country, or a string), else a `Place`'s `name`; `og:street-address` (with `og:locality`, `og:country-name`) as an address. Coordinates must parse as finite floats in range or are dropped. A query is cut to 120 characters here, the Core API's bound. Logs: the outcome kind only.
- `worker.py`: today the page is fetched only when the model gave no `image_url` (`worker.py:658-666`). The condition becomes: fetch when the link is in the dump and either the picture is wanted or a location is (`read_location = lookups[2].may_read_links and MAPS_ON`); attach `image_url` only when the model gave none, and the `worker` envelope when the location was read. `MAPS_ON` is the agent's own `MAPS=on` variable, set in the switch-on change, so no page is parsed for a location before the privacy page says so. **The final payload, after `_camel`, has `worker`, `pageLocation`, `pageRead`, `page_location` and `page_read` removed before the worker's own envelope is added** (pydantic already drops undeclared keys at `plan.py:913`; this holds if that ever changes). New job kind `link.place`, as above.
- `harness/tools.py`: `AddContent.location: str | None = Field(None, max_length=120)` with a single-line validator (a model writing a newline is corrected here rather than by a 400); `EditContent.location` with explicit null meaning clear (`model_fields_set`); `SetThreadPreference.widgets` loses `map` in its description and validation.
- Prompts (`prompts/`): the filing prompt says an event takes the place it happens at, from the person's words or the reader's `place`, and never a guess; nothing else changes. `/harness-map` regenerated after.
- Evals: `08-the-calendar.json` gains cases: *dinner at Time Out Market on Friday at 8* files one event with location *Time Out Market* and no separate `location` row; *dentist Tuesday 3pm* files no location; an invitation link whose reader `place` is the venue files it; *actually it's at Cervejaria Ramiro* edits it; *the call with Ana on Friday* files none; *that Airbnb isn't where we're staying, take it off the map* clears the link's point. Any case ordering widgets drops `map`. Running them is a separate ask (CLAUDE.md).

### Shared (`packages/widgets`)

- `WIDGET_KINDS` becomes `["todo", "files"]`; the `map` earning rule goes; `readPreference` drops unknown kinds as it already does.
- `src/map.ts` (new), pure and tested: `pointFill(labelIds, threadLabels) -> { a: colour | null, b: colour | null }`; `pointShape(type, source)`; `cluster(points, zoom, sizePx)` (grid clustering at 44px); `fitBounds(points, view, padding, maxZoom = 15)`; `calloutPadding(height)`; `directionsUrl(platform, { lat, lng, name })` for `apple`, `google-ios`, `android` (`geo:lat,lng?q=lat,lng(name)`), `web` (`https://www.google.com/maps/dir/?api=1&destination=lat,lng`); `STYLE_URLS`; `isNoPlace` lives in the API, not here.

### Mobile (`apps/mobile`)

- Dependency `@maplibre/maplibre-react-native` with its Expo config plugin in `app.json`; `ios.infoPlist.LSApplicationQueriesSchemes: ["comgooglemaps"]`; app version bump (runtime version follows). EAS development builds for both phones; Expo Go is already not used.
- `components/map/ThreadMap.tsx`, `Point.tsx`, `Callout.tsx`, `PlaceSheet.tsx`: one `MapView` per thread visit, created on first entry to Map and kept mounted through List and Map toggles until the screen unmounts, hidden under List (absolute, zero opacity, no pointer events) rather than unrendered; style from `STYLE_URLS` with `/api/me`'s `map.key`, swapped on the colour scheme; points as `MarkerView`s (React views), the approximate circle as a `CircleLayer` with a radius in metres converted per zoom; attribution as an offload view (MapLibre's own off); camera moves `animationDuration: 0` under reduced motion.
- `screens/Thread.tsx`: the switch (an icon variant of `components/settings/Segmented.tsx`, moved out of `settings/` to be shared) in `Bar` while `bundle.hasPoint`, with labels and calendars moved into More; the Map body; the title rule; back returns to List (the predictive back handler); `lib/mapView.ts` keeps the per-thread choice in AsyncStorage under one key, an ordered map trimmed to 100.
- `PlaceSheet` on `DragSheet` at a half detent, the scrim `--surface-scrim`; Edit closes it and calls the row's existing open handler.
- Directions: `Linking.canOpenURL("comgooglemaps://")` decides the action sheet on iOS; Android opens the `geo:` URL.
- `shell/Widgets.tsx`, `labels/LabelList.tsx`: the `map` heading and block go.
- No map key from `/api/me` → no switch.

### Web (`apps/web`)

- Dependency `maplibre-gl`, imported dynamically by `components/map/ThreadMap.tsx`, so the thread pane's bundle does not carry it until a map shows.
- `components/map/ThreadMap.tsx`, `Point.tsx`, `Callout.tsx`, `PlaceSheet.tsx`. **One map per thread-pane mount** (the feature spec leaves the session-long instance to this file): kept across the column and the switch, filters, theme and resizes, recreated when the pane mounts a different thread. The session-long instance is not built unless MapTiler's captured billing terms count each map created rather than each page load, which is checked when they are captured (T0.3) and, if so, is a follow-up.
- `apps/web/src/components/panes/Thread.tsx`: a `ResizeObserver` on the pane's content box sets split mode at 1000px with 16px either way (split at 1016 and wider, unsplit below 984); **one map container is always rendered in the same place in the tree** and only its grid area changes between the column and the switched body, so React never unmounts it; the switch in `PaneHead` below that; a thread in `.paneLeft` draws neither.
- The composer: the top pane reports its split state through a shell context value, and the composer's card ends at the list column's edge while it is on.
- `PlaceSheet` as a 360px right-anchored pane over the map area; Directions as `<a target="_blank" rel="noreferrer noopener">`.
- `apps/web/src/components/panes/Widgets.tsx`: the `map` heading, `<Pins>` and its placeholder surface go.
- Settings: the *Read links I paste* note on all three surfaces, in the switch-on change (T5.4), not before.

### Design system and docs (on `main`, as their own commits)

- **Tokens first**, before the clients consume them (T0.5), and the worktree merges `main` after. Tokens in `.claude/skills/offload-design/tokens/elevation.css`: `--shadow-point: 0 1px 4px rgb(11 11 11 / .35)`, `--shadow-callout: 0 6px 20px rgb(11 11 11 / .22)`; in `colors.css`: `--map-attribution-ground` (light `rgb(255 255 255 / .75)`, dark `color-mix(in srgb, var(--surface-raised) 75%, transparent)` resolved by the generator, or an rgba literal if the generator does not resolve `color-mix`). `pnpm tokens` regenerates; the generator's own assertions cover them.
- `.claude/skills/offload-design/decisions.md` and `docs/tech/decisions.md` entries as the feature spec's section 13 lists; `docs/tech/going-public.md` item 13 rewritten (MapTiler keys restricted per surface, the geocoding key server-side only, a monthly spend cap and alert set in MapTiler's dashboard before switch-on).
- `docs/specs/019-calendars/feature-spec.md:98` and `docs/specs/025-labels/feature-spec.md:77` amended in place with a dated note.

## Edge cases

- **A location row renamed, or an event's location changed, while its lookup is in flight**: `attach`'s query guard (Interfaces).
- **Undo after a lookup already ran for the new value**: `place_prior` restores the old `place_id` and `location` together; the new `places` row stays in the cache.
- **The same calendar picked by two threads**: one `event.locate` per calendar per slot; events are per calendar, not per thread.
- **Two members connect the same calendar**: two copies, each looked up, since a calendar's text never enters the query cache; both land on one `places` row by MapTiler's feature id. Two calls for one venue is accepted at this volume.
- **A calendar unticked**: its events and their `place_id` and `located_location` are deleted with the copy (`routes/connectors.ts:397`); the `places` row (public) stays.
- **A link in a shared thread**: its point is the author's read; another member's switch is irrelevant; the backfill never reads it for them.
- **Page coordinates are attacker-controlled within range**: accepted, at the trust `og:image` already has, since a page place is only drawn and handed to a maps app on a person's tap.
- **The geocoder switched on later**: `maps.backfill` runs at the first boot with the key; misses written before do not exist because off never writes one.
- **Coordinates of 0,0** from a page: dropped (a common default), as out-of-range ones are.
- **A thread with one point**: the fit opens at zoom 15 on it.
- **A point moves thread** (move_content): it leaves the old thread's points and joins the new one's on the next read.
- **MapTiler down**: lookups end `provider_error` with no miss remembered; the next filing of the same name tries again; the map shows *Couldn't load the map*.
- **A phone build from before the version bump**: receives no update with the map; its thread looks as today.

## Constitution check

Audited against `docs/constitution/principles.md`, read fresh on 2026-10-02.

- **DEV-1 (MUST), compliant.** The handoff's session-long web map is deferred until the billing terms say it pays; the backfill is a one-off for one account; no setting for place lookup; pure logic in the existing shared package rather than a new one.
- **DEV-2 (MUST), compliant.** Every divergence from the design is listed for the log; 019 and 025 are amended in place.
- **DEV-3 (SHOULD), compliant.** MapLibre is the standard open map renderer on all three surfaces.
- **QUAL-1 (MUST), compliant.** Every task starts red; the clustering and fit functions carry the gesture outcomes as unit tests; device checks are named where a unit test cannot see.
- **SEC-1 (MUST), compliant.** Page metadata and calendar text are untrusted, never reach a prompt (AC-4 test over tool outputs), and reach the geocoder only through `placeQuery`; JSON-LD parsing is size- and depth-bounded; client keys come from the session, not source; the geocoding key and pepper are server env.
- **SEC-2 (MUST), compliant.** `hasPoint`, the points read and the events read go through `memberOf`; the internal route checks author, switch and row state.
- **DATA-1 (SHOULD), compliant.** This file.
- **OFF-1 (MUST), compliant.** Lookups log id, outcome, latency; `og.py` logs the outcome kind; the backfill logs counts; no job payload carries more than ids; no error path logs a style URL. AC-7 tests the log lines and payloads.
- **OFF-2 (MUST), compliant.** `places` and `location` are plaintext like every other column; nothing claims otherwise.
- **OFF-3 (MUST), compliant.** Points read member-scoped; backfill by author; `places` and `place_lookups` stay account-free (tested).
- **OFF-4 (MUST), compliant.** A calendar location is looked up and its result kept as derived state; the text never enters `place_lookups`; `place_id` and `located_location` go with the copy.
- **OFF-5 (MUST), compliant.** The model's location crosses through pydantic and zod schemas, with the declined-not-failed refusal.
- **OFF-6 (MUST), compliant.** Setting and clearing a location and a link's point are `edit_content`, made reversible for these fields by `place_prior` restored in the turn's Undo. A geocoder lookup is egress to a processor, as 006 and 016 established, not an outward action to a person.
- **OFF-7 (SHOULD), compliant with the log entry.** New tokens are added to the design system and consumed; ramps (`--moss-700`, `--ink-900`) are replaced by aliases.
- **OFF-8 (MUST), compliant.** The model reads no place data; the location it writes is bounded at 120 characters.

`GATE: PASS`

## Dependencies and open decisions

- **Owner actions before switch-on**: a MapTiler account on a paid plan (Flex, for commercial use and the European endpoint); four keys (geocoding, web, iOS, Android) restricted per surface; a spend cap and alert; MapTiler's written no-training and retention terms and its billing terms captured (T0.3). None blocks the build: it ships switched off.
- **New environment**: on `core-api`, `MAPTILER_GEOCODING_KEY`, `PLACE_HASH_PEPPER`, `MAPTILER_KEY_WEB`, `MAPTILER_KEY_IOS`, `MAPTILER_KEY_ANDROID`; on `agent`, `MAPS=on`. All unset means everything in the feature is off.
- **The cost sheet** (`/cost-report`) gains MapTiler's per-account cost after the terms are captured.
- No open decision at the bottom of `docs/tech/decisions.md` blocks this.
