# 024 Notifications

**Status:** drafted 2026-09-22 against the design handoff of the same day (`handoff/APPLY-2026-09-22-dates.md` items 10 to 14, `explorations/due-dates-and-notifications.html` sections 7 to 9), revised the same day with the product owner's answers and the three reviews
**Surfaces:** iOS, Android, web, the Core API and the agent plane
**Amended by 031 (2026-10-02):** the page's three groups become sections with captions, each hour sits indented under its switch, the phones' last section says whether this phone allows them, and the web gains On your phones.
**Amended by 033 (2026-10-03):** first run no longer asks for permission after consent; it asks only from the Notifications card on Bring it all in, drawn while the system has never asked. Settings' Notifications page is the way in for anyone who skips.
**Amended by 042 (2026-10-10):** *two sends a day, no per-item pushes* holds for everything without a clock time: a thing with one can get a notification of its own shortly before it, at 15, 30 or 60 minutes, on a fifth Android channel, `reminders`. The two sends gain what offload chose to remind about: the morning's today part and the evening's tomorrow part name it beside this spec's rows, and a part called Coming up follows; each switch holds back only this spec's rows. *Notes are never announced* gives way for a note with a date, which a reminder can name to its author. A *reminder* is now a mention offload decides to make, and `is_reminder` the record that somebody asked. Activity gains a `reminder` row. See `042-reminders/feature-spec.md`.
**Amended 2026-10-10, the calendar in the morning:** the morning send also names today's events on the account's own calendars, under a switch of their own, Calendar; a row a person dumped stays announced after offload writes it to a calendar; and a record that named a calendar's events goes with that calendar. See the section of that name at the end.
**Depends on:** 023, whose zone, rule, chip and write path every section here reads; 022, whose requests, invitations and dot the people sends sit beside; 009, whose first run already asks the permission and whose Today draws a bell that does nothing; 010, whose Settings gains a page; 013, whose agenda read Today reuses

## Why

The bell on Today has pointed at nothing since day one. First run asks the notification permission on its third screen and nothing has ever used it. `is_reminder` has sat in the schema since 006 under a comment saying nothing acts on it until notifications ship. The jobs table already does scheduled and daily work, so the machinery exists and the product has never said anything to anybody unprompted.

Two decisions shape everything below. **A date is not announced; a reminder is.** "Rent is due Friday" is a fact and "remind me to pay the rent Friday" is a request, and the flag is the difference, so most dated rows are silent and an empty morning is the normal one. And **two sends a day, no per-item pushes**: a due date is not an alarm, and something that pushes the moment it becomes true teaches people to swipe it away.

## What

### Vocabulary

A **digest** is one of the two daily sends, **Due today** in the morning and **Tomorrow** in the evening, which name the sends and their switches; the notification's own title counts, as below. A digest holding exactly one task is not a digest and carries two verbs, **Done** and **Tomorrow**. The two **people** sends are **Connection requests** and **Added to a shared thread**, and every send has a **switch** of the same name, word for word. A **reminder** is a row whose `is_reminder` the model set; a person can switch one off in 023's sheet and cannot ask for one. **Activity** is the record the bell opens, and each row in it was **sent** or **not sent**. **Today** gains an agenda. In schema and code the nouns are `push_tokens`, `activity`, the `notify_*` account columns, the `account.digest` and `digest.schedule` job kinds, and the Android channel ids `due_today`, `coming_tomorrow`, `people_requests` and `shared_activity`, ids being permanent and invisible. Nothing a person reads says alert, snooze, inbox, unread, badge, notification centre, item or thing; a count stands on its own, and nothing is set in uppercase.

### What is announced

Reminders with a date, from every thread the person is an accepted member of at the moment of the send, including rows another member filed; a shared reminder reaches every member's digest, and the row's switch in 023 is the one way to silence it for all of them. The digest announces from `content` alone: notes are never announced, a calendar's own rows are never announced, and nothing is announced at the moment a date passes. A row a person dumped is still theirs after offload writes it to a calendar, and stays announced (amended 2026-10-10). The morning also names the day's events on the account's own calendars, as what the day holds rather than as an announcement (amended 2026-10-10, below).

