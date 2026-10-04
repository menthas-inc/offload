# Apply: The landing page, one scroll

Drawn in `explorations/landing-scroll.html` with the product owner on 4 October 2026, direction **C,
Through the prism**, against `main` read on 4 October: `apps/web/src/app/(marketing)/page.tsx`,
`page.module.css`, `apps/web/src/components/Screen.tsx`, `screen.module.css`, `Atmosphere.tsx`,
`atmosphere.module.css`, `Logo.tsx`, and the calendar lines of `privacy/page.tsx`. Web only.
Reference build: `ui_kits/marketing_site/index.html` with `landing.js` and `landing.css`; every number
below is in those two files. Standalone copy: `handoff/landing-standalone.html`.

**Ready to build. Nothing is open.** The readme's **The landing page** is the lasting statement.
Decisions log: *2026-10-04 · The landing page says what offload is*.

**Why:** Google's OAuth review opens offload.club signed out and checks four things. Two were missing:
what offload is in plain words, and that it connects to Google Calendar and why. Both now sit on the
page as live HTML, outside the sign-in card, claiming less than the privacy page does.

**Unchanged:** the hero (the cycling word, its bleed and ghosts, the sentence, the field, the honeypot,
the identical server answer, the done line); `/sign-in`; the gate sharing `Screen` and `Atmosphere`;
`/privacy` and `/terms` keeping `atmosphere="pinned"`.

---

## 0. Google's four checks

| Check | Where | |
| --- | --- | --- |
| What offload is | Step 01 | new |
| Google Calendar, and why | Step 04, with a link to `/privacy` | new |
| The name, matching the consent screen | Headline and logo, lowercase *offload* | as built |
| Privacy on the same domain | Footer beside Terms | as built |

All four steps' text is in the document from first paint. **Never `aria-hidden`, never
`display:none`, never rendered on scroll.** A step out of view is `opacity: 0` and `pointer-events:
none`, nothing more, so a crawler, a screen reader and a reviewer who reads the source all see it.

## 1. The copy, verbatim

| Step | Kicker | Heading | Body |
| --- | --- | --- | --- |
| 01 | What it is | Send it. offload files it. | offload is a place to put down what is on your mind: notes, links, photos and voice notes. It reads each one and files it into a thread, one for each thing you are keeping track of. |
| 02 | Getting things in | Send it as is | Type it, say it, snap it, or forward it. |
| 03 | Threads | Everything lands in threads | Related things gather in one thread. Share it, and plan it with the people in it. |
| 04 | Google Calendar | Works with your Google Calendar | Connect your Google Calendar and offload can show what is on it and add or change events when you ask. |

Under step 04, in body-sm: *You select which calendars offload may use, and you can disconnect in
Settings at any time.* then a link, *How offload handles your calendar*, to `/privacy`.

The closing section: heading **offload keeps track for you**, body *offload is invite only for now.
Join the waitlist and we will email you when your account is ready to use.*, then the same form.

The scroll mark under the hero: **See how it works**.

Kickers are 13px medium `--text-secondary` with the number in `--text-tertiary` tabular. Headings
are core semibold 58px (36px below 820), line height 1.02, tracking -0.038em, `text-wrap: balance`.
Bodies are the quiet role at 21px (17px), line height 1.55, `--text-secondary`, 34ch.

## 2. The page

```
Screen (scroll)
  Atmosphere (scroll)            sticky, one viewport tall, behind everything
  ScreenHeader                   sticky
  hero                           as built, plus the scroll mark
  LandingStory                   6 viewports tall, the panel sticky inside it
  closing                        one viewport, padding-top 60vh
  ScreenFooter
  progress bar                   sticky to the bottom of the window
```

**The page scrolls the window, not a box.** `.screen` loses `overflow: hidden` in this mode and
keeps `min-height: 100dvh`. The reference build scrolls an element only because it sits in frames.

**The story starts under the hero.** `LandingStory` has `margin-top: calc(-1 * (100vh - header))`
so its sticky panel is already in place, at opacity 0, while the hero leaves. The hero sits above it
at `z-index: 2`.

## 3. The header

`ScreenHeader` becomes `position: sticky; top: 0; z-index: 6`, height 74px (62px below 820). Its
padding-top is `height - 40px`, so at rest the row sits where it does today.

**Scrolled past 8px:** background `color-mix(in srgb, var(--surface-page) 72%, transparent)`,
`backdrop-filter: blur(14px)`, `box-shadow: 0 1px 0 var(--border-hairline)`, and **padding-top 0**,
which centres the logo and Sign in in the band. All three on a 300ms transition. One
`scrolled` boolean from a passive scroll listener; the gate never sets it.

## 4. The atmosphere, scroll-driven

`Atmosphere` gains `mode="scroll"` beside `pinned`. Sticky to the viewport, not absolute.

**The film is full-bleed and the mark is its mask.** One canvas fills the viewport; the mark SVG is
its `mask-image`, and the mask's size and position move. Scaling the mark itself would scale the
canvas and blur the shader to flat colour. The five washes stay inside the mark as today and scale
with it by transform.

Let `k = scrollY / innerHeight` (clamped 0..1) and `smooth(t) = t*t*(3-2t)`. `S = min(74vh, 82vw)`
is the mark's box, as today.

