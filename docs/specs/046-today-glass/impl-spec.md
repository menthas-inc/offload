# 046 Today glass: impl-spec

Planning only. Grounds in the handoff `APPLY-2026-10-19-today-glass.md` (in the bundle) and `docs/tech/`. Where the
handoff and the repo disagree, the repo wins and it is called out.

## Nature of the change

Pure chrome: a background field on Today, a frosted bottom plate (phones) / composer (web), the conversation sheet,
and the removal of Today's bands. No data flow, no data model, no API, no job, no model prompt. **Volume and access**
is legitimately absent (see feature-spec "No data surface").

## Prerequisite: Task 0, the selective design-system sync (shared state, main only)

The code consumes tokens, so OFF-7 forbids literals and the tokens must exist first. **Contrast is computed before the
alpha token lands** (tasks T0.0): the measured number ships, not the bundle's 0.35 / 0.26 guess, so `main` is paid for
once. On `main` (never in this worktree, which is a feature branch):

1. Add the six colour tokens to `.claude/skills/offload-design/tokens/colors.css`, both themes:
   `--today-field-alpha` (the T0.0 number), `--glass-tint-rgb`, `--glass-tint-top` (0.45 / 0.55),
   `--glass-tint-mid` (0.55 / 0.65), `--glass-tint-base` (0.85 / 0.90), `--glass-sheet` (0.80 / 0.86). The tint's base
   opacity is the contrast-derived floor from T0.0, shared with the phones (the composer is global; AC-6 holds on
   every pane over arbitrary content).
2. Add three more tokens the handoff would otherwise ship as literals in `GlassBackdrop`: `--glass-blur` (iOS
   intensity / web `blur()` radius), `--glass-saturate` (web `saturate()`), `--glass-edge-light` / `--glass-edge-dark`
   (the 1px top line). A blur radius is a design value like a radius or duration; do not inline it.
3. Replace only the **Today** section of `readme.md` with the bundle's Today section (bundle ~line 1035). **Do not copy
   the bundle readme as a file** (it reverts Undo-in-place, the two-week calendar and the 7/12 Oct notes). Reword it
   from "still" to "slow drift".
4. Append the one `decisions.md` entry (the bundle's, which already carries a filled Design system impact field),
   extended to name both reversals (2026-09-08 and 2026-10-19) per the feature-spec.
5. Produce `p2-bloom-2.webp` and `p2-bloom-3.webp` from the design skill's PNGs
   (`.claude/skills/offload-design/assets/prism/p2-bloom-2.png`, `-3.png`) and add all three webps to the mobile and
   web asset locations. Only `p2-bloom-1.webp` exists today.
6. Add the **bloom layout** (the four {x, y, width, container-width} placements from handoff §2) as a shared TS
   constant in `packages/tokens/src/index.ts`, so mobile and web read one source rather than two hand-typed copies. A
   plain constant, not a new generator emit (fewer moving parts than another generated artifact, given this repo's
   generator history).
7. `pnpm tokens`, then verify the generated `@offload/tokens` map carries the new names (the generator asserts what it
   produced; a missing alias is a compile error, per the token-generator history in CLAUDE.md).

This is the day-one blocker (R2). It is main-only shared state; coordinate on the board before touching it.

## Interfaces, per track

### Shared (`packages/tokens`)
The six + three tokens and the bloom-layout data (above). Consumed through the typed `resolved` map, as `PrismField`
already does (`token()` keyed against `keyof typeof resolved.light`, so a removed token fails to compile).

### Mobile (`apps/mobile`)
- **De-band is Today only.** `useInBand`/`Band.tsx` is imported by `ContentRow.tsx` and `DateChip.tsx`, which render
  across Thread, Loose, Widgets, Timeline, PhotoViewer, AnswerResult, RowEditSheet, LabelList, PlaceSheet. Off Today
  there is no `BandContext`, so those take the `false` branch (`groundClass(false)` = `bg-surface-fill`/`bg-a-c-low`,
  `onCardClass(false)` = `bg-surface-raised`). Removing the context must keep every off-Today value byte-identical
  (inline the `false` branch); only Today's band grounds change, so Today's cards read `--surface-raised` on the field.
  `apps/mobile/test/today.test.ts:350-357` asserts `useInBand` exists and is where the red-before-green for this lives.
- **The field, NOT `PrismField`.** `PrismField` is a `react-native-skia` runtime shader (per-frame GPU); 046 AC-2
  forbids a shader for the field. The field is four plain RN `Image`s (`p2-bloom-1/2/3.webp`, bloom 1 reused for the
  fourth), absolutely placed **inside the Today ScrollView's content container**, `pointerEvents="none"`,
  `fadeDuration={0}`, wrapped in one `Animated.View` at `opacity: --today-field-alpha`. Placements from the shared
  bloom-layout constant. New: `apps/mobile/components/today/TodayField.tsx`. **Android caveat:** an `opacity` wrapper
  composites per child, so "one layer" is only true with offscreen alpha compositing; either the placements do not
  overlap, or set `needsOffscreenAlphaCompositing` and accept the offscreen buffer, or overlapping blooms double in
  density and seam. **Field box:** inside the content container the field scrolls off below the last bloom; clamp the
  box to `min(viewport, content)` or accept paper below the last bloom, decided explicitly (046 AC-12).
- **The drift.** A single Reanimated `useSharedValue` driven by `withRepeat(withTiming(...))` on the UI thread,
  animating a small `translateX/Y` and a gentle `opacity` breathe on that one wrapper. No `requestAnimationFrame`, no
  JS per frame. Paused via `useFocusEffect` (expo-router) + `AppState`, and gated by a new shared
  `useReduceMotion()` hook (mobile has **five** copies today: `_layout.tsx`, `PrismField.tsx`, `Spinner.tsx`,
  `firstrun/Intro.tsx`, `shell/Composer.tsx`; lift one mirroring web's single reader
  `apps/web/src/lib/reduced-motion.ts`). The existing `lib/prism-scroll` scroll parallax can feed the same wrapper.
  The still fallback for a failed power gate is "the loop is not started" at one call site, not removing the drift.
- **The plate.** New `apps/mobile/components/shell/GlassBackdrop.tsx`: an `expo-blur` `BlurView`
  (`systemUltraThinMaterialLight`/`Dark`, intensity `--glass-blur`) filling the plate under its contents, clipped by
  the plate's existing radius (`overflow: hidden`), with a `react-native-svg` `LinearGradient` graded tint
  (`--glass-tint-*`) over it and a 1px `--glass-edge-*` top line. Used inside `Plate.tsx`, replacing the resting
  `<PrismField>`; the pulse keeps a `PrismField variant="band"` mounted only while `filed` is active (mount on the
  filing count, unmount after `--prism-run` + `--prism-settle`).
- **Android blur target (API unverified, assert before building).** The handoff's
  `blurMethod="dimezisBlurViewSdk31Plus"` + `BlurTargetView`/`blurTarget` are not confirmed `expo-blur` API; they look
  like `@react-native-community/blur`. `expo-blur`'s own prop is `experimentalBlurMethod?: "none" | "dimezisBlurView"`.
  Task T0.5 asserts the props 046 passes against the installed `expo-blur` `.d.ts` first. If `expo-blur` has a
  view-targeted blur, wire it to the tab navigator's screens in `Shell.tsx` (a view cannot blur its own parent),
  in-process snapshot of the app's own view tree only (never MediaProjection, never `PixelCopy` on the window: those
  are screen-capture APIs with a consent prompt and reach beyond the app), opaque `--surface-plate` below API 31, and
  never crossing a `Modal` (the shell uses none; sheets are in-tree with `accessibilityViewIsModal`; keep it so). If it
  does not, **Android ships the opaque plate** (already the AC-5 fallback) rather than inventing an API or adding a
  second blur package.
