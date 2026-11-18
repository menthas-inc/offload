# 052 Replies in place

**Status:** drafted 2026-11-17 with the owner from a design round on the same day, then revised the same day after the project-lead, client and security reviews and the owner's answers (see **Decided** and **Review**). The design source is the **Final** board of the canvas *offload replies, design options* (https://claude.ai/artifact/BgrfH4Su5E7FzxSZpANV6i), direction **C, revised**, copied into `design/final-board.dc.html`. The twelve reference turns are in `design/twelve-turns.dc.html`. No kit draws this yet: the board is the design, and this spec says where the build differs from it.
**Surfaces:** iOS, Android, web, the Core API.
**Depends on:** 004 (the dump, and the turn's Undo), 013 (answering, `AnswerResult`), 016 (reaching the web, source chips), 018 (asking back, `QuickReplies`), 019 (calendars and the outward test), 022 (sharing), 023 (dates, the row's sheet and edit modal), 026 (Undo's `since` guard), 027 and 046 (Today's `MonthGrid`), 030 (places, the directions link), 035 (export and deletion), 038 and 040 (memories and their kinds), 042 (reminders), 043 (`UndoLine`), 048 (live updates).
**Amends:**
- **The turn footer is retired.** The Done mark, the thread pills and the source pills (`TurnFooter`) are no longer drawn under a turn.
- **013's answer card becomes a slice.** It follows the same rules and is drawn by the same component as every other slice.
- **016's source chip becomes a quiet line.** It is still the one external link in the conversation.
- **043's plate line.** A dump filed from the conversation no longer draws one, because its reply carries the Undo. 043 gains a fourth form of `UndoLine`, **turn**, drawn at the foot of a reply.
- **019's calendar question.** It gains a one-event answer: putting a row on a calendar from a reply never picks that calendar for the thread.
- **004's turn Undo.** Two changes:
  - **It reverses changes, not only creations.** Each write a turn makes to a row or thread that existed before it records that row's previous value server-side, and the turn's Undo puts it back. Undo now reverses the turn's edits, ticks, moves, archives, renames and preference changes as well as what it created. This closes the open OFF-6 item of 2026-10-02 in `docs/tech/decisions.md` (owner, 2026-11-17).
  - **Late Undo works differently.** Undo now stays on a reply until the next dump, and after its first eight seconds it reverses the filing and keeps the dump. The rules are in **The undo line** below.
- **042's Remind me.** It can now be switched on from a reply's pill as well as from the row's sheet, in a thread nobody else is in. When the reminder lands is still decided by 042's table, never by a moment the person picks.

## Why

A dump that offload filed comes back as **Done** plus a row of pills naming threads. It says that something happened and where, and nothing about what. Somebody who dumps "Dentist Friday at 3, and oak brackets 30cm matte black" cannot see from the reply whether the dentist made it onto Friday at 3, or whether the brackets became one row or two. To check, they have to leave the conversation. The answer side already does better: a question about a thread comes back as that thread's rows, tickable, under its name.

offload's promise is that it does the filing. The reply is where that promise is checked, and it should show the filing, not announce it.

## What

### The reply

A turn's reply is a short stack, always in this order. Every part of it is optional:

1. **What offload says.** The `say` bubble or an answer's sentence, unchanged from today.
2. **Slices.** Up to three per turn, one per place the turn wrote to or read from. When a turn reached more places than that, a link line follows the slices: *Also in Bookshelf, Flat admin*. Each name is a link, so every place the turn touched can be reached from the reply, as the thread pills could.
3. **Pills.** Up to two per turn, for what the dump left out.
4. **The source line**, when the turn read the web.
5. **The undo line**, when the turn wrote anything.
6. **A question**, when the turn asked one (018). It is a bubble of its own, last, and **a turn that asks draws no pills**: a pill and a question's answers would otherwise sit side by side looking alike.

A filing turn with nothing to say draws only its slices and its undo line, which is the common case.

**While the turn runs**, the thinking row and progress line are unchanged (017). The reply's parts appear when the turn's result arrives, drawn from the turn's record and filled in place as their rows load. There is no per-slice spinner and no skeleton, in line with the readme's Loading rule.
- **A partial turn** draws slices for what landed and today's partial reply for the rest.
- **A cancelled or failed turn** draws no slice.
- **Offline**, a reopened reply whose rows cannot be read draws its undo line's summary alone.

### A slice

