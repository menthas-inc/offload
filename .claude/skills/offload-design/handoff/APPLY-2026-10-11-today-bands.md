# Apply: Today, Reminders and bands

Drawn in `explorations/home-reminders.html`, `explorations/today-sections.html` and
`explorations/today-bands.html` with the product owner on 11 October 2026, over 042 as built on
`main` (tree `1570ee3`). All three surfaces, both themes. Standalone copy:
`handoff/today-bands-standalone.html`, with an iOS, Android and web switch.

**Ready to build. Nothing is open.** The readme's **Today** section is the lasting statement; this
file is the build order. No new tokens or glyphs. The read (`fetchReminders`, `remindersInOrder`)
and the layout kinds are unchanged; this is drawing only, plus one write that already exists.

---

## 1. Reminders, redrawn (`TodayScreen.tsx`, web `today/Reminders.tsx`)

- Head: **Reminders** at 20px semibold, `-0.01em`, then the count in 13px `--text-tertiary`.
- **One column**, 8px between cards. Card: `--tp-card` (see 2), radius 14 (Android 16),
  `inset 0 0 0 1px var(--edge-well)`.
- **Grid**: `82px | 1fr | auto`, 12px column gap, padding `12px 10px 12px 14px`.
  - Left: the countdown at 17px semibold, `-0.01em`: *Today* in `--amber-700`, then *Tomorrow*,
    *In N days*. Under it the day in 12px `--text-tertiary`, tabular: *Tue 13 Oct*, *By Sun 18 Oct*
    for a task reminded against the thing it is for (`remindBy`).
  - Middle: the name at 15px/20px medium; under it, 3px down, where it lives at 12.5px
    `--text-secondary` after a 12px glyph in `--icon-on-well`: `lasso` and the thread's name,
    `cloudy` *Memories*, `text-quote` for a note with no thread, `inbox` *Not in a thread*. Then, when
    the thing has a time, `· 21:40` or `· By 18:00` in `--amber-700` medium.
  - Right: the dismiss, below.
- **Everything due today shares one card**: the left column holds one *Today* and the day, 12px
  from the top; the middle and right repeat per row, each row on a hairline (`--border-hairline`,
  Android `--a-outline`), the last with none. Every later thing is a card of its own.
- The thread pill and the date chip are no longer drawn here; the to-do checkbox is not drawn either
  (ticking happens in the thread). The whole row opens: a row or note its thread, a memory
  `/memories?memory=` (`reminderDoor`). *and N more* is not drawn.
- **This replaces the four phone and web differences** in 042's design entry for this section: both
  draw the lead glyph, and both drop *and N more*.

## 2. Dismiss

- An `x` at 16px in `--icon-on-well`, a 40px round button with a 44px hit area, at the right of
  every row. Label *Dismiss {name}*.
- It writes the thing's **Remind me off**: the same write as the switch in the row sheet, the note
  editor and the memory editor. The thing and its date stay.
- The row leaves at once; a shared Today card that empties goes with it; an emptied section draws
  nothing.
- Toast: *Won't remind you about {name}* with **Undo**, which writes Remind me back on and puts the
  row back in place. The memory editor's switch has no Undo (042); this toast does, since it
  undoes a write from Today.

## 3. Bands

- Sections alternate **by drawn position**, whatever order Customize Today keeps: the first drawn
  section on the page, the second in a band, and so on. A section that draws nothing takes no
  position.
- Band: `--surface-fill` (Android `--a-c-low`), full bleed on the phones, 20px above its content and
  24px below, gutter at the sides. The first section keeps its `--space-3` top.
- **Inside a band**: cards step to `--surface-raised`; chips on them, and the stepper's two buttons,
  step to `--surface-fill` / `--surface-raised` respectively, so nothing matches its ground. On the
  page: cards `--surface-fill`, chips `--surface-raised`, buttons `--surface-fill`, as today.
  The kits do this with three custom properties, `--tp-card`, `--tp-on-card`, `--tp-btn`, set on the
  band.
- **Headings**: Reminders and Open in your threads at 20px semibold. **Needs you and Your day draw
  none**. Where you will be and To do keep their 15px subheads.
- **Phones**: Where you will be and the thread pages still scroll past the gutter to the screen edge.
- **Web**: a band runs to the measure's edges (`margin: 0 calc(-1 * --space-8)`) with
  `--space-8` padding inside, `--radius-lg`, since it stops short of the pane. The thread pages and
  the events keep that padding.
- Dark: the band is the dark `--surface-fill`; raised cards in it draw their `--edge-*` as before.

## 4. Customize Today

The Reminders row, as 042 built it, sits after Your day: *Reminders*, *What offload is reminding
you about, nearest first*. The kits now draw it.

## Checks

- With Needs you empty, Your day is on the page and Reminders is in the band.
- Four things due today draw one *Today*; dismissing all four removes the card.
- Dismiss then Undo leaves Remind me on and the row in place.
- No card, chip or button is the colour of the ground it sits on, in either theme.
- Reordering in Customize Today keeps the alternation.
