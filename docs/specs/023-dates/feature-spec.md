# 023 Dates

**Status:** drafted 2026-09-22 against the design handoff of the same day (`handoff/APPLY-2026-09-22-dates.md` and `explorations/due-dates-and-notifications.html`, sections 1 to 6), revised the same day with the product owner's answers and the three reviews
**Surfaces:** iOS, Android, web, the Core API and the agent plane
**Depends on:** 006, whose four date columns and `is_reminder` this finally gives a person a way to write; 012 and 019, whose `all_day` and Google connector this reuses and whose `edit_content` dates this completes; 014, whose notes carry the same four columns; 015, whose rail and expander read the rule; 018, whose question sets a date only when there is none; the time zone header of migration 0051, which this gives the account a default beside

## Why

The schema has carried dates since 001 and no person has ever been able to write one. Every date in the product was inferred by a model from something somebody dumped. There is no field, no picker, no gesture and no way to clear one, on any of the three surfaces, and the thread's own row does not even draw the date it holds: a task due tomorrow and a task with no date are the same row.

Two holes sit under that. `accounts` carries no time zone, so "today" in the filing prompt is whatever zone the device named on that one message, a screen draws every timed date in whatever zone the device is in now, and nothing can schedule anything at an hour. And recurrence is a six-value enum that holds four of the seven presets a picker needs and none of Custom: no interval, no weekday set, no monthly anchor, no occurrence count.

Notifications are the forcing function, because a notification fires off a date and a date nobody can correct is a notification nobody can stop. 024 sends them. This spec is the ground it stands on, and it is worth shipping before anything sends.

## What

### Vocabulary

**When** is the one field a person sets, and the row's type decides which column it writes: a task writes `due_at`, an event writes `occurs_at`, everything else writes `due_at`. **Ends at** is `occurs_end_at`, offered on an event only, and only once an hour is set. **Repeats** is the rule. **All day** is a date with no hour, `attrs.all_day`, and an hour clears it. **Clear** removes the date, the hour and the rule together. The row draws its **date chip**, which is **late**, **soon** or **later**. The account has a **time zone**, its clock, shown as a city and never as an offset; the phone's own zone appears in one place, the **strip**. In schema and code the rule is `rrule`, one column that replaces `repeats` and `repeats_until` on both tables, and the account fields are `time_zone`, `kept_time_zone` and `follow_device`. Nothing a person reads says deadline, timestamp, recurrence, RRULE, offset, item or thing; a count stands on its own.

### One clock per account

- **`time_zone`.** Set at first run from the device, as a field of the request that finishes onboarding, and for an account that already exists from the last zone one of its messages carried, or failing that from its next dump. Editable on the **Date and time** page in Settings, and by the strip. Every writer resolves the name through ICU exactly as the 0051 header is resolved, stores what ICU returned under the city's current spelling (ICU still says Calcutta and Kiev; a phone says Kolkata and Kyiv, and the two must be one zone), drops what it does not know, and the zone reaches SQL as a bound parameter and a prompt as a resolved name, never as sent.
- **`follow_device`.** A switch, on by default. Off means the strip cannot appear.
- **`kept_time_zone`.** The one device zone a person has answered Keep to. Use clears it.
- **No travel signal is stored.** The design's `last_seen_time_zone` is not built: the strip compares the device's own zone on the device, the header stays on the three requests that reach the model, and the account keeps one clock rather than a record of where its phones have been. The security review asked for exactly this, and the privacy page's sentence about the zone stays true with one clause added, below.
- **Everything that renders or schedules reads `time_zone`.** The hour a chip names, the day a timed row lands on the rail, the boundary of today, the prompt's today and its clock line, and in 024 the hour a digest goes out. The clients draw every timed date in the account's zone rather than the device's, so a person in Tokyo whose clock is Lisbon sees Lisbon on every screen and the strip is the one thing that says so. What a person types is read in the same zone it is drawn in: "call the clinic at 9" files 9:00 in the account's zone, and the row reads 9:00. Rails, grids and chips all take today as a day string that the caller computes in the account's zone, so the day arithmetic in the shared package stays what it is.
- **The strip.** At the top of Today, when the device's zone differs from `time_zone`, `follow_device` is on and the device's zone is not `kept_time_zone`. Its own component, `ZoneStrip`, in the shape of the code's `InvitationStrip`: `--surface-accent-soft` on iOS and the web and the Android twin's `a-c-low`, `compass` in a 28px disc in the accent colour, one sentence, and two text buttons inside the card, each its own target with a 44px hit area. "Showing times in Lisbon. This phone says Tokyo." then **Use Tokyo** in `--text-accent` and **Keep Lisbon** quieter in `--text-secondary`. On the web the sentence says "This browser says Tokyo", because a browser is not a phone. It states the fact before it offers the change, so ignoring it is a complete answer. Use writes `time_zone` and clears `kept_time_zone`. Keep writes `kept_time_zone`, so a two-week trip asks on arrival and stays quiet, and a third zone asks again. Both are drawn first and written second; a failed write puts the strip back. Names come from the zone's own city, "Buenos Aires" and not "America/Argentina/Buenos_Aires", and never an offset.
- **Date and time**, a Settings page in The app group, above Appearance. Your clock: **Time zone**, value the city, opening a list of the device's own zones grouped by region with a filter field, the Country page's shape, needing no server; **Follow this device**, a switch, "Offer to switch when the phone is somewhere else." Week: **Starts on**, Monday or Sunday, which moves here from Appearance on every surface, phones and web alike, keeping its store, since the month grid needs it everywhere. It stays a device preference, as 015 decided.

