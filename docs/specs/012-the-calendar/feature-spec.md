# 012 The calendar, feature spec

**Status:** drafted 2026-09-08
**Surfaces:** web, iOS, Android, and the agent plane
**Connector:** Google Calendar. Mail, Browser and Photos are their own features.

## Why

offload knows about events already. `content.type` has had `event` since 0008,
the agenda screens are built, Today reads `occurs_at`, and 006 extracts a time
and a place out of a sentence. What it has never had is the calendar those
events actually live in, so offload's idea of your week and your calendar's idea
of your week are two different things that never meet.

This is also the first connector, so it settles the things every later connector
inherits: where a token lives, what gets kept, how a pull becomes content, and
what happens when offload writes somewhere it does not own.

## What

**Your calendars, listed.** Google gives back every calendar on the account,
including ones shared with you, each with the access you have on it. A calendar
you can only read is listed and marked, and offload never tries to write to it.

**Events, both directions.** Read into threads, and created, edited and deleted
from the composer, from a thread, or by offload itself through a tool.

**Calendars feed threads, by rules.** A calendar has a default thread, and
optional ordered rules can send some of its events somewhere else. A calendar
can feed several threads and a thread can draw from several calendars.

**A tool in the model's hands**, so "move the dentist to Thursday" is one thing
offload does rather than a screen you go and find.

### Two written commitments this breaks, and they are the point

**"Read only. offload never sends mail, moves events, or deletes photos."** That
is on the Connected apps page in all three kits. Half of it stops being true
here. The line has to change to say what is actually true, which is narrower and
better: offload writes to your calendar and to nothing else.

**OFF-6 names a write to a calendar as outward facing**, which means confirmed
per action rather than Undo. Kept, but sharpened: see below. That is an
amendment to the reversible allowlist and is recorded in `decisions.md`.

### What makes a write reversible, and what makes it outward facing

The irreversible thing is not writing to a calendar. **It is somebody else
finding out.**

An event on a calendar only you can see, with no guests, is as reversible as a
note. offload creates it, the toast offers Undo, and if you take it the event is
deleted in Google inside the window. Nobody ever saw it, nothing was sent, and
requiring a dialog there would be a dialog about nothing.

An event **with guests**, or on a calendar **anybody else can see**, is not.
Google mails an invitation the moment the event exists, and your wife's phone
shows the event on the shared calendar whether or not anyone was invited. There
is no Undo for a notification that has already landed, so those confirm first,
per action, naming who will find out.

**The test is one question asked of the write, not of the calendar**: after
this, does anybody but you know? Two conditions, both cheap to evaluate before
the call: does the event have attendees, and does the target calendar have more
than one member.

*A calendar shared read-only with somebody still counts. They can see it.*

### What offload keeps

`AC-6`. A pulled event becomes an ordinary `content` row of type `event`, in the
thread its calendar's rules send it to, carrying `source = 'calendar'` and
`source_ref` = the Google event id. Title, start, end, place, attendees and the
recurrence it belongs to. Nothing renders it specially: it is in the agenda, in
Today, in a thread's widgets and in search because it is content like everything
else.

**This is a reading of OFF-4 and the spec says so rather than assuming it.**
OFF-4 requires connected-app content to be derived and discarded, keeping a
source reference. A calendar event is almost entirely structure: a title, two
timestamps, a place, a list of people. The derived form and the raw form are
nearly the same object, which is not true of an email. So what is discarded is
the payload around it, the description body, the conferencing blob, the
organiser's metadata, the attachments; and what is kept is the structure plus
the reference to fetch the rest on demand.

**`description` is not kept**, which is the one field that behaves like mail.

### Recurring events

Read completely. A weekly standup shows up on every one of its days, including
the week somebody moved it, because Google expands instances and offload reads
the expansion.

Write with **one rule and no dialog: an edit or a delete always means this and
all following.** Past occurrences are never touched.

*That is a deliberate simplification of the three-way choice every calendar app
asks. Somebody editing a repeating event knows it repeats, and leaving history
alone is almost always what they meant: the gym moved to Wednesdays, it did not
retroactively always have been on Wednesdays. It also means offload never writes
a per-instance exception, so the hardest part of the Calendar API is not in this
spec at all.* Mechanically it is two calls: the old series gets an `UNTIL` just
before the edit point, and a new series starts there.

