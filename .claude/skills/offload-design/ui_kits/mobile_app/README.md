# offload, iOS UI kit

A click-through recreation of the offload iOS app, composed from this design system's primitives (`window.OffloadDesignSystem_dc4a89`). Nothing here re-implements a primitive. The Android kit lives at `ui_kits/android_app/` and reads the same `data.js` and `sun.js`, so the two platforms can never drift on content.

**No prior product existed** when this kit was written, there was no codebase, Figma file or screenshot to recreate. These screens are a first-principles proposal built from the brand's stated position (dump everything in one place, offload hides the complexity) and from the tokens in `styles.css`. Treat them as a starting point to react to, not a record of shipped UI.

## Three tabs

| File | Screen | What it shows |
| --- | --- | --- |
| `TodayScreen.jsx` | Today / Tonight | What needs you now: priority rows, what moved without you, the day's agenda, then everything else. The tab renames itself to Tonight with a moon after the real sunset. |
| `ThreadsScreen.jsx` | My threads | One list by last activity, then Not in a thread (`LooseParts.jsx`, shared with Android and web), then older threads with an overflow to the full list. |
| `MemoriesScreen.jsx` | Memories | What offload knows about you as tinted chips by kind, plus past conversations grouped by period. |

## Screens behind them

| File | Screen | What it shows |
| --- | --- | --- |
| `ThreadScreen.jsx` | A thread | A standing blurb, then only the widgets that thread's contents justify: to-dos, a map, a timeline, a file grid. |
| `ThreadWidgets.jsx` | Thread widgets | Map, timeline (Overall and Daily), and the tag-filtered file grid. |
| `PersonScreen.jsx` | A person | Shared threads, what they are waiting on, and what offload knows about them. |
| `MemoriesScreen.jsx` | Memory, conversation, all conversations | A memory with its sources; a conversation you can add to; the full 60-day list. |
| `SettingsScreen.jsx` | Settings | Profile with sign out, search, then ten categories in grouped cards. |
| `SettingsDetail.jsx` | Settings categories | All ten pages, built from four row types: plain, switch, radio group, person. |
| `Sharing.jsx` | Sharing and invitations | The share sheet with search and the new-connection step, the @ picker, the pending strip on My threads, and the invitation screen. |
| `FirstRun.jsx` | Sign in, no invite, the tutorial, connect an app, day one | The gate with Apple then Google, the refusal line, the no-invite screen and its waitlist toast, the three tutorial screens, and the day-one empty states. `ConnectScreen` closes first run: one provider, the mark at 88px, two sentences and Not now. Its copy is placeholder and the provider mark is passed in, never drawn. |
| `NotificationSheet.jsx` | Activity | A sheet that unrolls from under the app bar; read rows grey out on dismiss. |
| `DayAgenda.jsx` | Agenda | Today and tomorrow as a list where free time is a first-class row. |
| `LiveConversation.jsx` | Live conversation | The sheet a typed message opens, its folded header, and the chat turns. |
| `Composer.jsx` | Composer | The one capture affordance: text, photo attachments, voice notes with a live waveform. |
| `Phone.jsx` | Device frame | 390×844 frame and status bar. Cosmetic only. |
| `App.jsx` | Shell | Tab and route state, the push transition, theme, live conversation, notifications, undo. |

## What moves

| What | How |
| --- | --- |
| Opening a screen | A UIKit push: the new screen comes in from the right in 350ms on `cubic-bezier(.32,.72,0,1)` while the screen it left slides 30% left and dims. Back is the mirror, the leaving screen sliding out to the right. The outgoing screen is held for the length of the push, so neither direction slides over a hole |
| Switching tabs | Nothing. Tabs are peers and UIKit cuts between peers |
| Pressing a row | The design system's `ListRow` fills with `--state-press` and clears on release |
| Revealing older threads | Height only, 300ms on the same curve; the rows are always mounted and the box opens |
| Ticking a task | The design system's `Checkbox` draws its tick along its path in 220ms while the label settles in 180ms |
| Deleting a row | Swipe, then the undo toast, unchanged |

Nothing here re-implements a primitive, the tick included: `Checkbox` draws an inline path,
so both phone kits get the same animation from the same component.

## Flows you can click

1. Type into the composer → offload's dots, then an answer with tinted chips. A seen message has no mark: the dots are the state. Ask about money, dates or the bookshelf for a specific reply; an instruction like "delete the dentist reminder" gets a Done mark instead of a sentence.
2. Fold that conversation with the grabber → it becomes a header inside the footer plate. Maximise it → the full conversation page.
3. Swipe any row left → it slides under a red panel and deletes, with an undo toast for eight seconds.
4. Tap the bell → the activity sheet unrolls; dismiss it and the rows go grey.
5. Settings → Appearance → Dark actually re-themes the app.
6. Use the controls above the phone to jump platform, move the clock past sunset, or force a theme. Those are preview affordances, not app UI.

## Deliberately absent

The memory map is stubbed out at your request. Sharing, the invitation and the day-one empty states are in `Sharing.jsx` and `FirstRun.jsx`, both reachable from the preview bar. Auth, first run and the refusal line are in `FirstRun.jsx`, reachable from the `first run` control in the preview bar. The web kit is at `ui_kits/web_app/`, the landing page and email at `ui_kits/marketing_site/`.

## Redrawn to the app as built, 1 October 2026 (decision 5A)

- **Today** is the design in the readme's *Today* section: Needs you, the stepper, the next event, the events strip, To do, If you have time, thread pills, and Customize Today from the sliders in the app bar. Shared by both kits in `mobile_app/TodayParts.jsx`.
- **Rows open the one row sheet** (title, When, Repeats, Labels opening in place, Delete, Cancel, Save), with a grabber. Drawn from Today's rows.
- **Activity** is a pushed screen with no plate, replacing the notification sheet; filled and hollow leads, *Not sent*, Undo.
- **Notifications** replaces Communication in Settings. **Mail** is its own group in Connected apps and opens the Mail page (026).
- **The conversation** rises to 54pt with only a grabber: no title row, no fold. The grabber closes it.
- **First run** gains the Mail step after connect. The `first run` control gains *mail*, *offline* and *no answer*, the last two drawing launch holding on a failure.
- Not drawn in a kit: the drag physics, the page receding and the plate under the keyboard. The readme's behaviour notes and the handoffs are the reference for motion.