| Send | When | Carries | Skipped when |
| --- | --- | --- | --- |
| Due today | The morning hour in the account's zone, 8:00 by default | Reminders due today, an event reminder happening today, and reminders overdue by one to seven days, named after today's; since 2026-10-10 also today's events on the account's own calendars | Nothing due today, nothing overdue and no event today |
| Tomorrow | The evening hour, 19:00 by default | Reminders due tomorrow, an event reminder happening tomorrow, and a repeating reminder whose rule lands tomorrow | Nothing due tomorrow, or the same rows this morning named |
| A person | When it happens | One person, one thread | Never batched into a digest |

**Overdue is announced for seven days, then goes quiet.** A reminder nobody ticks, moves or clears stops being a sentence after a week; its chip stays late until somebody deals with it. **A repeating reminder is never overdue**: it has no occurrence to have missed, so it is named on the days its rule lands and nowhere else.

**Never sent:** a question offload is waiting on, a notification of its own for a calendar's event (the morning names the day's events since 2026-10-10, and that is all), anything at the moment a date passes, a declined request, a note, a row that is not a reminder.

### The copy

One template with three arms, so the sentence is testable rather than judged per send. One is named. Two to four are listed. Five or more name the first two and count the rest.

```
Three today
Pay the rent, Ana's ferry times, and Yoga at 7:00.

One today, three from yesterday
Yoga at 7:00. Still open: Call the plumber, Pay the rent, and Book the ferry.

Five still open
Call the plumber, Renew the gym membership, and three more.

Two tomorrow
Dentist at 9:00, and the rent. Yoga is back on Tuesday.
```

- The title is verb-free and subject-free and **says the day in counts**: "Three today", "Five still open" when nothing is due today, "One today, three from yesterday" when both, the overdue part from yesterday, a weekday or last week by the oldest row, and "Two tomorrow" in the evening. Never "You have 3 tasks due", and **never a person's words**, as a digest title never was. *Amended 2026-09-30: the titles were fixed, Due today and Tomorrow, and a morning with nothing due today and five overdue said "Due today" over "Five are from last week."*
- **What is still open is named, never a second notification**: after today's list as "Still open:" and the same three arms, or as the whole body when nothing is due today. An overdue event is named without its hour. *Amended 2026-09-30: it was counted and never named, "One is from last week".*
- An event says its hour. A task says nothing about time even when it has one.
- **A calendar's event is named like an event**, by its title at its hour, an all-day one by its name alone, after what is due and the reminders, so a busy calendar never pushes them off a lock screen; the events among themselves are in the order of the day, all-day first, then by the hour. It counts in the title like any row: "Four today", "Pay the rent, Standup at 9:00, Lunch with Ana at 13:00, and Dentist at 15:00." Its title is somebody else's words as often as not, so it is one line, clamped, with no dash. *Amended 2026-10-10.*
- **Another member's row is named with its author**, as *Ana's ferry times*. Yours are never possessive, so the possessive itself carries the meaning. A member with no name is Someone's. At most two rows by any one other member are named in a send; the rest are counted.
- A repeating reminder coming round says so in one clause, "Yoga is back on Tuesday", and a daily one is simply named.
- **Every string a person wrote is clamped before it is rendered**: one line, control characters stripped, 120 characters, the bound the share preview already uses. A digest title is never a person's words; a people title always leads with the sender's name.
- The wording is stored verbatim on the Activity row and never re-rendered.
- No em dashes, no emoji, sentence case, the brand in lowercase, no noun for what was dumped.

### Actions

A digest carries no action buttons, because Done is about one thing and a digest is about five; tapping it opens Today. **When the digest holds exactly one task** it gets two verbs. **Done** ticks the row. **Tomorrow** moves the date by one day through the person-facing write path of 023, so it is a date change and not a snooze; there is no notification-level snooze anywhere. A one-thing digest about an event carries no verbs, because an event has no tick in the product and moving an appointment is not what a lock screen is for; about a repeating reminder, none, because a series is not one thing. A calendar's own row is never in a digest at all, whatever its flag says; a row a person dumped that offload wrote to a calendar is an event, so it carries none; and a send that names a calendar's event carries none, since there is no one row for the verbs to act on (amended 2026-10-10). Both verbs are registered as needing the device unlocked, act without opening the app, dismiss the notification, send the session and the row's id and nothing else, and are resolved on the server against the session's account and the row's membership exactly as the sheet's write is. Each writes an Activity row, since there is no toast to say what happened. A verb pressed while offline or signed out does nothing and the notification stays standing; a write the server refuses does the same.

