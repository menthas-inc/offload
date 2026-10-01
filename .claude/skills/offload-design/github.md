repo: menthas-inc/offload_app
branch: main
path:

## Last sync

date: 2026-09-30T21:05:00Z

Pulled `main`: 26 commits past `70a5fa4`. The immersive conversation is built (PR #31), 026 Mail in
is specced, and launch holds on a failure. The two new code log entries are adopted; their asks were
decided with the owner and folded in, see the table in `handoff/APPLY-2026-10-01-today.md`.

### Updated in this project

- Launch L3 and tabs fading under the keyboard (K2), folded into the readme and the Today handoff
- Both mobile kits redrawn to the app as built (5A), `ui_kits/mobile_app/TodayParts.jsx` shared

- **Today**: `explorations/today.html`, the readme section, `handoff/APPLY-2026-10-01-today.md` and its standalone copy
- `sliders-horizontal` and `mail` glyphs (87); `--spring-sheet-*`; `--surface-scrim` 0.35
- `Sheet.prompt.md` and the readme's conversation notes brought to the build

## Screen map

| Screen | This project | Repo files |
| --- | --- | --- |
| Web app | `ui_kits/web_app/` | `apps/web/src/` |
| iOS and Android | `ui_kits/mobile_app/`, `ui_kits/android_app/` | `apps/mobile/app/`, `apps/mobile/components/` |
| Calendars | `explorations/calendars-options.html`, `handoff/APPLY-2026-09-17-calendars.md` | settings: the Connected apps Calendar row on all three surfaces; thread: `ThreadScreen.jsx`, `M3ThreadScreen.jsx`, `WThing.jsx` app bars |
| Timeline rail | `explorations/rail-blue.html`, `handoff/APPLY-2026-09-14-rail.md` | `apps/web/src/app/(shell)/shell.module.css`, `apps/web/src/components/panes/Timeline.tsx`, `apps/mobile/components/shell/Timeline.tsx` |
| Voice notes | `explorations/voice-notes.html`, `handoff/APPLY-2026-09-21-voice.md` | `apps/mobile/components/shell/Composer.tsx`, `apps/mobile/components/shell/SentVoice.tsx`, `apps/web/src/components/shell/` |
| People and connecting | `explorations/sharing-and-avatars.html`, `handoff/APPLY-2026-09-21-people.md` | `apps/mobile/components/settings/`, `apps/mobile/components/shell/Sharing.tsx`, `apps/web/src/components/panes/` |
| Reaching the web | `components/conversation/`, the kits' conversation files, `explorations/reaching-the-web-options.html` | `docs/specs/016-reaching-the-web/`, `docs/specs/017-saying-what-it-is-doing/`, `apps/mobile/components/shell/Conversation.tsx` |
| Answering | `components/answering/`, the kits' conversation files, `explorations/answering-options.html` | `apps/core-api/src/search/`, `apps/agent/src/offload_agent/`, `docs/specs/013-answering/` |
| Immersive conversation | `explorations/immersive-conversation.html`, `explorations/immersive-conversation-decisions.html`, `handoff/APPLY-2026-09-29-conversation-sheet.md` | `apps/mobile/components/shell/Conversation.tsx`, `Plate.tsx`, `Shell.tsx`, `RowEditSheet.tsx`, `labels/LabelSheet.tsx`, `lib/motion.ts` |
| Today | `explorations/today.html`, `handoff/APPLY-2026-10-01-today.md` | `apps/mobile/components/screens/Today.tsx`, `apps/web/src/components/panes/Today.tsx`, `TodayAgenda.tsx` |
| Labels | `explorations/labels.html`, `handoff/APPLY-2026-09-26-labels.md`, `components/core/LabelMark*`, `Chip` | `apps/mobile/components/shell/ContentRow.tsx`, `apps/web/src/components/panes/ContentRowView.tsx`, `apps/mobile/components/screens/Thread.tsx`, `apps/web/src/components/panes/Thread.tsx`, `TodayAgenda.tsx`, `Activity.tsx`, `Composer.tsx` |
| Dates and notifications | `explorations/due-dates-and-notifications.html`, `handoff/APPLY-2026-09-22-dates.md` | `DateChip.tsx`, `WhenSheet.tsx`, `CustomRepeatSheet.tsx`, `ZoneStrip.tsx`, `Activity.tsx`, `NotificationsPage.tsx`, `packages/widgets/src/rrule.ts` |
| Admin panel | `ui_kits/admin_web/` | `apps/web/src/app/(admin)/` |
| Landing page, invite email | `ui_kits/marketing_site/` | `apps/web/src/app/(marketing)/` |
| Design tokens | `styles.css`, `tokens/` | `packages/tokens/`, generated from `.claude/skills/offload-design/tokens` |
| Components | `components/` | `packages/widgets/`, `apps/mobile/components/` |
| Decision log | `decisions.md` | `.claude/skills/offload-design/decisions.md` (shared, append-only both ways) |
| Adherence lint | `_adherence.oxlintrc.json` | `eslint.config.mjs`, read at run time |
| Atmosphere tokens | not carried, the marketing site's | `packages/tokens/atmosphere.css` (keep from the repository) |

## Sync history

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