### A bare day, and a day with an hour

- **A bare day is a date, not an instant, and it never moves.** It is stored as it has been since 0035, noon UTC with `all_day` set, and every reader takes its calendar date from that instant's UTC date rather than converting it into any zone. So "rent by the 25th" is the 25th in Lisbon, in Tokyo and in Auckland, and tapping Use in the strip moves no all-day date anywhere. The design's diagnosis that noon UTC is wrong in New Zealand was a diagnosis of readers converting a date as if it were a time, and that is what changes.
- **A day with an hour is an instant**, stored as the instant the account's zone gives that wall time, drawn in the account's zone, with `all_day` unset.
- **A due date may carry an hour.** "Call the clinic at 9" and "rent by Friday" are both tasks. An hour on any type clears `all_day`; removing it sets `all_day` again. The comment in `dates.ts` saying a due date has no time anybody expects to see is amended, and no column changes.
- An hour on a task is when it is wanted by, not when it starts. The chip shows it; the digest in 024 still announces the task in the morning rather than at the hour.

### Recurrence becomes a rule

One column, `rrule`, holding an RFC 5545 recurrence rule, on `content` and on `notes`, replacing `repeats` and `repeats_until`. Three reasons: it is exactly the expressiveness the picker needs and no more; it is what Google speaks, so a rule survives the trip to a calendar with nothing translated; and the six values map in losslessly, so the migration is a mechanical one-way rewrite. This reverses the decision of 2026-09-11, "Six values, not an RRULE", and the reversal is logged.

| Today | Becomes |
| --- | --- |
| `day` | `FREQ=DAILY` |
| `weekday` | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| `week` | `FREQ=WEEKLY` |
| `two_weeks` | `FREQ=WEEKLY;INTERVAL=2` |
| `month` | `FREQ=MONTHLY` |
| `year` | `FREQ=YEARLY` |
| `repeats_until` | `UNTIL` |

**offload accepts the picker's grammar and nothing wider.** `FREQ` of `DAILY`, `WEEKLY`, `MONTHLY` or `YEARLY`; `INTERVAL` 1 to 99; for a weekly rule `BYDAY` as a set of weekdays; for a monthly rule either one `BYMONTHDAY` from 1 to 31 or one ordinal weekday in `BYDAY`, first to fourth or last; `UNTIL` or `COUNT` of 1 to 999, never both; optional `WKST`. **The server is the one validator.** It parses a rule into parts and stores and forwards only its own serialisation in a fixed order, so the bytes that arrived never reach Postgres, a picker, the expander or Google; a control character, a duplicate part, an unknown part or anything after a valid prefix is refused as `bad_rule`, never dropped. The agent's tool models carry a shape check, not a second grammar, and one fixture file of accepted and refused rules is read by both suites. A rule anchors on the row's When column, `occurs_at` for an event and `due_at` for everything else, and a rule with no anchor is refused as it is today. A note's rule anchors on `occurs_at`, as today.

