# 042 Reminders, implementation

## Constitution gate

Audited against `docs/constitution/principles.md`, read fresh on 2026-10-10, on the feature spec as revised after its three reviews.

| Principle | Status | Evidence |
| --- | --- | --- |
| DEV-1 (MUST) | compliant | One table, one pure function, one job kind. Placement reuses 024's compose-at-send shape rather than a schedule table; labelling rides in the two passes that already run (032, 038). The note and memory switches are the owner's per-thing control, not extensibility. |
| DEV-2 (MUST) | compliant | 023, 024 and 038 are amended in their own specs in the same change (AC-25, task A2). |
| DEV-3 (SHOULD) | compliant | No new dependency: Postgres, the jobs table, Expo Push, the existing forced-tool calls. |
| QUAL-1 (MUST) | compliant | Every task in `tasks.md` starts with a test seen red. |
| QUAL-2 (SHOULD) | compliant | The table is one pure function (`plan()`); placement, composing and sending are separate. |
| SEC-1 (MUST) | compliant | Things to label reach the model as JSON entries in the user turn under a data label, never in a system prompt. A model-written name crosses into a push only as a run of the thing's own text, checked in the Core API (AC-5). |
| SEC-2 (MUST) | compliant | The Core API re-derives what a pass may label and anchor from the job row and the database; a stop is author-only, server-side; membership is re-checked at every send. |
| DATA-1 (SHOULD) | compliant | The schema and data flow are below, before any code. |
| OFF-1 (MUST) | compliant | Dumps untouched. Labels are derived, offload's, deleted with their thing, never exported. Job payloads, `last_error`, logs and events carry ids, windows, enums, counts and outcomes only (AC-16). |
| OFF-2 (MUST) | not applicable | No blob. The privacy edits claim nothing about encryption. |
| OFF-3 (MUST) | compliant | A label belongs to the thing's author and reminds them alone, while they are an accepted member; a stop resolves through `requireAuthor` and `requireNoteAuthor`; an anchor must be readable to the author in the same thread. |
| OFF-4 (MUST) | compliant | Mail, calendar, browser and untrusted things are never shown for labelling or reminded about (AC-2). |
| OFF-5 (MUST) | compliant | Labels come through the passes' forced tools, validated by schema, one repair as a `tool_result`; an entry failing its check is dropped alone. |
| OFF-6 (MUST) | compliant, conditional | Labelling is automatic derived state on an offload-owned surface that destroys nothing; it joins the reversible allowlist the way learned notes did (032), in a `docs/tech/decisions.md` entry on `main` (task A3). A reminder is a notification to the person's own phone, which 024 settled is not outward facing. The person's stop takes Undo where its editor already has one. |
| OFF-7 (SHOULD) | compliant | Today's Reminders section, which has no mock, the tiles, the Activity kind, the switch's reach, the web `Switch` and the readme lines get one design `decisions.md` entry with Design system impact filled (task A3). |
| OFF-8 (MUST) | compliant | The pass is shown at most 30 things to label and 20 anchors a thread, 200 characters each; the memory pass's input is already bounded at 300 memories (040). Constant in account age. |

`GATE: PASS`

## The shape in one paragraph

Two passes that already run nightly write a **label** per dated thing: the thread pass (032) for rows and notes, the memory pass (038) for memories. A label is two enums, an optional anchor and an optional short name, in one new table, `reminder_labels`, keyed to the thing and owned by its author. Nothing else is stored. When a send runs, it asks one pure function, `plan()`, which of the author's labelled things land in it, and names them under Coming up or in its due part. The hourly pass that places the sends also asks `plan()` which notifications of their own land in the next hour and enqueues one job each, keyed on the thing, the occurrence and the window. Every rule in the feature spec is either inside `plan()` or a predicate on the reads that feed it.

## Data flow

### Labelling, in the thread pass

1. `account.daily` (`jobs/handlers.ts:741`) gains a third account condition: the account authored a thing that `needsLabel` (below). `account.daily.run`'s per-thread `needs` (`handlers.ts:852`) gains the same, scoped to the thread. Both within `NIGHTLY_THREADS`.
2. `nightly.py` reads two more lists for the member in every variant (learn, propose, keep):
   - `_TO_LABEL`: the member's rows and notes in the thread that `needsLabel`, nearest effective date first, undated tasks last by `created_at desc`, `limit 30`, each with its id, which table, type, title or text cut to 200, body cut so the entry stays within 200, its date (day, or day and time), its rule, and whether it was asked about.
   - `_ANCHORS`: dated rows and notes in the thread by any author, not untrusted, not from mail, calendar or browser, not done, archived, deleted or muted, with a date today or later, nearest first, `limit 20`, each id, table, text cut to 200 and its date.
3. The listing gains two sections under the data label. The forced tool's schema gains `labels`.
4. `/internal/v1/nightly-result` gains `labels` and runs `applyLabels` in the same transaction as compaction, after membership is checked.

`needsLabel(account, thread)` is one SQL predicate shared by the booking, the worker's read and `applyLabels`:

- a row of the account's in the thread, `source = 'person'` or `'share'`, whether or not offload has written it to a calendar (`source_ref` no longer counts since 0090, amended 2026-10-10), its message not untrusted and not from mail, calendar or browser, not done, archived or deleted, **and either** dated with its effective date today or later, **or** an undated open task created in the last 30 days, in a thread that holds a dated thing it could be for;
- or a thread note of the account's, not untrusted, not deleted, superseded or muted, dated today or later;
- **and** no label row for it, or a label whose `fingerprint` differs from `remind_fingerprint(...)` now; never one with `stopped_at` set.

### Labelling, in the memory pass

`memories.py` already shows the pass every memory. Each entry gains `"dated": true|false` (whether it has a label). The tool gains `dates: [{ id, on: "MM-DD", lead, name }]` (at most 20). `/internal/v1/memory-result` runs `applyMemoryDates`: an `on` for a memory that is not People or About, not active, or not the account's own, is dropped; `on` must be a real month and day (29 February allowed); `name` passes the same run-of-own-text check. Every active People or About memory **shown** to the pass that has no label and gets no entry is written as `kind = 'none'` with its fingerprint, so it is not asked again until its words change. `passOwed` (`handlers.ts`) gains the condition: an active People or About memory without a label, or whose fingerprint differs.

### A date set by somebody else

`editContent` (`routes/threads.ts:647`) and the turn's `edit_content` (`routes/tools.ts`) already know the actor; both call `dateSet`. A note's date is written only by its author's own paths, so notes need no hold. When the actor is not the thing's author and a date column changes, they upsert the label with `held_at = now()`. When the author edits the thing, by hand or through their own turn, they set `held_at = null`, and when a date column changed, `date_set_at = now()`. A held thing is planned as if it had no label and no default.

### Placing and sending

**The sends** (`notifications/digest.ts`). Since 2026-10-10 the send's read takes a row with `source_ref` when its `source` is person or share, and the morning's due part also names the day's events on the account's own calendars under `notify_calendar`; see the amendment below. `composeDigest` gains `remindersIn(trx, accountId, send, day)`: when `notify_reminders` is on, read the account's candidates (below) and keep each whose `plan()` places a window in this send on this day. The due part is 024's rows, those held back by a switch removed, plus the on-the-day reminders without a clock time (morning) or the evening-before reminders (evening), deduplicated by thing id with 024's rows first. Coming up is the month and week outs. `runDigest` sends when either is non-empty; the not-sent-by-setting record is written only when 024's rows had something and nothing at all is sent.

**Candidates**, one read per send, per account:

```sql
select ... from reminder_labels l
left join content c on c.id = l.content_id
left join notes n on n.id = l.note_id
where l.account_id = :account
  and l.stopped_at is null and l.held_at is null
  and l.kind is not null and l.kind <> 'none'
  -- each joined thing: live, not done/archived/deleted/muted, author still an
  -- accepted member of its thread (thread things), date in [today - 1, today + 57]
  -- or a rule or `yearly_on`; an anchored task's anchor live and dated
limit 500
```

**Notifications of their own** (`notifications/reminders.ts`). The hourly `digest.schedule` handler also calls `scheduleOwn(now)`: one read across accounts with `notify_reminders` on and a `time_zone`, of timed things (rows and notes with a clock time, not all-day) whose instant is in `[now, now + 2h)`, or that carry a rule (capped per account at `RULE_ROWS_CAP`), with their label, or none, and `is_reminder`. `plan()` decides; each own slot in `[now, now + 1h)` is enqueued:

```ts
kind: "reminder.own", accountId, payload: { contentId | noteId, occurrence: "YYYY-MM-DD", window: "day", at },
priority: PRIORITY.scheduled, runAfter: at,
idempotencyKey: `reminder.own:${thingId}:${occurrence}:day`, maxAttempts: 2
```

The job re-reads the thing and its label, re-runs `plan()` with now, and sends only if the same slot still comes out; it is dropped more than 15 minutes late. It sends to the account's tokens with `takes_reminders`, on the `reminders` channel, with `data = { kind: "reminder", threadId, contentId | noteId }`, records Activity `kind = 'reminder'`, `sent`, `thread_id`, `content_id` or `note_id`, and enqueues receipts exactly as a digest does. No token that takes it: recorded not sent, reason `permission`.

### `plan()`

`apps/core-api/src/notifications/plan.ts`, pure:

```ts
interface Thing {
  kind: Kind | null;            // null: unlabelled
  lead: Lead | null;
  when: { day: string; time: string | null } | null;  // own or anchor's; null for an undated, unanchored task
  anchored: boolean;            // effective day is the anchor's day minus one
  rule: Rule | null;            // FREQ=... or yearly from `yearly_on`
  asked: boolean;               // is_reminder
  since: Date;                  // max(created_at, date_set_at)
  labelledAt: Date | null;
}
interface Clock { zone: string; morning: string; evening: string; count: 1 | 2 | 3; now: Date }
type Slot = { window: Window; occurrence: string } & ({ at: "send"; day: string; send: Send } | { at: "own"; instant: Date });
function plan(thing: Thing, clock: Clock): Slot[];
```

