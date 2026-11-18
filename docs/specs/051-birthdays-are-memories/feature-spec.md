# 051 Birthdays are memories, feature spec

**Status:** drafted 2026-11-17 from the owner's direction of the same day and their answers to seven questions: with nothing named, the unasked event goes on their primary calendar with no question; a remembered birthday goes on a connected calendar unasked; forgetting the memory deletes its event, on a shared calendar too; the reply says *Remembered that…*; a date changed in the Memories tab moves the event; and the privacy page is reworded in the same change. Revised the same day after the project-lead, client and security reviews; what changed is under Review.
**Surfaces:** the agent and the Core API, the privacy page, and three lines of copy in `@offload/widgets` that every client already draws. No new screen and no new control.
**Depends on:** 038 (memories), 040 (the Memories tab), 042 (reminders), 019 (calendars), 013 (asking back), 004 (the turn's Undo)
**Amends:**
- **038 section 2a and AC-4.** The live turn writes a memory without being asked for one thing only: a birthday or an anniversary of somebody in their life, or their own birthday. Everything else stays asked-only. The 2026-11-06 amendment's "the live turn never writes a memory unasked (2a)" gains the same exception.
- **038 out of scope** and **042's line 9**: *A birthday still never reaches a calendar* ends.
- **042 AC-4.** The memory pass is no longer the only writer of a memory's date: the turn writes it for a memory it remembers.
- **042's Today.** A memory's reminder on the day itself is not drawn while its event is on a calendar Today reads.
- **019 AC-11, AC-12 and the Undo of a removal.** A calendar write can hang off a memory as well as a row, and the delete that follows a forget is offload's own write and is not confirmed.
- **040.** The origin line of a memory the person said, and the forget of a memory with an event.

## Why

Kristina's birthday was dumped on 14 November as "Kristina's birthday is Feb 1st, save it on my personal calendar for every year". The turn filed a yearly event row in the default thread, because a calendar write needs a row, and that night the memory pass wrote *Kristina is a contact whose birthday is Feb 1st.* as well. So:

- **A birthday sits in a thread forever.** It is never done, never archived, and it clutters loose or whichever thread it lands in. A birthday is a fact about somebody, which is what a memory is (038 already says so), not something to do.
- **It would have reminded twice**, once for the row and once for the memory, and the memory's reminder would have been named by its whole clumsy sentence.
- **The memory came a day late and from a guess.** The pass wrote "a contact", which nobody said.

The owner's direction: a birthday or an anniversary goes straight to a memory and never becomes a row in any thread. Reminders come from the memory, and when a calendar is connected the memory goes on it too.

## What

### 1. A yearly date about somebody is a memory

**What counts.** A birthday of somebody in their life, an anniversary of theirs with somebody (a wedding, the day they met), somebody's anniversary they want kept (their parents' wedding), or their own birthday. Said in their own message, with or without "remember".

**What does not**, and stays a row exactly as today:
- **A date that recurs but is not about a person**: a bill, a renewal, rent, bins, Mother's Day, a holiday.
- **A one-off day about somebody**: "Kristina's party on Saturday" is an event, "buy Kristina a present" is a task. A birthday dump that also asks for something ("Kristina's birthday is Feb 1st, book a table") writes the memory and files the task.
- **Anything not in their own words**: a forwarded email, a page, a photo, a connected app, another member's note or row. If the turn read any of those, a birthday is filed as it is today and no memory is written (AC-2).

