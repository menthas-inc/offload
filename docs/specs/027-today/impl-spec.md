# 027 Today, implementation spec

**Status:** drafted 2026-10-01 from the revised feature spec, after `GATE: PASS` (below)
**Reads with:** `feature-spec.md` in this folder; 024's impl-spec for `/v1/today`, `activity` and the digest; 023's for `whenDayOf`, the zone and the person-facing date write; 022's for `requireReadable`, requests and invitations; 018's for `questions` and `/v1/questions/:id/answer`; 019's for `connector_events` and the sync; 025's for the marks line; `docs/tech/decisions.md` for OFF-6's allowlist

## Shape of the change

Five parts, in this order, each shippable behind the old screen until part 3 lands:

1. **Server.** Migration `0064_today.sql`; the event link in the sync; three reads and three writes under `/v1/today/*`; the layout on `/api/me`; the evening digest's `day`. `GET /v1/today` stays exactly as it is for phones already installed.
2. **Shared logic** in `packages/widgets`: day names, the countdown, the day's sections from rows, the retry schedule. Pure, tested once, used by both clients.
3. **The clients' Today**: the thread pill, Needs you, the day, Customize Today, on the web and both phones.
4. **Launch** on both clients, **the tabs** and **the scrim** on the phones.
5. **The log**: the design entry, `docs/tech/decisions.md` if anything moved, `at-merge.md`.

## Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Threads 40 typical, 300 heavy. Content rows 600 typical (15 per thread), 20,000 heavy. Dated open rows inside Today's window (thirty days back to a year ahead): 60 typical, 1,500 heavy. Repeating rows: 10 typical, 150 heavy. Calendar events in the 60-day-back, 12-month-ahead window: 400 typical, 4,000 heavy (three busy calendars). Open questions: 0 to 1 (018 keeps one open per conversation and closes it on the next turn), plus one per forwarded email waiting, since 2026-10-15 (026 AC-25): a handful typical, bounded by the mail cap. Requests and invitations waiting: 0 to 2 typical, 30 heavy. Put-off rows: 0 to 5 live, every one expiring within a day except the two *for good* kinds, which are one per invitation and one tip. |
| Fan-out | Events per day: 3 typical, 40 heavy. To-dos due per day: 4 typical, 60 heavy; late at most 100 by 024's cap. Picks: 3. Needs you cards: 1 typical, 35 heavy. |
| Growth | Content grows about 20 rows a week for an active account; events track the calendar and the window keeps them flat. Put-offs are written a few times a day and expire; a nightly sweep deletes any whose `until` passed more than a day ago. |
| Read pattern | Today is the first tab: a launch and every focus reads the layout (from `/api/me`, already fetched), Needs you once, and Today's day. A step reads one day. The minute countdown is client-side from the day already read, no request. The web reads the same on route entry. |
| Write pattern | Person-paced and tiny: a card's action, a put-off, + Today and its Undo, a layout change per gesture. |
| Sort and filter | Events of an account between two instants, by start. Content readable by the account, open, dated within a day's instants or bare-dated on a day, plus repeating rows. Late: the same, thirty days back, newest cut at 100. Picks: content authored by the account, open, task, undated, unrepeating, by `created_at`, whose thread has an open row due in a seven-day window. Open questions by account. Put-offs by account where `until` is null or in the future. |

**Pagination.** None on the day read: every section is capped (events 30 drawn of all counted, late 100 as 024, the rest 100 with a count, picks 3), and Needs you is bounded by its sources. 024's 800-row read limit is not reused; each section is its own capped query.

**Indexes.**
- `connector_events (account_id, occurs_at) where deleted_at is null` exists (0049) and serves the day's events.
- `content_thread_due_idx (thread_id, due_at) where due_at is not null and deleted_at is null and archived_at is null` exists (0027) and serves the day's rows and the picks' *has something due soon* test. The view `readable_content` joins `thread_members` on `thread_id`, so thread leads.
- `content_thread_dated_idx (thread_id, occurs_at)` exists and serves offload's events.
- `content_rule_idx (thread_id) where rrule is not null` exists and serves repeating rows.
- **New** `content_picks_idx on content (account_id, created_at) where type = 'task' and due_at is null and rrule is null and done_at is null and archived_at is null and deleted_at is null`.
- **New** `questions_open_account_idx on questions (account_id) where state = 'open'`.
- `today_put_offs` primary key `(account_id, card)`.

