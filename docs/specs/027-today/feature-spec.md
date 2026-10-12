# 027 Today

**Status:** drafted 2026-10-01 against the design handoff of the same day (`handoff/APPLY-2026-10-01-today.md`, `explorations/today.html`, `explorations/finishing.html`, the readme's **Today** section, `ui_kits/mobile_app/TodayParts.jsx`), synced into `.claude/skills/offload-design/` at `c732573` on `design/today-sync`; revised the same day with the product owner's two rounds of answers and the project-lead, client and security reviews
**Surfaces:** iOS, Android, web and the Core API. Today itself makes no model call; the one answer that would start a turn is not offered on it.
**Depends on:** 012 and 019, whose approved calendars and `connector_events` the day reads; 018, whose questions Needs you asks; 022, whose requests and invitations Needs you carries; 023, whose zone, rule, chip, write path and strip this reads and moves; 024, whose digest door and Activity rows open Today; 025, whose marks line the rows draw; 026, whose address the tip names
**Amended 2026-10-07** by the design handoff `handoff/APPLY-2026-10-07-open-threads.md`: *If you have time* and + Today are replaced by **Open in your threads**, Customize Today gains a third section, and the web's Today loses its page title (the owner's ask: the stepper already says Today).
**Amended by 042 (2026-10-10):** Customize Today gains a fourth section, **Reminders**, under Your day and above Open in your threads by default, which holds what offload is reminding the person about once its reminders have begun. `/api/me` carries it in `todayLayoutV3`; `todayLayoutV2` keeps the three sections phones that know Open in your threads can draw. See `042-reminders/feature-spec.md`.
**Amends:** 024's **Today, the agenda** and its AC-22, replaced on the new clients while 024's read keeps serving phones already installed; 023's **strip**, which becomes a Needs you card; 019's AC-10, whose drawing this does; the readme's launch line, replaced by two states; `TurnFooter`'s thread link, which becomes the shared thread pill

## Why

Today is the first tab, and it is a placeholder: 024 built three groups of rows, Overdue, Today and Tomorrow, so the digest had somewhere to open. It does not say what the day holds. The calendars a person ticked in 019 are not on it at all, a request or an invitation waits on a page somebody has to go and find, and a calendar that stopped syncing is only visible on a Settings page nobody visits.

The design decided on 1 October says what Today is for: **what to expect and what to do**, across every thread. Interruptions that need the person sit on top and are not drawn when there are none, which is most days. Under them is the day, one at a time: what is next, where you will be, what to do, and what you could do if you have time. It is not a calendar; events are context.

## What

### Vocabulary

**Today** is the tab and the screen. **Needs you** is the stack of **cards** on top, in four **kinds**: account issues, people, questions and tips. A card is **settled** by one of its actions, or **put off** until tomorrow. **The day** is everything under Needs you for the day shown: the **stepper**, the **next line**, **Where you will be** (the **events strip**), **To do** and **If you have time** (the **picks**, and the **+ Today** pill). **Customize Today** is the sheet and the **layout** is what it stores. A **thread pill** is the conversation's moss chip, now one component. In schema and code a to-do is still a `content` row; a calendar's event is a `connector_events` row; an event offload filed is a `content` row of type `event`. Nothing a person reads says inbox, feed, agenda, item, task or snooze.

### The page

Under the app bar, in the layout's order, each drawn only when it holds something: **Needs you**, then **the day**. No heading over Needs you, no date row, no See all. The composer stays where it always is. The app bar on Today draws `sliders-horizontal` before the bell, named *Customize Today*; no other tab draws it. Needs you does not change with the day shown and is read once per load, not per day.

### Needs you

**Interruptions only.** Cards come in the kinds' order, and within a kind as listed, oldest first:

| Kind | Card | When | Kind line | Title | Line | Actions |
| --- | --- | --- | --- | --- | --- | --- |
| Account issues | Calendar | A connected Google account is `needs_reauth`. A connection missing only the sharing-list scope still syncs and is not a card | `cloud-off` *Calendar* | *Google Calendar stopped syncing* | *Sign in again to see its events here.* With more than one account connected, the account's address. | **Reconnect**, the same sign-in Settings opens |
| | Time zone | 023's strip condition, unchanged and computed on the device: its zone differs from `time_zone`, `follow_device` is on, and its zone is not `kept_time_zone` | `compass` *Time zone* | *This phone says Tokyo* (*This browser says* on the web) | *Showing times in Lisbon.* | **Use Tokyo**, **Keep Lisbon**, 023's writes. No clock: Keep is 023's once-per-zone answer |
| | Notifications | Phones only: the system permission is off and at least one of 024's switches is on. Checked again whenever the app comes back to the front | `bell` *Notifications* | *Notifications are off* | *Reminders can't reach this phone.* | **Turn on**, asking for the permission when the phone can still ask, and opening the system settings for offload only when it cannot (iOS shows no Notifications row until an app has asked once) |
| People | Connection request | 022's request waiting for this account | `users` *Waiting 2 days* once a day has passed, *Wants to connect* before | *Ana Duarte wants to connect*, the name as 022's request row draws it | none: a request carries nothing else, so the kit's *Shares Europe, October with you* has no source | **Accept**; **Not now**, 022's dismiss |
| | Invitation | 022's pending invitation to a thread | `users`, as above, *Shared a thread* before | *Ana Duarte shared Europe, October* | 022's preview line | **Add it to my threads**; **Not now**, which takes it out of Needs you for good and leaves it on My threads' strip, as 022 |
| Questions | Question | 018's open question for this account whose answer stays inside offload and starts no turn: a `date`, `span`, `time` or `thread` question. One raised from somebody else's words is shown only when it came from a forwarded email | `message-circle` *offload asked*, or *About an email* | the question's text | the thread it is about, as a pill | the options and *Not that*, as `QuickReplies` |
| Tips | Forwarding | The account's sign-in address can send mail (026's `mailAvailable`), the account has dumped something, has never had an email accepted, and has not pressed Got it | `mail` *Tip* | *Forward emails to offload* | *Send them to over@to.offload.club from jo@hey.com.* | **Copy address**, toast *Copied*; **Got it**, never again |

**Not in it.** Late to-dos are in To do. A filed or failed email stays in Activity. A share or calendar write offload proposed, and a `person`, `calendar` or `country` question, stay in the conversation that asked, where offload says who will find out and where a follow-up turn has somewhere to land. A question raised from a calendar's or a web page's words stays there too.

**A question lives as long as 018 says**: open until the person's next turn closes it. Today shows it while it is open and drops it silently once it closes. It is the forwarded email's question, asked at a moment nobody had the conversation open, that this is for.

**The card.** One shows with the rest stacked under it: one sliver when two wait, two when three or more do. The glyph and the kind line at 12px medium in the kind's colour, with *N of M* at the right in `--text-tertiary`; the title at 17px semibold, up to two lines, three when there is no context line; one line of context at 13.5px, ellipsised; then the actions. **Kind colours** are aliases: account issues `--text-danger`, people and questions `--text-attention`, tips `--text-accent`. A blue card carries a moss thread pill in its line, as the kit draws it; that is the readme's one stated exception to the two accents never sharing a row. Radius 18, 16 on Android.

**Actions.** On every card but a question, pills at 34px, the first filled ink, then a `clock` button at the right named *Tomorrow*. **A question card is `QuickReplies`**: up to four options as outline pills, none of them filled, because a filled one would say offload recommends it; *Not that* alone on the last line with its `x`, and the clock at the right of that line. The group's accessible name is the question, verbatim.

**Settling.** Each action does exactly what it does where it already lives, through the same route, with its own Undo or none and its own failure words: Accept is 022's accept, an option is 018's answer, Reconnect is 019's sign-in. The card goes as the action is drawn and the next comes up; **the next card's actions take no tap for 300ms after it arrives**, so a second tap meant for the first card cannot land on it. A write that fails puts the card back with the action's own failure line and Try again. Settling a card anywhere else takes it off Today on the next load.

**Putting off.** The clock and a sideways swipe of the card on the phones mean one thing: the card leaves until the start of the next day in the account's zone, and the next card comes up. Account and people and question and tip cards are put off for the account, on every device. The notifications card is put off on that phone only, since it is a fact about that phone. Nothing else is put off: a question that closes, a request that is withdrawn and a tip that is dismissed are gone.

**Which kinds show is the person's**, in Customize Today below. When Needs you holds nothing it is not drawn, and nothing takes its place.

### The day

#### The stepper

Chevron buttons, 40px round on `--surface-fill` with a 44px target, named *Previous day* and *Next day*, either side of the day's name at 20px semibold. **Names:** *Today*, *Tomorrow*, then weekday names to the last day of the week, then *Next* and the weekday for each day of the week after, then the date, *Wed 15 Oct*. The week is the person's *Starts on* (023), which is a device preference, so a phone and the web can name the same day differently. Under *Tomorrow* the full date at 13px, *Wednesday 1 October*; under a weekday or a *Next* name the date, *2 October*; nothing under Today or a date name. The back chevron is disabled on Today; **the forward chevron is disabled twelve months ahead**, the edge of what offload keeps of a calendar. On the phones a horizontal swipe across the day's background or the stepper moves one day either way; a row's swipe, the events strip's scroll and a card's swipe win over it inside their own bounds.

