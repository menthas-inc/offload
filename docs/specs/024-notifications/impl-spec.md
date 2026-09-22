# 024 Notifications, implementation

**Status:** drafted 2026-09-22 after the three reviews and the constitution gate (PASS)

## The shape in one paragraph

Two tables, `push_tokens` and `activity`, seven columns on `accounts`, two job kinds, one send module and one copy module on the Core API. An hourly job places each account's two digests on the jobs table at the account's own hours; each digest job reads reminders through the membership predicate, composes the copy, sends through Expo's push service to the account's tokens, and records what it did or did not do. Three writers elsewhere record the silences. The phones register a token, four channels and two categories, act on two verbs, and gain two screens: Today with an agenda, and Activity. The web gains the same page and pane and sends nothing.

## Data flow

### Placing a send

1. `digest.schedule` runs hourly, re-arming itself as the daily jobs do. It reads every active account's `time_zone`, `notify_due_today`, `notify_due_today_at`, `notify_coming_tomorrow` and `notify_coming_tomorrow_at`, computes for each enabled send the next instant of that wall time in the zone, and for any instant inside the coming hour enqueues `account.digest` with payload `{ send, day }` where `day` is the local date, `run_after` at the instant, idempotency key `account.digest:{account}:{day}:{send}`, `PRIORITY.scheduled`, `maxAttempts` 2. A disabled switch enqueues nothing, and the skip-by-setting record is written by the digest job only when it runs, so a switch turned off has no record unless there was something to say; to keep that true the schedule enqueues a send whose switch is off as well, and the job decides.
2. A settings write of an hour, a switch or the zone deletes the queued `account.digest` rows for the account whose `run_after` is still ahead. The next hourly pass re-enqueues whatever now falls in its hour.
3. `account.digest` first checks lateness: more than two hours past `run_after` is dropped with a log line of the kind and the delay, nothing else.

### Composing and sending

1. The rows: `readable_content` for the account, joined to live threads, `is_reminder`, not done, not archived, not deleted, with the type's When column inside the window, plus every such row carrying `rrule` whose anchor is before the window's end, expanded in code with the shared module for the window's days. Morning window: today minus seven days to today inclusive, overdue being any non-repeating row before today; evening window: tomorrow only, plus rules landing tomorrow. All in the account's zone, with a bare day compared by its UTC date.
2. `notifications/copy.ts` turns rows into a title and a body: the three arms, the overdue sentence, an event's hour in the account's zone, another member's row as "Ana's ferry times" with at most two named per other member, the clamp on every title (one line, control characters stripped, 120 characters), the repeating clause. Pure and exhaustively tested.
3. `notifications/push.ts` wraps `expo-server-sdk`: `send(messages)` chunks, posts with the project's access token, returns tickets; `receipts(ids)` fifteen minutes later via a follow-up job `push.receipts`; `DeviceNotRegistered` drops the token. Errors are rethrown as `PushFailed(status, code)` with nothing from the body.
4. The job records the Activity row (sent, or not sent with `reason` in `setting` or `permission`), emits the analytics event, and for a one-task digest sets `categoryId` to the verbs category and `data` to `{ kind: "digest", send, contentId }`; otherwise `{ kind: "digest", send }`.

### People sends

1. `people.ts` `request()` enqueues `people.notify` `{ kind: "request", requestId }` when the request is delivered; the job reads the request, checks it is still open and delivered, and sends "Ana wants to connect" to the recipient's tokens if their `notify_people_requests` is on.
2. `threads/sharing.ts` `shareThread()` enqueues `people.notify` `{ kind: "share", memberId }`; the job checks the row is still pending and sends "Ana shared Lisbon trip" if `notify_shared_activity` is on.
3. Every insert of a content row or a note into a thread with other accepted members, in `routes/tools.ts` after `add_content` and `add_note`, in the typed-row route and in quick add, enqueues `shared.activity` `{ threadId, authorId, since }` with idempotency key `shared.activity:{thread}:{author}:{10-minute bucket}` and `run_after` ten minutes ahead. The job reads, for each other accepted member, the rows by that author created since the bucket's start that the member may read now, composes "Ana added two to Lisbon trip" with the clamped titles, and sends to members whose switch is on.

### The verbs

