# 027 Today, tasks

Every task starts with its failing test, run and seen red for the reason the task exists, then the code (QUAL-1). A task is done when its test is green and nothing else is red. Three tracks after the foundation, API, Mobile and Web; the feature closes when all three pass.

## 0. Setup

- [~] **T0.1** Worktree `today` via `.claude/scripts/new-worktree.sh today`, its own database, launch entries that cd into it. The design sync (`design/today-sync`, `c732573`) is merged to `main` first; nothing under `.claude/skills/offload-design/`, `docs/tech/` or `docs/constitution/` is edited in the worktree. *(process)*
- [x] **T0.2** Before any code: the product owner has seen the feature spec's privacy paragraph (the event link kept on the event's row, no line changing). *(CLAUDE.md, OFF-4)*
- [x] **T0.3** Confirm the installed development builds include `expo-network`; if not, an EAS build for both phones is queued before part 4 is tried on a device. *(AC-29)*

## 1. Server

### Foundation

- [x] **T1.1** Migration `0064_today.sql` as the impl-spec writes it. Tests: `today_put_offs` refuses a card outside the closed shape and cascades with the account; `connector_events.link` refuses `http:`, `javascript:` and a non-Google host; every `connector_calendars.sync_token` is null after it. *(AC-12, AC-19, DATA-1)*
- [x] **T1.2** The sync reads `htmlLink`. Tests in `calendar-events.test.ts`: an event carrying a Google `htmlLink` stores it; one carrying another host, another scheme or none stores null; the key read from Google's item is asserted against the field the client library declares. *(AC-19, SEC-1)*
- [x] **T1.3** `today/layout.ts`: `todayLayout` and `resolveLayout`. Tests: the default; a stored document missing a kind gets it at its default; unknown kind, repeated kind, a missing part, more than two sections and everything off are refused; extra properties are refused; an unparseable stored value resolves to the defaults. *(AC-27, AC-28)*
- [x] **T1.4** `/api/me` gains `todayLayout`. Tests: `GET` returns the resolved document; `PATCH` stores only the parsed value and refuses `bad_layout`; two writes, last wins. *(AC-27, AC-28)*

### The day

- [x] **T1.5** `today/day.ts` events. Tests, each red first: events of a ticked calendar on the day appear, all-day first then by start; an un-ticked calendar's do not; **a calendar another member picked for a shared thread the person is in does not** (written first, against a stub that would have reused `threadEvents`); a three-day event appears on each of its days; an offload `event` row appears with its thread, and with `authorName` when another member filed it; an offload row and its calendar twin with the same `source_ref` appear once, as the row; the day is the account's zone's day; past 30, `eventCount` counts all. *(AC-16, AC-17, AC-18, OFF-3)*
- [x] **T1.6** `today/day.ts` to-dos. Tests: timed rows by the hour; bare-dated rows by their UTC date in any zone; a repeating row on its rule's day and never late; late only when the date is today, oldest first, capped at 100 with `lateMore`; the rest capped at 100 with `restMore`; notes excluded; done, archived and deleted rows excluded; a thread the person left excluded. *(AC-20)*
- [x] **T1.7** `today/picks.ts`. Tests: three at most, oldest first; another member's row is never picked; dated, repeating, done and archived rows never are; a thread with nothing due in seven days contributes none, one with a row due on the seventh day does; a row with a live `pick:` put-off is skipped. *(AC-22)*
- [x] **T1.8** `GET /v1/today/day`. Tests: `bad_date` before today and past 365 days; late and picks only on today; `everDumped` and `threadLabels` as 024; unauthenticated is 401. *(AC-14, AC-24, AC-25)*
- [x] **T1.9** `POST` and `DELETE /v1/today/picks/:contentId`. Tests: POST gives the row today as a bare day through 023's path and returns it; POST on another member's row, a dated row, a repeating row and a row in a thread the person is not in is `404`; DELETE clears the date and writes `pick:` until tomorrow; DELETE after the date moved is `409`; the next day read leaves the row out of the picks. *(AC-23, SEC-2, OFF-6)*

### Needs you

