# 052 Replies in place, impl-spec

**Status:** drafted 2026-11-17 from `feature-spec.md` as revised after review. Migration **0101** is reserved on the board.

## Shape

The change has four parts:

1. **The Core API learns what a turn changed.** A new table records it.
2. **The Core API serves each turn's reply parts.** It answers which rows, which calendar period, which memories and which pills, as ids and kinds, resolved per read under the reader's live access.
3. **`@offload/widgets` words them.** It is pure code, shared by both clients.
4. **Each client draws them** from components it already has: `AnswerResult`, `MonthGrid`, `UndoLine`, `InPlace`, `Chip`.

The model sees none of it. The one prompt change is a line of `answer.md`.

## Data flow

### Filing turn, writing

The six write tools record the previous value of what they touch before they write it:

| Tool | Records |
|---|---|
| `edit_content` | title, body, `occurs_at`, `due_at`, `all_day`, `rrule`, `location` (offload's own columns) |
| `move_content` | `thread_id` |
| `complete_content` | `done_at` |
| `archive_content` | `archived_at` |
| `rename_thread` | `name` |
| `set_thread_preference` | the preference's previous value |

**How it is written.**
- Each tool inserts one `turn_changes` row in the tool's own transaction (`apps/core-api/src/routes/tools.ts`, the per-tool branches at ~L1245-1924), keyed by the dump message the tool call carries.
- `on conflict (message_id, target_kind, target_id) do update set previous = excluded.previous || turn_changes.previous`. A field already recorded keeps its value from before the turn, and a field a second tool touches is added: an edit then a tick keeps both `title` and `done_at`.
- `move_content` calls `moveContent` outside the tool's transaction (`tools.ts:1660`), so its record is written just before the move. A move that then fails leaves a record whose `previous` equals the current value, and restoring it changes nothing.
- 030's `place_prior` already does this for three place fields. `turn_changes` holds those fields too, and `place_prior` stays as it is.

**What is never written.** A connected app's raw body. A calendar-derived row's previous value is offload's own columns plus the row's `source_ref` (OFF-4).

### A new dump, retiring the record

When a dump message is inserted (`POST /v1/dumps`, `routes/dumps.ts`), the same transaction sets `previous = null` on the account's rows that still hold a value, are not this message's, and are older than eight seconds (`where account_id = $1 and previous is not null and created_at < now() - interval '8 seconds'`, through `turn_changes_live_idx`):
- **A quick second dump keeps the first turn's Undo.** A turn still inside its first eight seconds keeps its values, and the next dump after that retires them.
- **The ids stay.** A reopened slice can still find the rows a turn changed.
- **The values go.** Late Undo is retired, and nothing a person wrote sits in a working record past its use. This is the purge AC-27 asks for, and it keeps the privacy page's *working records … only as long as the feature needs them* true.

### Reading a conversation

`GET /v1/conversations/current` and `GET /v1/messages/:id` (`routes/dumps.ts` ~L1284, ~L1367) gain, per turn, a `reply` object. It is computed by one new batched function, `repliesFor(viewerId, turns)`, beside today's `threadsForAll`, `foundFor` and `photosForAll`.

```ts
reply: {
  slices: Slice[]          // at most 3, in the order the turn wrote
  also: ThreadRef[]        // the threads past the third
  pills: Pill[]            // at most 2
  summary: { kind: "new" | "filed" | "moved" | "ticked" | "started" | "remembered" | "added"; count: number } | null
  resultAt: string         // when the turn's result arrived; 043's clock and the late phase derive from it on the client
                           // the client draws Undo while the turn is the conversation's latest and summary is set; the route decides authoritatively
}
type Slice =
  | { kind: "list"; thread: ThreadRef | "loose"; openCount: number; rowIds: string[]; turnRowIds: string[]; noteIds: string[]; previous: Record<string, Previous> }
  | { kind: "newThread"; thread: ThreadRef; rowIds: string[]; noteIds: string[] }
  | { kind: "memories"; memoryKind: string; memoryIds: string[]; turnMemoryIds: string[] }
  | { kind: "calendar"; period: { from: string; to: string }; day: string; turnRowIds: string[]; span: boolean }
  | { kind: "removed" }
type Pill = { kind: "date" | "calendar" | "remind" | "share" | "directions"; rowId?: string; calendar?: { id: string; name: string; color: string }; person?: { accountId: string; name: string } }
```

**How `repliesFor` works.** It runs one query per source over the whole page of turns:
1. **What the turn made.** Content, notes and memories by `derived_from_message_id = any($messageIds)`. The indexes exist: `content (derived_from_message_id)` and its pair with `tool_call_id`.
2. **What it changed.** `turn_changes` by `message_id = any($messageIds)`.
3. **The answer's rows.** `message_content`, as `foundFor` reads it today, for answering turns.
4. **Live access.** Every row id from 1 to 3 is joined to `thread_members` with `account_id = $viewer and state = 'accepted'`, or to the viewer's own default thread. A row the viewer cannot read now is dropped, and its thread is never named. A slice left empty becomes `{ kind: "removed" }`, drawn as *Since removed* (AC-24).
5. **The neighbours.** For the list slices that remain: one query with a lateral join per (turn, thread). It takes the up to two rows that are open now, were created before the turn, and sit nearest the turn's rows in the thread's order. It uses `content (thread_id, priority desc, created_at desc)`.
6. **Open counts.** The same `threads.counts` the page already carries.

**Turning rows into slices.**
- A row or event with a date goes to the **calendar** slice. Its period is:
  - the two weeks from this week's Monday, when the date falls in them;
  - otherwise the date's month, in the account's zone (027's `zoneOf`).
- Everything else goes to **list** slices, by thread, in the order written.
- A thread the turn created is a **newThread** slice.
- Memories go to **memories** slices, by kind. Each carries the turn's memories plus up to seven others of that kind, newest first.

**Answering turns.**
- Their `found` reads become list slices.
- The new `messages.shown` column decides the calendar slice:
  - `{span: {from, to}}` gives a calendar slice with `span: true`;
  - `{on: date}` gives a calendar slice with `period` set to that month and `day` set to the date.

### Calendar slice, on the client

**No new endpoint.** The client draws the grid with `monthFor` (`packages/widgets/src/timeline.ts:423`) from `GET /v1/today/month?from&to` (`routes/today.ts:45`). It lists the picked day from `GET /v1/today/day?date` (`readDay`).
- Both reads are cached per key for the session.
- They are fetched only when the slice is on screen, through the web's `IntersectionObserver` and the phones' list viewability.
- For a span, the client reads each day of the span that has a count. That is at most seven reads, run in parallel.
- `turnRowIds` marks the turn's own entries.

**Details in place** come from the `readDay` entry, which does not carry all of them today. So `readDay` is widened, and Today pays for two fields:
- `todayEvent` (`today/day.ts:68`) gains `place`: 030's resolved place, its name and the coordinates `directionsUrl` needs, beside its `calendarName`.
- The day's content rows (`contentRow` and `agendaRow`, `routes/threads.ts:334-418`) gain `calendar: { name, color } | null` beside `onCalendar`.

Both come from columns the existing queries already join, so the change is two selected columns and two optional fields in the response.

### Pills

`repliesFor` decides pills from the record, using the feature-spec's table:
- **date**: exactly one undated to-do written.
- **calendar**: exactly one timed row on no calendar, and exactly one writable approved calendar.
- **remind**: exactly one dated row of the viewer's, in a thread with one accepted member, and `is_reminder` false.
- **share**: a thread created this turn, the dump message not `derived_from_untrusted` and not from mail or a calendar, and the dump's own words contain a connection's `display_name` or first name as a whole word. Exactly one connection matches.
- **directions**: the turn's one entry has a resolved place.

Order, the cap of two, and none on a turn with an open question are applied here, once, so both clients show the same pills.

**What a tap does.**
- **date, share, directions** are client-only. They open, respectively, the row's sheet or edit modal at its date, 022's share confirmation with the person preselected, and 030's `directionsUrl` (`packages/widgets/src/map.ts:211`).
- **calendar and remind** call a new endpoint:

`POST /v1/turns/:turnId/pills` with body `{ kind: "calendar" | "remind", undo?: true }`. The server:
1. Loads the turn by `turn_id` and `account_id = caller`, and answers 404 if it is not theirs.
2. Re-runs the pill rules for that turn as the caller. If the kind is not offered now, 409 `not_offered`.
3. **calendar** calls the existing one-row calendar write, extracted from `create_event`'s path in `connectors/tool-calls.ts`, with the calendar given explicitly and `pickForThread: false`. It goes through `outwardTest`, the 2026-10-28 version. When the test asks first, the response is `{ confirm: pendingId }`, and the client shows the existing pending-write confirm (`POST /api/calendar/pending/:id/:answer`). `undo: true` deletes the event Google-first by its `source_ref`, through the path `undoCalendarWrites`' filed loop uses (`dumps.ts:2276`). It does not use `undoToolWrites`, which unwinds only confirmed edits and deletes. It is accepted without asking only inside the pill's own eight-second line, the same exception the turn's Undo has (2026-10-28). After that it is 409, and the event is removed from its row, where 019's delete confirm applies.
4. **remind** calls `setReminders(trx, { accountId, of: "content", id, on: !undo })`, the existing 042 function behind `PUT /v1/reminders`.

The client draws 043's **under** line beneath the pill's slice for eight seconds, and its Undo sends `undo: true`.

### Undo

`POST /v1/turns/:turnId/undo` (`routes/dumps.ts` ~L1728) is unchanged on the wire. Inside it, the server sets `late = now() - turn.result_at > 8s`, by server time, never by a client flag.

**Not late.** `undoTurn(accountId, turnId)` runs as today. It additionally restores `turn_changes.previous` inside its transaction, where `previous` is not null.

**Late.** `undoTurn(accountId, turnId, { keepMessageId: dumpMessageId, since: resultAt })`, the existing 026 options (`dumps.ts:2085`):
- The dump and its blobs stay.
- A row changed after `since` is left as it is and returned in `changed`. The restore of `turn_changes` uses the same `since` comparison against the row's `updated_at`, and a thread's.
- A calendar removal goes through `outwardTest({ deleting: true })` first. A removal that has to ask becomes a pending write and returns `{ confirm: pendingId }`, and the rest of the Undo proceeds.
- The response gains `changed: string[]` and `confirm?: string`. `changed` lists the titles of the turn's rows and threads left as they were, collected by one select (`updated_at > since`) over the turn's targets before the restore.
- `stayed` keeps its existing meaning, memories that would not fit back (`memories/store.ts:288`).

**Refused.** If the server refuses or cannot be reached, the client puts the turn back. That behaviour exists in `packages/widgets/src/turn.ts:78`, and the line shows Retry.

### The answering worker

`apps/agent/src/offload_agent/worker.py`'s answered result (`_post_result`, ~L1600) gains `shown`:
- from the `list_agenda` call's window, when the turn's reply rests on one agenda read: one day gives `{on}`, longer gives `{span}`, so *what's on Friday?* draws Friday's list under the grid;
- `{on}` from a lookup whose structured outcome is a `date` (016's reader, `want: date`).

The server's turn-result schema (`routes/internal.ts:161`) accepts it, bounded to one ISO date or one span of at most 62 days, and stores it in `messages.shown`.

`prompts/answer.md:51` is rewritten positively:
- *A set of calendars or connected apps: nothing is drawn beside the reply, so the list is the reply.*
- A new line: a read of days is drawn beside the reply, so its answer is the count.

Principle 17's `statement` and `sources` (`apps/agent/evals/principles/17-the-answer-is-the-reply.json`) are updated in the same change and cases are added, so the prompt and the principle agree.

### Clients

**Shared (`packages/widgets`, new `reply.ts`):**
- `summaryWords(summary)`: *4 new*, *Moved*, and so on.
- `pillLabel(pill)`: *Add a date*, *Add to {calendar}*, *Remind me*, *Share with {first name}*, *Directions*, at most 24 characters, with the calendar name cut by code at a word to fit.
- `alsoLine(also)`.
- `sourceLine(sources)`: three domains, then *and N more*.
- `changedLine(changed)`.
- `periodLabel(period, today)`: *in 19 weeks*.

These are pure, and tested with turn records (AC-23).

**Web** (`apps/web/src/components/shell/Composer.tsx`):
- `TurnFooter` (`components/shell/TurnFooter.tsx`) is deleted, along with `footerFor` (~L1164) and its two renders (~L1328, ~L1411).
- `Reply.tsx` draws the parts in order:
  - `ListSlice` is `AnswerResult`, its header already the thread's icon and count, given `turnRowIds` for the mark;
  - `CalendarSlice` is `MonthGrid` with a new `still` prop that hides its arrows and Today and drops `onStep`, plus a day list drawn with `InPlace` for details;
  - `MemoriesSlice` is `Chip`s;
  - `Pills` is `Chip`s in 44 targets;
  - `SourceLine`;
  - `UndoLine` with a new `turn` form.
- The plate line is skipped for a dump made in the conversation (`offerUndo`, ~L447).

**Mobile** (`apps/mobile/components/shell/Conversation.tsx`):
- The same change. `TurnFooter` (~L698) is removed, and `Reply.tsx` is built from `AnswerResult`, `components/shell/MonthGrid.tsx` (`still`: no arrows, no Today, no horizontal pan, so the sheet's drag and the list's scroll are never fought), `InPlace` and `UndoLine` (`turn` form).
- `Plate.tsx` skips the plate line for conversation dumps.

**The change mark** plays when a turn's result arrives live in this session, which is the existing writing-to-result transition, and never on a load. That keeps it to once per turn per device without storage.

**Over the air.** No native module, no permission, no `app.json` field: this ships as an update at the same `version`.

## Data model

**Migration 0101.**

```sql
create table turn_changes (
  message_id   uuid not null references messages (id) on delete cascade,
  account_id   uuid not null references accounts (id) on delete cascade,
  target_kind  text not null check (target_kind in ('content', 'note', 'thread')),
  target_id    uuid not null,
  tool         text not null,
  previous     jsonb,          -- offload's own columns; null once a later turn retires it
  created_at   timestamptz not null default now(),
  primary key (message_id, target_kind, target_id)
);
create index turn_changes_account_idx on turn_changes (account_id);
create index turn_changes_live_idx on turn_changes (account_id) where previous is not null;

alter table messages add column shown jsonb;  -- {span:{from,to}} | {on:date}, offload's answering message only
```

- **The ledger** gains `"turn_changes.account_id": cascade` (`accounts/ledger.ts`).
- **Export (035)** adds `turn_changes` rows of the account, with `previous` as stored.
- **`messages.shown`** is covered by the existing `messages` entry.

## Volume and access

| Field | `turn_changes` | the `reply` on a conversation page |
|---|---|---|
| Records per account | ~6 a day typical (a third of ~15 turns change one or two existing rows); 50 a day heavy. Two years: ~4,400 typical, ~36,000 heavy. Only the latest turn per conversation holds a non-null `previous`. | not stored, computed per read |
| Fan-out | changes per turn: 1 to 3 typical; 30 heavy ("tick everything in Groceries") | per turn: ≤3 slices, ≤8 rows each, ≤2 pills; per page: 50 turns |
| Growth | linear in turns; values bounded to one turn per conversation | none |
| Read pattern | conversation page loads: by `message_id = any(50 ids)`; Undo: by `message_id` | the conversation sheet on the phones and the composer on the web, on open and on each turn's result; rows re-read when the conversation regains focus |
| Write pattern | inside a tool call, at most the turn's tool count, bursty with a turn; plus one retiring update per dump, touching only rows still holding a value, through `turn_changes_live_idx` | none |
| Sort and filter | `message_id` in a set; `account_id` for delete | per (turn, thread): open rows by `priority desc, created_at desc`; membership by `(thread_id, account_id, state)` |

**What follows:**
- **Pagination.** Unchanged. The conversation already pages 50 messages, and replies ride that page. The calendar slice's month and day reads are client-side, lazy and cached, at most three in flight.
- **Indexes.** The `turn_changes` primary key leads with `message_id`, covering the page read and Undo. `turn_changes_account_idx` serves the cascade and export. The neighbour lateral uses `content (thread_id, priority desc, created_at desc)`. Membership uses `thread_members`' existing unique `(thread_id, account_id)`. No new content index.
- **Normalisation.** Nothing is denormalised. A slice holds ids and kinds, resolved at read, which is the rule `search/found.ts` set.
- **Partitioning.** None.

**A shortcut, stated.** Slices do not subscribe to 048's live connection. They re-read on focus and on each new result. `shortcut: a row ticked elsewhere shows stale in an open reply until focus; subscribe to the thread's changes when that is seen to confuse`.

## Interfaces

- `GET /v1/conversations/current`, `GET /v1/messages/:id`: each turn gains `reply` (above). The schema is extended in `dumps.ts:281` and `:320`.
- `POST /v1/turns/:turnId/undo`: the response gains `changed?: string[]` and `confirm?: string`.
- `POST /v1/turns/:turnId/pills`: new. Body `{kind, undo?}`. Responses 200 `{ok}` or `{confirm}`; 401; 403 on a bad origin, as `PUT /v1/reminders`; 404 when the turn is not the caller's; 409 `not_offered`.
- `POST /internal/v1/turn-result`: the answered body gains `shown?`.
- `MonthGrid` gains a `still` prop on both clients; `UndoLine` gains the `turn` form on both clients.
- `AnswerResult` gains three props on both clients:
  - `count`: the thread's open count, hidden at zero. Today it draws `rows.length` (`apps/mobile/components/shell/AnswerResult.tsx:131`).
  - `marked`: the rows that take the change mark.
  - `notes`: drawn under a **Notes** section.
- `readDay` gains `place` on events and `calendar` on content rows.

## Dependencies

None new. React, React Native, Kysely, zod, and the existing `@offload/widgets`.

## Edge cases

- **A turn that wrote into four or more threads.** Three slices plus *Also in*.
- **The rows changed several times in one turn.** The first `previous` wins.
- **A row deleted by a later turn.** It drops from the earlier slice, and Undo's restore skips a deleted row.
- **A shared thread.** Another member's rows appear in the slice. Another member's calendar event has a title and a time only (019). A late Undo never overwrites a member's later edit (`since`).
- **The viewer left the thread, or the thread was deleted.** *Since removed*, no name.
- **Two writable calendars.** No calendar pill. The row's own control, or 019's question, decides.
- **A connection's name that matches a common word** (*Will*, *May*). Whole-word match on the dump's own words only. A false offer opens a confirm and sends nothing.
- **Undo pressed on a turn whose next dump is in flight.** The client retires the line at send. The server accepts an Undo on any of the caller's turns as today, and the late rules bound it.
- **Clock skew.** `late` is decided by server time only.
- **A span answer over 7 days** (*what's on this month?*). It is a month period with `span: true`, and the list shows only days with entries, read lazily as they come into view.

## Reuse and skips

| Piece | Rung | Where |
|---|---|---|
| Late Undo's keep-the-dump and changed-since guard | already here | `undoTurn` `keepMessageId`, `since` (026) |
| Calendar grid and its data | already here | `MonthGrid` (both), `monthFor`, `/v1/today/month`, `/v1/today/day` |
| Details in place | already here, widened | `readDay` entries, plus `place` on events and `calendar` on rows; `InPlace` / `useInPlace` |
| List slice | already here, three props | `AnswerResult` (both clients), plus `count`, `marked` and `notes` |
| Undo line | already here, one new form | `UndoLine` + `turn` form |
| Calendar write from a pill, confirm, undo | already here | `create_event`'s one-row write, `outwardTest`, pending-write confirm, `undoCalendarWrites`' delete by `source_ref` |
| Remind from a pill | already here | `setReminders` (042) |
| Share, date, directions | already here | 022 confirm, row sheet or edit modal, `directionsUrl` |
| Wording | new code, small | `packages/widgets/src/reply.ts` |
| What the turn changed | new table | `turn_changes`. `place_prior` was the pattern; `message_threads` is thread-level only and could not hold a row id |
| `reply` on the turn | new code | `repliesFor` beside `foundFor` |
| Pill tap | new route | `POST /v1/turns/:turnId/pills`. Two kinds; the rest stay client-only |
| What an answer showed | new column | `messages.shown` |

**Deliberately left out:**
- live slice updates (the shortcut above);
- layout-specific slices;
- browsing months in a reply;
- any persisted "mark played" state;
- a governed `Slice` design-system component (built per client, as 043 did `UndoLine`);
- a new token.

## Constitution check

- **DEV-1** Compliant. Each new piece is above, at its rung. The calendar slice adds no endpoint.
- **DEV-2** Compliant. 004, 013, 016, 019, 042 and 043 are amended in the feature-spec. The decisions logs are updated in the same change (tasks T0).
- **DEV-3** Compliant. Nothing new.
- **QUAL-1** Compliant by plan. Every task starts with its failing test.
- **QUAL-2** Compliant. `repliesFor` reads, `reply.ts` words, and components draw.
- **SEC-1** Compliant.
  - The share pill never comes from `derived_from_untrusted` words.
  - No reply string enters a prompt.
  - `shown` is bounded by schema at the internal boundary.
- **SEC-2** Compliant.
  - Slices are resolved under live membership on every read.
  - Pill taps re-derive their targets.
  - `late` is server time.
- **DATA-1** Compliant. This section.
- **OFF-1** Compliant.
  - A late Undo keeps the dump.
  - Events and traces carry ids, kinds, counts and outcomes. The new route logs `turnId`, `kind` and outcome only.
  - `turn_changes.previous` is derived working state and is nulled at the next dump.
- **OFF-2** Not applicable. No blob or key path.
- **OFF-3** Compliant.
  - Membership is read live.
  - A late Undo's `since` keeps a co-member's later edit.
  - The remind pill only in a thread of one.
  - A calendar write through the acting account's own connection, as 019.
- **OFF-4** Compliant. `previous` is offload's columns plus `source_ref`, never a provider body.
- **OFF-5** Compliant. The only new model-adjacent value, `shown`, comes from tool arguments and the reader's structured outcome, already schema-validated, and is revalidated at the internal route.
- **OFF-6** Compliant.
  - The first eight seconds of Undo are unchanged.
  - A late Undo extends reversal. Its outward part, a shared-calendar removal, confirms.
  - The calendar pill is 019's conditional allowlist entry, applied to one row. Its undo deletes without asking only inside its own eight seconds, as the turn's Undo does.
  - Remind me is an offload-owned surface.
  - Share confirms (022).
  - The allowlist entry in `docs/tech/decisions.md` is amended (T0).
- **OFF-7** Flag, justified. The change diverges from governed contracts: `TurnFooter` is retired, `AnswerResult` is reused as a slice, `UndoLine` gains a form and `MonthGrid` a `still` prop. Each gets an entry in `.claude/skills/offload-design/decisions.md` with **Design system impact** (T0), and lint's generated contract rules are refreshed at the next design sync.
- **OFF-8** Compliant. Nothing is added to any prompt. One line of `answer.md` is narrowed.

**Privacy policy** (`apps/web/src/app/(marketing)/privacy/page.tsx`): no line becomes untrue.
- No new company receives content.
- The working record is kept *only as long as the feature needs it*, which is until the next dump.
- Calendar writes still confirm whenever they would notify people.
- Nothing new reaches a model.

## As built, API (2026-11-17)

Where the build moved from the sections above. The code is the reference.

- **The turn's result time.**
  - `messages.settled_at` (0101) is stamped on the person's message when the turn's result arrives, whatever the outcome.
  - The undo route decides `late` from `coalesce(settled_at, created_at)` by server time, and the wire carries `resultAt` from it.
  - 0101 also recreates `readable_messages`, whose `select messages.*` would otherwise hide the two new columns (`predicate.test.ts`).
- **New threads are found by their record.** A thread records nothing about the turn that made it, so `create_thread` writes a `turn_changes` row with `tool = 'create_thread'` and an empty `previous`, and `repliesFor` reads new threads from it.
- **The changed-since guard on calendar rows.** Taking an event off a calendar touches its row after `since`. So `undoCalendarWrites` now returns the rows it unlinked, and `undoTurn` removes those regardless of `since`. Without this, a late Undo left the row behind.
- **The late Undo's confirm.** `POST /v1/turns/:turnId/undo` answers `{ undone: false, confirm: <outward line> }` without doing anything when a late Undo would remove an event others can see. The person's yes is the same call with `?confirmed=1`. It is a query rather than a body, so clients from before post what they always posted. No pending-write record is made: the confirm is the Undo itself, asked again.
- **The wire field is `parts`, not `reply`.** The stream's step and the single-message read already use `reply` for the sentence. `parts` rides:
  - the tail, on the person's message;
  - `GET /v1/messages/:id`;
  - the stream's `done` event.
- **Rows by id.** `search/found.ts` now has `rowsByIds(ids, viewer)`, which reads `readable_content` as the viewer. `foundFor` uses it, and so do slices. One row shape serves answers and replies.
- **The neighbours** are the two most recently filed rows that are open now and were created before the turn, not the two nearest in the thread's order. That is one lateral query for the page, and simpler to state.
- **The summary has an eighth kind, `changed`**, for a turn whose only writes were archives, renames, preferences or a mix. It needs words in `reply.ts`; see the shared tasks.
- **Remind me** does what the row sheet's switch does:
  - it switches on 042's label (`setReminders`);
  - it sets `is_reminder`, so the row counts as asked for and a clock time is honoured;
  - its undo clears both.
- **The calendar pill's undo window.** It is `attrs.pill_calendar_at`, accepted within ten seconds (eight, plus the round trip) and refused after (409).
- **The calendar pill's confirm.** It answers `{ confirm, pendingId }`, and the client uses the existing pending-write confirm.
- **`readDay`** takes `{ past: true }`, and `GET /v1/today/day` takes `past=1`, for a reply showing a day up to a year back. `agendaQuery` now selects the row's location and place, so Today's rows carry them too.
- **`shown`** is validated at the internal boundary as one real date, or a span of at most 62 days in order. It is written on offload's reply and cleared on a re-answer that shows nothing.
- **After the API reviews (2026-11-17):**
  - **The Undo's restore is scoped to the reader.** `restoreChanges` reads a row through `readable_content` and a thread through an accepted membership, so a row or a thread the reader has left is neither changed back nor named. It nulls the values it put back.
  - **The export carries only what the person can still read.** `turn_changes` reaches it only for rows in `readable_content` and threads the person is still in.
  - **One reading of a turn's events.** `eventsOfTurn` is the reading shared by `undoCalendarWrites` and the late Undo's confirm. The confirm also asks about the turn's own performed tool writes (`connector_pending_writes` confirmed), each treated as a removal, the stricter test, so a late Undo never touches a calendar others see without asking. Rows that found an event (`calendar_found`) are never in the set, since the Undo only unlinks them.
  - **Neighbours exclude the turn's own rows inside the query**, before the limit, so a turn that changed the newest open row still shows two.
  - **The agent normalises a window's midnight** (`_moment`), so the same week written two ways is one read.
  - **The calendar pill's ten seconds stay:** eight on screen, two for transit.
  - **Known and accepted:** `?confirmed=1` is the person's own client saying yes to their own Undo, with no server record that the line was shown (security review, medium; the owner's call). An account that never dumps again keeps its last turn's values until deletion (`shortcut:` at the retire).
  - **A purged row takes its earlier values with it.** `turn_changes.target_id` has no foreign key, so `content.purge` deletes the records of every content row, note, message and thread it destroys, by name. Without it a row the person deleted kept its old title in the record until their next dump, and the privacy page says what you delete is deleted.

## As built, clients (2026-11-17)

- **The component names.** It is `ReplyParts.tsx` on both clients, since the web already had a `Reply.tsx` that renders offload's markup. The calendar is `CalendarSlice.tsx`.
- **The turn form of the undo line.**
  - On the phones it is a separate `TurnLine` export of `UndoLine.tsx`, because `UndoForm` lives in `@offload/widgets` and a turn's line is not an eight-second store entry.
  - On the web it is a `turn` form plus a `clock` prop.
- **Details expand by a plain conditional render on both.** `InPlace` is the Undo-in-place list, not a motion.
- **The question bubble** sits after the reply's parts for answered turns too (the spec's order), no longer inside offload's bubble.
- **Date and share pills.**
  - On the phones they push the thread page with `edit=when` or `share=<accountId>`, which opens the row sheet at its date or the share sheet with that person picked.
  - On the web, Add a date opens the row's edit modal as Today does (focus starts on the title). Share opens `ShareModal` with a `preselect`.
- **The pill's own line** after a tap reads *Added* (from `summaryWords`) or *Reminder on*. *Reminder on*, *Since removed* and *Not on a calendar* are client strings with no widgets function yet.
- **Lazy reads.**
  - On the phones they run on measure-at-layout, plus the sheet settling and a scroll ending, with at most three in flight.
  - On the web they use `IntersectionObserver`.
  - A reply's month and day reads pass `past=1`, and `readMonth` takes `{ past }` as `readDay` does.
- **The two-week grid** always starts on Monday, matching the server's period. The month grid follows the person's week start.
- **A partial turn** draws its slices with no pills and no undo line, so Finish and Undo never show together. A turn from another device shows its summary without Undo.
- **AC-9's "was" line.**
  - The API sends `previous` on calendar slices as well.
  - Both clients draw *was {day}, {time}* under a moved entry while the Undo holds the values.
- **The memories slice** carries up to seven others of the kind, unmarked, after the turn's own.
- **The calendar slice's to-do ticks** are display only on the phones (`shortcut:`); list slices tick.
- **After the client reviews (2026-11-17):**
  - **The phones forget a reply's reads at sign-out**, as the web does, so the next account on a shared phone never sees the last one's calendar.
  - **A calendar slice reads again on a change.** Its reads are keyed by the last filing or the last change heard (048's `changed`, which includes coming back to the tab or the foreground), so the event a pill just wrote shows its calendar. Old keys stay until sign-out (`shortcut:`).
  - **Shared in `@offload/widgets`:** `gridFor` (the web had drawn a week's span as two weeks), `wasLine`, and `calendarColour`, which passes a provider's colour into a style only when it is `#hex` or `rgb()`, so a value like `url(...)` never loads.
  - **Another member's event** is hidden by `!mine` on both clients (019). The phones had hidden by source, which hid the person's own connected calendar and showed another member's place.
  - **A span lists its first seven days** with entries on both clients.
  - **A second Undo press while the first is out sends nothing**, on both clients and in both phases.
  - **A refused pill** (404 or 409) goes, with *That didn't go through* and no Retry, since asking again cannot help.
  - **Web reply rows open their edit modal** on tap, as the phones open the row sheet.
  - **The phones' pill is QuickReplies' chip**: 30 inside 44, growing with the text, painted per platform.
  - **One order and one word:** the labels row sits after *Also in* and before the pills on both clients, and a late Undo's calendar question is answered with 019's **Remove it** or **Not now**.
  - **From the web browser pass (2026-11-18):** a span picks no day until one is tapped, since its list is every day; a picked day gone by keeps its white on the web (Today never picks a past day, so the grid had not met one); and a late Undo names a row the turn made that somebody changed since, with the rows it put back, rather than reading *Undone* while the row stays.
  - **Accepted, open:** a late Undo's one confirm covers every shared calendar the turn wrote to, with the server's one generic line (security review, low; the same owner's call as `?confirmed=1`). The phones' `share` and `edit` thread params are honoured from any link; an unknown person ticks nothing and nothing is shared without a press (low). The calendar slice's own tick is display only on the phones.
