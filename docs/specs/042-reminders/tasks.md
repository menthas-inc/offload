# 042 Reminders, tasks

Ordered. Each cites the acceptance criteria and principles it serves. `[ ]` open, `[~]` in progress, `[x]` done. Every task with behaviour starts with its test seen red (QUAL-1). The documents first, then the API from the schema out to the sends, then the agent, then the two clients, and the owner's steps batched at the end.

## A. The documents

- [x] **A1** The four privacy page edits in `feature-spec.md`, "What a reminder carries away", into `apps/web/src/app/(marketing)/privacy/page.tsx` in the worktree, with `UPDATED` and `CONSENT_VERSION` moved and the page test extended, red first. **The owner reads them before any send code is written.** (AC-18, OFF-1, the `CLAUDE.md` policy rule)
- [x] **A2** Amend in their own specs: 027's sections (a fourth, Reminders, under Your day); 024's "two sends a day, no per-item pushes" and "notes are never announced"; 023's Remind me switch; 038's "a remembered birthday reaches the model only". (AC-25, DEV-2)
- [x] **A3** Landed on `main` from `at-merge.md` in its own pull request after the merge, 2026-10-10. At merge, on `main`: a `docs/tech/decisions.md` entry (labels and a table, compose-at-send, the author alone, a date the author set, the name as a run of own text, the token capability) and the reversible allowlist entry for labelling; a design `decisions.md` entry with Design system impact naming Today's Reminders section (no mock: its place, its row and its two plain lines, its Customize name and line), the tiles, the `reminder` row, the switch's reach in three editors, the web `Switch`, the Dates caption, the `reminders` channel's name, and the readme's lines on the bell (854), the flag (862), "while the row is a reminder" (918) and "no per-item pushes". (AC-25, OFF-6, OFF-7)

## B. API: schema

- [x] **B1** `0089_reminders.sql` as the impl-spec writes it (number confirmed on the board); `schema.ts`; the drift test; the agent grant. Red first. (DATA-1)
- [x] **B2** `packages/widgets/src/notifications.ts`: the `reminders` channel, the `reminder` kind, its glyph. `notification-constants.test.ts` red first. (AC-22, AC-23)

## C. API: the table

- [x] **C1** `notifications/plan.ts`: both tables as constants and `plan()` in the order the impl-spec gives. `plan.test.ts` pinning every cell, drop then cut, the two-day rule, the late month out, the anchored day before, the three rule frequencies, the asked time, the default, the 7:00 and 22:00 bounds across a clock change, two zones. Red first. (AC-7 to AC-12, QUAL-2)

## D. API: labels and control

