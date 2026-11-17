# 051 Birthdays are memories, impl spec

**Feature spec:** `feature-spec.md` (GATE: PASS, 2026-11-17).
**Tracks:** API (Core API and worker) carries all of it. Web and Mobile change one line of copy each through `@offload/widgets`; nothing else on the clients moves.

## Data flow

**A birthday dump, calendar connected, nothing named.**

1. The filing turn (`plan_v2.md`) reads "Kristina's birthday is Feb 1st" and calls `memory` with `action: remember`, `kind: people`, `text: "Kristina's birthday is 1 February."`, `on: "02-01"`, `name: "Kristina's birthday"`. No `add_content`.
2. The worker posts it to the Core API's remember handler (`routes/tools.ts`, today ~943-1000). The handler sees no asked words, so it takes the **unasked path**:
   - taint: 038 AC-5's list plus "the turn read another member's note or row" (`turnReadMembers`, new, from what the turn was handed: `notesFromMembers` non-empty or a member's row returned by a read tool);
   - grounding: `memories/dates.ts` (new) strips the date phrase from the sentence and from the message, reads both to `MM-DD`, requires them equal and equal to `on`, and requires every remaining non-ignored word of the sentence in the message (`ruleGrounded`'s rule, `memories/ground.ts`); a year in the sentence must be in the message;
   - the kind is `people`, or `about` for `OWN_BIRTHDAY` (`notifications/labels.ts`), and `name` passes `nameIsOwn` and contains "birthday" or "anniversary".
   Refusal codes are 038's (`untrusted_turn`, `not_their_words`, `memories_full`) plus `bad_date`; the prompt's existing lines cover them.
3. **Dedupe in the handler**, which already orchestrates labels, so the memory store learns nothing about reminders (AC-6): an active memory of the account whose label's flattened `name` equals this one and whose `yearly_on` equals `on` returns `{ ok: true, remembered: true }` with that id and writes nothing; the same name with another date, or with no label date, is retired and replaced. There is no general supersede to reuse (`store.ts:574` is `rememberCalendar`'s, keyed on answered memories), so `pass.ts`'s private `retire` is exported and called, about fifteen lines with its insert. Then `store.remember` (`memories/store.ts:190`) writes the note with origin `stated` and `derived_from_message_id` the message, inside the turn's transaction.
4. In the same transaction, `labels.ts` gains `labelMemoryNow(trx, { accountId, noteId, on, name })`: one `reminder_labels` row, kind `occasion`, lead `days`, `yearly_on`, `name`, `fingerprint = note_fingerprint(n)`, `labelled_at = now()`. The fingerprint is what makes the nightly pass skip it until its words change (`memoriesToDate`).
5. The handler then decides the calendar (AC-11 to AC-14), still in the request:
   - skipped for their own birthday unless `calendar` was given, for a memory with no `on` or no name, and for an existing memory already linked;
   - **found first** (AC-12): `findEvents` over `turnScope(accountId, null)` (`threads/calendars.ts:348`), every selected calendar of theirs, read-only ones such as Google's Birthdays included, for the next occurrence's day as a UTC day (Google's all-day is midnight UTC, as `sameMoment` has it); keep `yours` events with `series_ref` set whose title holds every word of `name`. The copy holds expanded instances (`sync.ts:30-43`, sixty days back and twelve months forward), so the next occurrence of any day is in it, and a rule is not: the frequency is not checked, accepted in the feature spec. One match sets `notes.event_ref` to its `series_ref` and `attrs.event_found = true`, writes nothing. No Google read, as 019's `rememberEvent` reads only the copy;
   - **which calendar**: `calendarsNamed` for `calendar` words as 019 does, a name settling on none raising the question; nothing named, among `approvedWritable(accountId)` the primary (the calendar whose `external_id` is the connection's Google address, which is how Google names a primary) else the first by name, with no question (owner, 2026-11-17); none says the connect line only when `calendar` was given;
   - **write**: `writeThroughTool` (`connectors/tool-calls.ts:234`) with a draft from `calendarSpan`-shaped values: all-day on the next occurrence of `on` in the account's zone, `recurrence: ["RRULE:FREQ=YEARLY"]`, `title: name`, nothing else, and `noteId` in its existing `options` bag. `remember()` (`tool-calls.ts:641`) gains the note branch, guarded `where event_ref is null` as the content branch is guarded on `source_ref`, and stores the series' master ref `createEvent` returns. A recurring create is not mirrored into the copy (`write.ts:188-190`); its instances arrive by sync carrying that ref as `series_ref`, and the master is what every later delete or move targets.
6. The tool result carries `{ ok, remembered, calendar: "written" | "asked" | "noCalendar" | "waiting" | null }`; the model says `remembered`, and only `noCalendar` when they asked, as the prompt has it for appointments.
7. The turn settles. `threadsFor` (`routes/dumps.ts:620`) gains a third source: a `stated` memory derived from this message makes `filed: true` with no thread (AC-7). The `memories` live change is emitted by `store.remember` as 040 already does for the tab's writes.

**The question**, only for a named calendar that settles on none. `raiseCalendarQuestion` (`questions.ts:574`) takes `noteId` instead of `contentId` (one of the two), stores it in `questions.target_note_id`, and renders `Remembered "<name clipped to 40>". Which calendar?` under the 80-character bound, field `calendar`, `onAnswer: "write"`. A note raise never joins the open question (`questions.ts` ~615-645 joins rows through `previous_value.also`): when the turn or the conversation already has one open (`questions_one_open_idx` allows one per conversation), it returns false, nothing is raised and nothing is written, and the tool result says `calendar: null`. `answerCalendarQuestion` (`dumps.ts` ~2658) writes from the note when `target_note_id` is set. The pick's Undo already undoes the answer's write by `questions.answer_turn_id`; it gains the note join beside the content one (`dumps.ts` ~2305).

**Ask later.** "Add Kristina's birthday to my calendar" for a held memory is the same `memory` remember call with `calendar`; step 3's dedupe returns the existing id and step 5 runs for it if it is unlinked. Only in an untainted turn (step 2's taint), whatever the asked words.

**Undo of the turn.** The calendar half of the whole-turn Undo (`dumps.ts` ~2290-2335) gains notes: memories derived from this message with `event_ref` and no `event_found` are passed to `undoWrite`. `undoWrite` (`write.ts:390`) clears `notes.event_ref` beside `content.source_ref`. The memory itself is already undone as 038 built it.

**Forget.** `store.forget` and the tab's forget leave `event_ref` in place and, for a note with `event_ref`, enqueue `memory.event_delete { noteId }` with `runAfterSeconds` the Undo window and `idempotencyKey` on the note id (`jobs/queue.ts:136-164`). `restoreMemory` brings the memory back untouched. The job re-reads the note: still live (`deleted_at is null`, so restored) or no `event_ref`, it does nothing; a found event (`attrs.event_found`) is only unlinked; otherwise it resolves the calendar from the ref's prefix as the turn's Undo does and calls `undoWrite(target, ref)` (`write.ts:390`), which deletes with no notification, soft-deletes the copy, clears the link and returns false on any failure: AC-17 as written, and no `verdictFor` (the owner's unconfirmed delete). Not on `contentPurge`: that job is daily (`jobs/schedule.ts:52`), so the delete would wait up to a day, and it also purges rows a supersede retired, whose event now belongs to their replacement.