Two categories are registered per platform, one with the verbs and one without. A people send carries **Open** and nothing else: 022 decided a request is answered on its card, and accepting a person from a lock screen is the one place that should not be one tap.

**The payload is not an instruction.** It carries a closed `kind`, the ids the kind needs, and never a path, a route or a URL; the app maps a kind to a screen from a fixed table, re-reads every id from the server on arrival, and ignores anything else. The push service's enhanced security is on, so a third party holding a token cannot send in offload's voice.

### People

- **Connection requests.** "Ana wants to connect", "Answer in My people.", Open, landing on My people with the card at the top. Not sent to somebody who has blocked the requester, whose request is already undelivered. No pronoun in the body: the product does not know one.
- **Added to a shared thread**, which covers both being shared with and somebody adding to a thread you already share. "Ana shared Lisbon trip" with the body "Waiting in My threads.", so the name is said once, Open landing on the invitation. "Ana added two to Lisbon trip", "Ferry times, and a place in Alfama.", tapping opens the thread. The second is coalesced per thread per person over ten minutes, so somebody tidying a shared list costs one notification rather than eleven, and it is composed at the moment of the send from the rows the recipient may still read, so a row deleted or a member taken out in those ten minutes is not announced. It is the only send whose body is another person's words: clamped, and never used as a title. Over four says "several". Nobody is told about their own additions, about a request they sent, or about a thread they were taken out of.
- A share invitation puts the thread's name in front of somebody who is not yet a member, as the invitation card already does, and the privacy page's sharing section says so.

### Switching them off

A **Notifications** page in Settings, in the Reaching you group beside Connected apps, where the kit's Communication page sat, on the phones and on the web. Not the notifications page 022 ruled out, which was about a list of things that happened; this is preferences.

```
Dates
  Due today            switch     One message each morning.
  In the morning at    8:00
  Tomorrow             switch     One message each evening.
  In the evening at    19:00
People
  Connection requests           switch
  Added to a shared thread      switch
On this phone
  System settings   >
```