**The presets read off the picked date and rewrite when it changes.** Never; Daily; Weekly on Friday; Every weekday, Mon to Fri; Monthly on the fourth Friday; Annually on 25 September; Custom. Monthly means the nth weekday, which is what Google leads with, and the fifth becomes the last; day of the month lives in Custom. Custom holds an interval and a unit, a set of weekdays when the unit is weeks, the anchor choice when it is months, and one of three endings: never, on a date, or after a number of times.

**What does not change, and one thing said plainly.** A repeating row is still one row, the rail still draws it on every matching day, a list still draws it once, and nothing here edits a single occurrence. A calendar's own occurrences still arrive as rows sharing a `series_ref`, and the database still refuses a row that carries both. **A repeating row has no per-occurrence state**: it is never late, its chip names its next occurrence, Done means done for good, and 024 never announces it as overdue. That is a limit accepted on purpose rather than a column added on speculation.

**The model's tools take a rule.** `add_content` and `add_note` take `rrule` where they took the enum, which fits what a model reads out of "every other Tuesday" and currently has to round to something wrong, and `edit_content` gains it, since today a recurrence can be created and never changed by anyone. A null through the tool layer means not stated, never remove. The filing prompt's line on repeats says the new shape, and principle 04's cases that name the old values are rewritten to the rule. The tool definition budget stands at 1,798 of 1,800 and is not moved: the rule string replaces an enum and a second field, the two descriptions become one line, and the guard measures the result; if it is over, the description is cut, not the number raised.

**A row written to Google by `create_event` carries its rule** as an `RRULE` line, where until now the rule was dropped and one event went up. The toast and the confirmation line name the series, "Added to your calendar, weekly", and Undo removes the series, which is what deleting the event Google returned already does. A rule is refused on a row that is on a calendar, exactly as a date is.

**The wire changes.** The content row and the note lose `repeats` and `repeatsUntil` and gain `rrule` and `onCalendar`; the account gains `timeZone`, `followDevice` and `keptTimeZone`. Every response schema that carries a row is named in the impl-spec, because a Fastify schema drops a field it was not told about. Phone builds from before this read no `repeats` and draw a repeating row once with no expansion until the next build, which is the precedent 019 set and is harmless for the days it lasts.

### The row draws its date

Every content row draws its date, on the thread page, in the widgets and in the archived list: `ContentRow.tsx` on both phones and `ContentRowView.tsx` on the web, with `Widgets.tsx` on the web losing the date and the word "reminder" it pushes into a widget row's meta today, since the chip and the bell mark now say both. **The chip sits at the trailing edge of the title line**, before the row's tools, where the kit's Today row draws its badge, and the meta line under the title is untouched: the note or body, the domain, the author, and on the web a collapsed series' "every week · 12 held". It is `min-height` 24px on `--radius-xs`, `calendar` at 12px, `--size-caption`, tabular figures, and at 200% text it grows with its words. It reads **Due today**, **Due tomorrow**, **Due Fri 25** and **Due Fri 25, 9:00** on a task, **Today, 19:00** and **Fri 25, 19:00** on an event, and past fourteen days drops both the weekday and the word Due for the month, **12 Nov**. It names the start only; a span's end and a rule's cadence stay where the row draws them today. A repeating row names its next occurrence on or after today and is never late. A row with both dates draws the one its type decides.

| State | Ground | Ink | Which days |
| --- | --- | --- | --- |
| Late | `--surface-danger-soft`, minted over `--clay-100` | `--text-danger` | anything before today |
| Soon | `--surface-noticed-soft`, minted over `--amber-100` | `--text-noticed` | today and the next three days |
| Later | `--surface-fill` | `--text-secondary` | everything after |