In order: the next occurrence (a rule's first at or after today; weekly or more often keeps `day` only; monthly keeps `short` and `day`); the windows for (kind, lead) in their order; each window's place; drop past-at-labelling, drop within two days after `since` (not `day`); the late month out; cut to `count`; the asked-at-a-time `day` slot at the time itself, put first; the unlabelled default (`kind` null, a time, the instant within 24 hours of now: one `day` slot 30 minutes before, regardless of `count`); then the 7:00 and 22:00 bounds turn an own slot into a send slot. The two tables are constants in the same file, and the test reads them cell by cell.

### Today's Reminders section

`GET /v1/today/reminders` in `routes/today.ts`, from `today/reminders.ts`, one route per section as Needs you, the day and Open in your threads are. It runs the same candidate read as a send, **without** the `notify_reminders` condition, calls `plan()` for each, and keeps a thing when its first kept slot's moment is at or before now and its effective date is today or later in the account's zone. A row whose effective date is today is dropped, since Your day draws it; a note or a memory is kept. Ordered by effective date, then time, then id; the first 20 and the count of the rest. Rows come back in the shape `today/rows.ts` already gives Your day and Open in your threads, so the clients draw the thread page's row; notes and memories as `{ of, id, name, day, time?, threadId?, threadName? }`, the name by the same rule as the copy (the label's name, else the first 60 characters cut at a word).

**The layout** (`today/layout.ts`). A fourth kind, `{ kind: "reminders", on }`, in `DEFAULT_SECTIONS` between `day` and `open_threads`; `layoutShape` allows four sections; `remindersOn()` beside `openThreadsOn()`. `resolveParsed` already places a missing kind straight after the kind before it in the default order, so a stored layout without it gains it after Your day. `/api/me` follows the precedent of 2026-10-07 one step further: `todayLayout` without `open_threads` or `reminders` (the oldest builds), `todayLayoutV2` without `reminders` (builds that know Open in your threads, which draw any other kind as Your day, `TodayScreen.tsx:407`), and `todayLayoutV3`, the whole document. `PATCH /api/me` still takes `todayLayout` with the wider schema; a layout written by a V2 build has no `reminders` and resolves with it at its default place, the same loss 2026-10-07 accepted for Open in your threads.

### The person's controls

- `PATCH /api/me` takes `notifyReminders` and `notifyReminderCount`, and since 2026-10-10 `notifyCalendar`. Nothing queued needs deleting: every job re-runs `plan()`.
- `PATCH /v1/content/:id` takes `reminders: "on" | "off"`, folded into the row sheet's one save and its Undo snapshot; a thread note or a memory is switched through `PUT /v1/reminders` `{ of: "content" | "note" | "memory", id, on }`, since their editors write their words through routes of their own. Both go through `setReminders`, author-only (the row's or the note's author while an accepted member, the memory's own account), and anybody else gets the 404 a thing that does not exist gets. `"off"` upserts the label with `stopped_at = now()` and, on a row with `is_reminder`, sets it false in the same write; `"on"` clears `stopped_at`, and is how Undo puts it back. Neither ever sets `is_reminder` true. Undo on the row puts back `is_reminder` through the existing snapshot.

## Data model

### Volume and access

| Field | Estimate |
| --- | --- |
| Records per account | Labels: 150 typical, 3,000 heavy after two years (one per dated thing and per undated task ever labelled, plus one per People or About memory, at most 300). Reminders themselves are not records. |
| Fan-out | Labels per thread: 10 typical, 400 heavy. Anchored tasks per anchor: 3 typical, 20 heavy. |
| Growth | About 4 labels a day for an active account: 1,500 a year. |
| Read pattern | Each send, and each opening of Today: one candidate read for the account, 30 typical, 500 cap; Today returns at most 20. The hourly own pass: one read across accounts of timed things in the next two hours, about 1 per active account per hour typical. The nightly pass: 30 and 20 per thread. Every row, note and memory read for the author: whether it has a label, by key. |
| Write pattern | Nightly, bursty at the daily run: up to 30 labels per thread pass. A held or stopped write when a person edits. |
| Sort and filter | By account, live (`stopped_at` and `held_at` null, kind not none); by thing id; timed things by instant across accounts. |

What follows:

- **Pagination:** none. Every read is capped (500 a send, 30 and 20 a pass) and ordered nearest first; nothing lists labels to a person.
- **Indexes:** `reminder_labels (account_id) where stopped_at is null and held_at is null and kind is not null and kind <> 'none'` for the send read; unique `(content_id)` and unique `(note_id)` for the joins and the upsert; `content (occurs_at)` and `content (due_at)` partial on `deleted_at is null and done_at is null and archived_at is null` for the hourly own pass (0089 also required `source_ref is null`; 0090 dropped it, so a dumped row offload wrote to a calendar is read too, amended 2026-10-10), which today's `content_reminder_*_idx` do not cover since they require `is_reminder`; `notes (occurs_at) where scope = 'thread' and deleted_at is null` likewise.
- **Normalisation:** nothing is denormalised. A label holds no date: the date is read from its thing at send time, so nothing has to be kept in step when a date moves. `fingerprint` is the one derived column, recomputed in SQL by one function wherever it is compared.
- **Partitioning:** none.
- **Scale note:** the hourly own pass reads across accounts. At ten thousand active accounts it is about ten thousand rows an hour on two indexes; past that, placement moves to a per-account read at each morning send plus a sweep for things dumped since.

### Schema

`0089_reminders.sql`, taken on the board 2026-10-10, as built. Its four `source_ref is null` clauses, in `reminder_anchors`, `reminders_wanted`, `content_due_live` and `content_occurs_live`, were taken out by `0090_calendar_in_the_morning.sql` the same day; the block below is 0089 as it was (amended 2026-10-10).

