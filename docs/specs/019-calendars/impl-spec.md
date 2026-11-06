# 019 Calendars, implementation spec

## The shape in one paragraph

012's connector keeps its OAuth flow, its vault, its sync job, its proposal path and its Undo. What changes is where an event lives and who decides where a write goes. The sync stops filing events into threads and writes **one row per event per calendar** into a new `connector_events` table on the connection, held for the window and no longer. A thread holds **picks**, rows in `thread_calendars` naming the calendars it reads through, one per member per calendar. The rail, the agent's calendar reads and the write target all resolve through the picks; Today and an answering turn from outside a thread resolve through every approved calendar. `connector_calendars` loses its thread, its rules and its `is_shared`, and gains a **participant count** read from Google's access list under one added scope, at connect, on the full pass and on the write path. The outward test reads that count and one new account switch. `create_event` takes the row it is putting on the calendar rather than a calendar id, and when the row's thread has two or more writable calendars, or none at all, the turn asks which, through 018's `questions` table with a sixth field whose answer is applied through 012's write path.

```
approve   Settings ──► PATCH /api/connectors/calendars/:id {selected}
                         └─ un-tick ──► delete thread_calendars + connector_events for it

sync      calendar.sync ──► events.list(syncToken) ──► connector_events (per calendar)
          full pass     ──► calendarList + acl.list ──► summary, colour, participants
                        ──► delete events behind the window

pick      thread ──► PATCH /v1/threads/:id/calendars/:calendarId {picked}
                         └─ membership + calendar ownership, both server-side

read      rail   ──► GET /v1/threads/:id/events?from&to ──► every member's picks ∩ approved ──► connector_events
          agent  ──► find_events(from,to) ──► looking-at thread's picks, or every approved calendar; the copy, never Google

write     create_event(content_id) ──► the acting account's writable picks in the row's thread
                 1 ──► acl.list live ──► outward test ──► do, or propose
                 2+ ──► questions row (field=calendar) ──► tap ──► outward test ──► do, or propose
                 0, and approved writable calendars exist ──► questions row ──► tap ──► pick + write
                 0, nothing approved ──► {noCalendar}
```

## Data flow

### Approving

`PATCH /api/connectors/calendars/:id` with `{selected}` only; unknown keys from older clients are stripped by the schema rather than refused. Ownership through the connection, as 012 wrote it. Ticking sets `selected` and enqueues `syncNow`. Un-ticking clears `selected` and, in the same transaction, deletes every `thread_calendars` row naming the calendar and every `connector_events` row on it. The reads below also intersect with `selected` and with the connection being active and not deleted, so nothing resolves through a gap.

### The sync

`syncConnection` loops over `selected` calendars as before, with four changes.

1. **The target is `connector_events`.** `mapEvent` loses `threadId`; `upsertEvent` writes to the new table, keyed by `(calendar_id, source_ref)`. Reconciliation soft-deletes as before, now against the new table.
2. **A full pass refreshes the calendar list.** `listCalendars` runs on the full pass and at connect: new calendars are inserted unapproved, a calendar Google no longer returns is deleted with its events and picks by the foreign keys, and `summary`, `access_role`, `primary` and `colour` are updated. Today the list is read once at connect and never again, and 012's nightly full pass was specified and never enqueued; the daily supervisor now enqueues one full pass per active connection alongside its stalled-chain check.
3. **A full pass reads participants**, below.
4. **A full pass enforces the window.** Rows whose end, or start when there is no end, is older than sixty days are deleted, not soft-deleted. The copy holds the window and nothing older: it is a cache of somebody else's system, and 012's "aging out is not deletion" was about rows in threads, which no longer exist.

### Participants

For every calendar with `access_role = 'owner'`, at connect, on each full pass and on the write path, `acl.list` on the calendar. The count is:

```
participants = number of rules with role <> 'none' and scope.type = 'user'
             + (any rule with role <> 'none' and scope.type in ('domain','group','default') ? 2 : 0)
```

