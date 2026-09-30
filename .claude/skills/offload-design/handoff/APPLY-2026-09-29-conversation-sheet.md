# Apply: the conversation sheet, taller and quieter, and every sheet on one drag

**Built 30 September 2026 (PR #31).** Where the build differs from this note, and what that asks of the design system: `FROM-CODE-2026-09-30-immersive-conversation.md`.

Drawn in `explorations/immersive-conversation.html` (idea 1) with the product owner on 29 and 30
September 2026, against `main` at `70a5fa4` (still the head on 30 September; nothing to reconcile).
Standalone copy: `handoff/immersive-conversation-standalone.html`, with an iOS and Android switch. iOS and Android. Read against `Conversation.tsx`, `Plate.tsx`,
`RowEditSheet.tsx`, `LabelSheet.tsx` and `lib/motion.ts`.

**Ready to build. Nothing is open.** The six calls were decided on 30 September (1B, 2A, 3A, 4A, 5A,
6A; `explorations/immersive-conversation-decisions.html`), and Android's dim-only treatment the
same day. Phones only; the web is unchanged. The design log entry is *2026-09-30 · A more immersive
conversation (idea 1)*.

## What changes in the design

- The sheet rises to **54px from the top of the screen**, not to 78% of its height.
- **The header row goes**: no title, no chevron, no x. The grabber is the only thing at the top.
  It closes by dragging it or flicking it, by a tap on the scrim strip above the sheet, or with the
  back gesture on Android.
- **iOS: the page behind recedes**: it scales to 0.93 from its top edge, moves down 10px and takes a
  14px corner. The scrim goes to 45% ink.
- **Android: the page dims and does not move.** The scrim goes to 55% ink, no scale, no translate, no
  corner. Scaling the whole navigator every frame is the likeliest dropped-frame cost on mid-range
  devices, a receded page would show the black backdrop under dark status bar icons, and an M3
  sheet dims. The status bar is left as it is. **Predictive back** (Android 14+) feeds its progress
  into the same `y`, so a back swipe pulls the sheet down with the finger and a cancelled one
  springs it back.
- **The tab bar slides down under the sheet** as it rises and comes back as it falls.
- **A thread keeps its tabs.** `Plate.tsx` drops them on a thread today; every screen draws
  Today, My threads and Notes, and they leave only under the conversation or the keyboard, as they
  already do for the keyboard.
- **The prism band stays one at a time**, as built: the plate's behind composer and tabs at rest,
  the sheet's behind its own composer when raised. With the tabs sliding rather than unmounting,
  the plate's band keeps its height under the sheet, so the squash described in `Plate.tsx` does
  not arise; the plate's field can stay mounted and simply be covered.
- **No fold.** A release past a quarter, or a flick down, closes. `FoldedHeader` and the `folded`
  state go, with `fold()` and its callers: the thread pill in the turn footer and an answer row's
  thread now **close** the conversation and push the thread. The turns and the draft stay in the
  provider, so tapping the composer raises the same conversation. The plate's height never changes.
- **Every sheet drags.** `RowEditSheet`, `LabelSheet`, the standalone `WhenSheet`, `RowActionSheet`
  and `CustomRepeatSheet` take the grabber (36 by 4, `--border-strong` on iOS and `--a-outline` on
  Android, 8px from the top; the edit sheet has none today) and the same hook as the conversation,
  with `travel` their height measured once on open. A drag closes **without saving**, exactly as
  Cancel does. They dim the page (35%, as now) on both platforms and never make it recede. Their
  `sheetIn` and `sheetOut` layout animations give way to the hook's spring; `lib/motion.ts` keeps
  the durations and curves for anything that is not dragged.
- **A pinned composer** (Add a note from the head's More) is the same sheet: a release or a flick
  calls `dismissPin`. With no fold, `foldNow` becomes one close for both.
- **The turn footer is unchanged**: Done, the thread pill, labels, sources. No row chip.

## Why it feels janky now

Read from `Conversation.tsx` as it stands. Each one is visible on its own.

1. **Two drivers that add up.** `translateY = (1 - progress) * height + drag`. `drag` follows the
   finger; `progress` is a 280ms `withTiming`. On release the fold goes through `runOnJS(foldNow)`,
   React state, a `useEffect`, and only then starts the timing. That is one or two frames with the
   sheet frozen under the finger, then a timed curve that ignores how fast the finger was moving.
   A hard flick slows down at the moment of release.
2. **The scrim is not tied to the sheet.** `ConversationScrim` owns its own `progress` and its own
   280ms timing, driven by `raised`. While you drag, the scrim stays at full dim; it only fades once
   React hears about the fold. The page and the tabs cannot follow the finger either, because
   nothing shares the drag's value.
3. **The drag jumps 12px when it starts.** `activeOffsetY([-12, 12])` waits for 12px before it
   activates, and `translationY` includes those 12px, so the sheet sits still and then snaps 12px
   to catch up.
4. **Its height is a moving target.** The sheet is a block in the shell's bottom column, sized by
   its content up to `maxHeight`, and `height` comes from `onLayout`. It changes with every turn and
   when the keyboard opens, so the distance the sheet travels changes between the start of a fold and
   its end. Mounting and unmounting it (`shown`) also changes the column's layout under the plate.
5. **The composers swap in React.** The plate hides its composer when the sheet raises and the sheet
   brings its own. That is a JS render mid-animation, which drops frames on Android.
6. **A tap and a pan on one element.** The header's `Pressable onPress={foldNow}` sits inside the
   pan's `GestureDetector`, so a short drag can end as a tap and fold on its own.

## How to build it

**One shared value, in pixels, on the UI thread. Everything else is derived from it.**

```ts
const top = insets.top + 10;               // 54 on a notched iPhone
const travel = screen - top;               // fixed, not measured
const y = useSharedValue(travel);          // 0 = open, travel = closed
const p = useDerivedValue(() => 1 - y.value / travel);
```

- **Sheet:** `position: absolute`, `top`, `left: 0`, `right: 0`, `bottom: 0`, always mounted once it
  has opened, `transform: [{ translateY: y.value }]`. Fixed height means the travel never changes.
  The transcript scrolls inside it.
- **Scrim:** `opacity: p.value * (isAndroid ? 0.55 : 0.45)`, `pointerEvents` from `p > 0.02`. It moves into
  `Conversation` or reads the same shared value from context; no timing of its own.
- **Page (iOS only):** the screen container reads `p`: `scale 1 - 0.07p`, `translateY 10p`, `borderRadius 14p`,
  with the transform origin at the top (translate by half the height, scale, translate back, since
  React Native has no transform origin before 0.73's `transformOrigin`).
- **Tabs:** `translateY: p * tabsHeight`, `opacity: 1 - p`. **Transform and opacity only, never
  height**: animating height re-lays out the plate on every frame. The plate's own height stays
  constant; the sheet covers it.
- **Composer:** the sheet's composer is always rendered and the plate's composer is covered, not
  unmounted, so nothing renders mid-animation. Keep the draft in the provider, as now. The same
  goes for the plate's `PrismField`: covered, not removed, and `pulse` goes to whichever field is
  on top.
- **Tabs on a thread:** `Plate` gets the tabs on every screen; the thread route stops passing an
  empty list.

**The gesture:**

```ts
const start = useSharedValue(0);
Gesture.Pan()
  .activeOffsetY([-8, 8])
  .onStart(() => { cancelAnimation(y); start.value = y.value; })
  .onUpdate((e) => {
    const d = start.value + e.translationY - Math.sign(e.translationY) * 8; // drop the slop
    y.value = d < 0 ? d / 3 : d;                                            // resist above open
  })
  .onEnd((e) => {
    const close = e.velocityY > 500 || (e.velocityY > -500 && y.value > travel * 0.25);
    y.value = withSpring(close ? travel : 0,
      { stiffness: 380, damping: 36, velocity: e.velocityY, overshootClamping: close,
        reduceMotion: ReduceMotion.System },
      (done) => { if (done) runOnJS(close ? setClosed : setOpen)(); });
  });
```

- **React state follows the animation, never leads it.** `raised` is set in the spring's completion
  callback. Opening from the composer sets `y.value = withSpring(0)` directly from the press.
- **The grabber strip takes the pan, and so does the transcript at its top.** Wrap the
  `ScrollView` with `Gesture.Native()` and make the pan `simultaneousWithExternalGesture` it; hand
  the drag to the sheet only when the scroll offset is 0 and the finger moves down.
- **No `Pressable` inside the pan.** A tap on the grabber does nothing; the scrim strip is the tap
  target.
- The grabber widens from 36 to 44px while held, on the same shared value (`isActive`).

**Every other sheet** takes the same hook with `travel` set to its measured content height (measured
once on open, not on every layout; a panel opening in place inside the edit sheet does not re-measure
until it closes). They never stack on the conversation: nothing in it opens a row sheet. One hook,
`useSheetDrag({ travel, onClosed })`, in `lib/motion.ts` or beside it, so the physics cannot drift.

## Checks

- iOS: the page recedes and the status bar stays legible over the dark backdrop.
- Android: the page never moves; the scrim reaches 55%; a predictive back swipe pulls the sheet
  down with the finger and a cancelled swipe springs it back.
- A thread shows its tabs at rest and they slide away under the conversation.
- Dragging an edit sheet with a changed title and letting go closes it and saves nothing.

- A slow drag down and back up moves the sheet, the scrim, the page and the tabs together, with no
  frame where one lags.
- A hard flick from anywhere closes it faster than a slow release.
- No dropped frames on a mid-range Android with the Performance Monitor on, during a drag with
  20 turns in the transcript.
- Reduce Motion: the sheet appears and disappears with no movement, and the page does not scale.

## Design side, for the record

- **The mobile kit is being redrawn** to the app as built (decision 5A). That is design-side work in
  `ui_kits/`; nothing here waits on it, and where the kit and this file differ, this file wins.
- `readme.md`'s behaviour notes (*The bottom plate is a fixed shape*, *A raised conversation follows
  the finger*) are the lasting statement of this handoff.
