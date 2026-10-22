# 046 Today glass: tasks

Ordered, testable, each citing the `046 AC-n` it serves and the principles it touches. Red before green (QUAL-1):
every behaviour task starts with a failing test for the reason the change exists. Tasks marked **device** end in a
measurement, not a unit test, and say so. Reviewed as impl-spec + tasks by `project-lead` (tech lead) on 2026-10-19;
its corrections are folded in and noted inline.

**As built, 2026-10-21.** Done: T0.x (on this branch), T2, T2b, T3, T6, T7 (Android blurs the plate from 12 through a
`BlurTargetView`; the sheet stays opaque there), T8, T9, T10 (still), T11, T12, T13, T16 (web, iOS and Android, live).
**Removed:** T1 and T5 (the drift and its shared hook; the field is still, the owner's call) and T15 (the drift's GPU
gate). **Not done:** T14, the fps measurement on iPhone 12 and Pixel 6a.

**Before any task: board post + sequencing.** 045 thread-layouts is live on `ContentRow.tsx` and `today/rows.ts`,
which T2 touches; post the de-band plan and hold order on the board (`.claude/scripts/board.py`) and sequence against
045, do not leave it to the merge.

## Setup (shared state, main only, day-one blocker)

- **T0.0 (contrast first, decides the alpha).** Before any token lands: compute `--text-tertiary` and
  `--text-secondary` on Today's page ground over the densest bloom at the candidate `--today-field-alpha`, both
  themes, from the design skill PNGs (`.claude/skills/offload-design/assets/prism/p2-bloom-*.png`) and the text
  tokens. Serves 046 AC-3, AC-6. Assert-based check computing WCAG contrast; **ship the measured alpha in T0.1, not
  the bundle's 0.35 / 0.26 guess**. The real fork if no single alpha holds 4.5:1 and still reads as colour: lighter
  blooms (a re-bake, i.e. a design task) or no field under text. That is the owner's call, surfaced as the T0.0
  outcome, not a buried fallback.

  **T0.0 measured 2026-10-19** (all three design-skill bloom PNGs composited over `--surface-page` at the field
  alpha, worst-case pixel, WCAG):
  - **Light `--text-tertiary` #6E6E6E never passes under the field at any usable alpha.** 0.35 -> 3.06:1 (19% of
    field area < 4.5:1); even 0.10 -> 4.28:1 (3.9% fails). The token is only 4.846:1 on the bare `#FAF9F7` page, so
    there is no headroom to spend. Lowering the alpha does not rescue it and kills the field.
  - Light `--text-secondary` #5C5C5C: 4.01:1 at 0.35 (1.8% fails); passes below ~0.14.
  - Dark `--text-tertiary` #A0A0A0: fails at 0.26 (3.82:1, 1.5%); passes at alpha <= 0.18.
  - Dark `--text-secondary` #B3B3B3: passes at 0.26 (4.76:1, 0%).

  **Conclusion:** a single page-wide field alpha cannot hold `--text-tertiary` in light. The real options are (a)
  re-bake lighter / less saturated blooms (design task) so the composited ground stays bright, or (b) keep tertiary
  and secondary text off the bare page (on `--surface-raised` cards only, the field living behind cards and in the
  gutters) and fix the two on-page sites `TodayScreen.tsx:460` and `OpenThreads.tsx:202`. A page veil is a worse third
  option (dilutes the field and the light baseline leaves little to gain). Lowering alpha is ruled out.

  **Decision 2026-10-19, revised: path (b).** A re-bake (path a) was chosen first, then measured: lightening a
  shared bloom passes light and fails dark (blend 0.8 gives light 4.49, dark 3.38; no blend passes both). So the rich
  original blooms ship at 0.35 / 0.26 and small grey text stays off the bare field (T2b). No re-bake.
