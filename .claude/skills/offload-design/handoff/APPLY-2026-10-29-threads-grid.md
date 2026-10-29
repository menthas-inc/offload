# Apply: My threads as a grid, your own order, and deeper thread colours

Decided with the product owner on 29 October 2026 in `explorations/threads-grid-approval.html` (interactive),
off `explorations/threads-grid.html` (three tiles, four mark treatments) and `explorations/threads-grid-final.html`.
Read against `main` (tree `7888d8aba97c`): `apps/mobile/components/screens/MyThreads.tsx`, `shell/ThreadRow.tsx`,
`components/ThreadIcon.tsx`, `apps/web/src/components/ThreadIcon.tsx`, `panes/MyThreads.tsx`,
`packages/widgets/src/thread-icons.ts`, `apps/core-api/src/routes/threads.ts` (the *older* cut).
**Ready to build.** Standalone reference: `handoff/threads-grid-standalone.html`.

## 1. What changes

1. **My threads is a grid of tiles**, not rows: two columns on the phones, three on the web.
2. **It opens newest first**: by when the thread was made, top left, then left to right and down. Activity no
   longer reorders it, and **Older threads goes**: one grid.
3. **A person can drag a thread to make their own order**, which the grid keeps until they switch back.
4. **Every thread colour is deeper and its glyph is white**, in the grid and everywhere `ThreadIcon` is drawn: the
   thread's app bar, the pill on Today and in answers, the Move picker, People's shared threads, the web sidebar.
5. Swipe to delete leaves My threads; the tile's menu has Delete and Leave.

## 2. The colours (new tokens)

`--thread-ground-1` to `--thread-ground-10`, both themes, in `tokens/colors.css`. **Use the table, not a mix**: the
phones' `mixOklch` treats `#1C1B19` as having a hue (chroma 0.004 is over its `GREY` of 1e-4) and would turn
blue green in dark; browsers keep the label's hue. The table is what the owner approved.

| Hue | Label | Light ground | White on it | Dark ground | White on it |
|---|---|---|---|---|---|
| 1 | `#0C7BB0` | `#006AB5` | 5.6 | `#204B65` | 9.3 |
| 2 | `#C6467B` | `#C8006A` | 5.7 | `#70334A` | 9.3 |
| 3 | `#5D7F00` | `#467200` | 5.7 | `#3C4D1D` | 9.2 |
| 4 | `#8D5CC5` | `#8532CE` | 6.3 | `#533D6F` | 9.3 |
| 5 | `#B25D25` | `#B23800` | 6.1 | `#663D24` | 9.3 |
| 6 | `#088285` | `#00777C` | 5.3 | `#204E4F` | 9.3 |
| 7 | `#AD4EAC` | `#AB04AC` | 6.3 | `#633662` | 9.4 |
| 8 | `#7D7616` | `#726500` | 5.9 | `#4B4820` | 9.3 |
| 9 | `#6F67CB` | `#6047D7` | 6.2 | `#444272` | 9.3 |
| 10 | `#06855A` | `#007B41` | 5.4 | `#20503A` | 9.3 |

**`packages/widgets/src/thread-icons.ts`**: `threadIconColors(hue, theme)` returns `ground` from the table by hue
number, `glyph: "#FFFFFF"`, and no ring (the 1px ring was for a pale ground). `THREAD_ICON_MIX` goes; the web's
`ThreadIcon.module.css` drops its `color-mix` and reads `var(--thread-ground-N)`, glyph `--text-on-solid`. The
wash texture stays as built (`renderWash` on the phones, the `::before` on the web): **opacity 0.55 in light**
(was 0.9; on a deep ground 0.9 greys it), 0.9 in dark, same filters. Text on a thread ground is always
`--text-on-solid`.

## 3. The tile

| | Phones | Web |
|---|---|---|
| Columns, gap | 2, 12 | 3, 16; content max 960 |
| Shape | square; radius 18 iOS, 16 Android | 1.6 : 1; radius 16 |
| Padding | 14 | 18 |
| Small glyph, top left | 30, white | 26, white |
| Name | 16 semibold, white, two lines then ellipsis | 17 |
| Count | 13 regular, white at 86%, *14 things* | same |

- **Ground**: `--thread-ground-N`, with the wash texture over it at the tile's size (one more `washKey` size per
  device; the cache already keys by size).
- **The back glyph**: the thread's glyph again, **hardened** and huge. Same Lucide path, drawn with
  `strokeWidth 3`, `strokeLinecap "square"`, `strokeLinejoin "miter"`, and `rx`/`ry` removed from any `rect`, at
  **190% of the tile's width**, white at **12%**, behind the text, clipped by the tile. Placed from the seed so each
  tile shows a different part: `left = -(25 + seed % 55)%`, `top = -(20 + (seed >>> 5) % 60)%` of the tile, turned
  `((seed >>> 2) % 4) * 90` degrees. Phones: react-native-svg with those props (`Glyph` gains a `hard` prop);
  web: the same, inline SVG. Nothing rasterised.