- **The conversation sheet.** iOS: same `BlurView`, flat tint at `--glass-sheet`. Android: opaque `--surface-plate` at
  0.96, no second blur (046 AC-8), specified in dark too.
- **Fallback readers (new).** iOS `AccessibilityInfo.isReduceTransparencyEnabled` + its change event, driving plate and
  sheet opaque (field kept). None exists in the repo today.
- **Frame gate (046 AC-10).** Do **not** build a bespoke runtime sampler (rejected as over-built). Gate statically:
  `Platform.Version` < 31 and the Reduce-Transparency reader already force opaque; keep 60 fps a build-time
  measurement on the two phones. A slow phone discovered later is a one-line version/model check then. `shortcut:
  static capability gate, upgrade to a runtime fps sampler only if a shipped device class regresses.`

### Web (`apps/web`)
- **De-band:** delete `.band` / `.band[data-band]` and retarget `--tp-card` to `--surface-raised` in
  `today.module.css`; drawn at `components/panes/Today.tsx:540`. Remove the dead `--tp-*` page-fallbacks.
- **The field:** four `background-image` layers in a `::before` on Today's pane scroll content at
  `--today-field-alpha`, placements from the shared bloom data; a CSS `@keyframes` slow drift guarded by
  `@media (prefers-reduced-motion: reduce)`.
- **The composer glass (every pane, confirmed global):** tint **exactly one** layer, `.composer` or `.card` in
  `apps/web/src/app/(shell)/composer.module.css`, never both (a nested `backdrop-filter` samples the parent's already
  filtered result and is muddy and buggy in Safari). Single composer mount is `(shell)/layout.tsx:96`. Not `.wcomp`, which is a kit class and does not exist in the app): `background: rgb(var(--glass-tint-rgb)
  / .72); backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))` with the `-webkit-` prefix.
  `@supports not (backdrop-filter: blur(1px))` and `@media (prefers-reduced-transparency: reduce)` → opaque
  `--surface-raised`. The composer is one absolute layer over all panes, so one `backdrop-filter` is the whole web
  budget. The frosted style is the composer's always, not Today's; match the phones' graded tint so the component
  reads the same on every surface.
