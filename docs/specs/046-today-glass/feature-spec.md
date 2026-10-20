# 046 Today glass: a prism field and a frosted plate

Status: planning. Branch `worktree-today-glass` off `main`. No code yet.
Source: design bundle `offload Design System-today-bg.zip` (not yet in the repo). Decided with the owner on
2026-10-19 in the bundle's `explorations/today-prism.html`; the decision and handoff
(`APPLY-2026-10-19-today-glass.md`) live only in the bundle, under its `## Open` heading, **pending sync**.
This spec cites the handoff's numbers; it does not restate them as a second source (see Task 0).

Reviewed by `project-lead`, `client-reviewer`, `security-reviewer` on 2026-10-19; findings folded in below.

## Why

Today reads as paper with grey bands: flat and bland. The prism is the product's one piece of colour, and it only
appears inside the plate and the gate. This brings it onto Today as a soft field behind the page, and turns the bottom
plate into frosted glass so the page shows through it. One field, one blur, no new mechanism.

## What

1. **Today loses its bands.** No alternating paper and `--surface-fill` grounds on any Today surface. Sections keep
   their headings and spacing. **The card ground inverts rather than disappears:** cards, chips and stepper buttons on
   Today stay `--surface-raised` (the Material mapping on Android), not the page ground. The two-week calendar's day
   cells, today marker and week rows (PR 129) are not bands and are left as they are.
2. **A prism field sits under Today's page**, scrolling with the content, at `--today-field-alpha` (0.35 light, 0.26
   dark): four soft blooms, about half the ground in colour where the page shows between cards. Today only.
3. **The field drifts** slowly and continuously, a subtle living background, driven on the UI thread (no shader, no
   per-frame JS), paused when Today is not the focused tab or the app is backgrounded, off under Reduce Motion. This
   reverses two logged decisions and ships only if it is near free (see "Drift" and AC-11).
4. **The composer switches to this frosted style everywhere, and stays consistent across pages.** On iOS and Android
   it is the bottom plate: on every tab the page scrolls under it blurred and brightened, with a graded tint most
   opaque where the tab labels sit; shape, corners, keyboard ride and tab fade unchanged. **Web has no bottom plate**
   (no fixed dock), so on web the same frosted treatment lands on the floating composer card (`composer.module.css`),
   on every pane. The composer is the one glass component; the field (item 2) is the only Today-only piece.
5. **The plate's resting prism band goes; the arrival pulse stays.** On a filing the plate still plays the two-second
   prism pulse; between filings there is no field inside the plate, because the page's field now shows through.
6. **The raised conversation is the same glass, more opaque** (`--glass-sheet`) on iOS; **opaque `--surface-plate` on
   Android** (two live blurs over one target measured poorly; the page is dimmed behind it anyway).
7. **Opaque fallbacks**, per platform (each is new work, no reader exists today): iOS Reduce Transparency; web no
   `backdrop-filter` support or `prefers-reduced-transparency`; Android below 12; and any phone failing the frame gate.

Surfaces: iOS, Android, web, scoped per track in tasks. Kit reference: the plate and the conversation sheet in
`.claude/skills/offload-design/` and the readme **Today** section as updated by the bundle. Kits are not redrawn; the
handoff and the exploration are the visual reference. No new design-system component contract (`GlassBackdrop` is an
app component under `apps/mobile/components/shell/`).

## The two reversals this feature makes (OFF-7)

The field and the drift each contradict a logged design decision, so the code lands **one** `decisions.md` entry that
names both by date:

- **2026-09-08, "the prism field is frozen":** the field "may never sit under a scrolling list" because
  `--text-tertiary` is exactly 4.5:1 on paper with no headroom, and perpetual drift was built and rejected on a
  battery argument ("arrival, not weather"). The entry must say why that no longer applies: the field is now on the
  page where people see it (not hidden under a fill and three labels), and the drift ships only if measured near free.
- **2026-10-19, "a prism field, and a frosted plate":** chose a still field; this adopts a drift.

The entry also notes that a continuously drifting background competes with the plate's arrival pulse as the one place
motion carries meaning, and why the owner accepted that.

## Drift (item 3), decided on power not frame rate

The 2026-09-08 rejection was about battery, and a UI-thread transform loop can hold 60 fps while keeping the GPU out
of idle, which is the drain that was avoided. So the drift's acceptance is a **measured idle-power delta** (AC-11),
not a frame count. If the delta is not near zero the drift does not ship and nothing else is blocked: the still field
is the fallback and is already the logged decision. The owner asked for drift "if it's not a lot of drain"; this is
that condition made testable.

## Acceptance criteria

Tasks cite these as `046 AC-n` (the handoff's own AC-1..7 are numbered differently; do not cite bare `AC-n`).

- **046 AC-1** Today draws no alternating grounds on any surface, on all three platforms; cards, chips and stepper
  buttons read on `--surface-raised` (Android Material equivalent), and the dead band identifiers are removed, not
  left threaded as `inBand={false}`.
- **046 AC-2** The field scrolls with Today's content, runs **no shader and no per-frame JS**, and is present on
  Today only.
- **046 AC-3 (contrast, gating).** `--text-tertiary` and `--text-secondary` drawn **on Today's page ground** (not on
  a card) hold 4.5:1 over the field at its densest bloom, in both themes, **measured from the blooms' actual pixels at
  `--today-field-alpha`**, not judged from a screenshot. Measured 2026-10-19: the original blooms fail (light tertiary
  cannot pass at any alpha). **Resolved by re-baking lighter, less saturated blooms (R1 path a):** AC-3 passes when the
  re-baked blooms hold 4.5:1 for `--text-tertiary` at the field alpha in both themes, re-measured by the T0.0 loop.
  This is settled before any field code; the field cannot land on the original blooms.