**Normalisation.** Nothing denormalised. `connector_events.account_id` already is, for exactly this read.

**Partitioning.** None.

## Data model

`apps/core-api/migrations/0064_today.sql`:

```sql
-- The layout. Null is the defaults; the server fills missing kinds on read.
alter table accounts add column today_layout jsonb;

-- A card put off, or settled for good on Today alone. `card` is a closed
-- shape, checked here and in code: calendar:<uuid>, request:<uuid>,
-- invitation:<uuid>, question:<uuid>, tip:forwarding, pick:<uuid>.
-- `until` null is for good (an invitation's Not now, the tip's Got it).
create table today_put_offs (
  account_id uuid not null references accounts(id) on delete cascade,
  card       text not null check (card ~ '^((calendar|request|invitation|question|pick):[0-9a-f-]{36}|tip:forwarding)$'),
  until      timestamptz,
  created_at timestamptz not null default now(),
  primary key (account_id, card)
);

-- Google's own link to the event, the reference a tap hands to the platform.
alter table connector_events add column link text
  check (link is null or link ~ '^https://(www\.google\.com/calendar/|calendar\.google\.com/)');

-- Every synced event lacks a link; the next pass reads each calendar whole.
update connector_calendars set sync_token = null;

create index content_picks_idx on content (account_id, created_at)
  where type = 'task' and due_at is null and rrule is null
    and done_at is null and archived_at is null and deleted_at is null;
create index questions_open_account_idx on questions (account_id) where state = 'open';

```

The agent role gets no grant on the new table or column, since no model reads any of it. A put-off row whose card has since gone is never read again (the reads start from live cards and look the key up) and the nightly sweep removes it once its `until` has passed; *for good* rows are removed when their invitation or the account goes.

**The layout's shape**, validated by one zod schema in `apps/core-api/src/today/layout.ts` and nowhere else:

```ts
const part = z.object({ kind: z.enum(["account", "people", "questions", "tips"]), on: z.boolean() });
const section = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("needs_you"), parts: z.array(part).length(4) }),
  z.object({ kind: z.literal("day"), on: z.boolean() }),
]);
export const todayLayout = z.object({ version: z.literal(1), sections: z.array(section).min(1).max(2) })
  .strict()
  .refine(noRepeatedKinds).refine(everyPartNamedOnce).refine(somethingOn);
```

`resolveLayout(stored)` returns the stored document with any kind it does not name added at its default place, so adding a third kind later is one entry in a defaults array. It never throws on what is stored: a stored document that no longer parses (it cannot, since only parsed documents are stored, but a hand edit could) resolves to the defaults.

## Interfaces

All under the session's account, resolved server-side (SEC-2). Every id that is not the account's answers `404 not_found`, the same as one that does not exist or is already settled, so no route is an existence oracle.

### `GET /v1/today/day?date=YYYY-MM-DD`

`date` is a local date in the account's zone, refused `400 bad_date` unless it is between today and today plus 365 days. Response:

```ts
{
  date: string,                  // echoed
  events: TodayEvent[],          // first 30, all-day first then by start
  eventCount: number,
  late: AgendaRow[],             // Today only; oldest first; 100 at most
  lateMore: number,
  timed: AgendaRow[],            // by the hour
  rest: AgendaRow[],             // oldest first; 100 at most
  restMore: number,
  picks: AgendaRow[],            // Today only; 3 at most
  everDumped: boolean,
  threadLabels: { id: string, name: string, colour: number }[],
}
type TodayEvent = {
  id: string,
  source: "calendar" | "offload",
  title: string,
  startsAt: string | null, endsAt: string | null, allDay: boolean,
  mine: boolean,                 // a calendar of the account, or a row it filed
  calendarName: string | null,   // calendar events: "Google, Work"
  link: string | null,           // calendar events, when read; https on a Google host
  threadId: string | null, threadName: string | null,  // offload events
  authorName: string | null,     // offload events another member filed
}
```