- **Calendar**, since 2026-10-10, is its own section between Reminders (042) and People: one row, "Today's events", with the line "Today's events on the calendars you connected, in the morning message.", on by default. It holds back only the calendar's events, and the morning hour stays in use while any of Due today, Reminders or Calendar is on.
- The switches and hours are the account's, one set for every device, and the hours are in the account's zone: a digest that moves when you fly arrives at 3am.
- Hour rows sit under the switch they belong to and grey out with it. Labels match the notification titles word for word, which is why the evening switch says Tomorrow and not the design's Coming tomorrow; the channel id keeps the design's name, since nobody reads an id.
- **Android:** each switch is a `NotificationChannel` with the four fixed ids above, created at first launch with private lock-screen visibility, so a locked phone shows the title and not the words, and never renamed, since a channel cannot be renamed or re-enabled by the app once it exists. The page reads channel state on open: a channel a person switched off in the system shows off here, tapping it opens that channel's system page, and the account switch is set off so that Activity tells the truth about it. Calendar has no channel of its own: its events ride the morning message, so its switch mirrors `due_today` (amended 2026-10-10).
- **iOS** has no per-kind switches in the system, so this page is the only place a person can refuse one kind and keep another. Categories are still registered, for the verbs. Whether the words show on a locked iPhone is the system's own preview setting.
- **Permission.** Asked once, on first run, as today. A refusal gets nothing and no second ask; the page then carries one line, "Notifications are off for offload on this phone.", above System settings.
- **A push token is a delivery capability and is bound to a session.** The app registers its token whenever permission is granted and it launches, through a route that takes no account id and binds the token to the session's account; a token already held by another account is re-bound, so a phone that changes hands or accounts never receives the last account's words. Sign-out deletes the token on the server before the session ends; a token the push service reports gone is dropped. The token goes with the session that registered it however that session ends, ended from Signed in on, signed out or expired, and no send reaches a token whose session has expired (amended 2026-10-11: a session that ended on the server could not delete its own token, so the last account's words kept reaching a phone at the sign-in gate). No read returns a token or the session it names, and no log line carries one.
- **Web** shows the same page with the same account switches and one line under the heading, "offload sends these to your phone.", and sends nothing itself: browser push is a separate permission, transport and refusal state, and none of the four sends is worth opening it for.

### Activity

The bell on Today, a bare glyph today, becomes a control with a 44px hit area and the name Activity, and opens **Activity**: everything offload told you, in order, plus what it decided quietly and never told you about. On the phones it is a pushed screen like Settings, without the plate; on the web it is a pane from the sidebar's Activity item, alive for the first time. This reverses 022's refusal of a notifications page, and the reason it survives that argument is that there is now content, some of it existing nowhere else in the product, and it is the only way to read your notifications when notifications are off.

```
Today
(*) Two today, one from last week                8:00
    Pay the rent, and Tom's birthday. Still open: Call the clinic.
(*) Ana added two to Lisbon trip                 7:12
    Ferry times, and a place in Alfama.
Yesterday
(*) Tomorrow                                     19:00
    Dentist at 9:00, and the rent.
( ) Your invite to Sam expired                   16:40   Not sent
    Thirty days, no answer.
Earlier
( ) Tomorrow was off                             Fri     Not sent
    Two were due on Saturday.
```

Four kinds, and whose record each lands in:

1. **Sent, about dates.** The digests, in the words they were sent in, in the recipient's record.
2. **Sent, about people.** A request, a share, somebody adding to a shared thread, in the recipient's record.
3. **Silent by design.** An invitation or a request you sent that expired, in the sender's record; a date the model moved on a row that already had one, in the record of the account whose turn moved it. A declined request belongs here the day a decline exists; 022 built Not now, which is not one, so nothing writes it, and the design's example line is not drawn. A calendar write that lapsed unanswered and a question that closed unanswered are the same kind and are deferred: each is an integration into code that has nothing to do with notifications, with wording nobody has settled.
4. **Silent by setting.** A digest that had something to say and was suppressed by a switch, or that no phone could take because the permission was refused or no device is signed in, in the recipient's record.

- **A row has a title and a body**, the words that were sent or would have been, and never a URL, a photo, a token or anything the notification did not carry.
- **A quiet morning writes nothing.** An empty digest is the normal one and is not an event.
- **A sent row and an unsent row are the same row with a different lead**: a filled 28px disc for something that reached the phone, hollow on `--border-lift` for something that did not, so it holds in dark, plus the kind's glyph, `sunrise` and `moon` for the two digests, `users` for people, `calendar` for a date, `bell` for a setting.
- **Not sent is a fact, not an apology**, and a sentence-case tag. `--text-noticed` where a setting or the permission caused it, and tapping opens that setting. `--text-tertiary` where the product chose silence by design, and those rows are not doors.
- A digest row holds what was said, not what is true now, and opens Today, where the notification opens and what is true now is drawn. *Amended 2026-09-30: it was not a door, and the phones and the web drew its title alone, so the row read "Due today" and went nowhere. Every row draws its words under its title, as the sketch above always did.* A people row opens what the notification would have. A moved-date row opens the row's thread. A verb acted on from a notification writes its own row, "Pay the rent ticked from the notification", quiet.
- **A dot on the bell, never a count**, when a row is newer than the last time Activity was opened. Every kind dots it except a connection request, which keeps 022's gear dot and dots nothing else; 022's rule is amended to say so. The web sidebar's Activity item carries the same dot.
- **Thirty days, then it purges**, the invite expiry's figure, by the daily purge job. A row that names another member's words goes sooner when it should: when the viewer's membership of that thread ends, when the row it names is destroyed, and when the member who wrote them deletes their account. A row that named a calendar's events goes when that calendar is disconnected or unticked, since the privacy page says what a connected calendar gave offload is deleted on disconnect (amended 2026-10-10). A row is readable by its own account only. The empty state is true of a quiet account as well as a new one: "Nothing yet", "What offload sends you is kept here, and so is what it decided not to send." No button, and no composer, as Settings has none.
- Every silent outcome is written at the moment the silence happens, by the code that decides it, with the words it would have used, never reconstructed later from rows that may have changed.

### Today, the agenda

The digest opens Today, so Today has to hold what the digest named, and today Today is the day-one invitation on every surface with no fetch behind it. It becomes a screen: three groups across every thread the person is in, **Overdue**, **Today** and **Tomorrow**, from a new person-facing agenda read, each row the thread page's own row with its chip, its checkbox and its two controls, and the thread's name as the row's meta. Every dated content row lands here, reminder or not: the digest is the narrow view and the screen is the wide one. Notes do not; they are sentences, drawn on the rail. A repeating row appears once, in the first of the three groups its rule lands in, and never in Overdue. Overdue reaches back thirty days and is capped, as the impl-spec states. The zone strip of 023 sits above the groups. When none of the three has anything, Today shows the day-one invitation for an account that has never dumped anything and otherwise the quiet empty line "Nothing due today." with the composer where it always is. One spinner while it loads. The kit's full Today, what moved, on the clock and other things, stays unbuilt. The web's Today pane gains the same three groups.

### The sends, mechanically

An hourly job enqueues, for every active account whose morning or evening hour falls in the coming hour, one `account.digest` job keyed on the account, the local day and the send, with `run_after` at that hour in the account's zone. A settings write that moves an hour or the zone deletes the queued job for today, and the next hourly pass enqueues it again if the hour is still ahead. A job that runs more than two hours late is dropped without a send or a record: a digest at the wrong hour is worse than none. Each job resolves its rows through the membership predicate for that account at that moment, composes the copy, sends to every token the account holds through Expo's push service, records the Activity row, and reads the receipts fifteen minutes later to drop tokens the service reports gone. A failure throws a status and an error code, never the provider's body, so no token and no words reach `jobs.last_error` or a log line. Analytics carry `digest_sent` and `digest_skipped` with the send, the row count, the overdue count and the reason as an enum, and `notification_sent` and `notification_failed` with the kind and the error code; never a token, a name, a title or a device id.

### The privacy page

The words of a notification pass through Expo's push service, then Apple or Google, in transit. Expo publishes that it stores push tokens and that a notification's content "is never stored and we only handle that data as long as it takes to send the notification", which is the page's own bar for a company that sees content. Six edits, made before the first send: the short-version bullet about the companies gains the three; section 3 names notifications as one more thing that leaves; section 6's table gains an Expo row, "Sends notifications to your phone; the words of each notification, held only as long as the send takes, by their statement", and the Apple and Google row gains "and deliver notifications to your phone, which carry their words"; section 10 gains Activity's thirty days and its earlier purges; section 11 says a share invitation carries the thread's name to the person invited; section 12's line that content never leaves in a log or an event names notifications as the one channel that carries words. The updated date and the consent version move. The page's promise to tell account holders before such a company is added is met by a count run at ship time: with one active account, the product owner's, this plan is the notice; with more, the email goes out first.

### States, once for the screens and once for the verbs

Activity, Today and the Notifications page show one spinner while they load and no skeleton. A switch or an hour is drawn first and written second, and a refusal or no signal puts it back with "Couldn't save that" and Try again. A verb on a notification that cannot write leaves the notification standing and changes nothing; there is no screen to put back. Every colour is named by alias and holds in both themes; the hollow lead and the tag are checked in dark.

### On the web

The Notifications page, the Activity pane from the sidebar, the Today groups. No sends.

### On Android

The four channels, private on the lock screen, the Material sheet for the Activity screen's rows, the system settings door per channel.

## Acceptance criteria

The sends

- **AC-1** An hourly job enqueues each account's two sends for the coming hour, keyed on the account, the local day and the send; a second instance or a restart collapses into the row that exists; a changed hour or zone deletes today's queued job and the next pass re-enqueues it; a job more than two hours late is dropped.
- **AC-2** The morning send names reminders due today and event reminders happening today, names reminders overdue by one to seven days after them, excludes repeating rows from overdue, and writes nothing when there is nothing.
- **AC-3** The evening send names reminders due tomorrow, event reminders tomorrow and repeating reminders whose rule lands tomorrow, and is skipped when empty or when its set of row ids equals the morning's, which a daily repeating reminder produces.
- **AC-4** Only `content` rows with `is_reminder` and a date are announced, never a calendar's own row, and a row a person dumped still is after offload writes it to a calendar (amended 2026-10-10), resolved through the membership predicate for the recipient at the moment of the send, with deleted and archived rows excluded; a row from a shared thread is named with its author's name, at most two per other member, and yours are never possessive.
- **AC-5** The copy follows the three arms at the stated thresholds, the title is counts and never a person's words (amended 2026-09-30, it was exactly Due today and Tomorrow), an event carries its hour and a task never does, every interpolated string is single-lined, stripped of control characters and clamped at 120, no line carries the retired noun, and a test pins every arm, the clamp, the titles and what is still open.
- **AC-6** A digest of several carries no verbs and opens Today; a digest of one task carries Done and Tomorrow; of one event, one repeating reminder, or any send that names a calendar's event, none (amended 2026-10-10: a calendar's own row is never in a digest, and a dumped row offload wrote to a calendar is an event). Both verbs require the device unlocked, act without opening the app, dismiss the notification, send the session and the row id only, are resolved on the server against the session's account and the row's membership, write an Activity row, and leave the notification standing when the write fails or there is no session.
- **AC-7** A connection request sends "Ana wants to connect" with Open landing on My people; a share sends "Ana shared Lisbon trip" with "Waiting in My threads." landing on the invitation; additions to a shared thread coalesce per thread and person over ten minutes into one send composed at send time from rows the recipient may still read, whose body is clamped and never a title; nobody is told about their own actions; a blocked requester's request is not sent.
- **AC-8** No send goes to an account whose switch for that kind is off, and every such skip of a digest with content is recorded as not sent by setting.
- **AC-9** No send goes out before the six privacy page edits are live and the ship-time account count has been run.
- **AC-10** A push failure surfaces a status and an error code only; no token, name, title or device id reaches a log line, `jobs.last_error` or an analytics event; the four events carry exactly the properties named above.