- **046 AC-4** The field drifts slowly and loops seamlessly; the drift **stops** when Today is not the focused tab or
  the app is backgrounded, and is **disabled** under Reduce Motion (mobile) and `prefers-reduced-motion` (web),
  through one shared reader per surface.
- **046 AC-5** On iOS and Android 12+, content scrolling under the plate shows through it blurred. Opaque fallback
  fires on: iOS Reduce Transparency; Android below 12; web with no `backdrop-filter` support or
  `prefers-reduced-transparency: reduce`; and the frame gate (046 AC-10). Each trigger is named per platform, not one
  shared query.
- **046 AC-6** Tab labels, the composer placeholder and the attachment chip meet 4.5:1 against any Today content
  scrolling under the plate, light and dark.
- **046 AC-7** A filing still plays the prism pulse inside the plate; the pulse remains legible through the glass over
  a worst-case (photo) page, and fades in and out around its two seconds rather than cutting.
- **046 AC-8** Android never runs two live blurs at once; the raised conversation sheet there is opaque, and is
  specified in dark as well as light.
- **046 AC-9 (regression check, mostly already true).** Every tab's **list** scrolls under the plate and ends in the
  existing plate spacer: Today, My threads, a thread, Memories' list, Loose. Memories' **map** keeps its
  `usePlateInset` padding (it is not a scroll view) and its t-SNE cards stay legible under the glass.
- **046 AC-10** 60 fps scrolling Today on iPhone 12 and Pixel 6a with the drift on; a phone below 55 fps with the blur
  on gets the opaque plate. (Build-time measurement on the reference phones, plus the static `Platform.Version` and
  capability checks of AC-5; not a bespoke runtime sampler, see impl-spec.)
- **046 AC-11 (drift power gate).** Idle-power / energy delta on Today with the drift on versus the still field, over
  ~10 minutes on iPhone 12 and Pixel 6a, is near zero. If not, the drift does not ship.
- **046 AC-12** An empty or one-section Today (day one, first run) still reads as coloured, or the subtlety there is
  accepted explicitly by the owner. (The blooms are placed down the page; a short Today draws only the first.)

## Out of scope

- **The design-system sync is a prerequisite, and it is SELECTIVE** (Task 0). Only the **Today** section of the
  bundle's `readme.md`, the six new colour tokens, and the one `decisions.md` entry are taken. The bundle's `readme.md`
  must never be copied as a file: it was generated off an older tree and would revert Undo-in-place (18 Oct), the
  two-week calendar (PR 129) and the 7 and 12 October Today notes.
- Any change to the plate's shape, corners, keyboard behaviour, tab fade, or the conversation sheet's drag.
- The animated prism **shader** running continuously (rejected on cost; the field is static images).
- Redrawing the UI kits; adding a design-system component contract.
- Making Today's cards translucent (the field shows between cards, not through them). Flagged under Risks.

## No data surface

This feature adds no table, list, feed, endpoint, job, connected-app pull, or model prompt, and reads and writes no
account data. The impl-spec's **Volume and access** section is therefore legitimately absent (per `docs/specs/README.md`
it is required only when a table, list or feed changes). OFF-1/2/3/4/5/6/8 and SEC-1/2 are not engaged; see the
constitution check in the impl-spec.

## Risks the owner should know

- **R1 (measured and decided: re-bake, path a).** AC-3 was computed on 2026-10-19 (see tasks T0.0): `--text-tertiary`
  in **light** cannot sit over the original blooms at any usable alpha (0.35 -> 3.06:1 with 19% of the field failing;
  even 0.10 fails), because the token is only 4.846:1 on the bare page to begin with. The owner chose **path (a):
  re-bake lighter, less saturated blooms** so the composited ground stays bright and the field reads as colour across
  the page in both themes. This is a design task on the bloom assets (owned by the design re-bake, not this branch),
  and it is a day-one prerequisite: the field code cannot land until the re-baked blooms pass the T0.0 contrast loop.
- **R2 (coordination).** Task 0 edits shared state (`.claude/skills/offload-design/`), which is main-only, and the
  blooms 2 and 3 and six tokens must land before this branch writes field or glass code. Who lands it, and when, is a
  day-one dependency.
- **R3 (native dep + build).** `expo-blur` is a new native dependency, so the glass needs an EAS build, not an OTA.

## Open questions carried into the impl-spec

- **Q1 (web scope): closed.** The owner confirmed the frosted composer is a global restyle on every page, web
  included and consistent across pages. Web gets de-band + field (Today) + frosted composer (all panes).
- **Q2 (double padding).** Today / My threads / a thread add a `pb-*` on top of `PlateSpace`; once the plate is
  translucent that stops the last row a token above the plate, showing less through the glass than the mock. Keep or
  drop, deliberately.