A slice shows a small piece of where the dump landed, with what this turn did marked. There are four kinds, chosen by what was written or read. Every slice is a card, which on the phones is `AnswerResult`'s card and on the web its card at the composer's width.

**A list.** For rows filed or changed in a thread.
- **The header** is the built `AnswerResult` header: the thread's own icon, its name in moss, and a count of its open rows. A count of zero is not drawn. The header is the slice's one link out, to the thread.
- **The rows** are, first, up to two rows that are open now and were filed before the turn, the two nearest the turn's rows in the thread's own order; then the turn's own rows.
- **The cap** is 5 rows on the phones and 8 on the web, with `AnswerResult`'s tail when there are more.
- **Marks.** The turn's rows take the change mark (below). A ticked row sinks and strikes, as everywhere. A row keeps its labels and its date chip.
- **What can be done.** Rows are tickable, and ticking is the only write a slice offers, as 013 has it. Tapping a row opens its sheet on the phones and its edit modal on the web.
- **Notes** the turn wrote appear under a **Notes** section, in offload's voice.
- **Rows in no thread** are headed **Not in a thread**, which links to that page.
- **Rows from several members** all appear, since a shared thread's rows belong to everybody in it (OFF-3).

**A new thread.** When the turn started a thread, its slice shows the inside of the thread rather than where it sits among other threads.
- The header carries the thread's icon, an eyebrow **New thread** in moss, and the name.
- Under the header comes what the turn put in it.

**Memories.** A remember or a forget draws the kind's group from the Memories tab, with the new memory marked. The header reads **Memories, {kind}** and links to the tab.

**A calendar.** Anything with a date that the turn wrote or read is drawn as the built `MonthGrid` instead of as a list:
- **the two-week grid** when the date falls in this week or the next;
- **the month** otherwise, with how far away it is beside the month's name (*in 19 weeks*).

The grid draws exactly as Today's does:
- today is outlined, whenever it is in view;
- the day being shown is filled blue;
- a day with something of the thread's on it is lifted;
- events take an ink dot and to-dos a blue dot;
- a picked calendar's own events take a hollow dot.

**The grid shows only the period the turn is about.** It has no arrows, no **Today** control and no swipe, so a reply never pages through months. Tapping a day shows that day's entries beneath. The day picked is not kept: a reopened reply opens on the turn's day.

Under the grid, that day's entries are listed at full width:
- an event leads with its time, and a to-do with its tick;
- titles wrap and are never shortened;
- the turn's own entries take the change mark;
- a span the turn read lists every day that has something on it, under a heading for the day.

**Details in place.** Tapping an entry under a grid expands it where it is, inside the reply, through the built `InPlace` motion. The details show:
- the full day and the span of time;
- where it is, when 030 resolved a place, with **Directions**;
- its thread;
- the calendar it is on, as that calendar's provider dot and name (019), or *not on a calendar*.

Tapping again folds the entry, and several entries can be open at once. Another member's calendar event shows its title, its time and nothing else, as 019 has it.

**A mixed dump** draws one slice of each kind it needs, in the order the turn wrote them: for the dentist and the brackets, the dentist on a two-week grid and the brackets in Bookshelf.

**The change mark** is the readme's: `--surface-accent-soft` settling to transparent over `--duration-mark`. It plays once per turn on each device, when the reply is first drawn, so a reopened conversation shows the rows plainly. It is a background, so it never puts a second accent on a row: a to-do's blue dot is its kind, not a waiting state.

### What an answer draws

Answers move onto the same slices.
- **A read of a thread, or a search** draws a list slice, replacing 013's card on the same rules: one slice per read, at most three, the same count and the same tails.
- **A read of a day or a span of days** draws a calendar slice for that day or span, with every day's entries under it. Today that answer is typed out as sentences; now the sentence shrinks to the count (*Three this week.*). **This is the one change to what the model is asked**: the answer prompt's line on sets that are not content rows (`answer.md`, *nothing is drawn beside the reply, so the list is the reply*) is narrowed to calendars and connected apps, and a span of days is answered like content rows. It gains eval cases under principle 17, *the answer is the reply*, and runs only with the owner's go-ahead.
- **A date the web answered** draws a month slice with that day shown, under the sentence that says it. The date comes from the lookup's structured answer, never from the words of the reply.

### Pills

