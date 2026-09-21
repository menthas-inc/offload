# Apply: the launch screen, the viewer, and six owed screens

Decided 21 September 2026 with the product owner off `explorations/launch-and-viewer.html`, against
the list of owed items in `handoff/FROM-CODE-2026-09-21.md`. Every value below is given for both
themes and all three surfaces.

**Start with 1 and 2.** The launch screen is the only item with no prior entry, and it turned out to
be two screens rather than one. `--surface-viewer` is the only new token.

---

## 1. The launch screen

**The mark alone, centred, on `--surface-page`.** No wordmark: iOS's storyboard allows no text, and
the wordmark is live type rather than an outlined file.

| | Light | Dark |
| --- | --- | --- |
| Ground | `--surface-page` #FAF9F7 | `--surface-page` #1C1B19 |
| Mark | `--text-primary` #0B0B0B | `--text-primary` #EDEDED |
| Size | 216pt iOS / 192dp Android | same |

**`--text-primary`, not `--ink-950` and `--paper`.** Both ramps invert in dark, so `--paper` there is
#191919 and a mark set to it measures **1.02:1** on the page. One token gives 18.7:1 in light and
14.7:1 in dark with nothing to keep in sync.

**Android:** 192dp drawn inside the 240dp canvas the splash masks to a circle, on **no background
layer**, so no circle shows and the system's own reveal has room. `apps/mobile/app.json` takes an
image, a background colour and a dark pair of each.

## 2. It is two screens, and the seam is the risk

**No platform splash takes a spinner.** iOS gives a background colour and one static image; Android
12+ gives a colour, an icon and its own reveal. Neither accepts a view of yours.

So the app draws a **holding screen** the instant the native splash hands over:

- identical ground and mark
- spinner fades in at **1000ms** over `--duration-slow`
- **64px under the mark**, the system's own `Spinner` at 18px, `1.5px --ink-200` with an `--ink-700`
  head, `offload-spin 720ms`
- **unlabelled.** The readme allows a lowercase label and there is nothing honest to put in it:
  offload is not looking through your stuff yet, it is finding out who you are

**The one trap.** The spinner must not be in the centring flow. Put it in a centred column and its
box re-centres everything above it, moving the mark by **half the spinner's height plus its gap**,
37px in these frames, and a blink on every cold start. Centre the mark on the screen and place the
spinner from the screen's centre, not from a container.

**Not drawn, and nobody has asked for it:** what the holding screen does when `/api/me` never
answers. A spinner that spins forever is the state this design does not have.

## 3. `--surface-viewer`, and why dark is opaque

```css
:root, [data-theme="light"] { --surface-viewer: color-mix(in srgb, var(--surface-inverse) 90%, transparent) }
[data-theme="dark"]        { --surface-viewer: var(--surface-plate) }  /* #0F0F11, opaque */
```

**Not `--surface-scrim`.** The scrim is 0.32 and dims what is behind it; this is a surface in its own
right, and at the scrim's value a white screenshot on a warm page read as a page behind a page.

**Dark is opaque because a translucent plane there has nowhere to go.** `--surface-page` at 92% over
`--surface-page` measures **1.00:1**, no plane at all, just 8% of the thread ghosting through, which
reads as a bug. Even the darkest value reaches 1.11:1. What says a viewer is open in dark is that the
screen behind it is gone. Light stays at 90%, composites to about #232323, and reads as depth.

**Everything on the plane is `#FFFFFF`, not `--text-inverse`.** The plane is near-opaque ink in light
and an opaque near-black in dark, so ink-inverse flips to dark text on a dark plane. That covers the
caption, the controls **and the status bar**.

## 4. The photo viewer

**The plane runs full bleed**, a photo should run under the status bar, **and the status bar rides
above it**, in white, the way a phone's does when a dark full-screen view opens. Raising it alone is
not enough: `--text-primary` on the light plane's composite measures 1.25:1.

**Controls, per the 18 September entry:**

| | Web | Phones |
| --- | --- | --- |
| Treatment | overlaid top right, `IconButton` md geometry (40px visual in a 44 hit, 20px glyph) | `AppBar`'s geometry over the plane, transparent, **starting below the status bar** |
| Glyphs | Full screen, More, Close | More, Close |

Full screen is web only: a phone has no window to fill. The translucent circle and white ink on the
web pills are the one departure from `IconButton`'s `ghost`, because the ground is an arbitrary photo
rather than a surface.

**More opens `RowActionSheet`**, the same sheet a row opens, so a row's tools live in one place.

## 5. The move sheet

`Sharing.jsx`'s sheet with the list swapped: `Sheet` + `FindField` + `ListRow`s + footer.