- **T2b (AC-3 sites, found by the live check 2026-10-21).** Walk every text node on web Today whose nearest painted
  ancestor is the page; any `--text-tertiary` / `--text-secondary` or small accent text there fails the rule. Found:
  the calendar's empty days, month head and Today link, and every section count. Fix on web and phones: the calendar
  on one raised card, a count on a small raised pill. Test: `today-glass` shape tests on both, red first.
- **T0.1** On `main`, add the nine tokens to `.claude/skills/offload-design/tokens/colors.css`, both themes: the six
  bundle tokens (`--today-field-alpha` = the T0.0 number, `--glass-tint-rgb`, `--glass-tint-top/-mid/-base`,
  `--glass-sheet`) plus `--glass-blur`, `--glass-saturate`, `--glass-edge-light/-dark`. The tint's **base opacity is
  the contrast-derived floor from T0.0**, one number shared with the phones (the composer is global, AC-6 holds on
  every pane over arbitrary content). Serves OFF-7, every AC. Test: `pnpm tokens`, then assert `@offload/tokens`
  carries all nine names.
- **T0.2** Convert the design skill's `p2-bloom-2.png` and `p2-bloom-3.png` to webp and place all three blooms in the
  mobile and web asset locations (only `p2-bloom-1.webp` existed). No re-bake (path b). Serves 046 AC-2. Test: three
  webp files exist and decode.
