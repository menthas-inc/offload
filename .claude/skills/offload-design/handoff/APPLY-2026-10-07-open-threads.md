# Apply: Today, open in your threads

Drawn in `explorations/home-summary.html`, `explorations/home-thread-cards.html` and
`explorations/home-thread-pages.html` with the product owner on 7 October 2026. All three
surfaces, both themes. Standalone copy: `handoff/home-thread-pages-standalone.html`, with an iOS,
Android and web switch.

**Ready to build. Nothing is open.** The readme's **Today** section is the lasting statement; this
file is the build order. It changes the Today of `handoff/APPLY-2026-10-01-today.md` in two places:
item 6 (*If you have time*) is replaced, and item 7 (Customize Today) gains a kind.

No new tokens or glyphs.

---

## 1. Where it sits

- **Today only**, after To do, as the last part of the day. Not drawn on any other day.
- Not drawn when there are no open undated to-dos anywhere.
- *If you have time* and its *+ Today* pill come out. A to-do still takes a date from its row sheet.

## 2. The section

- Head: **Open in your threads**, 15px semibold, then the count of to-dos the pages hold.
- **Phones**: a row of pages scrolled sideways past the gutter, each `100% - 32px` wide with 8px
  between, so the next page peeks. Scroll snaps to a page start. Under it, one dot per page, 6px in
  `--border-strong`; the current one a 16px pill in `--text-primary`. No dots with one page.
- **Web**: two pages side by side in the pane's measure, 12px apart. Chevron buttons (32px) at the
  right of the head step by two; each is disabled at its end.
- **Order**: the thread whose oldest open undated to-do is oldest comes first. **Not in a thread**
  is always last, and only when it holds an undated to-do. Server's rule, not a setting.

## 3. A page

- `--surface-fill` (Android `--a-c-low`), radius 16, `inset 0 0 0 1px var(--edge-well)` (dark only).
  Pages in a set take the tallest page's height; the foot sits at the bottom.
- **Head**, 14px padding: `lasso` at 16px in `--text-accent`, the thread's name at 17px semibold,
  and at the right the people sharing it as 22px initial discs (`--blue-100` on `--blue-700`,
  overlapping 5px, a 2px ring in the page's ground). The head opens the thread.
- **The read**: the first sentence of the thread's own read, as it opens the thread page, 15px
  Literata, `--text-secondary`, two lines then an ellipsis. Nothing is written for Today; no model
  call.
- **Up to four to-dos**, oldest first, each a row on a hairline: a 15px checkbox, the title at 15px
  medium, how long it has been open at the right (12px, `--text-tertiary`, tabular). A row tap opens
  the row sheet.
- **Ticking** strikes the row through in tertiary at once (the finished-task rule) and raises the
  Undo toast. The row leaves the page the next time Today is built, not while it is open.
- **Foot**, on a hairline, 13px: *N more* at the left past four; *Open thread* in `--text-accent`
  at the right.
- **Not in a thread**: `inbox` in `--icon-on-well`, no people, a line from offload if it has a
  thread in mind, its to-dos, then what else it holds (*6 notes and links*) and *Sort them*, which
  opens Not in a thread.

## 4. Customize Today

A fourth row, third in order: **Open in your threads**, *To-dos with no date, a thread at a time*,
on by default.

```json
{ "version": 1, "sections": [
  { "kind": "needs_you", "on": true },
  { "kind": "day", "on": true },
  { "kind": "open_threads", "on": true },
  { "kind": "moved", "on": false } ] }
```

A stored layout that does not name `open_threads` gets it after `day`, on.

## Checks

- Tomorrow and later draw no Open in your threads.
- A thread whose open to-dos all have dates has no page.
- Ticking strikes through in place and Undo restores it; the page does not reflow while open.
- The head and *Open thread* open the thread; a row opens its row sheet.
- Not in a thread is last, or absent when it holds no to-do.
- Dark: every page draws its edge.
