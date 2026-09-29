# 015 The timeline, feature spec

**Status:** drafted 2026-09-10
**Surfaces:** web, iOS, Android
**Depends on 014**, which made a dated sentence possible.

## Why

A thread knows when things happen and has nowhere to show it. What it has is a **Timeline widget**: a flat list of dated rows in priority order, drawn only when the thread has something dated, collapsing a repeating series into one line. It answers "what is on this thread" and never "what is this week".

Three things are wrong with that and they are the feature:

- **A list is not a shape for time.** Days with nothing in them do not exist in a list, so a fortnight of quiet reads the same as two days. The gap between things is most of what somebody is looking at when they open a thread about a trip.
- **It is earned, so it disappears.** A thread with nothing dated yet shows no timeline at all, which is exactly the thread where somebody is about to put a date on something.
- **Only two of the four things with dates are in it.** A note now carries dates (014) and never appears; a task's due date sorts it in a list that is ordered by priority instead.

## What

**A rail of days, always there, at the top of the thread.** Whole weeks, one row each, starting on Monday. Every day in the span gets a card, whether or not anything is on it, because the empty ones are what make a week read as a week.

**A dot per thing, coloured by what it is.** A day with three things has three dots. A thing that spans days puts a dot on every day it covers. A repeating thing puts a dot on every occurrence: a rail is a calendar shape, and a calendar draws every one of them, which is what `decisions.md` already says the phone's daily view should do.

**Everything with a date is on it**, whatever kind of thing it is: events, tasks with a due date, notes with a date, and anything else somebody dumped that carries one.

**Tap a day and it opens in place, under the rail.** What is on that day, each thing drawn as itself: a task with its checkbox, a note as a note, an event as an event. Everything you can do to a row anywhere else you can do here.

**Today is open when you arrive.**

**The past is quiet, not closed.** A day that has gone reads as gone, and tapping it works exactly like tapping any other day.

### The span, and what happens when it gets long

The rail covers whole weeks, from the week of the earliest dated thing to the week of the latest, and always includes this week. A thread with nothing dated draws no rail at all; the first date on anything brings it, with this week and that one.

**Past six weeks it stops being a rail and becomes a month.** Weeks read as time passing, which is the whole reason the empty days are drawn; a year of weeks is a scroll rather than a shape. So a long span draws the shape everybody already knows: one month, whole weeks including the days either side of it, a step back and forward, and **Today**, which is the way back from wherever stepping through months left somebody.

*This replaced a collapsed run of empty weeks, which made a year of nothing short without making it navigable. With months there is nothing to collapse.*

### The week starts on Monday, and that is a setting

Monday by default. Sunday for anyone who wants it, in Settings under Appearance, beside theme and text size, and kept on the device the way those are.

### The colours mean what a thing is

| | |
| --- | --- |
| A task | blue, the colour that already means waiting on you |
| An event | ink, a fact of the day rather than a demand on it |
| A note | amber, something known rather than something to do |
| Anything else with a date | quiet grey |

**A dot is never the only thing that says what a day holds.** The day's accessible name says the counts in words, and opening the day says it in full. Colour is the fast read, not the only read.

**Done is weight, not hue.** A finished task keeps its colour and loses its fill, so the legend stays about what a thing is.

### What this replaces

**The Timeline widget goes.** Its rows are on the rail and in the day beneath it, and it stops being a widget: 007's rule that widgets are earned from content and never drawn empty is untouched, because the timeline is no longer one of them. It moves above the widgets and belongs to the thread page.

*The series collapse does not go with it, and deleting it was wrong for a day.* A list spends a whole row saying what the row above said, which is why thirty yoga classes were collapsed into one; a rail has a cell per day already, so it draws every occurrence and hides nothing. Taking the widget away took the collapse with it and left the thread's own list showing all thirty, which is how it came back from a real account. `splitRepeating` belongs to every list and to no calendar.

## Acceptance criteria

**The rail**

- **AC-1** The timeline is on every thread with something dated on it, and not on one with nothing dated. *Reversed 2026-09-15: the original AC put an empty week on every thread, which contradicted the paragraph above that says the rail is earned. A week of empty cells above a list is a calendar for nothing.*
- **AC-2** The rail draws whole weeks, one row per week, starting on the day the week-start setting names.
- **AC-3** Every day in the span has a card, whether or not anything is on it.
- **AC-4** The span runs from the week of the earliest dated thing to the week of the latest, and always contains today.
- **AC-5** A span of more than six weeks draws as a month rather than as weeks: one month at a time, whole weeks including the days either side, with a step either way and a Today that returns to the current month and selects today.

**What is on it**

- **AC-6** A dated content row and a dated note both appear, and nothing on the rail depends on which store a thing came from.
- **AC-7** A thing that spans days has a dot on every day from its start to its end, inclusive.
- **AC-8** Every occurrence of a repeating thing has its own dot on its own day. Nothing is collapsed and nothing is hidden.
- **AC-9** A day with several things has several dots, coloured by what each thing is.
- **AC-9a** A day with anything on it is marked by the cell and not only by the dots: a quiet inward edge and a ground under it, so a week reads at a glance. The mark is an inset rather than a border, or the row shuffles by a pixel as things are added and ticked off.
- **AC-10** A day's accessible name says what it holds in words, so nothing depends on telling two colours apart.

**The day**

- **AC-11** Tapping a day opens it under the rail. Today is open on arrival.
- **AC-12** Each thing in the day is drawn as its own kind: a task with its checkbox, a note as a note, an event as an event.
- **AC-13** Everything a row offers elsewhere it offers here: tick, edit, archive, delete, and Undo behind each.
- **AC-14** A day with nothing on it opens and says so.
- **AC-15** A day in the past is visibly past and behaves exactly like any other day.

**The setting**

- **AC-16** Week start is Monday or Sunday, defaults to Monday, and changing it redraws the rail without a reload.

## Out of scope

- **A timeline across threads.** Today is still the day-one invitation. `list_agenda` answers a span question in a reply and draws nothing, and that stays true.
- **Anything the timeline could write.** No adding from a day, no dragging a thing to another day. Reading, and the row controls that already exist.
- **An hour view.** The kits draw one for a single day on the phones and it belongs to a calendar screen, not to a thread.
- **The map.** A dated note can carry a place and the map is 007's, unchanged.

## Amended 2026-09-29

**AC-5 is superseded: the thread's calendar is always a month**, at any span, with the month bar and, on the phones, the swipe. A trip over three weeks drew as weeks crossing a month boundary with no way to step. **A month is drawn once**: with a calendar picked, its dots wait for that month's events and the months either side are read ahead. **A picked calendar's events are quieter than the thread's own**: hollow tertiary dots after the thread's, and they never lift a cell. The day list's event anchor is 16px on a 2px spine. Logged in both decision logs under 2026-09-29.