Google returns the owner as a `user` rule, so a calendar only the person sees counts 1. A `default` rule with role `none` is how Google expresses a private calendar and counts nothing. A domain, group or public rule with a role is many people offload cannot count, so it counts as more than one on its own. **The rules are read, counted and dropped**: no address, name or rule reaches a row, a log line or an event. The count is written to `connector_calendars.participants` with `participants_read_at`.

A calendar the account does not own gets `participants = null` and no read: the scope covers "calendars you own" and a non-owner cannot list the rules. Null means **more than one** to every reader. A connection whose granted scope (`connector_secrets.scope`, the space-separated string Google returned, which nothing reads today) lacks `calendar.acls.readonly` gets null on every calendar and `needsScope: true` on the wire, and Settings shows the `Sign in again` row with the scope note. Signing in again runs the same `/start` with the full scope list; `include_granted_scopes` keeps what was granted, and a grant that still lacks it leaves `needsScope` true.

A 403 from `acl.list` on a calendar the list said the person owns is treated as null, logged as an outcome with the calendar id and the status code, and retried on the next full pass and the next write.

**On the write path**, `verdictFor` in `write.ts` already reads the event live before the test; it now also reads the access list for an owned calendar on a connection with the scope, writes the fresh count to the row, and hands it to the test. Without the scope the stored null stands.

### The thread's picks

`GET /v1/threads/:id/calendars` returns the viewer's approved calendars with a `picked` flag, plus `others: [{displayName, count}]` for members with picks, and `PATCH /v1/threads/:id/calendars/:calendarId {picked}` inserts or deletes the viewer's own row. Both check membership of the thread and ownership of the calendar through the connection, server-side, and the row carries the picking member's `account_id`; a `PATCH` for a calendar the viewer does not own is 404. The thread detail envelope gains `calendars: {picked, total, anyPicked} | null`: `picked` and `total` are the viewer's, `anyPicked` is whether any member has a pick, which is what earns the rail; null when the account has no connection at all, which hides the glyph and the More row.

### What a thread reads

`GET /v1/threads/:id/events?from=YYYY-MM-DD&to=YYYY-MM-DD` returns the events on the thread's calendars inside the window: `thread_calendars` for the thread, any member's, joined to `connector_calendars` where `selected` and the connection is active, joined to `connector_events` where the occurrence overlaps the window and `deleted_at` is null, `distinct on (source_ref)` so two members' connections to one Google calendar draw an event once. Every member sees the same list. The wire carries `id`, `sourceRef`, `calendarId`, `calendarName`, `colour`, `title`, `occursAt`, `occursEndAt`, `allDay`, `untrusted`: no attendees, no location, whoever asks. **An event whose `source_ref` matches a content row in the thread is skipped**, which is how a row offload put on the calendar draws once (AC-12). `untrusted` is true for any event on another member's calendar and otherwise the row's own flag.

The rail maps each to a `Dated` of kind `event`; the day's list draws it as the event line the feature spec names as new. The rail is drawn when the thread has a dated row or note, as 015 built, **or when `anyPicked`**, in which case a thread with nothing dated shows the current week; the span comes from the thread's rows and notes alone.

The agent's `find_events` and `list_calendars` resolve their scope from the turn: the message's `looking_at_thread_id` when it is set and the account is still a member, else every approved calendar on the account. Both read `connector_events` and `connector_calendars`, never Google, so an answering turn costs no token refresh and no network round trip, and its result is exactly what the rail shows. In a thread, events on another member's calendar arrive marked untrusted whoever wrote them, and the tool result carries a title and a time only.

### A write

`create_event` carries `content_id`, optional `location` and optional `guests`. The server:

