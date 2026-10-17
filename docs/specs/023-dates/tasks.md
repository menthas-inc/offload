# 023 Dates, tasks

Ordered. Each cites the acceptance criteria and principles it serves. `[ ]` open, `[~]` in progress, `[x]` done. Every task with behaviour starts with its test seen red (QUAL-1). The API track first, the shared module beside it, the agent after the routes, the two client tracks in parallel after that, the documents that are shared state on `main` at merge.

**Amended 2026-10-17 (the owner):** done in one PR with the rest of the owner's tidying asks, each behind a test that was seen red first; the feature-spec's note of the same date says what changed.

## A. The documents

- [x] **A1** The product owner reads the privacy page clause in `feature-spec.md`, "The privacy page, as it will read", before the zone code is written; the clause goes into `apps/web/src/app/(marketing)/privacy/page.tsx` in the worktree, to land with the feature. (the `CLAUDE.md` policy rule)
- [x] **A2** On `main`: the two aliases `--surface-danger-soft` and `--surface-noticed-soft` in all three scopes of `.claude/skills/offload-design/tokens/colors.css`, one design log entry, `pnpm tokens`, fast-forwarded into the worktree before F3 and G2. (OFF-7)
- [x] **A3** Landed on main with the merge, 2026-09-26. At merge, on `main`: the three `docs/tech/decisions.md` entries and the design log entry with every line under "Design system impact" in `feature-spec.md`. (OFF-7, DATA-1)

## B. Shared: the rule and the day

- [x] **B1** `packages/widgets/fixtures/rules.json`: accepted rules with canonical forms, refused rules with reasons, forty in all. Then `packages/widgets/src/rrule.ts`: `parseRule`, `formatRule`, `describeRule`, `presetsFor`, `occurrencesIn`, `nextOnOrAfter`, the 400 cap. Test `apps/web/test/rrule.test.ts` over the fixture, red first. (AC-8, AC-9, SEC-1)
- [x] **B2** `packages/widgets/src/nearness.ts`: `nearness(day, today)`, `chipLabel(row, zone, locale, today)` with the words, the fourteen-day drop, today and tomorrow, a repeating row's next occurrence. `utcDay`, `dayIn`. Test `apps/web/test/nearness.test.ts`, red first. (AC-13, AC-14)
- [x] **B3** `timeline.ts`: `datedFor` takes the zone, bare days by `utcDay`, timed by `dayIn`, expansion through `rrule.ts`; `timeline.test.ts` updated and green, the six old values' cases rewritten as rules. (AC-4, AC-9)

## C. API: the rule

- [x] **C1** `0057_a_rule.sql` as the impl-spec writes it; `schema.ts` to match; the drift test. Test `rule.test.ts`: the six values and an until rewritten canonically, every migrated row survives `formatRule(parseRule(x)) === x`, the three constraints. Red first against the old columns. (AC-7, DATA-1)
- [x] **C2** `routes/tools.ts`: `rrule` on `add_content`, `add_note`, `edit_content`; the refine through `parseRule`; the canonical store; `bad_rule`; the calendar refusal on a rule. Test: every fixture refusal through each tool, the anchor rule, `null` leaving a rule alone. (AC-8, AC-10, OFF-5)
- [x] **C3** `create_event` sends `RRULE:` with the canonical string and an all-day `UNTIL`; the toast and confirmation lines name the series. Test against the stubbed connector. (AC-11, OFF-6)
- [x] **C4** Every response schema that carries a row gains `rrule` and `onCalendar` and loses the two old fields: `contentRow`, `contentPage`, the bundle, the note shape and route, `Sortable`. Wire test per route. (the wire changes, SEC-2)

## D. API: the clock and the write path

