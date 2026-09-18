# Applying the prism field

Colour on the phones. A baked prism texture on two surfaces, frozen at rest, warped for two
seconds when offload files something. Full reasoning is the 2026-09-08 entry in `decisions.md`;
the settled design is `explorations/prism-design.html`.

## 1. Update the checked-in design system

Download the project, replace `.claude/skills/offload-design/` with it, commit, then:

```
pnpm tokens
```

`tokens/atmosphere.css` is new and `styles.css` imports it, so the generator needs a run before any
client can read `--prism-*`.

## 2. Add the dependency

```
pnpm --filter mobile add @shopify/react-native-skia
```

Nothing else needs it. Web is unaffected: the marketing atmosphere already has its own
implementation and this does not replace it.

## 3. The prompt for Claude Code

> The design system at `.claude/skills/offload-design/` has a new component, `PrismField`, and a new
> token file. Read `components/layout/PrismField.d.ts`, then `components/layout/PrismField.prompt.md`,
> then `tokens/atmosphere.css`, then the four prism rules in `readme.md` under States and platform
> notes. The reference implementation is `components/layout/PrismField.jsx` (canvas) and the settled
> design is `explorations/prism-design.html`.
>
> Implement it on the phones as a `react-native-skia` runtime shader. The web app does not get it.
>
> 1. **The texture.** `assets/prism/p2-band-1.png` for the plate, `p2-bloom-1.png` for the gate.
>    Convert both to WebP on the way in; they are PNGs of photographic noise and roughly halve.
>    Load once, hold as an `SkImage`.
> 2. **The shader.** Sample the texture with an offset from the flow field in `PrismField.jsx`'s
>    `render`, amplitude `--prism-warp` in texture pixels. The band texture must be **flipped
>    vertically** on load: its alpha rises toward the bottom, and inside the plate that has to be at
>    the top, where the veil is lightest. The bloom is radial and is not flipped.
> 3. **Frozen by default.** Draw one frame at a fixed clock and stop. No loop, no timer, no
>    animation driver running at rest. This is the whole point of the design.
> 4. **On arrival**, run for `--prism-run` (2000ms), scaling the clock's rate by a smoothstep of the
>    remaining time over the last `--prism-settle` (700ms), so the flow slows to a halt rather than
>    cutting. Leave the phase where it lands; do not reset it. Cancel on background.
>    In the app, an arrival is any dump. On the gate it is the screen appearing.
> 5. **The plate changes.** `App.jsx`'s and `M3App.jsx`'s plate wrapper drops
>    `background: var(--surface-raised)` for `transparent`, gains `overflow: hidden`, and takes the
>    field as its first child with the graded veil above it. `Composer` and `TabBar` are already
>    `bare`/transparent, so neither child changes. The kits show the exact shape.
> 6. **The veil is graded and it is not optional.** 38% white at the plate's top edge, held to 30%
>    of its height, reaching 86% by 60%. Flat 86% makes the field invisible and no density recovers
>    it; thinner takes the tab labels under 4.5:1. Do not retune one without re-measuring the other
>    against `--text-tertiary`.
> 7. **The field may never sit under a scrolling list.** It is clipped to the plate's own box.
> 8. **Reduced motion**: the shader never runs, both surfaces hold the frozen frame, and the nudge
>    and change mark are cut.
> 9. **The parallax.** The field slides horizontally against the scrolling list, clamped to ±26px
>    inside the texture's 16% overhang. `Animated.event` on the `ScrollView`'s `onScroll` with
>    `useNativeDriver: true`, mapped to the field's `translateX`. It costs nothing, it only moves
>    when the person moves, and it is the only thing about the field that is not offload's doing.
>    **Horizontal only**: the dense edge is pinned to the plate's top and vertical travel bares it.
>    On web the component owns this itself via a capture-phase scroll listener, so no screen wires
>    it; on React Native the `ScrollView` has to hand it the value.
> 10. **One field, one surface, one height.** The plate is composer plus tabs in every state,
>     including while a conversation is raised: the sheet rests on the plate rather than taking the
>     composer up with it. Splitting the field in two was tried and fails, because each field maps
>     the whole texture into its own box, so two half-height boxes squash the pattern and break it
>     at the seam.
> 11. **Dark theme works by re-pointing the fill, and the fill is the plate's own colour.**
>     `--surface-plate` is the ground the field sits on AND the value `--prism-veil-rgb` is made of:
>     `--paper` on light, `#0F0F11` on dark, deliberately darker than `--surface-card`. Paint the
>     plate, a raised conversation and a folded title row with it. If the surface and the veil hold
>     different values the difference shows as a band exactly where the field should be vanishing:
>     on dark it read as a grey composer against a black tab strip. Dark also lowers
>     `--prism-alpha` and `--prism-density`, because the washes are light tints and read hotter
>     over a dark ground.
> 12. **The gate's bloom covers all of first run**, mounted once in `GateShell` around sign-in, the
>     refusal, the tutorial and connect, so it warps on arrival and not at every step.
> 13. **Rescale the texture's alpha before you use it, and rescale it to the VISIBLE WINDOW rather
>     than to the texture's own box.** The baked textures carry a one-directional ramp, so
>     `PrismField` measures each row's mean alpha and divides it out, then multiplies in a symmetric
>     hump: zero at the top edge, full across the middle, zero by `--prism-veil-reach` (64% of the
>     band, pinned above the tab labels). Do not tune this layer on its own. What the eye sees is
>     the field multiplied by what the veil passes, and a box-wide hump opened in 25px at the top
>     while smearing over 61px at the bottom, because at the top the two ramps coincide and at the
>     bottom they stagger. On the same window, with the veil's thin band centred at 32% and equal
>     16% ramps, it measures 27px at each end. On React Native do the rescale once when the texture
>     is decoded, never per frame.
> 14. **Web only, and only in this repo's kit pages:** `ui_kits/*/index.html` carry a `?v=` on both
>     `_ds_bundle.js` and `styles.css`, and it must be bumped on any change to either. No query at
>     all leaves invalidation to HTTP caching and a reload silently keeps the old build; a stale one
>     pins it. Three rounds of "I refreshed and I don't see it" were this, not the design.
> 15. **Anything sitting over the field passes no fill and no blur.** `Composer` goes in `bare`;
>     `TabBar` gets `background:transparent` *and* `backdropFilter:none`. On iOS the blur was the
>     cause of a hard seam at the bar's top edge, because a backdrop-filter clips its own backdrop.
>     In React Native the equivalent is not passing a `BlurView` around the tab bar.
 Over `--surface-page` on dark the washes read as fog. If dark is
>    needed before we bake a dark set, render no field rather than this one.
>
> The `filed` counter in both `App.jsx` files is the arrival signal; it ticks in `submit`. Log any
> divergence in `decisions.md` with a **Design system impact** field as usual.

## 4. After it lands

Commit and ask for a sync here. The one thing still owed from this side is the dark bake.
