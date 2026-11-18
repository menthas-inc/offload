# 042 Reminders

**Status:** drafted 2026-10-10 from the owner's brief, eight answers of the same day, and a survey of what is known about when people want reminding (Grounding, below). Revised the same day with the project-lead, client and security reviews; what changed is under Review.
**Surfaces:** the Core API and the agent, with the Notifications page, the three editors, the date chip and Activity on iOS, Android and the web.
**Depends on:** 023 (dates, the account's clock, Remind me), 024 (the two sends, push tokens, Activity, channels), 027 (Today and Customize Today, with Open in your threads of 2026-10-07), 032 (the nightly pass per thread and member, the daily run), 038 and 040 (memories, the memory pass, the memory editor), 022 (shared threads), 031 (settings choices as tiles).
**Amends:**
- **024's "two sends a day, no per-item pushes".** A thing with a clock time can get its own notification shortly before it. Every other reminder rides in one of the two sends that already exist, whose today and tomorrow parts now also name what offload chose to remind about, and which gain a Coming up part.
- **024's "notes are never announced".** A note with a date, which is how filing records a plan or a stay, can be reminded about, to its author.
- **038's "a remembered birthday reaches the model only"**, and its out-of-scope line on birthdays reaching Today: a memory holding a yearly date carries it where code can read it, reminders read it, and Today's Reminders section draws it once its reminders have begun. A birthday still never reaches a calendar.
- **027's Today**, which gains a fourth section, **Reminders**, under Your day and above Open in your threads, moved and switched off in Customize Today like the others.
- **The meaning of *reminder*.** 024 used it for a row whose `is_reminder` the model set because somebody said "remind me". From here a reminder is a mention offload decides to make before a date. `is_reminder` stays, as the record that they asked: it still puts a row in every member's sends as 024 built, and a row the person asked about with a clock time is reminded about at that time.
- **023's Remind me switch** is drawn to a thing's author whenever offload will remind them about it, not only when somebody asked.

**Amended 2026-10-10, the calendar in the morning:** a row a person dumped keeps its reminders after offload writes it to a calendar, the morning send also names today's events on the account's own calendars under a new switch, Calendar, and the morning hour is in use while that switch is on. See the section of that name near the end.

## Why

offload knows when things are and never says so ahead of time. The two sends of 024 name what is due today and tomorrow, and only rows somebody asked to be reminded of. A wife's birthday in four weeks, a visa needed before a trip and a meeting at three are silent until it is too late to act, or never mentioned at all. The person dumped them so they would not have to hold them in their head.

The fix is the product's own philosophy: you dump things in, offload decides. Nobody picks a reminder time, as nobody picks a folder. offload works out what kind of date each thing is, and a fixed table turns that into when to say something. The person has two controls for all of it, off and how many, and one for a thing offload got wrong.

**A model labels, a table schedules.** The model never picks a time. It answers two closed questions about each dated thing, what kind of date it is and how much it needs beforehand, and a deterministic table maps the pair to up to three moments. That split is what makes it testable: the labels are judged by eval cases, the table by unit tests, and a date the person moves is rescheduled with no model call.

## What

### Vocabulary

A **reminder** is one mention, before a date, of one thing, made because offload judged it useful. Each sits in one of three **windows**: **a month out**, **a week out** and **on the day**. **How many** is the person's control, **Low**, **Medium** or **High**, allowing one, two or three reminders for each thing. In schema and code the windows are `long`, `short` and `day`, the labels `remind_kind` and `remind_lead`, a thing that takes its date from another has an anchor, the per-thing stop is `stopped`, and the settings are `notify_reminders` and `notify_reminder_count`. Nothing a person reads says alert, alarm, snooze, volume, window, horizon, lead time, classify, label, item or thing, and a count stands on its own.

### What can be reminded about

1. **A row with a date**, a task's `due_at` or an event's `occurs_at`, not done, archived or deleted.
2. **A thread note with a date**, which is how filing records a plan or a stay: "we're staying in Istanbul the 10th to the 12th".
3. **A memory with a yearly date**: a birthday or an anniversary in People, or a date that recurs in About. The person's own birthday is never reminded about.
4. **A task with no date that has to happen before a dated thing in the same thread**: "get the visa" in a thread whose note says the trip starts 12 November. For reminders only, the task is due **the day before** that thing starts. Its own date stays empty, it draws no chip, and Your day does not list it; Today's Reminders section does, once its reminders have begun. That thing's date moves and so do the reminders; it goes, and so do they.

**Only the author's, and only their own words.** A thing is reminded about only to the account that authored it, and only when it came from that person: never a calendar's own row (the calendar reminds about its own events), never anything from a forwarded email, a calendar, a browser capture or a dump marked untrusted, never anything another member authored. A row the person dumped stays theirs after offload writes it to a calendar: what decides is whose words it is, not whether a calendar holds a copy (amended 2026-10-10). Also never: a date already past, a link, photo, screenshot, PDF or file kept for keeping, a note that is a fact with a date and asks nothing ("the house was built in 1931"), and an invoice already paid.

### The two labels

The nightly pass (032) labels each dated thing of its member's that it has not labelled, or whose words, type or date column changed since it did. Two closed answers, and for an undated task a third:

**What kind of date it is.**

| Kind | Is | Examples |
| --- | --- | --- |
| `meeting` | A call, or a meeting where you already are, at a set time | a video call at 15:00, standup, a one to one at the office |
| `appointment` | Somewhere you go, at a set time | the dentist, dinner at 8, a flight, a concert |
| `occasion` | A day about somebody or something | a birthday, an anniversary, Mother's Day |
| `deadline` | Something that has to be done by the date | pay the rent, renew the passport, submit the form, RSVP |
| `trip` | Time away, or a stay, from its first day | Lisbon 12 to 19 November, guests staying the weekend |
| `day` | Something to do on that day and not before | call the plumber Friday, bins out Tuesday |
| `none` | Nothing to remind about | a receipt, a past event, a fact with a date, a routine kept without reminding, something kept for reference |

**How much it needs beforehand.**

| Lead | Is | Examples |
| --- | --- | --- |
| `none` | Turn up, or do it on the day | a meeting, a message on a colleague's birthday, call the plumber |
| `days` | A little preparation | buy a card, pack, print the tickets, pay a bill before it lands |
| `weeks` | Booking, ordering or arranging | a gift that ships, booking a restaurant for an anniversary, a wedding outfit |
| `months` | Something with a long official wait | renewing a passport, a visa, a school application |

**What it is for**, an undated task only: the dated row or note in the same thread it has to happen before, or nothing. It may be another member's: the task is still the author's, and the reminder names the task and its date, never the other thing.

**What they said counts.** "Remind me a week before" is evidence for the lead, and the label follows it as far as the table can. The table never bends to it: a stated moment is honoured exactly only when they asked to be reminded at a clock time, below.

A memory is labelled by the memory pass (038), which already reads every memory: for one that states a yearly date it writes the month and day and the lead, and its kind is always `occasion`. Their wife's birthday is `weeks`; a colleague's is `none`.

**A name for the notification.** A row is named by its title. A note or a memory is a sentence, so the label carries a short name for it: **a run of words copied from the thing's own text**, at most 60 characters, "Lisbon" from the note about Lisbon, "Meera's birthday" from "Meera's birthday is 14 March". The Core API refuses a name that is not found in the thing's own text, contains an address, or holds four digits in a row, and the thing is then named by its first 60 characters cut at a word.

Labels are offload's, never shown and never exported. A person never sees "deadline".

**What the pass is shown, bounded (OFF-8).** At most 30 things to label a night in a thread, nearest date first, each at most 200 characters, with the rest the next night; and at most 20 dated things in the thread a task could be for, nearest first. The first night for an existing account labels the 30 nearest in each thread booked, and the backlog clears night by night within 032's ten-thread cap.

### From labels to moments

**Which windows, in the order How many keeps them.**

| Kind | none | days | weeks | months |
| --- | --- | --- | --- | --- |
| meeting | day | week, day | month, week, day | month, week, day |
| appointment | week, day | week, day | month, week, day | month, week, day |
| occasion | day | week, day | week, month, day | month, week, day |
| deadline | day | week, day | month, week, day | month, week, day |
| trip | week | week | month, week | month, week |
| day | day | day | day | day |

**First drop, then cut.** The windows that cannot be used are dropped (below), and then Low keeps the first that is left, Medium the first two, High all of them. A close birthday learned three weeks ahead still gets its week out on Low.

**Where each window lands.**

| Kind | A month out | A week out | On the day, no clock time | On the day, a clock time |
| --- | --- | --- | --- | --- |
| meeting | 4 weeks before; 8 for `months` | 2 days before; 7 for `weeks` and `months` | the morning | 15 minutes before |
| appointment | as above | the evening before | the morning | 60 minutes before |
| occasion | as above | 5 days before | the morning | the morning |
| deadline | as above | 3 days before; 7 for `weeks` and `months` | the morning | 30 minutes before |
| trip | as above | the evening before for `none` and `days`; 7 days before for `weeks` and `months` | | |
| day | | | the morning | 30 minutes before |

The reasoning, from Grounding: the nearest reminder carries most of the value for anything that needs nothing beforehand, so `none` is the day itself, except that the strongest single reminder for somewhere you travel to, or a trip, is about a day before. Early reminders earn their place only when something has to be bought, booked or applied for, and then the early one comes first, because it is the only one that can still be acted on. A close birthday is the owner's: 5 days out first, a month out second, and the morning itself last, so on High it is said on the day too, and a birthday learned too late for the first two is still said on the day at any setting.

- **The morning** is the morning send of that day, **the evening before** the evening send of the day before. A month out and a week out land in the morning send of their day unless the table says the evening before.
- **Asked, at a clock time.** A row the person asked to be reminded about (`is_reminder`) that has a clock time gets its on-the-day reminder at that time, not before it, whatever its label and whatever How many says, as its first window.
- **A notification of its own goes only between 7:00 and 22:00** in the account's zone. One that would land before 7:00 is named in the evening send the day before instead ("Flight to Lisbon at 6:00"); one after 22:00, in the morning send of its day.
- **A window is dropped** when it has passed by the time the thing is labelled, and when it would land within two days after the thing was dumped or its date was set: somebody who dumped "Lisbon 12 November" on 13 October needs no month-out reminder on the 15th. On the day is never dropped by the two-day rule.
- **A late month out.** For a `weeks` or `months` thing whose month out was dropped, a month out goes in the first morning send the two-day rule allows, when that is at least three days before its week out. A visa dumped a month before the trip is mentioned two days later, not only a week before.
- **A thing that repeats** is reminded about for its next occurrence only. Weekly or more often, on the day at most; monthly, a week out and on the day at most; yearly, all of its windows every year.
- **Done, archived, deleted or stopped** before a reminder is due, it does not go. A date moved, the windows move with it, and the two-day rule applies to the move.
- **Only a date and words the author set.** A date, a title or a note's words set or changed by another member, or by another member's turn, stops the thing's reminders until its author changes the thing themselves. Nobody can arrange for somebody else to be woken, or put their words on somebody else's lock screen. *Words added by the implementation review, 2026-10-10.*
- **Medium is the default.** A change of How many applies to every reminder not yet sent.
- **Nothing is placed in advance.** Each send works out at the moment it goes which reminders land in it, from the labels and the dates as they are then, as 024's sends already do; a notification of its own is placed at most an hour ahead by the same hourly pass. So a moved date, a tick, a stop, a change of How many or a membership ended needs nothing cancelled.

### Before the pass has seen it

A row with a clock time in the next 24 hours that no pass has labelled gets its on-the-day reminder 30 minutes before, as a `deadline` or `day` does, whatever How many says. No model is involved. The pass labels it that night and its label decides from then on. Nothing else is reminded about until it is labelled. *(Owner, 2026-10-10.)*

### How they arrive

**One morning and one evening notification, as now, plus one shortly before something with a clock time.** *(Owner, 2026-10-10.)*

- **The today part** of the morning send names 024's rows due today and every on-the-day reminder without a clock time, each once. **The tomorrow part** of the evening send names 024's rows due tomorrow and every reminder the table puts on the evening before. Due today and Tomorrow switch off 024's rows only; with a switch off and Reminders on, the part still names the reminders, and nothing is recorded as not sent for the rows the switch held back. Since 2026-10-10 the morning's today part also names the day's events on the account's own calendars, which follow the Calendar switch alone in the same way.
- **Coming up**, after the part, names every month out and week out that lands in the send.
- **Each send goes when it has anything to say**, at the hour it always went. A thing is named once in a send, whichever part claims it first.

```
One today, two coming up
Pay the rent. Coming up: Meera's birthday on 14 March, and Lisbon on Sunday.

Two coming up
Meera's birthday on 14 March, and Get the visa by 11 November.

Two today
Mum's birthday, and Bins out.

One tomorrow, one coming up
Flight to Lisbon at 6:00. Coming up: Renew the passport by 9 December.
```

- **Coming up** takes 024's three arms: one named, two to four listed, five or more name two and count the rest. Within the coming week a date is its weekday, tomorrow is "tomorrow", further out its day and month. A `deadline` and an anchored task say "by" before the date; anything else "on".
- **The titles stay counts** and never a person's words: "Two coming up", "One today, two coming up", "One tomorrow, one coming up".
- **Reminders are never possessive about authorship**: they are only ever the person's own, so a name like "Meera's birthday" is the thing's own words, not 024's "Ana's ferry times".
- **The body** keeps the due part first, then Coming up, and is cut at 240 characters at a word.
- **A notification of its own** goes at its moment. The title says when, "In 15 minutes", "In 30 minutes", "In an hour", or "Now" for a row asked about at that time; the body says what and when, "Standup at 9:30." It carries no buttons. Tapping it opens the thing's thread, re-read from the server by id.
- **A send that names reminders opens Today**, as it does now, where the Reminders section holds what Coming up named.
- Every interpolated string takes 024's clamp: one line, control characters stripped, 120 characters, and no dashes.

### On Today

Today gains a fourth section, **Reminders**, the home of what Coming up names. *(Owner, 2026-10-10.)*

- **Where it sits.** Under Your day and above Open in your threads by default. Customize Today lists it with the others, with its grip to move it and its switch to turn it off, named "Reminders" with the line "What offload is reminding you about, nearest first". An account that has customized Today finds it straight after Your day, wherever Your day was moved to, as a new kind always lands (027).
- **What it holds.** Every thing of the person's whose reminders have begun and whose date has not passed: from the moment its first reminder at their How many was due, to the end of its day. A birthday a month out on Medium appears on the morning of its month-out reminder and stays until the birthday is over. Nearest first.
- **Not twice.** A row Your day draws for today is not repeated here. A note or a memory is drawn here on its day too, since Your day never holds them.
- **Not tied to the notifications.** It follows the table and How many whether Reminders is on or off on the Notifications page, so somebody who wants no notifications still sees what is coming. Stopping a thing takes it off.
- **Each entry** *(redrawn 2026-10-11, the design's C2b; this replaces the row, the chip and the pill of the first build)*. One column, nearest first. The countdown leads: **Today**, **Tomorrow**, **In N days**, with the day under it, "Tue 13 Oct", or "By Sun 18 Oct" for a deadline or a task reminded against the thing it is for. Then the name, and under it where it lives: the thread's name with its icon for a row, with `text-quote` for a note, "Memories" for a memory, "Not in a thread" for either in the default thread; and the thing's time after it, "· 21:40", "· By 18:00" for a deadline. **Everything on the day shares one card** under a single Today; every later thing is a card of its own. No tick, no chip, no pill: the whole row opens the thing, a row or a note its thread, a memory in Memories.
- **Dismiss** *(owner, 2026-10-11)*. An `x` on every row hides **that reminder and nothing else**: the one of the thing's reminders that was showing, for that occurrence. A birthday dismissed a month out comes back a week out, and its week-out notification still goes. The thing, its date and its Remind me are untouched; nothing is written to the labels. The toast says when it comes back, "Dismissed until Friday", "Dismissed until 25 November", or "Dismissed" when this was its last, with **Undo**. The same dismiss on a phone and on the web is one dismiss. A dismissal is a row of ids, a day and a window, deleted with its thing and with the account.
- **Everything that has begun is drawn**; nothing is held back as "and N more" *(2026-10-11; the column shows them all)*.
- **Empty, it draws nothing**, no heading and no line, as Needs you does. It is drawn on today only, and never over the day-one invitation.
- **On the web** the Today pane draws the same section in the same place, from the same read.

### Shared threads

**A reminder goes to the thing's author alone**, and only while they are an accepted member of its thread, checked when it goes. A surprise party one member filed never reaches the others, and a shared trip reminds whoever dumped each piece of it. The pass that labels a thing is its author's own, which 032 already scopes to its member. A thing whose author has left the thread is reminded to nobody. *(Owner, 2026-10-10.)*

The bell and the switch are drawn to the author alone, so a shared row says nothing to the others about whether its author will be reminded. 024's sends to every member, for a row somebody asked about, are unchanged.

### What the person controls

**On the Notifications page**, a new **Reminders** section between Dates and People, on all three surfaces:

```
Dates
  Due today            switch     One message each morning.
  In the morning at    8:00
  Tomorrow             switch     One message each evening.
  In the evening at    19:00
Reminders
  Reminders            switch     Before the dates that need one, in those two messages or just before a set time.
  How many             [one]  [two]  [three]
                        Low   Medium  High
People
  ...
```

- **Reminders off** sends none and records none: the person chose it.
- **How many** is three choice tiles, as 031 made every settings choice, each a small picture of what you get: a short line ending at a date, with one, two or three marks before it. The names are Low, Medium and High, the caption under the row follows the pick, "One for each date.", "Up to two for each date.", "Up to three for each date.", and the tiles grey with the switch.
- **The two hours** grey only when every switch that uses them is off: the morning hour when Due today, Reminders and Calendar are, the evening hour when Tomorrow and Reminders are. *Calendar added to the morning hour on 2026-10-10.*
- **The Dates caption** stops saying everything comes once a day, since a set time now can have its own.
- **Android** gains a fifth channel, `reminders`, named Reminders, private on the lock screen like the others, carrying only a notification of its own. The two sends keep their channels whatever they say. The page mirrors the channel's system state into the switch, as 024 does. Unlike 024's channels its name is the switch's, not the notification's title, because the title is a time.
- **The web** carries the same section and sends nothing. Its settings summary counts Reminders among what is on.
- **Calendar**, since 2026-10-10, is a section of its own after Reminders and before People, one row, "Today's events", with the line "Today's events on the calendars you connected, in the morning message.", on by default. It has no channel of its own: on Android it mirrors `due_today`, which the morning message rides.

**On one thing**: the author sees the **Remind me** switch wherever the thing is edited, the row's edit sheet, the note editor and the memory editor, whenever offload will remind them about it, and the date chip's bell marks the same rows. Switching it off **stops** every reminder for that thing for good: the pass never labels it again, and nothing turns it back on but the same switch. On a row the person asked about it also turns off `is_reminder`, so the row leaves the sends as it does today. It never turns `is_reminder` on. A member who is not the author sees the switch only while `is_reminder` is on, exactly as 023 built it, and it writes that alone. *(Owner, 2026-10-10.)*

The switch is drawn first and written second, with the editor's own failure line and control on a failure, and takes Undo where the editor already offers it. On the web it is the `Switch` the phones draw, in all three editors, where the edit dialog had a checkbox.

### Activity

- The two sends' rows carry their words as sent, Coming up included, exactly as 024's do.
- A notification of its own writes its own row, kind `reminder`, the `bell` glyph, opening the thing's thread. It names only the author's own thing.
- With no phone to take it, a reminder that would have gone on its own is recorded as not sent, `--text-noticed`, opening the Notifications page, as 024's sends are.
- Nothing is recorded about what offload decided not to remind you of. A label is not news.
- **What forgetting takes with it.** A record whose words named a memory is deleted when that memory is forgotten and its Undo has passed, at the purge, as a record naming another member's words is when they leave (024). *At the purge rather than the forget since the implementation review, 2026-10-10: Undo of a forget must destroy nothing.* A record of a thing's own reminder goes when the person's membership of its thread ends.
- A record whose words named a calendar's events goes when that calendar is disconnected or unticked (amended 2026-10-10).

### What a reminder carries away

The words of a reminder leave as a digest's do: through Expo's push service and then Apple or Google, in transit, which the privacy page already names. The page changes before the first reminder goes (`CLAUDE.md`), in four places, and the owner reads them before any code:

- **Section 3**, what offload works out: "For anything you put in with a date, what kind of date it is and how much notice it needs, which offload works out so it can remind you, and drops when the thing goes."
- **Section 4**: "send the notifications you choose" becomes "send the notifications you choose, including reminders offload times before the dates that need one".
- **Section 14**: "they carry a few words of what you or a thread member wrote, to your own phone" becomes "they carry a few words of what you or a thread member wrote, or of what offload remembers for you, such as a birthday, to your own phone".
- **Section 17**: "or a memory of theirs that says who you are to them" gains ", or when your birthday is, which offload can name in a reminder on their phone".

On 2026-10-10, with the owner's approval, section 14's sentence gained the calendar: they carry a few words of what you or a thread member wrote, of what offload remembers for you, such as a birthday, "or the titles of the day's events on a calendar you connected, which somebody who invited you may have written", to your own phone; and section 7 adds "to name the day's events in your morning notification" to the uses of calendar data.

`UPDATED` and `CONSENT_VERSION` move. No label, kind, lead, name or date reaches an analytics event, a log line, a trace, a job's payload or its error (OFF-1): events carry the window, the kind as an enum, counts and outcomes, keyed on the account's pseudonym.

### Phones already installed

The new channel, the new kind and the new door reach the phones in their next update. Until a phone has them, it is sent nothing of its own: the token a phone registers says whether it can take a reminder of its own, and the sends go to every phone as now.

### States

A switch or a tile is drawn first and written second, with "Couldn't save that" and Try again on a failure. A notification of its own that fails is not retried after its moment: a reminder late is worse than none, as a digest late is. Every colour is named by alias and holds in both themes.

**Needs checking on a device** (the kits cannot show it): the tiles at 200% text on a small phone; the note and memory editors with the extra switch row at 200%; a notification of its own on a locked phone under private visibility; the `reminders` channel after an update.

## Acceptance criteria

**Labels**
- **AC-1** The nightly pass labels every dated row and dated note authored by its member in the thread that has no label, or whose title, text, type or date column changed since, with one of the seven kinds and one of the four leads, and an undated open task of theirs with an anchor that is a dated row or note in the same thread, or none; the Core API re-derives the set it may label and the anchors it may name from the database and drops anything outside them, one entry at a time.
- **AC-2** Nothing from mail, a calendar, a browser capture or an untrusted dump, and nothing another member authored, is shown to the pass for labelling or reminded about; a stopped thing is never shown again. A calendar's own row is from a calendar; a row the person dumped that offload wrote to a calendar is not (amended 2026-10-10, AC-28).
- **AC-3** The pass is shown at most 30 things to label and 20 anchors a thread a night, nearest date first, each at most 200 characters.
- **AC-4** The memory pass writes a month and day and a lead on a People or About memory that states a yearly date, never on the person's own birthday, and the kind of every such memory is `occasion`.
- **AC-5** A name for a note or a memory is accepted only as a run of the thing's own text, at most 60 characters, one line, with no address and no four digits in a row; otherwise the thing is named by its first 60 characters cut at a word.
- **AC-6** The daily run's account gate and its per-thread gate each book a pass for a member who holds an unlabelled dated thing, or an undated open task never labelled, within 032's ten-thread cap.

**The table**
- **AC-7** One pure function takes a kind, a lead, an anchor's date or the thing's own, its rule, whether it has a clock time and whether it was asked about, when it was dumped or its date set, the account's zone and two hours, How many, and now, and returns the reminders and where they land; a test pins every cell of both tables.
- **AC-8** Windows are dropped before How many cuts: a window past at labelling, or within two days after the thing was dumped or its date set, is dropped, except on the day; a late month out lands as stated; Low, Medium and High keep the first one, two and three that are left.
- **AC-9** A repeating thing is reminded about for its next occurrence only, weekly or more often on the day at most, monthly a week out and on the day at most.
- **AC-10** A thing done, archived, deleted, stopped, outside its author's membership, whose anchor is gone, or whose date another member set last, has nothing sent; a moved date moves its windows; a row asked about at a clock time is reminded about at that time.
- **AC-11** A row with a clock time in the next 24 hours and no label is reminded about 30 minutes before, whatever How many says, and by its label once it has one.
- **AC-12** A notification of its own never lands outside 7:00 to 22:00 in the account's zone: before 7:00 it is named in the evening send the day before, after 22:00 in the morning send of its day.

**Sending**
- **AC-13** The morning send's today part names 024's rows due today and the morning's on-the-day reminders; the evening send's tomorrow part names 024's rows and the evening-before reminders; Coming up names month outs and week outs; each switch holds back only its own rows; a send goes when it has anything, names a thing once, and is cut at 240 characters at a word.
- **AC-14** The copy follows the three arms for Coming up, the weekday within a week, "tomorrow", the day and month beyond, "by" for a deadline and an anchored task, counts as titles, no possessive of authorship, the clamp; a test pins each arm, each title and each of the four timed titles.
- **AC-15** A notification of its own is placed by the hourly pass with a key of the row and the instant it goes (since 2026-10-17: keyed on occurrence and window, a meeting moved later the same day lost its reminder to the old key), so a restart or a second instance places it once; it carries the closed kind `reminder` and the thread and thing ids only, is re-checked against every rule above when it runs, goes only to tokens that declare they take it, and is dropped when it runs more than 15 minutes late.
- **AC-16** Nothing about a reminder is stored ahead of its send but ids, occurrence days, windows and instants: no title, name, note or memory words in a job's payload, its error, a log line, a trace or an analytics event; events carry the window, the kind enum, counts and outcomes under the pseudonym.
- **AC-17** No reminder goes and none is recorded when Reminders is off; with no token that takes it, one of its own is recorded as not sent by permission.
- **AC-18** No reminder goes before the four privacy page edits are live, with `UPDATED` and `CONSENT_VERSION` moved.

**Control**
- **AC-19** Only a thing's author can stop its reminders, and the API refuses a stop from anybody else; stopping a row asked about also turns `is_reminder` off; only the author can turn `is_reminder` on, which is what Undo of their stop does.
- **AC-20** The Remind me switch and the bell are drawn to the author on every thing offload will remind them about, from a field the API returns for each row, note and memory, and to anybody else only while `is_reminder` is on, as 023 built.
- **AC-21** A date, a title or a note's words set or changed by a member who is not the author, or by their turn, stops reminders for that thing until its author edits it.

**The phones and the web**
- **AC-22** The Notifications page carries the Reminders section on all three surfaces, How many as three tiles with their pictures and the caption as written, the hours greyed as stated, the Dates caption reworded; Android creates the `reminders` channel with private lock-screen visibility, never renames it, and mirrors it into the switch; the web summary counts Reminders.
- **AC-23** Activity draws a `reminder` row with the `bell` glyph opening the thread, and the sends' rows with their words; a record naming a memory is deleted when the forgotten memory is purged.
- **AC-26** Today carries a Reminders section, by default under Your day and above Open in your threads, listed in Customize Today with a grip and a switch on all three surfaces; it holds each thing whose first reminder at the person's How many is due and whose date has not passed, nearest first, not repeating a row Your day draws today, whatever the Notifications switch says; empty, it draws nothing. *Amended 2026-10-11:* every entry is drawn as the column above, with its countdown, its day, where it lives and its time; everything on the day shares one card; the `x` dismisses that one reminder, with Undo, and the API refuses a dismiss of anything not showing to that account.
- **AC-27** Phones that know Open in your threads but not Reminders never receive a layout naming it: `/api/me` keeps `todayLayoutV2` without it and adds `todayLayoutV3`; a layout an older phone writes back keeps Reminders at its default place.

**The prompt and the evals**
- **AC-24** A new eval principle covers the labels: the owner's examples (a wife's birthday, a colleague's, a meeting today, a visa before a trip, a bill), each kind and lead, `none` for a receipt, a link, a photo kept for keeping, a routine and a past date, an anchored task, a stated "a week before", and names that are runs of the thing's own text. `15-injected-text-is-data` gains a member's note, an anchor note and a forwarded page that each try to dictate a label or a name. Running them is a separate ask.

**Docs**
- **AC-25** 024's two rules, 023's switch, 027's sections and 038's birthday sentences are amended in their specs; `docs/tech/decisions.md` carries the decision and the reversible allowlist entry for labelling; the design `decisions.md` carries an entry whose Design system impact names the readme's lines on the bell and the flag.

**The calendar in the morning (amended 2026-10-10)**
- **AC-28** A row whose source is the person or a share keeps its label, can be a task's anchor, gets its reminder of its own and is named in the sends after offload writes it to a calendar; a calendar's own row is none of these. `reminder_anchors`, `reminders_wanted`, the hourly own pass and the send's read decide by `source`, never by `source_ref`.
- **AC-29** The morning send names the day's events on the account's own calendars, following the Calendar switch alone: with Due today off and Calendar on they are still named; with Calendar off they are not there; an event offload wrote from a row the send names is named once, as the row.
- **AC-30** The Notifications page carries Calendar between Reminders and People on all three surfaces, one switch, "Today's events", with its line, on by default; the morning hour is in use while any of Due today, Reminders or Calendar is on, from the shared `hoursOn`; on Android the switch mirrors `due_today`.
- **AC-31** A record in Activity that named a calendar's events is deleted when that calendar is disconnected or unticked; section 7 and section 14 of the privacy page say the calendar's part, pinned by the page test.

## Out of scope

- A person choosing when to be reminded, snoozing, or asking for another reminder on one thing.
- Reminding another member, or assigning a thing to a person.
- Web push, email reminders, and quiet hours as a setting.
- Reminders about a calendar's own events. The morning names the day's events since 2026-10-10, as what the day holds, never as a reminder of their own.
- Showing the labels, or a screen listing everything that will ever be reminded about. Today's section holds what has begun, not the whole future.
- Reminding about something overdue beyond what 024's morning send already names.
- Buttons on a reminder.

## Decided during planning

- **A model labels, a table schedules** (owner, in the brief).
- **Reminders ride in the two sends**; only a clock time gets its own notification (owner).
- **A 30-minute default** for an unlabelled row with a clock time in the next 24 hours (owner).
- **The author alone** in a shared thread (owner).
- **Memories carry the date**, amending 038 (owner).
- **A week out spans one to seven days**, so the evening before is a week-out reminder for somewhere you go and a trip (owner, from the research).
- **A `months` lead** moves the long window to 8 weeks (owner, from the research).
- **A close birthday on Low is 5 days out, a month out on Medium, and the morning itself on High** (owner, from the research and the project lead's review; the brief's "not the day" relaxed on 2026-10-10).
- **A per-thing switch**, extending 023's Remind me (owner).
- **Meeting and appointment are two kinds**, 15 and 60 minutes before, because how far ahead people set an alarm scales with how far they go (Tungare and Pérez-Quiñones); anything else with a clock time, and the default before a label, 30.
- **Dated notes are reminded about**, because filing records a trip or a stay as a note, and the brief's trip example needs it.
- **An anchored task is due the day before its anchor** for reminders, so its last reminder is never on the morning the trip starts.
- **Today gets a Reminders section** under Your day, movable and switchable, which holds what Coming up names (owner, after the reviews).
- **Reminders off records nothing**, where a switched-off digest is recorded: a record of every reminder somebody chose not to get is noise.

## Review

Three reviews on 2026-10-10. What changed:

- **Security.** A member could re-arm a push to another member by moving the date on their row: reminders follow only a date the author set (AC-21), and a notification of its own lands only between 7:00 and 22:00 (AC-12). The model's short name could carry injected text to a lock screen: it must be a run of the thing's own text, checked by the Core API (AC-5), with injection cases (AC-24). The switch was co-owned: stopping is the author's alone and never writes `is_reminder` on (AC-19). An anchor could carry another member's words: a reminder never names the anchor. Nothing about a reminder sits in a job payload (AC-16). Mail, calendar and untrusted things are excluded explicitly (AC-2). Forgetting a memory deletes the records that named it (AC-23). The privacy page edits are written out and gate the first send (AC-18).
- **Project lead.** A close birthday was never said on the day, and one learned three days ahead was never said at all: `occasion` with `weeks` or `months` gains the day as its last window (owner, relaxing the brief). The visa failed its own example: windows drop before How many cuts (AC-8), a late month out lands two days after the two-day rule allows, and an anchored task is due the day before its anchor. With Due today off, on-the-day reminders had nowhere to go: each switch holds back only 024's rows. Placement is stateless, as the digest is. The pass's input is bounded and both daily gates book it (AC-3, AC-6). The morning hour stopped being quiet hours: a fixed 7:00 and 22:00. "Remind me a week before" counts as evidence for the lead. A row asked about at a clock time is reminded about at that time.
- **Client.** The bell is a field the API returns (AC-20). Phones already installed are sent nothing of their own until their token says they can take it. The sends keep their channels. How many is three tiles, as 031 made every settings choice, not the segmented control 031 retired from settings. Copy: "by" for a deadline and an anchored task, counted titles for the evening, the three timed titles, the 240-character body. The web's Remind me becomes the phones' `Switch`. The Notifications page's spinner line is gone; it never had one.

**The implementation review, 2026-10-10** (code, client and security, on the built branch). A non-author's words now hold reminders as their date does, so another member cannot put words on the author's lock screen; only the author can turn `is_reminder` on; forgetting a memory deletes the records that named it at the purge, not inside the forget's Undo; a row a connected app wrote is never something a task can be for; format characters are stripped from every name; their own birthday is refused in code as well as by the prompt; an asked clock time is honoured on every kind; a switch flipped alone is not an edit of the row; and Undo of a stop puts the switch back on. The phones and the web were brought together on How many's default, the hours rule, the memory link and the chip's spoken label.

Deliberately not changed:

- **Memory Undo.** The memory editor has none today; the switch takes Undo where the editor already has it, rather than 042 adding Undo to 040's editor.

## Amended 2026-10-10: the calendar in the morning

Decided by the owner on 2026-10-10, as a tweak to 024 and 042.

- **Whose words decides.** A row a person dumped, with source person or share, keeps its reminders and its naming in the morning after offload writes it to a calendar. What decides is whose words it is (`source`), not whether a calendar holds a copy (`source_ref`). A calendar's own row is still never announced or reminded about.
- **The morning names the day's events** on the account's own ticked calendars, its own part of them (created or invited), at their hours, all-day first then by the hour, alongside dates and reminders, counted in the title like any row. Only the morning; the evening never names them; no event ever gets a notification of its own; a send that names one carries no verbs. An event offload wrote from a row is named once: skipped when that row is named in the same send, otherwise named by its calendar copy.
- **Calendar**, a switch of its own on the Notifications page between Reminders and People, one row "Today's events", on by default. The events follow it alone, as this spec made each switch hold back only its own rows. The morning hour is in use while any of Due today, Reminders or Calendar is on. On Android it mirrors `due_today`.
- **The titles leave with the calendar.** A record in Activity that named a calendar's events goes when that calendar is disconnected or unticked, because the privacy page says what a connected calendar gave offload is deleted on disconnect.
- **The privacy page** changed with the owner's approval, in sections 7 and 14, as "What a reminder carries away" now says.

## Grounding

A survey of what is known about when people want reminding, by type, on 2026-10-10. Strength in brackets.

- **The reminder nearest the moment carries most of the value** when nothing is needed beforehand. About 80 percent of the reminders people set themselves fire within 24 hours (Graus, Bennett, White and Horvitz 2016, Cortana logs) [strong].
- **Appointments you go to: about a day before.** 5.3 percent missed with a 1-day reminder, 5.8 with 3-day, 4.4 with both (Steiner et al. 2018, randomised, 54,066 patients) [strong]; 24 hours alone beat 72 and 72 plus 24 (Esteban et al. 2026, 475,214 appointments) [moderate, preprint].
- **Meetings: 15 minutes, scaling with distance**, 5 to 15 in the same building, up to an hour with a commute (Tungare and Pérez-Quiñones) [moderate, small study]. Outlook defaults to 15, Todoist's example is 30.
- **Bills: about 3 to 7 days before.** A text about 3 days before each instalment raised on-time payment by 7 to 9 percent (Cadena and Schoar) [strong]; extra late reminders added nothing (Karlan et al.) [strong]; an earlier reminder sped payment without raising it (Gillitzer and Sinning) [strong].
- **Passports and visas need months.** US routine processing is about 6 to 8 weeks door to door; a Schengen visa may take up to 45 days [official].
- **A close birthday: about a week**, for anything bought or posted. The evidence is thin: a 2006 survey and card shops' shipping advice [weak, vendor].
- **Trips: about a week, and the day before**, when check-in opens [industry norm].
- **Batch what is not urgent.** Notifications batched three times a day lowered stress and raised wellbeing against both hourly batching and none at all (Fitz et al. 2019, randomised, 237 people) [moderate]. Hence the two sends.

Sources: [Graus et al. 2016](https://www.erichorvitz.com/Cortana-reminders_UM_2016.pdf), [Steiner et al. 2018](https://www.ajmc.com/view/optimizing-number-and-timing-of-appointment-reminders-a-randomized-trial), [Esteban et al. 2026](https://sciety.org/articles/activity/10.64898/2026.08.17.26360609), [Tungare and Pérez-Quiñones](https://arxiv.org/pdf/0809.3447), [Cadena and Schoar](https://www.nber.org/papers/w17020), [Karlan et al.](https://img.nber.org/papers/w16205), [Gillitzer and Sinning](https://docs.iza.org/dp11599.pdf), [Fitz et al. 2019](https://scholars.duke.edu/publication/1402953), [Schengen visa window](https://www.mzv.sk/en/web/ankara-en/visa-and-services/schengen-visa), [Moonpig](https://www.moonpig.com/au/faq/).

## Amended 2026-11-17 by 051, the owner

- **A memory's date can come from the turn.** AC-4's memory pass is no longer the only writer of a memory's date: a birthday the turn remembers is labelled there and then, `occasion` and `days`, with its short name, and the pass reads it again only once its words change.
- **"A birthday still never reaches a calendar"** (line 9) ends: 051 puts one on.
- **Today on the day.** A memory's reminder on its own day is not drawn while the memory's event is on a calendar Today reads; Your day draws the event. Earlier windows are unchanged.