1. reads the row through `readableContent`, refuses `unknown_content` unless the acting account wrote it and this turn filed it (or, from a quick add, it sits in the job's thread), `already_on_calendar` if `source_ref` is set and `no_time` if the row has no `occurs_at`;
2. resolves **the acting account's own picks** in the row's thread, intersected with approved, active and `access_role in ('owner','writer')`; a calendar with `participants` null is offered and confirmed, never refused;
3. **one**: builds the `WriteAction` from the row (`title`, `occurs_at`, `occurs_end_at`, the `location` argument, `guests`) and hands it to `writeThroughTool`, which reads the access list, runs the outward test and either performs the write or stores a proposal, as 012 built, with the row's id on the proposal; on a performed write it sets `content.source_ref` and `content.attrs.calendar` on the row;
4. **two or more**: writes a question, below, whose values are those calendars, and returns `{ok: true, asked: true}`; the model says nothing;
5. **none, and the account has an approved writable calendar**: writes a question whose values are the account's approved writable calendars, at most four by name, marked `picks_on_answer`, and returns `{ok: true, asked: true}`;
6. **none, nothing approved**: returns `{ok: true, noCalendar: true}` and the model says nothing.

`edit_event` and `delete_event` carry `source_ref` and no calendar id; the server resolves the calendar from `connector_events` **among the acting account's own calendars** and refuses `unknown_event` otherwise: another member's pick is readable and never writable. A row with `source_ref` set is edited on the calendar through its author's connection only; the row itself follows 005's rules for everybody.

`confirmPending` stops filing into a default thread. On a confirmed create it sets `source_ref` on the proposal's row when the proposal carries one; the sync brings the event into the copy.

### A row that finds its event

2026-11-06, AC-12a. The turn gets `find_events`, and when the same event is there it calls `create_event` with the row's id and `event`, the `sourceRef` it read. `rememberEvent` (`connectors/tool-calls.ts`) checks the event is theirs, as `yours` means it (an invitation is `untrusted` and still theirs), on a selected calendar of a live connection, and starts at the row's `occurs_at`, by UTC date when it is all-day since Google's is midnight and a row's noon, refusing `unknown_event` or `different_time`, then sets `source_ref`, `attrs.calendar` and `attrs.calendar_found`. A repeating row remembers the series. It runs before the target is decided, so no calendar question is raised, and no Google call is made.

Matching is the model's and bounding it is the server's: titles differ between a mail subject and the event ("Design review" and "Design review (Dana Reis)"), and two events at one moment are common, so neither an exact title nor a time alone would do.

`calendar_found` is there because everything else about `source_ref` assumes offload wrote the event, and a dump is not an event's to destroy. Four readers ask it. `undoCalendarWrites` deletes at Google whatever a turn's rows remember, so it clears a found row's link first, without touching `updated_at`: the row goes and the event stays. `letGo` unlinks the row rather than deleting it, or a stranger cancelling a meeting would purge a forwarded email ten seconds later, against the privacy page's "until you delete it". `followChange` moves the row and leaves its title, which is the organiser's text. `editContent` lets a new date drop the link instead of refusing `on_calendar`, and the wire's `onCalendar` is false for such a row, so a wrong link is never a lock.

`letGo` records a quiet `moved` Activity row for each row it reaches, the kind that already opens the thread, so no migration and no client change. `content_id` cascades, so a row that is about to be purged gets neither its id nor its title; the row that stays, found or carrying a photo, gets both. An event offload itself removed goes through `follow`, not here, and says nothing.

### The calendar question

A sixth field on `questions`, `calendar`. The server raises it itself from inside the tool call, so nothing is asked of the model and nothing rides the settled turn: `raiseCalendarQuestion(trx, row, calendars, ctx)` builds the validated row the way `validateAsked` would, checks the row is in the job's message's landed set, and calls `storeQuestions` under the job's message and turn, closing any open question in the conversation as every question does. It takes ordinal 1; questions the worker posts at settle come after it and the cap of two holds across both. The options are calendars, `value` = the calendar's id, `label` = its display name clipped to 24 characters (the account's display name for a primary, else `summary`), plus `Not that`. The sentence is `Filed "{title}". Which calendar?`. `derived_from_untrusted` is true when any offered calendar is not owned by the account. A question carrying `picks_on_answer` records it in `previous_value` as `{"picks": true}` so the answer and its Undo know.

**The label is a calendar's name, and a tap writes it into the log as the person's turn.** For a calendar the account owns the name is theirs. For one shared with them it is somebody else's words, so the answer's message row is written with `derived_from_untrusted = true` (a new column on `messages`, false by default) and the conversation tail the prompts read substitutes `(picked a calendar shared with them)` for the text of any such message; the chunker skips them. The client draws the text as stored.

A tap runs `POST /v1/questions/:id/answer` as today. For `calendar`:

1. in one transaction, settle the question to `answered` with the option, lock the row, refuse `already_set` when `source_ref` is set, and re-check the calendar is the account's own, approved, writable and, unless `picks_on_answer`, still picked in the row's thread, closing the question with `gone` otherwise; when `picks_on_answer`, insert the pick;
2. outside the transaction, perform the write through the same path as the one-calendar case, which may return `written` or `pending`;
3. on `written`, set `source_ref` on the row in a second transaction and record the thread against the answering message so the turn wears the pill; on `pending`, the proposal carries the answering message's id and the row's id, and the envelope shows the waiting control on the person's own turn;
4. on a failure from Google, reopen the question, delete the pick inserted in step 1, and return 502, which the client draws as the failure line with the chips still there.

Settling first is what makes a second tap a 404 rather than a second event; reopening is what makes a failed write answerable again.

**A typed answer** while a calendar question is open is judged without a model: the text, trimmed and lowercased, equal to or a prefix of exactly one offered label, is that option; anything else closes the question and the text is an ordinary dump.

**Undo of the answer's turn** goes through 012's `undoWrite`: Google first, then clear the row's `source_ref`, then delete the pick if the answer inserted it. The question stays answered, as 018's does.

### Confirming

`outwardTest` gains `askFirst` and replaces `calendarIsShared` with `participants: number | null`:

```
guests on either side              ──► outward, notify, reason guests
participants null or > 1           ──► outward, reason shared_calendar
askFirst                           ──► outward, reason asked_for
```

`outwardLine` for `asked_for`: `You asked to check first.` The proposal control, the confirm route, the re-run of the test at confirmation and the Undo are 012's unchanged. `askFirst` is `accounts.calendar_ask_first`, read at write time, never from the client.

### Disconnect

`POST /api/connectors/:id/disconnect` takes no body. It revokes at Google, then deletes the connection's calendars, which cascades to their events and picks, and soft-deletes the connection. 012's `removeFiled` flag and its second route go. The clients confirm once before calling it, with the confirmation deleting a thread uses.

### Migration

`0049_calendars_the_page_and_the_thread.sql`, in this order:

1. create `connector_events` and `thread_calendars`;
2. add `participants`, `participants_read_at`, `colour` to `connector_calendars`, keep `is_primary`; add `calendar_ask_first` to `accounts`; add `derived_from_untrusted` to `messages`; add `content_id` to `connector_pending_writes`; widen `questions.field`;
3. insert a pick for every calendar with a `default_thread_id` where the connection's account is an accepted member of that thread;
4. decline every open `connector_pending_writes` row, since its confirm path filed into a thread that no longer exists;
5. delete `content` rows with `source = 'calendar'` and `derived_from_message_id is null`; their chunks and message links cascade and `questions.target_content_id` nulls; the rows offload wrote through a confirmed proposal carry `derived_from_message_id` and stay;
6. drop `connector_calendar_rules`; drop `default_thread_id` and `is_shared` and the check that tied `selected` to a thread.

Step 5 is the dated exception the feature spec records.

## Data model

### Volume and access

| Field | `connector_events` | `thread_calendars` |
| --- | --- | --- |
| Records per account | One row per occurrence per approved calendar in the window. Typical: a few hundred. Heavy: a few thousand (two accounts, seven calendars, several weekly series). | Picks: typical 3, heavy 40 (20 threads, two calendars each). |
| Fan-out | Events per calendar: 50 typical, 2,000 heavy. Calendars per thread: 1 typical, 5 heavy. | Members picking in one thread: 1 typical, 4 heavy. |
| Growth | The window moves; rows age in from the sync and are deleted out by the full pass. Steady state, not growth. | Grows with threads. Tiny. |
| Read pattern | The rail on every thread open, `(calendar ids, window)`; `find_events` on a turn, same shape; Today's agenda when built, `(account, window)`. | Every thread open, every rail read, every calendar tool call. |
| Write pattern | Bursty: a full pass rewrites the window for a connection; a delta writes what changed every fifteen minutes. | Rare. A tap. |
| Sort and filter | `occurs_at` within a set of calendars; `source_ref` per calendar for the upsert, the reconciliation prefix scan, the rail's dedupe and the AC-12 skip; `deleted_at is null` everywhere; `occurs_end_at` for the window sweep. | By thread, by calendar (the un-tick cascade), by account (leaving). |

**Pagination:** none. A window read is bounded by the window and the rail asks for weeks at a time; a heavy account's week is under a hundred rows.

**Indexes:** `connector_events (calendar_id, occurs_at) where deleted_at is null` for the rail and the agent; unique `(calendar_id, source_ref)` for the upsert and the prefix scan; `(account_id, occurs_at) where deleted_at is null` for Today. `thread_calendars (thread_id)` is the primary key's leading column; `(calendar_id)` for the un-tick cascade; `(account_id)` for leaving.

**Normalisation:** `connector_events.account_id` is denormalised from the connection, for Today's read and for the same reason `content_chunks.thread_id` is: it is the leading column on a hot read. Kept correct because it is written once by the sync from the connection it holds and never updated. `connector_calendars` keeps no `account_id`, as 012 decided.

**Partitioning:** none.

### Schema

```
connector_events
  id uuid pk
  account_id uuid not null → accounts, cascade
  calendar_id uuid not null → connector_calendars, cascade
  source_ref text not null                    -- <calendar external id>:<event id>
  title text not null
  occurs_at timestamptz, occurs_end_at timestamptz
  all_day boolean not null default false
  timezone text
  location text
  series_ref text
  organizer_is_me boolean not null default false
  untrusted boolean not null default true     -- AC-11 of 012, per event, by author
  attendees jsonb not null default '[]'       -- minimised as 012 wrote it
  created_at, updated_at, deleted_at
  unique (calendar_id, source_ref)

thread_calendars
  thread_id uuid → threads, cascade
  calendar_id uuid → connector_calendars, cascade
  account_id uuid → accounts, cascade         -- the member who picked
  created_at
  primary key (thread_id, calendar_id)

connector_calendars
  + participants integer                       -- null: unknown or not owned, read as more than one
  + participants_read_at timestamptz
  + colour text                                -- Google's backgroundColor, a hex string, or null
  - default_thread_id, is_shared
  - the check tying selected to a thread
  (is_primary stays: it names the row and the chip)

connector_calendar_rules                       -- dropped

connector_pending_writes
  + content_id uuid → content, set null        -- the row a confirmed create marks

accounts
  + calendar_ask_first boolean not null default false

messages
  + derived_from_untrusted boolean not null default false

questions.field                                -- gains 'calendar'
```

**`untrusted` defaults true** so a row written by a path that forgot to set it is read, not obeyed. **`attendees` keeps 012's shape**: name and response always, email only when `organizer_is_me` and offload created the event with guests; nothing on the wire carries attendees at all.

**What a calendar's row no longer says.** Nothing on `connector_calendars` names a thread. A thread's relationship to a calendar exists only in `thread_calendars`, and only while the calendar is approved and the connection active, because every read joins both.

### What the wire carries

`GET /api/connectors/calendars`:

```
{ available, askFirst,
  connections: [{ id, email, state, connectedAt, needsScope,
    calendars: [{ id, name, colour, writable, sharedWithYou, primary, selected }] }] }
```

`name` is the display name for a primary calendar and `summary` otherwise, worded once on the server so the row, the sheet and the chip agree. `isShared` and `threadId` go. `sharedWithYou` is `access_role <> 'owner'`. `participants` is not sent: no screen draws it and the count is a fact about other people. The `PATCH` on a calendar takes `{selected}`; `PATCH /api/me` gains `calendarAskFirst`, beside the two web switches.

`GET /v1/threads/:id` gains `calendars: { picked, total, anyPicked } | null`. `GET /v1/threads/:id/calendars` returns `{ calendars: [{ id, name, colour, writable, sharedWithYou, primary, picked, note }], others: [{ displayName, count }] }`, the viewer's own, `note` being the account's address when two rows share a name. `PATCH /v1/threads/:id/calendars/:calendarId` takes `{ picked: boolean }` and returns the same.

`GET /v1/threads/:id/events?from&to` returns `{ events: [{ id, sourceRef, calendarId, calendarName, colour, title, occursAt, occursEndAt, allDay, untrusted }] }`.

## Interfaces

### Tools, agent side (`harness/tools.py`)

```
list_calendars()                          the calendars in scope: id, name, writable, yours
find_events(from_iso, to_iso)             the events in scope between two moments
create_event(content_id, location?, guests?)
edit_event(source_ref, title?, starts_at?, ends_at?, location?, scope)
delete_event(source_ref, scope)
```

Descriptions change with them: `create_event` is "Put a row you filed on their calendar. Give it the row's id. offload decides which calendar from the thread the row is in: with one it is written, with several or none yet they are asked, with nothing approved nothing happens. Say nothing about any of that." `find_events` loses "on a calendar". The calendar tools are sent whenever the account has approved a calendar: in a thread the reads go through its picks, which may be none, and a write from a thread with none is what raises the question that picks one, so scoping the tools to the picks would leave that thread unable to ask. `has_calendar` in `context.py` is that one query. `account_facts` stops describing where a calendar files.

**Bounds, OFF-8.** `list_calendars` returns at most 20 rows of id, name and two booleans. `find_events` returns at most 50 events of `sourceRef`, `title`, `startsAt`, capped as 012's is, and the titles are page-authored text delivered in the user turn as today, every one from another member's calendar marked as such.

### Tool routes (`routes/tools.ts`)

`create_event` is validated with `contentId: uuid`, `location?`, `guests?`; the row is resolved through `readableContent`, and the thread through the row. `find_events` and `list_calendars` take no calendar id; the scope is `scopeFor(job)`: the message's `looking_at_thread_id` when the account is a member, else the account. `edit_event`/`delete_event` take `sourceRef` and resolve `calendar_id` from `connector_events` among the account's own calendars.

Results: `{ok: true, written: true, sourceRef}`, `{ok: true, waitingForThem: true, because}`, `{ok: true, asked: true}`, `{ok: true, noCalendar: true}`, or `{ok: false, error}` with `already_on_calendar` and `unknown_event` added to the enum.

### `questions.ts`

`FIELDS` gains `calendar`. `renderText`: `Filed "{title}". Which calendar?`. `optionValue`/`parseValue`: a uuid. `labelFor` is bypassed for it: `raiseCalendarQuestion` words the label from the calendar row, and `validateAsked` refuses `calendar` from the worker with `wrong_path`, since only the server raises it. `applyAnswer` refuses `calendar` and the answer route handles it as the section above says, because the apply reaches Google and cannot run inside the transaction. `judgeTyped` gains the label match.

### Client, the picker

Phones: `CalendarsSheet` in `components/shell/`, `Sheet` as the kits draw it, opened from the thread bar's `calendar` `IconButton`. Web: `CalendarsPopover` in `components/shell/`, anchored to the third pane-head tool, on the More menu's shell (`.moreMenu`), closed on outside click and Escape, `role="dialog"` labelled by its title, the rows inside a `role="group"`; opened from the tool and from the `Calendars in this thread` More row. Both draw the rows the Settings list draws, through one `CalendarRow` per platform, and both draw the captions the feature spec tables.

### Client, Settings

Web `Apps.tsx` and the phones' `Apps()` in `settings/[page].tsx`: the not-connected state renders the connect block component with the extra sentence (`ConnectStep` on the phones; on web the welcome page's block lifted into `components/ConnectBlock.tsx` and used by both); the connected state renders the blocks in the feature spec's order. `Group` gains a `count` prop on both platforms' settings rows. Disconnect confirms with the thread-delete confirmation before calling the route.

### Client, the rail

Web `panes/Timeline.tsx` and the phones' `shell/Timeline.tsx` fetch the window's events when `calendars.anyPicked`, map them to `Dated` of kind `event`, and draw the event line in the day's list: the colour dot with its ring, the title, the time or `All day`, the calendar's name as the note, no controls. `Thread.tsx` on both draws the rail when there is something dated or `anyPicked`.

## Dependencies

- 012's `google.ts` gains `listAcl(accessToken, calendarId)` and the scope; `listCalendars` gains `backgroundColor`.
- 018's `questions.ts`, `QuickReplies` and the answer route, extended rather than forked; 018's feature spec and impl spec gain an amendment note for the sixth field, the outside write and its Undo.
- 012's feature spec gains an amendment note for AC-8 and AC-12.
- 015's `datedFor` in `packages/widgets/src/timeline.ts` stays; the client maps events to `Dated` before calling it, four lines.
- The privacy page, in the same change (AC-14).
- `docs/tech/decisions.md`: the 8 September entry corrected, the outward test's new conditions, the copy's retention, the reversible allowlist unchanged.

## Edge cases

| Case | What happens |
| --- | --- |
| A calendar un-ticked in Settings while a thread's sheet is open | The sheet's next read no longer lists it; the pick row is already gone. |
| Two members connect the same Google calendar | Two `connector_calendars` rows, two picks, one line per event on the rail by `source_ref`. |
| A member leaves a thread | The leave route deletes their `thread_calendars` rows for that thread. |
| The picked calendar loses write access at Google | The full pass updates `access_role`; a write refuses `read_only` as 012 does; the pick stays, the calendar is still read. |
| `create_event` on a row with no `occurs_at` | Refused `no_time`, which names what is missing rather than `bad_value`. `edit_content` takes `occursAt`, `occursEndAt` and `dueAt` so the model sets the time on that row and calls again with the same id; on a device it filed the row twice when it could not. A row already on a calendar refuses a time change here, `already_on_calendar`: that goes through `edit_event`. |
| `create_event` on a row another member wrote, or one this turn did not file | Refused `unknown_content`. An event on your calendar for a row you cannot take back is not yours to make, and a question hangs off the message that filed the row. |
| `create_event` from a quick add (`thread.quick_add`) | Never reached: the quick-add planner has two tools, `edit_content` and `add_content`, and no calendar. A row typed straight into a thread gets on a calendar through a later dump. The route accepts the job kind so that stays a prompt decision, not a server one; with a pick it would write, without one it says `noCalendar`, since there is no conversation to ask in. |
| The row's thread has two calendars but one is read-only | One writable pick, written without asking. |
| The account has five writable calendars and none picked | The first four by name are offered; the fifth is reachable through the sheet. |
| A tap on a calendar chip after the calendar was un-approved, or the person left the thread | The re-check closes the question with `gone`, as 018 does for a row set by hand: the person's words stay, the chips go, nothing is written, 200. |
| A typed answer that matches one calendar | The worker matches the label without the judge and posts the option; the internal route applies it through the tapped path, with the dump as the person's message. |
| Google fails on the tapped write | The question reopens, the pick it inserted goes, 502, the chips stay with the failure line. |
| Undo after a tap that picked and wrote | Google first; then the row forgets its event and the pick goes; the question stays answered. |
| A typed "family" while the question offers "Family" and "Family (Sam)" | Prefix of two labels, so it closes the question and files as a dump. |
| `acl.list` returns 403 on an owned calendar | `participants` null, an outcome logged with ids and the status only, retried next full pass and next write. |
| A connection whose grant has lapsed (`needs_reauth`) | Its approved calendars stay approved: the picks, the count, the sheet's rows and the events already held read as before, and Settings carries `Sign in again`. Only the token step reads the state, so a write refuses `needs_reconnect` without reaching Google. Found in production on 2026-09-19, when a grant that lapsed on the 15th left Settings with two ticks and the thread saying there was nothing to read. |
| A grant without the scope, old or new | `needsScope` true, every calendar's `participants` null, every write confirms, Settings shows `Sign in again` with the scope note. |
| The account has a connection but approved nothing | The thread glyph is drawn; the sheet's caption and one row lead to Connected apps. |
| The process dies between the settle and the Google write on a tapped answer | Open. The question is answered and the row has no event; the person sees their words with no Done mark and nothing offers a retry. A deterministic event id on the create, so a retry cannot double the event, is the fix and is not built. |
| A thread narrowed to nothing | The caption for none picked, with the shared-thread line where it applies. |
| Disconnect | One confirmation; revoke; calendars, events and picks deleted; the connection soft-deleted. |
| A rail window with 400 events | Under the response cap; the rail draws at most `MAX_DOTS` per day and the day list scrolls. |
| Another member edits a row that remembers its event | The row changes; the calendar keeps what it had; the rail draws the row, not the event. |

## Constitution check

- **OFF-1.** No event title, calendar name, attendee, address or access rule reaches analytics, a log or a trace. The sync's log line carries ids and counts; `acl.list`'s result is counted in memory and dropped; the question refusal log carries the field and the reason. `assertNoContent` stays on every analytics event this feature touches.
- **OFF-3.** Every pick is checked for thread membership and calendar ownership through the connection; every event read joins the thread's picks to the viewer's membership; a calendar id or a thread id from a client is never trusted. The picking member's `account_id` is on the row so leaving removes exactly theirs, and a write reaches a calendar only through the acting account's own connection.
- **OFF-4.** `connector_events` keeps 012's derived shape and drops the description, conferencing and attachments; the access list is counted and discarded; the copy holds the window and nothing older; un-ticking and disconnecting delete it.
- **OFF-5.** Every tool argument is a schema on both sides; `asked`, `noCalendar` and the new error enums are typed results.
- **OFF-6.** The reversible allowlist is unchanged: a write to a calendar with one participant and no guests is reversible with Undo reaching Google; anything else is confirmed per action, and `askFirst` adds a third confirming condition. A pick is a preference on an offload-owned surface with its own way back and no destruction, like the Settings switches; a pick made by a tapped answer is undone with the write.
- **OFF-7.** The screens are the design note's; the divergences (`Shared with you`, the primary's title, the group label, the switch's place and note, the scope note, the sheet's shared-thread lines, the caption on web's popover, the event line, the no-calendar row) are logged with their impact. `Group`'s trailing count is the kit-local change the design already scoped.
- **OFF-8.** `find_events` and `list_calendars` are capped; the scope shrinks what the model can read rather than growing it.
- **SEC-1.** Calendar names and event titles travel in tool results and user-turn blocks, never in a system prompt; a shared calendar's name in a question marks the question and the answer's message untrusted, and the tail the prompts read never carries that name as the person's words.
- **SEC-2.** Scope, write target, participants and `askFirst` are all resolved server-side; the model and the client supply ids only.
- **DATA-1.** This document precedes the migration.
- **DEV-1.** No account-level events cache beyond what Today's future agenda and the answering path need today, which is the same table; no per-thread copies; rules dropped rather than migrated.
