# Apply: voice notes

All eleven items 021's feature spec logs against this system, drawn in
`explorations/voice-notes.html` and decided with the product owner on 21 September 2026. Values for
both themes and all three surfaces.

**One new component, `SentVoice`. Two new glyphs, `play` and `pause`.** No new tokens.

**Read items 1 to 3 first: they are the kit being wrong, not behind.** Everything after them is
drawing a decision code has already made.

---

## 1. Typed words stay drawn above the recording row

**The kit hides them and sends them anyway.** That is text you cannot see being sent.

```
pill: expanded shape — flex column, --radius-lg, padding var(--space-4) var(--space-3) var(--space-3) var(--space-6)
  words:  font var(--text-body-role), --text-primary, -webkit-line-clamp: 3, static
  chips:  AttachChip row, unchanged
  row:    dot · m:ss · live window · Discard · Send
```

**Static and primary ink.** Static because there is nothing to type into while it records; primary
because it is going to be sent, and tertiary would read as a placeholder. Discard returns the
composer with the words and chips intact.

## 2. `SentVoice`'s bars

**Withdrawn: `--ink-950` under an `opacity: 0.3 + 0.6*(i/n)` ramp, and the 26-bar sine fallback.**
The ramp made every note appear to fade in from silence whatever was said, and read as a fill that
was always half played. The composer's own `WAVE_BARS` is 32.

| | Value |
| --- | --- |
| Bars | **32**, resampled over the whole note on the device at stop, sent with the upload, stored |
| At rest | `--text-tertiary` — 4.76:1 on the bubble |
| Played | `--text-attention` — 5.74:1 light, 7.1:1 dark |
| Remainder **while playing** | `--ink-300` — a 3.53:1 boundary light, 3.92:1 dark |
| Geometry | 3px wide, 2px gap, 20px tall box, `border-radius: 2` |

**The remainder recedes only while playing**, where there is a fill to read it against. A resting row
keeps its full waveform: dimming it there costs the default state of every note three points of
contrast to buy legibility in a state it is not in.

**`--text-attention`, not `--text-primary`.** Ink is louder in the absolute and measures **1.21:1
against a tertiary remainder**, so the boundary between played and not is the one thing you cannot
see. Blue separates by hue and by value at once.

**No sine fallback.** A note always has its bars, because they arrive with it; a sine is a picture of
a different recording. `SentVoice` falls back to a flat row.

## 3. "Discard voice note"

The kit says **"Discard recording"**. The vocabulary bans that noun anywhere a person reads — a
person *records* a voice note, and the thing is *a voice note*. This is a screen reader's whole
description of that button. The microphone keeps the kit's own **"Voice note"**.

## 4. The recording row, and the stopped row

**The row as the kit draws it, unchanged:** an 8px `--text-danger` dot pulsing at `1.2s
var(--ease-out) infinite`, a `--text-numeric-role` `m:ss` in `--text-secondary`, and the live window
— `--text-primary` bars under `opacity: 0.35 + 0.65*(i/32)`, growing from the right, so older bars
fade. **That ramp means something and stays.**

**Send on the recording row is `primary` with no `tone`** — `--surface-inverse` with a white glyph,
17.58:1 on the pill. The blue attention tone belongs to the idle row, where it means "you have
something to send". **Recording does not promote Send to an attention control; it makes it the only
thing left to press.**

**A stopped note is the row with no dot.** The time and the window stand still, both controls stay,
and it takes no more photos. **The absence of the dot is the whole signal**, so reduced motion
changes nothing about it. Reached at ten minutes, on an incoming call, and when the app leaves the
screen.

## 5. The transcript

Beneath the bars, inside the person's own bubble, arriving on the next read after it is written and
ahead of the reply.

```
font:  var(--weight-regular) 15px/22px var(--font-core)
color: --text-secondary        — 6.24:1 light, 7.65:1 dark
fold:  "Show all" inline in --text-accent past ~4 lines (FOLD_AT 280 chars)
```

**`--font-core`, while the reply below it is `--font-quiet`.** The transcript is what *they* said, so
it keeps the UI sans inside their own bubble; the reply is offload speaking, so it is Literata at
16/24. **Two faces a line apart is what makes the transcript read as a record rather than an answer.**

**The dark contrast is measured, not owed.** The spec lists it under "needs a device"; it is
7.65:1 on a bubble that resolves to #161F42, and "Show all" is 5.72:1 on the same ground. That line
comes off the device list.

**A note with nothing to hear draws no transcript line at all**, not an empty one — an empty line
under the bars reads as a transcript that lost its words. offload's reply is "Heard nothing in that
one.", with no question and no retry.

## 6. Playing

