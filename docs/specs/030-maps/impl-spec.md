# 030 A thread's map: implementation

Reads with `feature-spec.md`. Where the two disagree, the feature spec wins and this file is wrong. Google's terms are quoted from the pages as read on 2026-10-02 (captured in T0.3); where this file says "the terms", it means those captures.

## What is already true, and what that settles

- **The lookup boundary exists** (`apps/core-api/src/places/resolve.ts`, 006): a `Geocoder` function type, `resolvePlace(contentId, geocode)`, two caches (`places`, `place_lookups`), a `location.resolve` job booked in the same transaction as a `location` row (`routes/tools.ts:1838`), a payload of an id and nothing else (`jobs/handlers.ts:315`), and a log line of id, outcome and latency (`jobs/handlers.ts:320`). This feature generalises it rather than adding a second one. `googleGeocoder` today asks Text Search for `places.id,places.displayName,places.formattedAddress,places.location`, which is the Pro tier and keeps what the terms forbid keeping; it is replaced.
- **Google was never on.** `GOOGLE_MAPS_API_KEY` is unset in production (`docs/tech/going-public.md` item 13), so `googleGeocoder` returned null for every lookup and `resolvePlace` wrote **a remembered miss for every location ever saved**. No `places` row exists in production.
- **What Google allows us to keep** (Service Specific Terms, Places API): place ids indefinitely; latitude and longitude "for up to 30 consecutive calendar days"; nothing else, so no name, address, address component or type. Results may be shown next to a Google map and must not be used with a non-Google map (billing outside the EEA, owner, 2026-10-02). **What Google does with what it receives**: keeps it and uses it "to provide and improve Google products and services", as an independent controller (Terms of Service 4.4(a), (b)). **What it costs**: Text Search Essentials (IDs only) and the phones' Maps SDK are free without limit; Place Details Essentials and web map loads are free to 10,000 a month; a cloud map id on a phone moves its loads onto the billed web SKU.
- **What we must not send, and how the design meets it.** Terms of Service 4.4(c)(ii) bars offload from providing Google any end user's personally identifiable information or any European end user's personal data. 4.4(c) governs what offload provides through the APIs: the server's queries. Those carry a filtered place name and nothing about who asked, which the owner reads as not personal data. A device's map load sends Google the device's address and the area drawn directly; Google collects that itself, as a controller under the Controller-Controller terms 4.4(b) incorporates, rather than receiving it from offload. **That reading is the product owner's decision of 2026-10-02 and is recorded in `docs/tech/decisions.md` (T5.2)**; `placeQuery` is the mitigation for the query path only, which is what it is.
- **The link's page is already fetched by code, outside the model**: `og.picture()` in the agent worker (`og.py`), called in `_look_up` (`worker.py:559`) and on the filing path for a link in the dump (`worker.py:653-669`, gated by `_in_the_dump`, and today only when the model gave no `image_url`), with the SSRF guard, no redirects, 4s and 256KB.
- **The quarantined reader already has a `place` field** (`reader.py:52`), the bounded way a page's venue reaches the model.
- **`connector_events.location` is already stored** (0049); `threadEvents` deliberately does not select it today.
- **The thread's list is paged** (30 a page, 025), so the map's points are their own read.
- **Shared pure logic lives in `packages/widgets`**, read by both clients and the API (`src/map.ts`, T3.2, done).
- **Tokens and component contracts come from the design system's own files**: `packages/tokens/src/generate.mjs` reads `.claude/skills/offload-design/tokens/`, and `pnpm lint` reads the generated `_adherence.oxlintrc.json` for the 21 components' prop contracts. Both change on `main`, before the clients that need them.
- **`runtimeVersion` is `appVersion`** (`apps/mobile/app.json:175`), so an update reaches only builds of the same app version.
- **The web has its own theme setting** (`apps/web/src/lib/appearance.ts`: light, dark, system; light by default). The phones follow the device.
- **The web's Content Security Policy** (`apps/web/src/lib/csp.ts`) is a nonce with `'strict-dynamic'` in `script-src`, so host sources there are ignored by browsers that honour it; `img-src` already allows `https:`; `connect-src` is `'self'` and the API; `font-src` is `'self' data:`.
- **The turn's Undo** (`routes/dumps.ts` `undoTurn`) soft-deletes what a turn created and restores question answers; it has no path for a field edited on an existing row. A separate task covers that in general; this feature restores its own place fields.
- **The model's tool output is validated by pydantic** (`harness/plan.py:913`) and sent as `model_dump()` (`:951`), so a key the model invents never reaches the worker's payload; the worker's own strip is a second lock.
- **The agent worker claims jobs by kind** (`worker.py:72`).

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Places attached: 20 typical, 300 heavy. Links: 50 typical, 1,000 heavy. Events with a location: 10 typical, 100 heavy. Picked calendar events in the window (yesterday to +60 days): 20 typical, 400 heavy. |
| Fan-out | Points per thread: 5 typical, 60 heavy for content; plus up to the window's calendar events, 100 heavy. The read stops at 500. |
| Growth | 1 to 3 new points a week for an active account. |
| Read pattern | `hasPoint` on every thread bundle read (two flat EXISTS, both clients, every thread open). The points read once per Map or column visit and after a change to the thread, plus one re-read when it reported places being fetched again. |
| Write pattern | Two calls per new located row (a free id search and a Details call), in a background job. Calendar lookups after each sync (15 minutes) for new or changed locations, at most 200 per calendar per sync. A Details call for each aged place on a map somebody opens, at most once a place a day. A daily SQL sweep that drops coordinates past thirty days and places nothing points at. The backfill once. |
| Sort and filter | Points: `content.thread_id = ? and place_id is not null and deleted_at is null and archived_at is null` joined to `places`; picked calendar events by `calendar_id in (picks) and occurs_at between and place_id is not null`. `hasPoint`: those two as EXISTS, requiring `places.lat is not null`. Calendar candidates: `deleted_at is null and location is not null` per calendar, compared by fingerprint. Age sweep: `places.provider = 'google' and coords_at < now() - 30 days`. Backfill: `type='link' and place_read_at is null and account_id = ?`; `type='location' and place_id is null`. |