Two aliases are minted, because the two soft grounds had none and the apply note's "no new tokens" was written against ramps the code may not consume; the design log records it. Three days, stated once and shared: one function in the shared widgets package answers late, soon or later from a day and today, and today comes from the account's zone. Amber rather than blue, because blue is the attention colour and would read as offload asking for something. **A done row loses the colour** and keeps the plain chip whatever its date. **A row with no date draws nothing and asks nothing**: no dashed slot, no placeholder, because principle 04 made offload not ask for dates nobody gave.

**The bell mark.** A row 024 will announce carries `bell` at 11px after the text, in `currentColor`. It reports `is_reminder` and does not set it: without it, two rows that look identical on Tuesday behave differently on Friday, and the first a person hears of it is the notification.

**The change mark.** A row whose date or rule offload changed while its thread is on screen takes the existing moss settle. The mark keys on a change token, the row's id with its date and rule, not on whether the row was there before, so a row already on screen flashes when its date moves and both clients settle over the same 1400ms.

### The edit sheet becomes the row's one sheet

The row keeps its two controls, edit and one way out, and the date is not a control on the row. The pencil opens a sheet that has grown rather than changed:

```
  Pay the rent                          the title, larger, primary ink
  Add details                           the body, smaller, secondary ink; --text-tertiary placeholder
  calendar  When      Fri 25, 9:00   >
  clock     Repeats   Every month    >
  bell      Remind me           (on)   only while the row is a reminder
  [Cancel]  [Save]
```

**Amended 2026-09-27:** the sheet has no "Edit" heading; the title field is larger and in the primary ink, the details a step smaller and in the secondary ink, so the two say which is which. The body's placeholder is "Add details", not the design's "Add a note", because a note is a thread's sentence in this product and the row's body is not one. When and Repeats carry their current values, or nothing on an undated row. Both open the When sheet, which **hands its values back to this sheet** the way Custom hands a rule back: When lands on the grid, Repeats lands on the same sheet scrolled to its own block, and nothing is written until Save. **Remind me is the way out of a reminder and nothing else.** It is drawn only while `is_reminder` is set, switching it off clears the flag, the bell mark and the row's place in 024's digests, and once off the row is drawn without it; nothing a person touches sets the flag, which stays the model's, as designed. The philosophy says structure appears afterwards and can always be corrected, and a reminder offload decided on was the one structure a person could not undo. It is the row's switch, so it silences the row for every member of a shared thread, and it is drawn where the pencil is drawn. **Save writes once**: a title change and a date change made together are one request, drawn first and sent second through the screen's existing `perform`, with "Saved" as its word and "Couldn't save that" beside Try again when the server refuses or the device is offline, the screen put back either way. The sheet keeps the one way out the code gave it on 20 September, and its height follows the keyboard as today, with the grid opening in its own sheet so the keyboard never sits under it.

**On the web** there is no edit modal today: the row's title edits inline and saves on blur, which cannot hold a Cancel, a body or a grid. Content rows get a modal, `EditModal`, with the same fields, Cancel and Save, Escape as Cancel, the month grid inline, Time and Repeats as inline blocks, and Custom's fields disclosed inline under Repeats; the inline title field stays for thread names and goes for rows. Android is the iOS sheet at Material's radii, which the kits already handle.

A row that is on a calendar, one `create_event` wrote up with a `source_ref`, offers title, note and Remind me and no When: its time is Google's and changes through `edit_event`, and the sheet does not draw a control the server refuses. A row that gains a `source_ref` while the sheet is open is refused by the server on Save and the screen is put back with the same word.

### The When sheet

```
When
  Pay the rent
  September 2026                 <  >
  [month grid]                          today outlined, the pick filled
            Time      All day    v
  clock     Repeats   Never      v
  [Clear]  [Save]
```

