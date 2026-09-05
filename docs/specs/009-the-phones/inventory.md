# 009 The phones, inventory

> Everything the web has, what each one means for iOS and Android, and where the kit already
> answers it. Written before the spec, because the size of this is the first thing to agree on.

## The headline

**This is not a port.** `apps/mobile` is 2,579 lines and nearly all of it is the gate: welcome,
sign in, waitlist, no invite. `lib/api.ts` exports two functions, `getMe` and
`completeOnboarding`. The Today screen is the day-one screen and its field does not submit.

So everything from 003 onward is web-only: the dump, the stream, threads, content, memories,
widgets. In web terms that is `Thread.tsx` (549), `Composer.tsx` (478), `threads.ts` (363),
`Memories.tsx` (327), `MyThreads.tsx` (253), `widgets.ts` (240), `Widgets.tsx` (207), `dump.ts`
(184) and the shell around them. Roughly 3,400 lines of client, none of which is portable as
written, because React Native is not the DOM and because **the phones are a different design**,
not the same one narrower.

## What the kits actually say, which is more than I expected

Read whole, not grepped: `mobile_app/ThreadsScreen.jsx`, `ThreadScreen.jsx`, `Composer.jsx`,
`LiveConversation.jsx`, the `M3` counterparts, and `M3App.jsx` for the shell.

**The shell is a plate, not a floating bar.** `M3App.jsx:300` builds one raised surface at the
bottom with `--radius-xl` top corners and a shadow, holding, in order: an optional folded
conversation header, the composer, and the tab bar. Three tabs: home (the label changes with
the time of day), **My threads** (`lasso`), **Memories** (`cloudy`).

**A thread screen takes the whole phone.** `showComposer` and `showTabs` in `M3App.jsx:301` are
both false inside a thread, a person, a memory or settings. So there is no tab bar and no
composer on a thread screen, and the way back is a `chevron-left` in the app bar. That is a
direct contradiction of the web rule you set, "the composer should be present on all 3 main
tabs, always", which the kit honours for the three tabs and only for those.

**The live conversation is a sheet that can fold.** `M3App.jsx:284` raises
`LiveConversation variant="sheet"` over the screen with its own composer inside it; folded, it
collapses to a `FoldedHeader` sitting above the main composer. The web has neither. It is the
single largest piece of new interaction in this project.

## The inventory

Each row: what web does, what the kit says for the phones, and what is genuinely undecided.

### Shell and navigation

| | |
| --- | --- |
| **Web** | Two panes side by side, every pane a URL, a crumb bar, a sidebar, and a `from` query deciding one pane or two. |
| **Phones** | No panes at all. Three tabs on a bottom plate; everything else is a full-screen push with a back chevron. iOS pushes at 350ms, Android uses shared-axis-X at 300ms, per the readme. |
| **Undecided** | Nothing. The kit is unambiguous and the pane stack simply does not exist here. |

### The composer

| | |
| --- | --- |
| **Web** | Floats over all three tabs. Turns inline above the field, 👀 for seen, Done for a turn that did something, an eight second Undo toast, a partial turn with Retry, and an SSE stream with a fetch fallback. |
| **Decided** | **A thread screen keeps the composer and loses the tabs.** The kit hides both; dumping from where you are is the product's core move and a thread is the likeliest place to want it. The placeholder is "Add to this", which is the one the kit already passes in the folded state. |
| **Phones** | In the plate above the tab bar. **Plus a great deal the web does not have:** twenty placeholders rotating on a ten second fade (`Composer.jsx:5`), a field that grows to 380px then scrolls, Enter-sends only where there is a physical keyboard (`HAS_KEYBOARD`, so on a phone Return is a newline and the send button is the only submit), `@` mention picking, photo attach chips, and voice recording with a live waveform, a timer and a discard control. |
| **Bubbles** | Yours right, `--blue-50` on a `--blue-100` hairline, asymmetric radius. offload's left, `--ink-50`, `--text-quiet-role` at 16px. The status chip hangs off the bubble's bottom left at `left:-15,bottom:-16`: 👀 on paper, or Done as a filled `--moss-600` pill. offload's replies carry reference chips, thread/time/money, with the thread ones clickable. Three pulsing dots while writing. |
| **Decided** | **The sheet and the fold ship as drawn.** The phones get the kit's model rather than the web's inline one: a conversation you can push aside without losing it is worth more on a small screen than a large one. This is the largest single piece of new interaction in the project and web has no equivalent to check it against. |
| **Decided** | **Attachments are out, and the controls are hidden rather than drawn dead.** Text only, matching 003. A camera and a mic that do nothing are worse on a phone than absent, because a phone is exactly where somebody expects both to work. They return with the spec that builds blobs, upload and transcription. |

### My threads