`AgendaRow` is 024's (`contentRow` plus `threadId`, `threadName`). The handler is `apps/core-api/src/today/day.ts`, one query per section:

- **Instants.** `[startOfDay, startOfNextDay)` in the account's zone from `dayIn` and the zone (`zoneOf`). Bare-dated rows (`attrs.all_day`) are matched by their UTC date, as `whenDayOf` reads them, never by converting.
- **Calendar events.** `connector_events e join connector_calendars c on c.id = e.calendar_id join connector_connections n on n.id = c.connection_id` where `e.account_id = $me and n.account_id = $me and c.selected and n.deleted_at is null and e.deleted_at is null` and the event overlaps the day (`occurs_at < end and coalesce(occurs_end_at, occurs_at) >= start`, all-day by date). **It never reads `thread_calendars` and never calls `threadEvents`**, which exists to return every member's picks. A calendar event whose `source_ref` matches a readable offload `event` row's `source_ref` is dropped in favour of the row.
- **Offload events.** `readable_content` for the viewer, `type = 'event'`, open, overlapping the day. `authorName` is set when `account_id <> $me`.
- **To do.** `readable_content` for the viewer, `type <> 'event'`, not a note, open, dated on the day (timed by instant, bare by UTC date), plus repeating rows whose rule lands on the day through `occurrencesIn`; split into `timed` and `rest` by whether the row has an hour. **Late** only when `date` is today: the same predicate from thirty days back to yesterday, never a repeating row, oldest first, capped at 024's `OVERDUE_CAP`.
- ~~**Picks** only when `date` is today, by `todayPicks(accountId, today, zone)` in `apps/core-api/src/today/picks.ts`, the one place the rule lives: `content.account_id = $me`, readable by `$me`, the open-undated-unrepeating-task predicate, `exists` an open row in the same thread with `due_at` in `[today, today + 7 days]`, no live `pick:<id>` put-off, by `created_at`, limit 3.~~ Gone 2026-10-07, see the amendment at the end.
- `everDumped` and `threadLabels` as 024's handler computes them.

### `GET /v1/today/needs`

```ts
{ cards: NeedsCard[] }   // server cards, in order, filtered by the layout's parts
type NeedsCard =
  | { key: string, kind: "calendar", since: string, connectionId: string, email: string | null }
  | { key: string, kind: "request", since: string, requestId: string, person: Person }
  | { key: string, kind: "invitation", since: string, memberId: string, invitation: Invitation }
  | { key: string, kind: "question", since: string, question: QuestionOnWire, threadId: string | null,
      threadName: string | null, fromEmail: boolean }
  | { key: string, kind: "tip", tip: "forwarding", address: string, from: string }
```

`apps/core-api/src/today/needs.ts` assembles it from what already exists, each source filtered by its own account predicate:

- **calendar**: `connector_connections` where `account_id = $me and state = 'needs_reauth' and deleted_at is null`. `email` only when the account has more than one live connection.
- **request**: 022's waiting requests for `$me` (the query behind `requestsForYou`, lifted into an exported `requestsFor`).
- **invitation**: `invitationsFor($me)`.
- **question**: `questions` where `account_id = $me and state = 'open' and field in ('date','span','time','thread')`, joined to its message to learn `fromEmail` (`messages.source = 'mail'`), and **dropped when `derived_from_untrusted` and not `fromEmail`**. Wired through 018's `questionOnWire`, so values never leave the server. The thread comes from `target_content_id`'s or `target_note_id`'s thread, readable by `$me`.
- **tip**: when `mailAvailable` (the same test as `/api/me`), `everDumped`, no `messages` row for `$me` with `source = 'mail'` (a refused email writes no message, so any row is an accepted one; `messages_mail_idx` serves it), and no `tip:forwarding` put-off. `address` is the shared `MAIL_ADDRESS` constant, `from` the account's sign-in email.