- **Top right**: the people's faces at 24 (two, then +N), and a **9pt blue dot** (`--blue-600`, white ring 2) when
  something landed since this person last opened the thread. If the read has no per-person last-opened time, add
  `thread_reads (account_id, thread_id, seen_at)`, written when the thread page opens.
- Accessibility label: *Lisbon trip, 14 things, with Ana and Tom, new*. The glyphs are hidden.

## 4. The page

- **App bar as built** (Logo, plus). Under it a title row: *My threads* 28 semibold, and the **order chip** on the
  right: *Newest first* or *Your order* with `chevron-down`, 32 tall, `--surface-fill` on iOS and the web, an
  outlined 8-radius chip on Android.
- **Invitations** stay above everything. **Not in a thread** is one row above the grid: `inbox`, the name, the
  count, `chevron-right`, 48 tall on `--surface-fill`; it opens 028's full list. Not drawn when empty.
- Empty state as built.

## 5. Order

**Schema.** One list per person:

```sql
create table thread_order (
  account_id uuid primary key references accounts(id) on delete cascade,
  sort text not null default 'newest' check (sort in ('newest','mine')),
  ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
```

- **Read** (`GET /threads`): `newest` orders by `threads.created_at desc`. `mine` orders by position in `ids`;
  **threads not in `ids` go first, newest first** (so a new thread starts at the top left), and ids the person can
  no longer see are skipped. The `older` group and its cut in `routes/threads.ts` go; the response is one list.
- **Write** `PUT /threads/order { sort, ids? }`. A drop sends `sort: 'mine'` and the whole visible list. Switching
  the chip to *Newest first* sends only `sort` and **keeps `ids`**, so *Your order* comes back as it was. Last write
  wins; the server drops unknown ids.
- A shared thread sits where each person put it. Leaving or deleting a thread leaves its id in `ids` harmlessly.

## 6. Moving a thread

**Phones** (react-native-gesture-handler and Reanimated, both in the app):

- **Hold 320 ms** lifts the tile: scale 1.04, shadow, a light haptic, the other tiles at 55%.
- **Let go without moving** (under 8pt): the tile's menu, anchored below it (above if it would leave the screen):
  *Edit thread* (`pencil`), *Share* (`share-2`), *Delete thread* (`trash-2`, danger) or *Leave thread* (`log-out`)
  for a shared thread, which asks with the existing `ConfirmSheet`. Delete and Leave take the existing toast with
  Undo.
- **Move while held** drags: the tile follows the finger at scale 1.05; a dashed slot (1.5px `--border-strong`)
  marks where it will land; the others slide on the iOS sheet curve, 260 ms (Android: emphasised decelerate,
  as the kit's other moves). Near the top or bottom 64pt the grid scrolls.
- **Drop**: the order is written and *Showing your order* shows with Undo, which restores the list before the drop
  (and the chip's state). The chip reads *Your order*.
- A plain tap opens the thread.

**Web**: press and move 5px drags straight away; a click opens; right click opens the menu. **Keyboard**: tiles
are focusable buttons; Enter opens, Space picks up, arrows move by one place (up and down by a row), Space drops,
Escape puts it back; a live region says *Moved to 3 of 10*. Screen readers on the phones get *Move earlier* and
*Move later* as custom actions on each tile.

**The order chip** opens a menu: *Newest first*, *Your order* (with a check on the current one), and the caption
*Drag a thread to put it where you want it. New threads still start at the top.* *Your order* is disabled until
there is one.

**Reduced motion**: no scale on lift, tiles move without the slide.

## 7. Build order

1. Tokens (`pnpm tokens`); `threadIconColors` from the table; web `ThreadIcon.module.css`. Every mark is deeper
   from here, before the grid exists.
2. `thread_order`, the read and the write; drop the older cut.
3. The tile (`ThreadTile` on both clients, beside `ThreadIcon`), `Glyph hard`, and the grid on My threads; the
   Not in a thread row; the chip. `ThreadRow` stays for the Move picker and People.
4. Hold, menu, drag, drop, Undo; web pointer, right click and keyboard.
5. The blue dot and `thread_reads` if needed.

## 8. Acceptance criteria

- **AC-1** My threads draws 2 columns of squares on the phones and 3 columns at 1.6 : 1 on the web.
- **AC-2** With no order made, threads run newest made first, row by row; new content does not move a tile.
- **AC-3** A drag on any surface reorders the grid, survives a reload and shows on the person's other devices;
  Undo restores the order before it.
- **AC-4** In *Your order*, a new thread appears top left; switching to *Newest first* and back restores the order.
- **AC-5** Every `ThreadIcon` and tile uses `--thread-ground-N` with a white glyph, in both themes; white on each
  ground measures 4.5 : 1 or more.
- **AC-6** The back glyph is 190% of the tile, square-stroked, 12% white, and differs in placement between tiles.
- **AC-7** Hold and release opens the menu; Delete and Leave work from it with Undo; no swipe remains here.
- **AC-8** The web grid is fully reorderable by keyboard, with the move announced.