Tokens and the phones

- **AC-11** A push token is registered on launch when permission is granted through a route that takes no account id and binds the token to the session's account, unique on the token and re-bound on conflict, to the registering session too; sign-out deletes it on the server before the session ends; it goes with its session when that session is ended from another device or expires, and no send reaches it once its session has expired (amended 2026-10-11); a token the service reports gone is dropped after the receipts are read; no read returns one; an account with no token has every digest with content recorded as not sent by permission.
- **AC-12** Two categories are registered per platform, one with Done and Tomorrow and one without; Android creates the four channels with the fixed ids and private lock-screen visibility at first launch and never renames them.
- **AC-13** The payload carries a closed kind and ids only; tapping a digest opens Today; tapping a people send opens My people, the invitation or the thread by id after the server confirms it; a payload with anything else is ignored; enhanced push security is on for the project.

Settings

- **AC-14** The Notifications page exists on all three surfaces in the Reaching you group with the four switches, the two hours, System settings on the phones and the web's one line; labels are sentence case and match the titles word for word; the hours are stored in the account's zone and greyed with their switch.
- **AC-15** On Android the page reads channel state on open, shows a system-disabled channel as off, opens that channel's system page on tap, and writes the account switch off; on iOS the in-app switches alone decide per kind.
- **AC-16** A refused permission is never asked again and the page carries the one line above System settings.