- **The grid is the front door.** Today is outlined, the pick is filled: two facts, two marks. Leading and trailing days are `--text-tertiary` and still tappable. The week starts on the day the preference says. Cells are `min-height` 40px and grow at large text.
- **Time, revealed in place, and the wheel is the platform's.** All day is a switch above the hour. On iOS the hour is the system's inline wheel at five-minute steps, greyed rather than removed while All day is on, so the hour you had stays visible, and tapping it turns All day off. On Android there is no inline wheel: the hour is a row that opens the system's time dialog, and while All day is on the row shows the last hour greyed, which keeps the same promise in Material's own shape. On the web it is a time field at five-minute steps, disabled while All day is on. Each reads the locale, so a 12-hour account gets am and pm without this spec saying so. **Setting a time opens Ends at** on an event, defaulting to an hour later; the row is absent on everything else, because a due date has no end.
- **Repeats, revealed in place.** The seven presets above, each naming what it inherited from the picked date. Custom is the one row that navigates, to its own sheet, which hands a rule back with **Cancel** and **Done** rather than writing the row. Repeats carries `clock` on both sheets, one row one glyph; the design drew two.
- **Clear is a first-class control**, and clears the date, the hour and the rule together. Today there is no way to remove a date at all; this is the one thing the sheet must not ship without. Clear is an edit, not a delete: any member may do it, as any member may fix a title.
- **Who writes.** Opened from the edit sheet, When hands back and the edit sheet's Save writes. Opened on its own, from the action sheet, it writes on Save and on Clear, drawn first and sent second with the same words as the edit sheet.
- Nothing else in the sheet navigates. The two rows open in place with a chevron that points down.

### The other ways in

- **Saying it.** "push rent to friday" already works through `edit_content`. The reply is verb-first, and the thread pill under it is the one the product draws today. A pill that carries the row and its date, tappable into the When sheet, is a new ref kind in the turn footer's contract and a turn payload change, and waits for its own pass. Saying it cannot clear a date: a null through the tool layer is not stated, and clearing stays a sheet action.
- **At filing.** The filed pill stays the thread pill. Nothing asks for a date that was not given.
- **The action sheet** on the phones gains a When row above Edit, carrying its value where the other rows carry nothing, shown wherever the pencil is shown; `RowAction` gains an optional value, which the design log records against the governed contract. The web has no row action sheet, so its one door is the modal.

### What the model may do

The model may overwrite a date a person set, where a dump clearly states a new one. There is no stickiness rule, unlike notes, so the change must show: the row takes the change mark when its thread is on screen, and 024 records it in Activity. The write is inside the turn, so 004's whole-turn Undo takes it back, as `edit_content` has been on the reversible allowlist since 006. The model cannot clear a date, cannot set the account's zone, and cannot write `follow_device` or `kept_time_zone`.

### States, once for every sheet

One spinner and no skeleton while a page loads. A sheet's Save and Clear and the strip's Use and Keep draw first and write second; a refusal, a failure or no signal puts the screen back with one clause and Try again beside the same control, "Couldn't save that", and nothing explains why. The zone list needs no network. Reduced motion drops the change mark rather than shortening it, as today. Every colour above is named by alias and holds in both themes.

### The privacy page, as it will read

The zone bullet in section 3 gains two sentences, so the account's clock and the one zone Keep remembers are named where the device's zone is: "Your device's time zone, sent with each thing you dump, type into a thread or answer, and kept with it, so that "tomorrow" and "3pm" mean what they meant where you were. The first one offload hears becomes the clock your dates are shown in, until you change it in Settings; and if you answer Keep when a phone is somewhere else, that one zone, so it does not ask again. Nothing finer than the zone: no location, no clock." "The first one offload hears" rather than "once at first run", because an account from before this feature takes its clock from the last zone a message carried, or from its next dump, and never sees first run again; and `kept_time_zone` is named because it is a stored fact about where a phone was, one zone deep, and the page lists what is kept. The product owner reads this before the code is written, per the rule in `CLAUDE.md`; the security review of the branch is what added the second sentence and the rewording.

### On the web

The row, the chip, the edit modal with the grid inline, the Date and time page with Starts on moved out of Appearance, and the strip on the Today pane. The web draws timed dates in the account's zone like the phones. Its Timeline keeps its own lowercase "due" in the day's sentence, which is prose, where the chip's "Due" is a label.

### On Android

The sheets at Material's radii and elevation, 56dp rows, no ripple on the strip, the system's time dialog in place of the wheel, and the same chip on the M3 row.

## Acceptance criteria

The clock

