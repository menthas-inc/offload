# 023 Dates, implementation

**Status:** drafted 2026-09-22, revised the same day after the three reviews and the constitution gate (PASS)

## The shape in one paragraph

Three columns on `accounts` give the product one clock. One column on `content` and `notes` replaces two, holding a recurrence rule in a closed grammar that one shared module parses, formats, describes and expands for every surface, with the server's serialisation as the only thing ever stored. The existing person-facing edit route grows from two fields to nine and learns the difference between absent and null. The clients draw every timed date in the account's zone and every bare day as a date, draw a chip from one shared nearness function, and grow one sheet into three on the phones and one inline field into a modal on the web. The filing prompt reads today in the account's zone and writes a rule instead of an enum. Nothing new is fetched: the thread page already carries every field the chip and the sheets need.

## Data flow

### The clock

1. The onboarding-complete request carries `timeZone` in its body; the server resolves it through `resolveTimeZone` and writes `time_zone` when it is null. A dump from an account with no zone does the same from its header, through one helper, `adoptZone(accountId, zone, trx)`. The migration backfills from the latest message's zone.
2. `/api/me` returns `timeZone`, `followDevice` and `keptTimeZone`. The client compares its own device zone to `timeZone` and draws the strip when they differ, `followDevice` is on and the device zone is not `keptTimeZone`; the comparison is the widgets package's `zoneStrip`, one function both clients call, and it compares current names, so a clock ICU spelt the old way and a phone saying the new one are one zone. Use is `PATCH /api/me { timeZone }`, which also clears `keptTimeZone`; Keep is `PATCH /api/me { keptTimeZone }`. Both resolve through ICU and refuse an unknown name with a 400; both are settings writes with no Undo, because each is one tap from its reverse.
3. The worker's dump query joins `accounts` for `time_zone`; `today_in` and `clock_line` take the account's zone, then the message's, then UTC. The grant is one column. The zone reaches the query as the `:tz` bind it already is.
4. `dates.ts` keeps `parseWhen` as it is for a bare day, noon UTC, and gains `instantIn(dayAndTime, zone)` for a wall time in a zone; callers pass the account's zone read once per request by `zoneOf(accountId, trx)`.
5. The header stays on the three model-bound requests on both clients. No column records where a device last was.

### The rule

1. `packages/widgets/src/rrule.ts` is the one implementation: `parseRule(text)` to a `Rule` or a named refusal, `formatRule(rule)` to the canonical string with parts in the grammar's order, `describeRule(rule, anchorDay, locale)` for the row's cadence line and the preset labels, `presetsFor(anchorDay)` for the sheet, `occurrencesIn(rule, anchorDay, from, to, cap)` and `nextOnOrAfter(rule, anchorDay, day)` for the rail, the chip, Today and the digest, all over `YYYY-MM-DD` strings. The server's zod refine, the person-facing route and the Python shape check agree by construction: `packages/widgets/fixtures/rules.json` lists accepted rules with their canonical form and refused rules with their reason, and the TypeScript suite and the Python suite both read it.
2. `timeline.ts` keeps `Dated` and `datedFor` and replaces `nextOccurrence` and `firstOnOrAfter` with calls into `rrule.ts`, keeping `REPEAT_LIMIT` at 400 per window. `datedFor` takes the account's zone and a bare day's date comes from `utcDay(at)`, a timed date's from `dayIn(at, zone)`.
3. The tool routes take `rrule` where they took `repeats` and `repeatsUntil`; `edit_content` gains it; every write stores `formatRule(parseRule(text))`. `create_event` reads the row's rule and sends `RRULE:` plus the canonical string, with `UNTIL` reformatted to a date when the event is all day. The toast line from `writeThroughTool` names the series when there is one.
4. The connector's `truncate` keeps working unchanged: it edits Google's own lines and never ours.

### The row and the sheets

1. The content page already carries `dueAt`, `occursAt`, `occursEndAt`, `allDay`, `isReminder`, `doneAt` and `canDelete`, and now `rrule` and `onCalendar`. The chip is arithmetic over those, the account's zone and today.
2. The edit sheet's Save sends one `PATCH /v1/content/:id` with every changed field. The client draws first and writes second through the existing `perform` path, and Undo sends the returned `previous` back in one request.
3. A catch-up after a turn marks a row as changed when its change token, id plus `dueAt`, `occursAt`, `occursEndAt`, `rrule` and `isReminder`, differs from the one it held, in the same set `arrived` already holds for rows that are new. No wire change.

## Data model

### Volume and access