| | |
| --- | --- |
| **Web** | Rows, delete on hover, an inline confirmation replacing the row, no trailing count, groups for now / always on / older with an expander. |
| **Phones** | **Delete is a swipe**, `SwipeRow`, straight to a toast with no confirmation step (`M3ThreadsScreen.jsx:24`). Same three groups, same "All N older threads" expander, animated on height at 320ms Android and 300ms iOS. App bar carries the wordmark, a bell with an unread badge, and settings. |
| **iOS vs Android** | Genuinely different rows, not a skin. iOS: `ListRow` with a chevron and a 36px tile for the icon. Android: `ARow` with a bare icon slug and its own `withWhom` helper composing "with Ana, Tom" or "just you". |
| **Decided 2026-09-05** | **No trailing count, on any platform.** The kit draws one on both, a people `Badge` on iOS and a content count on Android, and the product owner removed it from the web row for being the same number the meta line already carries. It comes off the phones for the same reason rather than being kept because a mock has it. |
| **Decided** | **Swipe is the vocabulary for row actions everywhere on the phones**, threads and content alike, since the kit already establishes it here. |
| **Decided** | **The swipe goes straight to the toast, with no confirmation, as drawn.** The delete is soft and the toast holds it for eight seconds, and this is the platform convention the gesture comes from. *Recorded with the argument against, which the product owner heard and overruled: a swipe is easier to trigger by accident than a hover-revealed button, and a thread takes everything in it. The web keeps its inline confirmation, so the two clients differ on purpose.* |
| **Decided** | **Meta is composed on the server**, as it is for web. The Android kit recomposes it on the client with its own `withWhom`, and three clients composing one string is exactly how they drift. |

### The thread page

| | |
| --- | --- |
| **Web** | Pane head with title, faces, Share, rename, archived toggle; standing block; widgets; memories; content list with hover tools; archived view. |
| **Phones** | App bar is only back, Share and an `ellipsis` More. **The thread name is an `h1` inside the scroll**, `--text-title-1`, not in the bar. Under it, people chips and a Share chip. Then the standing paragraph, then widgets, then To do as real `Checkbox` rows with label and meta, then "Everything in here" with a `See all` action once there are more than three. |
| **Missing from the kit** | **No memories section**, on any platform. **No content row actions at all**: no edit, archive, delete, move or priority anywhere on the phones. The `ellipsis` is wired to `onMove` in the mock and nothing else. |
| **Decided** | Row actions are **swipe**, matching thread rows, with whatever does not fit a swipe moving into a sheet. |
| **Stale in the kit** | The standing block draws "offload has not summarised this one yet" when there is none. You killed that on web: no summary, nothing drawn. The phones must not reintroduce it. |

### Memories

| | |
| --- | --- |
| **Web** | Thread memories: chips in a section on the thread page, editor opening inside the chip, mute or delete, cap of ten. |
| **Phones** | The kit's `MemoriesScreen` is the **account-scope Memories tab**, which is a different feature and is out of scope on web too. Thread memories have no mobile design, exactly as they had no web design. |
| **Decided** | **Three tabs, and Memories is empty for now, the way Today is.** The tab exists and says there is nothing here yet rather than being hidden and reappearing later. The account-scope feature behind it is unbuilt everywhere. |
| **Undecided** | What the thread-memory chip and its editor become without hover. |

### Widgets

| | |
| --- | --- |
| **Web** | `widgetsFor` earns map, to-do, timeline and files from the content itself; `groupBy` makes headed groups; a preference can reorder them. |
| **Phones** | `ThreadWidgets.jsx` has `MapWidget`, `TimelineWidget`, `FilesWidget` and a `ChipRow`. The logic is already shared and server-shaped, so this is a rendering job, not a thinking one. |
| **Decided** | **Groups, matching web.** One behaviour across three clients, and grouping is what 007 was asked for. The kit's `ChipRow` is the stale half and the design system entry says so. The cost is vertical space on a phone, which is the real argument for the other answer. |
| **Decided** | **`widgets.ts` moves to a shared package.** It is deliberately duplicated between the server and web today; a third hand-synced copy of the rule that decides what a thread looks like is a drift problem with a date on it. |

### Everything else the kit draws that nothing has built

`Sharing.jsx` (share sheet, mention list, pending invite, invite screen), `NotificationSheet.jsx`,
`SettingsScreen.jsx` and `SettingsDetail.jsx`, `PersonScreen.jsx`, `DayAgenda.jsx`,
`TodayScreen.jsx`. None of these exists on web either. They are listed so nobody mistakes them
for parity gaps: they are unbuilt everywhere.

## What the phones need from the API

Every endpoint the web calls, all of which exists:

```
GET    /api/me                          POST /v1/dumps
POST   /api/onboarding/complete         GET  /v1/messages/:id
GET    /v1/threads                      GET  /v1/messages/:id/stream
GET    /v1/threads/:id                  POST /v1/dumps/:id/resume
DELETE /v1/threads/:id                  POST /v1/turns/:id/undo
POST   /v1/threads/:id/restore          GET  /v1/conversations/current
GET    /v1/threads/:id/content          PATCH  /v1/content/:id
PATCH  /v1/threads/:id                  DELETE /v1/content/:id
PATCH  /v1/threads/:id/preference       POST /v1/content/:id/archive | restore
POST   /v1/threads/:id/memories         POST /v1/content/:id/complete
PATCH  /v1/memories/:id                 POST /v1/content/:id/move
DELETE /v1/memories/:id                 POST /v1/content/:id/priority
POST   /v1/memories/:id/mute | restore  GET  /v1/content/:id
```

**No new server work is expected.** Two things to verify rather than assume:

- **SSE on React Native.** `EventSource` is not in the RN runtime. The stream needs a library or
  a polyfill, and `dump.ts` already has the plain-fetch fallback the stream is an optimisation
  over, so the phones can ship on the fallback and gain the stream after.
- **The cookie.** `apps/mobile/lib/api.ts` already solves this well: the Better Auth plugin keeps
  it in secure storage and hands it back, awaited rather than spread. *It also already sets
  `content-type` only when there is a body, which is exactly the rule the web client got wrong
  and shipped two dead deletes on. Extend this file; do not replace it.*
