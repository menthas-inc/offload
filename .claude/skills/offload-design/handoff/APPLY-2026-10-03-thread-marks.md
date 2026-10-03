# Apply: Thread marks

Drawn in `explorations/thread-marks-v2.html` with the product owner on 3 October 2026, against `main`
read on 3 October: `apps/mobile/components/screens/Thread.tsx` (its `Bar`), `MyThreads.tsx`,
`apps/web/src/components/panes/Thread.tsx`, `MyThreads.tsx`, `ContentRowView.tsx` (`ThreadPill`). All three
surfaces. Standalone copy: `handoff/thread-marks-standalone.html`, with the platform and light/dark switches.

**Ready to build. Nothing is open.** The readme's **Thread marks** is the lasting statement; this file is the
build order. Decisions log: *2026-10-03 · Every thread has a mark*. The first round (emoji, colour only) is
`explorations/thread-marks.html`.

The **seventy glyphs** are Lucide (ISC), vendored in `assets/icons/`. 59 are new to the set, which is now 154.
Add them to the web's `public/icons/` and to the phones' `Glyph` map.

---

## 1. Data

- `threads.icon`: text, one of the seventy names or `lasso`. Not null; default `lasso`.
- `threads.hue`: smallint 1 to 10, the label hue (`--label-1` … `--label-10`). Not null.
- `threads.icon_set_by`: `offload` or `person`. A person's pick is never overwritten.
- Both are the thread's, so a shared thread looks the same to everybody in it. Changing them needs the same
  right as renaming (co-owned: anybody in the thread).
- Returned on every thread read: the bundle, My threads, the thread pill's source, Move suggestions, People's
  shared threads, answers.
- **Backfill** every existing thread with the rule in item 2, `icon_set_by = offload`, hues assigned per
  owner in thread creation order.

## 2. How offload picks (no model call)

On create, and on a rename while `icon_set_by = offload`:

1. Lower-case the name, split on anything that is not a letter or digit.
2. Walk the seventy in order; the first glyph with any of its words in the name wins. Plural *s* is
   tolerated both ways (*gift* matches *gifts*).
3. No match: `lasso`.
4. **Hue** (create only, never on rename): the hue least used among the owner's live threads; ties go to the
   lowest number.

The words live with the list, in one shared module both clients and the server read (`@offload/widgets` or
its neighbour), so the three cannot disagree.

| # | Glyph | Words |
| --- | --- | --- |
| 1 | `luggage` | trip travel holiday vacation packing |
| 2 | `plane` | flight flights airport |
| 3 | `car` | car service mot garage |
| 4 | `bike` | bike cycling ride |
| 5 | `tent` | camping festival |
| 6 | `map` | route itinerary city |
| 7 | `globe` | abroad visa world |
| 8 | `house` | flat home house apartment rent |
| 9 | `sofa` | furniture living move moving |
| 10 | `key` | keys landlord lease |
| 11 | `wrench` | repair fix plumber |
| 12 | `hammer` | build diy shelf bookshelf |
| 13 | `paintbrush` | paint decorate |
| 14 | `sprout` | garden balcony plants |
| 15 | `flower-2` | flowers wedding |
| 16 | `tree-pine` | christmas hike forest |
| 17 | `stethoscope` | dentist doctor health insurance clinic |
| 18 | `pill` | meds pharmacy prescription |
| 19 | `heart-pulse` | fitness heart |
| 20 | `dumbbell` | gym workout |
| 21 | `footprints` | run running marathon walk |
| 22 | `apple` | diet groceries |
| 23 | `utensils` | dinner recipes restaurant food |
| 24 | `coffee` | coffee cafe |
| 25 | `wine` | wine drinks bar |
| 26 | `cake` | birthday cake party |
| 27 | `gift` | gift gifts present presents |
| 28 | `party-popper` | celebration party |
| 29 | `baby` | baby kids nursery |
| 30 | `dog` | dog puppy vet |
| 31 | `cat` | cat |
| 32 | `graduation-cap` | school course study university |
| 33 | `book-open` | books reading read |
| 34 | `briefcase` | work job office |
| 35 | `laptop` | computer tech |
| 36 | `receipt` | taxes tax receipts expenses |
| 37 | `piggy-bank` | savings budget |
| 38 | `wallet` | money spending |
| 39 | `landmark` | bank mortgage council |
| 40 | `shopping-cart` | shopping buy |
| 41 | `shirt` | clothes wardrobe |
| 42 | `music` | music concert band |
| 43 | `camera` | photos photography |
| 44 | `gamepad-2` | games gaming |
| 45 | `film` | movies films watch |
| 46 | `palette` | art design |
| 47 | `newspaper` | later articles news |
| 48 | `mountain` | ski climbing mountains |
| 49 | `waves` | beach surf swim |
| 50 | `sparkles` | ideas |
| 51 | `train-front` | train rail |
| 52 | `ship` | ferry cruise boat |
| 53 | `hotel` | hotel stay |
| 54 | `bed` | bedroom sleep |
| 55 | `lamp` | lighting lamps |
| 56 | `fish` | fishing aquarium |
| 57 | `bird` | birds birding |
| 58 | `leaf` | compost nature |
| 59 | `sun` | summer |
| 60 | `snowflake` | winter |
| 61 | `umbrella` | rain |
| 62 | `heart` | dating love |
| 63 | `users` | family friends club |
| 64 | `mic` | podcast talk |
| 65 | `pen-tool` | writing blog novel |
| 66 | `code` | code dev app |
| 67 | `rocket` | launch startup project |
| 68 | `trophy` | league competition |
| 69 | `ticket` | tickets show event |
| 70 | `calendar-heart` | anniversary |