- [x] **D1** `remind_fingerprint`, `needsLabel` and the `_ANCHORS` predicate as SQL fragments shared by booking, the worker and apply. `labels.test.ts` for the filters (mail, calendar, browser, untrusted, another member's, stopped, past), red first. (AC-1, AC-2, OFF-3, OFF-4)
- [x] **D2** `applyLabels` and `nameIsOwn`; `/internal/v1/nightly-result` gains `labels` in its transaction. Tests: an id not shown, an anchor outside the thread or undated, `for` on a dated thing, a name that is not a run, an address or four digits. Red first. (AC-1, AC-5, SEC-1, SEC-2, OFF-5)
- [x] **D3** `applyMemoryDates`; `/internal/v1/memory-result` gains `dates` and `shown`; shown-and-unlabelled People and About memories written as `none`. Tests, red first. (AC-4, AC-5)
- [x] **D4** The daily run's account gate and per-thread `needs` book on `needsLabel`; `passOwed` books on an unlabelled memory. Test in `nightly.test.ts` that a quiet account with one new dated row gets a run and a pass, within the ten-thread cap. Red first. (AC-6)
- [x] **D5** `editContent` and the turn's `edit_content`: `held_at` on a non-author's date change, cleared with `date_set_at` on the author's edit. A note's date is written only by its author's own paths (`add_note`, the author's own pass), so notes need no hold. `reminders-held.test.ts`. (AC-21, OFF-3)
- [x] **D6** `reminders: "on" | "off"` on `PATCH /v1/content/:id` (the row sheet's one save) and `PUT /v1/reminders` `{ of, id, on }` for a note or a memory: author-only, `is_reminder` off with a stop and never on, Undo through the snapshot. `reminders-control.test.ts`, red first. (AC-19, OFF-3, OFF-6)
- [x] **D7** `remindersOf(viewer)` joined into every read of rows, notes and memories; `null` to anyone but the author. Test per read. (AC-20)
- [x] **D8** `/api/me` `notifyReminders` and `notifyReminderCount`; `POST /v1/push-tokens` `takes`. Tests. (AC-15, AC-17, AC-22)

## E. API: sending

- [x] **E1** `copy.ts`: the today and tomorrow parts with reminders, Coming up's three arms, "by" and "on", weekday, tomorrow, day and month, the counted titles, the four timed titles, the 240 cut, no possessive. `copy.test.ts`, red first. (AC-13, AC-14)
- [x] **E2** `composeDigest` and `runDigest`: `remindersIn`, the candidate read and its membership join, the switches holding back only 024's rows, once per thing, no not-sent record when the send went, Reminders off composes none. `digest.test.ts`, red first. (AC-13, AC-16, AC-17, OFF-3)
- [x] **E3** `scheduleOwn` in the hourly handler and the `reminder.own` job: the key, the re-check, the 15-minute drop, only tokens that take it, the payload's closed keys, the permission record, receipts; the job kind in `jobs/schedule.ts`. `reminders-own.test.ts`, red first. (AC-15, AC-16, AC-17)
- [x] **E4** The forget path deletes Activity rows mentioning the memory; the send records `activity_memories` for a memory it named. Test in `activity.test.ts`, red first. (AC-23, OFF-1)
- [x] **E5** `reminder_sent` and `reminders_labelled` events under the pseudonym, with the closed property lists. Test that no property is a title, name, date or account id. (AC-16, OFF-1)
- [x] **E6** The privacy gate is the merge, not a runtime check: the web and the API deploy together from it, and `privacy-policy.test.tsx` pins the four edits, `UPDATED` and the consent version (`consent.test.ts`). A runtime comparison of dates would be code with nothing to decide. (AC-18)

- [x] **E7** `today/layout.ts`: the `reminders` kind at its default place, four sections, `remindersOn`; `/api/me` `todayLayoutV3`, V2 without it, the PATCH schema widened. `today-layout.test.ts`, red first. (AC-27)
- [x] **E8** `GET /v1/today/reminders` and `today/reminders.ts`: the candidate read without the Notifications switch, begun and not ended by `plan()`, Your day's rows today left out, rows in Today's row shape, notes and memories as plain entries, 20 and the count. `today-reminders.test.ts`, red first. (AC-26, OFF-3)

## F. Agent

- [x] **F1** `nightly.py`: `_TO_LABEL` and `_ANCHORS` with their filters and caps, the listing's two sections, `labels` in each plan model, `_held_to_the_rules`. `test_nightly.py` and `test_nightly_db.py`, red first. (AC-1 to AC-3, OFF-8)
- [x] **F2** `prompts/nightly.md`: the Reminders section in all three variants. The prompt-file test that every variant carries it. (AC-1, SEC-1)
- [x] **F3** `memories.py` and `prompts/memory.md`: `dated`, `dates`, `shown`. `test_memories.py`, red first. (AC-4)
- [x] **F4** Eval cases: a new principle for the labels (the owner's examples, each kind and lead, the `none` cases, an anchored task, "a week before", names as runs), and `15-injected-text-is-data` gains the three injections. `--list` only; **running them is a separate ask of the owner, about the cost of the two principles.** (AC-24)
- [~] **F5** The model-calls page's map updated and rebuilt in the worktree (`jobs.mjs`); republishing it and the harness map is `/model-calls` and `/harness-map` after the merge. (AC-25)

## G. Mobile

- [x] **G1** `lib/notifications.ts`: the channel in `prepare()`, `takes` on registration, `reminder` in `Payload` and `routeFor`. `notifications.test.ts` and `notifications-android.test.ts`, red first. (AC-15, AC-22)
- [x] **G2** `ChoiceTiles` `disabled` and `CountPreview`; the Reminders section of `NotificationsPage.tsx`, `CHANNEL_OF`, the hour greying, the Dates caption. Test, red first. (AC-22)
- [x] **G3** The switch in `RowEditSheet.tsx`, the note editor and `MemoryEditor.tsx` on the condition; `DateChip` bell; `changeToken` and the two mergers carry `reminders`. Tests, red first. (AC-19, AC-20)
- [x] **G4** `lib/activity.ts`: `reminder` opens the thread. Test. (AC-23)
- [x] **G5** Today: `lib/today.ts` reads V3 then V2, the `reminders` kind and switch; `TodayScreen.tsx` draws the section today only, not over day one, with the row component and the plain lines and "and N more", and the unknown-kind fall-through becomes an explicit `day` branch; `CustomizeSheet.tsx` names it. `today.test.ts`, red first. (AC-26, AC-27)

## H. Web

- [x] **H1** The Reminders section of `Notifications.tsx` with tiles and greying; `notifySummary`. Test, red first. (AC-22)
- [x] **H2** `EditModal.tsx`'s checkbox becomes the `Switch`; the switch in the Notes and Memories editors; `DateChip`; the three mergers. Tests, red first. (AC-19, AC-20, OFF-7)
- [x] **H3** `doorOf` for `reminder`. Test. (AC-23)
- [x] **H4** Today pane: the section in layout order with an exhaustive branch; `Customize.tsx` names it; `use-me.ts` reads V3. `today.test.tsx`, red first. (AC-26, AC-27)

## I. Verification

- [x] **I1** `pnpm lint`, both suites, `uv run ruff check .`, the three `dead-*.mjs` scripts, on the isolated test database.
- [x] **I2** iOS simulator: inject the payloads the server builds for a morning send with Coming up and a notification of its own; tap through to the thread; the Notifications page, the three editors and Today with the Reminders section at 200% text, and Customize Today moving and switching it. Screenshots.
- [x] **I3** Web: the Notifications page, the three editors, the Today pane with the section and Customize, and Activity driven and screenshotted in both themes.
- [x] **I4** Three reviews in the background straight after the build (code, client, security), fixed by pass with one commit each.

## J. Amended 2026-10-10: the calendar in the morning

- [x] **J1** `0090_calendar_in_the_morning.sql`: `reminder_anchors`, `reminders_wanted`, `content_due_live` and `content_occurs_live` without `source_ref is null`; `scheduleOwn` and `candidatesOf` the same; the send's read by `source`. Test `apps/core-api/test/calendar-morning.test.ts`, red first. (AC-2, AC-28, OFF-4)
- [x] **J2** The morning's events under `notify_calendar` alone, named once for a row the send names; `/api/me` `notifyCalendar`; `activity_calendars` and its triggers. Test `apps/core-api/test/calendar-morning.test.ts`, red first. (AC-29, AC-31)
- [x] **J3** The Calendar section on both Notifications pages, `CALENDAR_LINE` and the morning hour in `hoursOn`, Android's mirror of `due_today`, Today's Notifications card. Tests `apps/web/test/reminders-notifications.test.tsx`, `apps/mobile/test/notifications-page.test.ts`, `apps/mobile/test/today.test.ts`, `packages/widgets/test/reminders.test.ts`, red first. (AC-30)
- [x] **J4** The privacy page's sections 7 and 14, approved by the owner. Test `apps/web/test/privacy-policy.test.tsx`, red first. (AC-31, the `CLAUDE.md` policy rule)

## The owner's steps, batched

- Read the four privacy page edits (A1) before E is built.
- Say yes, or not yet, to running the new label principle and the injection cases (F4).
- The Pixel: the `reminders` channel, a notification of its own on a locked phone, the morning send with Coming up.