### Calendars feed threads, by rules

`AC-8`. Two levels, and the first covers most of it.

**A default thread per calendar.** "This calendar is Home's." Set in Settings
when you connect it, changeable after.

**Optional ordered rules**, each matching on an event's title, its attendees or
its calendar, sending matches to a different thread. First match wins; anything
unmatched goes to the calendar's default. A calendar with no default and no
matching rule is read for Today and files nowhere, which is a legitimate state
for a calendar you want to see but not sort.

**And a correction is still just a move.** An event in the wrong thread is moved
like any other content, which 006 already made a reversible model action. The
rules are the standing answer; the move is the specific one.

### The tool

`AC-9`. Five: list your calendars, find events, create, edit, delete. Structured
in and out per OFF-5, and each write goes through the same reversible-or-
confirmed test as a write from a screen. **The model does not get to decide
which** — the condition is evaluated server-side from the event and the calendar.

### Not built

- **Mail, Browser, Photos.** Each its own feature. This one settles the shared
  machinery they will inherit.
- **Writing to a calendar you can only read.** Listed, marked, refused.
- **Per-instance exceptions**, per the recurrence rule above.
- **Meet links, conferencing, attachments, working hours, free/busy of other
  people, availability search.**
- **A `people` table.** Attendees are structure on the event, not rows. Mentions
  and connections bring that table when they arrive.
- **Watch channels.** Sync is scheduled and incremental. Push is an optimisation
  worth having and is not correctness.

## Acceptance criteria

**AC-1** Connecting is its own consent, separate from signing in, and works
whether you signed in with Google or Apple.

**AC-2** The tokens live in a vault of their own, encrypted at rest, never in a
log or an event, and never handed to the worker: it asks the Core API to act.

**AC-3** Every calendar on the account is listed with the access you have on it,
including calendars shared with you.

**AC-4** offload never attempts a write to a calendar you cannot write to, and
says so plainly when asked to.

**AC-5** A write nobody else learns about is reversible for eight seconds and
actually undone in Google. A write with guests, or to a calendar with more than
one member, is confirmed first and names who will find out.

**AC-6** A pulled event is a `content` row of type `event` with
`source = 'calendar'` and a `source_ref`. The description body is not stored.

**AC-7** Editing or deleting a recurring event changes that occurrence and every
one after it, and never a past one.

**AC-8** A calendar has a default thread and may have ordered rules. First match
wins. A calendar with neither files nothing and still reaches Today.

**AC-9** The model can list, find, create, edit and delete through validated
tools, and cannot choose whether its own write is confirmed.

**AC-10** A change made in Google reaches offload without a person doing
anything, and a change made in offload is in Google immediately.

**AC-11** Event text from a calendar anybody else can write to is untrusted. It
never enters a system prompt, and a memory derived from it carries
`derived_from_untrusted`.

**AC-12** Disconnecting stops the sync and keeps what was already filed.
Removing the filed events is a second, separate, confirmed action.

**AC-13** The privacy policy gains Google Calendar as its own sub-processor,
distinct from the sign-in row, and says both that offload reads your calendar
and that it writes to it. Ships in the same change.

**AC-14** No event carries a title, an attendee, or anything else from a
calendar. Ids, counts and outcomes only.

## Depends on

- 001 for `content.source` and `source_ref`, which have been waiting for this.
- 006 for extraction and for `move_content`.
- 010 for the Settings screen this hangs off.

## Open

- **Google's OAuth verification.** Calendar scopes are sensitive, and an
  unverified app is capped at a small number of test users with a warning screen
  in front of consent. Invite-only alpha may fit under that cap, but shipping
  past it needs verification, which takes weeks and is nobody's afternoon. It
  gates the connector reaching people, not building it.
- **Whether an untied calendar should reach Today at all.** Specified as yes,
  because seeing your day is the point and filing is the extra. Worth watching:
  it is the one place an event exists in offload with no thread behind it.
