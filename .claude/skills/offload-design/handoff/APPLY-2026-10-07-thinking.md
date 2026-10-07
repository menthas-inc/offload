# Apply: the thinking row

Drawn in `explorations/thinking.html` (ten animations, three stops) and `explorations/thinking-drop.html` (seven
landings) with the product owner on 7 October 2026, against `apps/mobile/components/shell/Conversation.tsx` on
`main` at `60d4e15` (`Working`, `Writing`, `SAY_AFTER_MS`, `STOP_AFTER_MS`). All three surfaces. Reference:
`ui_kits/thinking_row/index.html`, standalone `handoff/thinking-standalone.html`. Readme: **The thinking row**.
Log: *2026-10-07 · The thinking row*.

## 1. What changes in `Working`

| | Today | Now |
| --- | --- | --- |
| 0 to 2.5s | `Writing`, three dots in a bubble | the row: **Splash** alone |
| a step exists | the step, from 2.5s | the phrase beside Splash, **as soon as it exists** |
| from 10s | *Stop* in `--text-accent` | the **Stop pill** joins the row |
| end of turn | row goes | row goes |

- **`SAY_AFTER_MS` goes.** The 2.5s wait existed so a line would not flash; the animation now says working from
  the first frame, so a phrase is shown when it arrives. Keep a 400ms floor between phrases so two that land
  together do not flicker: hold the newer until the older has been up 400ms.
- **`STOP_AFTER_MS` stays at 10,000.**
- **`Writing` is removed** from conversations. The filing turn uses the row too.
- **No bubble.** The row is `alignSelf: flex-start` at the turn gutter.
- The worker's first step, *Looking through your threads*, is no longer needed as a placeholder. It may stay as a
  real step if the turn is in fact looking; it must not be written as filler.

## 2. The row

- Splash 22×22, then 10px (`gap-space-5` is 12, so use 10 literally or `space-4` plus 2), then the phrase, then 8px,
  then Stop. One line; the phrase truncates with an ellipsis before Stop moves.
- Phrase: `font-core`, 13.5px, `text-text-secondary` (Android `text-a-on-var`), one line.
- **Phrase change:** old fades and moves 3px up with a 3px blur, new fades in from 3px below, 350ms on
  `--ease-out`, in the same box (no layout shift). `accessibilityLiveRegion="polite"`.
- Accessibility: the animation is hidden; with no phrase the row is labelled *offload is thinking*.

## 3. Splash

22×22 box on a 24 unit grid, the mark's geometry: dot `cx 12 cy 5.25 r 2.6`; vessel
`M5.5 11.5 V15.5 a3 3 0 0 0 3 3 h7 a3 3 0 0 0 3 -3 V11.5`, stroke 2.6, round caps. Three droplets at `12, 14`,
r 1.05, 0.9, 0.75. All `--text-primary`. **3.2s, infinite, never restarted** by a phrase or by Stop arriving.

| Part | Keyframes (percent of 3.2s) |
| --- | --- |
| Dot | 0: up 5, hidden. 16: in place, shown (ease-in-out). 46: in place, then `cubic-bezier(.5,0,.9,.4)`. 61: down 9, scaleY 1.1. 63: down 9.6, scale 1.2 × 0.5, hidden. 100: up 5, hidden |
| Vessel (origin bottom centre) | 0 to 60: rest. 66: scaleY 0.82, scaleX 1.06. 76: scaleY 1.04, scaleX 0.98. 84 to 100: rest |
| Left droplet | 61: hidden. 62: shown, then `cubic-bezier(.2,.7,.4,1)`. 72: (−5.5, −8). 84: (−8, −3) at 0.6, hidden |
| Right droplet | as left, to (5.5, −7) then (8, −2) |
| Centre droplet | 62: hidden. 63: shown. 71: (0.5, −10) at 0.8. 82: (0.5, −5) at 0.5, hidden |

Phones: Reanimated, one shared clock (`withRepeat(withTiming(1,{duration:3200,easing:linear}),-1)`) and each part
interpolating its own keyframes, so all five stay in step. Web: the CSS in the reference file as is.
**Reduced motion:** the mark whole and still (dot at rest, droplets hidden, no animation).

## 4. Stop

A pill: 30 tall, `rounded-pill`, 1px `--border-strong` (Android `--ink-400`), padding 11 left and 12 right, a 7px
ink square with 2px radius, 7px gap, *Stop* 13px medium `--text-primary`. Hit area to 44 tall. Arrives with a
300ms fade and scale from 0.8. Pressing it is today's `stop`, and the turn ends *Stopped.* as now.

## 5. Web

The same row in the web conversation, same sizes. Hover on Stop: `--state-hover`.

## Not in this pass

The other nine animations and six landings, Stop as a round icon, and Stop on the composer's send button.
