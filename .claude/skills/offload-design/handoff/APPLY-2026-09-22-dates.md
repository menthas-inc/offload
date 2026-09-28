# Apply: due dates, and the notifications that read them

Drawn in `explorations/due-dates-and-notifications.html` and decided with the product owner on
22 September 2026, against `main` at `b494d0e`. All three surfaces, both themes.

**No new components. No new glyphs, and no new tokens.** Everything here is drawn from the
vendored 84 and the existing colour roles. What it does need is **one schema change that
everything else sits on**, which is item 1.

**The premise the whole feature turns on:** the schema has carried dates since 001 and no person
has ever been able to write one. Every date in the product was inferred by a model. There is no
field, no picker, no gesture and no way to clear one on any surface.

---

## 1. Recurrence becomes an RRULE

**Do this first. Items 2 and 12 both sit on it.**

`repeats` is an enum of `day | weekday | week | two_weeks | month | year` with `repeats_until`
beside it. The picker in section 5 needs an interval, a set of weekdays, a monthly anchor and an
occurrence count, and the column holds none of them.

**One column holding an RFC 5545 rule**, replacing both. Three reasons: it is exactly the
expressiveness the dialog needs and no more; **it is what Google speaks**, so 019's connector
stops translating and starts passing through; and the six existing values map into it losslessly.

| Today | Becomes |
| --- | --- |
| `day` | `FREQ=DAILY` |
| `weekday` | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| `week` | `FREQ=WEEKLY` |
| `two_weeks` | `FREQ=WEEKLY;INTERVAL=2` |
| `month` | `FREQ=MONTHLY` |
| `year` | `FREQ=YEARLY` |
| `repeats_until` | `UNTIL` |

A one-way mechanical rewrite with nothing to reconcile. **`add_content` and `add_note` take a rule
rather than the enum**, which also fits what a model reads out of "every other Tuesday" and
currently has to round to something wrong.

**What does not change:** a repeating row is still one row, the calendar still draws it on every
matching day, and nothing in this design edits a single occurrence.

## 2. `edit_content` gains the recurrence field

It never took `repeats` at all. Today a recurrence can be created and never changed, by anyone.

## 3. `accounts` gains three fields

`dates.ts` already names itself as one of the two places that change when the account has a zone;
the other is the prompt's **today**.

| Field | Written by | Read by |
| --- | --- | --- |
| `time_zone` | Set once at first run from the device. Editable in Settings and by the strip. | Everything that renders or schedules. |
| `last_seen_time_zone` | Any authenticated request carrying the device's IANA zone. | Only the comparison. |
| `follow_device` | The Settings toggle, **on** by default. | Off means the value is still recorded and never compared, so the strip cannot appear. |

## 4. A person-facing write path

Everything today goes through the model's tool layer under a job. A sheet tap is neither. The
ordinary authenticated route takes **title, body, the three dates, and the rule, in one write** —
a title change and a date change made together must not be two requests.

**And it needs an explicit clear.** Null through the tool layer means "not stated", not "remove
it". Without a clear, a date can be set and never removed.

## 5. The row draws its date, coloured by nearness

The thread's content row draws no date today, on any surface. A task due tomorrow and a task with
no date are the same row. **Prerequisite for everything else.**

| State | Ground | Ink |
| --- | --- | --- |
| Late, anything before today | `--clay-100` | `--text-danger` |
| Soon, today plus three days | `--amber-100` | `--amber-700` |
| Later | `--surface-fill` | `--text-secondary` |

24px tall, `--radius-xs`, `calendar` at 12px, `--size-caption`, tabular figures. Reads
`Due Fri 25` on a task, `Fri 25, 19:00` on an event, and drops the weekday for the month past
about a fortnight.

**Three days, stated once and shared**, in the account's zone. A boundary nobody writes down is a
boundary each surface computes differently.

**A done row loses the colour** and keeps the plain chip, whatever its date. A ticked task that was
late is not late, it is done.