**What follows.**
- **Pagination:** none for points; a hard limit of 500, content first by `created_at desc`, then events nearest now.
- **Indexes:** `content (thread_id) where place_id is not null and deleted_at is null` serves the content half of `hasPoint` and the points read. `connector_events (calendar_id, occurs_at) where place_id is not null and deleted_at is null` serves the calendar half. `places (coords_at) where provider = 'google' and lat is not null` serves the age sweep.
- **Normalisation:** `hasPoint` is computed, not stored.
- **Cost.** Details calls follow maps opened, not places kept: a new place costs one, and a place costs one more each time a map shows it after its coordinates aged out, at most once a day. At a thousand people opening a few maps a month each, a few thousand calls, inside the free 10,000; at ten thousand, around the free tier's edge. Web loads are inside the free 10,000 to a few hundred heavy web users; phones and id searches free. The cost sheet (`/cost-report`) carries the line after switch-on.
- **Partitioning:** none.

## Data model

Migration `0068_places_google.sql` (0067 is taken):

```sql
-- No place ever resolved in production; a local database may hold some, each
-- carrying a name and an address Google's terms do not let us keep. Every
-- remembered miss was written with no key set and is not a miss. Destructive
-- and accepted: there is nothing in production to lose, and a development
-- database loses only cache.
update content set place_id = null where place_id is not null;
update notes set place_id = null where place_id is not null;
delete from place_lookups;
delete from places;

-- What Google lets us keep: its place id (provider_place_id) indefinitely,
-- and the coordinates for at most thirty days. Never its name, its address
-- or its types; whether a result was an area is derived from them and goes
-- with the coordinates. A page place keeps its coordinates: they are the
-- page's, not Google's.
alter table places drop column name;
alter table places drop column formatted_address;
alter table places drop column resolved_at;
alter table places drop constraint places_provider_check;
alter table places add constraint places_provider_check
  check (provider in ('google', 'page'));
alter table places alter column provider drop default;
alter table places add column approximate boolean;
alter table places add column coords_at timestamptz;

-- What a row that is not a `location` is looked up by: an event's location
-- (written by the model from the dump or the reader's `place` field, and
-- shown on the place sheet), or the place name a link's page gave (looked up,
-- not shown). On the row, never in a job payload. Bounded here as well as in
-- code.
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
-- alone, never accepted from a request body, overwritten by the next place
-- edit and cleared by the daily sweep after 25 hours, which covers a mail
-- turn's 24-hour Undo.
alter table content add column place_prior jsonb;
alter table content add column place_prior_at timestamptz;

alter table connector_events add column place_id uuid
  references places (id) on delete set null;
-- A keyed fingerprint of the location text last looked up, so an unchanged
-- location is never looked up twice, without a second copy of somebody
-- else's words. Domain-separated from the query cache's key, so the two can
-- never be joined. Goes with the row when the copy goes (019).
alter table connector_events add column located_key text;

create index content_points on content (thread_id)
  where place_id is not null and deleted_at is null;
create index connector_events_points on connector_events (calendar_id, occurs_at)
  where place_id is not null and deleted_at is null;
create index places_age on places (coords_at)
  where provider = 'google' and lat is not null;
```

`schema.ts` mirrors it. `notes.place_id` (0033) stays, unused, as before. `places` and `place_lookups` stay account-free; a test asserts both tables' column lists.

**Place keys.** A `google` place keys on Google's place id (`provider_place_id`). A `page` place keys on its coordinates rounded to five decimals (`"38.71130,-9.13010"`), never approximate, never aged, no `place_lookups` row.

