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
this, does anybody but you know? Two conditions, both answerable before the
call.

**Does the event have attendees.** Read off the event itself, live, every time.

**Is the calendar one anybody else can see**, and **offload does not ask Google,
it asks you.** Each calendar carries a flag you set when you connect it, "just
me" or "shared with other people". You know which calendar is the one you keep
with your wife; you named it.

*That is a smaller and more honest mechanism than the alternative, which was to
read Google's access list.* Reading the ACL needs its own OAuth scope on top of
the ones this feature already needs, adds a permission to the consent screen and
to verification, and **still gets the answer wrong**: Google can make a calendar
public to anyone with the link, or visible to a whole Workspace domain, and
neither is an access-list entry. A calendar can have exactly one member and be
readable by the world. Asking the person who owns it is the only method that
covers every way a calendar becomes visible, including the ways Google has not
invented yet.

**The default is "shared", because the safe direction is a confirmation nobody
needed rather than a notification nobody expected.** The one exception is your
own primary calendar, which starts as "just me" because it is yours by
definition. Everything else, including every calendar you own but did not create
as primary, starts shared until you say otherwise. A calendar Google says you do
not own cannot be marked "just me" at all.

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

**Who wrote the event is kept, and it is load-bearing rather than a detail.** An
event on a calendar only you can see can still have been written entirely by
somebody else: that is what an invitation is. The organiser is the only fact
that separates "I typed this" from "a stranger typed this and Google put it in
front of me", and the whole untrusted-text rule below rests on it.

**Attendees are minimised rather than copied.** A display name and whether they
accepted, always, because "dinner with Ana" needs a name. An address **only for
an event offload itself created with guests**, because editing that event later
means naming them again. For everything else the address is dropped on the way
in. These are people who never signed up to offload and never agreed to
anything, and the difference between keeping a name and keeping an address book
is the difference between rendering a row and holding contact details for
strangers indefinitely.

### Recurring events

Read completely. A weekly standup shows up on every one of its days, including
the week somebody moved it, because Google expands instances and offload reads
the expansion.

Written **without ever asking a three-way question**, which is the thing every
calendar app does and the thing worth avoiding. Instead:

**When you said it in words, offload reads which you meant.** "Move this week's
standup to 3pm" is one occurrence. "Standup is at 3pm from now on" is that one
and every one after. That distinction is already in the sentence, and reading it
is what the model is for. The tool carries the scope as an explicit argument, so
the decision is a value that can be logged and tested rather than an inference
buried in a prompt.

**On a screen, where there is no sentence**, an edit changes the one occurrence
and offers "and all following" beside it as a second control. Never a modal, and
never a question asked before the edit.

**One occurrence is the default everywhere**, because its blast radius is one day
and doing it again is easy, where the opposite mistake silently rewrites a year
of somebody's calendar.

*An earlier draft made "this and all following" the only rule, to avoid the
dialog. It avoided the dialog and got the common case wrong: moving this week's
standup would have moved every future standup with it.*

Mechanically these are different calls and both are small. One occurrence is a
patch on that instance and Google records the exception itself. This and
following is two: the old series gets an `UNTIL` just before the split, and a new
series starts there. **Past occurrences are never touched by either.**

*One case is knowingly unhandled: a series that already carries single-instance
exceptions, made in Google, at dates after a split point. What Google does with
an exception whose parent no longer covers its date is not specified and not
tested here. Recorded rather than discovered.*

### Calendars feed threads, by rules

`AC-8`. Two levels, and the first covers most of it.

**A default thread per calendar.** "This calendar is Home's." Set in Settings
when you connect it, changeable after.

**Optional ordered rules**, each matching on an event's title or its attendees,
sending matches to a different thread. First match wins; anything unmatched goes
to the calendar's default.

**A calendar you turn on must name a thread.** There is no "read it but file it
nowhere": an event offload holds is a `content` row, `content.thread_id` has been
`not null` since 0008, and every query in the product relies on that. Loosening
it for one connector, or building a second live read path so an unfiled event
could still reach Today, are both a lot of machinery to support a state that a
thread already expresses. A calendar you want to see but not mix in is a calendar
pointed at a thread of its own.

