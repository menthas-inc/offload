# Apply: Today, and what the 30 September build asked of the system

Drawn in `explorations/today.html` with the product owner on 30 September and 1 October 2026,
against `main` at the head of 30 September (26 commits past `70a5fa4`: the immersive conversation
built, 026 Mail in specced, launch holding on a failure). All three surfaces, both themes.
Standalone copy: `handoff/today-standalone.html`, with an iOS, Android and web switch.

**Ready to build. Nothing is open.** The readme's new **Today** section is the lasting statement;
this file is the build order. It replaces the placeholder Today on `main` (the three groups of
Overdue, Today and Tomorrow).

**New in the system:** the `sliders-horizontal` and `mail` glyphs (87; `mail` is the one 026's
AC-21 asks for), `--spring-sheet-stiffness` and `--spring-sheet-damping` in `tokens/motion.css`, and
`--surface-scrim` at 0.35 in light (was 0.32; dark is unchanged at 0.55).

---

## 1. The page

Under the app bar, in order, each drawn only when it has something:

1. **Needs you** (item 2)
2. **The day** (items 3 to 6)

No heading over Needs you, no date row, no See all. The phone shows the date.

The app bar on Today draws `sliders-horizontal` before the bell, opening Customize Today (item 7).
No other tab draws it. The web draws it at the right of the pane head.

## 2. Needs you

- **Holds interruptions only**, in this order: account issues (a calendar that stopped syncing, a
  missing permission), people waiting (connection and share requests), questions offload asked
  (018, including 026's *A question about an email*), and at most one tip.
- **Late to-dos are not in it** (item 5). Filed and failed emails stay in Activity.
- **One card with the rest stacked under it**, two slivers showing. The card: the kind with its
  glyph and how long it has waited, and *N of M* at the right, 12px; a title at 17px semibold; one
  line of context at 13.5px, ellipsised; then the actions as 34px pills, the first filled ink, and a
  `clock` button at the right that puts the card off until tomorrow. Radius 18 (16 on Android).
  Settle it or swipe it away and the next comes up.
- **Kind colours**: account issues and late in `--text-danger`, people and questions in
  `--blue-700`, a tip in `--moss-700`.
- A thread named in a card is a thread pill (item 8).
- **The forwarding tip**: `mail`, *Tip*, *Forward emails to offload*, *Send them to
  over@to.offload.club from jo@hey.com.* with the account's sign-in address, *Copy address* (toast
  *Copied*) and *Got it*. Not shown to an Apple hidden email, nor once the account has forwarded one.
- When it holds nothing it is not drawn at all.

## 3. The stepper

- Chevron buttons, 40px round on `--surface-fill`, either side of the day's name at 20px semibold;
  a date at 13px under any day but Today.
- **Names:** Today, Tomorrow, then weekday names to Sunday, then *Next Monday* to *Next Sunday*,
  then the date (*Wed 15 Oct*). The back arrow is disabled on Today.
- A horizontal swipe across the day moves one day. The page opens on Today every time; the day
  shown is not kept.
- Needs you does not change with the day.

## 4. The next event, and the events strip

- **One line**, 20px semibold: the next event's title and its countdown in `--blue-600`, as
  *Call with Ana in 1h 30m*. On another day, the first event and *at 10:00*. No line when the day
  has no events.
- **Where you will be** (15px semibold, with the count): the day's events as 128px cards in a row
  that scrolls sideways past the gutter: time range 12px semibold, title 14px two lines, calendar
  or thread under it. Past events at 50%; the next one raised on `--surface-raised` with
  `--shadow-2`. A tap opens the event in the calendar app; nothing here edits it.

## 5. To do

- The thread page's rows in one card, in this order: **late**, oldest first, with the late date
  chip, and past three the rest fold into a *3 more late* row; **with a time**, carrying a `clock`
  chip with the hour; **the rest due that day**.
- Every row acts in place with its own sheets and Undo, as the thread page's do.

## 6. If you have time

- **Today only.** Up to three to-dos with **no date**, picked by the server; the header carries
  *picked by offload* at the right.
- Each row has a *+ Today* pill (28px) at the trailing edge. It gives the to-do today as its date,
  so it moves into To do, with Undo.
- The pick is the server's rule: open, undated, oldest first across threads with something due
  soon, never one the person put off with the pill's Undo that day. Not a setting.

## 7. Customize Today

- A sheet (a right-hand pane on the web): *Customize Today*, *Drag to reorder. Switch off to hide.*,
  then three rows with a grip, a name, a line, and a switch: **Needs you**, **Your day**, **What
  moved** (off by default). Reset and Done. Changes apply as they are made.
- Stored as one document per account, synced, read by the server when it builds Today:

  ```json
  { "version": 1, "sections": [
    { "kind": "needs_you", "on": true },
    { "kind": "day", "on": true },
    { "kind": "moved", "on": false } ] }
  ```

- The kinds are a closed set that grows. A new kind ships with a default place and switch; a stored
  layout that does not name it gets it at its default. No model call anywhere.
- *What moved*: shared threads' Activity since the person last opened Today; drawn only if on.

## 8. Thread pills

Every thread named on Today is the conversation's thread pill: moss soft ground, `--text-accent`,
`lasso` at 13px, 24px tall on the marks line, 12.5px medium. It opens the thread. A label mark
follows it. A calendar name (*Google, Work*) stays plain text.

---

## The system, from the 30 September build

The two code entries of 30 September asked for these; all are folded in:

| Asked | Closed as |
| --- | --- |
| Scrim 35% on row sheets against `--surface-scrim` 0.32 | **35% wins.** The token is 0.35 in light; dark stays 0.55 |
| Stacked sheets each draw a scrim | **An upper sheet draws no scrim**: the page stays at one dim |
| The sheet spring has no token | `--spring-sheet-stiffness: 380`, `--spring-sheet-damping: 36` |
| Every sheet drags; the grabber; focus as it rises; keyboard away on close | `Sheet.prompt.md` |
| Thirty minutes ends a conversation; the 30% back pull; "every sheet" | readme, *A raised conversation follows the finger* |
| The keyboard covers the tabs, the plate rides it from the composer | readme, *The bottom plate is a fixed shape* |
| 026's `mail` glyph | Vendored |

## Two changes to what is built

**9. Launch when nothing answers** (replaces the single *That didn't go through.* line):
- No network (NetInfo / `navigator.onLine`): *You're offline*, *offload picks up when you're back.*
  Retries when the connection returns.
- A network, no answer: *offload isn't answering*, *It's on our side. Trying again.* Retries on its
  own at 2, 4, 8, then every 15 seconds.
- Both: title 17px semibold `--text-primary`, line 14px `--text-secondary`, a 36px outline
  **Try again** pill 12px under. Not `--text-danger`. Same position as the spinner, 64px under the
  mark, out of the centring flow. The web: the same, alone in the page's centre.

**10. The tabs fade under the keyboard.** Geometry as built. The tab bar's opacity goes from 1 to 0
over the keyboard's first 60pt of rise, driven by the keyboard's own animated height, and back on
the way down. iOS and Android.

**The kits** are redrawn to the app as built (5A); they follow this file, not the other way round.

## Checks

- A day with nothing waiting draws no Needs you and nothing in its place.
- Late to-dos appear in To do and never in Needs you.
- The stepper's back arrow does nothing on Today; the page reopens on Today.
- An event tap opens the calendar app; a to-do row opens its own sheet.
- *+ Today* moves the row into To do, and Undo moves it back.
- Two sheets up dim the page once.
