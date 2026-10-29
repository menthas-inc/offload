repo: menthas-inc/offload_app
branch: main
path:

## Last sync

date: 2026-10-29T22:04:46Z

Read `main` (tree `7888d8aba97c`) for My threads and thread icons: `apps/mobile/components/screens/MyThreads.tsx`, `components/ThreadIcon.tsx`, `apps/web/src/components/ThreadIcon.tsx`, `packages/widgets/src/thread-icons.ts`, and the older cut in `apps/core-api/src/routes/threads.ts`. Found: `mixOklch` gives `#1C1B19` a hue (chroma 0.004 over its 1e-4 threshold), so dark mixes drift from the browser's; the new grounds are a table for that reason. Nothing copied.

### Updated in this project

- **My threads as a grid**: `explorations/threads-grid.html`, `threads-grid-final.html`, `threads-grid-approval.html`; `handoff/APPLY-2026-10-29-threads-grid.md`, `handoff/threads-grid-standalone.html`
- `--thread-ground-1` to `-10`, both themes; every thread icon deeper with a white glyph
- `readme.md` **My threads** (new) and **Thread marks**; `decisions.md` one entry

## Sync history

### 2026-10-19T22:13:28Z

date: 2026-10-19T22:13:28Z

Read `main` (trees `019ef168ee75`, then `1a4dc4c91ddd`) for thread layouts: `threads/labels.ts`, `threads/icons.ts`, `routes/threads.ts` (`editThread`, `completeContent`), `routes/tools.ts` (`create_thread`), `today/rows.ts`, `today/threads.ts`, `jobs/handlers.ts`, `prompts/nightly.md`, `EditThreadSheet.tsx`, and before them 043 at merge (Undo in place matches this project), `docs/specs/007-widgets-and-grouping/feature-spec.md`, `migrations/0016_thread_attrs.sql`, `packages/widgets/src/index.ts` and `folds.ts` (sections fold since 2026-10-17, Files folded at first), and `apps/mobile/components/screens/Thread.tsx`. Nothing copied. No spec past 043.

### Updated in this project

- **Thread layouts**, decided: `explorations/thread-skins.html`, `handoff/APPLY-2026-10-19-thread-layouts.md`, `handoff/thread-layouts-standalone.html`
- `components/layout/LayoutTile` (new); `readme.md` **Thread layouts**; `decisions.md` one entry
- Not yet folded: the 2026-10-17 section folds (`folds.ts`) are not drawn in the kits

### 2026-10-18T17:46:29Z

date: 2026-10-18T17:46:29Z

Read `main` for every Undo: `apps/mobile/components/shell/Toast.tsx`, `apps/web/src/components/shell/Toast.tsx`, `apps/mobile/lib/optimistic.ts`, `components/shell/Shell.tsx`, `packages/widgets/src/labels.ts`, and every `toast.show` and `did:` caller on both clients. Nothing copied.

### Updated in this project

- **Undo, in place** (C, amber): `explorations/undo-toast.html`, `explorations/undo-in-place.html`
- `components/feedback/UndoLine` (new), Feedback card; `ui_kits/mobile_app/UndoInPlace.jsx` wired into all three kits
- `handoff/APPLY-2026-10-18-undo-in-place.md`, `handoff/undo-in-place-standalone.html`; `readme.md` **Undo**; `decisions.md` one entry

## Sync history

### 2026-10-11T16:25:02Z

date: 2026-10-11T16:25:02Z

Read `main` (tree `1570ee3`) for 042 Reminders on Today: `docs/specs/042-reminders/at-merge.md`, `apps/mobile/components/today/TodayScreen.tsx`, `apps/web/src/components/today/Reminders.tsx`. Nothing copied.

### Updated in this project

- **Today: Reminders (C2b) and bands**: `explorations/home-reminders.html`, `explorations/today-sections.html`, `explorations/today-bands.html`
- `ui_kits/mobile_app/TodayReminders.jsx` (shared by all three kits), bands in `TodayParts.jsx` and `WToday.jsx`
- `handoff/APPLY-2026-10-11-today-bands.md`, `handoff/today-bands-standalone.html`; `readme.md` **Today** and 042's four readme lines; `decisions.md` one entry

### 2026-10-07T23:06:00Z

date: 2026-10-07T23:06:00Z