Activity

- **AC-17** Every send writes an Activity row with the words sent; every suppressed digest with content writes one with the reason; an expired invitation and an expired request write one in the sender's record; a model-moved date writes one in the turn's account's record; each at the moment it happens, with the words above; a quiet morning writes nothing.
- **AC-18** Activity draws newest first under Today, Yesterday and Earlier, the sent lead filled and the unsent hollow on `--border-lift`, Not sent in `--text-noticed` with the setting as its door or in `--text-tertiary` and inert, digest rows opening Today (amended 2026-09-30, they were inert), people and moved-date rows opening their target, every row's words under its title, in both themes. *Amended 2026-09-27 by 025: a `labelled` row opens its thread and carries one action, Undo, beside the row and outside its press; after Undo it reads Undone, drawn from a column, its words unchanged.*
- **AC-19** The bell is a control with a 44px hit area named Activity; it and the web's Activity item carry a dot when a row of any kind but a connection request is newer than the last opening; opening clears it; never a count; 022's dot paragraph is amended in the same change.
- **AC-20** Rows older than thirty days are purged by the daily purge job, with a test that a row past the window is gone after a run; a row naming another member's words is purged when the viewer's membership of that thread ends, when the row is destroyed, and when that member deletes their account; a row is readable by its own account only; the empty state reads as written and has no control.
- **AC-21** Activity rows carry a title and the sent words as a body, never a URL, a photo, a token or anything the notification did not carry.

