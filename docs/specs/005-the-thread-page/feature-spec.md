# 005 The thread page, feature spec

> The what and the why. No tech choices; those are in `impl-spec.md`.
>
> Revised after the review panel. What changed is at the bottom.

**Amended 2026-10-17 (the owner):** To do, Files and Notes fold from their heading, Files folded at first, kept per device for the account across threads. On the web a row's title opens the edit dialog rather than the detail pane. Your own row offers Archive beside Delete. What has passed (an event, a stay, a ticket, never a to-do) moves to the archived pile on its own once its last day is over, and search and a question about a window of dates still find it, after what is live. Logged in both decision logs.

## Why

004 made offload file what you dump. Nothing can look at what it filed.

That is not a missing screen, it is a broken promise with a paper trail. `/privacy` says every decision offload makes is "visible to you", and `decisions.md` records that claim as closing on 004. It did not: 004 closed "automatic" and "reversible" and left "visible" open, because there is nowhere to see a thread. This feature closes it.

It is also the screen that decides the rest of the product. Today is a view assembled from threads, the agenda is a view over dated content, search is a view over everything. All three are unbuildable while a thread is a row in Postgres. Build the thread and the others become arrangements of something that already exists.

## What

A thread is a place. It has a name, whoever else is in it, and everything that has been put in it. You can reach it, read it, open one piece of it and see where that came from, and fix it when offload got it wrong.

```
My threads                          Lisbon trip              [A][T] [Share]
                                    14 in here · Ana, Tom
  For now
  🔗 Lisbon trip      14            Everything in here  14
  🔗 Bookshelf build   9
  🔗 Dentist           5            🔗 Tram 28 runs every 11 minutes
                                       from Safari · 1h
  Always on                         🎤 "Oak brackets, 30cm, matte black"
  📖 Read later       23               you · 18m
  🏠 Flat admin        6            📷 Screenshot of the dimensions
                                       Ana · Tue
  Older threads
  🔗 Berlin, March    31
```

### This is deliberately the thin version

The thread page in the kits has a standing summary, a map, a timeline, a file grid and a to-do list grouped by tag. None of those can be built yet, and not because of effort:

- **Nothing writes a standing summary.** `memories` is specified in 001 and has never been migrated, and no code anywhere summarises a thread. **The block is simply absent**, which the web kit already did and the phones do not: a line saying offload has not summarised a thread is not information, it is an apology in the most prominent space on the screen.
- **Every widget is earned from content that does not exist.** A map needs locations, a timeline needs dates, a to-do list needs tasks. 004 writes exactly one shape: a `note` with a title. A widget drawn over nothing is a widget drawn for nobody.
- **Grouping needs tags, and nothing produces tags.**

So this feature ships the shell, the way in, the page, and the actions that work on what actually exists today. 006 makes offload produce types, dates, tags, priorities and places. 007 builds the widget and grouping system on top, once there is something for it to arrange.

*Ordering it the other way was tempting and wrong. A field invented before a screen tells you nothing; a screen tells you exactly which fields it needs. But a screen drawn over fields that do not exist tells you nothing either. The cut is: build what can be true now.*

### The shell, because there is no way in

`apps/web` has standalone pages and no application shell. The kit's is a sidebar plus a stack of panes, two on screen, where opening a thread pushes a pane in from the right and opening a piece of content pushes another beside it. Under 1180px it collapses to one pane and the crumb becomes a back button.

A thread page with no way to reach it is not a feature, so the shell and **My threads** are part of this one. My threads groups into For now, Always on and Older threads, which are `always_on` and a staleness rule over `last_activity_at`. Both columns already exist.

### What anyone in a thread may do

The product has one permission, stated identically everywhere: they can add to it, and they can never delete what is yours.

That was written about deletion and leaves the middle undefined, which this screen is made of. Settled here, and OFF-3 is unchanged:

| | Anyone in the thread | Only the author |
| --- | --- | --- |
| Edit a title or a note | ✓ | |
| Archive it out of the active list | ✓ | |
| Move it to another thread | | ✓ |
| Delete it | | ✓ |

**Archive is what makes co-ownership work.** Without it, a shared list accumulates rows only their author can clear, which is the friction that makes people abandon a shared list. Archive is reversible, non-destructive and available to everyone; delete is none of those and stays with the author.

**Move is author-only, and this is a correction.** An earlier draft let any member move any content anywhere they themselves could reach. That is a delete with extra steps: Bob moves Alice's content into a thread Alice is not in, and it is gone from her view, unrecoverable, with no consent and no notice. Worse than the delete OFF-3 protects against, because delete is at least the author's own.

A middle position was available, letting a non-author move within the author's reach, and the product owner chose the simpler rule instead. **Moving is the author's, like deleting.** It changes which people can see something, which makes it a sharing decision, and sharing is outward facing. It also means one sentence describes the whole permission model rather than two: *what you put in a thread stays where you put it until you move it, and everyone can help with the rest.*

### Undo, everywhere

OFF-6 has no exception for small changes. Every action here is reversible for eight seconds:

- **Edit, move, rename.** The value that was there is put back.
- **Archive and delete.** Soft, under a `purge_after`, on the mechanism 004 built.

The reversible allowlist in `decisions.md` gains **archive** in the same change. Everything else here is already on it.

## Acceptance criteria

**Getting there**