Read `main` (tree `fb195f4`; 18 commits past `60d4e15`, none touching tokens) for the dark theme: `packages/tokens/src/generate.mjs`
and `index.ts`, `apps/mobile/lib/colors.ts`, `DateChip.tsx`, `Segmented.tsx`, the web's `ThreadIcon`, `Chip`, `DateChip`,
`switch.module.css`, `avatar.module.css`, `memories.module.css`, `auth.module.css`, and every `--surface-fill` and tint use on both
clients. Nothing copied.

### Updated in this project

- **Dark theme, edges** (option B): `tokens/colors.css` dark scope and six `--edge-*` tokens, Android kit's dark scope
- `Chip`, `Badge`, `SegmentedControl` paint their edges; `readme.md` **Edges**; `decisions.md` one entry
- `explorations/dark-contrast.html` (twelve screens, four options), `handoff/APPLY-2026-10-07-dark-contrast.md`, `handoff/dark-contrast-standalone.html`

## Sync history

### 2026-10-07T17:09:24Z

date: 2026-10-07T17:09:24Z

Pulled `main` at `60d4e15`: 78 commits past `963d7a25aab7`. The design-system copy on main was at the
4 October sync. Merged: **`decisions.md` adopted from the repository** (it adds fourteen code entries of 4 to 6
October: review codes, loose to-dos, consent ticks, Connected apps, the landing as built, Disconnect, Privacy,
reading someone else's note, the gate, Storage (036), Thread icons as built (037), the 034 answers, one line per
day, memories coming back, and CSV downloads), with this project's two newer entries prepended. **`readme.md`
adopted from the repository** (its First run section is the build's) with this project's Memories and thinking
row sections put back. Tokens matched. Read `Conversation.tsx` for `Working` and `Writing`.

#### Updated in this project

- **The thinking row**: Splash and a Stop pill; `handoff/APPLY-2026-10-07-thinking.md`, `ui_kits/thinking_row/`, `handoff/thinking-standalone.html`
- `decisions.md` and `readme.md` current with `main`, plus the Memories and thinking row entries

### 2026-10-06T20:18:10Z

date: 2026-10-06T20:18:10Z

Read `main` (066aca5fcb2b tree) for 038 memories: `docs/specs/038-memories/feature-spec.md`, `prompts/memory.md`,
`core-api/src/memories/store.ts`, `migrations/0085_memories.sql`, the phones' tabs, `Notes.tsx`, `MyThreads.tsx`,
`ThreadRow.tsx`, `Segmented.tsx`, `Plate.tsx` and web `Sidebar.tsx`. Nothing copied.

### Updated in this project

- **Memories tab**: decided, List | Map; `handoff/APPLY-2026-10-06-memories.md`, `ui_kits/memories_tab/`, `handoff/memories-standalone.html`
- `readme.md` gains **The Memories tab** and the *memory* vocabulary row; `decisions.md` entry 2026-10-06

### 2026-10-04T14:22:22Z

date: 2026-10-04T14:22:22Z

Read `main` for the landing page: `apps/web/src/app/(marketing)/page.tsx`, `page.module.css`, `components/Screen.tsx`,
`screen.module.css`, `Atmosphere.tsx`, `atmosphere.module.css`, `Logo.tsx`, and the privacy page's calendar lines. No
files were taken from the repository in this pass.

### Updated in this project

- **Landing page, one scroll (direction C)**: `explorations/landing-scroll.html`, `handoff/APPLY-2026-10-04-landing.md`, `handoff/landing-standalone.html`
- `ui_kits/marketing_site/` rebuilt with `landing.js` and `landing.css`
- `readme.md` gains **The landing page**; `decisions.md` gains one entry

## Sync history

### 2026-10-03T20:48:00Z

date: 2026-10-03T20:48:00Z
commit: 963d7a25aab7

Pulled `main` for the coder's 034 asks: `.claude/skills/offload-design/decisions.md` (taken whole, as the
shared log, with this project's thread marks entry kept), and read `apps/web/src/app/(admin)/` (`layout.tsx`,
`ui/nav.ts`, `ui/chrome.tsx`, `ui/table.tsx`, `ui/plot.tsx`, `admin.module.css`).

### Updated in this project

- **Admin kit redrawn as built in 034**: `ui_kits/admin_web/`, with `APeople.jsx` and `AOps.jsx` new
- Tokens `--surface-danger`, `--surface-danger-hover`, `--plot-height`
- `explorations/coder-asks-034.html`, `handoff/APPLY-2026-10-03-admin-034.md`
- Thread marks handoff renames the component `ThreadIcon`, clear of the phones' avatar marks

## Screen map

