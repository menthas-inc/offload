# Apply: the thread notice

Decided with the product owner on 31 October 2026 in `explorations/thread-notice-final.html` (interactive, final),
direction B of `explorations/thread-notices.html` (A card, B strip, C offload's voice, D compact). Read against
`main` (tree `94b3e9069ce8`): `apps/mobile/components/screens/Thread.tsx` (the suggestion pill and the heads-up,
around line 1215), `apps/web/src/components/panes/Thread.tsx` (around line 1364, `looseStyles.suggestion`),
`packages/widgets/src/layouts.ts` (`suggestionLine`, `PHRASES`). **Ready to build.** Standalone reference:
`handoff/thread-notice-standalone.html`.

## 1. What changes

1. **One strip, `ThreadNotice`, for anything a thread needs to tell the person.** It replaces the layout
   suggestion pill and the heads-up line on all three surfaces. Later uses (someone joined, dates to a calendar)
   are drawn as examples only and are **not** part of this build.
2. **The suggestion names the layout** and asks: *Looks like a trip or event, switch to the Events layout?*
3. **Switching says where to change it later**: *Showing as Events. You can always change this in thread settings.*
4. **Colour**: solid moss with white text from offload, ink from a person. Not the soft moss tint.

## 2. The strip

- **Place**: where the pill is now, inside the scroll, under the read and `UndoAt thread:` line, above the rail.
  Full width, no side margin, no radius.
- **Ground**: offload `--surface-accent` (moss 600, the same in both themes) with `--text-on-solid` (6.1:1).
  A person `--surface-inverse` with `--text-inverse`. No border.
- **Padding** 14 vertical, 20 horizontal (`gutter-screen`); gap 12.
- **Leading**: offload `sparkles` 20 in the text colour; a person their initials, 24 circle on their hue,
  10 semibold white (the `Avatar` they already have at 24 is fine).
- **Line**: 16 medium, line height 1.35, `--text-*` as above, **two lines at most** (`numberOfLines={2}`,
  `-webkit-line-clamp: 2` on the web). Copy is written to fit two lines at 375 wide; nothing should clamp.
- **Action**: one word, 16 semibold, underlined (offset 3), the text colour. 44 hit height.
- **Dismiss**: `x` 18 at 80% opacity, 44 by 44, pulled to the edge.
- **Several at once** stack, newest on top, a 1px `rgb(255 255 255 / .18)` line between.
- **Leaving**: height and opacity to 0 over 280 ms, `--ease-out`; reduced motion just removes it.
- Android: the same strip. Web: the same, inside the pane's column (max 720).

## 3. The layout suggestion

`suggestionLine` in `layouts.ts` becomes the whole question, and `PHRASES` gets shorter:

| Layout | Phrase | Line |
| --- | --- | --- |
| todo | a checklist | Looks like a checklist, switch to the Todo list layout? |
| events | a trip or event | Looks like a trip or event, switch to the Events layout? |
| gallery | a collection | Looks like a collection, switch to the Gallery layout? |
| project | a project | Looks like a project, switch to the Project layout? |
| timeline | a diary | Looks like a diary, switch to the Timeline layout? |

```ts
export function suggestionLine(layout: Exclude<Layout, "default">): string {
  return `Looks like ${PHRASES[layout]}, switch to the ${LAYOUT_NAMES[layout]} layout?`;
}
```

- **Switch** runs `saveThread({ layout })` as the pill does now. Its result is the strip's place taken by
  `UndoLine` **under**, `wrap`, `check`: *Showing as {Layout}. You can always change this in thread settings.*,
  with Undo. Set `did` in `saveThread` to that sentence **only when the change came from the notice**; Edit
  thread's own switch keeps *Showing as {Layout}*.
- **x** runs `dismissLayoutSuggestion` as now. Permanent, every device.
- "Thread settings" is the words a person reads; it means Edit thread (More, or the mark in the bar).

## 4. A member's switch

- `layoutChange` as now (`by`, `layout`, `at`), held for the view and marked seen on open.
- Line: *{Name} switched this to the {Layout} layout*, their face leading, ink ground.
- **Change** opens Edit thread scrolled to its Layout row (`EditThreadSheet` gains an open-at `"layout"`, beside
  `"icon"` and `"name"`). **x** hides it for this view; it is already seen on the server.

## 5. Design system

- `components/feedback/ThreadNotice` (new): `message`, `action`, `onAction`, `onDismiss`, `from` (`offload` or
  `person`), `icon`, `initials`, `hue`. Build `apps/mobile/components/shell/ThreadNotice.tsx` and the web's
  `components/panes/ThreadNotice.tsx` from it; retire `looseStyles.suggestion`, `suggest`, `suggestHit`, `spark`,
  `dismiss` if nothing else uses them (the loose rows' suggestions keep their own, check first).
- `UndoLine` gains **`wrap`**: the message wraps instead of truncating, with 8px vertical padding.
- No new tokens or glyphs.

## 6. Accessibility

- The strip: `accessibilityRole` none, the line read as text; announce once on appearance (`polite`).
- Switch: label *Switch this thread to the Events layout*. Change: *Change this thread's layout*. x: *Dismiss
  suggestion* / *Dismiss*.
- Contrast: white on moss 600 6.1:1; `--text-inverse` on `--surface-inverse` over 12:1 in both themes.

## 7. Pre-ship checks

- Every line in the table fits two lines on a 375 wide phone at the default text size, both platforms.
  At the largest Dynamic Type it may run to three; allow it there (drop the clamp above 1.3 font scale).
- The strip, the Undo line after Switch and the heads-up, in light and dark, on all three surfaces.
- Dismiss on one device, open the thread on another: gone.
- Switch, then Undo: back to Default, the suggestion does not come back.

## 8. Acceptance criteria

- **AC-1** A Default thread with a suggestion shows the moss strip with the table's line and Switch.
- **AC-2** Switch changes the layout and shows *Showing as {Layout}. You can always change this in thread
  settings.* with Undo, in the strip's place.
- **AC-3** x removes it for good, on every device.
- **AC-4** After another member switches, the thread shows the ink strip with their face once; Change opens Edit
  thread at Layout.
- **AC-5** No 13px pill or plain heads-up line remains on any surface.