- [x] **T1.10** `today/needs.ts`. Tests per source: a `needs_reauth` connection is a card, an active one missing only the ACL scope is not, `email` only with two connections; requests and invitations for the account and never another's; an open `date` question is a card with its thread, a `person`, `calendar` or `country` one is not, one `derived_from_untrusted` is not unless its message is `source = 'mail'`, which carries `fromEmail`; the tip appears only with `mailAvailable`, a dumped row, no mail message and no `tip:forwarding`; a card with a live put-off is absent; a part the layout has off is not queried; cards come in the kinds' order and oldest first. *(AC-4, AC-5, AC-8, AC-9, AC-10, AC-13)*
- [x] **T1.11** `POST /v1/today/put-off`. Tests: a live card of the account is put off until the start of tomorrow in its zone; another account's question, request, invitation or connection id answers `404`, the same as a missing id and a settled one; `forGood` only for an invitation and the tip; a malformed card is `400`; GET is not a route. *(AC-12, AC-13, SEC-2)*
- [x] **T1.12** The nightly sweep deletes put-offs whose `until` passed more than a day ago and leaves *for good* rows. *(volume)*
- [x] **T1.13** The evening digest's push data carries `day`, the date it named, and nothing else new. Test in `digest.test.ts`. *(AC-15, OFF-1)*
- [x] **T1.14** `GET /v1/today` is unchanged: its existing tests stay green untouched, and a comment names 027 and the condition to remove it. *(AC-3)*
- [x] **T1.15** OFF-1 guard: inject a sentinel title, thread name, question and link into the day and needs reads and every Today write's error path; assert none appears in a captured log line, an error body other than the person's own response, or an analytics call. *(AC-32, OFF-1)*

## 2. Shared logic, `packages/widgets`

- [x] **T2.1** `dayName`. Tests: Today, Tomorrow with its full date, weekday names to the end of a Monday week and of a Sunday week, *Next* names for the week after, then *Wed 15 Oct* with no sub-line; Saturday's Monday is *Next Monday* with a Monday week. *(AC-14)*
- [x] **T2.2** `countdown` and `nextEvent`. Tests: *in 45m*, *in 1h 30m*, *in 2h*, *until 12:30* while running, *at 10:00* on another day; all-day and `mine: false` events are never chosen; nothing once every timed event has ended. *(AC-16)*
- [x] **T2.3** `nothingLine`. Tests for each name shape. *(AC-24)*
- [x] **T2.4** `retryDelay`. Tests: about 2, 4, 8, then 15 seconds, each within its jitter bounds, never zero. *(AC-29)*

## 3. The clients' Today

### Both

- [x] **T3.1** `sliders-horizontal` vendored on both clients: the web icon file and the phones' generator. Tests: `dead-icons.mjs` red on a reference before it is vendored; the generator reads all nine of its `line`s. *(AC-1, AC-33)*
- [x] **T3.2** The thread pill, one component per client at 24 and 30. Tests: the turn footer renders it at 30 and Today at 24; a tap opens the thread; inside a row the web pill is its own focusable control and the phone row exposes *Open* and the thread as an accessibility action. *(AC-26)*

### Mobile

- [x] **T3.3** `lib/today.ts`: reads, writes and types. Tests against a fake fetch: the day read's query, the put-off body, the picks POST and DELETE, the layout through `useMe`. *(AC-14, AC-23, AC-27)*
- [x] **T3.4** Device cards. Tests: `useZoneCard` holds 023's condition exactly and its two writes, and `ZoneStrip` is gone; `useNotificationsCard` appears with the permission off and a switch on, not with every switch off, re-checks on `AppState` active, and its put-off is local; both are absent when the `account` part is off. *(AC-6, AC-7, AC-12)*
- [x] **T3.5** `NeedsYou`. Tests: kind order with device cards first; *N of M* counted on the device; one sliver at two and two at three; a question renders `QuickReplies` with no filled option and the clock on *Not that*'s line; Accept, Not now and Add it call 022's routes and an invitation's Not now puts off for good; a failed action puts the card back with that action's own line; the next card ignores presses for 300ms; the swipe and the clock put off. *(AC-4 to AC-12)*
- [x] **T3.6** ~~`DayStepper` and the day swipe~~ (replaced by the month, T9). `DayStepper` and the day swipe. Tests: back disabled on Today, forward disabled at 365 days; the tab press's `todayReset` and focus from another tab return to Today; `?day=` opens that day once; a row's swipe and the strip's scroll are not taken by the day swipe. *(AC-14, AC-15)*
- [x] **T3.7** `NextLine` and `EventsStrip`. Tests: the line from `nextEvent`, ticking each minute only while active; cards in order, past titles in `--text-secondary`, the next raised, *Ana's* on another member's event; a calendar event with a link calls `openLink`, without one is not pressable; an offload event opens its thread. *(AC-16, AC-17, AC-19)*
- [x] **T3.8** `TodoCard` and `Picks` on `useTodayRows`. Tests: late folds past three and opens in place; the rest folds past a hundred; rows carry the thread pill and labels and the row sheet has its Labels panel; + Today moves the row and toasts *Added to today* with Undo, and Undo calls DELETE. *(AC-20, AC-21, AC-22, AC-23)*
- [x] **T3.9** Empty and failure states. Tests: never dumped draws the invitation; an empty day draws its *Nothing* line; a failed day draws *Couldn't load this day* and Try again; a failed Needs you leaves the day drawn; a day within a quarter second shows no spinner. *(AC-2, AC-24, AC-25)*
- [x] **T3.10** `CustomizeSheet`. Tests: Needs you with four kind switches and no switch of its own, Your day with one; the last switch on is disabled; Reset; a switch is one `PATCH`; a drag is one `PATCH` on release; *Move up* and *Move down* accessibility actions reorder; a failed write puts the sheet back with *Couldn't save that*. *(AC-27)*
- [x] **T3.11** The app bar draws `sliders-horizontal` named *Customize Today* before the bell on Today and on no other tab. *(AC-1)*
- [x] **T3.12** Activity's `doorOf` and the notification's `routeFor` open an evening digest on its day, past days on Today. Tests in `notifications.test.ts`. *(AC-15)*
- [~] **T3.13** Android: radius 16, `a-c-low` grounds, `a-on` filled action, 32px pills with an 8px radius, the Material switch, `a-outline` hairlines, ripples. Checked on a device in both themes. *(feature spec, On Android)*