**The bell mark.** A row the digest will announce carries `bell` at 11px after the text, in
`currentColor`. Read-only: it reports `is_reminder`, it does not set it. Without it the two rows
that look identical on Tuesday behave differently on Friday, and the first a person hears of it is
the notification.

## 6. The edit sheet becomes the row's one sheet

The kit's edit is a rename. It gains two rows, and **the date is not a control on the row itself**:
the row's comment says two controls, never three, and that rule holds.

```
Edit
  Pay the rent                          text
  Add a note                            text, --text-tertiary placeholder
  calendar  When      Fri 25, 9:00   >
  clock     Repeats   Every month    >
  [Cancel]  [Save]
```

Both open the When sheet; Repeats lands on it scrolled to its own block. **Save writes once.**

Web takes the same four in the existing modal, with the month grid inline rather than in a second
layer. Android is the iOS sheet at Material's radii, which the kit already handles.

## 7. The When sheet

**One field called When, and the row's type decides the column.** A task writes `due_at`, an event
writes `occurs_at`, everything else writes `due_at`. Duration is `occurs_end_at` and is offered
only on an event and only once an hour is set.

```
When
  Pay the rent
  September 2026                 <  >
  [month grid]                          today outlined, pick filled
  clock  Time      9:00          v
  calendar  Repeats  Monthly     v
  [Clear]  [Save]
```

**The grid is the front door.** Today is outlined, the pick is filled: two facts, two marks, or the
picker loses today the moment you tap anything. Leading and trailing days are `--text-tertiary`
and still tappable. Week starts on comes from Settings.

**Clear is a first-class control** and clears the date, the hour and the recurrence together.

### Time, revealed in place

```
  All day
  [ wheel: hour | minute, 5-minute steps, selection band ]
  Ends at    10:00   >
```

**All day sits above the wheel and greys it** rather than removing it, so the control does not jump
and the hour you had is still visible while it is off. Tapping the wheel turns All day back off.

**Five-minute steps.** The platform's own wheel, so a 12-hour locale gets am and pm without this
design saying anything about it.

**Setting a time opens Ends at.** Not a row to find: before an hour exists the question is
meaningless. Absent entirely on a task, because a due date has no end.

**An hour on a due date is legal**, which makes `dates.ts`'s comment saying a due date has no time
anybody expects to see wrong. Amend it. No column changes; `attrs.all_day` already carries the
distinction and an hour clears it.

### Repeats, revealed in place

Google Calendar's preset list, because half of these rows are going to Google anyway.

```
  Never
  Daily
  Weekly on Friday
  Every weekday                Mon to Fri
  Monthly on the fourth Friday
  Annually on 25 September
  Custom                       >
```

**Every preset names what it inherited from the date above it**, and rewrites when the date
changes. That is why the block sits under the grid rather than on its own screen.

**Monthly means the fourth Friday, not the 25th.** Those are different rules; the nth-weekday
reading is what Google leads with. Day-of-month lives in Custom.

### Custom, the one thing that navigates

```
Custom
  Repeat every   [2]  [weeks v]
  Repeat on      M T W T (F) S S
  ENDS
  (o) Never
  ( ) On       [25 Dec 2026 v]
  ( ) After    [13] times
  [Cancel]  [Done]
```

**Repeat on appears only when the unit is weeks.** At months it is replaced by the anchor choice,
day of the month or the nth weekday. Cancel and Done rather than Clear and Save: this sheet edits a
rule and hands it back, it does not write the row.

## 8. The other ways in

- **Saying it.** "push rent to friday" already works: `edit_content` has taken all three dates
  since 019. The reply is verb-first and its pill carries the date; tapping the pill opens the
  sheet. It cannot clear a date.
- **At filing.** The filed pill shows its date when there is one and **shows nothing and asks
  nothing when there is not**. This is a correction path, not a capture path: principle 04 forbids
  inventing a prompt for a date nobody gave.
- **The action sheet** gains a When row above Edit, carrying its value, shown wherever the pencil
  is shown (`canDelete`).