- **AC-1** `accounts` carries `time_zone`, `kept_time_zone` and `follow_device`. Finishing onboarding with a zone sets `time_zone`; an existing account is backfilled from its latest message's zone; an account still without one takes its next dump's. Every writer resolves the name through ICU, stores only the resolved name, drops an unknown one, and passes it to SQL as a bound parameter.
- **AC-2** The zone header stays on the three requests that reach the model and on no other; no column records where a device last was.
- **AC-3** The strip appears on Today only when the device's zone differs from `time_zone`, `follow_device` is on and the device's zone is not `kept_time_zone`. Use writes `time_zone` and clears `kept_time_zone`; Keep writes `kept_time_zone`; a third zone shows it again; `follow_device` off hides it; a failed write puts the strip back.
- **AC-4** A bare day, from the model or the sheet, is stored at noon UTC with `all_day` set and is read as its UTC calendar date on every surface, unchanged by the account's zone. A day with an hour is stored as the instant the account's zone gives that wall time, with `all_day` unset, and is drawn in the account's zone. Nothing stored is rewritten.
- **AC-5** The prompt's today and its clock line are the account's zone, falling back to the message's zone and then UTC; the day boundary of the agenda, the rail and the chip is the account's zone on all three surfaces, passed in as today.
- **AC-6** Date and time exists in Settings on all three surfaces with Time zone, Follow this device and Starts on; Starts on leaves Appearance on every surface, keeps its store, and the web month grid honours it.

The rule

- **AC-7** Migration replaces `repeats` and `repeats_until` with `rrule` on `content` and `notes`, rewriting the six values and `UNTIL` as the table says into the canonical serialisation, with a test that every value and an until round-trips through the parser unchanged.
- **AC-8** The server's grammar is the one validator, used by the tool routes and the person-facing route; it parses, refuses by name, and re-serialises in a fixed order. Each listed shape is accepted; a rule outside it is refused as `bad_rule`, including one with both `UNTIL` and `COUNT`, an interval of 0 or 100, a monthly rule with two anchors, a control character, a duplicate or unknown part, trailing text, and a rule with no anchoring date. The agent's shape check and the server read one fixture file.
- **AC-9** The shared expander draws the rule over a window: interval, weekday sets, nth and last weekday of the month, day of the month clamped in short months, `UNTIL` inclusive of its day, `COUNT` counted from the anchor, bounded by the window and 400 steps per call, on the server as on the clients.
- **AC-10** `add_content`, `add_note` and `edit_content` take `rrule`; `edit_content` with a rule changes an existing row's rule; a null leaves it alone; a rule on a row with a `source_ref` is refused as a date is. The filing prompt and principle 04's cases say the rule. The tool definition guard passes without its number moving.
- **AC-11** `create_event` sends the row's rule to Google as an `RRULE` line, with `UNTIL` in the form Google takes for the event's value type; the toast and the confirmation line name the series; Undo removes the series.

The chip

- **AC-12** Every content row on the thread page, in the widgets and in the archived list draws its date chip at the trailing edge of its title line, in the words and states above, on iOS, Android and the web, in both themes, at 200% text; a row with no date draws nothing; the web widget row's meta loses its date and the word reminder.
- **AC-13** Late, soon and later come from one shared function of the day and today, with today in the account's zone; the boundary is today plus three days inclusive; a done row is plain whatever its date; a repeating row is never late; the two soft grounds are the minted aliases.
- **AC-14** A repeating row's chip names its next occurrence on or after today; a row with both dates draws the one its type decides; today and tomorrow are named as words; past fourteen days the chip drops the weekday and the prefix for the month.
- **AC-15** A row whose `is_reminder` is set draws `bell` after the chip's text; no screen draws a way to set the flag, and Remind me is drawn only while it is set.
- **AC-16** The change mark keys on the row's id with its date and rule, fires on a row already on screen whose date offload changed, and settles over 1400ms on both clients.

The sheets

