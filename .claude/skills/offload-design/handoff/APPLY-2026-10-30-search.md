# Apply: Search, its own tab and its own page

Decided with the product owner on 30 October 2026 in `explorations/search-tab.html` (interactive, final), off
`explorations/search-entry.html` (four ways in: top bar, beside the tabs, composer find mode, pull down) and
`explorations/search-pull.html` (the pull, interactive). Read against `main` (tree `ca5aca2e9ffa`):
`apps/mobile/components/shell/Shell.tsx`, `shell/Plate.tsx`, `shell/Composer.tsx`, `app/(tabs)/_layout.tsx`,
`components/screens/MyThreads.tsx`, `ThreadTile.tsx`, `screens/Memories.tsx` (its search field),
`apps/core-api/src/search/read.ts`. **Ready to build.** Standalone reference: `handoff/search-standalone.html`.

## 1. What changes

1. **Search gets its own page.** Matches show as you type, read from the index. Nothing goes to the model unless the
   person asks.
2. **Phones: Search is a tab.** The tabs are **Today, Threads, Search, Memories**, in that order.
3. **Web: Search is a sidebar item** in the same place (Today, Threads, Search, Memories), with **⌘K** (Ctrl K) and
   **/** from anywhere. It opens as a window over the page.
4. **My threads is renamed Threads**: the tab, the sidebar item and the page's title. Routes and code names can
   stay (`/threads`, `MyThreads.tsx`).
5. **The composer does not change.** A question typed there is still answered by offload as it is today.

## 2. The tabs (phones)

- `Shell.tsx` `tabs`: `today` (`sun` / `moon`, as built), `threads` (`lasso`, label **Threads**), `search`
  (`search`, label **Search**), `memories` (`cloudy`). `TABS` gains `/search`; `(tabs)/_layout.tsx` gains
  `<Tabs.Screen name="search" />` between `threads` and `memories`.
- Four tabs fit the plate's row as it is: each `flex-1`, glyph 22, label 12 medium. No other change to `Plate`.
- **Tapping Search** opens the page with the field focused and the keyboard up. **Tapping it again** while on
  Search focuses the field again (a query already there stays).
- A thread opened from a result keeps **Threads** lit in the tabs, as any thread does. Back returns to Search with
  the query and the results still there.

## 3. The page (phones)

- **Bar**: titled, as Memories draws it: *Search*, iOS 30 semibold with -0.6 tracking, Android 24 regular. No tools.
- **Field**: Memories' field, unchanged. `search` 16 in `quiet`, 15.5 text, `x` 15 to clear. iOS 40 min height,
  radius 12, `--surface-fill`; Android 48, pill, `bg-a-c-low`; `edgeWell` ring in both. Placeholder *Threads,
  things, memories*. `returnKeyType="search"`, no autocorrect.
- **The keyboard covers the plate**, like every field that is not the composer's (`Shell`'s rule: the plate rides
  only its own field's keyboard). The search key and a scroll put the keyboard away (`keyboardDismissMode="on-drag"`)
  and the composer and tabs come back.
- **Results**, as you type, with no debounce over 120 ms. Grouped, each group only when it has something:
  - **Threads**: `ThreadIcon` 36, the name, the thread's line (*14 things* in the prototype; use the real
    `thread.meta`). Opens the thread.
  - **Things**, up to 6: a 36 well (`--surface-fill`, radius 10, circle on Android) with the kind's glyph, the
    title, and under it the kind or date, a middle dot, `ThreadIcon` 16 and the thread's name. Opens the thread
    scrolled to that row, which flashes once (`--blue-600` at 14%, 900 ms).
  - **Memories**, up to 3: a well with `cloudy`, the text, *Memory*. Opens Memories with that memory's editor.
  - Group headings 13 medium `--text-tertiary`. Rows 56 min, hairline under. **The match is semibold**, the rest
    regular, all `--text-primary`.
- **Ask offload about "…"** is the last row whenever there is a query: `sparkles` in `--text-accent` on
  `--surface-accent-soft`, radius 14 (16 Android), 52 tall. It **puts the words in the composer without sending
  them** and puts the keyboard away; sending is an ordinary dump, answered as today.
- **Nothing found**: *Nothing matches "…".* centred, 14 `--text-tertiary`, then the Ask row.
- **Empty field**: *Recent*, up to 5 searches with `clock` and an `x` each to remove one, then *Threads* as chips
  (`ThreadIcon` 24 and the name; 36 tall; pill on iOS, 8-radius outline on Android). A search becomes recent when a
  result is opened, Ask is pressed, or the search key is pressed. Recent searches are kept on the device.

## 4. The web

- `Sidebar.tsx`: **Today, Threads, Search, Memories**, then Activity and Settings as built. Search shows a `⌘K`
  key cap (Ctrl K off Apple), 11 medium on a 1px `#3A3A38` ring.
- **⌘K, Ctrl K or /** (when focus is not in a field) opens a window over the page: 620 wide, 90 from the top,
  radius 16, `--surface-raised`, the scrim `--surface-scrim`. A 58 tall input at 18, the results under it (the same
  groups and rows as the phones, rows 52), and a footer: *↑↓ move, ↵ open, ⌘↵ ask offload, esc close*.
- **Keyboard**: arrows move the selection (`--surface-fill`, radius 10), Return opens it, ⌘Return runs Ask, Escape
  or a click on the scrim closes and returns focus to where it was. `role="combobox"` on the input, `listbox` and
  `option` on the results, `aria-activedescendant` for the selection.
- Opening a result closes the window and goes to the thread (scrolled to the row) or to Memories.

## 5. The read

A new route, **`GET /search?q=`**, for this page only. It never calls the model and never embeds the query, so it
answers at index speed.

- **Things**: `content.search_text` (already a `tsvector` for 013) with **prefix matching**, since the person is
  still typing: `to_tsquery('simple', 'lisb:*')`, every word prefixed and joined with `&`. `websearch_to_tsquery`
  does not prefix and would find nothing for *lisb*. Order by `ts_rank`, then `created_at desc`. Limit 6. Skip
  archived rows and the default thread's storage rows only if the page cannot open them.
- **Threads**: name `ILIKE '%q%'` over the threads the person can see. Limit 5.
- **Memories**: text `ILIKE '%q%'`. Limit 3.
- One response: `{ threads: [...], things: [{ id, title, kind, when, threadId }], memories: [...] }`. Each thing
  carries the thread id so the client draws the `ThreadIcon` from what it already holds.
- The client keeps the last response per query, drops a reply older than the newest request, and draws matches
  from the threads already in memory before the reply lands.
- `search()` in `search/read.ts` stays as it is for the model's tool.

## 6. Accessibility

- The tab: `accessibilityRole="tab"`, label *Search*. The field's label *Search*.
- Results announce their count once typing pauses: *4 results* (`accessibilityLiveRegion="polite"` on Android,
  `announceForAccessibility` on iOS).
- A row's label: *Flight to Lisbon, TP1351, event, Fri 7 Nov, in Lisbon trip*. Remove a recent search: *Remove
  wifi password*.

## 7. Build order

1. The rename (Threads) and the fourth tab on both phones; the sidebar item on the web.
2. `GET /search` with prefix matching.
3. The page: field, results, Ask, recent, chips. Then the web window and its keyboard.
4. The scroll to a row and its flash in a thread; Memories opening at a memory (it already takes `MEMORY_PARAM`).

## 8. Acceptance criteria

- **AC-1** The phones' tabs read Today, Threads, Search, Memories; the web sidebar the same. *My threads* appears
  nowhere a person reads.
- **AC-2** Tapping Search focuses the field with the keyboard up.
- **AC-3** Typing *lisb* shows Lisbon trip and its things before the word is finished, and no model call is made.
- **AC-4** A thing opens its thread scrolled to the row; Back returns to the same results.
- **AC-5** Ask puts the words in the composer unsent; sending them is answered as a dump is today.
- **AC-6** On the web, ⌘K and / open the window from any page, and it is fully usable by keyboard.
- **AC-7** A question typed in the composer behaves exactly as before.