| Screen | This project | Repo files |
| --- | --- | --- |
| My threads grid | `explorations/threads-grid-approval.html`, `handoff/APPLY-2026-10-29-threads-grid.md` | `apps/mobile/components/screens/MyThreads.tsx`, `shell/ThreadRow.tsx`, `apps/web/src/components/panes/MyThreads.tsx`, `apps/core-api/src/routes/threads.ts` |
| Thread layouts | `explorations/thread-skins.html`, `handoff/APPLY-2026-10-19-thread-layouts.md`, `components/layout/LayoutTile` | `apps/mobile/components/screens/Thread.tsx`, `packages/widgets/src/index.ts`, `folds.ts`, `apps/core-api/migrations/0016_thread_attrs.sql`, `threads/labels.ts`, `routes/threads.ts`, `routes/tools.ts`, `today/rows.ts`, `prompts/nightly.md`, `prompts/plan_v2.md`, `EditThreadSheet.tsx`, `panes/EditThread.tsx` |
| Undo, in place (every list) | `components/feedback/UndoLine.jsx`, `ui_kits/mobile_app/UndoInPlace.jsx`, `explorations/undo-in-place.html` | `apps/mobile/lib/optimistic.ts`, `apps/mobile/components/shell/Toast.tsx`, `apps/web/src/components/shell/Toast.tsx` |
| Web app | `ui_kits/web_app/` | `apps/web/src/` |
| iOS and Android | `ui_kits/mobile_app/`, `ui_kits/android_app/` | `apps/mobile/app/`, `apps/mobile/components/` |
| Calendars | `explorations/calendars-options.html`, `handoff/APPLY-2026-09-17-calendars.md` | settings: the Connected apps Calendar row on all three surfaces; thread: `ThreadScreen.jsx`, `M3ThreadScreen.jsx`, `WThing.jsx` app bars |
| Timeline rail | `explorations/rail-blue.html`, `handoff/APPLY-2026-09-14-rail.md` | `apps/web/src/app/(shell)/shell.module.css`, `apps/web/src/components/panes/Timeline.tsx`, `apps/mobile/components/shell/Timeline.tsx` |
| Voice notes | `explorations/voice-notes.html`, `handoff/APPLY-2026-09-21-voice.md` | `apps/mobile/components/shell/Composer.tsx`, `apps/mobile/components/shell/SentVoice.tsx`, `apps/web/src/components/shell/` |
| People and connecting | `explorations/sharing-and-avatars.html`, `handoff/APPLY-2026-09-21-people.md` | `apps/mobile/components/settings/`, `apps/mobile/components/shell/Sharing.tsx`, `apps/web/src/components/panes/` |
| Reaching the web | `components/conversation/`, the kits' conversation files, `explorations/reaching-the-web-options.html` | `docs/specs/016-reaching-the-web/`, `docs/specs/017-saying-what-it-is-doing/`, `apps/mobile/components/shell/Conversation.tsx` |
| Answering | `components/answering/`, the kits' conversation files, `explorations/answering-options.html` | `apps/core-api/src/search/`, `apps/agent/src/offload_agent/`, `docs/specs/013-answering/` |
| Immersive conversation | `explorations/immersive-conversation.html`, `explorations/immersive-conversation-decisions.html`, `handoff/APPLY-2026-09-29-conversation-sheet.md` | `apps/mobile/components/shell/Conversation.tsx`, `Plate.tsx`, `Shell.tsx`, `RowEditSheet.tsx`, `labels/LabelSheet.tsx`, `lib/motion.ts` |
| Today | `explorations/today.html`, `explorations/today-bands.html`, `handoff/APPLY-2026-10-01-today.md`, `handoff/APPLY-2026-10-11-today-bands.md` | `apps/mobile/components/today/TodayScreen.tsx`, `apps/web/src/components/panes/Today.tsx`, `apps/web/src/components/today/Reminders.tsx`, `TodayAgenda.tsx` |
| Labels | `explorations/labels.html`, `handoff/APPLY-2026-09-26-labels.md`, `components/core/LabelMark*`, `Chip` | `apps/mobile/components/shell/ContentRow.tsx`, `apps/web/src/components/panes/ContentRowView.tsx`, `apps/mobile/components/screens/Thread.tsx`, `apps/web/src/components/panes/Thread.tsx`, `TodayAgenda.tsx`, `Activity.tsx`, `Composer.tsx` |
| Dates and notifications | `explorations/due-dates-and-notifications.html`, `handoff/APPLY-2026-09-22-dates.md` | `DateChip.tsx`, `WhenSheet.tsx`, `CustomRepeatSheet.tsx`, `ZoneStrip.tsx`, `Activity.tsx`, `NotificationsPage.tsx`, `packages/widgets/src/rrule.ts` |
| A thread's map | `explorations/maps.html`, `handoff/APPLY-2026-10-02-maps.md` | `apps/mobile/components/screens/Thread.tsx`, `apps/mobile/components/shell/Widgets.tsx`, `apps/web/src/components/panes/Thread.tsx`, `apps/web/src/components/panes/Widgets.tsx`, `packages/widgets/src/index.ts`, `apps/core-api/src/places/resolve.ts`, `apps/agent/src/offload_agent/og.py` |
| Things without a thread | `explorations/loose-items.html`, `handoff/APPLY-2026-10-01-loose.md`, `ui_kits/mobile_app/LooseParts.jsx` | `apps/mobile/components/screens/MyThreads.tsx`, `shell/ThreadRow.tsx`, `apps/web/src/components/panes/MyThreads.tsx`, `apps/core-api/src/admin/promote.ts`, `apps/agent/src/offload_agent/harness/plan.py` |
| Admin panel | `ui_kits/admin_web/` | `apps/web/src/app/(admin)/layout.tsx`, `ui/nav.ts`, `ui/chrome.tsx`, `ui/table.tsx`, `ui/plot.tsx`, `admin.module.css` |
| Thread marks | `explorations/thread-marks-v2.html`, `handoff/APPLY-2026-10-03-thread-marks.md` | `apps/mobile/components/screens/Thread.tsx`, `MyThreads.tsx`, `apps/mobile/components/Glyph.tsx`, `apps/web/src/components/panes/Thread.tsx`, `MyThreads.tsx`, `ContentRowView.tsx` |
| First run | `explorations/onboarding-v2.html`, `handoff/APPLY-2026-10-03-onboarding.md` | `apps/mobile/components/screens/Welcome.ios.tsx`, `Welcome.android.tsx`, `apps/mobile/lib/gate.ts`, `apps/mobile/components/TutorialArt.tsx`, `ConsentTicks.tsx`, `ConnectStep.tsx`, `GateBackdrop.tsx`, `apps/web/src/components/FirstRun.tsx` |
| Settings | `explorations/settings-v2.html`, `handoff/APPLY-2026-10-02-settings.md` | `apps/mobile/app/settings/`, `apps/mobile/components/settings/`, `apps/mobile/components/people/PeoplePage.tsx`, `apps/mobile/lib/sessions.ts`, `apps/web/src/components/panes/Settings.tsx`, `SettingsRows.tsx`, `Account.tsx`, `DateTime.tsx`, `Appearance.tsx` |
| Admin panel | `ui_kits/admin_web/` | `apps/web/src/app/(admin)/` |
| Thinking row | `ui_kits/thinking_row/`, `explorations/thinking-drop.html`, `handoff/APPLY-2026-10-07-thinking.md` | `apps/mobile/components/shell/Conversation.tsx` (`Working`, `Writing`), the web conversation |
| Memories tab | `ui_kits/memories_tab/`, `handoff/APPLY-2026-10-06-memories.md` | `apps/mobile/components/screens/Notes.tsx`, `(tabs)/_layout.tsx`, `apps/web/src/components/shell/Sidebar.tsx`, `apps/core-api/src/memories/` |
| Landing page, invite email | `ui_kits/marketing_site/`, `explorations/landing-scroll.html`, `handoff/APPLY-2026-10-04-landing.md` | `apps/web/src/app/(marketing)/`, `apps/web/src/components/Screen.tsx`, `Atmosphere.tsx` |
| Dark theme, edges | `explorations/dark-contrast.html`, `handoff/APPLY-2026-10-07-dark-contrast.md` | `packages/tokens/src/generate.mjs` (via `pnpm tokens`), `apps/mobile/lib/colors.ts`, every `--surface-fill` and tint box on both clients |
| Design tokens | `styles.css`, `tokens/` | `packages/tokens/`, generated from `.claude/skills/offload-design/tokens` |
| Components | `components/` | `packages/widgets/`, `apps/mobile/components/` |
| Decision log | `decisions.md` | `.claude/skills/offload-design/decisions.md` (shared, append-only both ways) |
| Adherence lint | `_adherence.oxlintrc.json` | `eslint.config.mjs`, read at run time |
| Atmosphere tokens | not carried, the marketing site's | `packages/tokens/atmosphere.css` (keep from the repository) |