```sql
-- 0089 Reminders (042).
--
-- What offload worked out about a dated thing so it can remind its author, and
-- nothing else. **No date and no schedule are stored here**: the date is read
-- from the thing whenever a send or the hourly pass asks, so a moved date, a
-- tick or a change of How many needs nothing kept in step. Derived, offload's,
-- never exported, and deleted with its thing.

create table reminder_labels (
  id                 uuid primary key default gen_random_uuid(),
  -- The thing's author, and the only account it reminds.
  account_id         uuid not null references accounts (id) on delete cascade,
  content_id         uuid references content (id) on delete cascade,
  -- A thread note, or a memory (a note of scope 'account').
  note_id            uuid references notes (id) on delete cascade,
  -- Null on a label that only records a stop made before any pass read it.
  kind               text check (kind in ('meeting', 'appointment', 'occasion', 'deadline', 'trip', 'day', 'none')),
  lead               text check (lead in ('none', 'days', 'weeks', 'months')),
  -- An undated task's date for reminders is the day before this thing starts.
  anchor_content_id  uuid references content (id) on delete set null,
  anchor_note_id     uuid references notes (id) on delete set null,
  -- A note's or a memory's name in a notification: a run of its own words.
  name               text check (char_length(name) between 1 and 60 and name !~ '[\r\n]'),
  -- A memory's date, which comes round every year.
  yearly_on          text check (yearly_on ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  -- What the label was judged on, from content_fingerprint or note_fingerprint.
  fingerprint        text,
  labelled_at        timestamptz,
  -- The author last set the date. The two-day rule reads it.
  date_set_at        timestamptz,
  -- Somebody else set the date last: nothing is sent until the author edits.
  held_at            timestamptz,
  -- The author's Remind me, off. Never cleared by a pass.
  stopped_at         timestamptz,
  created_at         timestamptz not null default now(),
  check (num_nonnulls(content_id, note_id) = 1),
  check (num_nonnulls(anchor_content_id, anchor_note_id) <= 1),
  check ((kind is null) = (lead is null))
);

create unique index reminder_labels_content on reminder_labels (content_id) where content_id is not null;
create unique index reminder_labels_note on reminder_labels (note_id) where note_id is not null;
-- The send's candidate read, and Today's.
create index reminder_labels_live on reminder_labels (account_id)
  where stopped_at is null and held_at is null and kind is not null and kind <> 'none';

-- Which kind of date a row or a note carries, never its value, so moving a
-- date keeps its label and adding or clearing one asks for another.
create function remind_date_shape(at_due timestamptz, at_occurs timestamptz, attrs jsonb, is_event boolean)
returns text language sql immutable as $$
  select case
    when (case when is_event then at_occurs else at_due end) is null then ''
    when coalesce((attrs ->> 'all_day')::boolean, false) then case when is_event then 'occurs' else 'due' end
    else case when is_event then 'occurs-time' else 'due-time' end
  end
$$;

-- What a label was judged on. One definition, compared by the daily run, the
-- worker's read and the Core API's apply.
create function content_fingerprint(c content) returns text language sql stable as $$
  select md5(concat_ws(chr(31), c.type, c.title, coalesce(c.body, ''),
    remind_date_shape(c.due_at, c.occurs_at, c.attrs, c.type = 'event'),
    coalesce(split_part(c.rrule, ';', 1), '')))
$$;

create function note_fingerprint(n notes) returns text language sql stable as $$
  select md5(concat_ws(chr(31), 'note', n.text,
    remind_date_shape(n.due_at, n.occurs_at, n.attrs, n.occurs_at is not null),
    coalesce(split_part(n.rrule, ';', 1), '')))
$$;

alter table accounts add column notify_reminders boolean not null default true;
alter table accounts add column notify_reminder_count smallint not null default 2
  check (notify_reminder_count between 1 and 3);

-- A phone built before 042 has no channel or door for a reminder of its own,
-- so it is sent none; it registers without saying it takes one.
alter table push_tokens add column takes_reminders boolean not null default false;

alter table activity drop constraint activity_kind_check;
alter table activity add constraint activity_kind_check
  check (kind in ('digest', 'request', 'share', 'shared_activity', 'expired', 'moved', 'acted', 'labelled', 'mail', 'export', 'reminder'));
-- A reminder about a note goes with the note.
alter table activity add column note_id uuid references notes (id) on delete cascade;
-- Which memories a send named, so forgetting one can find its records.
-- Not a column on activity_mentions, whose key is a thread and an account.
create table activity_memories (
  activity_id uuid not null references activity (id) on delete cascade,
  note_id     uuid not null references notes (id) on delete cascade,
  primary key (activity_id, note_id)
);
create index activity_memories_note on activity_memories (note_id);

-- The hourly pass's read of timed things across accounts.
create index content_due_live on content (due_at)
  where deleted_at is null and done_at is null and archived_at is null and source_ref is null;
create index content_occurs_live on content (occurs_at)
  where deleted_at is null and done_at is null and archived_at is null and source_ref is null;
create index notes_occurs_live on notes (occurs_at) where scope = 'thread' and deleted_at is null;

-- The worker reads which of a member's things need a label; it never writes one.
grant select on reminder_labels to offload_agent;

-- A message whose words are not the person's own: a forwarded email, a
-- calendar, a capture, anything untrusted. Nothing it filed is reminded about.
create function reminder_foreign(message uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from messages m
     where m.id = message
       and (m.derived_from_untrusted or m.source in ('mail', 'gmail', 'calendar', 'browser'))
  )
$$;

-- What an undated task in a thread may be for: a dated row or note there, by
-- any member, dated today or later, live, and the person's own words.
create function reminder_anchors(thread uuid)
returns table (of text, id uuid, at timestamptz)
language sql stable as $$
  select 'content', c.id, case when c.type = 'event' then c.occurs_at else c.due_at end
    from content c
   where c.thread_id = $1
     and c.deleted_at is null and c.archived_at is null and c.done_at is null and c.source_ref is null
     and not reminder_foreign(c.derived_from_message_id)
     and (case when c.type = 'event' then c.occurs_at else c.due_at end) >= now() - interval '1 day'
  union all
  select 'note', n.id, coalesce(n.occurs_at, n.due_at)
    from notes n
   where n.scope = 'thread' and n.subject_id = $1
     and n.deleted_at is null and n.superseded_at is null and n.muted_at is null
     and not n.derived_from_untrusted and not reminder_foreign(n.derived_from_message_id)
     and coalesce(n.occurs_at, n.due_at) >= now() - interval '1 day'
$$;

-- What a member's pass may label in a thread: their own dated rows and notes,
-- dated today or later or repeating, and their undated tasks of the last 30
-- days; never a stopped one, and never one whose label still matches. One
-- definition for the daily run's booking, the worker's read and the apply.
create function reminders_wanted(account uuid, thread uuid)
returns table (of text, id uuid, at timestamptz, born timestamptz)
language sql stable as $$
  select 'content', c.id, case when c.type = 'event' then c.occurs_at else c.due_at end, c.created_at
    from content c
    left join reminder_labels l on l.content_id = c.id
   where c.account_id = $1 and c.thread_id = $2
     and c.deleted_at is null and c.archived_at is null and c.done_at is null
     and c.source in ('person', 'share') and c.source_ref is null
     and not reminder_foreign(c.derived_from_message_id)
     and ((case when c.type = 'event' then c.occurs_at else c.due_at end) >= now() - interval '1 day'
          or c.rrule is not null
          or (c.type = 'task' and c.due_at is null and c.created_at > now() - interval '30 days'
              -- An undated task can only be for a dated thing, so it is
              -- worth a pass only in a thread that holds one.
              and exists (select 1 from reminder_anchors($2))))
     and (l.id is null or (l.stopped_at is null and l.fingerprint is distinct from content_fingerprint(c)))
  union all
  select 'note', n.id, coalesce(n.occurs_at, n.due_at), n.created_at
    from notes n
    left join reminder_labels l on l.note_id = n.id
   where n.account_id = $1 and n.scope = 'thread' and n.subject_id = $2
     and n.deleted_at is null and n.superseded_at is null and n.muted_at is null
     and not n.derived_from_untrusted and not reminder_foreign(n.derived_from_message_id)
     and (coalesce(n.occurs_at, n.due_at) >= now() - interval '1 day' or n.rrule is not null)
     and (l.id is null or (l.stopped_at is null and l.fingerprint is distinct from note_fingerprint(n)))
$$;

-- The memories a memory pass may date: People and About, active, with no
-- label or with words changed since, never one whose reminders were stopped.
create function memories_to_date(account uuid)
returns table (id uuid, kind text, text text)
language sql stable as $$
  select n.id, n.kind, n.text
    from notes n
    left join reminder_labels l on l.note_id = n.id
   where n.scope = 'account' and n.subject_id = $1 and n.account_id = $1
     and n.kind in ('people', 'about')
     and n.deleted_at is null and n.superseded_at is null
     and (l.id is null or (l.stopped_at is null and l.fingerprint is distinct from note_fingerprint(n)))
$$;
```