A pill offers what the dump left out, as one tap.
- **Paint.** `Chip`'s geometry, 30 tall inside a 44 target, with a leading glyph, the value paint `QuickReplies` uses, and labels of 24 characters at most.
- **How many.** At most two per turn, usually none, and none on a turn that asks a question.
- **Who words them.** The kinds are closed, and code chooses and words each one from the turn's record. No pill destroys anything.

| Pill | When | What a tap does |
|---|---|---|
| **Add a date** | the turn filed exactly one to-do with no date | opens that row's date field: 023's sheet on the phones, the edit modal on the web |
| **Add to {calendar}** | the turn filed exactly one event or timed row that is on no calendar, and the account has exactly one writable calendar it approved | puts that one row on that calendar through the existing calendar write and its outward test. It never picks the calendar for the thread (owner, 2026-11-17). Undo takes it off. |
| **Remind me** | the turn filed exactly one dated row of the person's own, in a thread nobody else is in, that is not already asked about | switches on 042's Remind me for that row (`is_reminder`). 042's table still decides when; with a clock time, the reminder comes at that time, as 042 has it. Undo switches it off. |
| **Share with {name}** | the turn started a thread, its dump was typed or spoken by the person, and the dump names a connection by the name they go by | opens 022's share confirmation for that thread and that person. Nothing is sent from the pill. |
| **Directions** | the turn's one slice entry has a place 030 resolved | opens 030's directions link, as the row's own Directions does |

- **Order.** When more than two qualify, the first two in this order are shown: date, calendar, remind, share, directions.
- **The calendar's name** is drawn as it is stored, since somebody else may have written it, and is never a word of a sentence code writes.
- **The share pill** is never offered on a turn whose dump came from a mail, a connected calendar or anything else marked as not the person's own words (`derived_from_untrusted`): words somebody else wrote never lead to an outward action.

**What a tap sends.** A tap sends the turn and the pill's kind and nothing else. The server works out the row, the calendar or the person again from its own record of the turn. It checks that the caller is the turn's author, still a member of the thread and, where it matters, the row's author, and refuses otherwise (SEC-2, OFF-3).

### The undo line

A turn that wrote anything ends with one line, `UndoLine`'s new **turn** form.
- **What it shows.** The action's glyph. Then, in moss, what the turn did, in the record's words: *4 new*, *2 filed*, *Moved*, *2 ticked*, *Started*, *Remembered*, *Added*. On the right, **Undo**, with a 44 target.
- **The first eight seconds.** The line carries 043's clock, and Undo is 004's whole-turn Undo exactly as today: it reverses the turn, removes the dump and its files with the eight-second purge, and the turn leaves the conversation. If the server refuses, the turn comes back and its line becomes the failure with **Retry**, as 043 has it.
- **After that, until the next dump** (owner, 2026-11-17). The clock is gone and **Undo** stays. It now undoes **the filing and not the dump**:
  - it removes what the turn made;
  - it puts back what the turn changed, from the server's record;
  - **the dump and its files stay** in the conversation, and its slices fold to one line, *Undone*.
- **Nothing that changed since is overwritten.** A row or thread that anybody has changed since the turn is left as it is, using 026's `since` guard, and the line names it: *Undone, except Pay rent, which changed since*.
- **A late Undo that would take an event off a calendar** other people can see runs 019's outward test and confirms first (OFF-6). The owner's 2026-10-28 exception for shared calendars covers the first eight seconds only.
- **When the line retires.** The next dump in the conversation retires **Undo**, and the line keeps its summary alone. The server has no window of its own (004). The client rule decides only when the button is drawn; the server-side bounds are the `since` guard and the confirm.
- **Where the plate line still appears.** A dump filed from a page whose plate shows no conversation (Today, Threads, Memories) keeps 043's plate line exactly as it is.

### The source line

When the turn read the web, the domains it read show as one quiet line under the pills:
- the `link` glyph, then the domains in `--text-tertiary` at `--size-caption`, with no border;
- each domain is tappable and opens its page, as the chip did;
- up to three are shown, then *and N more*, as text;
- the label is a registrable domain from the read record, unchanged from 016.

### Where the words come from

- **Code writes:** everything in a slice, a pill, the undo line, the link line and the source line, from the turn's record and the rows as stored.
- **The model writes:** only what it writes today, which is a `say` for one of its six reasons and an answer's sentence. An answer's sentence stays what 013 asks for: a count or a short sentence, never the rows typed out.
- **The reply's strings are for display only.** No slice or pill string ever goes into a prompt.