**The leading slot is not `Avatar`.** That list is people; this one is threads, so a row leads with an
**18px `lasso` in `--text-secondary`**, as `MemoriesScreen.jsx` draws a thread. `Avatar`'s initials
circle means a person.

**The thread the row is in is absent**, not greyed. **The footer is `Cancel`**, not `Done`, because a
tap on a destination commits.

**Move can run out of destinations**, which sharing never can. A one-thread account gets a sentence,
not a search field over an empty list, and that is the one state where the footer is the only thing
to press.

## 6. The phones' thread head

One line: back, the name, Share, the calendar when the account has a connection, More. **Three tools
by the criterion**, a tool earns a bar slot only if it changes what offload reads or shows.

**The people chips go entirely.** Who a thread is shared with is a question you ask by tapping share,
and the answer belongs beside the actions that change it. **What stays above the scroll is the
standing alone**, with its attribution row, and only when there is one.

**`Standing`'s block is `padding: var(--space-7) var(--gutter-screen) var(--space-8)`** with the text
at `margin: var(--space-7) 0 0` after chips, and it always carries `"offload wrote this, " + updated`
with a 13px `sparkles` in `--text-tertiary`.

## 7. Files is a grid, and a link is a door

**The grid:** three columns, `--space-4` gap, square tiles at `--radius-sm` with `FileTile`'s
unconditional hairline, on `--ink-100` where a picture exists and `--surface-page` where it does not.
No controls on a tile; a tap opens the viewer. **Earned by a photo or a screenshot and nothing else.**

**The chip row is `ChipRow`**, a scrolling row of real `Chip`s where a **derived tag is `accent` with
a `sparkles` icon**. It is the thread's tag dimension, not a filter by kind, and there is no "Links"
chip.

**A link stays a row, and tapping it opens the page.** It was opening a detail screen with the page a
second step. The trailing glyph is **`arrow-up-right`, vendored here as the 82nd**, because a chevron
promises a screen inside the app. Its own tools stay in the action sheet.

## 8. A calendar event in the day's list

**Not a new object.** It is `DayAgenda.jsx`'s `EventLine`: the runway's spine, an 8px anchor at
`left:-19`, a **112px time column** so every title starts at the same x, the title at
`--size-title-3`.

Two additions, and only two:

1. **The dot takes the calendar's own colour**, replacing `EventLine`'s three product tones, and
   gains a hairline ring, Google fixes those colours and they do not flip, so a dark calendar colour
   on a dark page needs it.
2. **The calendar's name** as a caption under the title. Another member's calendar carries the title
   and time only and is named by **that member's display name**, never the address Google gives it.

`All day` sits in the time column rather than replacing it, so the titles stay on one x.

**No checkbox, no tools, no swipe, no action sheet, no tap.** It is the only line in the product that
cannot be acted on. A thread's own dated rows are in the sections below, as `ListRow`s.

## 9. Add a photo, per platform

**Both platforms use `RowActionSheet`** and neither needs a variant: `--radius-sheet` resolves to
**28** under `[data-platform="android"]` and **24** elsewhere, which is the whole divergence.
`M3Sharing.jsx` composes its own sheet from the governed `Sheet` for exactly this reason.

**Choose from library first, then Take a photo**, on both. Most pictures a person dumps already
exist. **No Cancel row** on either: the scrim dismisses it.

**The Android crop's heading and rows are `ASection` and `ARow`**, the kit's platform layer, which
take the same props as `SectionHeader` and `ListRow` so the swap is mechanical.

## 10. The rule this pass earned

**An Android override that is not an `--a-*` token is almost certainly wrong.**
`[data-platform="android"]` redefines only the `--a-*` palette, Material's radii and the heights. It
does **not** redefine `--text-primary`, `--text-tertiary`, `--border-strong` or `--ink-200`, so any
component using those renders identically on both platforms.

Two invented overrides were caught by this: a subject line on `--a-on-quiet` at **3.47:1**, and a
checkbox edge on `--a-outline`, the divider token, at **1.29:1** where `--border-strong` gives 3.2.

---

## One conflict for the kits, not for the designs

**A to-do is a `ListRow` with a body; both phone kits still draw a standalone `Checkbox`** in a
`--space-6` gapped column with no hairlines. The 20 September entry settles it the other way twice:
it centres the phones' `ListRow` leading and trailing, and it says a to-do draws its body under the
title, which `Checkbox` has no slot for. **`ThreadScreen.jsx` and `M3ThreadScreen.jsx` are what
move.** Both also already pass `count={unticked}` to their "To do" heading, which the kits draw and
nothing else did.

`ListRow.jsx` now renders the `body` prop its contract has documented since 20 September; it was
written into the `.d.ts` and never implemented.
