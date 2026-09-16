# 007 Widgets and grouping, feature spec

> The what and the why. No tech choices; those are in `impl-spec.md`.
>
> Sketched during the 005 review and built on 2026-09-03, once 006 gave it something to arrange.

## Why

005 makes a thread readable. 006 makes offload produce types, dates, tags, priorities and places. Neither arranges anything: a thread is one flat list, ordered by recency, whatever is in it.

The kits draw something quite different. A trip leads with a map. A build leads with its files. A house thread leads with what needs doing. A to-do list in a travel thread groups by city. That arrangement is the difference between a list you scroll and a place you understand, and it is the whole reason the thread page is worth building at all.

## What

Two mechanisms, deliberately different, and keeping them different is most of the design.

### Widgets are earned

A widget splits content by what it **is**. A map when the thread has locations, a timeline when it has dated content, a file grid when it has assets, a to-do list when it has unfinished tasks.

**Nobody configures a widget into existence.** A thread earns one from its own contents, and loses it when the contents go. That is the kit's own rule, in its own words: *"widgets a thread earns from its own contents."* It is what stops the product asking people to set a thread up, which is filing by another name.

A widget is a **view, never a store**. Every row in a widget is a row in the thread, and removing it from one removes it from both.

**It is not printed twice, though.** Content a widget has already shown is lifted out of the list below, and that list is called "Everything else" once anything has been lifted. Printing a task in the to-do list and again underneath is the same information twice, and it makes a thread look longer than it is. Where no widget took anything, the list is still "Everything in here", because otherwise it is "else" to nothing.

### Groups are asked for

A group splits content inside a widget by what it is **about**, using tags. A to-do list in a travel thread groups by city; the same list in a house thread groups by room, or by nothing.

006 produces namespaced tags, `city:alfama`, `room:kitchen`, `shop:lidl`, normalised and one value per dimension. A thread names the dimension it groups by. Content with no tag in that dimension falls into one unnamed group, last, so nothing is ever invisible for not being tagged. A bare tag has the implicit dimension `tag`.

### One ordering signal, not two

**Widget order is a per-thread preference and there is no second mechanism.** An early draft described both "a preference for what order the widgets come in" and "widgets have a priority of their own, one level up", which are the same thing under two names, and two names is how a precedence rule gets forgotten. One preference. When a thread has none, the order is derived from what it actually holds, so a trip full of places leads with the map without anyone choosing.

Content ordering is `priority` from 006, then recency. Also one signal.

### Preferences belong to the thread and can be spoken

**Their storage arrives here, which is why the tool that writes them does too.** An early draft put `set_thread_preference` in 006, a version ahead of any column to write it into: `threads` has never had an `attrs`, unlike `content` and `messages`. The column, the tool and the screen that reads them land together.

Two, both optional, both settable by a person and by offload through `set_thread_preference`:

- which dimension each widget groups by
- what order the widgets come in

**And a third, from 2026-09-15, settable by a person alone and theirs alone:** whether the finished rows of To do are folded away. It is a preference of the person rather than a state of the screen, so a list somebody tidied is still tidy on their phone and after a refresh, which is what a control that reset on every visit was not. It is not the thread's: which finished rows you have put away is about what you have read, not about how the thread is arranged, so one member folding a shared list folds it for nobody else. It lives on the membership row and the clients read it as part of the one preference object. offload has no reason to fold a list and the tool does not carry it.

*`decisions.md` records thread-scoped configuration as a gap deferred to the connector spec. This is the smaller half of it arriving early. A thread-scoped calendar connection is still deferred there.*

### The rest of the actions

005 shipped edit, archive, move, delete and rename, because those work on a note. The ones that need 006's fields arrive here: ticking a task off, and changing a priority. Both are available to any member, both reversible, both on the reversible allowlist before they ship.

### Dragging a row is changing its priority

*Added 2026-09-16, as a tweak.* The To do list is ordered by priority and then recency, and until now the only way to move a row was to know that and type a number. A row carries a drag handle now, on every surface, and dragging it to a new place **changes its priority so the new order holds**: the row takes the midpoint between the two rows it was dropped between, which is the same reprioritise a person always had, pinned the same way, undoable the same way. There is no second ordering mechanism and no position column; the order is still one signal.

The rule, stated so the three surfaces cannot drift:

- The neighbours are the rows on screen. A filter or the fold hides rows, and a row dropped between two visible ones lands between those two whatever sits between them out of sight.
- Dropped at the top, the row goes above the first row, never past 100; at the bottom, below the last, never past 0.
- Two rows at the same priority order by recency, newest first, which is not where anybody dropped anything. So a tie is never good enough: when the two neighbours are adjacent or equal, the whole visible list is re-spread evenly across 0 to 100 with the moved row in its slot, and every row whose number changed is written and pinned. A list somebody arranged by hand is theirs.
- Only the rows still to do move. A finished row has sunk and sits by when it was ticked.
- The scale has 101 whole numbers, so a list of more than a hundred unfinished rows cannot be held apart and a drop in one may not stick. Stated rather than hidden; the page shows thirty.

"Everything in here" is ordered by recency alone and does not sort by priority, so it draws no handle and is unchanged.

## Acceptance criteria

- **AC-1** A thread renders a widget only when its own content justifies one, and never renders one empty.
- **AC-2** A widget is a view: a piece of content removed from one is gone from both. **And nothing is printed twice**: content a widget has shown does not also appear in the list below, which is headed "Everything else" when anything was lifted out and "Everything in here" when nothing was.
- **AC-3** Widget order comes from the thread's preference when there is one and from what the thread holds when there is not. There is exactly one ordering mechanism.
- **AC-4** A widget groups by the dimension the thread names and renders one flat list when it names none.
- **AC-5** Content with no tag in the grouping dimension appears in exactly one unnamed group, last.
- **AC-6** Enumerating which dimensions a thread actually uses is a stated query with a stated cost, not an incidental scan.
- **AC-7** Any member can tick, un-tick and reprioritise. All three are reversible and on the allowlist before shipping.
- **AC-7a** `set_thread_preference` is membership-checked per call and reversible, and it is on the allowlist. It arrives with `threads.attrs`, not before it.
- **AC-7b** The fold on To do is stored per member and read back on every surface: folded on web is folded on your phone and after a refresh, and on nobody else's. The count and the chevron are one control, so pressing "5 done" opens them.
- **AC-7c** An unfinished To do row can be dragged to a new place on web and both phones, from a handle at its leading edge, left of the checkbox, always drawn, and on web the focused handle also moves the row with the arrow keys. The drop is a reprioritise: the midpoint between the new neighbours, a re-spread of the visible list when they are adjacent, never past the ends of the scale, and never a tie. It is reversible, and one Undo puts back every number a re-spread wrote.
- **AC-8** A priority a person set is marked as such and offload does not overwrite it.
- **AC-9** The page's query count still does not grow with the number of widgets a thread earns.
- **AC-10** Widget parity: the contract is defined once and the phones render the same widgets from the same data.
- **AC-11** A section's heading counts what is live in it. To do counts open tasks, and the finished ones are counted only on the fold that hides them. Notes counts active notes, and the folded ones have their own control. Files and Places count what is drawn. Archived rows count towards none of these: they are their own view of the thread. *Added 2026-09-16. To do counted every task it held, so a list with three left said seven.*

## Depends on

- **005** for `archived_at`, the shell, the page and the authorization helpers.
- **006** for tags, priority, dates, types and places. Without them there is nothing to arrange.
- **Its own indexes.** 006 deliberately adds none for priority order, open tasks or dated content, because nothing in 005 or 006 reads them. This feature adds what it actually queries, in the column order its own queries want.

## Out of scope

- **The phones.** Parity is the goal and the contract is defined here; rendering it is its own work.
- **Real map tiles.** Pins on a plain surface, as the kits draw.
- **Recurrence, notifications, search, the agenda, Today.**

## What was open, and how it closed

- **`priority` versus `needs_attention`:** they never meet. Priority orders inside a thread; `needs_attention` decides what reaches Today, and nothing writes or reads it yet. Settled in 006 and unchanged here.
- **The group heading:** new surface, built from the kit's `Chip tone="accent"` vocabulary because `SectionHeader` is far too heavy for a sub-group. **The weakest thing in this feature**, because it is the only part with no drawn precedent, and the first thing for the design system to look at.
- **Filtering versus grouping:** only grouping is drawn. Both may eventually be wanted and shipping both without deciding which is primary is how a screen ends up with two ways to do one thing. Logged for the kit to decide.
