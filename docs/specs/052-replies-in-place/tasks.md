# 052 Replies in place, tasks

**How to work each task:**
- **Test first.** Write the test, run it, and see it fail for the reason the task exists. Then write the code (QUAL-1).
- **One track at a time.** Three tracks: API, Mobile, Web.
- **Closing.** The feature closes when all three pass and the device pass is done.
- **The suite.** Take the `suite` hold before every commit (the gate runs the shared suite). Use an isolated `offload_replies_in_place_test` database for local suite runs, per the feature session loop.

## T0 Setup and logs

- [x] **T0.1** Migration `0101_turn_changes.sql`:
  - the table and index in the impl-spec;
  - `messages.shown`;
  - `"turn_changes.account_id": cascade` in `accounts/ledger.ts`.

  Test: the ledger test reads the new delete rule. A migration test inserts and cascades. *(AC-27, OFF-3)*
- [x] **T0.2** `docs/tech/decisions.md`:
  - Amend the OFF-6 allowlist entry: the late Undo reverses the filing and keeps the dump, a shared-calendar removal past eight seconds confirms, and the calendar pill is 019's conditional entry for one row. Close the ⚠️ item of 2026-10-02, since the turn's Undo now restores previous values for the six tools.
  - Add an entry for `turn_changes` retention.

  *(OFF-6, DEV-2)*
- [x] **T0.3** `.claude/skills/offload-design/decisions.md`: one entry, *Replies in place*, with **Design system impact** filled in. It covers:
  - `TurnFooter` retired;
  - `AnswerResult` as the list slice;
  - `UndoLine`'s `turn` form;
  - `MonthGrid`'s `still` mode;
  - pills on `Chip`;
  - the quiet source line;
  - the board's divergences (no reminder moment, no grid controls, no gallery slice).

  *(OFF-7)*

## API

- [x] **T1.1** `turn_changes` written by `edit_content`, `move_content`, `complete_content`, `archive_content`, `rename_thread` and `set_thread_preference` in `routes/tools.ts`, first value wins.
  - Tests: each tool leaves one row with its previous value. A second write to the same field keeps the first, and a second tool's field is merged in (edit then tick keeps both). A calendar-derived row stores offload's columns and `source_ref` only.

  *(AC-9, AC-27, OFF-4)*
- [x] **T1.2** Retire on the next dump: inserting a dump nulls `previous` on the account's rows older than eight seconds, through `turn_changes_live_idx`, and leaves the ids.
  - Tests: two dumps a minute apart leave the first turn's `previous` null with its ids kept. Two dumps three seconds apart leave the first turn's Undo still restoring.

  *(AC-17, AC-27)*
- [x] **T1.3** `undoTurn` restores `turn_changes.previous` within its transaction.
  - Test: a turn that ticked two rows and moved an event, undone within eight seconds, unticks both and moves the event back, on Google too, through the calendar undo path.

  *(AC-9, AC-17, OFF-6)*