**The model may overwrite a date a person set**, where the dump clearly states a new one. There is
no stickiness rule, unlike notes. **So the change must show:** the row takes the existing change
mark, the moss ground settling over 1400ms whose comment already reads *offload did this, you
didn't*, and it writes an Activity row.

## 9. The timezone strip

On Today, when `last_seen_time_zone` differs from `time_zone` and `follow_device` is on.
`InvitationStrip`'s shape, `--surface-accent-soft`, `compass` in a 28px `--moss-600` disc.

```
Showing times in Lisbon. This phone says Tokyo.
[Use Tokyo]  [Keep Lisbon]
```

**Both answers inside the card**, as 34px text buttons in `--text-accent`, with Keep Lisbon quieter
in `--text-secondary`. A pair of full-width buttons under the strip belongs to the screen, not to
the sentence.

**It states the fact before it offers the change**, so ignoring it is a complete answer. **Once per
zone, not once per day**: Keep remembers the pair, so a two-week trip asks on arrival and stays
quiet. **Use rewrites the default.** Names, never offsets.

## 10. The two digests

**One send in the morning for today, one in the evening for tomorrow. No per-item pushes.** A due
date is not an alarm, and something that pushes the moment it becomes true teaches people to swipe
it away.

**`is_reminder` gates both sends.** The query is the date range **and** the flag. A date is not
announced; a reminder is. "Rent is due Friday" is a fact; "remind me to pay the rent Friday" is a
request.

Two consequences. **Most mornings send nothing**, so an empty digest is the normal state. And **a
person cannot ask to be reminded** — the flag has no person-facing writer, by decision. If that
proves wrong it is one switch in a sheet that already exists.

**This makes the filing prompt's decision to set the flag load bearing**, where it was free while
nothing read it. It wants a principle and eval cases, the way principle 04 governs the dates.

| Send | When | Carries | Skipped when |
| --- | --- | --- | --- |
| Today | Morning hour, account's zone, **8:00** default | Due today, and still overdue | Nothing due and nothing overdue |
| Tomorrow | Evening hour, **19:00** default | Due tomorrow, and a repeating item coming round | Nothing due, or identical to this morning |
| People | When it happens | One person, one thread | Never batched |

## 11. The copy

**One template, three arms.** One thing is named. Two to four are listed. Five or more name the
first two and count the rest. Stated thresholds, so the copy is testable rather than judged per
send.

```
Due today
Pay the rent, Ana's ferry times, and three more. One is from last week.

Tomorrow
Dentist at 9:00, and the rent. Yoga is back on Tuesday.
```

- **Title is verb-free and subject-free**, which is the readme's rule holding. Never "You have 3
  tasks due".
- **Overdue is a second sentence, not a second notification.**
- **Another member's row is named with its author**, as *Ana's ferry times*. Yours are never
  possessive, so the possessive itself carries the meaning. A shared thread's rows reach your
  digest because `listAgenda` reads membership.
- An event says its hour. A task says nothing about time even when it has one: an hour on a task is
  when it is wanted by, not when it starts.
- **The sent wording is stored verbatim** on the Activity row, not re-rendered later.

## 12. Actions, and the two categories

**A digest carries no action buttons**, because Done is about one thing and a digest is about five.
Tapping it opens **Today**.

**When the digest holds exactly one thing it is not a digest** and it gets two verbs: **Done** ticks
it, **Tomorrow** moves the date by a day. Both unambiguous because there is one row they could mean.

**Tomorrow writes a date, so it is `edit_content`'s path, not a snooze.** There is no
notification-level snooze anywhere in this design.

So: **two categories to register per platform**, one with actions and one without. A share request
carries **Open** and nothing else — 022 decided a request is answered on its card, and accepting a
person from a lock screen is the one place that should not be one tap.

**Never sent:** a question offload is waiting on, a calendar event starting, anything at the moment
a date passes, a declined request.

## 13. Settings, and Android's channels

A preferences page. **Not the notifications page 022 ruled out**, which was about a list of things
that happened.