Today

- **AC-22** Today shows Overdue, Today and Tomorrow across the account's threads from the agenda read, with the thread page's row, notes excluded, a repeating row once in the first group it lands in and never in Overdue, the strip above, one spinner while loading, and the two empty states; the web pane does the same.

The prompt and the evals

- **AC-23** A new principle, a reminder is what they asked to be told about, with cases that set the flag on "remind me" and a request and leave it off on a fact with a date, is added to the eval set before the feature is done; running them is a separate ask.

The calendar in the morning (amended 2026-10-10)

- **AC-24** The morning send names today's events on the account's own part of its ticked calendars on a live connection, created or invited, at their hours, all-day first by name alone and then by the hour, among the day's rows in the order of the day, each counted in the title like any row; the evening send never names them; tomorrow's events, another person's part of a shared calendar, an unticked calendar and a disconnected one are never named; no event gets a notification of its own; a send that names one carries no verbs; the analytics events carry counts only, never a title.
- **AC-25** The events follow Calendar alone: on by default (`notify_calendar`, `notifyCalendar` on `/api/me`); with Due today off and Calendar on the send names them and none of the rows Due today holds back; with Calendar off they are not there at all, and a morning of only events is empty and writes nothing. The Notifications page carries Calendar between Reminders and People on all three surfaces, one row "Today's events" with its line; the morning hour is in use while any of Due today, Reminders or Calendar is on; on Android the switch mirrors `due_today`; the phones' Notifications card on Today counts Calendar as a switch that reaches the phone.
- **AC-26** An event offload wrote to a calendar from a row is named once: skipped as a calendar event when the row it was written from is named in the same send, otherwise named by its calendar copy, including when a switch holds the row back.
- **AC-27** A row a person dumped (source person or share) is announced after offload writes it to a calendar; a calendar's own row never is.
- **AC-28** A record in Activity that named a calendar's events is deleted when that calendar is disconnected or unticked, in the database by trigger; a record that named nothing from it stays.
- **AC-29** The privacy page's section 7 names the morning notification among the uses of calendar data, and section 14 says notifications may carry the titles of the day's events on a calendar you connected, which somebody who invited you may have written; the page test pins both.
- **AC-30** The morning names only events the person is going to: made, or answered yes or maybe. An invite left unanswered, one not read yet, and anything from a connection whose access was revoked at Google are drawn on Today as before and never named in a notification. `digest_sent` counts them as `events`, apart from `rows`.

## Done means

Every criterion above has a test named in `impl-spec.md`, the suites are green on all three surfaces, the sends are exercised on the iOS simulator by injecting the payloads the server builds, the Android build is left for the product owner's device, and the web's page, pane and groups are driven and screenshotted in both themes.

## Out of scope

- **Web push**, in-app banners, badge counts, and a notification history that syncs between devices.
- **Per-item pushes, a snooze, quiet hours, an email digest and the weekly summary** from the kit's Communication page, which this page replaces.
- **Asking to be reminded**, and any writer of `is_reminder` but the model and 023's switch off.
- **Announcing notes**, a calendar's own events in a notification of their own, questions, declines or the moment a date passes. The morning names the day's events since 2026-10-10, as what the day holds, and nothing more.
- **Declines in Activity** until something declines; **a lapsed calendar write and a closed question** in Activity, deferred to a follow-on.
- **Ticking one occurrence** of a repeating reminder.
- **The kit's full Today**: what moved, on the clock, other things, sort these for me.
- **Digests about another member's changes** beyond the addition send.

## Decided during planning