- `activity_memories` is how a send's record that named a memory is found when the memory is forgotten: the memory's forget path deletes the activity rows it mentions, alongside 024's `purgeAbout` and `purgeNaming`. A memory is soft-deleted on forget, so the cascade on `note_id` is not enough on its own; the forget path does it.
- `activity.note_id` cascades a `reminder` row about a note when the note goes; `content_id` already does for rows.
- `dated` in the fingerprint is the shape of the date (`due`, `due-time`, `occurs`, `occurs-time`, or empty), not its value, so moving a date does not ask for a new label.
- `notify_reminders` defaults to true, so the feature is on for every account once the privacy page is live, as 024's sends were. `notify_reminder_count` 2 is Medium.

### The payload

`{ kind: "reminder", threadId: uuid, contentId?: uuid, noteId?: uuid }`, never a title or a route. `routeFor` maps it to `/threads/[threadId]` after the ids pass the UUID check, and the thread screen re-reads it. A memory is never a notification of its own (occasions have no clock time), so there is no memory payload.

## Interfaces

### Client

- `GET` reads of rows (thread, Today, loose, search), notes and memories gain `reminders: "on" | "off" | null`, non-null only for the author and only for a thing with a label whose kind is not `none`: `"off"` when stopped, `"on"` otherwise. One SQL fragment, `remindersOf(viewer)`, joined by key in each read. The bell draws on `reminders === "on" || isReminder`; the switch draws for the author when `reminders` is non-null, and for anybody while `isReminder`.
- `PATCH /v1/content/:id`: `reminders: "on" | "off"`, and `previous.reminders` for Undo. `PUT /v1/reminders` `{ of, id, on }` for a note or a memory. Author-only; anybody else gets 404.
- `GET /api/me` and `PATCH /api/me`: `notifyReminders: boolean`, `notifyReminderCount: 1 | 2 | 3`, and `notifyCalendar: boolean` (amended 2026-10-10).
- `POST /v1/push-tokens`: optional `takes: ["reminder"]`, written to `takes_reminders`; a token registered without it is set false, so a re-registration from an older build turns it off.
- `GET /v1/activity`: entries of kind `reminder` with `threadId` and `contentId` or `noteId`.
- `GET /v1/today/reminders` → `{ rows: (AgendaRow & { remindDay, remindBy })[], others: [{ of: "note" | "memory", id, name, day, by, threadId, threadName, threadIcon, threadHue }], more: number }`, each list nearest first.
- `GET /api/me`: `todayLayoutV3`; `todayLayoutV2` loses nothing it has today.

