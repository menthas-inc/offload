# From the code, 2026-09-30: the immersive conversation as built

`APPLY-2026-09-29-conversation-sheet.md` is built and on `main` (PR #31, merge `0f2a17b`), tested on an iPhone 17 simulator frame by frame from screen recordings, in light and dark, and on a Pixel 9. The two log entries of 30 September at the top of `decisions.md` are the record; this note is what the kits and the readme catch up to, in one place.

## As drawn

The sheet at 54pt with only a grabber; no header, no fold; the finger drives the sheet, the scrim, the tab bar and, on iOS only, the page receding (0.93 from the top edge, down 10, a 14 corner, 45% scrim); Android dims to 55% and nothing moves; a release past a quarter or a flick closes; the spring 380 over 36 from the release speed; a thread keeps its tabs; the pin is the same sheet; the turn footer is unchanged; every row sheet drags, and a drag is Cancel.

## Where the build differs, and what each wants from the design system

1. **Every sheet drags, not only the row sheets.** Move, Calendars, Share, Confirm, the label list, the note editor and the rename sheet take the same grabber and physics. *Kits:* `Sheet.jsx` and every sheet in both mobile kits draw the grabber.
2. **Thirty minutes of silence ends a conversation, on every surface.** The server's window went from six hours to thirty minutes. The phones have no close any more, so a conversation put away for thirty minutes ends on the next tap into the composer or the next dump. The web keeps its close and stops drawing the old turns once the server starts a new one. *Readme:* "A raised conversation follows the finger" gains the sentence; the web conversation panel is unchanged.
3. **The plate keeps its shape under the keyboard.** The old "clears to the composer alone" is gone: the keyboard covers the tabs first, and the plate rides it only once it reaches the composer. *Readme:* "The bottom plate is a fixed shape" gains the keyboard. *Kits:* the redraw (5A) should show the plate under a keyboard with the tabs behind it.
4. **Motion has no token.** A dragged sheet moves on the spring above; `--duration-sheet` and `--ease-entrance` now govern only the plate sliding off for a screen sheet. `Sheet.jsx` still animates `offload-rise` on them. *Tokens:* a `--spring-sheet`, or a note in `motion.css`.
5. **A field in a sheet is focused as the sheet starts to rise**, and the sheet opens from the keyboard's edge, so the two move as one. **Closing any sheet puts its keyboard away**, whichever way it closes. *`Sheet.prompt.md`:* one line each.
6. **A pin's "In thread" chip sits on the composer** and rides the keyboard with it, rather than at the top of an empty sheet. *Kit:* the pinned state of the conversation.
7. **Android back is predictive.** A swipe pulls the top sheet down by up to 30% of its travel, a cancelled swipe springs it back, a committed one closes the sheet and not the screen under it. *Readme:* one sentence in the conversation note.
8. **The grabber**: 36 by 4 on iOS, widening to 44 while held; 32 by 4 on Android, M3's handle, not widening. To a screen reader it is the Close button, since the scrim is outside a sheet's modal region.
9. **Scrims are dark ink in both themes.** Every phone scrim was the `ink-950` ramp, #EDEDED in dark, so sheets dimmed the page to white in dark, the old ones included. The row sheets stay at 35%, as the handoff says; `--surface-scrim` is 32%. *Tokens:* one of the two numbers should win.

## Seen, no entry needed

- Stacked sheets each draw their own scrim, so a sheet over a sheet dims more deeply (the composer's photo sheet over the conversation, a confirmation over Share). Nothing in the handoff says what a stacked sheet should do; the handoff's "nothing in it opens a row sheet" is true of the edit sheets and not of the photo sheet.
- The Calendars sheet opens at its loading height and grows once its list lands.