## Sync history

### 2026-10-03T08:57:42Z

date: 2026-10-03T08:57:42Z

Read `main` for thread marks: `apps/mobile/components/screens/Thread.tsx` in full (its `Bar` and the tools it
carries), `MyThreads.tsx`, the web's `panes/Thread.tsx` head and `ContentRowView.tsx`'s `ThreadPill`, and
confirmed Skia in the app. No files were taken from the repository in this pass.

### Updated in this project

- **Thread marks**: `explorations/thread-marks-v2.html` (first round `thread-marks.html`), `handoff/APPLY-2026-10-03-thread-marks.md`, `handoff/thread-marks-standalone.html`
- Lucide glyph on a one-hue prism wash per thread; Edit thread joins rename, icon and colour
- 59 Lucide glyphs vendored, 154 in all; `readme.md` gains **Thread marks**; `decisions.md` gains one entry

### 2026-10-03T08:01:09Z

date: 2026-10-03T08:01:09Z

Read `main` for first run: `Welcome.ios.tsx`, `Welcome.android.tsx`, `lib/gate.ts`, `TutorialArt.tsx`,
`ConsentTicks.tsx`, `ConnectStep.tsx`, `GateBackdrop.tsx`, `tutorial.tsx`, the web's `FirstRun.tsx` and
the onboarding test and event schema. No files were taken from the repository in this pass.