**One live holder.** An `event_ref` is held by at most one live memory. Moving it (a supersede, a fold, a dedupe that replaces) clears it on the row it leaves in the same statement, and every delete re-reads the note and acts only if that note still holds the ref.

**Edited in the tab.** `changeMemory` changes the text, so `note_fingerprint` changes. `memories_to_date` (`migrations/0089_reminders.sql:169-179`) requires `l.stopped_at is null`, so a memory whose reminders are off would never come back; 0100 replaces the function with `... or (n.event_ref is not null and l.fingerprint is distinct from note_fingerprint(n))`. `applyMemoryDates` (`labels.ts:158`) compares the new `yearly_on` with the old for a note with `event_ref`: a different day enqueues `memory.event_move { noteId, on }` (`performWrite` with action `edit` and scope `one` on the master, which moves the whole series; no verdict needed, since 019 confirms edits only with guests and there are none), no day enqueues `memory.event_delete` with no delay. A found event is never moved or deleted, only unlinked when the day goes.

**The pass.** `memories/pass.ts` refuses an `add` whose text reads (step 2's reader) to a date held by an active labelled memory whose flattened `name` words are all in the new text (AC-21). A supersede or fold of a memory with `event_ref` moves `event_ref` and `attrs.event_found` to the new memory and clears them on the old in the same statement.

**The calendar's side.** Where `sync.ts` (~455-490) handles an event gone from Google for a content row, the same pass clears `event_ref` on notes with that `source_ref`. Where unticking or disconnecting a calendar clears `content.source_ref` for it, notes are cleared by the `source_ref` prefix too.

**Today on the day.** The candidates query (`notifications/reminders.ts:138-162`) is a three-branch `union all`; every branch selects a `linked` column (`false` for rows and thread notes, `n.event_ref is not null` for memories), `Raw` and `toCandidate` carry it, and Today's Reminders section drops a linked memory's `day` window. The sends are unchanged.

## Data model

Migration `0100_memory_events.sql`:

```sql
alter table notes add column event_ref text;            -- '<calendar external id>:<event id>', as content.source_ref
create index notes_event_ref on notes (event_ref) where event_ref is not null;
alter table notes add constraint notes_event_ref_scope check (event_ref is null or scope = 'account');

-- questions.target_note_id already exists (013, asking back about a note) and is reused.

alter table connector_pending_writes add column note_id uuid references notes (id) on delete set null;

-- memories_to_date: a linked memory whose words changed comes back even with its reminders off.
create or replace function memories_to_date(...) ...;
```

`attrs.event_found` on the note (notes already carry `attrs`) marks an event offload linked rather than wrote. No date column: the date lives on `reminder_labels.yearly_on`, one place, as 042 has it. `notes.calendar_id` stays 038's answered-memory calendar and is not touched.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Memories: 20 typical, 300 cap (038). Linked ones: 5 typical, 40 heavy (everyone's birthday on a calendar). |
| Fan-out | One event per memory, one label per memory. |
| Growth | A birthday a fortnight for an active account; capped by 300. |
| Read pattern | `notes_event_ref` by source ref: the sync's gone-event pass and Undo, a handful a day. Today's candidates already read every dated memory (bounded at 300). |
| Write pattern | One remember and at most one calendar write per birthday dump; bursty only on a first import-like dump of many birthdays, bounded by the turn's tool budget. |
| Sort and filter | By `event_ref` equality (sync, Undo, purge); by account and scope (existing indexes). |

