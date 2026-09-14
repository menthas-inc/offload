# offload for Android

The same product as `ui_kits/mobile_app`, rebuilt to Material 3. Nothing here is a new
feature: every screen, flow, handler and piece of copy is the iOS kit's, and the two load
the **same** `data.js` and `sun.js` so their content cannot drift.

Open `index.html`.

## What differs, and only this

| | iOS kit | Android kit |
| --- | --- | --- |
| Frame | 390×844, 44px corners, home indicator | 360×800, 28px corners, gesture bar |
| Top bar | 52px, wordmark or centred 15px title | 64dp, start-aligned Title Large (`ABar`) |
| Bottom | composer + tabs on one rounded white plate | same plate, with the 80dp navigation bar (`ANav`) inside it |
| Active tab | black glyph and label | one `blue-600` pill for the whole bar that slides between destinations in 250ms, white glyph, `blue-700` label |
| Sections | ink rule under the label, count pill beside it | no rule, Label Large grey label (`ASection`) |
| Groups | flat rows separated by hairlines | same, rows sit on the page with hairlines; only settings groups take a container, in the iOS grey at 12dp |
| Rows | 16px title, 36px square tile, single line | Body Large title, 40dp circle, wraps to two lines, 56dp minimum (`ARow` on every list; settings rows meet the same 56dp) |
| Raised sheet and folded footer | white plate, soft shadow | `surface-container` with the Material level-2 shadow |
| Search field | 38px | 52dp |
| Sign-in order | Apple first, Google under it | Google first, Apple under it |
| First-run buttons | 52px pill, ink primary | 56dp pill, filled blue primary |
| Skip on the tutorial | grey label | Material text button, blue |
| Not now on connect | ghost button, ink | `AButton tone="text"`, blue |
| Share sheet rows | 44px, square avatar tiles | 56dp, circular avatars, 52dp search field |
| @ picker card | 14px radius, iOS shadow | 12px radius, Material level-2 shadow |
| Undo | 10px floating toast | 4dp snackbar |
| Radii | 6/10/14/20/28 | Material's 4/8/12/16/28 |
| Surfaces | white on a warm page | `surface-container` steps derived from offload's neutrals |
| Opening a screen | UIKit push, whole screen, 350ms | Material shared axis X, 30dp and a fade, 300ms emphasized decelerate |
| Switching tabs | a cut | fade through, 300ms, with a 0.92 scale |
| Press feedback | `--state-press` fill | the same fill; **no ripple**, by decision |

Decisions taken deliberately: **one icon set** across both platforms (offload's Lucide-style
set, not Material Symbols), and **no dynamic colour**, because offload's identity is the mark
and the two accents.

## Files

`M3.jsx` is the whole platform layer, five pieces: `ABar`, `ANav`, `ASection`, `ACard`,
`ARow` (plus `AList` and `Swipe`). `ASection` and `ARow` take the same props as the design
system's `SectionHeader` and `ListRow`, so swapping one for the other is mechanical. Tasks
use the design system's `Checkbox` directly, which draws its own tick, so neither kit keeps
a local copy.

Insets are owned by the components, not the screens: `ASection` insets itself to the gutter,
and `ARow` always spans the full width and pays the gutter back inside, so a row's fill and
hairline reach the frame edge while its text stays on the gutter. Screens must not add a
horizontal gutter around rows.

Every other file is `M3` plus its iOS name, and is that screen with its chrome swapped: the
prefix exists because the compiler keys a component on its file stem and the two kits would
otherwise collide on every screen name. A feature added on one side is the same edit on the
other.

Two files have no iOS-named twin: `M3FirstRun.jsx` (the gate, the refusal line, the no-invite
screen, the tutorial, the connect-an-app screen and the day-one empties) and `M3Sharing.jsx` (the share sheet, the @
picker, the pending strip and the invitation). Both mirror `FirstRun.jsx` and `Sharing.jsx`
on the iOS side with Material geometry.

Surface roles live in `index.html` under `[data-platform="android"]`, light and dark, and so
do the three motion keyframes: `a-in-x`, `a-in-x-back`, `a-through-in`.

## What moves

| What | How |
| --- | --- |
| Going deeper | `a-in-x`, 30dp from the right and a fade, 300ms `cubic-bezier(.05,.7,.1,1)` |
| Coming back | `a-in-x-back`, the same from the left |
| Switching tabs | `a-through-in`, fade through with a 0.92 scale, 300ms standard easing |
| Navigation indicator | One pill for the bar, `left` transitioned 250ms `cubic-bezier(.2,0,0,1)` |
| Revealing older threads | Height only, 320ms, rows always mounted |
| Ticking a task | The design system's `Checkbox` draws the tick in 220ms, the label settles in 180ms |
| Deleting a row | Swipe, then the 4dp snackbar, unchanged |

Screens are keyed on a route and a depth in `M3App.jsx`: deeper is forward, shallower is
back, same depth is a peer and fades through. Nothing else in the kit animates, and there is
deliberately no ripple.