### Updated in this project

- **Onboarding**: `explorations/onboarding-v2.html` (first round `onboarding.html`), `handoff/APPLY-2026-10-03-onboarding.md`, `handoff/onboarding-standalone.html`
- Three screens: animated intro, Before you start, Bring things in; Skip beside the main button
- `readme.md` gains **First run**; `decisions.md` gains one entry

### 2026-10-02T13:40:00Z

date: 2026-10-02T13:40:00Z

Read `main` for the settings work: every settings page on both clients, `PeoplePage.tsx`,
`NotificationsPage.tsx`, `Rows.tsx`, `sessions.ts`, `people.ts` and the web panes. No files were
taken from the repository in this pass. Found while reading: Signed in on draws *Nothing else* when
its read fails, and the web's Country and Time zone are native selects with no dark scheme.

### Updated in this project

- **Settings, tightened**: `explorations/settings-v2.html` (and the first round, `settings.html`), `handoff/APPLY-2026-10-02-settings.md` and `handoff/settings-standalone.html`
- Direction B section headings and preview tiles on all three; Connected apps as cards with Mail always shown; Connect with someone; See the tutorial again
- Eight Lucide glyphs vendored, 95 in all
- `readme.md` gains **Settings**; `decisions.md` gains one entry

### 2026-10-01T23:30:00Z

date: 2026-10-01T23:30:00Z

Pulled `main`, read at `78e6836114c1`: 51 commits past `e30feeea473c`, with 028 Not in a thread
built. The design-system files on main matched this project except the shared log, which was adopted
whole (it adds *Not in a thread as built (028)* and *Whose an event is*) before this entry was
prepended. Two of 028's asks are folded into the readme: no *Saved.* reply, and the faces. The kit
changes 028 lists for `LooseParts.jsx` are not made in this pass.

### Updated in this project

- **A thread's map**: `explorations/maps.html`, `handoff/APPLY-2026-10-02-maps.md` and its standalone copy
- List | Map switch on phones and narrow web, a 460px map column on wide web; Places section retired
- MapLibre with MapTiler Streets; place lookup moves to MapTiler Geocoding
- `readme.md` gains **A thread's map**; `decisions.md` gains one entry

### 2026-10-01T19:05:00Z

Pulled `main`, read at `e30feeea473c`: 63 commits past `70a5fa4`, with 027 Today and 026 Mail in
built. The shared log was adopted from the repository whole (it held every entry of ours, plus
*Today as built* and *Text on a fixed fill is on-solid*), then this project's new entry prepended.
The design impacts of those two code entries are not folded into the readme in this pass.

### Updated in this project

- **Things without a thread**: `explorations/loose-items.html`, `handoff/APPLY-2026-10-01-loose.md` and its standalone copy
- Always on retired; the default thread is storage, drawn as the *Not in a thread* group with row suggestions
- `ui_kits/mobile_app/LooseParts.jsx` shared by the iOS, Android and web kits; `OFFLOAD_DATA.loose`
- `readme.md` gains **Not in a thread**; `decisions.md` gains one entry

### 2026-09-30T21:05:00Z