Pagination: none, every list is bounded by 300. Index: the partial `notes_event_ref`; purge already uses `memories_purge` on `purge_after`. No denormalisation.

## Interfaces

- **Worker, `harness/tools.py` `Memory`**: gains `on: str | None` (`^\d{2}-\d{2}$`), `name: str | None` (at most 60), `calendar: str | None` (their words for a calendar, or `"any"` when they asked for one without naming it). No field descriptions in the schema, as the model has none today: the meaning lives in `plan_v2.md`. The set measured 2,284 of the 2,400 budget on 2026-11-17 (`len(json.dumps(TOOLS)) // 4 + 1`), and `test_the_tool_set_fits_the_raised_budget` holds it.
- **Worker, `prompts/plan_v2.md`**: the `memory` paragraph gains the birthday exception and the fields; "A birthday or an anniversary is a memory" stops being contradicted by "Never on your own initiative". The calendar section says a birthday is not `add_content` and not `create_event`.
- **Worker, `prompts/memory.md`**: "a birthday you are shown a message for that a memory already holds adds nothing".
- **Core API remember handler**: request gains the three fields; result gains `calendar`.
- **Core API `/v1/memories`**: unchanged shape. The origin copy is client-side.
- **`@offload/widgets` `memoryOrigin`**: "You asked offload to remember this" becomes "You told offload this".
- **Jobs**: `memory.event_delete`, `memory.event_move`, background priority, idempotency key on note id and action.