| Field | 023 |
| --- | --- |
| Records per account | `accounts` gains three scalar columns; no new table. Content and notes rows are unchanged in count: 40 threads and 600 rows typical, 300 threads and 15,000 rows heavy, as 005 and 014 stated. Rows carrying a rule: 5 typical, 100 heavy. |
| Fan-out | A rule is one row however many days it lands on; expansion is bounded per window at 400 and never stored. |
| Growth | None new. A date edit is an update in place. |
| Read pattern | The thread page and the widgets, unchanged queries. The rail expands rules client-side from the page it already fetched. 024 adds Today and the digest, and states their own numbers. |
| Write pattern | A sheet save is one update. The three account columns change a few times in an account's life. |
| Sort and filter | Unchanged here. |

- **Pagination:** unchanged.
- **Indexes:** none new. `content_thread_due_idx` and `content_thread_dated_idx` stay; their partial predicates do not name `repeats`.
- **Normalisation:** `rrule` is the canonical string as `formatRule` writes it, so equality is string equality and a client never re-parses what it wrote.
- **Partitioning:** none.

### Schema

`0056_one_clock.sql`

```sql
alter table accounts
  add column time_zone      text check (time_zone is null or time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  add column kept_time_zone text check (kept_time_zone is null or kept_time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  add column follow_device  boolean not null default true;

-- The clock, backfilled from the last zone a message carried.
update accounts a set time_zone = m.time_zone
  from (select distinct on (account_id) account_id, time_zone from messages
        where time_zone is not null order by account_id, created_at desc) m
  where m.account_id = a.id and a.time_zone is null;

grant select (time_zone) on accounts to offload_agent;
```

The alphabet is 0051's, and the value stored is the name ICU resolved, never the header as sent, under the city's current spelling: Node's ICU still resolves Asia/Kolkata to Asia/Calcutta and Europe/Kyiv to Europe/Kiev while a phone reports the current name, so `resolveTimeZone` maps ICU's answer through the widgets package's `modernZoneName`, a table of renames and nothing else (Oslo stays Oslo, whatever tzdata links it to). Without it the clock a phone set and the phone's own word differed by spelling alone and the strip offered a switch to the zone it was in. The worker reads one more column of `accounts`, named.

`0057_a_rule.sql`

```sql
drop view if exists readable_notes;
drop view if exists readable_content;

alter table content add column rrule text check (rrule is null or (rrule ~ '^FREQ=' and length(rrule) <= 200));
alter table notes   add column rrule text check (rrule is null or (rrule ~ '^FREQ=' and length(rrule) <= 200));

update content set rrule = case repeats
  when 'day' then 'FREQ=DAILY' when 'weekday' then 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
  when 'week' then 'FREQ=WEEKLY' when 'two_weeks' then 'FREQ=WEEKLY;INTERVAL=2'
  when 'month' then 'FREQ=MONTHLY' when 'year' then 'FREQ=YEARLY' end
  || coalesce(';UNTIL=' || to_char(repeats_until at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"'), '')
  where repeats is not null;
-- the same for notes

alter table content drop constraint content_repeats_needs_a_date, drop constraint content_repeats_or_series;
alter table notes   drop constraint notes_repeats_needs_a_date;
alter table content drop column repeats, drop column repeats_until;
alter table notes   drop column repeats, drop column repeats_until;

-- A rule anchors on the row's When column: an event repeats when it happens,
-- everything else repeats when it is wanted by.
alter table content add constraint content_rrule_needs_when
  check (rrule is null or (case when type = 'event' then occurs_at else due_at end) is not null);
alter table content add constraint content_rrule_or_series
  check (rrule is null or attrs->>'series_ref' is null);
alter table notes add constraint notes_rrule_needs_a_date
  check (rrule is null or occurs_at is not null);

create view readable_content as ... ;   -- as 0036 wrote them
create view readable_notes as ... ;
```

The migration's output is canonical by construction, in the grammar's part order, and a test parses every migrated row and asserts `formatRule` returns it unchanged. The shape check in SQL is a backstop; the grammar lives in `rrule.ts` and is applied at every door, so a row that fails the grammar is refused before it is written. `schema.ts` loses `repeats` and `repeats_until` from both tables and gains `rrule: string | null`, and the drift test says so.

### The grammar