### Over time

A conversation reopened later draws its slices from the rows as they are now, **read with the reader's live access** (OFF-3, SEC-2):
- A row deleted since is gone from its slice.
- A row moved since is shown in its new thread, if the reader is a member of it.
- A row in a thread the reader is no longer in, or a thread they have left, is not shown and its thread is never named.
- A slice with nothing left in it reads *Since removed*.

### What leaves offload

Nothing new. Analytics events and traces for a reply carry the turn id, the slice and pill kinds, counts and outcomes, and never a title, a name, a domain or a place (OFF-1).

### Not changed

- The tools and what a turn writes. What the model is asked changes in the one line above.
- The thinking row, the writing indicator and the progress line.
- A refusal or *Not sure.* draws no slice.

## Acceptance criteria

**Server** marks the ones a client test cannot reach.

### What a filing turn draws

- **AC-1** A filing turn draws no Done mark, no thread pill and no source pill, on any surface.
- **AC-2** A dump of four groceries draws:
  - a list slice headed by Groceries' icon, name and open count, with up to two open rows filed before the turn, the nearest in the thread's order;
  - then the four new rows with the change mark;
  - then an undo line reading *4 new*.

  Undo within eight seconds removes the turn as today.
- **AC-3** A dump that files an event dated this week or next draws the two-week grid with that day filled blue, today outlined and lifted days dotted by kind, and the event under the grid with its time.
- **AC-4** An event dated beyond next week draws its month with the weeks away beside the name. The grid has no arrows, no Today control and no swipe. Tapping another day lists that day's entries.
- **AC-5** Tapping an entry under a grid expands its details in the reply, and a second tap folds it. The details are:
  - the span;
  - the place, with Directions, when it resolved;
  - the thread;
  - the calendar's dot and name, or *not on a calendar*.