### Internal

```
POST /internal/v1/nightly-result
  + labels: [{ id: uuid, of: "content" | "note", kind, lead, before?: { id: uuid, of: "content" | "note" }, name?: string(1..60) }] (<= 30)
  + labelShown: [{ id: uuid, of: "content" | "note" }] (<= 30)
  -> + labelled: number, labelsIgnored: number

POST /internal/v1/memory-result
  + dates: [{ id: uuid, on: "MM-DD", lead, name?: string(1..60) }] (<= 20), dateShown: uuid[] (<= 20)
  -> + dated: number, datesIgnored: number
```

`applyLabels(trx, { accountId, threadId, shown, entries })` in `notifications/labels.ts`: the eligible set is re-read with `reminders_wanted`, the anchors with `reminder_anchors`, both SQL functions of migration 0089 that the daily run's booking and the worker's reads call too, so the three cannot drift; an entry outside either is ignored; `before` only on an undated task; whatever was shown and left out is written as `none`, so a thing the model skips is not booked every night; `name` only on a note, accepted when `nameIsOwn(name, text)`; upsert by thing id, setting kind, lead, anchor, name, fingerprint, `labelled_at`, and `date_set_at` to the thing's `created_at` when the label is new.

`nameIsOwn(name, text)`: both trimmed, whitespace runs collapsed, compared case-insensitively; the name is a substring of the text; no `://` or `www.`, no `@`, no `\d{4}`. Otherwise the name is dropped and the copy uses the text's first 60 characters cut at a word.

### Agent

- `prompts/nightly.md` gains a **Reminders** section, included in all three variants: what the two labels mean, each with the examples in the feature spec's tables; `none` as the default for anything kept rather than acted on; "remind me a week before" is evidence; a task is for a dated thing only when its words or the thread say so; a name is copied from the note, never written. The trust paragraph already covers the new sections.
- `nightly.py`: `_TO_LABEL`, `_ANCHORS`, two listing sections, `labels` in each plan model with `Literal` enums and the 30 cap; `_held_to_the_rules` drops a label whose id was not shown.
- `prompts/memory.md` gains three sentences: a People or About memory stating a date that comes round every year gets `on`, `lead` and `name`; never their own birthday; the name is copied from the memory.
- `memories.py`: `dated` on each entry, `dates` and `shown` in the plan and the post.
- `config.py`: no new model. Both passes keep theirs.

Model input, the two new sections of the thread pass:

```
Dated, for reminders, nearest first, one JSON object per line:
{"entry": 1, "kind": "to-do", "text": "Get the visa"}
{"entry": 2, "kind": "note", "text": "We're staying in Istanbul the 10th to the 12th", "when": "2026-11-10"}
What a task could be for:
{"dated": 1, "text": "Lisbon 12 to 19 November", "when": "2026-11-12"}
```

### Mobile

- `lib/notifications.ts`: `prepare()` creates `reminders` from the shared constants; registration sends `takes: ["reminder"]`; `Payload` and `routeFor` gain `reminder`.
- `components/settings/NotificationsPage.tsx`: the Reminders section; `CHANNEL_OF.notifyReminders = "reminders"`; the hour rows grey on both switches; the Dates caption.
- `components/settings/ChoiceTiles.tsx` gains `disabled`; a `CountPreview` draws a line, a date mark and one to three marks before it from tokens.
- `RowEditSheet.tsx`, `shell/Notes.tsx`'s editor, `memories/MemoryEditor.tsx`: the switch on the condition above, writing `reminders`; the row sheet folds it into its single Save as it does `isReminder`; the note editor through the thread's write helper with its Undo; the memory editor drawn first and written second with its own failure line.
- `shell/DateChip.tsx`: the bell on the new condition.
- `changeToken` is left as it is: it keys the flash that says offload moved a date on catch-up, and the rows are replaced from the server anyway, so a bell that changes overnight redraws without flashing. The two mobile optimistic mergers (`today/useTodayRows.tsx`, `loose/useLooseRows.tsx`) carry it.
- `lib/activity.ts` `doorOf`: `reminder` opens the thread.
- `lib/today.ts`: the `reminders` section kind, `SectionSwitch` gains it, `layoutOf` reads `todayLayoutV3` first, then V2, then the default. `TodayScreen.tsx` draws the section today only and never over the day-one invitation: rows through the same row component Open in your threads uses, notes and memories as a name, a date and a meta line, "and N more" as Open in your threads does; and the fall-through that draws an unknown kind as Your day becomes an explicit `day` branch, so the next kind cannot repeat the trap. `CustomizeSheet.tsx`'s `SECTION` gains Reminders and its line.