**What is written.** One People memory (About for their own birthday) in the third person from their words, naming the person and the date, with the month written out: *Kristina's birthday is 1 February.* *Their anniversary with Meera is 12 June.* A year they gave is kept: *Sam's birthday is 3 May 2019.* A relation they gave stays in the sentence, as 038's People class allows: *Their sister Kristina's birthday is 1 February.* With it goes the date as a month and a day, and a short name copied from the sentence that says whose day it is (*Kristina's birthday*), which is what reminders and the calendar call it.

**Already known.** A memory whose name and date are already held is not written again, and the reply still says it was remembered. The same name with a different date replaces the old one (038's supersede): they are correcting it. A memory for the same name with no date is replaced by one with a date.

**No day.** "Kristina's birthday is in February" is a memory with no date. Nothing reminds and it goes on no calendar.

**Full.** At 300 memories, 038's line: *Memories are full. Forget one in Memories first.* Nothing is filed instead.

**The reply** names it, verb first, as 038's asked memories do: *Remembered that Kristina's birthday is 1 February.* The turn shows its Done mark and no pill: a memory has no thread. A dump that also filed something names only the memory and shows that thread's pill as usual.

**In the Memories tab** it reads like any memory the person said: the origin line becomes *You told offload this* for every memory from their message, asked or not, since "You asked offload to remember this" is no longer always true. An open tab shows it at once.

### 2. Reminders

A memory written this way reminds as 042's memories do, from the moment it is written: an `occasion`, named by its short name, dated by its month and day. It does not wait for the night. It reminds a few days ahead and on the day (042's `days` lead), as Kristina's did; the memory pass reads it again only when its words change. Their own birthday reminds nobody (042).

**On the day itself**, Today draws the calendar's event, and not also the memory's reminder, while the memory's event is on a calendar Today reads. Reminders before the day are unchanged.

### 3. On their calendar

**Whenever a calendar is connected, asked or not** *(owner, 2026-11-17)*, as an appointment goes on unasked today. "Save it on my calendar" or "put Kristina's birthday in the family calendar" only says which. Their own birthday goes on only when they ask. A birthday remembered before the calendar was connected, or before this shipped, goes on when they ask in their own message ("add Kristina's birthday to my calendar"), with no second memory.

**What goes on.** One all-day event, every year on that day, titled with the short name (*Kristina's birthday*), with no description, guests or place. The memory's sentence never goes to Google. A memory with no short name of its own, or no day, goes on no calendar.

**Already there.** If a repeating event of the person's own is already on that day in any calendar offload reads, Google's own Birthdays calendar included, with every word of the short name in its title, the memory remembers that event and nothing is written. Many people already keep birthdays on their calendar. How often it repeats is not checked, and a calendar offload has not read yet finds nothing, so it may be written twice; the person deletes one.

**Which calendar.** The one they named, in their words, as 019 settles a named calendar: by whose ("my calendar", "my personal calendar") or by name. Nothing named: their primary calendar if it is approved and writable, else the first approved writable one, with no question *(owner, 2026-11-17)*. Asking which calendar for something nobody asked to put on one would add a decision to dumping. Only a name that settles on none asks, with 019's question: *Remembered "Kristina's birthday". Which calendar?*, `Not that` leaving it off every calendar. A memory is in no thread, so no thread's pick decides it and no tap makes one. One question can be open in a conversation, so when the turn has already asked one, the birthday goes on no calendar and nothing is said; asking later puts it on.

**Confirm or do.** 019's add rule as it stands since 2026-10-28: guests on either side, or `Ask before adding`, put it to them first with 019's waiting line. A birthday has no guests, so that is `Ask before adding`. Otherwise it is written now with the turn's Undo, and done is silent.

**Can't.** No calendar connected: nothing is said, unless they asked for one, and then 019's sentence, *That needs a calendar connected first, in Settings under Connected apps.* A memory with no day that they asked to put on a calendar: *That needs the day first.* Refused as read only: the existing line. The memory is written in every case.

**After it is on.**
- **The turn's Undo** takes back the memory and the event together. Undo on the calendar pick takes back the event only; the memory stays, off every calendar.
- **Forgetting the memory**, by saying so or in the Memories tab, deletes the event offload put on for it, once the forget's Undo has closed. An event offload found already there (below) is theirs, and is only unlinked; Undo inside the eight seconds keeps both. **On a shared calendar too, with no go-ahead** *(owner, 2026-11-17)*: it is an event of the person's own with no guests, put there for this memory, so deleting it reaches nobody who was told of it. A delete Google refuses or that fails leaves the event and drops the link, and says nothing. The tab's toast stays *Memory forgotten*; the spoken reply stays *Forgot that…*.
- **Changing the memory** in the Memories tab is read again for its date the next night, as the memory pass reads every memory, including one whose reminders they turned off. A new day moves the event to it; no day any more lets it go and leaves it on the calendar, since only a forget deletes (OFF-6). Until then the event and the reminders keep the old day.
- **The pass replacing the memory** (a fold, or a newer fact) carries the event to the memory that replaces it.
- **The event deleted on the calendar** by them, or its calendar unticked or disconnected, unlinks it. The memory stays and keeps reminding. Nothing is put back on.
- **The event changed on the calendar** changes nothing in offload.

### 4. The nightly pass

**It does not write a second memory for a name and a date already held.** The memory pass is shown the memory and the message it came from; it is told, and the Core API refuses an add whose name and date match an active memory.

**What is already in threads stays.** Birthday rows filed before this ships are not moved or deleted. The person removes them if they want to.

## Acceptance criteria

**Writing it**
- **AC-1** A dump in the person's own words that states a birthday or an anniversary of somebody in their life, or their own birthday, writes one People memory, or About for their own birthday, with no "remember" in it, and no row in any thread. The memory names the person and the date in the third person, month written out, keeps a year they gave, and is at most 200 characters. Its origin is `stated` and it does not count against the 25 learned memories.
- **AC-2** A recurring date not about a person and a one-off day about somebody are filed exactly as before this spec. The Core API refuses an unasked remember in a turn that read anything 038 AC-5 lists, or another member's note or row.
- **AC-3** The Core API accepts an unasked remember only as a People or About memory carrying a month and a day, and only when every word of its sentence other than the date is in the person's own message, as a rule's words must be (038, 2026-10-05). 038's asked-words gate is unchanged for every other memory, and its word-and-number grounding is not loosened.
- **AC-4** The month and day are checked apart from the words: they must be a real day (29 February allowed), the sentence must state that day, and the person's own message must state that day with its month in words, in a form the Core API reads ("Feb 1st", "1 February", "February 1", "the 1st of Feb"). A day in numbers ("1/2") is not read, because nothing records which order an account writes them in; that birthday is filed as before this spec. A year in the sentence must be in their message.
- **AC-5** The short name is a run of words copied from the sentence that names the person and contains "birthday" or "anniversary", at most 60 characters, passing 042's name checks; one that does not leaves the memory without a name, unreminded by name and on no calendar.
- **AC-6** A memory whose flattened short name and date match an active one of the account's is not written again, and the reply says it was remembered. The same flattened name with a different date, or with no date held, supersedes the active one.
- **AC-7** The reply says *Remembered that <sentence in the second person>.* The turn's answer carries `filed: true`, so the footer draws Done, and no thread for the memory. A memory-only turn emits the `memories` live change, so an open Memories tab shows it.
- **AC-8** At the memory cap the reply is 038's *Memories are full. Forget one in Memories first.* and nothing else is filed.

**Reminders**
- **AC-9** A memory written with a date has its reminder label from the turn: kind `occasion`, lead `days`, its month and day, its short name, marked as read for its current words. The person's own birthday gets none. The memory pass labels it again only after its words change.
- **AC-10** On the day itself Today does not draw a memory's reminder while the memory is linked to an event on a calendar Today reads.

**On a calendar**
- **AC-11** A birthday or anniversary the turn remembers, other than their own, goes on a calendar whenever the account has an approved writable calendar; their own birthday, and one remembered earlier, only when their own message in an untainted turn (AC-2) asks. The event is all-day, repeats yearly on the memory's day, is titled with the short name, and carries no description, guests or place. The memory's sentence never reaches Google.
- **AC-12** Before writing, offload looks in every calendar of theirs it reads, read-only ones included, for a repeating event of the person's own on that day with every word of the short name in its title; one found is linked and nothing is written. The frequency is not checked.
- **AC-13** The calendar is the one they named, settled as 019 settles a named calendar; with none named, their primary calendar if approved and writable, else the first approved writable one, with no question. A name that settles on none raises *Remembered "<short name clipped to 40>". Which calendar?* on the wire as field `calendar`, within the question bound, the tap writing without picking for any thread; it never joins another question, and when the conversation already has one open nothing is raised and nothing is written. Nothing approved: the memory is written, and 019's connect sentence is said only if they asked.
- **AC-14** The add passes 019's confirm-or-do test as amended on 2026-10-28.
- **AC-15** The memory loads by its id, the account and scope `account`, and the calendar through the account's own approved writable calendars; anything else is one refusal. A memory remembers at most one event, on its own calendar and event reference, separate from the calendar an answered memory (038 AC-8) is linked to, and is not put on again.
- **AC-16** The turn's Undo removes the memory and deletes its event; Undo of a later turn that put a held memory on a calendar deletes that event and keeps the memory; Undo of a corrected day brings the old memory back with its event moved back. Undo on the calendar pick deletes the event and keeps the memory.
- **AC-17** A forget, said or in the tab, deletes the event offload wrote for the memory once its Undo has closed, on any of the person's own calendars and with no go-ahead; an event it found (AC-12) is unlinked and never deleted. A refused or failed delete drops the link and says nothing. The same holds for AC-16's deletes.
- **AC-18** A memory changed in the tab is re-dated by the next memory pass, with its reminders on or off: a new day moves its event, no day lets it go without deleting it. A supersede by the pass carries the link to the new memory, and an event is only ever linked to one live memory.
- **AC-19** An event deleted on Google, or its calendar unticked or disconnected, unlinks the memory without changing it. An event changed on Google changes no memory.
- **AC-20** A memory with no day or no short name goes on no calendar; when they asked for one, the reply adds *That needs the day first.* for a missing day. The memory is still written.

**The pass**
- **AC-21** The memory pass adds no memory whose flattened short name and date match an active one; the Core API refuses it.

**Copy, evals, hygiene, docs**
- **AC-22** The Memories tab's origin line for a `stated` memory from a message reads *You told offload this*, on every surface, from `@offload/widgets`.
- **AC-23** The memories eval principle gains cases: a birthday with and without "remember", with and without a calendar named, an anniversary, their own birthday, a birthday in a forwarded email, on a page and in another member's note (stays a row, no memory), a recurring bill (a row), "Kristina's party Saturday" (a row), a birthday and a task in one dump, a correction of a date, "add Kristina's birthday to my calendar" for one already held, and the pass shown a message whose birthday is held.
- **AC-24** No log line, trace, error, event, step line, push payload, admin view or ledger row carries a memory's text, its short name or the event's title (OFF-1).
- **AC-25** In the same change: 038, 019, 040 and 042 are amended where this spec says; `docs/tech/decisions.md` records the unasked remember, the memory as a calendar write's anchor, and the unconfirmed delete after a forget on OFF-6's allowlist; the design `decisions.md` records the new question sentence and the origin line, with Design system impact filled in; and the privacy page says what Privacy below says, before any code that writes an event unasked ships.

## Out of scope

- **Birthday rows already in threads.** Not moved, not deleted.
- **A calendar mark on a memory** in the Memories tab, or a different toast for forgetting one with an event. The calendar shows it; a mark is a design question for the tab.
- **A date field** in the Memories tab. The sentence carries the date; the next pass reads it.
- **Recurring dates that are not about a person**: they stay rows with a rule.
- **Importing birthdays** from contacts or a calendar.

## Privacy

The event's title is the memory's short name (*Kristina's birthday*); the sentence never leaves. What changes on the page, approved by the owner on 2026-11-17 and made in the same change:

- **Section 3** ("writes to it when you ask") and **section 7** ("to add, change or delete events when you ask") become: offload adds events for things you put in, such as appointments and birthdays, and changes or deletes them when you ask or when you forget the memory they came from, asking first before a change that would notify other people. Appointments already went on unasked before this spec, so the old line was already loose.
- Section 3's memory paragraph already says memories hold "the people in your life, how they relate to you, their birthdays" and that offload "learns some from what you put in", which covers a birthday written without "remember". Unchanged.

## Volume

Bounded by 038's caps: at most 300 memories an account, each with at most one label and one event. Nothing new reaches a prompt (the memory block is already fifty at most), so OFF-8 is untouched.

## Review, 2026-11-17

**Changed after the reviews.**

- **The unasked remember has its own gate**, stricter than the asked one: every non-date word in the person's message, the date parsed and compared on its own, and another member's note or row as taint. The security review showed 038's half-the-words grounding would accept a date lifted from somebody else's note, and that the spec's own example fails the number rule, which would have tempted a global loosening.
- **The add follows 019's add rule as amended on 2026-10-28**, not the participant count, and the delete after a forget is named as an unconfirmed write (owner).
- **The forget deletes after its Undo closes**, so nothing outward is destroyed while the toast is up, and a failed delete is silent.
- **Done has a carrier**: `filed: true` with no thread. Without it the footer draws nothing.
- **The question sentence fits**: the short name clipped to 40, field `calendar`, so shipped phones read it.
- **Origin, cap and live change are stated**, and the origin line is reworded for every memory a person said.
- **Today on the day**: the calendar's event, not the memory's reminder as well.
- **A found event is linked rather than duplicated.**
- **Dedupe has a key**: the flattened short name and the date.
- **The privacy page changes** (owner), and the spec no longer contradicts itself about asking.
- **A memory's event link is its own**, separate from an answered memory's calendar, and Undo clears it.

**Not changed, deliberately.**

- **No date field in the tab** and no `event` flag on a memory. Editing the sentence is enough, the next pass re-dates it, and the forget toast does not need to differ when its Undo covers both.
- **Re-dating an edit waits for the night.** A date parser for free text in the tab would be a second reading of the sentence beside the pass's; the cost is a day's lag on a correction.

## Constitution gate, 2026-11-17

| Principle | Verdict | Evidence |
| --- | --- | --- |
| DEV-1 (MUST) | Compliant | Memories, labels, 019's write path, the question and the purge are all reused; no screen, no control, no new tool. |
| DEV-2 (MUST) | Compliant | AC-25 amends 038, 019, 040 and 042 in the same change. |
| DEV-3 (SHOULD) | Not applicable | No new tool or dependency. |
| QUAL-1 (MUST) | Compliant | Every AC is testable; tasks start each with a red test. |
| SEC-1 (MUST) | Compliant | The unasked path has a stricter gate than the asked one (AC-3, AC-4) and the wider taint list (AC-2); a calendar ask counts only from the person's own untainted message (AC-11). |
| SEC-2 (MUST) | Compliant | AC-15: memory and calendar resolved server-side against the account. |
| DATA-1 (SHOULD) | Compliant | The impl-spec carries the schema before code. |
| OFF-1 (MUST) | Compliant | A memory is derived and correctable; offload deletes only an event it wrote, never one it found (AC-17); no content in logs (AC-24). |
| OFF-2 (MUST) | Not applicable | No blob; memories are plaintext like every note, as 038 says. |
| OFF-3 (MUST) | Compliant | AC-15. |
| OFF-4 (MUST) | Compliant | The found-event check reads 019's existing copy and keeps nothing new from it; no memory is derived from a calendar. |
| OFF-5 (MUST) | Compliant | The date, the short name and the calendar words arrive as fields of the memory tool's validated schema. |
| OFF-6 (MUST) | Compliant, with a dated owner entry | The memory sits in the turn's Undo; the add follows 019's add rule; the forget's delete waits for its Undo to close and goes on the reversible allowlist by the owner's decision of 2026-11-17 (AC-25). |
| OFF-7 (SHOULD) | Compliant | Two copy changes logged in the design `decisions.md` (AC-25). |
| OFF-8 (MUST) | Compliant | Nothing new reaches a prompt; the memory tool's definition grows within the 2,400 budget (2,284 today). |

GATE: PASS
