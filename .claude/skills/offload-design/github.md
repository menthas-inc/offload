repo: menthas-inc/offload_app
branch: main
path:

repo: menthas-inc/offload_app
branch: main
path:

## Last sync

date: 2026-09-17T19:40:00Z

Design-only pass, no commits pulled. The product owner asked for the calendar integration page in
Settings and a per-thread calendar control; both are drawn in
`explorations/calendars-options.html` and decided item by item, and all of it is folded in.

**Two levels of consent, and they are different questions.** The account approves which calendars
offload may use at all; **a thread picks which of those it uses, starting from none.** Approving a
calendar in Settings adds it to no thread, ever, because inheritance would silently widen what
offload reads in threads set up months ago, shared ones included.

**The thread control carries no mark in any state.** A dot and a bubble both mean attention, so a
mark meaning "you configured this" earns a tap that finds nothing wrong, and with threads starting
empty there is no state for a mark to carry. The accessible name does it.

**Three governed components were drawn wrong before they were read, and each one changed the design
rather than only the mock.** `Checkbox` had a moss fill, which this readme reserves for a finished
row, so every ticked calendar read as something offload had completed; `IconButton` already owns a
badge dot whose own comment says it means *something new*, which is what disqualified the dot on the
thread control; and `AppBar` and `Sheet` were drawn at the wrong gutters and the wrong top radius,
the latter contradicting the readme's own "24px on sheet tops".

**The provider's colour is in as recognition, never as the differentiator.** Four of seven ordinary
Google colours measure under 3:1 on `--surface-fill` in light, the yellow at 1.51:1, and two are
under in dark; they are not the same ones, so no ground flatters a palette we do not control. The
name tells two calendars apart and the dot only helps you find one.

**There is no "Add events to" setting**, cut by the product owner as a thread question: one calendar
ticked answers it, two or more and offload asks in the conversation with the thread's calendars as
the values, using 018's follow-up control as it stands.

**No new design-system component and no new token**, but three things to scope that are neither
composition nor a component: `Group`'s label gains a trailing slot in `SettingsDetail.jsx`, without
which the settings list cannot show `4 of 7 in use`; **web's calendar popover is new UI** since the
web kit has no governed popover; and **one standing rule is amended**, below. Everything else is
composition over governed `Checkbox`, `Switch`, `Button`, `Chip`, `AppBar`, `Sheet`, `IconButton`
and `WPaneHead`.

**The amendment is the only thing in this pass that reaches outside calendars.** `readme.md`'s
behaviour notes said a web pane head carries two tools and that anything a thread gains later goes
in the More menu, which is exactly what a calendar is. The rule now allows **up to three tools with
a criterion rather than an exception: a tool earns a head slot only if it changes what offload reads
or shows, and anything that acts on the thread goes in More.** Rename, add note and Leave fail that
test and stay in the menu; a scope control passes, because a scope you cannot see is a scope you
forget. **This governs every web thread pane head, not just this feature.**

### Updated in this project

- `readme.md`: a Calendars section, plus **an existing standing rule amended**: the web pane-head
  tool budget in Behaviour notes for the build, now three with a stated criterion
- `decisions.md`: one entry dated 17 September, naming the three components read late and the rule
- `handoff/APPLY-2026-09-17-calendars.md`, six sections, both themes and all three surfaces
- `explorations/calendars-options.html`, five decisions with the rejected options kept

### What the coding agent should pick up, in order

1. `handoff/APPLY-2026-09-17-calendars.md`, **section 5 first**: it is the model the two screens
   depend on and the one thing that cannot change later without a migration.
2. Section 2's checkbox, which is the correction most likely to be got wrong from habit: a
   selection tick is ink, and the dimming inverts from `Checkbox`'s own label treatment.
3. Section 4's bar, which carries two rules, not one: the new button never gets `badge`, and **the
   web pane head is now capped at three tools by a stated criterion**, so the next capability gets
   the same test rather than a fourth slot.
4. Three things still owed, listed at the end of the note: whether a thread remembers its write
   target, two accounts on the settings page, and Android.

## Screen map

| Screen | This project | Repo files |
| --- | --- | --- |
| Web app | `ui_kits/web_app/` | `apps/web/src/` |
| iOS and Android | `ui_kits/mobile_app/`, `ui_kits/android_app/` | `apps/mobile/app/`, `apps/mobile/components/` |
| Calendars | `explorations/calendars-options.html`, `handoff/APPLY-2026-09-17-calendars.md` | settings: the Connected apps Calendar row on all three surfaces; thread: `ThreadScreen.jsx`, `M3ThreadScreen.jsx`, `WThing.jsx` app bars |
| Timeline rail | `explorations/rail-blue.html`, `handoff/APPLY-2026-09-14-rail.md` | `apps/web/src/app/(shell)/shell.module.css`, `apps/web/src/components/panes/Timeline.tsx`, `apps/mobile/components/shell/Timeline.tsx` |
| Reaching the web | `components/conversation/`, the kits' conversation files, `explorations/reaching-the-web-options.html` | `docs/specs/016-reaching-the-web/`, `docs/specs/017-saying-what-it-is-doing/`, `apps/mobile/components/shell/Conversation.tsx` |
| Answering | `components/answering/`, the kits' conversation files, `explorations/answering-options.html` | `apps/core-api/src/search/`, `apps/agent/src/offload_agent/`, `docs/specs/013-answering/` |
| Admin panel | `ui_kits/admin_web/` | `apps/web/src/app/(admin)/` |
| Landing page, invite email | `ui_kits/marketing_site/` | `apps/web/src/app/(marketing)/` |
| Design tokens | `styles.css`, `tokens/` | `packages/tokens/`, generated from `.claude/skills/offload-design/tokens` |
| Components | `components/` | `packages/widgets/`, `apps/mobile/components/` |
| Decision log | `decisions.md` | `.claude/skills/offload-design/decisions.md` (shared, append-only both ways) |
| Adherence lint | `_adherence.oxlintrc.json` | `eslint.config.mjs`, read at run time |
| Atmosphere tokens | not carried, the marketing site's | `packages/tokens/atmosphere.css` (keep from the repository) |

## Sync history

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