- [x] **D1** `0056_one_clock.sql`; `schema.ts`; the grant. Test `clock.test.ts`: backfill from the latest message, the worker's grant. Red first. (AC-1, DATA-1)
- [x] **D2** `adoptZone` and `zoneOf`; onboarding takes `timeZone`; a dump from an account with no zone adopts its header's; `/api/me` returns and patches the three fields, resolved through ICU, 400 on unknown; Use clears `kept_time_zone`. Test each, including an unknown name and a bind-only reach to SQL. (AC-1, AC-3, SEC-1)
- [x] **D3** `dates.ts`: `instantIn(dayAndTime, zone)`, the amended comment; `parseDates` in the tool routes takes the zone; a bare day stays noon UTC. Test around a DST change and in Auckland. (AC-4)
- [x] **D4** `PATCH /v1/content/:id`: the nine fields, absent versus null, `previous`, `isReminder: true` refused, the anchor clearing the rule, `occursEndAt` before `occursAt` refused, `on_calendar`; `editContent` grown to match under `requireReadable`. Test each in `threads.test.ts`, red first. (AC-25, AC-26, OFF-3, OFF-6)

## E. Agent

- [x] **E1** `harness/tools.py`: `rrule` on the three models with the shape check over the fixture; the old fields gone. `plan_v2.md` and `quick_add.md` say the rule and the clock line. The worker's dump query prefers the account's zone. Tests: the fixture in Python, `today_in` with the account's zone. (AC-5, AC-10, OFF-8)
- [x] **E2** Principle 04's cases rewritten to the rule; the tool definition guard measured before and after. Not run against the model without permission. (AC-10)

## F. Mobile

- [x] **F1** `lib/me.ts` and the onboarding call: the three fields and `timeZone`. `lib/zone.ts`. Test the request bodies and the strip's predicate. (AC-1, AC-3)
- [x] **F2** `Intl.DateTimeFormat` with a zone checked on the simulator, before anything below draws a time.
- [x] **F3** `DateChip.tsx` and the chip on `ContentRow.tsx` at the trailing edge of the title line, the bell mark, the change token; the rail and Notes read the zone. (AC-12 to AC-16)
- [x] **F4** `@react-native-community/datetimepicker` added; the iOS simulator development build made through EAS; the plugin verified.
- [x] **F5** `RowEditSheet.tsx` with title, details, When, Repeats, Remind me while set, the one way out, Cancel and Save, one `perform` write with "Saved" and "Couldn't save that". (AC-17, AC-27)
- [x] **F6** `WhenSheet.tsx`: the grid from `monthFor`, All day and the platform's hour, Ends at on an event, the presets, Clear, Save, the standalone and hand-back modes. `CustomRepeatSheet.tsx`. (AC-18 to AC-22)
- [x] **F7** `RowActionSheet` gains a value; the When row. A calendar-backed row's sheet. (AC-23, AC-24)
- [x] **F8** `ZoneStrip.tsx` on both Today screens; the Date and time page with the zone list, Follow this device and Starts on moved out of Appearance. (AC-3, AC-6)

## G. Web

- [x] **G1** `use-me.ts`, `lib/zone.ts`, the account writes. (AC-1, AC-3)
- [x] **G2** `DateChip.tsx` on `ContentRowView.tsx`; `Widgets.tsx` loses its date and "reminder"; the change token; the Timeline and Notes read the zone. (AC-12 to AC-16)
- [x] **G3** `EditModal.tsx`: the fields, the grid inline, the time field, Repeats and Custom inline, Cancel, Save, Escape; the inline title field kept for the thread name only. (AC-17 to AC-22, AC-24)
- [x] **G4** The strip on the Today pane; the Date and time page with Starts on moved out of Appearance. (AC-3, AC-6)

## H. Verification

- [x] **H1** `pnpm test`, `pnpm lint`, `pnpm typecheck`, `uv run ruff check .`, the three `dead-*.mjs`, on the isolated database with no server running.
- [x] **H2** On the simulator: the sheets, the wheel, the grid at the turn of a month, the strip and its two answers, the settings pages, the chip at 200% text in both themes, and one real turn that moves a date by saying it. On the web: the modal, the chip, the strip, the page. Screenshots kept. (Done means)
- [x] **H3** The three review agents on the diff; one commit per pass.

## Amended 2026-10-07

T-2026-10-07 Repeats says Never with no date. Done. See the feature spec's amendment of the same date.