## Dependencies

None new. Google's yearly all-day recurrence is already drafted for rows (`seriesFor`, `routes/tools.ts:1054`).

## Edge cases

- **29 February**: stored `02-29`; the draft's first occurrence is the next 29 February, and Google repeats it on leap years only. 042 already reminds on the 28th in other years.
- **A day in numbers**: "1/2" is never read, since no account records its date order; the unasked remember is refused `bad_date` and the model files it as it did before this spec.
- **The question unanswered**: the memory stands with no event, like a row whose question expired.
- **Ask before adding on**: the write waits as a pending write with `note_id`; confirming it calls `remember()`'s note branch.
- **A memory restored after its purge window**: impossible; `restoreMemory` refuses once `purge_after` passed, and by then the job has run.
- **The calendar's event deleted while a forget waits**: the job's delete gets a 404/410, which is success.
- **Two birthdays in one dump**: two memory calls and two events on the primary; only a named calendar that settles on none asks, and only the first such ask is raised.
- **No primary approved**: the first approved writable calendar by name; the person moves it in Google if that was the wrong one.

## Constitution check

- **SEC-1, SEC-2, OFF-3**: step 2's gate and AC-15's scoping are server-side; the model supplies no verdict and no account.
- **OFF-1**: logs and job payloads carry ids and outcomes only; `memory.event_delete` carries a note id and a source ref, which is an id.
- **OFF-4**: the found check reads the existing copy; nothing new is kept from Google.
- **OFF-5**: the three fields are schema-validated in the worker and re-validated in the Core API.
- **OFF-6**: the memory is inside the turn's Undo; the add follows 019's add rule; the delete waits for the forget's Undo and is the owner's allowlist entry of 2026-11-17, written into `docs/tech/decisions.md`.
- **OFF-8**: no prompt grows with account age; the tool definitions stay under budget.

## Reuse and skips

| Piece | Rung | Where |
| --- | --- | --- |
| Memory storage, purge, restore | In the codebase | `memories/store.ts` |
| Retire and replace for a corrected date | In the codebase, exported | `memories/pass.ts`'s `retire` |
| Delayed delete after the Undo | In the codebase | `enqueue` with `runAfterSeconds` and `idempotencyKey`, `jobs/queue.ts` |
| Every delete | In the codebase | `undoWrite`, `connectors/write.ts:390` |
| Reminder label | In the codebase | `reminder_labels`, `applyMemoryDates`'s values |
| Calendar choice, question, outward test, write, Undo | In the codebase | `routes/tools.ts` create_event's selection, `questions.ts`, `connectors/write.ts`, `tool-calls.ts` |
| Found-event check | In the codebase | `findEvents` over the copy |
| Date reader `memories/dates.ts` | New code, about 40 lines | No date parser in the Core API reads "Feb 1st"; the agent's dates are ISO. |
| `event_ref` column | New column | One text column; reusing `notes.calendar_id` would collide with 038's answered link. |

**Left out on purpose:** a `create_event` path for memories (the remember call carries the calendar words, so the model makes one call, not two, and no new tool definition is spent); a date column on notes; a date field or calendar mark in the tab; moving or deleting a found event; a backfill of existing birthday rows. **Shortcut:** an edited memory's event moves at the next nightly pass, not at the edit (`shortcut:` comment in `applyMemoryDates`; upgrade when someone notices the lag, by reading the edit's date with `memories/dates.ts` in `changeMemory`).

## Evals

Cases under `apps/agent/evals/principles/` for the memories principle, as AC-23 lists. The merge is blocked by: the forwarded-email and member-note birthdays writing no memory, the recurring bill and the one-off party staying rows, and the plain birthday writing a memory with no `add_content`. Running them needs the owner's yes in the session.

## Tech lead review, 2026-11-17

`project-lead` read this against the code. Folded in:

- **The copy has no rule.** `connector_events` keeps expanded instances with a `series_ref`, so the found check matches a series on the day and does not check the frequency; the limit is in the feature spec.
- **The found check reads every selected calendar** (`turnScope`), so Google's read-only Birthdays calendar counts, on the UTC day.
- **The forget's delete is a delayed job, not the daily purge**, which would have waited a day and could have deleted an event a replacing memory now holds. The one-live-holder invariant is stated.
- **Every delete is `undoWrite`**, which already does what AC-17 says; `performWrite` with `scope: "following"` would have truncated the series rather than removed it.
- **A birthday's question never joins a row's**, and one open question a conversation means a second goes unasked (owner's primary-calendar answer makes this rare).
- **A memory whose reminders are off is still re-dated** after an edit, by a change to `memories_to_date`.
- **There is no general supersede**; `retire` is exported.
- **Smaller rungs:** `noteId` in `writeThroughTool`'s options, the `event_ref is null` guard, `linked` across all three branches of the candidates union, and no schema descriptions on the tool.
- **Unasked birthdays do not ask which calendar** (owner, 2026-11-17).

Not changed: the dedupe stays in the handler, not the store, as the review leaned.

## As built, 2026-11-17

Where the build differs from the plan above, the build is right and this is the record:

- **Modules.** `memories/dates.ts` reads a day with its month in words; `memories/birthdays.ts` holds the unasked path (`rememberDay`), the label written from the turn, the dedupe, the correction and `carryEvent`; `memories/calendar.ts` holds `dayOnCalendar`, the found check, `nextOccurrence`, the `memory.event` job and `unlinkCalendars`. The correction retires inline rather than through an exported `retire`.
- **Words that stand for others.** "Born" or "bday" in the message count as saying birthday, "married" or "wedding" as anniversary, so "Sam was born on 3 May 2019" grounds "Sam's birthday is 3 May 2019.".
- **Done.** A memory the turn wrote is marked `attrs.day`, and `threadsFor` and `threadsForAll` count it as filed with no thread. A birthday already held, remembered again, is stamped `attrs.day_message`, and a tap or a later ask that put it on a calendar is found by `attrs.event_message`, so each of those turns draws Done, after a reload too.
- **The found check** reads `connector_events` directly over `turnScope`'s calendars of the person's own, by `series_ref` on the UTC day, rather than through `findEvents`, which returns no series. The link is `<calendar external id>:<series_ref>`.
- **Their own birthday** has no label, so its day is read from its words and its name from the call's `name`, checked as any name is. A question about it cannot be answered (the answer reads the label) and closes with nothing written.
- **One job kind**, `memory.event`, with `action` `forget` (enqueued by `store.forget` with the forget's ten-minute purge window as its delay; it acts only if the memory has stayed forgotten that long), `move` and `undate` (enqueued by `applyMemoryDates` when a linked memory's day changes, and by `carryEvent` after a correction or its Undo). Only `forget` deletes, through `undoWrite`; `undate` only lets the event go (security review: OFF-6 allowlists the forget alone); a move is an `edit` of the master through `writeThroughTool`. Each payload carries the account, which the job checks against the memory.
- **Which turn put it on.** The memory records the message whose turn linked its event (`attrs.event_message`), which the turn's Undo reads: a held birthday put on a calendar by a later turn is undone by that turn, not the one it came from. A correction records what it replaced (`attrs.replaced`), and its Undo (`undoCorrections`) brings that memory back with the event.
- **The member flag fails closed.** An unasked remember needs `afterMembers: false` from the worker; a missing flag is refused as `untrusted_turn`.
- **A question's answer that does not go through** opens the question again and answers 502, as a row's does, so the chips come back with the failure line.
- **Today** reads which memory candidates are linked in `begunOf`, one query, rather than a column on every branch of the candidates union.
- **Unticked or disconnected** calendars clear the link in the untick route and before the disconnect's revoke; an event gone from Google clears it in `letGo`, which now runs whenever anything went, not only when a row remembered an event.
- **`readable_notes`** is made again in 0100 so the view carries `event_ref`, as 0086 did for its columns.