**Places on rows.** `content.place_id` attaches to `location`, `link` and `event` rows. **A page place drives nothing on the server**: its coordinates are drawn and handed to Google Maps when a person taps Directions, nothing more, at the trust a page's own picture already has.

## Interfaces

### Core API

**`env.ts`.** `MAPS: z.enum(["on", "off"]).default("off")` and `PLACE_HASH_PEPPER: z.string().min(32).optional()`, with a refinement that refuses `MAPS=on` without the pepper or without `GOOGLE_MAPS_API_KEY`, so a missing pepper fails at boot rather than hashing with nothing.

**`places/query.ts`** (T1.2, built; hardened by T1.2b):
- `placeQuery(raw)`: NFKC, control characters out, whitespace collapsed, trimmed; null when it spans lines, is empty or over 120 characters, or holds: any `\p{N}`; an `@`; a `/`; `://`, a leading `www.`, or a dot followed by two to six letters at a word's end (a bare host); a possessive (`'s`, `’s`, `ʼs`, a plural `s'` or `s’`, or `casa d[aeo]`, `chez`, `bei` before a word); a leading street word (`rua|r\.|avenida|av\.?|travessa|tv\.?|calçada|largo|praça|estrada|street|st\.?|road|rd\.?|lane|ln\.?|drive|dr\.?|boulevard|blvd\.?|way`); a call or no-place word (`zoom|google meet|meet|teams|webex|whereby|jitsi|online|phone|call|tbc|tbd`, whole words).
- `queryKey(q, pepper)`: HMAC-SHA256 over `"lookup|" + normalised q`. `calendarKey(text, pepper)`: the same over `"calendar|" + normalised text`. Two domains, so a calendar fingerprint never equals a cache key.

**`places/google.ts`** (new), the only module that calls Google's place APIs:
- `PLACES_HOST = "places.googleapis.com"`, a constant; a test asserts no other host is reached.
- `searchId(q)`: `POST https://places.googleapis.com/v1/places:searchText`, `X-Goog-Api-Key`, `X-Goog-FieldMask: places.id` (Text Search Essentials, IDs only), body `{ textQuery: q }` plus the one result-count field **the live endpoint accepts, confirmed by T0.4** (the existing code sends `maxResultCount`; the documentation now says `pageSize`); nothing else, no language, region or location bias. Returns the first id or null.
- `details(id)`: `GET https://places.googleapis.com/v1/places/{id}`, `X-Goog-FieldMask: location,types` (Place Details Essentials). Returns `{ lat, lng, types }` or null.
- `kindOf(types)`: `coarse` for `country`, `administrative_area_level_1`, `administrative_area_level_2`, `continent`; `area` for `locality`, `sublocality*`, `neighborhood`, `postal_code*`, `administrative_area_level_3` and below, `colloquial_area`, `political` alone; `spot` otherwise.
- 8s timeout each, `fetch` with no cookie or referrer, errors not inspected. Tests assert the field masks and body keys exactly, since the mask is the bill and an unknown key is a refusal.

**`places/resolve.ts`**, rewritten around those:
- `mapsOn()`: `env.MAPS === "on"` (which the refinement makes imply the key and the pepper). Off: `resolvePlace` returns `skipped` before reading the cache and writes nothing; everything below that says "while on" checks it.
- `Geocoder` becomes `(q) => Promise<{ placeId: string; lat: number; lng: number; approximate: boolean } | null>`; `googleGeocoder` is `searchId`, `details`, `kindOf` (`coarse` → null). Tests pass a stub that runs the real `placeQuery` first, so a stub cannot pass a query the filter would refuse.
- `resolvePlace(contentId, geocode = googleGeocoder)`: reads the row; the query is the row's `title` for a `location` and its `location` for an `event` or a `link`; `placeQuery` it; null → `skipped`. Cache read by `queryKey`: a hit whose place has coordinates attaches; a hit whose place lost them attaches and books `places.refresh` for it; a miss older than 30 days is deleted and looked up again. On a result, upsert `places` on `(provider, provider_place_id)` with coordinates, `approximate` and `coords_at = now()`, write `place_lookups`, attach.
- `attach(contentId, placeId, query)`: sets `place_id` only while it is null **and** the row's query still equals `query`, so a lookup a rename or an edit overtook ends `skipped`.
- `attachPagePoint(contentId, lat, lng)`: finite, `-90..90`, `-180..180`, not `0,0`; upserts the `page` place; attaches.
- `resolveEventPlace(eventId)`: a live event's `location`; `placeQuery`; `calendarKey` equal to `located_key` → `skipped`; otherwise `geocode` **without reading or writing `place_lookups`**, upsert the place, set `place_id` and `located_key` together (a miss sets `located_key` with `place_id` null).
- `refreshPlace(placeId)`: a `google` place with null coordinates and something live pointing at it → `details(provider_place_id)` → coordinates, `approximate`, `coords_at`.
- The old `googleGeocoder`, with its display-name and address fields, is deleted. `GOOGLE_MAPS_API_KEY` keeps its name and now serves the lookup; `reverse.ts` is untouched and its gate still needs `PHOTO_TOWNS=on` as well (AC-33).