**Correcting one event is a move, and a move is author-only.** 005 settled that
deliberately: moving changes who can see something, which makes it a sharing
decision. A pulled event's author is the account whose connection pulled it, so
**in a shared thread only that person can move it**, and their partner cannot,
even though both can see it. That is the existing rule applied consistently
rather than a new restriction, and it is written down here because the obvious
assumption is the opposite.

What the other member *can* do is everything 005 already gives them: edit it,
archive it, tick it off. And **the rules are editable by whoever owns the
connection**, which is the durable fix: a calendar routing to the wrong thread is
a rule to change once, not an event to move every week.

### Where you connect one

**Settings, on all three clients.** The Connected apps page the kits already
draw, with Calendar as the only live row: connect, see your calendars, say which
thread each feeds, mark which are shared, disconnect.

**And once, at the end of first run, skippable.** Connecting is the one setup
step this product has that is worth offering rather than hiding, because a
calendar makes Today real on day one instead of after somebody finds Settings.

**It is the last screen, after the account is already active**, and that
ordering is the whole of its design. Connecting leaves the app for Google's
consent screen and comes back, and a round trip through another origin in the
middle of first run is a person who can be stranded halfway through onboarding
by a back button. Consent completes first run; the offer comes after, when there
is nothing left to lose by wandering off.

**Skip is a real answer.** No calendar is a supported state everywhere in this
feature, and the screen says so in a sentence rather than pressing.

*The kit for this screen is being drawn. What ships first is the flow and the
copy; the screen catches up when the design lands, and this is recorded rather
than assumed.*

### How much of a calendar offload actually holds

A calendar is not a feed with a natural end. A single weekly recurrence runs
forever, and materialising one row per occurrence per account, each with an
embedding, is a table that grows with time rather than with use.

**A rolling window: sixty days back, twelve months forward.** Recurring series
are expanded only inside it, and the window moves with a scheduled job, so a
standup set up today is a few dozen rows rather than an unbounded series.
Anything older stays in Google and is reachable by `source_ref`, which is what
the reference is for.

**Changes come back by sync token**, not by re-reading the calendar, so an
ordinary sync costs what changed. A token Google rejects as too old is a full
re-read of the window, which is the same work as connecting.

**A write that splits a series leaves rows behind.** The occurrences after the
split belonged to the old series and now belong to a new one, and both are inside
the window. Reconciliation is by `source_ref` against what Google returns for the
window, so a row whose event no longer exists is retired rather than orphaned.

### The tool

`AC-9`. Five: list your calendars, find events, create, edit, delete. Structured
in and out per OFF-5, and each write goes through the same reversible-or-
confirmed test as a write from a screen. **The model does not get to decide
which**: the condition is evaluated server-side from the event and the calendar,
on both sides of the edit, and the model is told the outcome rather than asked.

### Not built

- **Mail, Browser, Photos.** Each its own feature. This one settles the shared
  machinery they will inherit.
- **Writing to a calendar you can only read.** Listed, marked, refused.
- **A three-way recurrence question.** Scope is read from what was said or
  defaulted, never asked.
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

**AC-2a** Connecting is **its own route and its own table**, and never Better
Auth's `account`. That table's create and update hooks blank every provider
token unconditionally, which is the fix for a real incident recorded in
`auth.ts`. Reusing the social-linking flow because it is also Google OAuth would
either break the connector silently or get "fixed" by weakening those hooks,
which puts plaintext credentials back at rest.

**AC-3** Every calendar on the account is listed with the access you have on it,
including calendars shared with you.

**AC-4** offload never attempts a write to a calendar you cannot write to, and
says so plainly when asked to.

**AC-5** A write nobody else learns about is reversible for eight seconds and
actually undone in Google. A write with guests, or to a calendar marked shared,
is confirmed first and names who will find out.

**AC-5b** "Has attendees" is read across **both sides of the edit**, not the
proposed state alone. Removing every guest from an invited event sends each of
them a cancellation, so an edit that ends with no attendees is still outward
facing if it began with some.

**AC-5a** Whether a calendar is shared is a flag on offload's side, set by the
person who connected it. offload never reads Google's access list and needs no
scope for it. Every calendar starts shared except your own primary, and a
calendar you do not own cannot be marked otherwise.

