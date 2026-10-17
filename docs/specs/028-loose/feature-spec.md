# 028 Not in a thread

**Status:** drafted 2026-10-01 against the design handoff of the same day (`handoff/APPLY-2026-10-01-loose.md`, `explorations/loose-items.html`, the readme's **Not in a thread** section, `ui_kits/mobile_app/LooseParts.jsx`). Revised the same day with the product owner's two rounds of answers and the project-lead, client and security reviews. The design files are read from the zip and sync to `.claude/skills/offload-design/` on their own branch from `main`, as 027's did.
**Surfaces:** iOS, Android, web, the Core API and the agent.
**Depends on:** 004, which made the default thread; 005 and 014, whose rows and notes the group draws; 013, whose answers name a thread; 016 and 026, whose untrusted reads gate a suggestion; 018, whose photo question stays; 020, whose blobs move with a row; 022, which already refuses sharing the default thread; 024 and 027, whose Activity, Today and thread pill this touches; 025, whose labels and row tools this touches.
**Amends:** the readme's **Always on** group and the moss role's mention of it; 004's partial reply *Saved to Miscellaneous.*; 014, in that a note can move between threads; 025's live labeller and nightly sort, which skip the default thread; the web's row edit, which gains Move; `decisions.md`'s reversible allowlist, for a suggested move into a shared thread; the privacy policy's *Nothing arrives in a shared thread by accident*.


*Amended 2026-10-02 by 032: the daily pass is the default thread's nightly pass, booked as `thread.nightly` with proposals, and posted to `/internal/v1/nightly-result`. What it proposes and every rule its endpoint held are unchanged.*

## Why

A dump with no obvious home goes in the account's default thread, which is drawn as a thread called Miscellaneous under a heading, Always on, that it has to itself. That makes the one place offload could not decide look like a decision: a person sees a thread they never made, with a name they never chose, filling with unrelated things. Nothing in it can be found by browsing, and nothing helps it leave.

The design decided on 1 October says a thing can be put down without belonging anywhere, and that is a **state, not a thread**. Those things are drawn as themselves, sorted by what they are, and offload offers, on the row, where each could go.

## What

### Vocabulary

**Not in a thread** is the state, the group on My threads and the screen it opens. In schema and code the state is "in the account's default thread", which stays where it is, and the code's short word for it is **loose** (`loose`, `/loose`), an identifier only: no copy a person reads says loose, default thread, Miscellaneous, unsorted or inbox. A **suggestion** is the one button under a row: **Move to** an existing thread, or **Create** a new one, which comes from a **proposal**. Accepting is a tap on it; the cross **dismisses** it.

### 1. Always on goes

My threads is one list by last activity, then *Older threads*, which is about time only: thirty days without activity, as now. The *Always on* heading, its accent tone and its group are gone on every surface. The only thread that was ever in it is the default thread, which section 2 takes out. `threads.always_on` stays in the schema, read by nothing, and new defaults stop setting it.

### 2. The default thread is never drawn as a thread

Storage does not change: what has no home is still in the account's default thread, and the server still reads it for search, answering and the model. It is never drawn as one. **The rule: no surface that names a thread names this one.** The test list:

- My threads, in either group; the web sidebar's recent threads; either move sheet's list, so nothing can be moved *into* it by hand.
- A thread pill or thread name on a Today row, event or question card; a turn footer; a widget; the timeline; a web crumb.
- An answer's found result. Its header reads *Not in a thread*, without the lasso, and opens the full list; its foot reads *3 more not in a thread.*
- Activity and notification words. A forwarded email filed only into it says its title alone, with no *in* clause. Nothing labels inside it (below), so no *Labelled 3 in ...* line can name it.
- Its page. A link, a notification or an Activity row that would open it opens **Not in a thread** instead, after one spinner and never a flash of a thread page. Only the caller's own default thread redirects; any other id answers as it does today. Anything that would open one of its rows still opens that row.

It stays unshareable and undeletable, as 022 and 004 already refuse; the swipe refusal on My threads (*This thread can't be deleted...*) and the web's disabled delete go with its row. **Labels:** 025's live labeller and nightly sort skip it, since a label on a loose row would be drawn nowhere and removable nowhere.

### 3. The group on My threads

**Where.** After the last thread of the first list, before *Older threads*. **Not drawn when there is nothing in it**, and nothing takes its place.

**What is in it.** In the default thread: content rows that are not deleted, not archived and, for a to-do, not ticked off; and its current notes (not deleted, not superseded). Newest first, by when each was put down. A muted note is drawn muted, as the thread page draws it. The three rows on My threads can be any mix of content and notes.

**Heading.** My threads' own section heading, *Not in a thread*, 21px semibold, with the count in the neutral count pill: `--surface-fill` on the phones, and on the web a neutral variant of the section count, which today has only the attention and accent tones (logged).

**Chips.** Under the heading, only when two or more types are present: *All* first, then one per type present in this order, each with its count. They are 025's filter bar and `Chip`: a 30px pill (32 on Android) on `min-height` in a 44px target, selected inverting to ink on all three platforms. The row scrolls sideways past the gutter; it is a group named *Filter by type*, each chip pressed or not.

| Chip | What it holds | Glyph |
| --- | --- | --- |
| To-dos | content `task` | `square-check-big` |
| Links | content `link` | `link` |
| Photos | content `image` and `screenshot` | `image` |
| Notes | the notes | `text-quote` |
| Events | content `event` | `calendar` |
| Places | content `location` | `map-pin` |
| Voice notes | content `voice` | `mic` |
| Files | content `file` | `file` |

A chip **filters the group in place**: still at most three rows, then the link names the type, *All 5 links*. The pick is not kept across visits; My threads opens on *All*. When the picked type's last row leaves, the filter falls back to *All*; when fewer than two types remain, the chips go.

**Rows.** The thing itself, as the kit draws it: a 36px type tile (a photo's or link's own picture where the thread page draws one), and the title at 15.5/21 medium on one line. No meta line: the tile already says what it is, and *To-do · Thursday* under every row was a line of space saying it twice (2026-10-05). An archived row on the full list still says when it was archived. Rows sit on `min-height`, 60 on the phones and 52 on the web, with an inset hairline after the tile as list rows do. No thread slot, no labels, no handle. A to-do leads with the thread page's checkbox in the tile's place (2026-10-05): the web had no way to tick one at all, and the phones only through a long press. Then the row's suggestion, if it has one (section 5), with the row aligning to its top.

- **Tap** opens the row exactly as the thread page does: one's own content row opens its edit sheet, someone else's opens its action sheet, a note opens the note sheet.
- **On the phones** a swipe deletes, with the eight-second Undo; Move is in the row's action sheet. **On the web** the row carries the thread page's hover tools, edit and delete, and Move is in the edit modal (below).
- **Move** opens the move sheet, whose list never includes the default thread. A moved row leaves the group as a deleted row does, and the toast says *Moved to Lisbon trip*, with Undo. When the person has no other thread, the move sheet says what it says today, *There is no other thread to move it to.*

**Three rows,** then *All 14*, or *All 5 links* when a chip is on: 14px medium `--text-secondary` with a chevron, a 44px target, not drawn when the list it would open holds three or fewer. It opens the full list, filtered to the chip that was on.

### 4. The full list

A pushed screen on the phones (the app bar is back and the title, nothing else; Android's 64px bar with its 22px title) and a pane on the web, titled *Not in a thread*, with the line *Put down without a thread, newest first.* Then the same chips, which filter the whole list here and keep their counts, then every row with its suggestion, read a page at a time. The composer and the tabs stay, as on every screen: a dump from here is filed like any other.

**At the end of the list**, when any exist, the thread page's archived foot row, *3 archived*, opens the default thread's archived rows the way the thread page opens its own, with Put back. Folded notes are not reached from here (out of scope).

**States.** Loading is one spinner, no skeleton. A read that fails says *Couldn't load these* with Try again; a next page that fails says it under the last row. Empty is the title *Nothing in here yet* alone, with no mark (the lasso is a thread's mark); the screen stays until the person goes back. Neither client has the design system's `EmptyState` yet, which the design log records.

### 5. Suggestions

**One, at most, per row**, content or note, and most rows carry none. A suggestion is only ever drawn on a row that is in the default thread.

**Move to** an existing thread. Written by offload at filing time, when it filed something in the default thread but had a thread in mind it was not sure enough to file into. **Never from a turn that read anything untrusted**: a forwarded email, a calendar, or a web page. **A shared thread can be suggested**; the button then draws up to two of its other members as initials marks after the name, then *+N*, so the person sees who will see it before they tap. A suggestion whose thread the person has left, or that has been deleted, is no longer drawn. A note derived from an email or a calendar never carries one.

**Create** a new thread. Written by a daily pass over what is not in a thread, **only for two to ten things that belong together**, each pointing at the same proposal. Never for one thing. The pass looks at a bounded, newest-first set of rows that carry no suggestion and were never dismissed, only on days that set has changed, and is behind a switch that is on from the merge. A proposal whose undismissed, still-loose things fall below two is drawn on none of them and is removed.

**Drawing.** Under the row's title, 8px down, one button and a cross.
- *Move to*: `--surface-accent-soft` ground, `sparkles` 13px in `--moss-600`, *Move to* 13px `--text-secondary`, then `lasso` 12px and the thread's name in `--moss-700` medium, then the faces when it is shared. Pill radius, 8 on Android.
- *Create*: `--surface-raised` ground with a 1px dashed `--moss-600` outline, `sparkles`, *Create*, `plus` and the proposed name in `--moss-700` medium, then *new thread* in `--text-secondary`.
- At least 32px tall on `min-height`. The name ellipsises before the faces drop; the button never wraps. The name is a label, never a link: the button's accessible name is the action, *Move Boiler service receipt to Flat admin* or *Create Kitchen shelves and move 3 into it*, and the inner name is hidden from assistive tech.
- The cross is a 44px target with its 14px glyph, named *Dismiss suggestion*, and the two targets do not overlap.

**Accepting.**
- *Move to* moves at once: the row leaves, the toast says *Moved to Flat admin* with Undo, and Undo moves it back with its suggestion. Moving into a shared thread does nothing more than a move from the sheet does: the members' 024 notification, if any, is the ordinary ten-minute bucket, after the Undo window.
- *Create* opens a sheet on the phones and a modal on the web: *Create a thread*, *These three look like they belong together.* (the count in words, *two* to *nine* and a number from ten, as labels count (2026-10-17); not *one project*, since **project** is on the vocabulary's never list), a name field prefilled with the proposal, *Moves into it* with each thing ticked and untickable down to one, then Cancel and *Create thread*. The name is 1 to 60 characters once trimmed, one line; over sixty, *A name is 60 characters at most.* sits under the field. On create: the thread is made with the person as its only member, the ticked things move into it, the proposal is spent, and the new thread opens. The toast says *Created Kitchen shelves*, with Undo. An unticked thing stays not in a thread and loses that suggestion.
- **Undo on Create** puts every moved thing back in the default thread with its suggestion, restores the proposal, and deletes the thread, as one write; the person lands on My threads. **Undo is refused once anything else has happened in the new thread** (something landed in it, it was renamed, or somebody was invited), and the toast says *Couldn't undo that*: the thread is the person's now, and nothing in it is destroyed.

**Dismissing.** The cross removes the suggestion from that row at once, with no toast, and that row is never given another suggestion of either kind. A dismissed row in a proposal does not dismiss the proposal for the others.

**Two devices.** Accepting a suggestion whose row already left, or a proposal already spent, is refused; the group reloads and the row is where it now is.

**Failures**, one clause and Try again, per action:
- Move to fails: the row comes back with its suggestion, *Couldn't move that*.
- Dismiss fails: the suggestion comes back, *Couldn't dismiss that*.
- Create fails: the sheet stays open with what was typed, nothing is made, *Couldn't create that*.
- Undo fails: *Couldn't put that back*.

**Where the names come from** is always the server's current reading: a thread renamed since the suggestion draws its new name.

### 6. offload's words

- **A turn that filed only into the default thread draws its footer's Done and nothing else**, like any silent filing: no pill, no words. The way to what landed is My threads.
- **A turn that stopped part way** says *Saved.* for what landed only in the default thread, and *Saved to Lisbon trip.* naming only threads.
- offload never names the default thread to a person, in a reply, an answer, a question or an Activity line. The model reads it as *not in a thread*, and is told a person may call it miscellaneous, unsorted or the inbox: "stop putting receipts in miscellaneous" still means it.
- 018's question for a wordless photo filed with no home stays exactly as it is. offload never writes a suggestion on a row it asked about.

### 7. Moving

**A row's move is refused unless the caller wrote it, or its author has left (008), and the caller is in the destination**: per row, by author, never per thread, one refusal for every reason. That is today's rule, now written down and now reachable on the web.

**A note moves the same way**, by the same rule: the note sheet's Move on the phones and the web, and *Move to* or *Create*. It keeps its words, its origin and its untrusted mark. It does not show its labels in the new thread, because a label belongs to a thread; Undo moves it back and they show again. The thread move's toast is *Moved to Lisbon trip*; a note dragged within its section still says *Moved*.

**The web's edit modal gains Move**, for every row that can move, in any thread, opening the web's move sheet. The row's hover tools stay two (025's tag is still the one exception).

**The move sheet gains no *New thread* row.** Creating a thread by hand is Create's sheet, which only offload's proposal opens. A person who wants a new thread still says so in the composer.

### 8. Existing accounts

The thread named *Miscellaneous* on every account stays the default thread, and its name is never shown again. Nothing migrates: what is in it today is the group on the next load, including any labels already on its rows, which stay stored and are no longer drawn.

## Acceptance criteria

**Always on and the default thread**

- **AC-1.** `/v1/threads` returns exactly two groups, `now` and `older`; a thread thirty days without activity is in `older` whatever it was before. No client draws *Always on*.
- **AC-2.** The default thread is in neither group, nor in the web sidebar, nor in either move sheet's list.
- **AC-3.** For a row in the default thread, a Today row, event or question card, a turn footer, a widget, the timeline and a web crumb draw no thread pill and no thread name; an answer's found result reads *Not in a thread* and *N more not in a thread.* and opens the full list.
- **AC-4.** Opening the caller's own default thread id on any client lands on *Not in a thread*; another account's default thread id answers 404 as any unknown thread does. The server still serves the bundle to search and answering.
- **AC-5.** The live labeller and the nightly label sort label nothing in the default thread.

**The group**

- **AC-6.** The group sits between the first list and *Older threads*, titled *Not in a thread* with the count of live content rows (not archived, not deleted, to-dos not ticked) plus current notes, and is not drawn when that count is zero. Its three rows may be notes.
- **AC-7.** Chips are drawn only when two or more types are present, *All* first, then the present types in the table's order, each with its count; images and screenshots count as Photos. The server returns the chip keys.
- **AC-8.** A chip narrows the group to that type, at most three rows, and the link reads *All N* plus the type's plural in lower case; *All* reads *All N*. The link is not drawn when the list it would open holds three or fewer. When the picked type empties, the filter returns to *All*.
- **AC-9.** A row draws its type tile (a to-do its checkbox) and its title, with no meta line, no thread slot and no labels; a tap opens the same sheet the thread page opens for it. Ticking a to-do takes it out at the press with *Ticked off* and Undo (2026-10-05).
- **AC-10.** A swipe on the phones and the delete tool on the web delete one row with an eight-second Undo that brings it back into the group.
- **AC-11.** Move on a loose row opens the move sheet without the default thread; picking a thread moves it with *Moved to* and the thread's name, and Undo.

**The full list**

- **AC-12.** *All N* opens the full list filtered to the chip that was on; its chips filter the whole list and carry their counts; the composer and tabs are present.
- **AC-13.** The full list reads in pages, newest first by when each was put down, and reaches every row however many there are, including across a page boundary with content and notes interleaved; an edit to a note does not move it.
- **AC-14.** The archived foot row appears when the default thread has archived rows, and opens them with Put back.
- **AC-15.** Loading, a failed read, a failed next page and the empty list each draw the state section 4 names.

**Suggestions**

- **AC-16.** A filing that lands in the default thread with a suggested thread writes a Move to suggestion; the row shows it under its title; accepting moves the row at once with *Moved to* and Undo, and Undo restores both the row and the suggestion.
- **AC-17.** A suggestion is never written for a thread the person is not an accepted member of, a deleted thread, the default thread, a row 018 asked about, a note marked untrusted, or **from a turn that read a forwarded email, a calendar or a web page**; one whose thread is later left or deleted is never drawn.
- **AC-18.** A Move to suggestion for a thread with other members draws up to two of them as initials marks and *+N* after the name.
- **AC-19.** The daily pass writes a Create proposal only over two to ten live, never-dismissed things in the default thread that carry no suggestion, from a set it was given, newest first and bounded; it runs only when that set changed since its last run and only while its switch is on.
- **AC-20.** Accepting Create opens the sheet with the name and every still-loose thing of the proposal ticked; the last ticked thing cannot be unticked; an empty, over-60-character or multi-line name disables *Create thread*, and the server refuses the same.
- **AC-21.** *Create thread* makes a thread with the person as its only member, moves the ticked things into it, spends the proposal, and opens the thread; an unticked thing stays loose with no suggestion. Any ticked id that is not in that proposal, not still loose or not the caller's is refused, and nothing moves.
- **AC-22.** Undo on *Created* within eight seconds returns every moved thing to the default thread with its suggestion, restores the proposal, deletes the thread and lands on My threads, in one write that destroys nothing in the person's things; once anything else has happened in the thread, Undo is refused with *Couldn't undo that*.
- **AC-23.** The cross removes the suggestion at once and that row never carries a suggestion again; a proposal whose undismissed loose things fall below two is drawn on none of them.
- **AC-24.** The suggestion's name is not a link: the whole button accepts, its accessible name is the action, and nothing in it opens the thread.
- **AC-25.** Each failure in section 5 draws its clause and Try again and leaves the row, suggestion or sheet as it was.
- **AC-26.** Accepting a suggestion whose row has left the default thread, or a spent proposal, is refused and the group reloads.

**Words**

- **AC-27.** A turn that filed only into the default thread draws Done and no pill and no reply; a stopped turn's partial reply says *Saved.* for it and never names the default thread.
- **AC-28.** A forwarded email filed only into the default thread writes an Activity line with no *in* clause.
- **AC-29.** No prompt, tool result, reply or Activity line names the default thread by its stored name; the model reads it as *not in a thread*.
- **AC-30.** 018's wordless-photo question is still asked, and a row it was asked about never carries a suggestion.

**Moving**

- **AC-31.** Moving a row or a note is refused unless the caller authored it (or its author has left) and is an accepted member of the destination, on every route and every surface.
- **AC-32.** A note's author can move it, on the phones and the web; it arrives showing no labels and keeps its origin and untrusted mark; Undo returns it to its thread showing its labels.
- **AC-33.** The web's edit modal carries Move for every row that can move, in any thread.

**Isolation and privacy**

- **AC-34.** Reads resolve through membership and the caller's own default thread, never a thread id from the client; accepting, dismissing, creating and moving are checked per row by author. Every refusal is one 404, whatever the reason.
- **AC-35.** The daily pass's logs, events and traces carry ids, counts, model, tokens, latency and outcome only: never a title, note text, thread name or proposed name.
- **AC-36.** The privacy policy states the suggestions, the daily pass, the dismissal record and the suggested move into a shared thread, in the words below, in the same branch.

## Edge cases

- **Archived rows already in the default thread** are reached from the full list's foot row.
- **A ticked to-do** leaves the group and the list; it is done. It is ticked from its checkbox on the row, on Today, or in its sheet, and the toast's Undo is the way back since the box leaves with the row (2026-10-05).
- **A row moved into a thread by hand** loses nothing; its suggestion is simply not drawn, because suggestions are drawn only on loose rows. Moved back by Undo, it draws again unless dismissed.
- **A Create proposal and a Move to suggestion never sit on the same row.**
- **A proposal's name is offload's words**, read by the person and editable before anything is made. It is plain text, one line, never markup or a link.
- **The default thread's notes are compacted nightly** (014), as they are today, which can merge or fold two loose notes offload wrote. A suggestion on a folded note goes with it.
- **The new thread** is renamed, shared or deleted afterwards like any other.
- **Phones still on an old build** receive two groups and a nullable thread name. They lose *Always on*, and with it the default thread, and may draw an empty pill where a name went. Alpha, invite only, phones rebuilt with the merge: accepted.
- **A brand new account** has only the default thread: everything dumped is in the group and Move has nowhere to go until offload makes a thread or Create is accepted.

## Out of scope

- Pinning a thread, which the design names as the answer if slow threads sinking bothers anybody.
- Moving something *into* not in a thread by hand, and a *New thread* row in the move sheet.
- Suggestions on rows inside threads; a Move to from the daily pass; a Create at filing time.
- 014's folded-note history and its over-budget line for the default thread. Folded loose notes remain in search and answering.
- Renaming the default thread in the database.

## Divergences from the kit

Logged as one entry in `.claude/skills/offload-design/decisions.md` before merge, with **Design system impact** filled in: the faces on a shared Move to (a new 20px initials mark); eight chip types against the kit's five; the chips as 025's `Chip` (30/32, ink selected on Android too) rather than 34px and moss; the web's create modal against the kit's side pane; Move in the web's edit modal; the toasts as plain strings (*Moved to Flat admin*, *Created Kitchen shelves*) rather than a pill on the toast; a leaving row leaving as a deleted row does, rather than the kit's tinted fade; the composer kept on the full list; the web's neutral section count.

## Privacy

The product owner approved on 2026-10-01 that the policy changes in this branch:
- *What offload makes from it* gains: **Suggestions.** When offload puts something down without a thread, it may suggest a thread it could go in, and once a day it looks over those things and may propose a new thread for two or more that belong together. Nothing moves until you tap the suggestion.
- *How long we keep it* gains: **A dismissed suggestion.** When you dismiss one, offload keeps a record that you did, with no words in it, so it never suggests anything for that thing again. It goes when the thing does. A proposal it no longer makes is removed.
- **What the owner accepted with the one-tap shared Move to:** a dump's own words, pasted from anywhere, can still steer which thread is suggested (only an email, a calendar or a web page are gated); the faces on the button and the tap are the control.
- *Sharing is a deliberate act* replaces *Nothing arrives in a shared thread by accident.* with: **Nothing arrives in a shared thread without you.** offload may suggest a shared thread for something you put down, and the suggestion shows who is in it; it moves only when you tap it, and you can undo it for a few seconds after.