- **Overdue for seven days, then quiet.** The product owner's call over the design's open end.
- **Share invitations push under Added to a shared thread**, with the addition send, on the `shared_activity` channel, with a body that does not repeat the name.
- **A minimal Today agenda lands here**, because a digest has to open somewhere true and the kit's Today is a feature of its own. The design's "No Due sheet" stands: this is not a sheet, and a forward look stays the rail's.
- **Expo Push carries the words**, as `stack.md` chose; the page changes and the notice is a count run at ship time.
- **An event, a repeating reminder and a calendar-backed row in a one-thing digest get no verbs.** Since 2026-10-10 a calendar-backed row in a digest is a dumped event, and a send naming a calendar's event gets none either.
- **No pronoun in the request body.** "Answer in My people." where the design wrote "Answer on her card in My people."
- **The evening switch is called Tomorrow**, as its title is; the channel id stays `coming_tomorrow`.
- **The page sits in Reaching you**, where the kit put Communication.
- **Android's channel state is mirrored into the account switch** on the page's open, so the record never says sent about a send the system dropped.
- **An account with no token is not sent by permission**, which includes a web-only account, and the amber row's door is the Notifications page.
- **A quiet morning is not recorded.** Only a digest that had something to say is.
- **The bell's dot and the gear's dot own different things.** A request is the gear's; everything else is the bell's.
- **Activity's writers are the code that decides the silence**: the digest job, `people.daily` for expiries, `edit_content` for a moved date; the calendar lapse and the closed question wait.
- **A push token is one row, unique, re-bound to the registering session, deleted by the server on sign-out, and gone with its session however that session ends** (amended 2026-10-11).
- **The payload carries a kind and ids, and the app navigates from a table.**
- **Activity is a pushed screen on the phones**, without the plate, as Settings is.

### Logged in `docs/tech/decisions.md` at merge

- Notifications: two digests gated on `is_reminder`, no per-item push, Expo Push with the words, and the token binding rule.
- Activity reverses 022's refusal of a notifications page, and why it survives the argument.
- 022's dot rule amended: the gear owns a request, the bell owns the record.

### Design system impact, to log in `decisions.md`

- Activity is a pushed screen on the phones rather than the kit's roll-down `NotificationSheet`, and the kit's `NotifRow` gives way to the exploration's lead-and-tag row, with the hollow lead on `--border-lift` and the tag in sentence case.
- The kit's Communication settings page is replaced by Notifications in the same group, with its quiet hours, email, push and weekly summary dropped, and the evening switch reads Tomorrow.
- The web sidebar's Activity item is alive and carries the dot; the phones' bell becomes a control.
- Today's three groups reuse the thread page's row rather than the kit's `PriorityRow`, and Today becomes a fetched screen.
- The request body carries no pronoun; the share body does not repeat the thread's name; no line carries the retired noun; group labels and the tag are sentence case.
- The readme's Activity list names a declined request, which nothing writes; the line waits for a decline.
- An event in a one-thing digest carries no Done, where the apply note gives every one-thing digest two verbs.

## Amended 2026-10-10: the calendar in the morning

Decided by the owner on 2026-10-10. The morning is where the day is laid out, and the day already holds the calendar's events on Today; the morning message now says them too.

- **The morning names today's events** on the account's own ticked calendars, its own part of them only (what it created or was invited to), at their hours, beside the dates and reminders, all-day first and then by the hour, counted in the title like any row. Only the morning: the evening never names them, and no event ever gets a notification of its own. A send that names one carries no verbs.
- **Calendar** is a switch of its own on the Notifications page, between Reminders and People, one row "Today's events" with the line "Today's events on the calendars you connected, in the morning message.", on by default. The events follow that switch alone, as 042 made each switch hold back only its own rows: Due today off with Calendar on still sends them; Calendar off and they are not there at all. The morning hour is in use while any of Due today, Reminders or Calendar is on. On Android the switch mirrors `due_today`, the channel the morning message rides.
- **Named once.** An event offload wrote to a calendar from a row is skipped as a calendar event when that row is named in the same send, and otherwise named by its calendar copy.
- **Whose words decides.** A row a person dumped keeps being announced, and keeps 042's reminders, after offload writes it to a calendar. A calendar's own row is still never announced or reminded about.
- **The titles leave with the calendar.** A record in Activity that named a calendar's events goes when that calendar is disconnected or unticked, because the privacy page says what a connected calendar gave offload is deleted on disconnect.
- **The privacy page**, changed with the owner's approval: section 7 adds "to name the day's events in your morning notification" to the uses of calendar data, and section 14 says notifications may carry "the titles of the day's events on a calendar you connected, which somebody who invited you may have written".