1. `POST /v1/notifications/act` `{ action: "done" | "tomorrow", contentId }` with the session cookie. Done calls `completeContent`; Tomorrow calls `editContent` with the When column moved one day, refused as the route refuses a calendar-backed row. Each writes an Activity row for the account. The app's response handler for the verbs category calls it and dismisses the notification; a failure leaves it.

### Tokens

1. `POST /v1/push-tokens` `{ token, platform }`: `Expo.isExpoPushToken` or 400; upsert on the token, setting `account_id` to the session's, `platform`, `last_seen_at`. `DELETE /v1/push-tokens` `{ token }`: deletes the row if it is the session's. The app calls the delete before `authClient.signOut()`.

### Activity

1. `activity.ts`: `record(accountId, row)` inside the caller's transaction where there is one. Writers: the digest job (kinds 1 and 4), `people.notify` and `shared.activity` (kind 2), `sweepPeople` for expired requests and shares (kind 3, the sender's record, with `returning` on the updates it already runs), `edit_content` in `routes/tools.ts` when a date changes on a row that had one (kind 3, the turn's account), the verbs route (kind 3).
2. `GET /v1/activity?cursor` pages fifty newest first; `POST /v1/activity/seen` sets `accounts.activity_seen_at`; `/api/me` gains `activityUnread: boolean` computed as a row newer than `activity_seen_at` of any kind but `request`.
3. `jobs.purge` deletes rows past thirty days. `takeOut`, `leave`, the hard purge of content and account deletion delete rows that name the departed member's or the destroyed row's words, by `thread_id` and `about_account_id`, in the same transactions.

### Today

1. `GET /v1/today` returns three arrays of content rows in the thread page's shape plus `threadName`, computed from `readable_content` for the account over the window today minus thirty days to tomorrow, notes excluded, rules expanded, a repeating row placed once in the first group it lands in and never in Overdue, Overdue capped at 100 rows newest first with `overdueMore` as a count.

## Data model

### Volume and access

| Field | 024 |
| --- | --- |
| Records per account | `push_tokens`: 1 typical, 4 heavy. `activity`: 2 a day typical, 20 a day heavy, so 60 and 600 live rows under the thirty-day purge. Reminders with a date: 5 typical, 60 heavy; reminders with a rule: 2 typical, 20 heavy. |
| Fan-out | A digest names at most everything due in a day; the copy counts past four. A shared-thread send goes to every other accepted member, 1 typical, 8 heavy. |
| Growth | `activity` is bounded by the purge; `push_tokens` by devices. `jobs` gains two rows per account per day, purged as jobs are. |
| Read pattern | Activity: the screen, on open and on pull, fifty a page. Today: the screen, on open and on focus. The digest job: twice a day per account. `/api/me` reads one aggregate for the dot. |
| Write pattern | Two digest jobs a day per account; people sends on events; Activity writes with each of those. Bursty only on a shared list being tidied, which the ten-minute coalescing bounds. |
| Sort and filter | Activity by `(account_id, occurred_at desc)`. Today and the digests by the When column within a range, `is_reminder` for the digests, plus `rrule is not null`. The dot: `max(occurred_at)` per account. |

- **Pagination:** Activity server-side, cursor on `occurred_at, id`, fifty a page. Today is windowed, not paged, with Overdue capped.
- **Indexes:** `activity (account_id, occurred_at desc)`; `activity (thread_id)` and `activity (about_account_id)` for the purges; `push_tokens (account_id)` with the unique on `token`; `content (is_reminder, due_at)` and `content (is_reminder, occurs_at)` partial on `is_reminder and deleted_at is null and done_at is null`, since the digest reads across threads and the existing thread-scoped indexes do not serve it; `content (thread_id) where rrule is not null` for the rule rows.
- **Normalisation:** `accounts.activity_seen_at` rather than a per-row seen flag; the sent words stored on the row rather than re-rendered. No next-occurrence column: rule rows are few and capped at 200 per read, and the cap is the signal to add one.
- **Partitioning:** none.

### Schema

`0058_notifications.sql`

```sql
alter table accounts
  add column notify_due_today        boolean not null default true,
  add column notify_due_today_at     time    not null default '08:00',
  add column notify_coming_tomorrow  boolean not null default true,
  add column notify_coming_tomorrow_at time  not null default '19:00',
  add column notify_people_requests  boolean not null default true,
  add column notify_shared_activity  boolean not null default true,
  add column activity_seen_at        timestamptz;

create table push_tokens (
  id           uuid primary key default uuid_v7(),
  account_id   uuid not null references accounts (id) on delete cascade,
  token        text not null unique check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,64}\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_tokens_account_idx on push_tokens (account_id);

create table activity (
  id               uuid primary key default uuid_v7(),
  account_id       uuid not null references accounts (id) on delete cascade,
  kind             text not null check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted')),
  sent             boolean not null,
  reason           text check (reason is null or reason in ('setting', 'permission', 'design')),
  title            text not null check (length(title) <= 200),
  body             text check (body is null or length(body) <= 600),
  send             text check (send is null or send in ('morning', 'evening')),
  thread_id        uuid references threads (id) on delete cascade,
  content_id       uuid references content (id) on delete cascade,
  about_account_id uuid references accounts (id) on delete cascade,
  member_id        uuid references thread_members (id) on delete set null,
  request_id       uuid references connection_requests (id) on delete set null,
  occurred_at      timestamptz not null default now()
);
create index activity_account_idx on activity (account_id, occurred_at desc);
create index activity_thread_idx  on activity (thread_id) where thread_id is not null;
create index activity_about_idx   on activity (about_account_id) where about_account_id is not null;

create index content_reminder_due_idx    on content (due_at)    where is_reminder and deleted_at is null and done_at is null and archived_at is null;
create index content_reminder_occurs_idx on content (occurs_at) where is_reminder and deleted_at is null and done_at is null and archived_at is null;
create index content_rule_idx            on content (thread_id) where rrule is not null and deleted_at is null;
```

`about_account_id` is the other member whose words a row carries, so their departure or deletion purges it; `content_id` cascades on the hard purge; `thread_id` cascades with the thread. The token pattern is Expo's own. The agent role gets no grant on either table.

### The payload

```ts
type Payload =
  | { kind: "digest"; send: "morning" | "evening"; contentId?: string }
  | { kind: "request" }
  | { kind: "share"; memberId: string }
  | { kind: "shared_activity"; threadId: string };
```

The app maps a kind to a route from a switch: digest to `/`, request to `/settings/people`, share to `/invitations/[memberId]`, shared_activity to `/threads/[id]`, and on arrival each screen fetches by id as it does today. Anything else in `data` is ignored.

## Interfaces

### Client

- `GET /api/me` gains the six `notify*` fields and `activityUnread`. `PATCH /api/me` accepts the six, hours as `HH:MM`.
- `POST /v1/push-tokens`, `DELETE /v1/push-tokens`.
- `POST /v1/notifications/act`.
- `GET /v1/activity`, `POST /v1/activity/seen`.
- `GET /v1/today`.

### Internal

Unchanged.

### Agent

`evals/principles/24-a-reminder-is-asked-for.json`: the statement, why, sources, and cases: "remind me to pay the rent Friday" sets the flag; "rent is due Friday" does not; "don't let me forget the dentist Tuesday at 3" sets it on an event; "the flat's rent is 900 on the 1st" is a note with no flag; "remind me every day to take the pills" is a repeating reminder task. The prompt line "A reminder is not a type. It is `is_reminder` on a task or an event." gains "when they asked to be told: remind me, don't let me forget."

### Mobile

- `lib/notifications.ts`: permission read, `getExpoPushTokenAsync` with the project id, `setNotificationChannelAsync` for the four with `lockscreenVisibility: PRIVATE`, `setNotificationCategoryAsync` for `digest_verbs` (Done, Tomorrow, `opensAppToForeground: false`, `authenticationRequired: true`) and `digest`, the response listener mapping the payload, `getLastNotificationResponseAsync` on launch, the verbs' `act` call.
- `lib/api.ts`: the routes; `lib/auth.ts` `signOut` deletes the token first.
- `app/_layout.tsx`: register on launch when the session is active.
- `components/screens/Today.*.tsx`: the agenda groups, the strip, the bell as a `Pressable` with the dot from `useMe().activityUnread`.
- `app/activity.tsx` and `components/screens/Activity.tsx`: the list with the lead, the tag and the doors.
- `app/settings/[page].tsx`: the `notifications` page, reading channel state on Android through `getNotificationChannelAsync`.

### Web

- `components/panes/Activity.tsx` and `app/(shell)/activity/page.tsx`; `Sidebar.tsx` enables the item and draws the dot.
- `components/panes/Notifications.tsx` and its settings route.
- `components/panes/Today.tsx`: the groups.

## Prompt budget, per OFF-8

One clause on the reminder line. No tool changes.

## Dependencies

- `expo-server-sdk` on the Core API.
- Expo push credentials: an APNs key and FCM credentials uploaded to EAS, enhanced push security on with its access token in the API's environment as `EXPO_ACCESS_TOKEN`. Owner steps, batched in the tasks.
- `expo-notifications` is installed; `app.json` gains its plugin with the icon and colour.

## Tests, and what stays a device check

- `apps/core-api/test`: `digest.test.ts` (the window and the predicate: today, overdue one to seven days, not eight, repeating never overdue, evening's rules landing tomorrow, the identical-set skip, a member removed before the send, a deleted row, a note ignored, another member's row named, two-per-member cap; the schedule's keys and its hour arithmetic across a DST change; the two-hour drop; a moved hour deleting the queued job), `copy.test.ts` (every arm, the overdue sentence, the clamp, control characters, the event hour, the possessive, the repeating clause, no retired noun), `push.test.ts` (a stubbed transport: chunking, the failure carrying status and code only, `DeviceNotRegistered` dropping the token, no token in the thrown message), `tokens.test.ts` (register binds to the session, conflict re-binds, delete only the session's, the pattern), `activity.test.ts` (every writer, the reasons, the purge after thirty days, the purge on take-out, leave, hard delete and account deletion, the seen aggregate ignoring requests, readable by the account only), `today.test.ts` (the three groups, the rule placement, the cap), `people.test.ts` gains the two enqueues and the coalescing key.
- `apps/mobile/test` and `apps/web/test`: the payload mapping table, the settings bodies, the delete-before-sign-out order.
- On the simulator: `xcrun simctl push` with the payloads the server builds, the categories' verbs, the doors, the channels' creation is Android-only and left for the device; the pages and Activity in both themes. On the web: the page, the pane, the groups.

## Edge cases

- **Two devices, one account:** both tokens get every send; each records once.
- **A phone that changes accounts** re-binds its token on the next launch; until then the old account's sends reach it, which is why sign-out deletes first.
- **A member removed between compose and send** is dropped at send time, since the rows are read then.
- **A zone change mid-day** deletes today's queued jobs; if the new local day already passed the hour, no send today.
- **A reminder due today and also overdue** (a rule is never overdue; a plain row cannot be both).
- **Two hours late** drops the job; the Activity row is not written, since nothing was decided.
- **A row with an hour on a task** is announced in the morning, not at the hour.
- **Expo returns a ticket error per message** (`DeviceNotRegistered`, `MessageTooBig`, `InvalidCredentials`): the first drops the token, the others fail the job with the code.
- **Permission granted later** registers the token on the next launch; nothing prompts again.
- **The verbs on a locked phone** require unlocking by the platform's own flag; a verb with no session does nothing.

## Constitution check

- **DEV-1.** Two tables, one send module, one copy module, two job kinds; no next-occurrence column, a cap instead.
- **DEV-2.** 022's dot paragraph amended in the same change; the design's declined line logged as unbuilt.
- **QUAL-1.** Every AC names its test above and is written red first.
- **SEC-1.** Every rendered string is clamped; the payload is a closed kind; the push service requires the access token; the failure path carries no body.
- **SEC-2 and OFF-3.** Tokens bind to the session; sends resolve rows through the membership predicate at send time; the verbs resolve the account from the session and the row through the same predicate as the sheet; Activity is per account and purged on membership end.
- **OFF-1.** No token, title, name or device id reaches a log, `last_error` or an event; the four events carry counts and enums. The words leave to Expo, Apple and Google by design and the page says so.
- **OFF-4.** The digest reads `content` only; no calendar body is read or kept.
- **OFF-6.** Done and Tomorrow are the person's own acts on allowlisted writes, reversible from the row, recorded in Activity. A send lands on the person's own device.
- **OFF-7.** Aliases only; the log entries named in the feature spec are appended.
- **OFF-8.** One clause in the prompt.
- **DATA-1.** This document precedes the migration.