**Where it opens.** On Today at launch, when Today is chosen from another tab, and when its tab is tapped while it is showing. **A notification or an Activity row may open it on a day**: 024's *Tomorrow* digest and its Activity row open Tomorrow, every other door opens Today. The day shown is never stored. When midnight passes in the account's zone with Today showing, the client reads the new day.

#### The next line

One line at 20px semibold, computed on the client from the day already read. On Today: the next timed event of the person's own, from their calendars or filed by them, that has not ended: its title and then, in `--text-attention`, *in 1h 30m*, *in 45m*, *in 2h*, or *until 12:30* while it is happening, moving each minute while the app is in front. On another day: their first timed event and *at 10:00*. All-day events, and events another member filed, are never the next line. No line when nothing qualifies.

#### Where you will be

The header *Where you will be* at 15px semibold with the count, then the day's events as cards 128px wide and as tall as their words, in a row that scrolls sideways past the gutter: the time range at 12px semibold, *9:00 to 9:30* or *All day*, all-day first and the rest by start; the title at 14px, two lines; under it the calendar as plain text, *Google, Work*, or the thread as a pill. **An event another member filed** carries their name above its pill, *Ana's*, at 12px `--text-tertiary`. **Past events** draw their title in `--text-secondary` and the rest unchanged, rather than the kit's 50%, which would take the calendar's name below legible; the next line's event is raised on `--surface-raised` with `--shadow-2`. Radius 14 on iOS and the web, 16 on Android.

**Which events.** Every calendar the account has ticked in Settings, and every `event` row in a thread the person is in, whoever filed it. Never a calendar another member picked for a shared thread. A day is the account's zone's day; an event spanning several days, a hotel stay or a conference, is on every day it covers. An event offload wrote to a calendar is drawn once, as the row, matched by its calendar reference and never by title. The strip draws a day's first thirty and the header counts them all.

**A tap.** A calendar's event opens in Google Calendar: the event's own link, kept from Google, is handed to the phone or the browser, which opens the app when it is installed and the web otherwise. An event whose link has not been read yet is not a button. An offload event opens its thread. Nothing on Today edits an event.

#### To do

The header *To do* with the count, then the thread page's own rows in one card, `--surface-fill` with `--radius-lg` (`a-c-low` and 16 on Android), in this order:

1. **Late**, on Today only: every row whose day has passed, oldest first, 024's reach of thirty days and its cap of a hundred. Each carries 023's late chip, *Due 5 days ago*. Past three, the rest fold into one row, *3 more late*, which opens them in place.
2. **With a time**, by the hour, carrying a `clock` chip with the hour.
3. **The rest due that day**, oldest first, with no date chip; past a hundred, *N more* opens the rest in place.

A repeating row is on the days its rule lands and never late, as 024. Notes are never here. Each row carries its thread pill and 025's labels on its marks line, and acts in place exactly as it does on the thread page: the tick, the row sheet with When, Repeats and Labels, the action sheet, a swipe to delete on the phones, and the eight-second Undo on each.

#### Open in your threads

**Amended 2026-10-07; replaces *If you have time*.** ~~**Today only.** The header *If you have time* with *picked by offload* at the right, 12.5px `--text-tertiary`. Up to three rows, **picked by the server by one rule** that is not a setting: open to-dos with no date and no rule, **filed by this person**, in a thread that has a dated row due between today and seven days from now, oldest first, never one the person took off with + Today's Undo that day. Each is the thread page's row with a **+ Today** pill at its trailing edge, 28px drawn and a 44px target, named *Add* and the row's title *to today*. **+ Today gives the row today, as a day with no hour**; the server checks the same rule again before it writes, so nothing but the person's own open, undated row can be dated this way. The row moves into To do and the toast reads *Added to today* with Undo. Undo clears the date, and that row is not picked again until tomorrow; the next pick takes its place.~~

**Today only**, after To do, and not drawn when no thread holds an open to-do with no date, nor in place of the day-one invitation. The head *Open in your threads* and the count of the to-dos the pages hold. **A page per thread** that holds open to-dos with no date, every one the person reads, whoever filed it. **The server's rule, not a setting**: the thread whose oldest such to-do is oldest comes first, at most twelve thread pages, and **Not in a thread** last, only when it holds one. On the phones the pages scroll sideways past the gutter, each the width less 32 with 8 between so the next peeks, snapping to a page start, with a dot per page under them past one. The web shows two side by side, stepped by two with chevrons at the head's right, each disabled at its end. A set takes its tallest page's height and each foot sits at the bottom; in dark every page draws `--edge-well`.