- **AC-17** The edit sheet on the phones and the edit modal on the web carry title, details, When, Repeats and, while the row is a reminder, Remind me; When and Repeats show their values; Save writes every changed field in one request; Cancel and Escape write nothing; the web's inline title field goes for content rows.
- **AC-18** The When sheet opens on the grid with today outlined and the pick filled; leading and trailing days are tappable; the grid steps months; the week starts on the preference; opened from the edit sheet it hands back, opened from the action sheet it writes.
- **AC-19** Time reveals in place: All day above the hour; on iOS an inline five-minute wheel greyed while All day is on and turning it off when touched; on Android a row opening the system dialog with the last hour greyed while All day is on; on the web a five-minute time field disabled while All day is on. On an event, setting an hour reveals Ends at defaulting to an hour later; Ends at is absent on every other type.
- **AC-20** Repeats reveals the seven presets under `clock`, each naming what it inherited from the picked date and rewriting when the date changes; Monthly is the nth weekday with the fifth read as last; Custom opens its own sheet and hands a rule back without writing.
- **AC-21** Custom offers the interval and unit, the weekday set for weeks, the anchor choice for months, and the three endings; Done returns a rule in the grammar; Cancel returns nothing.
- **AC-22** Clear removes the date, the hour and the rule together, handed back inside the edit sheet and written on its own from the action sheet; a cleared row draws no chip; Undo puts all three back.
- **AC-23** The phones' action sheet shows When above Edit with its value wherever the pencil is shown; the web's door is the modal.
- **AC-24** A row with a `source_ref` offers title, details and Remind me and no When on every surface, and the person-facing route refuses a date or a rule on it with a named error, including a row that gained one while the sheet was open.

The write path

- **AC-25** The person-facing edit route takes title, body, the three dates, All day, the rule and Remind me in one request, distinguishing absent from null: absent leaves a field alone, null clears it. It returns the previous values, and the client's Undo writes them back in one request, the flag included, which is the one way a true reaches the route.
- **AC-26** The route is scoped as the existing edit is: `requireReadable`, per row, by membership, so any member may set, change or clear a date as any member may fix a title; writes to a row on a calendar are refused with a named error.
- **AC-27** Every state in "States, once for every sheet" is drawn: the spinner, the put-back with its clause and Try again, and reduced motion.

## Done means

Every criterion above has a test named in `impl-spec.md`, the suites are green on all three surfaces, and on the iOS simulator and the web the sheets, the wheel, the grid at the turn of a month, the strip, the settings pages, the chip at 200% text in both themes, and a real turn that moves a date by saying it have been driven and screenshotted. `Intl` with a zone on Hermes is checked on the simulator before the chip is built on it. Android's native build is left for the product owner's device.

## Out of scope

- **Notifications, digests, push tokens, Activity and the Today agenda**, which are 024.
- **A When sheet on notes.** Notes keep model-written dates; the migration still rewrites their rule so the rail keeps drawing them.
- **A pill that opens the sheet**, from the reply or from filing; the turn footer's contract has no row ref, and it waits for a pass of its own.
- **Editing one occurrence of a rule**, ticking one occurrence, or editing a Google series from the sheet. 019's scope rule stands for what is said.
- **Asking to be reminded.** `is_reminder` is set by the model alone; Remind me only clears it.
- **Duration on a task**, relatives above the grid, a fortnight rail, a Due sheet: the design's rejected shapes stay rejected.
- **Inferring the zone** from a calendar or an IP, and recording where a device has been.
- **Sub-five-minute times**, and seconds anywhere.
- **Keeping `repeats` on the wire** for old builds.

## Decided during planning