- **In:** `zin = smooth(clamp(k / 1.05))`. Scale `1 + zin^2.4 * 17`, about the vessel's base, at
  **92.6%** of the mark box's height. At the top the base stroke is wider than the window.
- **Out:** `zout = smooth(clamp((r - 0.08) / 0.42))`, where `r` is how far the closing section has
  come through the window (0 as its top enters, 1 as its bottom leaves). Scale goes to **0.36**, the
  origin moves to the centre, and the mark rises by **20vh**, so it sits above the closing heading.
- **Mark opacity** 0.75, rising to 1 while zoomed in.
- **Clouds** fade to 40% of their 0.72 while zoomed in.
- **Shader:** strength `amt` 0.25 to **0.62** while zoomed; `hue` adds `pageProgress * 1.1` to the
  band; a new `zm` uniform magnifies the field by up to 1.8 (`q = ((uv - .5) * aspect) / zm + .5`);
  the clock is `t + scrollY * 0.006`, so the film stirs as you scroll. The two new uniforms are
  four lines; see `FS` in `landing.js`.

**Paint cost.** The comment in `Atmosphere.tsx` is right that animated turbulence on a long page
starves the text. So in scroll mode: **no per-wash `feTurbulence`** (the washes take a static CSS
blur of 10, 6 and 4px, and the turbulence goes), the canvas at **0.6 of CSS pixels** capped at 1x
device ratio, drawn on scroll frames and ten times a second otherwise, and the pointer parallax off.
The cloud drifts keep their stepped loops.

**Reduced motion:** no zoom and no clock. The mark stays as `pinned` draws it, the film fixed at
`t = 40`, and the panel steps swap with opacity only.

## 5. The panel

One `.panel` inside a sticky box at `top: header; height: 100vh - header`, centred, gutter 64px
(14px below 820).

- Paper at **86%** over the film, `backdrop-filter: blur(22px) saturate(1.15)`, radius **36px**
  (26px), padding **56px** (24px 20px), `box-shadow: inset 0 0 0 1px rgb(255 255 255 / .7), 0 40px
  80px -40px rgb(30 20 60 / .35)`. Max width 1080px.
- Inside, the four steps share one grid cell. Each is two columns, text and drawing, 72px gap;
  one column below 820, 22px gap.

Let `pos = clamp((scrollY - 0.95vh) / (storyHeight - vh + header - 0.95vh)) * 4`, 0 to 4.

- **Panel:** in with `smooth(clamp((k - .55) / .4))`, out with `smooth(clamp((pos - 3.82) / .18))`.
  Opacity is in × (1 - out), scale `.95 + .05 * opacity`.
- **Step j** is visible across `[j, j+1]` with 0.1 crossfades at its edges (step 1 is already full
  at the start and step 4 holds to the end): `1 - max(0, |pos - (j + .5)| - .4) / .1`.
- **The outgoing text** moves 22px in the scroll's direction and blurs up to 10px as it fades.
- **The drawing assembles.** Its parts (bubbles, thread rows, cards, rows, the two turns, the
  agenda) rise 18px and scale from .97, staggered by 0.12, over the first 60% of the step.

The drawings are the kit's: four dumps over Lisbon trip (4) and Bookshelf build (3); Typed, Said,
Snapped, Forwarded; Lisbon trip with three faces and four rows; *Put the flights on my calendar*,
offload's reply in the quiet voice, and the Tuesday 14 October agenda with **Flights to Lisbon** new
at 07:40. Thread tiles are the thread marks' one-hue washes.

**Below 820** the fine print under step 04 and the agenda's third row are hidden inside the panel
for room, and the reply drops to 15px. Privacy stays in the footer.

## 6. The scroll mark

Under the hero, 30px from its bottom: a 22 × 30 drawing of the mark, a 7px dot dropping 19px into
an 11px vessel that gives on landing, on a 2.6s loop, over **See how it works** at 13px medium
`--text-secondary`. A button: it scrolls smoothly to the story. Fades out over the first quarter
of the hero's scroll. Still under reduced motion.

## 7. The progress bar

3px along the bottom of the window, above everything, `pointer-events: none`. Track
`color-mix(in srgb, var(--text-primary) 8%, transparent)`, fill `--text-primary` by
`scaleX(scrollY / (scrollHeight - innerHeight))` from the left. Opacity `k * 3`, so it arrives as
the hero leaves.

## 8. Files

- `apps/web/src/app/(marketing)/page.tsx`: `Screen scroll`, the scroll mark, `LandingStory`, the closing
  section with a second form instance sharing the same submit.
- New `apps/web/src/components/LandingStory.tsx` and its module.
- `Screen.tsx`: a `scroll` prop (sticky header, `scrolled`, the progress bar, no `overflow: hidden`).
- `Atmosphere.tsx`: `mode="scroll"`, the full-bleed masked canvas, `hue` and `zm`, no parallax.
- `atmosphere.module.css`: the scroll mode without the per-wash filters.

## 9. Check before review

- Signed out, JavaScript off: all five headings and all four bodies render as text.
- The calendar sentence claims no more than `/privacy` (which also says delete).
- Lighthouse on a mid phone: no long frames during the zoom from the turbulence; if the zoom drops
  frames, the film's resolution goes first, to 0.45.