```
rule     = "FREQ=" freq *( ";" part )
freq     = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
part     = "INTERVAL=" 1*2DIGIT            ; 1 to 99
         | "BYDAY=" weekdays               ; WEEKLY only: MO,TU,WE,TH,FR,SA,SU, no ordinals
         | "BYDAY=" ordinal weekday        ; MONTHLY only: 1 to 4, or -1
         | "BYMONTHDAY=" 1*2DIGIT          ; MONTHLY only: 1 to 31
         | "UNTIL=" date-time              ; YYYYMMDDTHHMMSSZ
         | "COUNT=" 1*3DIGIT               ; 1 to 999
         | "WKST=" weekday
```

Each part at most once, `UNTIL` and `COUNT` never together, a monthly rule with at most one of `BYDAY` and `BYMONTHDAY`, `BYDAY` and `BYMONTHDAY` absent on daily and yearly rules, parts in any order on the way in and in this order on the way out: `FREQ`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `UNTIL`, `COUNT`, `WKST`. Any byte outside `A-Z`, `0-9`, `;`, `=`, `,`, `-` and `T` refuses the rule; so does a duplicate, an unknown part, an empty part, or a value out of range. Refusals are named: `bad_rule` on the wire, with the reason in the fixture for the tests. A rule with no anchoring date is refused by the database and by the routes with `bad_rule`.

**Expansion.** Daily and weekly rules step by arithmetic from the anchor; a weekly rule with a day set lands on each listed weekday of every nth week counted from the anchor's week; a monthly rule with `BYMONTHDAY` clamps in short months as 0036 decided, with an ordinal weekday lands on that weekday and skips nothing because first to fourth always exist and last always exists; yearly lands on the anchor's month and day, 29 February clamped to 28. `UNTIL` is inclusive of its UTC day; `COUNT` is counted from the anchor including it, which is why `occurrencesIn` walks from the anchor for a counted rule and jumps for the rest. Every walk is capped at 400 steps per call, on the server as on the clients.

**Describing.** `describeRule` gives the presets their labels and the row its cadence line: "Daily", "Every 3 days", "Weekly on Friday", "Every 2 weeks on Monday and Thursday", "Every weekday", "Monthly on the fourth Friday", "Monthly on the last Friday", "Monthly on the 25th", "Every 2 months on the 1st", "Annually on 25 September", each with ", until 25 Dec" or ", 13 times" appended when the rule ends. The preset list for a day is Never, Daily, Weekly on its weekday, Every weekday, Monthly on its nth weekday, Annually on its date, Custom.

## Interfaces

### Client

`GET /api/me` gains `timeZone: string | null`, `followDevice: boolean`, `keptTimeZone: string | null`. `PATCH /api/me` accepts `timeZone` (resolved through ICU, 400 when unknown, clears `keptTimeZone`), `followDevice` and `keptTimeZone` (a resolved name or null). `POST /api/onboarding/complete` accepts `timeZone`.

`PATCH /v1/content/:id` body, every field optional and absent meaning unchanged:

```ts
{
  title?: string;
  body?: string | null;
  dueAt?: string | null;        // YYYY-MM-DD for a day, an ISO instant for a time; null clears
  occursAt?: string | null;     // null clears occursAt, occursEndAt and the rule
  occursEndAt?: string | null;  // refused without an occursAt on the row, or before it
  allDay?: boolean;             // true with an instant is refused; the sheet says which
  rrule?: string | null;        // the grammar; null clears; refused without its anchor
  isReminder?: boolean;         // no screen sets it; a true is Undo restoring the model's flag
}
```

Response `{ content, previous }` where `previous` carries the same nine fields as they were, so Undo is one request with `previous` as the body. `409 { error: "on_calendar" }` when a date, `allDay` or the rule is present and the row has a `source_ref`; `400 { error: "bad_rule" }` and `400 { error: "bad_date" }` for the grammar and the parse. A day arrives as `YYYY-MM-DD` and is stored at noon UTC with `allDay` true; an instant arrives as ISO and stores `allDay` false. Clearing a row's When column clears its rule with it, whichever field did it.

The content row gains `rrule: string | null` and `onCalendar: boolean` and loses `repeats` and `repeatsUntil`. Notes gain `rrule` and lose the same two. **Every response schema that carries a row is amended**, because Fastify drops what a schema does not name: `contentRow` and `contentPage` in `routes/threads.ts`, the note shape in `threads/notes.ts` and its route, the widgets' `Sortable`, and the bundle the thread page returns. The drift test and a wire test per route say so.

### Internal

Unchanged. The worker's result payload carries no dates.

### Agent

