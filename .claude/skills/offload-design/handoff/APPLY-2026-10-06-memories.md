# Apply: the Memories tab

Drawn in `explorations/memories-v2.html` (the static frames) and `explorations/memories-proto.html` (clickable)
with the product owner on 6 October 2026, against `main` at `066aca5` read the same day:
`docs/specs/038-memories/feature-spec.md`, `apps/agent/src/offload_agent/prompts/memory.md`,
`apps/core-api/src/memories/store.ts`, `migrations/0085_memories.sql`, the phones' `(tabs)/_layout.tsx`,
`screens/Notes.tsx`, `MyThreads.tsx`, `shell/ThreadRow.tsx`, `Segmented.tsx`, `shell/Plate.tsx` and web
`components/shell/Sidebar.tsx`. All three surfaces. Standalone copy: `handoff/memories-standalone.html`, with the
iOS / Android / Web switch. The kit copy is `ui_kits/memories_tab/`.

This is 038's fast follow, the screen OFF-1's dated exception was waiting for. The readme's **The Memories tab** is
the lasting statement; this file is the build order. Decisions log: *2026-10-06 · The Memories tab*.

---

## 1. Data and API

**Five kinds, not six.** *Their words* folds into **About**.

- Migration: `update notes set kind = 'about' where scope = 'account' and kind = 'words'`, then drop `words` from
  `notes_kind_check`. `MemoryClass` loses `words`.
- `prompts/memory.md`: the `words` bullet moves under `about` ("what a name or a shorthand they use means" is a
  durable fact about them). The 038 spec's class table and eval principle `29-memories.json` follow.

**Reads.** `GET /memories` returns the account's active memories, every one (not the prompt's fifty):

| Field | |
| --- | --- |
| `id`, `kind`, `text`, `origin` (`stated` \| `answered` \| `learned`), `createdAt` | as stored |
| `source` | `{ type: "message" \| "note" \| "answer", thread?: { id, name } }`. The thread only while the viewer is still in it; otherwise no thread |
| `place` | `{ dx, dy }`, see item 3 |

**Writes.** All through `store.ts`, account from the session.

- **Add** (`POST`): text and kind, origin `stated`, no source message (`source.type = "typed"`). Same refusals as
  asking: `shaped()` (empty, over 200, the never list) and the People rule on email, phone and street address.
  The rules kind is allowed: typing in this tab is the person.
- **Change** (`PATCH`): text and/or kind. **A changed learned memory becomes `stated`** and keeps its source, so
  the nightly pass can no longer supersede it. An answered memory may change kind and text; it keeps its
  `calendar_id` and `attrs.with`.
- **Forget** (`DELETE`): the existing `forget()` path, never `deleteNote`. Undo within the toast's eight seconds
  calls `restoreForgotten`; the ten-minute purge already covers it.
- None of these log text (AC-20): ids, kinds and outcomes only.

## 2. The tab

- **Rename Notes to Memories** on both phones' tab (`(tabs)/notes.tsx` route can stay; the label and the screen
  change) and the web sidebar, which stops being disabled. The glyph stays `cloudy`.
- **Empty:** `QuietEmpty` with the line it already has. No switch, no search, no plus.
- **App bar:** the title **Memories** (30px semibold; Android 24px regular), then the **List | Map** switch, then
  `search` and `plus` as 40px icon buttons in `--text-secondary`.
- The switch is `Segmented`'s **icon variant**, as a thread's List | Map: `list` and `map` glyphs, 36×30 pill
  segments in a 2px `--surface-fill` track, the picked one raised; Android an outlined pair of 44×32 with the picked
  half on `--surface-accent-soft` and the glyph in `--text-accent`. **It always opens on List.**
- **Search** toggles a field under the bar (40px, `--surface-fill`, radius 12; Android 48px pill). It filters the
  list as you type and fades non-matches on the map to 18%. An empty result reads *Nothing kept says "…".*
- **Plus** opens the editor empty (item 5). From a map zoomed into a kind, that kind is picked for you.

## 3. Colour

Each kind is a thread label hue. No new tokens.

| Kind | Hue | Glyph |
| --- | --- | --- |
| People | `--label-2` | `users` |
| Things | `--label-1` | `tag` |
| About | `--label-6` | `heart` |
| Rules | ink (`--ink-950`, inverse when filled) | `compass` |
| Patterns | `--label-5` | `spline` |

Tints are mixed from the hue in oklch: a soft ground at 22% into `--surface-raised`, ink at 78% into `--ink-950`.
Rules are ink because they are the one kind offload obeys rather than knows. **Origin is never a colour:** *Learned*
carries `sparkles` in `--text-noticed`, *You said* and *Your answer* are plain.

## 4. List

- `Segmented` text variant under the bar: **By kind | Newest**.
- **By kind:** one section per kind in the order above, none drawn when empty. Heading: an 11px dot of the hue,
  the kind's name 19px semibold, the count in `Section`'s pill.
- **Newest:** *This week* (seven days) and *Earlier*, each row leading with a 10px dot of its hue.
- **Row:** the sentence in full, wrapped (15.5/1.4), then meta 12.5px `--text-tertiary`:
  `You said · 3 Oct`, `Your answer · 2 Oct`, or `✦ Learned · Yesterday` with the spark and the word in
  `--text-noticed`. Hairlines between rows from the gutter (indented past the dot in Newest).
- **Tap** opens the editor. **Swipe** is `ThreadRow`'s: the row parks 96px open over a clay **Forget**, and the toast
  *Memory forgotten* · **Undo** holds it for eight seconds. No confirmation, as with threads.