### Web

- [x] **T3.14** `lib/today.ts` and the rewritten `panes/Today.tsx` on `components/today/`. Tests in `apps/web/test/today.test.tsx`: the sections in the layout's order; the web's zone card says *This browser says*; no notifications card; the crumb keeps today's date on another day; each event card with a link is an `<a>` with `noreferrer noopener`, without one is not interactive. *(AC-1, AC-6, AC-7, AC-17, AC-19)*
- [x] **T3.15** Needs you, the stepper, To do, the picks and the empty and failure states on the web, the same tests as T3.5 to T3.9 less the gestures. *(AC-2, AC-4 to AC-25)*
- [x] **T3.16** Customize Today as the second pane: Today's pane at 520px beside it; the arrow keys on a focused grip move a section; the rest as T3.10. *(AC-27)*
- [x] **T3.17** Activity's door for an evening digest opens its day. *(AC-15)*
- [x] **T3.18** `dead-classes.mjs` and `dead-css.mjs` pass on every new module. *(AC-33)*

## 4. Launch, the tabs, the scrim

- [x] **T4.1 Mobile launch.** Tests in `launch.test.ts`: offline shows *You're offline* and retries on the reachability event; no answer shows *offload isn't answering*, *Trying again.* and retries on `retryDelay`, honours `Retry-After`, and pauses while backgrounded; neither uses the danger colour. *(AC-29)*
- [x] **T4.2 Web launch.** Tests for `Unanswered`: the two states from `navigator.onLine`, the schedule, the pause while hidden. *(AC-29)*
- [x] **T4.3 The tabs.** Test the worklet's opacity function: 1 at rest, 0 from 60pt of keyboard, the minimum with the sheet's fade; and that full fade sets `pointerEvents` none and hides it from the screen reader. Then wire `Shell.tsx`. Checked on both phones. *(AC-30)*
- [x] **T4.4 The scrim.** Test in `colors.test.ts` that the generated scrim alpha is 0.35 light and 0.55 dark from `tokens/colors.css`, and that the generator fails without it; then `SCRIM_OPACITY` and `DragSheet` read it. *(AC-31)*

## 5. Closing

- [~] **T5.1** Device pass on both phones and the web, both themes, the largest type size and reduced motion: Needs you, the strip, the swipe against a row's swipe, the Google Calendar hand-off with and without the app, the keyboard fade, the turn footer's pill beside a label mark. Screenshots attached to the PR. *(AC-33, readme)*
- [~] **T5.2** `decisions.md` in the design system: the **Today as built** entry the feature spec lists, with its Design system impact, on `main` after merge. *(OFF-7)*
- [x] **T5.3** `at-merge.md`: what was built differently and the dated amendment lines for 023's strip, 024's AC-22 and 019's AC-10. *(DEV-2)*
- [x] **T5.4** Remove the old Today's dead code on both clients (`TodayAgenda.tsx`'s three groups, `lib/agenda.ts`'s `groupsOf`, the web's group builder), with `dead-classes` and `dead-css` green. *(DEV-1)*

## 6. Amended 2026-10-01: whose an event is