### Web

- `components/panes/Notifications.tsx`: the Reminders section; tiles with `disabled`; the hour greying; the caption. `lib/settings.ts` `notifySummary` counts Reminders.
- `EditModal.tsx`: the checkbox becomes the `Switch` the settings pages use, on the new condition. `panes/Notes.tsx` and `panes/Memories.tsx` editors: the same switch.
- `panes/Today.tsx` draws the section in layout order and its branch on `section.kind` becomes exhaustive; `today/Customize.tsx`'s `SECTION_NAME` and `SECTION_LINE` gain Reminders; `lib/use-me.ts` reads `todayLayoutV3`.
- `shell/DateChip.tsx`, the three web mergers (`today/useTodayRows.tsx`, `loose/useLooseRows.tsx`, `panes/Thread.tsx`), and `lib/notifications.ts` `doorOf` as on the phones.

### Shared

`packages/widgets/src/notifications.ts`: `CHANNELS` gains `reminders` named Reminders; the Activity kind union gains `reminder`; `activityGlyph` maps it to `bell`. The `notification-constants` test holds the five channel ids.

### As built, beside the interfaces above

- **The bell and the switch** are computed on the server and sent as `reminders` on every row (the `withPhotos` funnel every row read passes through), every note (`withNoteLabels(rows, executor, viewerId)`) and every memory (`listMemories`); `@offload/widgets` `bellOn` and `remindSwitchShown` read them the same way on both clients.
- **The own reminder's job** carries `{ of, id, occurrence, at }` and nothing else; it re-plans with `now` clamped to its own moment and sends only if the same instant comes out.
- **Events:** `reminder_sent` `{ via: "morning" | "evening" | "own", long, short, day }` and `reminders_labelled` `{ labelled, ignored }`, under the pseudonym, with schemas in `schemas/events/`.
- **The privacy gate** is the merge: the web and the API deploy together, and the page's four edits, `UPDATED` and `CONSENT_VERSION` are pinned by tests.
- **An undated task** is worth a pass only in a thread that holds a dated thing it could be for, so a new to-do in an ordinary list books nothing.
- **From the implementation review:** `dateSet` holds on a non-author's words as well as their date and records `date_set_at` on the hold; `noteWordsSet` does the same for a note another member's turn rewrote; `editContent` refuses `isReminder: true` from a non-author and treats a switch flipped alone as no edit (no `updated_at`, no thread activity); the Undo snapshot's `reminders` reads on for an asked row; `content.purge` deletes the `activity` rows `activity_memories` names before it purges the notes; `reminder_anchors` requires `source in ('person', 'share')`; `oneLine` strips `\p{Cf}`; `applyMemoryDates` refuses an About memory naming their own birthday; `plan()` honours an asked clock time on a kind whose table has no day; the model-facing listing key is `entry`, not the retired noun.
- **Shared on both clients:** `bellOn`, `remindSwitchShown`, `hoursOn`, `REMINDER_COUNT_DEFAULT`, `MEMORY_PARAM`, `CALENDAR_LINE` (2026-10-10) and the copy constants in `packages/widgets/src/reminders.ts`.

## Prompt budget, per OFF-8

| Pass | New input | Bound |
| --- | --- | --- |
| Thread pass | things to label | 30 entries, 200 characters each: about 2,000 tokens at most, 300 typical |
| Thread pass | anchors | 20 entries, 200 characters each: about 1,200 tokens at most, 150 typical |
| Thread pass | output | 30 labels at about 30 tokens: 900 at most |
| Memory pass | `dated` per memory | one boolean on at most 300 entries |
| Memory pass | output | 20 dates at about 25 tokens |

A pass grows from 2,000 to 4,000 input tokens typical by about 15 percent, and its cap from about 15,000 to about 18,000. Labelling adds no model call.

## Dependencies

None new. Expo Push and the receipts job are 024's. No open decision in `docs/tech/decisions.md` is touched.

## Tests, and what stays a device check

