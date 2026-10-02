# Apply: A thread's map

Drawn in `explorations/maps.html` with the product owner on 1 and 2 October 2026, against `main` read
at `78e6836114c1` (028 Not in a thread built). All three surfaces, both themes. Standalone copy:
`handoff/maps-standalone.html`, with the iOS, Android and web switch; every frame is live.

**Ready to build. Nothing is open.** The readme's **A thread's map** is the lasting statement; this
file is the build order. Decisions log: *2026-10-02 · A thread's map*. The kits are not redrawn for
the map; the exploration is the reference.

---

## 1. The stack

- **MapLibre on all three.** `maplibre-gl-js` on the web, loaded with the thread pane only when a map
  first shows. `@maplibre/maplibre-react-native` on iOS and Android, a native module in the existing
  Expo dev build (config plugin, no Expo Go). Pins, callouts and chips are React views over the map,
  never map symbols, so the three draw them identically.
- **MapTiler Streets**, and **Streets Dark** in the dark theme, switched with the theme. One style URL
  per theme in `@offload/tokens` (or env), never inline.
- **Keys:** one MapTiler key per surface, restricted by referrer on the web and by bundle id on the
  phones. Never the server's.
- **Attribution:** *© MapTiler © OpenStreetMap contributors*, 9.5px, bottom right on 75% white, always
  shown. Both licences require it.
- **Billing is per map created.** The web keeps one map instance alive for the shell and swaps its
  pins between threads; the phones create one per thread visit. Do not recreate the map on a filter
  change, a theme change (swap the style), or a resize.
- Budget the app size: about +4 to 6 MB on iOS, +3 to 5 MB on Android, about 230 KB gzipped on the
  web, lazy.

## 2. Place lookup moves to MapTiler Geocoding

Google's terms do not allow Places results on a non-Google map, so the lookup changes with the map.

- `apps/core-api/src/places/resolve.ts`: a `maptilerGeocoder: Geocoder` beside `googleGeocoder`,
  calling MapTiler's forward geocoding with the query and nothing else, one result, the same 8s
  timeout and the same privacy rules in the file's header (only the name goes, in a job, ids and
  outcome in logs, never the query). `resolvePlace` defaults to it.
- Migration `0067_places_maptiler.sql`: `places.provider` check gains `'maptiler'`; `places` gains
  `approximate boolean not null default false`; `connector_events` gains
  `place_id uuid references places (id) on delete set null`.
- **Every existing place is looked up again once.** A one-off job over content and notes with a
  `place_id` whose place is `google`: clear the pointer, delete the matching `place_lookups` rows,
  and book `resolvePlace` per row, rate limited. After it drains, delete the `google` places. Rows
  that miss stay a name with no pin, which is a normal state.