- [x] **T6.1** `whoseOf` and the two columns: tests for the creator's address, the primary calendar's `creator.self`, a guest who accepted, has not answered and declined, and an unread event. *(AC-34)*
- [x] **T6.2** The day read keeps the account's own events and names the calendar. *(AC-34, AC-35)*
- [x] **T6.3** The thread's events carry `involved`, false for another member's calendar. *(AC-36)*
- [x] **T6.4** `eventMeta` and both timelines draw it. *(AC-36)*
- [x] **T6.5** `find_events` carries `yours`; the description says to keep them apart; eval cases added. Running them is a separate ask. *(AC-37)*
- [x] **T6.6** Nothing about guests kept, the stored lists emptied, settled proposals deleted by the daily purge, the privacy page says so. *(AC-38)*

## Amended 2026-10-07: open in your threads

- [x] **T7.1** `today/threads.ts` and `GET /v1/today/threads`, red first: a page per thread with open undated to-dos, oldest thread first, four rows oldest first with the count; done, archived, deleted, non-task rows and unread threads left out; another member's to-do in a shared thread taken, its people named; twelve pages at most; Not in a thread last with `inMind` and `holds`, absent with no undated to-do; nothing when the layout has it off; 401. The day's `picks` always empty and + Today's route gone. *(AC-22, AC-28)*
- [x] **T7.2** The layout's `open_threads`: the default after the day, a stored layout without it gets it after the day wherever the day is, refused twice; `/api/me`'s `todayLayout` without it and `todayLayoutV2` whole. *(AC-27, AC-28)*
- [x] **T7.3** `@offload/widgets` `open-threads.ts`: `openFor`, `inMindLine`, `holdsLine`, `keepInPlace`. *(AC-23)*
- [x] **T7.4** Web: the section after To do, two up with the chevrons, people, ages, N more, Open thread, Not in a thread's line and Sort them, the tick with Undo kept in place through a re-read, the row sheet, nothing on another day, with nothing open or switched off; Customize's third row; no page title. *(AC-22, AC-23, AC-27)*
- [x] **T7.5** Phones: the pages with the peek, the snap and the dots, the tick, the row sheet, Customize's third row, the edge in dark. *(AC-22, AC-23, AC-27)*

## Amended 2026-10-15: Answer

- [x] **T8.1** `POST /v1/questions/:id/resume`, red first (`today-answer.test.ts`): the conversation that asked becomes current with its question; the next dump's job carries `openQuestionId` and the question stays open; the live conversation ends and its question closes; a settled question or another account's is `404` and changes nothing; a question pointing at another account's conversation is `404` and that conversation is untouched; a `thread` question is `404`. *(AC-39)*
- [x] **T8.2** Web, red first: *Answer* and *Dismiss* in one row with the clock only when no option is a value, Dismiss answers the plain option, it posts the resume and dispatches `RESUME_COMPOSER` with the card kept, a `404` lets the card go (`today.test.tsx`); the composer loads the conversation that asked and holds its invitation, focused (`composer-resume.test.tsx`). Checked in the browser on a local account. *(AC-9, AC-39)*
- [x] **T8.3** Phones, red first (`today.test.ts`): `resumeQuestion`'s three outcomes, `typedOnly`, and the card's Answer and Dismiss and the context wired. *(AC-39)*
- [ ] **T8.4** Device pass on both phones: the sheet opens on the conversation that asked with the invitation and the keyboard up. *(AC-39)*

## Amended 2026-10-18: the month

- [x] **T9.1** `readMonth` and `GET /v1/today/month`, red first (`today-month.test.ts`): counts per day of to-dos, offload events and ticked calendar events; a repeating to-do on each day its rule lands; another member's picked calendar never counted; agrees with the day read on every day it covers; nothing before today; `400` on a bad, backwards or long window; `401`. *(AC-14)*
- [x] **T9.2** `@offload/widgets` `monthDated`, red first. *(AC-14)*
- [x] **T9.3** Web: `MonthGrid` lifted out of the thread's `Timeline` and drawn on Today in place of `DayStepper`, its head naming the picked day (`dayTitle`), nothing under it; past and past-the-edge days closed, the arrows' ends, Today back, the month read for the grid's window (`today.test.tsx`, red first). *(AC-14, AC-15)*
- [x] **T9.4** Phones: the same, `shell/MonthGrid.tsx` from `shell/Timeline.tsx`, its head as a header, the day swipe gone (`today-month.test.ts`, red first). *(AC-14, AC-15)*
- [x] **T9.5** Checked on the web, the iOS simulator and the Pixel on a local account.