Each card's `key` is its put-off key; a card with a live put-off is left out. The parts the layout has off are not queried at all. The time zone and notifications cards are not here: the client knows their conditions and adds them when the layout's `account` part is on.

### `POST /v1/today/put-off`

Body `{ card: string, forGood?: boolean }`. The card must parse as the closed shape and **resolve to a live card of this account**, checked by the same predicate the read uses for its kind; otherwise `404 not_found`. `forGood` is accepted only for `invitation:` and `tip:forwarding`. `until` is the start of the next day in the account's zone. Upsert. `200 { ok: true }`. Never a GET, since cookies are `sameSite: lax`.

### ~~`POST /v1/today/picks/:contentId` and `DELETE /v1/today/picks/:contentId`~~ (removed 2026-10-07)

~~**POST** is + Today. In one transaction: `requireReadable($me, contentId)`, then re-check `account_id = $me`, `type = 'task'`, open, `due_at is null`, `rrule is null`; any failure is `404 not_found`. Then the date write through 023's person-facing path with a bare day of today in the zone (noon UTC, `attrs.all_day`). Returns the row as `AgendaRow`.~~

~~**DELETE** is its Undo: the same ownership checks, and only when the row's date is still that bare day (else `409 not_undoable`, since somebody moved it since); clears the date through the same path and upserts `pick:<id>` until the start of tomorrow. Both writes are 023's `edit_content`, already on OFF-6's allowlist.~~

### `/api/me`

`GET` gains `todayLayout`, the resolved document. `PATCH` accepts `todayLayout`, parsed by `todayLayout` above; a refusal is `400 bad_layout`; only the parsed value is stored. Last write wins.

### Digests

The evening digest's push `data` gains `day`, the local date the send named (`{ kind: "digest", send: "evening", day: "2026-10-02" }`): a date, not content. The clients' `routeFor` and Activity's `doorOf` open `/today?day=` for an evening digest, the Activity row's day being its `occurred_at`'s local day plus one; a day already past opens Today.

### Unchanged on purpose