- `places/reverse.ts` (a photo's town, never drawn on a map) stays on Google.

## 3. What earns a point

Today only `type = 'location'` resolves. Three sources:

- **Saved places**, as now.
- **Links with a location.** When the link is read (only with `web_links_enabled`, as today), the
  reader also looks for a location in the page head: schema.org `geo` / `address` in JSON-LD,
  `place:location:latitude/longitude`, `og:latitude/longitude`, `og:street-address`. Coordinates are
  stored as a place directly (provider `page`, no lookup); an address or a place name goes through
  `resolvePlace`. `apps/agent/src/offload_agent/og.py` and `reader.py` gain the fields; the
  content row gains the `place_id`. A listing that gives an area rather than a point (Airbnb before
  booking, a hotel search result) stores it with `approximate = true`.
- **Events with a venue.** offload's own events resolve their location text through `resolvePlace`.
  Connected calendar events resolve `connector_events.location` the same way, in a job after sync,
  through the same caches. The text is somebody else's (AC-11): it goes to the geocoder as a query
  and nowhere else, and is never shown as an instruction.

## 4. The Places section is retired

- `packages/widgets/src/index.ts`: `"map"` leaves `WIDGET_KINDS` and the earning rules; a stored
  `preference.widgets` containing `"map"` is read without it. A new `hasPoint(rows)` (any live row
  with a place that has `lat` and `lng`) is what earns the switch.
- `apps/mobile/components/shell/Widgets.tsx`, `apps/web/src/components/panes/Widgets.tsx`,
  `apps/mobile/components/labels/LabelList.tsx`: drop the `map` heading and block.
- The agent's widget ordering argument in `harness/tools.py` drops `"map"`; evals that order widgets
  update.
- Located things stay in Everything in here, unchanged.

## 5. The switch (phones, and the web below 1200px)

- In the thread's app bar, after the title and before share and More: a segmented pair, `list` and
  `map-pin`, 36 by 30 halves on a `--surface-fill` pill with the picked half raised (`--surface-raised`,
  `--shadow-1`). Android: an outlined segmented button, 44 by 32 halves, the picked half on
  `--surface-accent-soft` with `--moss-700`. Labels *List* and *Map* for assistive tech.
- Drawn only while `hasPoint`. Losing the last point removes it and returns the thread to List.
- **Map** replaces the body under the app bar with the map, full bleed to the plate. The thread's
  name moves into the app bar title. The label filter bar floats over the map's top edge, the chips
  on `--surface-raised` with `--shadow-1`, the same pick as the list. The composer plate stays.
- The choice is a device preference per thread (the same store as the fold), and a thread opens the
  way it was left.

## 6. The web column (1200px and wider)

- The thread pane becomes two columns: the list at its normal width, and the map in a 460px column
  on the right, full height, sticky, with an inset 1px `--border-hairline` on its left. No switch.
- Hovering a row scales its pin to 1.35 (140ms `--ease-out`); hovering an approximate row raises its
  circle's fill to 30%. Picking a pin or a row opens the callout and gives the row `--surface-fill`.
- Crossing 1200px either way keeps the pick and the map instance.

## 7. Pins, circles, callout

- **Pin:** 16px, 2.5px white ring, shadow `0 1px 4px rgb(11 11 11 / .35)`. Fill is the first label's
  `--label-n`; two labels split vertically at 50%; three or more use the first two; none is
  `--ink-900`. Events are 5px-radius squares. Picked: 24px, 3px ring. Target 44px.
- **Approximate place:** a circle of about 300m radius in the label's colour, 16% fill and a 1.5px
  ring at 70%; picked, 26% and 2.5px. Tapping inside picks it. It becomes a pin when an exact place
  replaces it.
- **Clusters:** overlapping pins become an ink count dot until zoomed apart.
- **Callout:** 228px, `--surface-raised`, radius 14 (16 on Android), shadow
  `0 6px 20px rgb(11 11 11 / .22)`, a 12px rotated-square tail on the point (on the centre for a
  circle). Name 15px semibold; kind and `LabelMark`s 12.5px; then two 32px pills (36 on Android):
  *Directions* on `--surface-inverse` with a white `compass`, and *Open* on `--surface-fill`.
- Tapping the map closes it; tapping another pin moves it; picking pans just enough to keep it in the
  frame (126px from either side, 190px from the top).

## 8. Directions and Open

- **Directions** opens the device's maps app with the place as the destination, by coordinates and
  name: Apple Maps on iOS, or an action sheet *Apple Maps* / *Google Maps* when Google Maps is
  installed (`comgooglemaps://` in `LSApplicationQueriesSchemes`); a `geo:` intent to Google Maps on
  Android; `https://www.google.com/maps/dir/?api=1&destination=lat,lng` in a new tab on the web.
- **Open** opens the thing's existing sheet, the same as tapping its row. On the phones a half sheet
  over the map, the scrim at 35%. On the web the side pane, sliding over the map column, the map live
  beside it.
- The sheet as drawn: header with the 44px type tile, the name at 19px semibold, *kind · thread*, and
  a 32px close; rows of 46px for When, Address, Link, Labels and Added by (only those present, no
  chevrons on read-only rows); a footer of two equal 48px pills, 10px apart: *Directions* filled
  (`--surface-inverse`, white `compass`) and *Open link* (`arrow-up-right`) for a link or *Edit*
  (`pencil`) otherwise, on `--surface-fill` (Android: 40px, outlined). An approximate place's Address
  reads *Approximate, Alfama*.

## 9. Framing and filtering

- The map opens fitted to every point, padding 28px at the sides, 70px top (190px or 40% of the
  height, whichever is less, when a callout is open), 40px bottom; never closer than zoom 15.
- The thread's label pick filters points and rows together. A pick that leaves none keeps the
  thread's whole area and shows *Nothing under Food on the map.* on a raised pill at the foot.
- A thing with no point is not drawn and is not counted anywhere on the map.

---

## Per surface

| Surface | Files | What |
| --- | --- | --- |
| Server | `places/resolve.ts`, migration `0067_places_maptiler.sql`, `jobs/handlers.ts` (re-resolve, event places), `connectors/sync.ts`, `routes/threads.ts` (place with `lat`, `lng`, `approximate` on rows and events) | Items 2 and 3 |
| Agent | `og.py`, `reader.py`, `harness/tools.py`, evals ordering widgets | Location from a page; no `map` widget |
| Shared | `packages/widgets/src/index.ts`, `@offload/tokens` (style URLs) | `hasPoint`; `map` retired |
| iOS / Android | `screens/Thread.tsx` (switch, title), new `components/map/ThreadMap.tsx`, `Pin.tsx`, `Callout.tsx`, `shell/Widgets.tsx`, `labels/LabelList.tsx`, `app.config` plugin and query schemes | Items 1, 4 to 9 |
| Web | `panes/Thread.tsx`, new `components/map/*` with one shell-level map instance, `panes/Widgets.tsx`, `shell.module.css` (the 1200px split) | Items 1, 4 to 9 |

## Checks

- A thread with no point has no switch and no column.
- Saving a place, a link with a location, or an event with a venue adds the switch once it resolves.
- Map shows every point; the chips filter pins and rows together; the composer stays.
- Two labels split a pin; no label is ink; an event is a square; an Airbnb is a circle.
- Directions opens the right app on each platform; Open shows the sheet with two equal buttons.
- The web at 1200px and wider shows the column with no switch, and one map instance across threads.
- The Places section is gone from every thread.
- MapTiler and OpenStreetMap attribution are visible on every map.
- No Google Places result is drawn on a map after the re-resolve drains.