```
DATES
  Due today            switch     One message each morning.
  In the morning at    8:00
  Coming tomorrow      switch     One message each evening.
  In the evening at    19:00
PEOPLE
  Connection requests           switch
  Added to a shared thread      switch
ON THIS PHONE
  System settings   >
```

Hour rows sit under the switch they belong to and grey out with it. **Labels match the notification
titles word for word.** The hour is in the account's zone, not the device's: a digest that moves
when you fly arrives at 3am.

**Android: each is a `NotificationChannel`** — `due_today`, `coming_tomorrow`, `people_requests`,
`shared_activity`. **A channel cannot be renamed or re-enabled by the app once it exists**, so the
ids are permanent from first install. The page reads channel state on open rather than trusting a
stored preference.

**iOS has no per-category switches in Settings.** Allow or do not allow, plus delivery style and
scheduled summary. **So on iOS the in-app page is the only place a person can refuse one kind and
keep another**, which makes it load bearing. Categories are still registered there, for actions.

The existing rule holds underneath: a denied permission gets nothing, no second ask, and Settings
gains one line saying what is off and how to turn it back on.

## 14. Activity

The bell on Today has pointed at nothing since day one. It opens **Activity**: everything offload
has told you, **plus what it decided quietly and never told you about**.

**This reverses 022's refusal of a notifications page, and the reason it survives that argument is
that there is now content.** Some of it exists nowhere else in the product, and it is the only way
to read your notifications when notifications are off.

Four kinds:

1. **Sent, about dates** — the digests, in the words they were sent in.
2. **Sent, about people** — a request, somebody adding to a shared thread.
3. **Silent by design** — an expired invite, a calendar write waiting on them, a question that
   closed, **a declined request**.
4. **Silent by setting** — a digest a switch suppressed, or one the permission refused.

```
TODAY
(*) Due today                         8:00
    Pay the rent, Tom's birthday, and three more. One is from last week.
(*) Ana added two things to Lisbon trip   7:12
YESTERDAY
(*) Tomorrow                          19:00
( ) Your invite to Sam expired        16:40   NOT SENT
( ) Ana declined Berlin in October    11:05   NOT SENT
```

**A sent row and an unsent row are the same row with a different lead**: filled 28px disc for
something that reached the phone, hollow with a hairline for something that did not, plus the mark.
One shape, so it reads as one record.

**NOT SENT is a fact, not an apology.** Amber where a setting caused it, and tapping opens that
setting. Plain grey where the product chose silence by design.

**A decline is recorded, and the people rule still holds where it was aimed:** nothing is sent,
nothing interrupts, re-requesting stays rate limited. A line in a record somebody opened
deliberately is not a notification. **It is worded flatly and offers nothing** — no retry, no
explanation. A no that arrives with a button is a no the product is arguing with.

**A dot, never a count.** Something new since you last opened it. **Thirty days, then it purges**,
matching the invite expiry, so this is a recent record and not an archive. The empty state has to
be true of an account that has been quiet for a month as well as a new one:

```
Nothing yet
What offload sends you is kept here, and so is what it decided not to send.
```

**No Due sheet.** A forward-looking "what is due" view is the Timeline's job.

**Web gets the same list as a pane**, from the sidebar, since the web shell has no bell. **Web sends
no notifications in this pass** — browser push is a separate permission, transport and refusal
state, and none of the four sends is worth opening that. Which makes the record the only thing web
has, and that is an argument for it.

---

## The order to build in

1. **Item 1**, the RRULE migration. Items 2 and 7 sit on it.
2. **Item 3**, the account's zone. Every scheduled thing below is wrong without it.
3. **Item 5**, the row draws its date. Smallest item here and the prerequisite for 6, 7 and 14.
4. **Items 4, 6, 7**, the write path and the sheets. This is the half of the feature a person
   touches, and it is worth shipping before anything sends.
5. **Items 10 to 13**, the digests. Needs push tokens, the categories and the channel ids fixed.
6. **Item 14**, Activity. Largest new thing, and the only one with no existing shape: each silent
   outcome needs a writer **at the point the silence happens**, not a reconstruction afterwards.