- **AC-6** A 60-character title is shown whole, wrapped, in the entry list at the narrowest supported width on each surface (320pt iOS, 360dp Android, the web composer's minimum), and at the largest text size. The grid shows only dots.
- **AC-7** A dump that starts a thread draws the thread's inside under **New thread**, with what the turn put in it marked.
- **AC-8** A remember draws the kind's Memories group with the new memory marked, and Undo removes it.
- **AC-9** A tick or an edit the turn made to an existing row shows in its slice: ticked rows are struck, and an edited event sits on its new day with its previous time in its meta (*was Friday 20, 3pm*).
- **AC-10** A dump that reached four threads draws three slices in the order written, then *Also in {thread}* with the fourth thread as a link.

### What an answer draws

- **AC-11** An answer about a thread draws the list slice with the rows, count and tails 013's card had. An answer about a span draws a calendar slice and a count sentence. A dated web answer draws the month with the date shown.

### Pills

- **AC-12** Pills follow the table:
  - at most two per turn, in the stated order;
  - none on a turn that only answered, ticked or remembered;
  - none on a turn that asked a question;
  - none where more than one row qualifies.
- **AC-13** **Add to {calendar}** puts that row on that calendar, and the thread's calendar picks are unchanged afterwards. It confirms first exactly when 019's outward test says so, and Undo takes the event off.
- **AC-14** **Share with {name}** opens 022's confirmation, and nothing is shared until it is confirmed. It is never offered on a turn whose dump is `derived_from_untrusted` or came from mail or a calendar.
- **AC-15** **Remind me** switches on the row's Remind me. The row then shows 042's bell and its reminders follow 042's table. Undo switches it off. It is never offered in a thread somebody else is in.
- **AC-16** *(server)* A pill tap sends the turn and the kind only. A tap on another account's turn is refused, and so is a tap after the caller left the thread.

### The undo line

- **AC-17** After eight seconds, until the next dump, Undo removes what the turn made and puts back what it changed: unticks, the event back at its previous time, on the calendar too. The dump and its files stay, and the slices fold to *Undone*. After the next dump the line shows its summary alone.
- **AC-18** *(server)* A late Undo leaves a row that somebody changed after the turn as it is, and names it in the result's `changed`. A second dump sent within the first turn's eight seconds does not empty the first turn's Undo. Previous values come from the server's record of the turn, never from the client.
- **AC-19** *(server)* A late Undo that would remove an event from a calendar other people can see confirms first. Within eight seconds it does not, as 2026-10-28 has it.
- **AC-20** When the server refuses an Undo or cannot be reached, the turn comes back as it was and the line shows the failure with Retry.
- **AC-21** A dump filed in the conversation draws no 043 plate line. One filed from Today, Threads or Memories still does.

### The source line, the words and later

- **AC-22** Web sources show as one quiet line under the pills, with up to three domains and then a count. No source is drawn as a pill.
- **AC-23** Every word in a slice, pill, undo line, link line and source line comes from code. A test feeds a turn record and asserts the strings, with no model call.
- **AC-24** *(server)* In a reopened conversation:
  - a deleted row is gone from its slice;
  - a moved row shows in its new thread when the reader is a member there, and otherwise is not shown and its thread is not named;
  - a slice in a thread the reader left reads *Since removed*.
- **AC-25** A partial turn draws slices for what landed. A cancelled or failed turn draws none. Offline, a reopened reply draws its undo line's summary.

### Accessibility, records and egress

- **AC-26** Every control in a reply has a 44px target. Entries expose their expanded state to assistive technology. The day being shown is announced, not only coloured.
- **AC-27** *(server)* The turn's record of previous values is deleted with the account, included in the export (035), and purged once its turn can no longer be undone. It keeps offload's own fields and a source reference, never a connected app's raw body (OFF-4).
- **AC-29** *(eval)* Asked *what's on this week?*, the answer is the count and nothing listed, under principle 17's new cases. Asked *which calendars do you read?*, the answer still lists them.
- **AC-28** *(server)* No analytics event, trace or log line for a reply carries a title, a name, a domain or a place.

## Out of scope

- **Layout-specific slices.** A gallery, project or timeline thread is drawn as rows in v1. The board's gallery slice for the sofa is a later step.
- **Browsing a calendar from a reply.** No arrows, no Today, no paging (owner, 2026-11-17). Today's page is where months are browsed.
- **A reminder at a moment the person picks** (*the day before*). The pill asks for a reminder, and 042 still decides when it comes.
- **Add a place** and **Add dates** to a thread. Neither has a field to open today.
- **Changing what a turn writes**, beyond recording the turn's changes, and any prompt change beyond the answer prompt's one line.
- **New tokens.** Every paint is an existing alias.

## Decided with the owner, 2026-11-17

- **The turn's record.** It holds the ids and previous values of every row and thread the turn changed. The owner chose this over recording ids only.
- **The undo line** stays until the next dump.
- **A late Undo** (after eight seconds) undoes the filing and keeps the dump. It is guarded by `since`, and a shared-calendar removal confirms.
- **Reminders work both ways.** offload's own reminders are unchanged, and a pill asks for one, with 042's table still choosing when. The pill is offered only in a thread nobody else is in.
- **The change mark** plays once.
- **Add to a calendar** puts that one event on the calendar and never picks the calendar for the thread.
- **The calendar slice** shows only the turn's period, with no arrows and no Today control.
- **The source line** sits under the pills, not above them.

## Review, 2026-11-17

Three reviews ran on the first draft: project lead, client and security.

**Changed:**
- **Late Undo.** It no longer deletes the dump, it skips rows changed since, and a shared-calendar removal confirms (owner).
- **Slices.** They are read with live membership.
- **Pill taps.** They carry only the turn and the kind; the server re-derives the target.
- **The share pill.** It is not offered for words somebody else wrote.
- **Remind me.** Not offered in shared threads.
- **The record of previous values.** It is in deletion and export, and purged once its turn can no longer be undone.
- **Egress.** One stated rule.
- **Strings.** Display only, never in a prompt.
- **Header and count.** These match the built `AnswerResult`: the thread's icon, and no zero count.
- **The grid.** Its arrows and Today control are gone (owner), and a day tap is specified.
- **Pills.** Drawn on `Chip` geometry with the 24-character cap; the calendar pill drops the title; none on a turn that asks.
- **The fourth destination.** It became a named link line.
- **The neighbour rows.** Defined as a query.
- **States.** Added for partial, cancelled, offline and failed Undo.
- **The undo line.** Named as a fourth `UndoLine` form.
- **AC-6.** Given per-surface widths.
- **Accent.** The change mark is a background, so a to-do's blue dot never puts a second accent on a row.

**Not changed:**
- **Details in place stays.** The owner asked for details right in the chat, so the project lead's suggestion to open the row sheet instead was not taken.
- **Remind me stays.** The owner wants both offload's reminders and the person's ask.