**`places/age.ts`** (new), the thirty-day rule as SQL with no call to Google: set `lat`, `lng`, `approximate` and `coords_at` to null on every `google` place whose `coords_at` is older than 30 days; delete every place with nothing live pointing at it (no live content row, no connector event, no live Undo record; its `place_lookups` rows go by cascade); clear `place_prior` older than 25 hours. Booked daily as `places.age`, keyed by the day, while on.

**Jobs** (`jobs/handlers.ts`):
- `location.resolve` `{ contentId }` now serves every content type. Log line unchanged.
- `places.refresh` `{ placeId }`: `refreshPlace`. Key `places.refresh:<placeId>:<day>`, so a place is asked about at most once a day.
- `places.age` (above).
- `event.locate` `{ calendarId }`: up to 200 live candidates in the calendar from yesterday to +60 days whose location's `calendarKey` differs from `located_key`, oldest first, each through `resolveEventPlace`; the rest wait for the next sync. Booked while on, after `syncConnection`'s upsert loop (`connectors/sync.ts`) for each selected calendar at least one thread picks (key `event.locate:<calendarId>:<15-minute slot>`), and by `setPick(..., true)` (`routes/threads.ts:1585`, key `event.locate:pick:<calendarId>:<threadId>`).
- `maps.backfill`: booked at boot while on, key `maps.backfill:030`. Deletes every `place_lookups` miss; books `location.resolve` for every `location` row with `place_id` null (key `location.resolve:<id>:030`), and `link.place` for every `link` row whose author's `web_links_enabled` is true, whose `place_read_at` is null, **and whose `url` appears in the `text` of the message at `derived_from_message_id`**, selected by `content.account_id` and never by membership (key `link.place:<id>`). Re-running books nothing done.
- `link.place` `{ contentId }`: claimed by the **agent worker** (`maxAttempts: 1`). Before any request it reads the row, its message and its author's switch and stops unless the row is a live link, `place_read_at` is null, `web_links_enabled` is true and the URL is in the message's words; then fetches and posts to the internal route, which checks the same again.
- No job payload carries anything but ids.