- **T0.3** Add the bloom-layout (four {x, y, width} + container width from handoff §2) as a **shared TS constant in
  `packages/tokens/src/index.ts`**, not a new generator emit (fewer moving parts than another generated artifact,
  given this repo's generator history). Serves 046 AC-2 (one source, both surfaces). Test: both surfaces import it.
- **T0.4** On `main`, replace only the readme **Today** section with the bundle's (reworded still -> slow drift), and
  append the single `decisions.md` entry naming both reversals (2026-09-08, 2026-10-19), Design system impact field
  filled, **and recording that the kits still draw bands and are owed the de-band** (feature-spec says kits are not
  redrawn). Serves OFF-7, DEV-2. **Never copy the bundle readme as a file** (reverts Undo-in-place, the two-week
  calendar, the 7/12 Oct notes). Test: `git diff` touches only the Today section.
- **T0.5** Add `expo-blur` (`~57`) to `apps/mobile/package.json` and make a **local dev build** (T6-T8 cannot be
  verified through Metro alone; the Expo budget is for production, so this is a local build per the EAS-local rule).
  Serves AC-5. Test (gating): assert the Android props 046 uses are keys `expo-blur`'s own `.d.ts` declares, before
  T6/T7 are planned in detail. The handoff's `blurMethod="dimezisBlurViewSdk31Plus"` + `BlurTargetView`/`blurTarget`
  are **unverified and look like `@react-native-community/blur`, not `expo-blur`** (whose prop is
  `experimentalBlurMethod?: "none" | "dimezisBlurView"`). If `expo-blur` has no view-targeted blur, **Android ships
  the opaque plate** (already the AC-5 fallback) rather than inventing an API.

## Shared

- **T1** Lift one `useReduceMotion()` hook on mobile mirroring web's `lib/reduced-motion.ts`, and point the **five**
  existing copies at it: `_layout.tsx`, `PrismField.tsx`, `Spinner.tsx`, `firstrun/Intro.tsx`, and
  `shell/Composer.tsx` (the fifth). Serves 046 AC-4, QUAL-2. Test (red first): the hook returns the platform value and
  updates on the change event; a grep guard asserts no private copy remains.

## Mobile (`apps/mobile`)

- **T2 (de-band, Today only).** `useInBand`/`Band.tsx` is **not** Today's: `ContentRow.tsx` and `DateChip.tsx` import
  it and are used across Thread, Loose, Widgets, Timeline, PhotoViewer, AnswerResult, RowEditSheet, LabelList,
  PlaceSheet. Off Today there is no `BandContext`, so those render the `false` branch (`groundClass(false)` =
  `bg-surface-fill`/`bg-a-c-low`, `onCardClass(false)` = `bg-surface-raised`). **Keep every off-Today value
  byte-identical** (inline the `false` branch where the context is removed); change only Today's *band* grounds so
  Today's cards read `--surface-raised` on the field. Name each file touched. Serves 046 AC-1, DEV-1 (Today only).
  Test (red first): rewrite `apps/mobile/test/today.test.ts:350-357` (it asserts `useInBand` exists and is used) to the
  new shape, watch it go red, then green; assert no Today `--surface-fill` band ground and no non-Today screen
  repainted.
- **T3 (field).** `components/today/TodayField.tsx`: the blooms from the T0.3 constant as static `Image`s,
  `pointerEvents="none"`, `fadeDuration={0}`, inside the Today ScrollView content container, in one `Animated.View`
  at `opacity: --today-field-alpha`. On Android an `opacity` wrapper composites per child, so **either the placements
  do not overlap or set `needsOffscreenAlphaCompositing`** (accept the offscreen buffer) or overlapping blooms double
  and seam. No Skia (AC-2). Decide the field's box: inside the content container it scrolls off below the last bloom,
  so **clamp the box to `min(viewport, content)` or accept paper below the last bloom** (046 AC-12), explicitly.
  Serves 046 AC-2, AC-12. Test (red first, behaviour not just shape): the four blooms render at the T0.3 placements;
  the field is absent on non-Today tabs; a short Today draws one bloom.
- **T5 (drift).** One Reanimated shared value, `withRepeat(withTiming)` on the UI thread, small `translateX/Y` +
  opacity breathe on the field wrapper; paused by `useFocusEffect` + `AppState`; disabled by `T1`. The still fallback
  is **"the loop is not started" at one call site**, so a failed T15 is a flag flip, not removing this task. Serves
  046 AC-4. Test (red first): reduce-motion on schedules no animation; losing focus stops it; no
  `requestAnimationFrame`, no JS per frame.
- **T6 (GlassBackdrop + plate).** `components/shell/GlassBackdrop.tsx`: `expo-blur` BlurView (intensity `--glass-blur`,
  material by theme) + SVG graded tint (`--glass-tint-*`) + 1px `--glass-edge-*` top line, clipped by the plate
  radius. In `Plate.tsx`: replace the resting `<PrismField>`; keep the arrival pulse by mounting
  `PrismField variant="band"` only while a filing is active. Serves 046 AC-5, AC-7. Test (red first): the plate mounts
  no resting `PrismField`; a filing count change mounts then unmounts it.
- **T7 (Android blur / fallback + iOS reduce-transparency).** Only if T0.5's `.d.ts` assertion confirmed a
  view-targeted blur: wire it to the tab navigator screens in `Shell.tsx`, in-process snapshot only (no
  MediaProjection/PixelCopy), never crossing a Modal (the shell uses none; keep it so), opaque below API 31.
  Otherwise Android is opaque `--surface-plate`. iOS `AccessibilityInfo.isReduceTransparencyEnabled` + change event ->
  plate and sheet opaque, field kept (no reader exists today). Serves 046 AC-5, AC-8, OFF-1, SEC. Test (red first):
  fallback selected when `Platform.Version` < 31 / reduce-transparency on; two live blurs never coexist.
- **T8 (conversation sheet).** iOS glass at `--glass-sheet`; Android opaque `--surface-plate` 0.96, specified in dark.
  Serves 046 AC-8. Test (red first): Android sheet opaque, no second blur mounts.

## Web (`apps/web`)

- **T9 (de-band).** Delete `.band` / `.band[data-band]`, retarget `--tp-card` to `--surface-raised`, drop dead
  `--tp-*` fallbacks in `today.module.css`. Serves 046 AC-1. Test (red first): computed card background is
  `--surface-raised`; no `.band` rule remains.
- **T10 (field).** Four `background-image` layers in a Today `::before` at `--today-field-alpha` from the T0.3
  constant; CSS `@keyframes` drift under `@media (prefers-reduced-motion: reduce)`. Serves 046 AC-2, AC-4, AC-12.
  Test: the dead-class/dead-css scripts pass; reduced-motion disables the animation (live browser, T16).
- **T11 (composer glass, every pane).** Tint **exactly one** layer in `composer.module.css` (`.composer` or `.card`,
  not both; a nested `backdrop-filter` samples the parent's filtered result and is muddy and buggy in Safari; not
  `.wcomp`,
  a kit class absent from the app): `rgb(var(--glass-tint-rgb) / <contrast floor>)` +
  `backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))` (`-webkit-`); `@supports not
  (backdrop-filter: blur(1px))` and `prefers-reduced-transparency: reduce` -> opaque `--surface-raised`. Match the
  phones' graded tint; the base opacity is the shared contrast floor (AC-6 holds over arbitrary pane content).
  Single composer mount is `(shell)/layout.tsx:96`. Serves 046 AC-5, AC-6. Test: a grep that the fallback rule exists
  (jsdom cannot evaluate `@supports` / `prefers-reduced-transparency`); the real check is T16 live browser.
- **T12 (composer foot token).** One `--composer-foot` token replacing the three `120px` literals
  (`shell.module.css:475`, `memories.module.css:103`, `:303`). Serves 046 AC-9. Test: no `120px` composer-foot literal
  remains.

## Verify

- **T13 (AC-9 regression).** Every list ends in `PlateSpace` (Today, My threads, a thread, Memories list, Loose) and
  Memories map keeps `usePlateInset`; an UndoLine on a last row stays clear and tappable 8s under the glass (OFF-6).
  Mostly already true; this is the guard.
- **T14 (device: fps, AC-10).** 60 fps scrolling Today with drift on, iPhone 12 + Pixel 6a; sub-55 fps gets the opaque
  plate via the static gate. Measurement.
- **T15 (device: GPU, AC-11, drift gate).** Not idle energy (display dominates a 10-min idle; the delta would read
  near zero regardless). Measure **GPU utilisation + frame-callback count, drift on vs off**, via Xcode's GPU report
  and `dumpsys gfxinfo`/Perfetto, with a stated threshold, on the one case that matters: **drift on + blur on, Pixel
  6a, Today**. If over threshold, the drift flag ships off (T5's loop is not started); nothing else changes.
- **T16 (device/live: visual, AC-6/AC-7/AC-8).** Tab labels, placeholder and chip contrast through the tint over real
  content on every pane (a thread of photos is the worst case); the pulse through glass over a photo page; the Android
  opaque sheet in dark; the keyboard translating the BlurView edge to edge; the web `@supports`/reduced-transparency
  fallbacks in a browser. The kit cannot show these.

## Shipping order (tech-lead)

T0.0 contrast (decides the alpha) -> T0.1-T0.4 on main with the measured number -> T0.5 + local dev build + the
`.d.ts` assertion -> T1 (all five) -> T2 (off-Today values unchanged, tests rewritten) -> T3 / T9 -> T5 / T10 -> T6 ->
T7 / T8 -> T11 / T12 -> T13 -> T14-T16, with T15 deciding whether the drift flag ships on.

## Artifact paths

- `docs/specs/046-today-glass/feature-spec.md`
- `docs/specs/046-today-glass/impl-spec.md`
- `docs/specs/046-today-glass/tasks.md`

## Unresolved SHOULD-level flags

- **OFF-7:** two design-decision reversals; the single `decisions.md` entry in T0.4.
- **R1 (settled, path b):** rich blooms, small grey text on opaque ground only (T2b). Revisit only if the owner
  wants the field under body text after all, which would need lighter blooms per theme.
- **Android blur (T0.5/T7), follow-up:** verified against `expo-blur` 57's types: `blurMethod:
  "dimezisBlurViewSdk31Plus"`, `blurTarget` and `BlurTargetView` are real API (the handoff was right). Shipped as the
  opaque plate for now, since wiring `BlurTargetView` around the router needs its own device pass; that is the
  follow-up.