**The glyph is the control, so it says what pressing it does:** `play` at rest, `pause` while
playing. A microphone there says record, which is the composer's job and not this row's. **Both
vendored in this pass, the 83rd and 84th**, in Lucide's stroke format at `fill="none"`.

The fill runs left to right, the duration counts down, a second tap pauses, **one plays at a time
across the screen**, and the bubble is inert while the composer records. **The whole row is the
target**, 44px minimum, named `"Voice note, 0:14, play"` with state `"playing, 0:08 left"`.

## 7. The failure lines

**One pattern: the clause is the state, the control is the exit.** 13px `--text-danger`, the way
forward 13px `--text-accent` at weight 500. Never two danger colours in a row — that would make the
way out look like the risk.

**Under the composer**, `margin-top: var(--space-2)`, a flex row, **with a 14px dismiss `x` pushed to
the end on every line**:

| Line | Action |
| --- | --- |
| `Microphone is off for offload.` | `Open settings` (phones only; the web has none to open) |
| `Too big to send.` | — |
| `Not taking voice notes yet.` | — |
| `Enough for today.` | — |

In each the note stays in the row, stopped and sendable, with Discard still there.

**Below the bubble**, on a failed turn, `align-self: flex-end`:

| Line | Action |
| --- | --- |
| `That didn't go through.` | `Try again` — puts the note back in the row with its words and chips |
| `Couldn't write that one down.` | `Try again` — runs the same turn again on the same note |
| `offload could not answer that one. Your dump is saved.` | `Try again` |

**The bubble keeps its `--blue-50` fill and only its border goes `--clay-600`.** One border is the
whole of the warning, which is what keeps the readme's "a refusal is a sentence, not an error state,
no warning colour" true, and the message you wrote still looks like the message you wrote.

**The one exception: `Not here yet.`** The playback failure sits **inside** the note, between the row
and the transcript, 13px `--text-danger`, **with no control at all** — `toggle()` clears it on the
way in, so the row above it is the retry. A Try again beside it would be a second control for the
same tap.

## 8. The Discard toast, past a minute

`Toast` with `Undo`, eight seconds, the note kept on the device until it clears. **Only past a
minute:** a ten-second note is cheap to say again, and a toast after every discard is a toast nobody
reads. Discard sits a thumb's width from Send and a nine-minute thought is not something to lose to
a mis-tap.

## 9. The quick action's arrival

The plate's composer already in the recording row, on whatever screen is up, **with no conversation
sheet raised**. The screen behind stays and is the filing default. **The glyph is the platform's** —
a system symbol on iOS, a drawable on Android — because neither takes the product's own.

## 10. Android

**Two tokens in the composer, and that is the whole of its divergence:** `--a-on-var` for the time,
`--a-on` for the bars. `M3Composer.jsx` changes nothing else — **the pill is the shared one**,
`--radius-pill` on `--surface-raised` with `--border-focus`.

**The sent bubble is not a divergence.** `Conversation.tsx`'s `Yours` has no `isAndroid` branch at
all, so the person's words are `--blue-50` over `--blue-100` in `--ink-950` on both platforms. Only
`Theirs`, `Bubble` and `Writing` take `--a-c`.

**What does diverge is the platform's own chrome**, which is not the product's to share: the status
bar (`10px 18px 2px` on `--surface-raised`, no blur, medium 12 on `--a-on`, 20px battery) and the
gesture bar (108×4 at `--a-on-var`, against iOS's 134×5 home indicator).

**The rule, read the right way round:** "an Android override that is not an `--a-*` token is almost
certainly wrong" does not mean every `--a-*` token is right. A component the product owns is shared
unless its own source says otherwise; the frame around it belongs to the platform.

## 11. The web borrows both

`WComposer` draws no recording state and `WTurns` draws text only, so both the row and `SentVoice`
come from the mobile kit. **This is the largest of the eleven.**

The row is the card's own field: `--surface-input` at `border-radius: 25`, `min-height: 50`, inside
`WComposer`'s **940px `--surface-raised` card** at `border-radius: 33` with its `1.5px --blue-500`
edge and two inset blue washes. **The window scales to that width at the kit's pitch** — 3px bars,
2px gap, as many as fit — rather than sitting 160px wide at the right of it.

Focus moves to Send when the field is replaced, Escape discards, Enter sends. **A hidden tab keeps
recording**, because looking something up mid-sentence is what a tab switch is for.

---

## Owed

1. **The recording row at the largest text size** with three lines of words above it, which is the
   tallest that pill can get. The spec lists it under "needs a device"; it is a layout question.
2. **The composer's recording state as a component.** It is drawn here and lives in three kits.