`AddContent`, `AddNote` and `EditContent` in `harness/tools.py` take `rrule: str | None` with a regex shape check drawn from the same fixture; `repeats` and `repeats_until` go. `plan_v2.md`'s repeats line reads: "Something that comes round again is one row with a rule, never one row per occurrence: `rrule` as a recurrence rule, `FREQ=WEEKLY;BYDAY=TU` for every Tuesday, `INTERVAL=2` for every other, `BYDAY=MO,TU,WE,TH,FR` for weekdays, `UNTIL=` or `COUNT=` when they said when it stops, on the date it first happens. Standup every weekday at 9 is one event; yoga every Tuesday for the next month is one note." `quick_add.md` says the same where it names repeats. The Dates block gains: "Today's date and the clock are in their own time zone, named below, which is the zone every date you write is read in." The tool definition guard is run before and after and its number does not move.

The worker's `_DUMP` query selects `a.time_zone as account_time_zone` and `today_in` prefers it.

### Mobile

- `lib/me.ts`: the three fields and `setClock`; `useMe` exposes `timeZone`. `lib/api.ts`'s `completeOnboarding` sends `timeZone` from the Welcome screens.
- `lib/clock.ts`: `deviceZone()`, `zoneFor(account, device)`, `useClock()`. The day and time helpers, `whenDayOf(row, zone)` choosing `utcDay` or `dayIn` and `timeIn(at, zone, locale)`, live in the widgets package beside the chip, and so do `zoneCity(name)`, `zonesByRegion()`, `zoneStrip(me, device)` and `modernZoneName(name)`, in `packages/widgets/src/zones.ts`. The list comes from `Intl.supportedValuesOf("timeZone")` where the runtime has it; Hermes has not, so `zones-list.ts` is checked in beside it, written by `packages/widgets/scripts/zones.mjs` from Node's ICU, and `apps/core-api/test/zones.test.ts` fails, naming the zones, when the two differ.
- `components/shell/DateChip.tsx`: the chip, one component both rows and 024's Today use, from the widgets' `nearness(day, today)` and `chipLabel`.
- `components/shell/ContentRow.tsx`: the chip at the trailing edge of the title line; the change token.
- `components/shell/RowEditSheet.tsx`: title, details, When, Repeats, Remind me while set, the one way out, Cancel, Save; replaces `TitleSheet`'s use of `EditSheet` for content rows. Thread renames keep `EditSheet`.
- `components/shell/WhenSheet.tsx`: the grid from `monthFor`, the Time block on `@react-native-community/datetimepicker`, iOS `display="spinner"` with `minuteInterval={5}` inline, Android the row and the dialog; Repeats; Clear and Save; a `standalone` prop deciding whether it writes or hands back.
- `components/shell/CustomRepeatSheet.tsx`.
- `components/shell/RowActionSheet.tsx`: `RowAction.value`.
- `components/shell/ZoneStrip.tsx`, drawn first by both Today screens.
- `app/settings/[page].tsx`: the `datetime` page and the `timezone` picker it opens, the Country page's shape; Appearance loses Starts on.

### Web

- `lib/use-me.ts`: the three fields, `updateClock`, and `completeOnboarding` sending `timeZone` from the welcome page.
- `lib/clock.ts` as on mobile; the zone functions from the widgets package.
- `components/shell/DateChip.tsx`; `components/panes/ContentRowView.tsx` draws it and `Widgets.tsx` stops drawing a date and "reminder".
- `components/panes/EditModal.tsx`: the fields, the grid inline, a `<input type="time" step="300">`, Repeats and Custom inline; `Thread.tsx` opens it where it set `editing`, and the inline field stays for the thread name only.
- `components/shell/ZoneStrip.tsx`, drawn first on `components/panes/Today.tsx`. It says "This browser says", because a browser is not a phone.
- `app/(shell)/settings/datetime/page.tsx` and `components/panes/DateTime.tsx`, where the Time zone row is a `<select>` grouped by region, the Country row's shape on the web; `Appearance.tsx` loses Starts on and exports its `Segmented`; both read the one `offload:week-start` key.

### Tokens

`--surface-danger-soft` over `--clay-100` and `--surface-noticed-soft` over `--amber-100`, in all three scopes of the design system's `colors.css`, committed on `main` with a log entry before the chip is built, then `pnpm tokens`.

## Prompt budget, per OFF-8

The prompt gains one sentence in the Dates block and swaps an enum and a field for one string field in two tool definitions and adds one to a third. The guard at 1,800 is measured before and after; the number is not moved.

## Dependencies