## 3. The mark

**Name it `ThreadIcon`, not `ThreadMark`**: on the phones a *mark* is already a person's avatar
picture (`apps/mobile/lib/marks.ts`, `cachedMark`, `fetchMark`). "Mark" stays the design word only.

One component, `ThreadIcon` (phones: `components/ThreadIcon.tsx`; web: `components/ThreadIcon.tsx`), props
`icon`, `hue`, `seed` (the thread id), `size`.

- **Shape:** rounded square, radius 30% of the size, on iOS and web; a circle on Android.
- **Ground:** the hue mixed into the page: light `color-mix(in oklch, hue 20%, #fff)`; dark `hue 34%` into
  `#1C1B19`.
- **Wash:** the prism texture `assets/prism/oil-ground.png`, greyscaled, laid over the ground in
  **luminosity** blend at 0.9, so it adds light and shade and never a second colour. Light: contrast 2.2,
  brightness 1.02. Dark: inverted, contrast 2.4, brightness 0.42. The texture is drawn at 220% of a box 30%
  larger than the mark, positioned and rotated from the seed (x = seed mod 100 %, y = (seed >> 7) mod 100 %,
  angle = (seed >> 3) mod 360°), so no two threads wash alike and a thread always washes the same.
  - Web: a `::before` with `mix-blend-mode: luminosity` and `filter`, `isolation: isolate` on the mark.
  - Phones: **Skia** (already in the app for `PrismField`): an `Image` with a greyscale/contrast
    `ColorMatrix` and `blendMode="luminosity"` over a `Fill` of the ground, clipped to the shape. Render
    once per (seed, hue, size, theme) and cache; a list of fifty marks must not run fifty live canvases.
- **Edge:** a 1px inset ring of the hue at 18%.
- **Glyph:** 50% of the size, the hue taken darker: light `hue 88%` into black; dark `hue 62%` into white.

## 4. Where it shows

| Place | Size | Notes |
| --- | --- | --- |
| My threads row (phones) | 40 (Android 44) | replaces the `lasso` well |
| Web thread list | 32 | |
| Thread app bar, beside the name | 28 | see item 5 |
| Web thread head, beside the name | 36 | |
| Thread pill (Today rows, answers, `TurnFooter`, `AnswerResult`) | 18, as a circle | inside the moss pill, replacing `lasso`; the pill keeps `--surface-accent-soft` and `--moss-700` text, and grows to 26px tall with 4px left padding |
| Move picker and Move suggestions | 24 | |
| People's shared threads | 32 | |
| Edit thread | 56 | |

The **My threads tab glyph stays `lasso`.**

## 5. The thread's app bar

Unchanged except for the mark. Back, **the mark (28)**, the name (17px semibold, one line, truncating;
Android 22px regular), then the tools exactly as `Bar` draws them now: List | Map when there is a place,
Group with labels while there are no labels, Share when shareable, Calendars when connected, More; with
List | Map drawn, labels and calendars at the top of More. **No heading in the scroll**, as now. The name gives
way before any tool.

**Tapping the mark or the name opens Edit thread.** More's *Rename thread* becomes **Edit thread**.

Web head: the mark (36, a 2px `--border-strong` ring on hover), the name, then Share, List | Map, the
existing tools, More. Clicking the mark or the name opens Edit thread as a popover; the inline name input
goes.

## 6. Edit thread

One sheet replacing the rename sheet. Phones: a bottom sheet from 150px below the top; web: a 360px popover
under the mark.

- **Header:** *Cancel* (secondary), **Edit thread** (17px semibold), **Save** (`--text-accent` semibold;
  Android `--blue-700`).
- **Name row:** the mark at 56 previewing every change, beside a *Name* field (44px, 2px ink ring when focused;
  Android outlined, 2px blue). The keyboard opens only when the sheet was opened from the name.
- **Icon:** the seventy in one grid, six columns (web seven), 6px gap, cells square with radius 11 (Android
  circles), glyph 22px in `--icon-on-well`, inside a `--surface-fill` well 222px tall (web 190) that
  **scrolls on its own**, fading out over its last 15%. Picked: `--surface-raised` with a 2px ink ring
  (Android `--blue-600` on `--surface-attention-soft`).
- **Colour:** the ten hues as 26px washed circles, a 2px ink ring round the picked one (Android blue).
- **Save** writes name, icon and hue in one request, drawn at the press, toast *Thread updated* with **Undo**
  restoring all three. A changed icon or hue sets `icon_set_by = person`. **Cancel** drops everything.
- A failed save puts the bar back and toasts *Couldn't save that*.

## Build order

1. Data, the shared word list and the backfill.
2. `ThreadIcon` on both clients, with the Skia wash cached on the phones.
3. Swap every `lasso` that stands for a particular thread (item 4).
4. The bar's mark and Edit thread.

## Not in this pass

Considered with the owner and not taken: Fluent Emoji Flat (MIT, but against the no-emoji rule), colour only,
a suggestions row in the picker, grouping the glyphs, a model call to pick.