**AC-6** A pulled event is a `content` row of type `event` with
`source = 'calendar'` and a `source_ref`. The description body is not stored.

**AC-7** A recurring edit or delete carries an explicit scope, one occurrence or
this and all following, never a question put to the person. Spoken intent decides
it; a screen edit defaults to one occurrence and offers the other beside it. No
past occurrence is ever touched.

**AC-8** A calendar that is turned on names a thread, and may have ordered rules
sending some of its events elsewhere. First match wins. A calendar with no thread
is off.

**AC-9** The model can list, find, create, edit and delete through validated
tools, and cannot choose whether its own write is confirmed.

**AC-10** A change made in Google reaches offload without a person doing
anything, and a change made in offload is in Google immediately.

**AC-11** Untrusted is decided **per event, by who wrote it**, not per calendar.
An event whose organiser is not you is untrusted text, wherever it sits,
including on a calendar nobody else can even see. That is what an invitation
from a stranger is, and it is the ordinary case rather than an attack that needs
imagining.

**AC-11a** Untrusted event text never enters a system prompt, and a memory
derived from it carries `derived_from_untrusted`.

**AC-11b** A memory carrying `derived_from_untrusted` is delivered to the model
as **reference it may read and cite, never as a rule it follows.** This is a
change to the prompt, not only to this feature: `plan_v2.md` currently says of
thread memories "read them and do what they say", `derived_from_untrusted` is
written `false` everywhere and read by nothing, and **012 is the first feature in
the product that would ever set it true.** Shipping the flag into a pipeline with
no branch on it is the two-hop injection path 001 wrote the column to close,
left open.

**AC-12** Disconnecting stops the sync and keeps what was already filed.
Removing the filed events is a second, separate, confirmed action.

**AC-13** The privacy policy gains Google Calendar as its own sub-processor,
distinct from the sign-in row, and says three things it does not say today: that
offload reads your calendar, that it **writes** to it, and that connecting one
brings in **other people's names**, who they are, how long they are kept and on
what basis. Ships in the same change.

**AC-13a** The design system's Connected apps page promises "offload never sends
mail, moves events, or deletes photos" in both phone kits. Half of it stops being
true, both files change together, and the change logs one `decisions.md` entry
with a filled Design system impact, per OFF-7.

**AC-14** No event title, place, attendee or organiser reaches analytics, a log,
or an LLM trace. Ids, counts and outcomes only. **Typed rather than trusted to a
check**: `assertNoContent` rejects an address, a URL or anything over sixty-four
characters, and "Dr Osei biopsy" is none of those, so the event's event
properties are structurally ids and enums and a free-text property does not
compile.

**AC-15** Calendar sync never writes a `messages` row. 001 and `decisions.md`
both carry an open warning that `messages` keeps full text forever and that a
connector must not reuse that path without a discard story. Calendar does not
reuse it. **The warning stays open for Mail**, which will have to answer it.

**AC-16a** Settings connects, lists, routes and disconnects a calendar on all
three clients, on the Connected apps page the kits draw.

**AC-16b** First run offers to connect one, once, as its last screen, **after
the account is already active**, and skipping is a plain answer that costs
nothing. Nobody can be left mid-onboarding by leaving for Google and not coming
back.

**AC-16** More than one Google account can be connected. A calendar is named by
its connection, so the same calendar name on two accounts is two calendars.

**AC-17** Undo of a calendar write is **not the product's ordinary Undo**. Every
other reversible action is a local soft delete; this one has to reach Google
inside the window because the effect already left. If that call fails the local
row is not soft-deleted either, so offload and Google do not disagree, and the
line says the event is still there.

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
- **Read may have to ship before write.** Google's write scope is a heavier
  grant than read and carries the heavier verification bar. If verification
  becomes the long pole, the honest split is list, read and routing first, with
  writes, the tool and the OFF-6 amendment behind them. One spec either way: it
  is a rollout order, not two features.

- **Whether "see it but do not file it" is a state anybody wants.** Answered no,
  on the grounds that it costs a second read path and a loosened `not null` to
  express something a thread already expresses. If it turns out people want a
  calendar visible without a home, that is the moment to reconsider, and the
  answer would be a real design rather than a nullable column.