- `plan.test.ts`: every cell of both tables; drop then cut; the two-day rule and its `day` exemption; the late month out, and its three-day condition; the anchored day before; weekly, monthly and yearly rules; the asked time; the default; 7:00 and 22:00 across a clock change; a zone ahead and behind UTC.
- `labels.test.ts`: `applyLabels` ignores an id not shown, another member's thing, a mail or untrusted thing, an anchor outside the thread or undated, `for` on a dated thing, a name that is not a run of the note; `needsLabel` with a fingerprint change and a stopped thing; held and `date_set_at` from `editContent` by author and non-author.
- `digest.test.ts`, extended: the today part with reminders and with Due today off; Coming up; the evening part; once per thing; the body cut; no not-sent record when the send went.
- `copy.test.ts`, extended: each Coming up arm, "by" and "on", the weekday, tomorrow, day and month, the four timed titles, the counted titles.
- `reminders-own.test.ts`: placement keys, a second run placing nothing, re-check at run (ticked, moved, stopped, held, membership ended, Reminders off), dropped 15 minutes late, only tokens that take it, the permission record, the payload's keys.
- `reminders-control.test.ts`: the stop author-only on all three routes; `is_reminder` off with a stop and never on; Undo.
- `today-reminders.test.ts`: begun at Low, Medium and High; ended after the day; a row due today left to Your day, a note and a memory kept; Reminders off still listed, a stop not; another member's thing never; 20 and the count; the order.
- `today-layout.test.ts`, extended: the fourth kind, its default place, a stored three-section layout gaining it after Your day wherever Your day was moved, V2 without it, V3 with it, a V2 write keeping it.
- `apps/mobile/test/today.test.ts` and `apps/web/test/today.test.tsx`: the section's place, its switch in Customize, the empty case, V3 read before V2.
- `notifications-schema.test.ts` and `notify-writers.test.ts`: the new kind and columns; `analytics.test.ts`: the two events' properties.
- `test_nightly.py` and `test_nightly_db.py`: the two reads, their filters and caps; `test_memories.py`: `dated`, `dates`.
- Privacy: the page test for the four edits and the consent version.
- **Device:** the tiles and the editors at 200% text; a notification of its own on a locked iPhone and Pixel; the `reminders` channel created after an update; the morning send with Coming up on both lock screens.

## Edge cases

- **A thing whose author left** is dropped by the candidate read's membership join; its label stays, harmless, and goes with the thing.
- **An anchor deleted** sets the task's anchor to null; the task has no date and nothing is planned. It is not relabelled until its words change.
- **An anchor that is another member's note** reminds only the task's author and is never named.
- **A note that is both a trip and has a clock time** ("flight Friday at 6, Lisbon till Sunday") is labelled once; the trip row has no on-the-day slot, so nothing goes at 6.
- **A memory superseded** (038): the new memory has no label and is labelled next pass; the old one's label is not read, since the candidate read requires an active memory.
- **29 February** reminds on 28 February in other years.
- **Two members both dumped the same trip**: each has their own thing and their own reminders.
- **The zone changes** between placement and run: the job re-runs `plan()` and drops a slot that moved.
- **An unlabelled timed row dumped at 21:50 for 22:10**: the default is 21:40, already past, so nothing goes.
- **A send with only Coming up, or only the day's calendar events, and Due today off** goes on `due_today`'s channel as before; a person who switched that channel off in the system has the account switch mirrored off, and the send still goes for Reminders, which is the 024 behaviour for a channel the system blocks: the system drops it. Recorded as sent, the limit 024 accepted.
- **A phone that knows Open in your threads but not Reminders** reads V2 and draws no Reminders section; its Customize cannot move it; a layout it saves keeps Reminders at its default place.
- **An old phone** registers without `takes`, gets the sends with Coming up in their words, and no notification of its own.

## Amended 2026-10-10: the calendar in the morning

The owner's tweak of 2026-10-10 to 024 and 042. The feature spec's section of the same name says what; this is how.

- **`0090_calendar_in_the_morning.sql`** redefines `reminder_anchors` and `reminders_wanted` with `c.source in ('person', 'share')` and without `c.source_ref is null`, and recreates `content_due_live` and `content_occurs_live` partial on `deleted_at is null and done_at is null and archived_at is null` alone. `scheduleOwn`'s account read (`notifications/own.ts`) and `candidatesOf` (`notifications/reminders.ts`) drop the same clause and keep `source in ('person', 'share')`. A calendar's own row has `source = 'calendar'` and is still never labelled, an anchor or reminded about.
- **The send.** `composeDigest`'s read takes `source_ref is null or source in ('person', 'share')`, so a dumped row offload wrote to a calendar is named as a reminder. The morning's due part also carries the day's events from `today/day.ts` `calendarOn`, the account's own ticked calendars and its own part of them; `runDigest` drops them when `notify_calendar` is off, leaves out an event written from a row the send names (024's rows or `remindersIn`'s due part), sorts the due part all-day first then by the hour, and sends with no verbs when it names one.
- **The switch.** `accounts.notify_calendar boolean not null default true`; `/api/me` `notifyCalendar`; `hoursOn` takes an optional `notifyCalendar` for the morning hour; `CALENDAR_LINE` in `@offload/widgets`; the Calendar group on both Notifications pages between Reminders and People; `CHANNEL_OF.notifyCalendar = "due_today"` on the phones; the phones' Notifications card on Today counts it.
- **Activity.** `activity_calendars (activity_id, calendar_id)` and the trigger function `activity_with_calendar()`, `before delete` and `after update of selected` to false on `connector_calendars`, delete a record that named a calendar's events with that calendar.
- **Tests:** `apps/core-api/test/calendar-morning.test.ts` (a written dumped row labelled and an anchor where a calendar's own row is neither, its reminder of its own, its naming in the morning; the events, the switch, the record leaving with the calendar), `apps/web/test/reminders-notifications.test.tsx`, `apps/mobile/test/notifications-page.test.ts`, `apps/mobile/test/today.test.ts`, `packages/widgets/test/reminders.test.ts`, `apps/web/test/privacy-policy.test.tsx`.

## What waits for the build

- The exact SQL of `remindersOf(viewer)` in each read, and whether search needs it.
- Whether the web's `Switch` is the settings one or needs a smaller sibling for a dialog.
