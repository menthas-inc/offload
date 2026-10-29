# 048 Live updates: implementation

**Feature spec:** `feature-spec.md` in this folder.
**Migration:** `0096_live_changes.sql` (0095 is layout-pass's, on the board 2026-10-29).
**New dependencies:** none.
**Reviewed:** project lead as tech lead, 2026-10-29; what changed is under Review.

## The shape in one paragraph

Postgres triggers on the tables a screen shows call `pg_notify('offload_change', '<kind>:<id>')` inside the writing transaction, so every writer is covered: the Core API, the agent plane, the nightly pass, a calendar sync. The Core API's one listening connection, the one `dumps/answers.ts` already holds for answers, listens on the new channel too, and the hub keeps it listening while any stream is open. The hub buffers what arrives and flushes on a fixed 500 ms tick: it resolves thread ids to the accepted members who have a connection open, in one query, and sends each of them one `changes` event over `GET /v1/changes`, a server-sent event stream carrying ids and kinds only. The clients turn that event into a `changed` signal beside the `filed` signal their screens already react to after a turn, and each screen reads itself again through the reads it uses today, at most once every two seconds. Focus, visibility and foreground send the same signal with every kind set, which is the half that ships first and needs no server.

## Data flow

```
writer (core-api, agent, nightly pass, calendar sync)
  └─ row trigger, same transaction ─► pg_notify('offload_change', 'thread:<uuid>')
core-api listener (dumps/answers.ts, now two channels; the hub relistens on error)
  └─ live/hub.ts: buffer { threads, account → kinds, removed }
       every 500 ms, if anything is buffered:
         select thread_id, account_id from thread_members
          where thread_id = any($threads) and state = 'accepted'
            and account_id = any($connected)
       └─ per account: one `changes` event to each of its open connections
client (web live.ts / phone live.ts)
  └─ shell: `changed` = { kinds, threads, removed, at }
       └─ each open screen: touches what it shows? → reload, at most every 2 s
```

### What the triggers send

`live_notify()` takes the kind and the columns that hold the id the row is keyed to, as trigger arguments, and sends `kind:value` for each distinct non-null value in `NEW` and `OLD`; a row moved between threads notifies both. Three tables need branching rather than arguments, and get their own small function: `notes` (by scope), `thread_members` (removal and invitation are addressed to a person), and the label and blob tables (their thread is a lookup).

| Table | Kind | Keyed to | Notes |
| --- | --- | --- | --- |
| `threads` | `thread` | `id` | made, renamed, icon, layout, soft-deleted |
| `threads`, `deleted_at` set | `removed` | `id` and each accepted member | deleting a thread as its last member keeps the membership for the restore window, so the membership trigger never fires; this says it instead |
| `content` | `thread` | `thread_id` | the default thread is Not in a thread |
| `notes`, `scope = 'thread'` | `thread` | `subject_id` | a thread's notes |
| `notes`, `scope = 'account'` | `memories` | `subject_id` | a memory: `0033` renamed `memories` to `notes`, and an account memory's `subject_id` is the account. Forgetting is an update, so one trigger covers add, change and forget |
| `labels` | `thread` | `thread_id` | |
| `content_labels`, `content_blobs` | `thread` | `content.thread_id`, looked up | a PDF or photo becoming openable is a blob change; a lookup that finds nothing (a cascade) sends nothing, the content trigger covers it |
| `note_labels` | `thread` or `memories` | the note's scope and `subject_id`, looked up | |
| `thread_members` | `thread` | `thread_id` | the member list changed, to the members who remain |
| `thread_members` | `removed` | `thread_id` and `OLD.account_id` | when an accepted row stops being accepted (`removed` or `left`) or is deleted |
| `thread_members` | `invitation` | `account_id` | a pending row inserted, or a pending row answered |
| `pending_shares` | `thread` | `thread_id` | the thread's invited-but-not-joined list |
| `thread_calendars` | `thread` | `thread_id` | the thread's calendars |
| `messages` | `conversation` | `account_id` | insert only: a dump appeared. The answer's progress is the per-message stream's on the web and the poll's on the phones |
| `questions` | `conversation`, `today` | `account_id` | answered on another device; the conversation, Today's Answer and the thread page's waiting row draw it |
| `connections` | `people` | `account_a`, `account_b` | |
| `connection_requests` | `people` | `from_account_id`, `to_account_id` | |
| `activity` | `activity` | `account_id` | |
| `reminder_dismissals`, `reminder_labels`, `today_put_offs`, `connector_events`, `connector_connections` | `today` | `account_id` | what Today draws beyond threads |

`thread` is resolved to accounts by the hub. Every other kind names its account in the payload and goes to it directly. `removed` goes to `OLD.account_id` only: by the time it is delivered that person is not a member, which is the point.

A payload is at most `removed:<uuid>:<uuid>`, 82 bytes. No name, title or text is ever read by a trigger, so none can reach the notify queue, Postgres's statement log or the host's log drain.

**Duplicates.** Postgres may collapse identical payloads within one transaction, and is not required to. Nothing rests on it: the hub's buffer is a set, which is the dedupe that counts.

### The hub, `apps/core-api/src/live/hub.ts`

- `connections: Map<accountId, Set<Live>>`, where a `Live` is `{ send(changes), close() }`.
- `buffer`: the set of thread ids, a map of account id to kinds, and a set of `thread:account` removals.
- **The tick.** A 500 ms interval while at least one connection is open; empty, it does nothing. Fixed rather than a debounce, so the connection never reveals timing finer than half a second (feature spec, Who hears what).
- **The flush.** One query, only when thread ids are buffered, bounded by `account_id = any($connected)` so the hub never reads membership for accounts nobody is watching. Then one `changes` event per account, the same to each of its connections.
- **A flush that fails** sends `{ kinds: ["all"] }` to every connection: no ids, so it reveals nothing.
- **Listening.** `answers.ts` connects only when somebody waits for an answer, and after an error waits for the next waiter. The hub does not: while any stream is open it calls `ensureListening()` at once and again with backoff (1 s doubling to 30 s) until it succeeds, and sends `{ kinds: ["all"] }` to every connection each time it is listening again, because notifications in between were lost. **Worst-case staleness while the database connection is down is how long it is down**, and the moment it is back every screen reads again. `stopListening()` is for tests and shutdown and is not called while streams are open.
- Nothing is stored. The buffer is memory only, cleared on every flush; no event table, no replay. **With no connection open the hub stops hearing too** and drops the buffer, so a night of writes is not one wide membership read in the morning.
- **One flush at a time.** A tick while a flush is out does nothing; what arrived waits in the buffer. A membership read that fails still lets what is addressed to an account, a removal above all, go out with the `all`.
- **Ids are checked** to be uuids as they are heard, so one malformed payload cannot fail the tick's uuid cast for everybody.

### `GET /v1/changes`, `apps/core-api/src/routes/changes.ts`

- **Auth** as every read: `currentAccountId(request)`, which already refuses a disabled or deleted account (S24). 401 otherwise.
- **Session re-checked every 15 seconds**, on the same clock as the keep-alive comment, as `/v1/messages/:id/stream` does. A check that returns another account or null ends the stream. That is AC-12's window.
- **Lifetime 10 minutes, ±20 percent.** Twice the message stream's five, because every reconnect here makes every open screen read again, where a message stream's reconnect reads one message; jittered so the streams opened after a deploy do not all end, and all read, in the same second.
- **Cap: 4 per account per process.** A phone and three tabs. Opening a fifth closes that account's oldest. `shortcut: the cap is per Core API process, not per account across replicas; make it a shared count when the API runs more than one replica.`
- **Headers and CORS** through the same code as the message stream. The hand-written block in `dumps.ts` (`reply.hijack()` skips the CORS plugin, so the allowlisted origin is echoed by hand, with `Vary: Origin`, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`) moves to `routes/event-stream.ts` and both routes call it. Never `*`.
- **First frame**: `event: ready`, no data. Then `event: changes`, and `: keep-alive` comments on the clock.
- **Logs**: one `info` line when a stream closes, with the account id, how long it lived and how many events it sent; the opening at `debug`. Nothing per event. An `info` line at every open as well would have made the host's logs a record of when each account was looking (security review of the build).
- **Origin**: a request carrying an `Origin` not on the allowlist is refused with 403 before anything else, on this route and the message stream, rather than streamed without the CORS header: a socket a page cannot read still counted against the account's cap. No `Origin` is a phone, and passes.
- **Security headers**: `openEventStream` writes the four `app.ts`'s `onSend` hook adds to every other answer, which a hijacked reply never reaches.

### The wire shape

```
event: changes
data: {"kinds":["thread","today"],"threads":["<uuid>"],"removed":[]}

event: changes
data: {"kinds":["all"]}
```

`kinds` is drawn from `all`, `thread`, `removed`, `invitation`, `conversation`, `memories`, `people`, `activity`, `today`. The type lives in `@offload/widgets` so both clients and the route share it, and a test asserts every key and kind of every event the route sends is in that set (AC-11).

### The client rules, both surfaces

- **`touches(changes, kinds, threadId?)`** decides whether a screen reads again: `all`, or one of its kinds, and for `thread` and `removed` its own id when it has one.
- **At most one reload every two seconds per screen**, trailing, so a burst is one read at its end. This is what bounds the reads the feature causes (Volume and access). The 3-second criteria are measured from the last change and hold: 0.5 s tick, then up to 2 s.
- **An `all` from the server** (a failed flush, a relisten) is applied after a random 0 to 2 seconds, so a recovery is not itself a spike. An `all` from focus, visibility or foreground is applied at once.
- **The change mark.** A live reload calls the screen's `load()`, which does not mark, except on the thread page while a turn of this account is out, from this device or another: then it calls `catchUp()`, the one that marks. Without this the live reload puts a turn's rows on screen half a second after they commit, before the turn settles, and the settling `catchUp()` then finds nothing new to mark, on the watching device and, as a regression of 004, on the sending one. The window is the turn's own, so a member's edit landing in the same seconds may be marked with it; accepted.

### Web

- **`apps/web/src/lib/live.ts`.** `openLive(onChanges): () => void`. Phase 1 is the coming-back half: `visibilitychange` to visible and `focus` emit `{ kinds: ["all"] }`. Phase 2 adds an `EventSource` on `${API_URL}/v1/changes` with `withCredentials`, as `lib/dump.ts` already opens one; the browser reconnects on its own, and every `ready` after the first emits `all`.
- **The shell** (`app/(shell)/layout.tsx`) opens it once and adds `changed` and `turnOut` to `ThreadsProvider`, beside `filed`, which stays as it is: `filed` is what draws the change mark.
  - `thread`, `removed`, `invitation` or `all`: `loadThreads()`.
  - `activity` or `all`: re-read `/v1/me` and take only `activityNew` and `requestsWaiting` from it. Not a full `useMe` refresh, which carries the first-run, name and consent gates and could redirect somebody mid-sentence.
- **Screens.** Each reads `changed`, checks `touches`, and reloads under the client rules.
  - `panes/Thread.tsx`: `thread` with its own id, `today`, or `all`; `catchUp()` while `turnOut`, `load()` otherwise. `removed` with its own id: nothing if the route has already left the thread (the device that left gets its own `removed`, and its Undo toast is already up); otherwise, with no editor, sheet or dialog open, navigate to `/threads` as `leave()` does, with no Undo toast, and with one open set `gone` and navigate when the last one closes. A save that fails because the thread is gone already draws the editor's own failure line.
  - `panes/Today.tsx`: `thread`, `today` or `all`, through its three loads.
  - `loose/LoosePane.tsx`: `thread` with the default thread's id, or `all`.
  - `panes/MyThreads.tsx` reads the shell's list; it re-measures the inline confirm's height when a row's name changes.
  - `panes/Memories.tsx`: `memories` or `all`. `panes/People.tsx`: `people`, `invitation` or `all`. `panes/Activity.tsx`: `activity` or `all`.
- **The conversation** (`shell/Composer.tsx`). On `conversation`: `fetchCurrent()`, and if it is the conversation on screen, append the turns it does not hold, marked `elsewhere: true`, and `watch` the unsettled ones as the hydration path does; refresh the question on the turns it does hold. If it is another conversation (the 30-minute rule), leave the screen alone. An `elsewhere` turn draws its bubbles, step lines, writing indicator and Done, and no Stop or Undo; Try again and Finish are drawn as on the sending device, and pressing one clears `elsewhere`, since the follow-up is this device's (owner, 2026-10-29); it never sets `working` or the composer's send lock, and never calls `offerUndo`. While any turn, `elsewhere` or not, is unsettled, `turnOut` is true. When an `elsewhere` turn settles it calls `onFiled(answer.changed)` as the sender's does, so the thread open on this device takes the mark.

### Phones

- **`apps/mobile/lib/live.ts`.** Phase 1: `AppState` returning to `active` emits `all`. Phase 2: the stream over `expo/fetch`, which ships in the `expo` package already in the binary (57.0.19; `FetchResponse.body` is a `ReadableStream`), so the release is over the air (AC-15, confirmed by `eas fingerprint:compare` against the live build, not by reasoning). About forty lines: read chunks, split on blank lines, take `event:` and `data:`. The cookie goes in the `cookie` header the way `lib/api.ts` sets it, never in the URL. Backoff 1 s doubling to 30 s. Closed when `AppState` leaves `active`.
- **The shell** (`components/shell/conversation-context.tsx`) holds `changed` and `turnOut` beside `filed`, as the web does, and refreshes the bell dot's `me` fields on `activity`.
- **Screens**: `screens/Thread.tsx`, `screens/MyThreads.tsx`, `screens/Loose.tsx`, `today/TodayScreen.tsx`, `screens/Memories.tsx`, `people/PeoplePage.tsx`, with the kinds and rules the web screen of the same name takes. `useLooseRows` keeps drawn-ahead rows and answered suggestions across a read rather than resetting on `source`; the thread page's layout heads-up is already held in local state for this reason.
- **The conversation**: `conversation` runs the tail read (`fetchCurrent`, as on launch) and appends what is missing as `elsewhere`, watched by the same poll, with the same rules as the web. The prism pulse keys on the phone's own sends only.

### A catch-up during a write

Both clients' `useWrites` already reload once the last write in flight settles, and every screen that guards on `writes.idle()` reads after that. A `changed` dropped by the guard is therefore picked up by that reload. No new code; a test per client proves it (AC-9).

### The notify queue

After this change every write sends a notification, and Postgres's notify queue holds them until the slowest listener in the cluster has read them; when it fills, every notifying transaction fails. Ours drains within a tick. Any other `LISTEN offload_change` left open and idle, a forgotten `psql` or the agent role, is the actor that fills it. `checkAlerts` (`health/alerts.ts`, every minute from the heartbeat) gains one condition, `notify_queue`, open while `pg_notification_queue_usage() > 0.25`, so that becomes an email to the owners rather than every write failing.

## Volume and access

No table, list or feed is added. What is added is one long-lived connection per open client, a stream of short messages, and the reads they cause, which is the number that matters.

| Field | Estimate |
| --- | --- |
| Connections per account | 2 typical (a phone in the foreground and one web tab); 4 heavy. Cap 4. |
| Concurrent connections | Alpha: under 100. At 1,000 accounts with a fifth on screen at once: about 400. At 10,000: about 4,000. |
| Notifications | A turn writes 5 to 20 rows across one or two transactions: a handful of payloads, one `thread` per thread after the hub's set. An edit: one. The nightly pass: one transaction per thread, at most ten threads a night per member (032). |
| Events | At most two a second per connection (the tick); typically a few a minute for an active account and none for an idle one. |
| Reads caused | Each event costs each open screen it touches one reload of one or two requests, at most one every 2 s per screen. One edit in a five-member shared thread with everybody watching it: about 10 requests. Sustained, an active account causes a request every few seconds while a turn files; the ceiling is one request a second per open screen. At 400 connections that ceiling is about 400 requests a second, at 4,000 about 4,000, reached only by everybody editing at once; the expected load is a tenth of that. |
| Flush | One indexed read of `thread_members` per tick with thread ids buffered, bounded by connected accounts. |
| Session checks | One per connection per 15 s: about 7 a second at alpha, 27 at 400 connections, 270 at 4,000. |

What follows:

- **Pagination:** none; no list is added.
- **Indexes:** existing. `thread_members_thread_account_key (thread_id, account_id)` serves the flush.
- **Normalisation:** none.
- **The two costs that grow** are the reads the reloads cause and the session checks. The first is bounded at the client by the 2-second floor and by `touches`. `shortcut: one Better Auth session read per connection per 15 s; batch them into one query per tick when concurrent connections pass 1,000 per process.` Before 1,000, check Railway's per-service limit on concurrent connections, which the alpha is far below.

## Edge cases

- **A thread deleted** (soft, `deleted_at`): `removed` to every member still in it, from its own trigger, so their other open devices close it as for a removal. Not a 404 on the next read: both clients' thread reads return null for a 404 and for no network alike, and closing on null would close a page on a dropped connection. *Changed during the build, 2026-10-29.*
- **The last member leaves**: `removed` to them; nobody else is in it.
- **Leaving on this device**: `leave()` has already navigated and shown its Undo; the `removed` that follows finds the route elsewhere and does nothing, so the toast stays.
- **An invitation accepted**: `invitation` to the invitee, `thread` to the members, the invitee now among them.
- **A migration or backfill** that touches every row: one payload per distinct id per transaction at most, and the hub sends only to connected accounts. Accepted; no suppression switch until a migration needs one.
- **The agent role can `LISTEN` too.** Postgres has no grant on channels, so any role that can connect can hear every account's ids and kinds. Accepted in writing: `offload_agent` already reads `threads` unscoped, and the payloads carry no content (security review, 5b). The queue alert covers it stalling the queue.
- **Two tabs on the web**: two connections, each counted against the cap; HTTP/2 to `api.offload.club` (checked 2026-10-29) means the browser's six-per-origin limit does not apply.
- **The device that made the change** gets the event too and reads again: one redundant read, cheaper than carrying who made it. The sending device also reads its conversation tail once per dump.
- **Undo on the sending device** writes the rows back, which notifies like any write, so the other devices catch up to the undone state.
- **Signed out on the device**: the stream ends at the next 15-second check; the client's `onSignedOut` closes it at once.

## Reuse and skips

| Piece | Rung | Where |
| --- | --- | --- |
| Hearing about writes from every process | Already here | `pg_notify` in transaction and the one listening connection in `dumps/answers.ts` |
| Every writer covered | Platform | Postgres row triggers, as `0090` and `0075` already use |
| The stream | Already here | the message stream's shape, its session clock and its CORS block, moved to `routes/event-stream.ts` and shared |
| Web transport | Platform | `EventSource`, as `lib/dump.ts` |
| Phone transport | Installed | `expo/fetch` streaming, part of `expo` |
| Screens catching up | Already here | each screen's `load()` and `catchUp()`, and `filed` for the mark |
| A catch-up during a write | Already here | `useWrites` reloads when writes settle |
| The badge | Already here | `/v1/me`, two fields taken |
| The queue alert | Already here | `checkAlerts` and `alert_states` |
| The hub | New code | about 120 lines |
| The triggers | New code | four functions, one migration |
| Wire type and `touches` | New code | one file in `@offload/widgets` |

**Skipped:** Redis or any broker (every replica can `LISTEN`; the open Redis entry's trigger is not met), WebSockets (nothing travels up), an event table or `Last-Event-ID` replay (coming back reads again), a per-row diff on the wire (ids only), message ids on the wire (the tail read finds what is new), a client cache library (TanStack Query is named in `docs/tech/decisions.md` and used nowhere; adopting it here would be a rewrite of every screen), deleting the web's per-message answer stream (HTTP/2 removes the reason to fold it in), relaying answer progress to the phones (their poll already asks every second).

## Interfaces

```ts
// packages/widgets/src/live.ts
export type ChangeKind =
  | "all" | "thread" | "removed" | "invitation" | "conversation"
  | "memories" | "people" | "activity" | "today";
export interface Changes {
  kinds: ChangeKind[];
  threads?: string[];
  removed?: string[];
}
/** Whether a screen that shows these kinds, or this thread, should read again. */
export function touches(changes: Changes, kinds: ChangeKind[], threadId?: string): boolean;
```

`GET /v1/changes`: 200 `text/event-stream`; 401 signed out. No parameters.

## Dependencies on open decisions

None. The Redis entry under "Open, needing a call" in `docs/tech/decisions.md` names pub/sub across instances as its trigger; this design does not need it, and the entry gets a line saying so.

## Docs this changes

- `docs/tech/decisions.md`: a dated entry for the always-on stream, its cap, its lifetime and its two growing costs with their triggers; a line on the Redis entry; and the stale TanStack line corrected (shared state: on main).
- `.claude/skills/offload-design/decisions.md`: the change mark plays for the person's own dump on every device and for nothing else that appears while watching (OFF-7), with **Design system impact** filled in.
- `apps/mobile/lib/dump.ts` header: the phones still poll for an answer, and now hear about a dump from another device on the live connection.
- The privacy page: no change (feature spec, The privacy page).

## Constitution check

| Principle | Applies | How |
| --- | --- | --- |
| DEV-1 | yes | Reuses the listener, the stream's shape, `load()`/`catchUp()`, `useWrites` and `checkAlerts`; no dependency, no broker, no table. |
| DEV-2 | yes | The amends are listed; docs change in the same branch. |
| DEV-3 | yes | SSE, `LISTEN`/`NOTIFY`, triggers. |
| QUAL-1 | yes | Every task starts with its failing test (tasks.md). |
| QUAL-2 | yes | Triggers only notify; the hub only routes; screens only read. |
| SEC-1 | yes | No credential in a URL; payloads built from ids only, never interpolated text. |
| SEC-2 | yes | Recipients resolved by the server at delivery from accepted membership; clients act only through their authorised reads; an id on the wire is not a grant. |
| DATA-1 | yes | This document. |
| OFF-1 | yes | Ids and kinds on the wire, in the notify queue and in logs; one log line per connection; nothing stored. |
| OFF-2 | n/a | Nothing new at rest. |
| OFF-3 | yes | Accepted membership at delivery; pending excluded; the removal goes to the removed account alone; the conversation is account-keyed. |
| OFF-4 | yes | A calendar sync notifies `today` with the account id; nothing from the calendar travels or is kept. |
| OFF-5 | n/a | No model call. |
| OFF-6 | yes | No new action. Undo stays with the sending device; an Undo notifies like any write; nothing is destroyed on a receiving device. |
| OFF-7 | yes | The change mark's scope is logged as an amendment. |
| OFF-8 | n/a | Nothing enters a prompt. |

## Review

Project lead as tech lead, 2026-10-29.

**Changed.**
- The change mark would never have played: the live reload put a turn's rows on screen before the turn settled, so the settling `catchUp()` found nothing new, a regression of 004 on the sending device too. The thread page now reloads through `catchUp()` while a turn of the account is out.
- The listener: `answers.ts` reconnects only when somebody waits for an answer, so after one dropped connection the hub would have been deaf for up to ten minutes. The hub relistens with backoff while streams are open and sends `all` each time.
- `memories` is not a table since `0033`; memories are `notes` with `scope = 'account'`. One `notes` trigger branches on scope, and so does `note_labels`.
- The volume section counted events; it now counts the reads they cause, and a 2-second floor per screen bounds them at the source.
- Added to the triggers: `questions`, `content_blobs`, `thread_calendars`, `connector_connections`, `pending_shares`. Added to the web screens: Not in a thread.
- `all` from the server lands after a random 0 to 2 s and the lifetime is jittered, so a recovery or a deploy is not a synchronised re-read of everything.
- A queue alert, because every write now waits on the slowest listener in the cluster.
- `conversation` is keyed to the account, not the message: the tail read finds what is new, and one query and one wire field go. `all` is a kind. The cap is 4.
- Postgres's duplicate collapsing is stated as an optimisation it may make, not one anything rests on.
- `removed` after leaving on this device does nothing, so its Undo toast stays.
- The 10-minute lifetime is given a reason.

**Not changed.** Nothing was declined.

### The build's reviews, 2026-10-29

Code, client and security reviews of the diff. **Fixed:** a listening connection left open when its second `listen` failed (closed now, or the hub's retries leaked one per failure); overlapping flushes under a slow read; the buffer filling with nobody watching; a malformed id failing the whole tick and a failed read dropping removals; no security headers and no origin refusal on the hijacked streams; the open line at `info`; an account memory keyed to its author rather than its subject; `ready` sent with no data, which a browser never dispatches, so the web's reconnect catch-up was dead; a failed live read blanking the web's thread page and Not in a thread; the web never reopening after an HTTP error; Today's Needs you and the phones' Activity not wired; the web drawing its own message as another device's in a send window; every phone tab reloading while hidden. **Changed by the owner:** Try again and Finish on every device. **Amended:** a thread removed elsewhere closes with no line. **Not changed:** any role that can connect can `LISTEN` (accepted above); the phones' source-reading wiring tests, which match the repo's existing style.