- Web: the list column with the editor as a 400px pane on the right while one is open; the open row on
  `--surface-fill`, radius 12. No swipe.

## 5. The editor

One editor for both views. Phones: a bottom sheet over a scrim, sliding up 340ms on `--ease-out`, never re-laying
the page behind it. **Focus the field after the sheet arrives** (`preventScroll`), or the screen jumps. Web: the
right-hand pane.

- **Head:** *Cancel* (secondary), **Memory** or **New memory** (17px semibold), **Save** / **Add**
  (`--text-accent` semibold; Android `--blue-700`). Web: the title and a close `x`; Cancel and Save at the foot.
- **Field:** the sentence, 17/1.45, 1px `--border-strong`, 2px ink when focused (Android 2px `--blue-600`, radius 4),
  a live `n/200` count. Enter saves, shift-Enter is refused (one sentence), Escape cancels.
- **Kind:** the five as a three-column grid of 44px chips, glyph and name centred. Picked: the soft tint with a 2px
  ring in the hue's ink (Rules: filled ink, inverse text). Save is disabled until there is text and a kind.
- **Where it came from**, a `--surface-fill` box with the origin's glyph:
  - stated: **You asked offload to remember this** on 3 Oct. Said in Lisbon trip.
  - answered: **Your answer to "Which calendar is shared with Meera?"** on 2 Oct. It picks that calendar the next
    time you say "with Meera".
  - learned: **offload learned this** yesterday. From what you said in Sunday lunch.
  - typed: **You added this** on 6 Oct.
  - New: a line on rules instead, *A rule is followed in every thread. Anything else is something offload knows,
    and uses when filing and answering.*
- **Forget** in `--text-danger` with `trash-2`, last. Not on a new one.
- Toasts: *Saved*, *Remembered*, *Memory forgotten* · **Undo**. A refused add keeps the sheet and puts the reason
  under the field: *Not keeping that one.* (never list), *That's over 200 characters.*

## 6. Map

The same memories laid out in space: each kind is a cloud, and inside it memories that mean similar things sit
together. Zoom and pan to move around it.

**Placement (server).** Each memory gets an embedding when it is written or changed (the embed sweep's model; the
text already goes to that provider for filing, so the privacy page holds). Nightly, after the memory pass, lay
each kind out on its own: a 2D projection of its memories' embeddings, then **one row per memory** (rows at least
58 world units apart) so sentences never overlap at any zoom. Store the result as `place = {dx, dy}`, the offset
from the kind's centre in world units. Between nights, a new or moved memory goes next to its nearest neighbour
in that kind. The map is stable from day to day; it is not re-laid on every open.

**Layout (client).** Kind centres are a client constant, in two shapes, **picked once when the map first opens**
(wide when the map is more than 1.1× as wide as it is tall) and kept, so opening the pane or resizing never
reshuffles it. A memory sits at its kind's centre plus `place`.

| Kind | Tall world 800×1500 (phones) | Wide world 1440×960 (web) | Cloud radius |
| --- | --- | --- | --- |
| People | 255, 260 | 300, 300 | 210 |
| Things | 560, 560 | 760, 260 | 180 |
| Patterns | 220, 830 | 1160, 330 | 150 |
| About | 420, 1110 | 520, 700 | 250 |
| Rules | 600, 1380 | 1060, 720 | 140 |

**Drawing.**

- Ground: `--surface-page` with `oil-ground.png` at 22% multiply. Each kind a radial cloud of its hue (34% to 14% to
  clear, radius × 1.3) in multiply; each group of meaning a fainter one (16%).
- **Zoom from 0.3 to 2.4**, opening at the fit of the whole world. **Below 0.55, memories are 10px dots** of their
  hue with a paper ring, amber-ringed when learned. **From 0.55 they are sentences:** pills of
  `--surface-raised` at 92% with a 1px ring of the hue at 30%, font `clamp(10, 7 + zoom × 6, 15.5)px`, padding and
  radius scaled from it, max width 17 em, the spark first when learned.
- **Kind labels** over each cloud while it is on screen: a 30px pill on the soft tint of the hue, its ink, glyph,
  name and count, 12px horizontal padding (Rules: filled ink). Tap flies into that kind.
- **Kinds off screen** (zoomed in only) join one row docked along the top, each a raised pill with a 1.5px ring and
  an `arrow-up` turned towards its cloud. Never pinned to separate edges, which collide.
- Bottom right: zoom in, a level bar, zoom out. Bottom left, once zoomed past 1.4× the fit: **Everything**.

**Gestures.** Drag pans; pinch, or scroll and trackpad pinch on web, zooms about the pointer. Tap a dot to fly to it
at 0.9; tap a sentence to open the editor; close it and you are where you were. Flights are 520ms on an
ease-out cubic, zoom interpolated geometrically. Reduced motion jumps.

**Accessibility.** The list is the accessible view and holds everything the map does. On the map every dot and
pill is a button named by its sentence and kind, in list order, and the labels are buttons named "Go to People".

## Build order

1. The five-kind migration and prompt change, then the reads and writes in item 1.
2. The tab, the list and the editor (items 2 to 5). This ends OFF-1's exception on its own.
3. Embeddings, the nightly layout and `place`.
4. The map.

## Not in this pass

Considered with the owner and not taken: chips and a review queue for what was learned (B); a portrait grouped
by who each memory is about, which needed a subject on every memory (C); dragging between clouds to change kind,
and a vessel to drop into to forget (D, kept as the map without them). Second-person display ("Your wife is
Meera") would need a second copy written with each memory.