- **Plate spacer:** replace the three hardcoded `120px` list feet (`shell.module.css:475`, `memories.module.css:103`
  and `:303`) with one `--composer-foot` token (precedent: `--map-foot` next door).

## Edge cases and states

- Empty / one-section Today draws one bloom (046 AC-12): accept or address.
- Overscroll / short content: field extent is the content container's, so beyond the last bloom is the page ground;
  confirm the top bloom's negative `y` (`-40`) covers the pull-to-refresh overscroll.
- Keyboard: translating a `BlurView` is fine on both platforms (the blur re-samples per frame); this app is edge to
  edge where Android ignores `adjustResize`, so test on a device, not the kit (the kit has no keyboard).
- Dark theme: all tints and `--glass-sheet` carry dark values in the tokens; the Android opaque sheet over the blurred
  plate must be checked in dark (046 AC-8).

## Reuse and skips (ponytail ladder)

- **The field → new `TodayField.tsx`, not `PrismField`.** Ladder: not the shader (AC-2 forbids per-frame GPU for the
  field); platform RN `Image` is the rung. `PrismField` could not be it because its whole mechanism is a runtime
  shader. Skipped: a second shader.
- **The drift → Reanimated, already a dependency.** No new timer, no `requestAnimationFrame`. Skipped: a JS animation
  loop (the thing the 2026-09-08 decision rejected).
- **The blur → `expo-blur`, an installed-SDK dependency (new, first-party, pinned `~57`).** Ladder: no house blur
  component exists; Skia `BackdropFilter` cannot blur sibling native views (only canvas content), so it does not fit.
  Skipped: `@react-native-community/blur` (not first-party).
- **Reduce-motion → one shared `useReduceMotion()` hook**, mirroring web's single reader. Skipped: a fifth private
  copy.
- **Web plate spacer → one `--composer-foot` token.** Reuses the `--map-foot` precedent. Skipped: a fourth `120px`
  literal.
- **AC-9 (every tab under the plate) is already true** (`PlateSpace` in all five lists, map via `usePlateInset`); it
  is a regression check, not new code. Skipped: new scroll plumbing.
- **Frame gate → static capability checks**, not a runtime sampler. Skipped: a sampler + threshold + hysteresis +
  persisted verdict.
- Deliberately **not** done: translucent cards, a continuous shader field, a bespoke fps mechanism, any web tab-dock.

## Constitution check (gate)

Read fresh against `docs/constitution/principles.md`.

- **DEV-1 (MUST):** compliant. The impl reuses the shader-free `Image` path, Reanimated, one shared hook, one token,
  and treats AC-9 as a check; the over-built runtime fps gate is explicitly skipped.
- **DEV-2 (MUST):** compliant. The one code divergence from the design decision (drift) is matched by the
  `decisions.md` entry in Task 0 (OFF-7).
- **DEV-3 (SHOULD):** compliant. `expo-blur` is a boring first-party Expo module; Reanimated and react-native-svg are
  already in use.
- **QUAL-1 (MUST), tests first:** the testable ACs are AC-1 (no `--surface-fill` band ground; dead identifiers gone),
  AC-2 (no Skia import in the field), AC-3/AC-6 (a contrast assertion computed from the blooms' pixels at the alpha),
  AC-4 (drift disabled under reduce-motion; paused off-focus), AC-5/AC-8 (fallback selection by platform/flag), AC-9
  (every list ends in `PlateSpace`), AC-12 (one-bloom Today). Each starts red. Visual blur quality and AC-10/AC-11
  (fps, power) are device measurements, not unit tests, and are named as such.
- **QUAL-2 (SHOULD):** compliant. `GlassBackdrop`, `TodayField`, `useReduceMotion` each do one thing.
- **SEC-1/2:** not engaged (no untrusted input, no shell/query/eval, no auth decision).
- **OFF-1 (MUST):** compliant. The blur samples on-GPU; nothing is persisted or logged; no snapshot API
  (`captureRef`/`ViewShot`/`expo-screen-capture`) is introduced; no new log line names a pane, tab or title.
- **OFF-2/4/5/8:** not applicable (no cold storage change, no connected-app pull, no model I/O, nothing enters a
  prompt).
- **OFF-3 (MUST):** not applicable (no read or write to scope).
- **OFF-6 (MUST):** not applicable to new behaviour; note the regression that Undo-in-place (`UndoLine`) on a Today
  section's last row must stay legible and tappable for its full 8s clear of the frosted plate (covered by AC-9 +
  AC-6).
- **OFF-7 (SHOULD):** the live one. Code diverges from two logged decisions; Task 0 lands the single `decisions.md`
  entry with the Design system impact field filled, and every value is a token, no literal.

`GATE: PASS` (no open MUST violations; the drift's OFF-7 entry is a SHOULD handled in Task 0, and AC-3 is a gating
measurement, not a blocker on the spec).

## Dependencies on open decisions

None. No item at the bottom of `docs/tech/decisions.md` is implicated; the reversible-action allowlist is untouched.