`GET /v1/today` keeps its response and its tests, for phones already installed; its handler gains a comment naming 027 and the condition to remove it (no session from a build older than this spec's first phone build for thirty days). 018's answer route, 022's accept and dismiss routes and 019's sign-in are called as they are.

## The clients

### Shared, `packages/widgets`

- `dayName(day, today, weekStart): { name: string, sub: string | null }`, the day's names, which since 2026-10-18 name only the empty day's line; `dayTitle(day)`, *Thursday 22 October*, is what the month's head reads for a picked day other than today.
- 2026-10-18: `monthDated(counts)` in `timeline.ts` turns `GET /v1/today/month`'s counts into entries `monthFor` draws, so Today's grid and a thread's dot a day the same way.
- `countdown(now, event): { lead: string, tail: string } | null`, *in 1h 30m*, *until 12:30*, *at 10:00*.
- `nextEvent(events, now, isToday)`, the next line's choice: `mine`, timed, not ended.
- `nothingLine(name)`, the empty day's words.
- `retryDelay(attempt, random): number`, about 2, 4, 8 then 15 seconds, each scaled by a random factor in `[0.5, 1.5)`.

Tests live where the widgets' tests already do (`apps/web/test/*.test.ts`).

### The thread pill

One component per client: `apps/web/src/components/shell/ThreadPill.tsx` and `apps/mobile/components/shell/ThreadPill.tsx`, `size: 24 | 30`. The turn footer (`TurnFooter.tsx` on the web, the footer inside `Conversation.tsx` on the phones) switches to it at 30; Today uses 24. Both clients' content rows gain a `thread?: { id, name }` prop drawn on the marks line before the labels, replacing Today's use of `meta`; on the phones the row gains an `accessibilityActions` entry named *Open* and the thread, and on the web the pill is its own focusable control inside the row.

### Phones

- `components/screens/Today.ios.tsx` and `Today.android.tsx` stay thin and render a shared `TodayScreen` from `components/today/`: `NeedsYou.tsx`, ~~`DayStepper.tsx`~~ `shell/MonthGrid.tsx` with its head naming the picked day (2026-10-18, the thread calendar's grid lifted out of `shell/Timeline.tsx` so both draw it), `NextLine.tsx`, `EventsStrip.tsx`, `TodoCard.tsx` (late, timed, rest, folds), `Picks.tsx`, `CustomizeSheet.tsx` on `DragSheet`. `TodayAgenda.tsx`'s row handlers move into `useTodayRows`, used by `TodoCard` and `Picks`, and gain the `labels` prop 025 left out on Today's row sheet.
- `lib/today.ts`: the three reads, the three writes, the types. The layout comes from `useMe()`.
- **Device cards.** `useZoneCard()` lifts 023's strip condition and its two writes out of `ZoneStrip.tsx`, which is then deleted; `useNotificationsCard()` reads `permitted()` from `lib/notifications.ts` on mount and on every `AppState` change to `active`, and its put-off is a date in SecureStore. Both are spliced at the front of the server's cards when the layout's `account` part is on; *N of M* is counted on the device.
- **The card stack**: the card swipe is a `Gesture.Pan` on the card; after an advance the new card's actions ignore presses for 300ms (`useInertFor(300)`); reduced motion turns the advance into a cut.
- ~~**The day swipe**~~ gone 2026-10-18 with the stepper; the month's own swipe steps a month, as on a thread. It was a `Gesture.Pan` on the day's container with `activeOffsetX([-24, 24])` and `failOffsetY([-12, 12])`; the row's pan, the strip's `ScrollView` and the card's pan are passed as `blocksExternalGesture` so they win inside their bounds.
- **Tab reset.** `Shell.tsx`'s Today tab press emits `todayReset` through a small emitter in `lib/today.ts`; `TodayScreen` sets the day to today on it and on focus from another tab. `?day=` from a door sets the day once.
- **Opening an event**: `openLink(link)` from `lib/links.ts`, which already refuses anything but `https`. No custom scheme, no `canOpenURL`: the https link is handed to the platform, which opens Google Calendar through its app links when the app is installed.
- **Copy address**: `expo-clipboard`, already a dependency.
- **Customize Today's drag**: the thread page's To do reorder pattern on the two section rows, with `accessibilityActions` *Move up* and *Move down*; writes `PATCH /api/me` once on release, and once per switch.
- **Midnight**: a timer to the next midnight in the account's zone, reset on `AppState` active, re-reads the day.

### Web

- `components/panes/Today.tsx` is rewritten on the same parts under `components/today/`, styles in `today.module.css`, every class checked by `dead-classes.mjs` and `dead-css.mjs`.
- Customize Today is a second pane in Today's route (`/today?customize=1`), Today's pane at 520px beside it, as the exploration draws it; arrow keys on a focused grip move the section.
- Each event card is a `<a href={link} target="_blank" rel="noreferrer noopener">` through `webHref`, or a non-interactive `div` with no link; an offload event is a `Link` to its thread.
- The tip copies with `navigator.clipboard.writeText`.

### Icons

`sliders-horizontal` from the design set into `apps/web/public/icons/` and through `apps/mobile/scripts/icons.mjs` into `icons.generated.ts`; the generator's refusal of any unread drawable element holds for its nine `line`s. `dead-icons.mjs` covers both.

### Launch

- **Phones**, `app/index.tsx`: `expo-network`'s `getNetworkStateAsync` decides between the two states on an `unreachable` `getMe`; offline subscribes with `addNetworkStateListener` and retries when `isInternetReachable` turns true; not answering schedules `retryDelay(attempt)`, honours `Retry-After` from a 429 or 503 response, and pauses while `AppState` is not `active`. The block's position follows `LaunchHold`. `expo-network` is already in `package.json`; if the current development build predates it, the phones need an EAS build before this part can be tried on a device.
- **Web**, `components/Unanswered.tsx`: `navigator.onLine` and the `online` event, the same schedule, paused while `document.hidden`.

### The tabs and the scrim

- `Shell.tsx` already has `useReanimatedKeyboardAnimation`'s height. The tab bar's style becomes `opacity: min(sheetOpacity, 1 - clamp(-keyboardHeight / 60, 0, 1))`, one `useAnimatedStyle`; `useAnimatedReaction` flips `pointerEvents` to `none` and `accessibilityElementsHidden` / `importantForAccessibility` once fully faded, and back.
- `packages/tokens/src/generate.mjs` emits the alpha of `--surface-scrim` per theme into the phones' generated colour module, with an assertion that both themes produced one; `lib/colors.ts`'s `SCRIM_OPACITY` and `DragSheet`'s default `0.35` read it. `apps/mobile/test/colors.test.ts` holds the generated values against `tokens/colors.css`.

## Edge cases

- **A question answered in the conversation while Today is open**: the card's answer returns 409 or 404 from 018's route; the card goes with *That didn't go through.* as 018 says it, and the next load drops it.
- **A request withdrawn while its card shows**: 022's accept answers `not_found`; the card goes with 022's line.
- **Put off near midnight**: `until` is the start of the next day in the zone at the moment of the write; a zone change later does not move it.
- **The zone changes** while Today is open (Use Tokyo): the layout and Needs you are unaffected; the day is re-read, since its instants moved.
- **A day past the window's edge** from a stale client: `400 bad_date`; the month draws that day closed at the same edge, so it is never sent.
- **`GET /v1/today/month?from&to`** (2026-10-18): `{ days: [{ date, task, event, calendar }] }`, only days with something, counted by `readMonth` in `today/day.ts` with the day read's own queries and predicates (`dayOfRow`, `landsOn`, `eventOn`, `calendarCovers`, `isWritten`) over the window, so a day's count is what its day read draws (pinned by `today-month.test.ts`). Days before today and past the edge carry nothing. `400 bad_window` for a window that is not two days, runs backwards or is longer than 62 days. Session account only (SEC-2).
- **An event with no end**: drawn with its start only (*9:00*), past once its start has passed by an hour.
- **An event in another zone** (`connector_events.timezone`): stored instants are absolute; the day is the account's; the card draws the account's clock, as every screen does since 023.
- **A repeating offload event**: lands on the days its rule lands, as a row.
- **+ Today on a row whose thread the person just left**: `requireReadable` fails, `404`; the pick goes on the next load.
- **Two devices change the layout at once**: last write wins; each re-reads `/api/me` on focus.
- **A layout written by a newer client with a kind this server lacks**: refused `400 bad_layout`; the client keeps its drawn state and shows *Couldn't save that*. The server ships kinds before the clients do.
- **An account with two Google connections, one broken**: one card, naming that account's address.
- **The link absent on an event synced before the migration**: the event is not a button until the next sync pass reads it whole.
- **Questions from the agent role**: untouched; `questions` gains an index, not a column.

## Constitution check

- **DEV-1:** one read per concern, capped sections, no pagination, no new service. The drag for two rows and a switch per kind are the product owner's calls, recorded in the feature spec.
- **DEV-2:** 024's AC-22, 023's strip, 019's AC-10 and the turn footer's link are amended in the feature spec's header and in `at-merge.md`.
- **QUAL-1:** every task in `tasks.md` starts with its failing test, named and run red.
- **SEC-1:** no model call; a question's text and options are stored values already drawn in the conversation; questions raised from a stranger's words are left out unless from a forwarded email, and say so; the event link is checked against a pattern at the sync, in the column and before it is opened; every SQL value is bound.
- **SEC-2:** every read and write resolves the session's account; put-off resolves the card to a live card of the account; + Today re-applies the pick rule on the write; the events read never touches `thread_calendars`.
- **DATA-1:** this document, before code.
- **OFF-1:** no new analytics event; logs carry route, outcome and counts only; the link is kept out of every property and log line.
- **OFF-2:** not applicable; nothing new in cold storage.
- **OFF-3:** content through `readable_content`; authorship from the row; another member's calendar never read; the new table cascades with the account.
- **OFF-4:** the link is a source reference on the event's own row, bounded by the window and deleted with the calendar; offload never fetches it.
- **OFF-5:** not applicable; no model output.
- **OFF-6:** + Today and its Undo are `edit_content` on the allowlist with the eight-second toast; a put-off is the person's own preference, not an action offload takes; everything outward facing (a share, a calendar write, a `person` or `calendar` question) stays in the conversation, where it is confirmed.
- **OFF-7:** one design log entry, listed in the feature spec, lands with the code.
- **OFF-8:** nothing enters a prompt.

`GATE: PASS` (no open MUST violation; DEV-1 is satisfied with two owner-stated exceptions).

**Evals:** none. Today calls no model and changes nothing a model does.

## Amended 2026-10-01: whose an event is

- **Migration `0065_whose_event.sql`**: `connector_events.created_by_me` and `invited_me`, both nullable booleans, and every calendar's sync token cleared so the next pass reads each whole.
- **The sync** (`connectors/sync.ts`) passes the connection's address and the calendar's `is_primary` to `mapEvent`; `whoseOf` (`connectors/events.ts`) sets `createdByMe` when Google's `creator.email` equals that address ignoring case, or `creator.self` holds on the primary calendar, and `invitedMe` when an attendee with `self` has not declined. Google's `creator` and the attendee's `self` are read by name in `listEvents` and dropped after; no address is stored.
- **The day read** keeps a calendar event when `created_by_me` or `invited_me` is true, or both are null. The calendar line is `Calendar: <name>`, built on the server, so an installed client shows it unchanged.
- **The thread's events** (`threads/calendars.ts` `threadEvents`) gain `involved`: the event is on the viewer's own calendar and created by them, invites them, or is not read yet. The clients draw `eventMeta(calendarName, involved)` from `@offload/widgets` under the title and quiet the title when `involved` is false.
- **Privacy:** two booleans about the account's own relation to an event; the page's account of what a calendar keeps stays true.
- **Google's `self` is the calendar's, not the person's.** On a calendar somebody shares with the account, their own events carry `self` for them. So `self`, on the creator, a guest or the organiser, counts only on the account's own primary calendar; anywhere else the account's address decides. The organiser rule this fixes predates 027: somebody else's event on a calendar they share read as trusted and kept its guests' addresses; it now reads as untrusted.
- **An event a calendar made itself** (a creator address under `calendar.google.com`: holidays, an imported feed, a group calendar's own) counts as the account's, so a subscribed calendar stays on Today.
- **Two members connecting the same calendar** hold two copies; a thread reads the viewer's own, so `involved` and `untrusted` answer for the viewer.
- **`find_events`** (`connectors/tool-calls.ts`, `routes/tools.ts`) returns `yours` per event, by the same rule as the thread's `involved`. The tool's description tells the model to say the person's own first and the rest apart; two eval cases in `08-the-calendar.json` test it and have not been run.
- **Nothing about guests is kept.** `mapEvent` carries no attendees and the schema types `connector_events.attendees` as unwritable; migration 0065 empties every stored list. `verdictFor` already read guests live from Google, so no write loses anything. `forgetPendingWrites` (`connectors/tool-calls.ts`), run by `jobs.purge`, deletes every proposal that was confirmed, declined or expired, since every reader asks for open ones only.

## Amended 2026-10-07: open in your threads

The design handoff `handoff/APPLY-2026-10-07-open-threads.md` replaces If you have time. What changed in the build:

- **`GET /v1/today/threads`** in `routes/today.ts`, built by `openThreads(accountId)` in `apps/core-api/src/today/threads.ts`, the one place the rule lives. One read over `agendaQuery` (readable, open, live, live thread) narrowed to `type = 'task' and due_at is null` (a rule always carries a date, by `content_rrule_needs_when`), with `row_number()`, `count(*)` and `min(created_at)` over the thread as window columns, kept to rank 4 or less. Threads by their oldest such row then id, `OPEN_PAGES = 12` (the limit is 48 rows, which reaches the twelfth page because each page holds a row at least); the account's default thread is read apart and goes last. Rows are `shapeRows`'s `AgendaRow`, so a row on a page and on its thread page cannot disagree. People are `facesOf` from `loose/read.ts` (the other accepted members, three at most). Not in a thread adds `loose: { inMind, holds }`: `suggestionsFor` over its drawn to-dos and `looseCounts` less `todo`. Built only when the layout has `open_threads` on; `{ pages: [], count: 0 }` otherwise. The read writes nothing and logs no words (the OFF-1 test reads it).
- **The day** keeps `picks` on the wire, always empty, for phones built before this; `today/picks.ts`, the picks routes and their tests are gone, and `startOfTomorrow` moved to `needs.ts`. `content_picks_idx` stays: dropping it is a migration for no gain at this size.
- **The layout** gains `{ kind: "open_threads", on }`, at most three sections; a document without it gets it straight after the day. `/api/me` sends `todayLayout` without it (`legacyLayout`) and `todayLayoutV2` whole, because a phone built before this draws every section that is not Needs you as the day. PATCH still takes `todayLayout`, any valid document of up to three sections. Remove the legacy field when no such build is in use.
- **Clients.** `@offload/widgets` `open-threads.ts` holds the words (`openFor`, `inMindLine`, `holdsLine`) and `keepInPlace`, which lays each re-read over the pages as drawn so a row ticked here stays where it was and the counts hold, until Today is built again. Web: `components/today/OpenThreads.tsx`, read in `TodayPane` with the day and again after every write. Phones: `components/today/OpenThreads.tsx` in `TodayScreen`, the same; the row sheet is `useTodayRows`'s, which now exposes `open` and `writes`. The tick is `completeContent` with *Ticked off* and Undo, as Not in a thread's rows have.
- **Web Today has no page title**: `PaneHead` takes an optional `title`, and the month's head is the one heading.

## Amended 2026-10-15: Answer

A `date`, `span` or `time` question with no values to offer drew *Not that* alone and could not be answered from Today. The conversation answers it by typing, and the email's question lives in the email's conversation, which a dump after the 30 minute gap or after the composer closed would not join: it would start a new conversation and close the question unanswered.

- **`POST /v1/questions/:id/resume`** in `routes/dumps.ts`, beside `answer`. In one transaction: the question, the account's, `open`, a `date`, `span` or `time` question, in a live conversation that is the account's too (the schema does not hold a question's account to its conversation's, so the read and the write both check it), or `404`; every other live conversation of the account ends (`ended_at`), as `/v1/conversations/current/end` ends one, and `closeOpenQuestions` closes their questions, 018's rule for a new conversation; the question's conversation gets `ended_at = null` and `last_message_at = now()`, which is what makes a conversation current. `200 { conversationId }`. **Nothing new rides on the dump**: the next one joins that conversation, `openQuestionIn` finds the question and the worker reads the message against it first, unchanged. `last_message_at` moves without a message; nothing else reads it.
- **Web.** `resumeQuestion` and `RESUME_COMPOSER` in `lib/dump.ts`. `NeedsYou` draws a question whose options are all `plain` as an ordinary card, not `QuickReplies`: *Answer* (a `keeps` action: *ok* dispatches the event and the card stays, *gone* settles it, *failed* puts 022's line on the card) and *Dismiss*, which is 018's answer by the plain option's index. `Composer` hears the event, refetches `/v1/conversations/current` through the same `turnsOf` the mount uses, cancels the old watches, keeps the draft and focuses the field.
- **Phones.** `typedOnly` and `resumeQuestion` in `lib/today.ts`. `NeedsYou` draws the same row from the same rule, Dismiss through `answerWrite`, the write the chips use. `useConversation().resumeConversation()` reads the tail through `turnsOfTail`, the mount's mapping, marks it live, opens the sheet and asks for focus.
- **Edge cases.** The question closed between the read and the press: `404`, the card goes. The person is mid-conversation on another device: that conversation ends, as closing the composer ends it. A second email arriving after Answer joins the reopened conversation, as any email inside the gap does, and never answers the question (026).
- **Constitution.** OFF-1: the route logs nothing and returns an id. SEC-2: account-scoped, another account's id is the same `404` as a missing one. No model call, no prompt change.