A page: the thread's own icon (037), its name and the people sharing it as 22px initial discs, which open the thread; up to four to-dos in the thread page's own order (*amended 2026-10-12: by priority then newest first, where it was oldest first; the pages come in My threads' order, last activity first, where the thread with the oldest open to-do came first*), each with how long it has been open (*Today*, *9 days*, *3 weeks*, *2 months*); then *N more* past four and *Open thread*. A row opens the row sheet. **A tick strikes the row through in place** with *Ticked off* and Undo; the row leaves the page the next time Today is built (a step away and back, a return to the tab), not while it is open, and no page moves or recounts meanwhile. Not in a thread draws `inbox`, no people, *offload has a thread in mind for one of these.* when a suggestion stands on one of its drawn to-dos, what else it holds by kind (*6 notes and links*) and *Sort them*, which opens Not in a thread. The design's first sentence of the thread's read is not drawn: nothing writes a thread's standing read yet, and the thread page draws nothing in its place either. No model call.

#### An empty day

Empty sections are not drawn, and there is no line for tomorrow. **An account that has never dumped anything** sees the day-one invitation in place of the day, as 024 built it, with Needs you above it. **Otherwise a day with no event and no to-do** draws the stepper and one quiet line in `--text-secondary`: *Nothing today.*, *Nothing tomorrow.*, *Nothing on Thursday.*, *Nothing next Monday.*, *Nothing on Wed 15 Oct.*

### Thread pills

Every thread named on Today, in a card's line, an event card and a row's marks line, is the conversation's thread pill: `--surface-accent-soft` ground, `--text-accent`, `lasso` at 13px, 12.5px medium, 24px tall on a marks line and an event card, 30px in the turn footer, where every mark is 30. It opens the thread. A label mark follows it on a row. A calendar's name is plain text. The pill is one component on each client, used by the turn footer and by Today. Inside a row that is itself a button it is a separate control on the web and an accessibility action named *Open* and the thread on the phones. Both clients' rows take the pill through a prop of its own, as 025 did for labels, never through the text `meta` slot.

### Customize Today

`sliders-horizontal` opens a sheet on the phones and a right-hand pane on the web: *Customize Today*, *Drag to reorder. Switch off to hide.*, then:

- **Needs you**, with a grip and no switch of its own, and under it its four kinds, each with a name, a line and a switch: **Account issues**, *Calendar, time zone, notifications*; **People**, *Requests and shared threads*; **Questions**, *What offload asked you*; **Tips**, *Ways to use offload*. All on.
- **Your day**, with a grip, *Events and to-dos, a day at a time*, and a switch, on.
- **Open in your threads** (amended 2026-10-07), with a grip, *To-dos with no date, a thread at a time*, and a switch, on.

Then **Reset** and **Done**. The sections drag to reorder; the kinds keep their order. A drag or a switch applies at once, Today behind it changing, and is written as it settles, one write per gesture; a write that fails puts the sheet back with *Couldn't save that* and Try again. Reset returns the defaults. **The last switch on cannot be switched off**: it is drawn disabled, so Today is never blank. The grip is named *Move Needs you* and *Move Your day*, with *Move up* and *Move down* as accessibility actions on the phones and the arrow keys on a focused grip on the web. Done and a drag of the sheet close it.

**The layout is one small document per account**, the same on every device, last write wins:

```json
{ "version": 1, "sections": [
  { "kind": "needs_you", "parts": [
    { "kind": "account", "on": true }, { "kind": "people", "on": true },
    { "kind": "questions", "on": true }, { "kind": "tips", "on": true } ] },
  { "kind": "day", "on": true },
  { "kind": "open_threads", "on": true } ] }
```

A stored layout that does not name `open_threads` gets it straight after the day, on, wherever the day was moved to. **Phones built before it draw every section that is not Needs you as the day**, so `/api/me` keeps `todayLayout` without it for them and carries the whole document as `todayLayoutV2`; both clients of this change read the second. A layout written by such a phone comes back with open in your threads on.

The server reads it when it builds Today, so a part or section switched off costs nothing to build. The device-only cards follow the Account issues switch. **The kinds are a closed set that grows**: a new kind ships with a default place and switch, and a stored layout that does not name it gets it there. `version` is the document's shape, not a check against a concurrent write. **What moved**, the design's third section, is the first new kind and is not in this spec. What a kind holds is the server's rule, never part of the layout.

### Launch when nothing answers

Replaces the single *That didn't go through.* line, on the phones' launch and the web's `Unanswered`:

- **No network**: *You're offline*, *offload picks up when you're back.* It retries when the connection returns.
- **A network and no answer**: *offload isn't answering*, *Trying again.* It retries on its own at about 2, 4 and 8 seconds, then about every 15, each with jitter, pausing while the app is in the background or the tab is hidden, and waiting at least as long as a `Retry-After` the server sent.
- Both: the title 17px semibold `--text-primary`, the line 14px `--text-secondary`, an outline **Try again** pill 36px drawn with a 44px target, 12px under. Never `--text-danger`. On the phones the block sits where the kit's `LaunchHold` puts it, its top 52px under the mark's lower edge, out of the centring flow, so the mark does not move; on the web alone in the page's centre.

### The tabs under the keyboard

On the phones the tab bar's opacity goes from 1 to 0 over the keyboard's first 60pt of rise, driven by the keyboard's own animated height, and back on the way down, combined in one style with the fade a sheet already drives. Once faded it takes no touch and is hidden from the screen reader. The plate's geometry is as built.

### The scrim

The phones' scrim is generated from `--surface-scrim` per theme, 0.35 in light and 0.55 in dark, instead of the two hand-typed values in `lib/colors.ts` and `DragSheet.tsx`; an upper sheet still draws none.

### States

- **Loading.** One spinner while Today first loads, no skeleton, as 024. Moving to another day shows the new name at once and the day's sections when they arrive, with no spinner if they arrive within a quarter second.
- **Failure.** A day that fails to load draws the stepper and *Couldn't load this day* with Try again. Needs you failing to load is not drawn; the day still is. A write with no network refuses with its own failure line rather than queueing.
- **Sizes.** Every pill, row and card takes `min-height`, never `height`, and grows with the type size; every control has a 44px target, larger than what is drawn where it must be; the stepper's name caps at 1.35 times.
- **Motion.** With reduced motion the card advance, the swipe's settle, the day change and the tab fade are cuts, not shorter animations; the countdown still changes.
- **Colour.** Every colour is named by alias and holds in both themes.

### On the web

The pane head holds *Today* and `sliders-horizontal` at its right; the crumb bar keeps today's date at its right whichever day is shown. The stepper has its chevrons and no swipe. Needs you has no swipe; the clock puts a card off. Customize Today is a right-hand pane beside Today, 520px for Today's pane, as the exploration draws it. The events strip scrolls sideways with a trackpad or the keyboard, shows no scrollbar, and each card is a real button reached by Tab. The notifications card is phones only.

### On Android

From the kit's `and` and the exploration: radius 16 on the cards, the event cards and the To do card; `a-c-low` for their grounds; the filled action in `a-on` rather than `--surface-inverse`; action pills 32px with an 8px radius; the Material switch's track and thumb in Customize Today; `a-outline` hairlines between sheet rows; the Material sheet; and the platform's ripple on the card actions, the chevrons, the rows and the event cards.

### The privacy page

No line changes. Today reads what offload already keeps: content rows, the copy of the calendars a person ticked, questions, requests and invitations. The layout and the cards put off hold kinds and ids, never words. To open an event in Google Calendar offload keeps the event's own link from Google on the event's row, so the calendar's rolling window and its deletion on un-tick and disconnect bound it as they bound the rest; it is a reference to the event, not what it says, which the page's *a reference we can use to fetch the original again on demand* already covers. It is only ever handed to the person's own phone or browser; offload's servers never open it. Analytics, traces and logs carry no title, name, question, address or link from any of it (OFF-1).

## Acceptance criteria

**The page**

- **AC-1** Today draws Needs you and the day in the layout's order, each only when it holds something, with no heading over Needs you and no date row, and the composer where it always is; on the phones the app bar draws `sliders-horizontal` named *Customize Today* before the bell and no other tab draws it; on the web the pane head draws it.
- **AC-2** An account with nothing waiting draws no Needs you and nothing in its place, whichever day is shown.
- **AC-3** Phones built before this spec keep reading 024's three groups unchanged.

**Needs you**

- **AC-4** Needs you holds account issues, people, questions and tips in that order, cards within a kind as the table lists them and oldest first; a late to-do, an Activity row, a proposed share or calendar write, and a `person`, `calendar` or `country` question never appear in it.
- **AC-5** A calendar card appears for a connection that is `needs_reauth`, never for one missing only the sharing-list scope, and is gone on the next load after a successful sign-in; Reconnect opens the same sign-in Settings opens.
- **AC-6** The time zone card appears exactly when 023's strip did, with Use and Keep doing 023's writes and no clock, and the strip is drawn nowhere.
- **AC-7** On a phone with the permission off and a notification switch on, the notifications card appears, Turn on asks for the permission when the phone can still ask and opens the system settings when it cannot, and a yes or returning with the permission on removes it; a no leaves the card as it was, and a call that fails shows the card's failure line with Try again; with every switch off, and on the web, it never appears.
- **AC-8** Accept and Not now on a connection request are 022's accept and dismiss; Add it to my threads accepts the invitation; Not now on an invitation removes it from Needs you for good and leaves it on My threads' strip.
- **AC-9** A question card is `QuickReplies` with no filled option and *Not that* alone on the last line; a tap answers through 018's route with 018's Undo; a question closed by the next turn is gone from Today on the next load; a question from a forwarded email reads *About an email*; one raised from a calendar's or a web page's words never appears.
- **AC-10** The forwarding tip appears only for an account with `mailAvailable` that has dumped something, has no accepted email and has not pressed Got it; Copy address copies the address and toasts *Copied*; Got it removes it for good on every device.
- **AC-11** One card shows with one sliver at two waiting and two at three or more, and *N of M*; settling a card brings the next, whose actions take no tap for 300ms; a failed write puts the card back with the action's own failure line and Try again.
- **AC-12** The clock and a sideways swipe on the phones hide a card until the start of the next day in the account's zone, on every device for every card but the notifications card, which is hidden on that phone only; it returns then if it still holds.
- **AC-13** Every card is built from the account's own rows: another account's question, request, invitation or connection is never drawn, and putting off, answering or accepting by another account's id answers as if the id did not exist.

**The day**

- **AC-14** The stepper names days *Today*, *Tomorrow*, weekday names to the end of the person's week, *Next* and the weekday through the week after, then *Wed 15 Oct*, with the sub-line rules above; the back chevron is disabled on Today and the forward one twelve months ahead; a swipe on the day's background moves one day and a row's swipe, the strip's scroll and a card's swipe are not taken by it.
- **AC-15** Today opens on Today at launch, from another tab and on a tap of its own tab; the *Tomorrow* digest and its Activity row open it on Tomorrow and every other door on Today; the day shown is not stored; midnight in the account's zone moves an open Today to the new day.
- **AC-16** The next line names the person's own next timed event that has not ended with *in 1h 30m*, or *until 12:30* while it runs, moving each minute while the app is in front; another day names their first timed event *at 10:00*; all-day events and another member's events are never named; no line when nothing qualifies.
- **AC-17** Where you will be draws the day's events from every ticked calendar and every `event` row in the person's threads, all-day first, then by start, a span on every day it covers; an event offload wrote to a calendar appears once; another member's event carries their name; past events draw their title in `--text-secondary`; the next line's event is raised.
- **AC-18** An event on a calendar another member picked for a shared thread, or on a calendar the account has not ticked, is never on Today.
- **AC-19** A calendar's event with a link opens it in Google Calendar through the platform; a link that is not `https` on a Google host is never stored and never opened; an event without a link is not a button; an offload event opens its thread; nothing on Today edits an event.
- **AC-20** To do draws late rows on Today only, oldest first with the late chip, folding past three into *N more late* that opens in place; then rows with a time by the hour with a clock chip; then the rest due that day, folding past a hundred; a repeating row lands on its rule's days and is never late; notes never appear.
- **AC-21** A To do row ticks, opens the row sheet with When, Repeats and Labels, opens the action sheet, swipes to delete on the phones, and offers the eight-second Undo, exactly as on the thread page, on every surface.
- **AC-22** ~~If you have time appears on Today only, with at most three open undated, unrepeating to-dos filed by this person, in threads with a dated row due from today to seven days ahead, oldest first.~~ Amended 2026-10-07: Open in your threads appears on Today only, after To do, with a page per thread the person reads that holds open to-dos with no date, whoever filed them; the thread with the oldest such to-do first, at most twelve, four rows a page oldest first with the rest counted; Not in a thread last and only when it holds one; nothing on another day, with nothing open, or with its switch off, and the day carries no picks.
- **AC-23** ~~+ Today gives the row today as a day with no hour, moves it into To do and toasts *Added to today* with Undo; Undo clears the date and that row is not picked again that day; + Today on a row another member filed, a dated row, a repeating row or one in a thread the person is not in is refused.~~ Amended 2026-10-07: a tick on a page strikes the row through in place and toasts *Ticked off* with Undo; the row and its page keep their places and the counts do not move until Today is built again; a row opens its row sheet; the head and *Open thread* open the thread, *Sort them* opens Not in a thread. + Today and its route are gone.
- **AC-24** An account that has never dumped sees the day-one invitation in place of the day; otherwise an empty day draws the stepper and its *Nothing* line, named for the day.
- **AC-25** A day that fails to load draws *Couldn't load this day* with Try again under the stepper; Needs you failing leaves the day drawn; a day arriving within a quarter second shows no spinner.

**Thread pills and Customize Today**

- **AC-26** Every thread named on Today is the shared thread pill, 24px there and 30px in the conversation's turn footer, which uses the same component; a tap opens the thread, inside a row as a control of its own; a calendar's name is plain text.
- **AC-27** Customize Today lists Needs you with its four kinds, Your day and (amended 2026-10-07) Open in your threads; each switch hides what it names on every device; the sections drag to reorder with accessibility actions and the web's arrow keys; Reset returns the defaults; the last switch on cannot be switched off; one gesture is one write.
- **AC-28** The server builds only what the layout has on; the device-only cards follow Account issues; a stored layout without a kind gets it at its default (`open_threads` straight after the day, amended 2026-10-07, and `/api/me`'s `todayLayout` never carries it, for phones built before it); a layout with an unknown kind, a repeated kind, a missing part or everything off is refused, and nothing but the validated document is stored.

**Launch, the tabs, the scrim**

- **AC-29** With no network, launch shows *You're offline* and retries when the network returns; with a network and no answer it shows *offload isn't answering*, *Trying again.* and retries with jitter at about 2, 4, 8 then every 15 seconds, paused in the background; both carry Try again and neither uses `--text-danger`; the mark does not move; the web does the same in the page's centre.
- **AC-30** On the phones the tab bar fades from 1 to 0 over the keyboard's first 60pt of rise and back as it falls, takes no touch and is hidden from the screen reader when faded, and still fades for a sheet.
- **AC-31** The phones' scrim is generated from `--surface-scrim` per theme and no hand-typed scrim opacity remains.

**Everywhere**

- **AC-32** No analytics event, trace, log line or error report carries a title, a name, a question, an address, a thread name or a link from Today.
- **AC-33** Every new string has no em or en dash and is sentence case; `sliders-horizontal` is in both clients' icon sets; the dead-class, dead-css and dead-icons checks pass; reduced motion turns every Today movement into a cut.

## Out of scope

- **What moved**, until it is designed.
- **A tip but the forwarding one.**
- **Editing an event on Today**, or opening an offload event's row sheet from the strip.
- **Proposed shares and calendar writes**, and `person`, `calendar` and `country` questions, in Needs you.
- **A typed answer** to a question on Today.
- **Another member's calendar** on Today.
- **Keeping the day shown** across launches.
- **Ordering the kinds** inside Needs you.

## Decided during planning

**By the product owner:**

- Launch, the tabs and the scrim are in this spec, not a tweak.
- What moved is left out until it has a design; the layout's closed set takes it later with no migration.
- The day-one invitation stays for an account that has never dumped; any other empty day gets one line.
- 023's strip becomes a Needs you card, with its condition, words and writes unchanged.
- The picks look seven days ahead, and only rows the person filed are picked.
- An offload event opens its thread; a calendar's event opens Google Calendar.
- **Needs you has a switch per kind**, not one for the whole stack, so a person can hide people or tips and still be told a calendar broke.
- **The drag is built now**, as drawn, for the two sections.
- **Another member's event is on Where you will be**, named as theirs.
- **Launch's second line is *Trying again.***, because the client cannot tell an outage from a captive portal and offload does not diagnose itself.

**From the reviews:**

- **Questions that leave offload or start a turn stay in the conversation** (`person`, `calendar`, `country`, proposed shares and calendar writes), because the page promises offload says who will find out before anything goes out, and a card cannot.
- **A question raised from a stranger's words is on Today only when it came from a forwarded email**, and says so.
- **A question card is `QuickReplies`**, with no primary, per its contract.
- **A question is short-lived**, as 018 and 026 already rely on; Today does not change its life.
- **The calendar card fires on `needs_reauth` only** and has no *Not now*; the clock already means tomorrow.
- **The time zone card has no clock**, keeping 023's once per zone.
- **The notifications card is put off per phone**, since it is a fact about the phone.
- **The forwarding tip waits until the account has dumped something**, so it never sits on top of the day-one invitation.
- **The next card's actions are inert for 300ms**, so a double tap cannot settle two cards.
- **The stepper stops twelve months ahead**, the calendar window's edge, so a far day is never confidently empty.
- **The *Tomorrow* digest opens Tomorrow**, since the day is no longer a group on Today.
- **Past events dim their title, not their whole card**, which kept the calendar's name legible.
- **Kind colours are aliases**, since `--blue-700` and `--moss-700` fall below 4.5:1 in dark.
- **The thread pill takes two heights**, 24 on Today and 30 in the turn footer.
- **The scrim's alpha is generated**, since the token generator dropped it.
- **Each settling action keeps its own failure words**; *Couldn't save that* is Customize Today's and + Today's.
- **024's read stays for installed phones**; the new clients read the new one.

### Design system impact, to log in `decisions.md`

One entry, **Today as built**, for the kits to follow:

- Customize Today: What moved held back; Needs you has no switch of its own and gains four kinds with switches (Account issues, People, Questions, Tips) under it; the last switch on is disabled.
- The zone strip is a *Time zone* card in Needs you with no clock.
- New card words: the calendar card's *Sign in again to see its events here.* (the kit said *Events after Sunday are missing from your day.*), the notifications card, the invitation card; the calendar card has no *Not now*.
- A question card is `QuickReplies` with no primary and the clock on *Not that*'s line.
- Kind colours `--text-attention` and `--text-accent`, replacing `--blue-700` and `--moss-700`.
- Past events dim their title only; another member's event carries *Ana's*.
- The thread pill: one component, 24px on Today and 30px in the turn footer.
- The empty day's *Nothing* lines; an offload event opening its thread; the stepper's week end following *Starts on* and stopping twelve months ahead.
- Launch's second line is *Trying again.*
- `ui_kits/web_app/WToday.jsx` still draws the old week strip and is wholly superseded.

## Amended 2026-10-01: whose an event is

The owner's account reads a calendar shared with their wife, who puts her daily classes on it, so Today drew her day as his: *Yoga in 30m* as his next line and her classes under Where you will be. Decided with the owner the same evening.

- **Two facts per calendar event**, read from Google at each sync and nothing else kept:
  - whether the account created it: Google names the account's address as the creator, or marks the creator as the primary calendar it was read from;
  - whether the account is on its guest list without having declined.
  
  Null until a sync has read them, and null is treated as the account's own, so nothing disappears before the next pass.
- **Today draws a calendar's event only when one of them holds.** Somebody else's event on a shared calendar is not under Where you will be and is never the next line. A declined invitation is not the person's either.
- **The calendar line names the calendar**: *Calendar: Family*, never *Google, Family*. "Google" told a person nothing.
- **A thread keeps every event on its calendars**, since a family thread may want them all, and marks one the person is not in: its title in quiet ink and *Family, not yours* under it. This covers another member's calendar picked for a shared thread as well.
- **Filtering a thread's events to the person's own** (a note such as "only show my events in this thread") is not built. A thread note reaches the model, not the page; it needs a thread preference the model can set, and is its own change.

- **What the model reads says whose each event is.** A question in the conversation such as "what's on tomorrow" still gets everything on the person's calendars, with each event marked `yours` or not, and the reply says theirs first and the rest apart, as other people's.
- **Nothing about an event's guests is kept**, on any event: no name, no answer, no address. Nothing read any of it: a change to an event with guests asks Google who they are at that moment. What is already stored is emptied by the migration. A proposal to invite somebody holds their address until it is answered or its hour runs out, and the daily purge deletes it after. The privacy page says all of this, along with the new note of whether the person made an event or was invited.

**Acceptance criteria added:**
- **AC-34** A calendar event created by the account, or listing it as a guest who has not declined, is drawn on Today; one created by somebody else that does not invite it is not drawn and is never the next line; an event not yet read is drawn.
- **AC-35** Today's calendar event says *Calendar:* and the calendar's own name.
- **AC-37** `find_events` returns every event in scope, each with `yours`; the answering model keeps the person's own and other people's apart (eval cases `answer-whose-events-are-apart`, `answer-all-yours-says-nothing-about-whose`).
- **AC-38** No stored event carries anything about its guests; a proposal that was confirmed, declined or expired is deleted by the daily purge; the privacy page says both.
- **AC-36** A thread draws every event on its calendars, and one the person is not in has its title in quiet ink and *not yours* after its calendar's name, on the web and both phones.