- **AC-1** My threads lists every thread the account is an accepted member of, grouped For now, Always on and Older, with a count on each. The count is what is live in the thread, neither archived nor deleted, and it is the same number the thread's own pane head shows. A thread is reachable from it in one click. *Amended 2026-09-16: it counted archived rows, and the pane head did not.*
- **AC-2** Opening a thread and then a piece of content shows both at once on a wide window, and one at a time on a narrow one, with a way back.
- **AC-3** An account with no threads sees an invitation, not a zero.

**The page**

- **AC-4** A thread renders its name, the members already in it, and its content. A thread offload has not summarised shows nothing where a summary would be, rather than a line saying so.
- **AC-5** Everything the page needs is fetched in a fixed number of queries that does not grow with the size of the thread, and every one is an indexed lookup. The same query shape serves the agent plane when it reads a thread, so it is bounded for both.
- **AC-6** Content is paginated on a stable cursor. The heavy case is 500 rows in one thread and the page must not fetch them to show twelve.
- **AC-7** A thread with nothing in it renders an invitation, not a zero.
- **AC-8** A count shown anywhere matches what a query for that content returns. A denormalised count that has drifted is a defect, not a cache.

**Acting on something**

- **AC-9** Any accepted member can edit and archive any content in the thread. Enforced server-side against membership, per call.
- **AC-10** Only the author can delete. Enforced server-side, per row, by author. A member who is not the author is not shown the control and is refused if they call it anyway.
- **AC-11** Only the author can move content, to any thread they are an accepted member of. Enforced server-side, per row, by author, on the same predicate delete uses. A non-author is not shown the control and is refused if they call it anyway.
- **AC-12** Moving adjusts both threads' counts in one transaction.
- **AC-13** Renaming a thread is one action, reversible, and does not touch its content.
- **AC-14** Every action here is reversible for eight seconds, and nothing is destroyed inside that window.
- **AC-15** Archiving is not deleting. An archived row is still readable, still counted separately, and still restorable after the toast has gone.

**Truthfulness and provenance**

- **AC-16** Opening a piece of content shows the dump it came from and who added it.
- **AC-17** Provenance never names a thread the viewer is not a member of. Content moved between threads does not carry the old thread's name to people who were never in it.
- **AC-18** No dumped text, thread name or content title reaches an analytics event, a log or a trace. *Tags join that list in 006; naming them here would be a criterion about a column that does not exist.*

## Out of scope

Named rather than implied, because most of these are things the kit draws.

- **The standing summary.** Nothing writes one. `memories` stays uncreated until the feature that writes it, on the same argument `0008` used for not creating `things` early.
- **Widgets, grouping and thread preferences.** 007, after 006 produces something to arrange.
- **Tags, priorities, dates, types and locations.** None of them are produced until 006, so none of them are rendered here. **Priority included**: there is no priority column and nothing sets one, and ordering here is recency.
- **Ticking things off.** There are no tasks until 006.
- **Inviting anybody.** Members are rendered; invitation is its own feature.
- **The phones.** Web, again, because the loop is a browser refresh.
- **Creating a thread by hand.** offload creates threads. A product whose pitch is that you never file anything does not open with a New Thread button.
- **Today, the agenda, search, the calendar.** All views over what this makes visible.
- **Recurrence and notifications.** Their own specs.

## Where the design says something different

Logged here and in the design system's `decisions.md`, per OFF-7.

- **The phones render "offload has not summarised this one yet" and web renders nothing.** `WThing.jsx`'s `{st ? ... : null}` is the correct one: a line saying offload has not done something is not information. The phones are what has to catch up, by deleting theirs.
- **The kit shows `pencil` and `trash-2` on every row unconditionally.** Delete is author-only, so the control is conditional on authorship.
- **The kit's thread rows carry an `archive` tool with no archived state drawn anywhere.** Archive gains a destination in this feature: an archived section, or a filter, and that is new surface.

## What the review changed

- **The scope was three features and is now one.** Both reviewers said so independently and the shell being absent from the codebase confirmed it. The widget and grouping system moved to 007, behind 006, because grouping needs tags and nothing produces tags.
- **Priority was assumed to exist.** It was described as something offload already sets, given an acceptance criterion, and left off the out-of-scope list that names tags and dates. There is no priority column. It moved to 006 with everything else that has to be produced before it can be read, and its relationship to `needs_attention` is 007's problem rather than a silent collision.
- **Move by a non-author was a delete with extra steps.** The security review traced it: Bob moves Alice's content to a thread Alice is not in, and it is unrecoverable by her. The destination check only looked at the mover. The product owner's call was the simpler of the two fixes: moving is the author's, like deleting.
- **Provenance after a move could leak a thread name** to people who were never in the source thread. AC-17 exists because of that.
- **Archive was not on the reversible allowlist.** OFF-6 says an action is reversible only once listed, and listing it is now part of this change.
- **The standing summary had no writer**, which nothing in the first draft said out loud.

## Amended 2026-09-29

**The line under a thread's name is what is open in it, by kind, and who with**, where it was a total and the other members: "15 to do, 3 links", or in a shared thread one kind and the people by first name, "6 to do, with Ana and 2 more". A to-do counts while unticked, an event until it ends, nothing archived counts, and there is never "you". An empty thread of your own has no line. Composed on the server for My threads and carried on the thread bundle as `line` for the web's head. Logged in both decision logs under 2026-09-29.