**Filing** (`routes/tools.ts`):
- **Everything the privacy page will describe turns on together, with `mapsOn()`.** While off: `add_content` ignores the `worker` envelope (so `place_read_at` stays null and the backfill reads those links later), `threadEvents` selects no location or place, `hasPoint` is false and the points read is empty, `event.locate`, `places.refresh` and `places.age` are not booked, `/api/me` says `maps: false`. The merge changes nothing a person sees or anything that leaves.
- `add_content` gains `location?: string`, accepted only on `type: 'event'` (any other type: 400 `location_not_here`). **A value `placeQuery` refuses, or over the shape, is 400 `bad_place_name`**, the refusal a location's name already uses. `location_not_here` joins `ARGUMENT_REFUSALS` (`worker.py:753`); both are `declined`, not failed. With a location, book `location.resolve` in the transaction.
- **A `location` row's title** goes through `placeQuery` for the lookup only; a title it refuses is kept as the row's title and not looked up. The existing title bound is unchanged. (The asymmetry with an event's location is deliberate: feature spec section 1.)
- `add_content` accepts a reserved `worker` envelope, `{ pageRead: true, pageLocation?: { lat, lng } | { name } }`, never in the model's schema, only on `type: 'link'`. **The Core API reads the author's `web_links_enabled` in the same transaction** and ignores the envelope when it is off or the map is off. Sets `place_read_at`; coordinates go through `attachPagePoint`; a name is stored in `location` (shape-bounded) and books `location.resolve`, which sends it only if `placeQuery` passes it.
- `edit_content` gains `location` and `clearLocation` (as built: null is not stated in this tool, so clearing is said outright), **through the existing per-row author check** (`not_yours` for anybody but the row's author, as every field already is): on an event, a string sets it (as on create, clears `place_id`, books `location.resolve`) and `clearLocation` clears it and `place_id`; on a link, only `clearLocation` is accepted and clears `place_id` (keeping `place_read_at`); on a location row, refused (`location_not_here`; rename instead); a rename of a location row clears `place_id` and books `location.resolve`. **Undo:** before changing any of these, the write stores `place_prior = { messageId, placeId, location, placeReadAt }` and `place_prior_at`; `undoTurn` restores them for rows whose `place_prior.messageId` is the turn's message, clears both, and books no lookup. Nothing in a request body can set `place_prior`, `place_id` or `place_read_at`.
- `list_thread_content` rows gain `onMap: boolean` (the row's place has coordinates). Not Google's content and constant in size. `find_events` and every other tool result: unchanged. A test asserts their output keys contain no `place`, `location`, `address`, `lat` or `lng`.

**Internal.** `POST /internal/v1/content/:id/page-location` `{ jobId, found: { lat, lng } | { name } | null }`, internal token, from `link.place`: refuses unless `jobId` is a running `link.place` job whose payload names this row and the checks `link.place` made still hold; then as the `worker` envelope does. Neither the route's request logging nor the worker's client logs its body or URL; a failure is logged as an outcome kind.

**Reads.**
- `ThreadBundle.hasPoint: boolean`, while on: EXISTS a live content row in the thread whose place has coordinates, or EXISTS a `thread_calendars` pick of the thread on a selected calendar with a live connector event from yesterday to +60 days whose place has coordinates. Two flat queries on their own partial indexes, not `threadEvents`.
- `ThreadBundle.preference.widgets` drops `map` at read (`readPreference`, T3.1, done); nothing writes the filtered value back.
- The content row's `place` becomes `{ id, lat, lng, approximate } | null` (no name, no address), and the row gains `location: string | null` (an event's; a link's is not sent, since it is a lookup key and not shown). Both clients' `lib/threads.ts` types follow. The web's row meta (`components/panes/Widgets.tsx`) draws an event's `location` where it drew `place.address`.
- `GET /v1/threads/:id/points` → `{ points: Point[], pending: number }`, member only (`memberOf`, 404 otherwise), empty while off:
  ```ts
  type Point = {
    key: string;                    // "c:<contentId>" | "e:<eventId>"
    source: "row" | "calendar";
    contentId: string | null;
    type: ContentType | "event";    // a calendar's event is "event"
    title: string;                  // the row's or the event's own title
    address: string | null;         // an event's own location, or a calendar event's
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
  Content first (live rows with a place with coordinates, newest first), then `threadEvents` for yesterday to +60 days now selecting `e.location` and the place, events nearest now first, together cut at 500. **Attached Google places that have lost their coordinates** are left out, `places.refresh` is booked for each, and `pending` counts them; a client that gets `pending > 0` reads again once, three seconds later, and draws what arrived without re-fitting.
- `threadEvents` and `GET /v1/threads/:id/events` gain `location: string | null` and the place for every member while on (the owner's decision); `today/day.ts` is per account and unchanged. The comments at `threads/calendars.ts:207`, `routes/threads.ts:1596`, `apps/web/src/lib/threads.ts:178` and `apps/mobile/lib/threads.ts:131` change to the new rule and say what still does not cross.
- `GET /api/me` (through `meFor`) gains `maps: boolean`, which is `mapsOn()`. `PATCH /api/me` ignores a `maps` in its body; it is the server's switch for the whole feature on every surface.

### Agent

- `og.py`: `picture()` becomes `page(client, url, read_location: bool) -> PageMeta(image, location)`, one request, same guard and caps (`MAX_BYTES` unchanged). With `read_location`: `og:latitude`/`og:longitude` and `place:location:latitude`/`longitude` (anchored meta regexes like `_META`, no nested quantifiers); at most ten `<script type="application/ld+json">` blocks within the bytes read, each at most 64KB, refused before parsing if a scan of its brackets nests deeper than 20, parsed with `RecursionError` and `ValueError` caught and silent; from them `geo.latitude`/`longitude` (first found), else a `Place`'s (or a subtype's) `name`. **No address arms**: a page's street address is never read. Coordinates must be finite, in range and not `0,0`. A name is cut to 120 characters. The result is `{ lat, lng } | { name } | None`. Logs: the outcome kind only. `_look_up`'s call (`worker.py:559`) passes `read_location=False`: the reader already returns a `place`.
- `worker.py`: on the filing path the page is fetched when the link is in the dump and either the picture is wanted or a location is (`read_location = lookups[2].may_read_links and MAPS_ON`, where `MAPS_ON` is the agent's own `MAPS=on`); `image_url` is attached only when the model gave none, and the `worker` envelope when the location was read. **The final payload, after `_camel`, has `worker`, `pageLocation`, `pageRead`, `page_location` and `page_read` removed before the worker's own envelope is added** (the pydantic drop at `plan.py:913` is the first lock; this is the second). New job kind `link.place`, as above.
- `harness/tools.py`: `AddContent.location: str | None = Field(None, max_length=120)` with a single-line validator; `EditContent.location` to set, and `EditContent.clear_location: bool` to clear (as built: `edit_content` reads null as not stated everywhere, and `model_dump()` cannot tell an unset field from an explicit null); `SetThreadPreference.widgets` loses `map` (done).
- Prompts (`prompts/`): the filing prompt says an event takes the name of the public place it happens at, from the person's words or the reader's `place`, never a street address, a person's home or a guess; that a refusal of a location means it is not a public place and the event is filed without one; and that a listed row's `onMap` says whether it is on the map. `/harness-map` regenerated after.
- Evals: `08-the-calendar.json` gains cases: *dinner at Time Out Market on Friday at 8* files one event with location *Time Out Market* and no separate `location` row; *dinner at Ana's on Friday* files none; *dentist Tuesday 3pm* files none; an invitation link whose reader `place` is the venue files it; *actually it's at Cervejaria Ramiro* edits it; *that Airbnb isn't where we're staying, take it off the map* clears the link's point. Running them is a separate ask, before switch-on (AC-5).

### Shared (`packages/widgets`)

- `WIDGET_KINDS` is `["todo", "files"]` (T3.1, done).
- `src/map.ts` (T3.2, done): `pointFill`, `pointShape`, `cluster`, `fitBounds`, `calloutPadding`, `directionsUrl`. Gains (T3.3): `splitZoom(points, view, padding)`, the camera that separates a count dot's members (`fitBounds` with a max of 21); `hitCircle(tap, circles, metresPerPixel)`, the circle a tap lands in (inside 300m, or within 22px of the centre when the circle is drawn smaller than that, the nearest centre winning), or null.

### Mobile (`apps/mobile`)

- `react-native-maps` at the version `npx expo install` picks for SDK 57, with its own config plugin, keys `iosGoogleMapsApiKey` and `androidGoogleMapsApiKey` read from the build's environment (`GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY`, **sensitive** EAS environment variables, never echoed). `app.json` becomes `app.config.ts` extending it, which also sets `extra.mapsAvailable = Boolean(key for the platform being built)`. **No key, no map**: the client reads `Constants.expoConfig.extra.mapsAvailable` and, when false, mounts no `MapView` and draws no switch, so a keyless iOS build never falls back to Apple's map. App version bump (runtime version follows). EAS development builds for both phones.
- `components/map/ThreadMap.tsx`: `MapView provider={PROVIDER_GOOGLE}`, **no `googleMapId`** (it would bill every load); one per thread visit, created on first entry to Map and kept mounted through List and Map toggles until the screen unmounts; **hidden under List** with `pointerEvents="none"`, `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`, and translated off-screen on Android, whose map surface does not reliably honour opacity; `mapPadding.bottom` follows what covers the map's foot (the plate, the plate with the keyboard, the place sheet), a change of padding holding the camera; iOS dark through `userInterfaceStyle` (updated in place), Android dark through `customMapStyle` from `components/map/android-dark-style.json` (in place; Android's own scheme prop is fixed at creation); camera moves with duration 0 when `lib/motion.ts` says reduced motion.
- `components/map/Point.tsx`: a `Marker` with offload's view as its child; `tracksViewChanges` true for one frame whenever the view changes (picked, hover, label colour, filter) and false otherwise; marker identity keyed on the point's key so a re-cluster does not re-add markers. Clusters recomputed from `cluster()` on `onRegionChangeComplete`, from the camera's zoom, never during a gesture. Approximate places as `Circle` with `radius={300}`, picked by `hitCircle` from `MapView.onPress` before the tap is taken as closing the callout.
- `components/map/Callout.tsx`: **an ordinary view in the screen's own layer, not a `Callout` and not a marker child**, positioned from `mapRef.pointForCoordinate()` and re-projected on `onRegionChange`; two `Pressable`s with `hitSlop` to 44. The re-projection cost is checked on the Pixel (T4.15).
- `components/map/PlaceSheet.tsx` on `DragSheet` at a half detent, scrim `--surface-scrim`, Android ground `--surface-sheet`; raises the map's bottom padding to the detent; Edit closes it and calls the row's existing open handler; values rendered as `Text`, never links.
- `screens/Thread.tsx`: the switch (an icon variant of `components/settings/Segmented.tsx`, moved out of `settings/` to be shared) in `Bar` while `bundle.hasPoint`, `/api/me.maps` and `mapsAvailable`, with labels and calendars moved into More; the Map body; the title rule; Android back returns to List; `lib/mapView.ts` keeps the per-thread choice in AsyncStorage under one key, an ordered map trimmed to 100.
- Directions: `Linking.openURL(directionsUrl(point))`.
- Failure: Android's `onMapLoaded` not firing within 10 seconds, or a points read failing, draws *Couldn't load the map*; iOS reports nothing for a map that cannot load and shows its blank ground, accepted.
- `shell/Widgets.tsx`, `labels/LabelList.tsx`: the `map` heading and block go (done).

### Web (`apps/web`)

- `@vis.gl/react-google-maps` (Google's own React library for the Maps JavaScript API), mounted only by `components/map/ThreadMap.tsx`, so the script loads when a map first shows. The key is `NEXT_PUBLIC_GOOGLE_MAPS_KEY` and **one cloud map id with Google's default style**, `NEXT_PUBLIC_GOOGLE_MAP_ID` (needed for HTML markers; `colorScheme` draws dark only while the map id carries Google's default style); either unset → no map.
- `components/map/ThreadMap.tsx`: points as `AdvancedMarker`s with offload's React views; the callout as an `AdvancedMarker`'s live content (both actions pressable); approximate places as `google.maps.Circle` with clicks resolved by `hitCircle`; `colorScheme` from `appearance.ts`'s **stored** setting (`light` → LIGHT, `dark` → DARK, `system` → FOLLOW_SYSTEM), fixed at creation, so the map is keyed by the stored setting: a Settings change makes one new map and a device switching scheme under *system* makes none. **One map per thread-pane mount and stored theme setting**: kept across the column and the switch, filters and resizes. Google's default controls off except its logo and legal line, which are never hidden. Hidden under List with `visibility: hidden` and `inert`, keeping its layout box, since a map with no size draws grey and mis-centred. Reduced motion from one `matchMedia` read. A load or authentication failure the library reports draws *Couldn't load the map*.
- `apps/web/src/components/panes/Thread.tsx`: a `ResizeObserver` on the pane's content box sets split mode at 1000px with 16px either way (split at 1016 and wider, unsplit below 984); in split mode the list's 700px cap is lifted; **one map container is always rendered in the same place in the tree** and only its grid area changes, so React never unmounts it; the switch in `PaneHead`'s `tools`, before the label tool; a thread in `.paneLeft` draws neither; in switch mode the map's foot stops above the composer.
- The composer: the top pane reports its split state through a shell context value, and the composer's card ends at the list column's edge while it is on.
- `PlaceSheet` as a 360px pane: in split mode over the list's side, leaving the map column whole; in switch mode beside the map, which narrows rather than sitting under it. Directions as `<a href={directionsUrl(point)} target="_blank" rel="noreferrer noopener">`. `Referrer-Policy` stays as it is.
- `apps/web/src/components/panes/Widgets.tsx`: the `map` heading, `<Pins>` and its placeholder surface go (done); the row meta's `place.address` becomes an event's `location`.
- Settings: the *Read links I paste* note, in the switch-on change (T5.3), not before.
- **The Content Security Policy** gains `https://maps.googleapis.com` in `connect-src`, `https://fonts.gstatic.com` in `font-src`, and only if the browser check (T4.8) shows them needed, `https://fonts.googleapis.com` in `style-src` and `worker-src 'self' blob:`. **Nothing is added to `script-src`**: the library's script element is created by nonced code, which `'strict-dynamic'` trusts, and a host there would be ignored by modern browsers and widen older ones. A test asserts the negatives: no wildcard host, no `'unsafe-eval'`, no `'unsafe-inline'` and no `blob:` in `script-src`.

### Design system and docs (on `main`, as their own commits)

- **Before the clients (T0.5):** tokens `--shadow-point`, `--shadow-point-picked` and `--shadow-callout` in `.claude/skills/offload-design/tokens/elevation.css`, the same value in both themes, written as `rgba(...)` like the rest of that file; the `SegmentedControl` icon variant and the `AppBar` order change in the component contracts; `pnpm tokens` and the generated adherence file regenerated by their usual steps, never by hand.
- `.claude/skills/offload-design/decisions.md` and `docs/tech/decisions.md` entries as the feature spec's section 13 lists, including the owner's reading of Google's personal-data term; `docs/tech/decisions.md`'s entries on the map widget, the answered open decision and the widget examples superseded in place; `docs/tech/going-public.md` item 13 rewritten (four keys, each app- and API-restricted, a daily quota per API, a budget alert, that a budget does not cap spending, and how to rotate each key).
- `docs/specs/006-what-offload-extracts`, `007`, `016`, `019-calendars/feature-spec.md:98` and `025-labels/feature-spec.md:77` amended in place with a dated note.
- `docs/tech/vendor-terms/google-maps/` with the Terms of Service, the Service Specific Terms, the Places policies and the Controller-Controller terms as served on the capture date (captured), and a README section saying what they establish and that the owner accepted them without the vendor bar.

## Edge cases

- **A rename or an event-location edit while a lookup is in flight**: `attach`'s query guard.
- **Undo after a lookup already ran for the new value**: `place_prior` restores the old `place_id` and `location`; the new place stays until the age sweep finds nothing pointing at it.
- **A place ages out while a thread is open**: the open map keeps it until the visit ends; the next points read fetches it again.
- **Google returns the same place id for two queries**: one `places` row by `(provider, provider_place_id)`, two `place_lookups` rows.
- **A refresh that fails** leaves the place without coordinates; the next map that shows it asks again the next day.
- **A calendar's text that matches a place somewhere else** (Text Search has no score): drawn where Google put it; the calendar is where it is corrected. Accepted.
- **The same calendar picked by two threads**: one `event.locate` per calendar per slot.
- **Two members connect the same calendar**: two copies, each looked up; both land on one `places` row by Google's id.
- **A calendar unticked**: its events, `place_id` and `located_key` go with the copy (`routes/connectors.ts:399`); the `places` row goes at the next age sweep if nothing else points at it.
- **A link in a shared thread**: its point is the author's read; the backfill never reads it for anyone else.
- **A link whose URL the model wrote and the person did not**: never read by the backfill; at filing, `_in_the_dump` already refuses it.
- **A page that gives coordinates and a name**: the coordinates are the point; the name is not looked up.
- **The web theme set to *system* and the device switching**: Google's map follows by itself.
- **A phone build from before the version bump**: receives no update with the map; its thread looks as today.

## Constitution check

Audited against `docs/constitution/principles.md`, read fresh on 2026-10-02.

- **DEV-1 (MUST), compliant.** The lookup is the existing module rewritten; the refresh is on demand rather than a sweep of every place; the page reader reads coordinates and names and no addresses; the backfill is a one-off for one account; no setting for place lookup; pure logic in the existing shared package; Google's own React library on the web.
- **DEV-2 (MUST), compliant.** Every divergence from the design is listed for the log, including the provider; 006, 007, 016, 019 and 025 are amended in place.
- **DEV-3 (SHOULD), compliant.** Google's own SDKs and libraries.
- **QUAL-1 (MUST), compliant.** Every task starts red; clustering, fitting, hit-testing, the filter, the field masks and body keys are unit-tested, and the lookup's stub runs the real filter; device checks are named where a unit test cannot see.
- **SEC-1 (MUST), compliant.** Page metadata and calendar text never reach a prompt and reach Google only through `placeQuery`; JSON-LD parsing is bounded; the server key and pepper are server env and the pepper is required to turn the map on; the client keys are public by nature, restricted by app, site and API, and capped by quota; the CSP gains no script source.
- **SEC-2 (MUST), compliant.** `hasPoint`, the points and events reads go through membership; edits through the per-row author check; the internal route checks job, author, switch, provenance and row state.
- **DATA-1 (SHOULD), compliant.** This file.
- **OFF-1 (MUST), compliant.** Lookups log id, outcome, latency; `og.py` the outcome kind; the backfill and the age sweep counts; no job payload carries more than ids; the internal route's body is not logged.
- **OFF-2 (MUST), compliant.** Nothing claims encryption it does not have.
- **OFF-3 (MUST), compliant.** Points read member-scoped; backfill by author; `places` and `place_lookups` stay account-free (tested).
- **OFF-4 (MUST), compliant.** A calendar location is looked up and only a keyed fingerprint and the resulting place are kept; the text never enters another table; both go with the copy.
- **OFF-5 (MUST), compliant.** The model's location crosses through pydantic and zod schemas, with the declined-not-failed refusal.
- **OFF-6 (MUST), compliant.** Setting and clearing a location and a link's point are `edit_content`, made reversible for these fields by `place_prior`, which is cleared once no Undo can use it. A lookup is egress to a company, as 006 and 016 established, not an outward action to a person.
- **OFF-7 (SHOULD), compliant with the log entry**, and the tokens and contracts land on `main` first.
- **OFF-8 (MUST), compliant.** The model reads one yes or no per row about the map and no place data; the location it writes is bounded.

The vendor bar in `docs/tech/decisions.md` (a published no-training term and short retention) is not met by Google and is **waived for this one company by the product owner, 2026-10-02**, with the privacy page saying so by name; the owner's reading of Google's personal-data term is recorded beside it. Both are decisions, not principles, so they do not block the gate; they are recorded as superseding entries, not left standing beside the integration.

`GATE: PASS`

## Dependencies and open decisions

- **Owner actions**: a Google Cloud project for Maps with billing (non-EEA address); four keys (server: Places API (New) and Geocoding API; web: Maps JavaScript API, offload's domains; iOS: Maps SDK for iOS, the bundle id; Android: Maps SDK for Android, the package with the EAS and Play signing SHA-1s); one cloud map id with Google's default style; **a daily quota on each API, set before any key is used**; a budget alert. The fixtures (T0.4) need only the server key; the web and phone keys block T4.8, T4.9, T4.15 and T5.3.
- **New environment**: on `core-api`, `GOOGLE_MAPS_API_KEY` (existing name), `PLACE_HASH_PEPPER`, `MAPS=on`; on `agent`, `MAPS=on`; on `web`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID`; on EAS, `GOOGLE_MAPS_IOS_KEY`, `GOOGLE_MAPS_ANDROID_KEY` as sensitive variables. `MAPS` unset is everything off.
- No open decision at the bottom of `docs/tech/decisions.md` blocks this.
