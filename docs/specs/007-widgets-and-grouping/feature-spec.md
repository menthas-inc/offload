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

*`decisions.md` records thread-scoped configuration as a gap deferred to the connector spec. This is the smaller half of it arriving early. A thread-scoped calendar connection is still deferred there.*

### The rest of the actions

005 shipped edit, archive, move, delete and rename, because those work on a note. The ones that need 006's fields arrive here: ticking a task off, and changing a priority. Both are available to any member, both reversible, both on the reversible allowlist before they ship.

## Acceptance criteria

- **AC-1** A thread renders a widget only when its own content justifies one, and never renders one empty.
- **AC-2** A widget is a view: a piece of content removed from one is gone from both. **And nothing is printed twice**: content a widget has shown does not also appear in the list below, which is headed "Everything else" when anything was lifted out and "Everything in here" when nothing was.
- **AC-3** Widget order comes from the thread's preference when there is one and from what the thread holds when there is not. There is exactly one ordering mechanism.
- **AC-4** A widget groups by the dimension the thread names and renders one flat list when it names none.
- **AC-5** Content with no tag in the grouping dimension appears in exactly one unnamed group, last.
- **AC-6** Enumerating which dimensions a thread actually uses is a stated query with a stated cost, not an incidental scan.
- **AC-7** Any member can tick, un-tick and reprioritise. All three are reversible and on the allowlist before shipping.
- **AC-7a** `set_thread_preference` is membership-checked per call and reversible, and it is on the allowlist. It arrives with `threads.attrs`, not before it.
- **AC-8** A priority a person set is marked as such and offload does not overwrite it.
- **AC-9** The page's query count still does not grow with the number of widgets a thread earns.
- **AC-10** Widget parity: the contract is defined once and the phones render the same widgets from the same data.

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