Pulled `main`: 26 commits past `70a5fa4`. The immersive conversation is built (PR #31), 026 Mail in
is specced, and launch holds on a failure. The two new code log entries are adopted; their asks were
decided with the owner and folded in, see the table in `handoff/APPLY-2026-10-01-today.md`.

### Updated in this project

- Launch L3 and tabs fading under the keyboard (K2), folded into the readme and the Today handoff
- Both mobile kits redrawn to the app as built (5A), `ui_kits/mobile_app/TodayParts.jsx` shared

- **Today**: `explorations/today.html`, the readme section, `handoff/APPLY-2026-10-01-today.md` and its standalone copy
- `sliders-horizontal` and `mail` glyphs (87); `--spring-sheet-*`; `--surface-scrim` 0.35
- `Sheet.prompt.md` and the readme's conversation notes brought to the build

### 2026-09-30T09:00:00Z

`main` unchanged at `70a5fa4` since the last sync. Folded the immersive conversation decisions.

### Updated in this project

- `handoff/APPLY-2026-09-29-conversation-sheet.md`: ready to build, nothing open; every sheet on one drag; Android dims only
- `explorations/immersive-conversation.html` with an iOS and Android switch, and its standalone copy
- `readme.md` behaviour notes and the decisions log entry of 30 September

### 2026-09-29T20:55:00Z

Pulled `main` at `70a5fa4` (38 commits since `089949d`, 025 labels built on all three surfaces).
The shared log was adopted from the repository; twelve code entries of 26 to 29 September were
folded into the readme and contracts.

### Updated in this project

- `readme.md`: The row and its sheet; Labels rewritten to what shipped; the month timeline
- Contracts: `LabelMark` size 30, `Chip`, `AppBar`, `Sheet`, `RowActionSheet`
- `explorations/immersive-conversation.html` redrawn over the app as built, and its decisions file
- `handoff/APPLY-2026-09-29-conversation-sheet.md`, pending six calls

### 2026-09-26T16:52:00Z

Pulled `main` from `b494d0e`: 98 commits, with 023 dates and 024 notifications both shipped on all
three surfaces, and a 26 September entry moving the date chip to its own line. **The shared log was
behind by 47 entries** and has been adopted from the repository whole, since it already held every
one of ours. `tokens/colors.css` and `readme.md` were taken from the repository too (the two soft
grounds, and an em dash pass), then amended here.

**Every open design impact from the four newest code entries is closed before the labels handoff**,
so both sides start from one state: see the table at the foot of `handoff/APPLY-2026-09-26-labels.md`.
Code wins where the entries offered a choice. The kit screens are not redrawn; the readme says what
the code does.

### Updated in this project

- **Labels**: `LabelMark`, `Chip label`, the `tag` glyph (85), ten `--label-N` tokens and
  `--surface-accent` (366 tokens), a readme section, and `explorations/labels.html`
- `tokens/fonts.css` self-hosts the web app's five static faces from `assets/fonts/`
- `readme.md` Dates and notifications brought to the code as built; two log entries
- `handoff/APPLY-2026-09-26-labels.md` and `handoff/labels-standalone.html`

### What the coding agent should pick up, in order

1. **The schema** (item 1): `labels`, the two join tables, and the person-set stamp and tombstone.
   Everything else, including offload's rule never to undo a person, reads that stamp.
2. **The write path** (item 2), with the one-write list and its Undo.
3. **The marks line** (item 3): the date chip and labels share the line 26 September gave the chip.
4. Sheets, filter bar, the outside-the-thread surfaces, then the composer, the model tools and
   compaction, and last Activity's row.

### 2026-09-22T10:41:00Z

Pulled `main` ahead of the dates and notifications work and read the feature from the code rather
than from the kit. **Nothing was owed back this time**: 021 and 022 are both applied here already,
and the sync was reconnaissance for a feature that has not been specced yet.

**The finding that shaped the design: the schema has carried dates since 001 and no person has ever
been able to write one.** `content` and `notes` both hold `due_at`, `occurs_at`, `occurs_end_at`,
`repeats` and `repeats_until`; `content` also holds `is_reminder`, whose own comment reads
*nothing acts on it until notifications ship*. Every writer is the model — `add_content`,
`add_note`, `edit_content` and 018's asking-back question. **There is no field, no picker, no
gesture and no way to clear a date on any of the three surfaces**, and the thread's own content row
draws no date at all.

**Two holes the feature cannot be built over.** `accounts` carries no timezone, which `dates.ts`
names as one of the two places that change when it does; and a bare day is filed at noon UTC, which
is right from UTC-11 to UTC+11 and wrong in New Zealand. Notifications need an hour, so both had to
be answered first.

**Notifications were scaffolding only**: `expo-notifications` installed, permission asked on the
third onboarding screen, a bell on Today that goes nowhere, and no token table, send path or job
kind. The jobs table already does scheduled and daily work, so the machinery exists.

### Updated in this project

- `explorations/due-dates-and-notifications.html`, fourteen decisions across ten sections, drawn at
  real size on all three surfaces
- `handoff/APPLY-2026-09-22-dates.md`, per item and per surface, with the build order
- `readme.md` gains a **Dates and notifications** section; `decisions.md` gains one entry
- **No new components, glyphs or tokens.** The set stays at 84 glyphs and 349 tokens

### What the coding agent should pick up, in order

1. **The RRULE migration.** `repeats` is a six-value enum that holds four of the seven presets the
   picker needs and none of Custom: no interval, no weekday set, no monthly anchor, no occurrence
   count. One RFC 5545 column replaces it and `repeats_until`, the six values map in losslessly, and
   **019's connector stops translating**, since it is what Google speaks. Everything else waits on it.
2. **`accounts.time_zone`, `last_seen_time_zone`, `follow_device`.** Every scheduled thing is wrong
   without the first, and `dates.ts` and the prompt's *today* are the two readers it already names.
3. **The content row draws its date**, coloured late / soon / later at a boundary of today plus
   three days. Smallest item in the handoff and the prerequisite for the sheets and for Activity.
4. **The person-facing write path**, taking title, body, three dates and the rule in one write, with
   an explicit clear. Null through the tool layer means "not stated", not "remove it".
5. **The digests**, gated on `is_reminder`. That flag now decides what is announced, which makes the
   filing prompt's decision to set it load bearing and worth a principle and eval cases.
6. **Activity**, the largest new thing and the only one with no existing shape: each silent outcome
   needs a writer at the point the silence happens, not a reconstruction afterwards.

### 2026-09-21T16:20:00Z

Pulled `main` and read 021's feature spec, which logs **eleven items against this system**. All
eleven drawn in `explorations/voice-notes.html`, decided with the product owner, and folded in.

**A voice note is words.** Once offload has written it down the message is a text message to every
reader, so the feature adds a composer state, a bubble and a transcript, and no new screen.

**Three of the eleven were the kit being wrong rather than behind:** typed words hidden while being
sent, which is text you cannot see being sent; `SentVoice`'s bars on an opacity ramp over a retyped
ramp step, with a 26-bar sine fallback where the composer says 32; and a discard control using the
one noun the vocabulary bans.

**One new component, `SentVoice`. Two new glyphs, `play` and `pause`, the 83rd and 84th.** No new
tokens.

**Two decisions came out of the drawing**, both on the played state. The glyph became the control,
`play` at rest and `pause` while playing. And the prominent played colour needed its opposite:
`--text-attention` measures **1.21:1 against a tertiary remainder**, so the remainder recedes to
`--ink-300` **only while playing**, and a resting row keeps `--text-tertiary` at 4.76:1.

**One thing the spec lists as needing a device that does not:** the dark transcript contrast, 7.65:1,
with "Show all" at 5.72:1 on the same bubble.

### Updated in this project

- `SentVoice` in `components/conversation/` — 32 stored bars, the play/pause control, the played
  fill, the transcript and its fold, and the playback failure
- `play` and `pause` vendored in Lucide's stroke format; 84 glyphs
- `readme.md` gains a **Voice notes** section; `decisions.md` gains one entry
- `handoff/APPLY-2026-09-21-voice.md`, all eleven items per surface and per theme

### What the coding agent should pick up, in order

1. `handoff/APPLY-2026-09-21-voice.md`, items 1 to 3. They are corrections to shipped kit code, and
   item 1 is the one that matters most: the composer currently sends words it has hidden.
2. Item 2's table, which is the component's contract. **The 1.21:1 figure is the reason the played
   colour is not ink**, and the rest/playing split is the reason a resting row is not dimmed.
3. Item 10, Android. **The pill and the sent bubble are shared**, and the two things that genuinely
   diverge are the platform's own status bar and gesture bar.
4. Item 11, the web, which is the largest: `WComposer` and `WTurns` gain the row and `SentVoice`.

### 2026-09-21T06:05:00Z

Folded in the eight owed screens, then connecting and the prism avatar: `Avatar`,
`--surface-viewer`, `arrow-up-right`, and readme sections for the launch screen, the photo viewer,
the move sheet, people and the prism.

### 2026-09-21T04:20:00Z

Folded in `--surface-viewer`, `arrow-up-right`, `ListRow`'s `body`, and readme sections for the
launch screen, the photo viewer and the move sheet.

### 2026-09-21T00:40:00Z

Folded in the twelve entries from `FROM-CODE-2026-09-21.md`: `Toast`'s failure form, `ListRow`'s
`body` and centring, `AppBar`'s three tools, and the withdrawal of the declining second line.

### 2026-09-18T00:00:00Z

Drew and folded in the calendars work: the settings page, the thread sheet, and the web pane head's
tool budget amended from two to three with a stated criterion.

### 2026-09-16T22:15:00Z

Nine items from 018 and the reorder work, drawn at real size and decided item by item: the raised
value chip with an `x` on the way out, five options in a named group, a reply bubble for a question
on a silent turn, the drop line at full width, and a second line under each of the two declining
lines. 👀 went, with it the product's last emoji.

### 2026-09-14T23:05:00Z

Folded in 016's turn footer, source chip, switch notes and voice change, and decided 015's rail:
the paper lift for a day with content and `--border-decision` for a day carrying an answer, with
blue keeping today and the day being read. Three colour aliases minted. Two claims this project had
asserted were corrected by measuring rather than reasoning.

### 2026-09-14T21:40:00Z

Folded the 016 designs in after the product owner picked through them: the turn footer on offload's
side of the turn, the outline source chip, the recipient-naming switch notes, and a voice rule that
was neither option the brief offered. Found and fixed a live bug while wiring: Android's
`M3LiveConversation.jsx` referenced `AnswerResult` and `QuickReplies` without destructuring them
off the bundle, so the sheet threw on any turn with an answer.

### 2026-09-14T21:04:00Z

Pulled 77 commits. 013 answering shipped on both clients; 014 notes and 015 the timeline landed
without design seeing either. The shared log needed a real merge rather than an adopt: the
repository had twelve entries this project lacked and was missing eight of ours. Merged to 95
entries. The repository's `readme.md` and `tokens/colors.css` are both behind this project's, so
the Answering section, `PrismField` in the index, `--clay-200` and `--border-danger` were restored
here rather than adopted; `--surface-noticed` was taken from them.

### 2026-09-09T21:05:00Z

Read branch `013-answering` at the product owner's request and ran code to design: the server was built and no
client existed. Produced `AnswerResult`, `QuickReplies`, the Answering section of the readme and six log
entries, plus `handoff/APPLY-2026-09-09-answering.md`. `ROWS_SHOWN` settled at 5 on the phones and 8 on web.

### 2026-09-08T03:30:05Z

Six entries appended to the shared log since 5 September, all from the code. The log was re-pulled and
adopted whole: the repository's copy already contained all 56 of ours, so 62 entries with nothing to
merge by hand. Five of the six carry a design system impact and all five are applied.

The one thing left open is a decision rather than a task. `--border-focus` resolves to `--blue-500` and
nothing uses it: every field on the web draws `--ink-950` instead, in four separate places, each
individually consistent with the field beside it. Either the token becomes ink or the app moves to blue
focus everywhere. Until it is answered every new field re-bakes the value, which is how a ramp
reference spreads.

- Adopted the shared log at 62 entries and applied five design impacts
- Added `--border-danger` to all three token scopes, the clay counterpart `--text-danger` was standing in for
- Settings' My account lost Phone, Password and the Plan group (OAuth-only, no plans), the identity
  subtitle lost "· free plan", and Name gained `EditableRow`, its in-place editing state
- Theme is a `SegmentedControl` with three values on the phones too, and text size is web-only
- `readme.md`: a row carries edit and exactly one way out, and a preference read is not a resolved-scheme read

### 2026-09-05T19:17:22Z

Second pass on the same day, because the repository moved while the first one was in progress. Three
entries had been appended since the morning copy, so `decisions.md` was re-pulled and merged rather
than overwritten. Carried back the repository's three entries: `SwipeRow` drives its reveal's opacity
from its offset, and the plate's two states and the conversation's exit went into `readme.md`.

### 2026-09-05T17:47:00Z

First sync against real code. Repository had gone from empty to a pnpm monorepo with the design system
committed at `.claude/skills/offload-design/`. Pulled the shared log's eleven days of entries, added
`Chip.disabled`, removed the retired `variant="soft"`, added `--type-scale` and `--breakpoint-*`,
specified the change mark, documented `SwipeRow` as delete-only, and corrected the retention line.

### 2026-08-27T00:22:05.147Z

Repository empty, no commits on `main`. Recorded the association and the intended screen map so the
first real sync had something to diff against.
