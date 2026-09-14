repo: menthas-inc/offload_app
branch: main
path:

repo: menthas-inc/offload_app
branch: main
path:

## Last sync

date: 2026-09-14T23:05:00Z

Third pass of the day, and the design half of the 21:04 sync. No new commits pulled.

**016 is folded in and ready to build:** the turn footer, the source chip, the two switch notes and
the voice change, all in `handoff/APPLY-2026-09-14-reaching-the-web.md`. **015's rail is decided
too**, off the open question in its own log entry, and carries its own note,
`handoff/APPLY-2026-09-14-rail.md`.

**The rail: blue keeps today and the day being read, and content moved off the hue.** A day with
something on it is a lift rather than a tint, and a day carrying a decision takes a 1px
`--border-decision` inset inside it. Seven options were drawn in both themes and the dark frame decided
it, producing three findings a light mock could not have: `--shadow-1` is the keyword `none` in
dark, every tint darkens by design so no glow can be load-bearing, and a ring is the only treatment
that measures the same in both themes.

**Two corrections to things this project asserted earlier**, both found by measuring rather than
reasoning. The shipped lit state does *not* go illegible in dark, its ring measures 3.55:1, so the
"needs a dark pass" instruction is withdrawn and the reason to change it is the five meanings alone.
And `decisions.md`'s 11 September entry is out of date about React Native: `Timeline.tsx` draws the
same blurred inset shadow the web does, natively on RN 0.86.

**One line still waiting on code from the 016 pass:** "offload did not finish that one." becomes
"Didn't finish that one." in `Conversation.tsx`, its web twin and the readme.

017's progress line and Stop are designed in `explorations/reaching-the-web-options.html` section 5
and deliberately not built.

### Updated in this project

- **Three new colour aliases**, all three scopes: `--border-lift` (the edge of a raised cell,
  `--border-hairline` in light and `--ink-300` in dark), `--border-decision` (a ring on something
  needing an answer), `--text-noticed` (the ink-weight counterpart to `--surface-noticed`)
- Both colour palette cards updated so the new aliases are visible: a border row on Surfaces &
  states, and the two amber meanings named on Semantics
- `readme.md`: a Timeline rail section, and a Reaching the web section, and the Person rule rewritten
- Five log entries dated 14 September: the footer, the source chip, the voice, the rail, and the merge
- `components/conversation/TurnFooter`, wired into all three kits with its card
- Two apply notes: `APPLY-2026-09-14-reaching-the-web.md` and `APPLY-2026-09-14-rail.md`
- Explorations: `reaching-the-web-options.html` and `rail-blue.html`

### What the coding agent should pick up, in order

1. `handoff/APPLY-2026-09-14-reaching-the-web.md`, points 1 to 4. The footer blocks the chip.
2. `handoff/APPLY-2026-09-14-rail.md`. Independent of 016, and it is CSS and tokens rather than structure.
3. The one copy line above, which is reviewed copy so it is named rather than changed quietly.
4. Two product answers before the rail is built: what counts as needing a decision, and whether one ink
   amber at two levels holds, now that the note dot resolves to `--text-noticed` and the ring to `--border-decision`, which share a value.

## Screen map

| Screen | This project | Repo files |
| --- | --- | --- |
| Web app | `ui_kits/web_app/` | `apps/web/src/` |
| iOS and Android | `ui_kits/mobile_app/`, `ui_kits/android_app/` | `apps/mobile/app/`, `apps/mobile/components/` |
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