- [x] **T1.4** The late Undo in `POST /v1/turns/:turnId/undo`:
  - `late` is decided by server time against the turn's result.
  - A late Undo calls `undoTurn` with `keepMessageId` and `since`, and restores `previous` only where the row's `updated_at` is before `since`.
  - It returns `changed` (not `stayed`, which stays the memories').
  - A shared-calendar removal returns `confirm`.

  Tests:
  - the dump and blobs survive a late Undo;
  - a row another member edited after the turn is left and named;
  - a removal from a calendar with two participants returns `confirm` and leaves the event;
  - a removal within eight seconds does not confirm.

  *(AC-17, AC-18, AC-19, OFF-1, OFF-3, OFF-6)*
- [x] **T1.5** `repliesFor(viewer, turns)` and `reply` on both conversation reads, schema-extended. Tests:
  - four groceries give one list slice with the neighbours rule;
  - a mixed dump gives a calendar slice and a list slice, in the order written;
  - four threads give three slices and `also`;
  - a new thread gives `newThread`;
  - a remember gives `memories`;
  - an answering turn's `found` gives list slices;
  - `shown.span` gives a span calendar slice;
  - `shown.on` gives a month with its day;
  - a row in a thread the viewer left is dropped and its thread unnamed;
  - an emptied slice is `removed`;
  - a zero open count is reported as 0 for the client to hide.

  *(AC-2, AC-3, AC-4, AC-7, AC-8, AC-10, AC-11, AC-24, SEC-2)*
- [x] **T1.6** Pills in `repliesFor`. Tests, one per row of the table:
  - exactly-one rules;
  - order;
  - the cap of two;
  - none with an open question;
  - none on answer, tick-only or remember turns;
  - no share on `derived_from_untrusted` or a mail or calendar dump;
  - whole-word name match;
  - no remind in a shared thread;
  - no calendar pill with two writable calendars.

  *(AC-12, AC-14, AC-15, SEC-1)*
- [x] **T1.11** Widen `readDay`: `place` on `todayEvent` and `calendar { name, color }` on content rows.
  - Tests: an event with a resolved place returns it; a row on a calendar returns its name and colour; Today's existing day tests still pass.

  *(AC-5)*
- [x] **T1.7** `POST /v1/turns/:turnId/pills`. Tests:
  - **calendar** writes one event to the named calendar and leaves the thread's picks unchanged;
  - it confirms when `outwardTest` says so;
  - `undo` within eight seconds deletes the event Google-first by `source_ref`, and after that is 409;
  - **remind** sets and clears `is_reminder`;
  - another account's turn is 404;
  - a kind not offered now is 409;
  - a caller who left the thread is 409.

  *(AC-13, AC-15, AC-16, OFF-6, SEC-2)*
- [x] **T1.8** `shown` on `POST /internal/v1/turn-result`: bounded to one date or a span of at most 62 days, and stored on the offload message.
  - Tests: an over-long span is refused; a valid one round-trips to `reply`.

  *(AC-11, OFF-5)*
- [x] **T1.9** Egress: the new route and `repliesFor` log ids, kinds, counts and outcomes only.
  - Test: the log lines of a pill tap carry no title, name or domain.

  *(AC-28, OFF-1)*
- [x] **T1.10** Export (035) includes `turn_changes`.
  - Test: the export of an account with a pending change carries it.

  *(AC-27)*

## Agent

- [x] **T2.1** `worker.py` answered result: `shown` from a single `list_agenda` read's window (one day `on`, longer `span`), and `shown.on` from a lookup's structured `date`.
  - Tests in `apps/agent/tests`: a week read posts `shown.span`; a one-day read posts `shown.on`; a fact answer with a date posts `shown.on`; a list-content answer posts none.

  *(AC-11)*
- [x] **T2.2** `prompts/answer.md:51` rewritten positively for calendars and connected apps, with a line that a read of days is answered with its count. Principle 17's `statement` and `sources` are updated in the same change. Add cases to `apps/agent/evals/principles/17-the-answer-is-the-reply.json`:
  - *what's on this week?* answers with the count only;
  - *which calendars do you read?* still lists them.

  **Cases written 2026-11-17; not run yet: running them waits for the owner's go-ahead.** `find_events` over the same window counts as the same read (`DAY_READS`). The before and after runs of principle 17 come only with that permission.

  *(AC-29, OFF-8)*

## Shared

- [x] **T3.1** `packages/widgets/src/reply.ts`: `summaryWords`, `pillLabel` (with the 24-character cap and the calendar name cut at a word), `alsoLine`, `sourceLine`, `changedLine` and `periodLabel`.
  - Table tests fed turn records, with no model.
  - A copy check finds no dash and no banned noun.

  *(AC-10, AC-22, AC-23)*

## Web

- [x] **T4.1** Remove `TurnFooter.tsx`, `footerFor` and their renders.
  - Test: a filing turn renders no Done, no thread pill and no source pill.

  *(AC-1)*
- [x] **T4.0** `AnswerResult` on the web gains `count` (the open count, hidden at zero), `marked` and `notes`. Component tests. *(AC-2, AC-11)*
- [x] **T4.2** `Reply.tsx` with `ListSlice` (via `AnswerResult` with `marked`), `NewThreadSlice`, `MemoriesSlice`, `Also`, `Pills` (Chip, 44 targets), `SourceLine`, and `UndoLine` `turn`.
  - Component tests for AC-2, AC-7, AC-8, AC-10, AC-12, AC-22, and the order of the parts.

  *(AC-2, AC-7, AC-8, AC-10, AC-12, AC-22, AC-26)*
- [x] **T4.3** `MonthGrid` `still`: no arrows, no Today, `onStep` optional. `CalendarSlice` reads `/v1/today/month` and `/v1/today/day` lazily, cached per key. A day tap swaps the list. Entries expand in place with span, place and Directions, thread, and calendar dot or *not on a calendar*.
  - Tests: the two-week and month periods, today outlined, the day filled, the entry expand and fold with `aria-expanded`, the 60-character title wrapped at the composer's minimum width.

  *(AC-3, AC-4, AC-5, AC-6, AC-26)*
- [x] **T4.4** The undo line's two phases.
  - First eight seconds: 043's clock and whole-turn removal.
  - Late: no clock, slices fold to *Undone*, `changed` named, `confirm` opens the pending-write confirm.
  - Retired at the next dump.
  - Failure: the turn comes back, with Retry.
  - No plate line for a conversation dump.

  Tests for each. *(AC-17, AC-19, AC-20, AC-21)*
- [x] **T4.5** Pill taps: date opens the edit modal at the date field; calendar and remind call the route and draw 043's under line with Undo; share opens 022's confirmation with the person; directions opens the link. Component tests. *(AC-12 to AC-15)*
- [x] **T4.6** States: partial, cancelled and failed turns; offline reopen. Change mark only on live arrival. Tests. *(AC-25)*
- [x] **T4.7** Run `dead-classes.mjs`, `dead-css.mjs` and `dead-icons.mjs`, and lint.

## Mobile

- [x] **T5.1** Remove the inline `TurnFooter` in `Conversation.tsx`. Test as T4.1. *(AC-1)*
- [x] **T5.0** `AnswerResult` on the phones gains `count`, `marked` and `notes`, as T4.0. *(AC-2, AC-11)*
- [x] **T5.2** `Reply.tsx` and its slices, as T4.2. *(AC-2, AC-7, AC-8, AC-10, AC-12, AC-22, AC-26)*
- [x] **T5.3** `components/shell/MonthGrid.tsx` `still`, which also turns off its horizontal pan. `CalendarSlice` lazy reads use list viewability. Expand through `useInPlace`. Tests as T4.3, plus no pan handler in `still`. *(AC-3 to AC-6, AC-26)*
- [x] **T5.4** The undo line's two phases and `Plate.tsx` skipping the plate line, as T4.4. *(AC-17, AC-19 to AC-21)*
- [x] **T5.5** Pill taps, as T4.5, with the row sheet for date and 022's share sheet. *(AC-12 to AC-15)*
- [x] **T5.6** States and the change mark, as T4.6. *(AC-25)*
- [x] **T5.7** Run `dead-icons.mjs` and `dead-classes.mjs`, and the mobile typecheck. Refresh stale `.expo` route types first if needed.

## Close

- [x] **T6.1** The checks CI runs, from the root: `pnpm typecheck`, lint, every suite, the dead-class scripts. Record each suite's exit code and vitest's Errors line.
- [ ] **T6.2** Device pass on the Pixel and the iOS simulator. Take the `pixel` and `sim-<device>` holds. Run the twelve reference turns in `design/twelve-turns.dc.html`. On each device check:
  - expanding an entry mid-scroll inside the conversation sheet;
  - a grid inside the sheet with no pan conflict;
  - larger text;
  - dark;
  - the late Undo after waiting past eight seconds.

  Leave each phone as it was found.
- [x] **T6.3** `security-reviewer` on the diff: authorization, the new route, `turn_changes` and the egress rule.
- [ ] **T6.4** Update the specs if the build diverged (DEV-2), and confirm the privacy page needs no change.