- **Two specs, planned together.** This one ships before anything sends. 024 depends on every section here.
- **The zone that renders is the zone that reads.** The prompt's today moves from the message's zone to the account's, with the message's zone as the fallback for an account that has none yet. A person who ignores the strip gets one consistent clock; a person who taps Use moves the whole product's timed dates and none of its dated ones.
- **A bare day is read as a date.** The design asked for noon in the account's zone; that makes every all-day row move when the clock does. Reading the UTC date of the noon-UTC instant fixes New Zealand and Use in one rule, and rewrites nothing.
- **No travel signal.** `last_seen_time_zone` is not built; the strip is computed on the device from its own zone, and the header stays on the three routes the privacy page names.
- **A rule anchors on the type's column.** The database rule `repeats needs occurs_at` becomes `rrule needs the When column`, so a monthly rent task is a repeating task rather than an event.
- **The grammar is closed and the server is canonical.** A parser, a test suite and a screen for editing it were the cost 0036 refused; the design accepted the cost, and closing the grammar to what the screen can draw is what keeps the parser small. The stored string is always the server's own serialisation.
- **A repeating row has no per-occurrence state.** Never late, never overdue, Done for good, drawn once in a list.
- **Monthly's fifth weekday reads as last.** A rule that says fifth Friday skips months that have four; last is what a person picking the 29th means.
- **The chip trails the title and names the start only.** Spans and cadences keep their existing lines; the web widget row's own date line goes.
- **A calendar-backed row has no When and takes no rule.** The tool layer already refuses the date; the rule follows.
- **Remind me switches off and never on.** The one correction the design left out, on the sheet the design said it would be one switch in.
- **The wheel is the platform's, and Android has none inline.** iOS greys its wheel, Android greys the hour on a row and opens its dialog, the web disables a time field.
- **The web edits in a modal.** The inline field cannot hold Cancel, a body or a grid.
- **The pill door waits.** The turn footer's contract has no row ref and the payload has no row; a new kind is its own pass.
- **Two aliases are minted** for the chip's soft grounds, `--surface-danger-soft` and `--surface-noticed-soft`, on main, with a log entry.
- **The tool budget is measured, not moved.**
- **Week start stays a device preference** and moves to Date and time on every surface.
- **Notes: content rows only**, the product owner's call, with the yoga line in the design's evening digest noted as true only for a repeating reminder task.
- **Old phone builds** read no `repeats` from the row and draw a repeating row once with no expansion until the next build, which is harmless and short.

### Logged in `docs/tech/decisions.md` at merge

- Recurrence becomes an RRULE, reversing "Six values, not an RRULE" of 2026-09-11, with the closed grammar as the answer to that entry's cost.
- The account has a clock, closing the time zone half of open call 4, and no travel signal beside it.
- A bare day is a date, read from the UTC date of its noon-UTC instant, amending 0035's reasoning.

### Design system impact, to log in `decisions.md`

- Two aliases minted, `--surface-danger-soft` over `--clay-100` and `--surface-noticed-soft` over `--amber-100`, for the chip's late and soon grounds.
- The edit sheet keeps its one way out beside Cancel and Save, which the apply note's sketch omits, gains Remind me while a row is a reminder, and its body placeholder is "Add details".
- `last_seen_time_zone` is not built; the strip is computed on the device and is its own component with two targets, not a pressable card.
- A bare day is read as a date rather than stored at noon in the account's zone.
- The Time zone row opens a list of zones with a filter, the Country page's shape, which nothing draws.
- The chip trails the title line, names the start of a span only, names today and tomorrow as words, drops the prefix past fourteen days, and a repeating row is never late.
- Android has no inline wheel: the hour is a row opening the system dialog; the web is a time field.
- Custom's fields disclose inline inside the web modal, and the web's inline title field becomes a modal for content rows.
- Repeats carries `clock` on both sheets and the When sheet's Time row carries no glyph.
- `RowAction` gains an optional value for the When row.
- The pill that opens the sheet is not built; the turn footer contract has no row ref.
- Date and time sits in The app group above Appearance, and Starts on leaves Appearance on every surface.

## Amended 2026-09-29

**No details field and no details anywhere.** AC-17 and AC-24 lose "details": the phones' edit sheet and the web's edit dialog carry the title, When, Repeats, Labels (on the phones) and, while the row is a reminder, Remind me, and no surface draws a row's body. Stored bodies are untouched and an edit never sends one. **On the phones When, Repeats and Labels open in place** inside the edit sheet rather than as sheets over it, each handing back on Done; Save still writes once. Every row sheet's foot is the way out or Clear on the left, Cancel and Save or Done on the right, so the When sheet opened alone gains Cancel. The sheet grows by the keyboard from its foot. Logged in both decision logs under 2026-09-29.

## Amended 2026-10-07

**Repeats says Never on a row with no date.** The web's select had no presets to read off a missing day and drew empty, and the phones' row drew nothing beside Repeats; both read as broken. The select now holds Never, disabled until a day is picked, and the phones' row says Never as `repeatsLabel` already did for every other caller.