- `@react-native-community/datetimepicker` on mobile, for the platform's own time control. A native module, so both phones need a new EAS development build, and the iOS simulator build is made first.
- No new server dependency: the rule module is ours, and `Intl` does the zone arithmetic on Node 22 and on Hermes, checked on the simulator before the chip is built on it.

## Tests, and what stays a device check

- `packages/widgets`, run under `apps/web/test` where the widgets suite lives: `rrule.test.ts` over the fixture (parse, format, refuse with reason, describe, presets, expansion over fixed anchors including the clamp, the last weekday, `COUNT` and `UNTIL`, the 400 cap) and `nearness.test.ts` (the three states, the boundary, done, repeating never late, the chip words including today, tomorrow and the fourteen-day drop).
- `apps/core-api/test`: `clock.test.ts` (backfill, onboarding's zone, the first dump's zone, Use and Keep, an unknown name refused, the worker's grant, `instantIn` around a DST change); `rule.test.ts` (the migration's rewrite of the six values and an until as canonical strings, the constraints, every refusal through `add_content`, `add_note`, `edit_content` and the person-facing route, `create_event`'s recurrence line and its all-day until); `threads.test.ts` gains the nine-field edit, absent versus null, `previous`, the calendar refusal, the anchor rule, Undo restoring the flag, and a wire test that every row-carrying route returns `rrule` and `onCalendar`.
- `apps/agent`: the Pydantic shape check over the fixture; principle 04's cases rewritten to the rule (not run without permission).
- `apps/mobile/test` and `apps/web/test`: the client library's request bodies for the edit and the three account writes; the change token; the strip's predicate.
- On the simulator and the web: the sheets, the wheel, the grid at the turn of a month, the strip, the settings pages, the chip at 200% text in both themes, `Intl` with a zone on Hermes, and a real turn that moves a date by saying it.

## Edge cases

- **A zone ICU does not know** is dropped, as 0051 does; `time_zone` stays what it was, and a settings write of one is a 400.
- **An account with no zone yet** renders timed dates in the device's zone and the prompt reads the message's, which is exactly today's behaviour, until onboarding or its first dump.
- **DST.** A bare day never moves. An hour on a date across a change is stored as the instant the zone gives that wall time, which is what the person typed.
- **A rule whose anchor moves.** Changing When on a repeating row moves the anchor and the presets rewrite; the rule string is re-derived from the preset when a preset was chosen, and kept when Custom was.
- **Clearing the anchor** clears the rule with it, server-side, whichever field cleared it.
- **`occursEndAt` before `occursAt`** is refused as `bad_date`, where today the rail draws it as a point.
- **A bare due date with a rule** stays all day on every occurrence; an hour on the anchor is an hour on every occurrence.
- **A model writes a rule outside the grammar.** Refused as `bad_rule`, a decision the worker reads rather than a retry, exactly as `bad_date` is.
- **A row moved to another thread** keeps its dates and rule.
- **Undo of a Clear** writes three fields back in one request.
- **The strip on the web** compares the browser's zone; a laptop that never changes zone never shows it.
- **A row that gains a `source_ref` while its sheet is open** is refused on Save and the screen is put back.

## Constitution check

- **DEV-1.** One grammar, one module, one route grown rather than a new one. The zone helper is a few lines over `Intl`.
- **DEV-2.** The `dates.ts` comment, the 0036 comment about not being an RRULE and the `decisions.md` entry of 2026-09-11 are amended in the same change, with the reversal recorded.
- **QUAL-1.** Every AC names its test above; the migration's rewrite, the grammar's refusals and the route's absent-versus-null are written red first.
- **SEC-1.** The zone name is ICU-resolved and alphabet-checked before it reaches SQL or a prompt, on the new columns as on 0051's, and reaches SQL as a bind. The rule string is parsed by a closed grammar and re-serialised before it reaches SQL, a prompt or Google; nothing concatenates it.
- **SEC-2 and OFF-3.** The edit route keeps `requireReadable`; the calendar refusal is server-side; the zone writes are the session's own account and take no id.
- **OFF-1.** No date, rule or zone name reaches an event or a log line.
- **OFF-6.** The edit and the clear are on the reversible allowlist as `edit_content` already is, with Undo through `previous`; the model's edit is under the turn's Undo; `create_event` with a rule keeps the conditional entry of 2026-09-08 and its Undo removes the series. The zone answers are settings, reversible by their own controls.
- **OFF-7.** Tokens consumed by alias, two minted with a log entry; the log entries named in the feature spec are appended.
- **OFF-8.** One sentence in the prompt; the tool budget is measured and not moved.
- **DATA-1.** This document precedes the migrations.
