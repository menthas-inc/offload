# 019 Calendars, the page and the thread

**Status:** drafted 2026-09-18, revised the same day after review
**Surfaces:** web, iOS, Android, and the agent plane
**Amended by 030 (2026-10-03):** a picked calendar's events show where they are to everyone in the thread, and their location is looked up to put them on the thread's map; the pick sheet says so. Picks made before the map count as consented to this with the policy's consent version moving. See `docs/specs/030-maps/`.
**Amended by 031 (2026-10-02):** Connected apps draws a Google Calendar card with Calendars offload can use and Ask before adding on it; Connect there goes straight to Google. On the web the per-account list and Disconnect move from the Connected apps pane to `/settings/apps/calendar`.
**Amended by 033 (2026-10-03):** first run's connect step is a card on Bring it all in, and connecting from it returns there (`landing=first-run-bring`, `/welcome/bring`) rather than to the Calendar page. Settings' connect block and its two facts are unchanged.
**Amended 2026-11-06:** a row that turns out to be an event already on their calendar finds it instead of going on again (AC-12a).
**Depends on:** 012, whose connector this reshapes; 018, whose control asks which calendar; 015, whose rail shows a thread's days
**Design:** `handoff/APPLY-2026-09-17-calendars.md`, decided item by item off `explorations/calendars-options.html`, and the 17 September entry in the design log
**Amends:** 012's AC-8 (routing) and AC-12 (disconnect), 018's five-field rule and its "no option writes outside offload"

## Why

012 built the connector and got the model of it wrong in two places, both visible on the Connected apps page.

- **A calendar named a thread.** Connecting one meant choosing, in Settings, which thread every event on it would file into, with ordered rules for exceptions. Nobody set a rule; the rules never had a screen. And the question was backwards: a calendar is not about one thread, a thread is about some of your days, so the thread should say which calendars it draws on.
- **Whether other people see a calendar was a switch you set yourself**, defaulting to shared, with your primary calendar the one exception. It was drawn as two native checkboxes and a `select` in a row nobody could read, and it asked a person to know a fact Google already holds.

The design session on 17 September settled the model: **two levels of consent, and they are different questions.** The account approves which calendars offload may use at all. A thread picks which of those it uses, starting from none, because approving a calendar must never silently widen what offload reads in a thread set up months ago, shared ones included. Where an event lands is a thread question too, so there is no "Add events to" setting anywhere.

The product owner added four decisions on 18 September, recorded here rather than in the design note: there is no self-declared shared flag, a calendar simply has one or more participants and offload reads that from Google; the switch in Settings means every write is put to the person first; with two or more calendars in a thread offload asks every time; and a thread with no calendar yet is asked once, with the tap picking the calendar for it, rather than left silent.

## What

### Vocabulary

A calendar is **approved** in Settings and **picked** in a thread. In what a person reads there is no verb for either: the Settings header says **4 of 7 in use**, the thread's sheet says which calendars **offload reads when it works on** the thread. A calendar has **participants**, which is everyone Google lets see it, the person included. A write is **put to you first** when it would reach anybody else, or when you asked for that on every write. offload holds a **copy** of each approved calendar's events; the copy is never called anything in the product.

### Settings, before anything is connected

The Calendar row in Connected apps leads one level down on the phones. On web, whose Connected apps pane is already the second pane, the same content is drawn inline in that pane where the Calendar row was, above the three rows that are not built. With no connection it is **first run's connect screen, verbatim**: the same heading, the same two prose lines about reading your days and adding to them, the same primary button, the provider's mark above. The block is one component per platform so the three surfaces share one copy source; web's is lifted out of the welcome page, where it was inlined. One sentence is added under the button, centred, in caption type:

> You choose which calendars after this.

Connecting is not consenting to all of them, and this is the only place that can say so before the consent screen. Connect starts the same OAuth flow 012 built, with one scope added, below. **When Google returns, every calendar is unticked and the person lands on this page**, which now shows the list with `None in use`, whether they came from Settings or from first run's offer. Nothing is read until they tick.

### Settings, once connected

One block per connected account, then one switch for the offload account, in this order.

1. **The provider block.** The mark at 34px with radius 8, `Google Calendar`, and `jo@hey.com, connected 4 Aug` in caption.
2. **`Calendars offload can use`**, a list with a **checkbox per calendar**, never a switch: a switch says a capability is on, and the capability is the connection one level up. This is a selection among peers. The group's label is that sentence on the left and **`4 of 7 in use`** on the right; with none ticked it reads **`None in use`** in the same slot. That supersedes the mock's section 2 crop, which put the address in the label: the address is one line up in the provider block. A ticked calendar is approved and syncs; an unticked one is not read at all.
   - Each row leads with the calendar's own **10px colour dot** inside a hairline ring, as recognition and never as the differentiator. Four of seven ordinary Google colours fail 3:1 on the row's ground, so the name is what tells two calendars apart. A calendar Google gives no colour draws the dot in `--border-strong`.
   - **A ticked row is full ink; an unticked row is tertiary.** That inverts the task checkbox's treatment, where ticking dims a row, for the same reason: dimming marks the row that is out of play, and here that is the one not picked. Nothing is struck through. Never the moss tick, which means a finished row.
   - **The account's primary calendar is titled with the person's display name**, with the note `Your own calendar`, as the mock draws it. Google names that calendar by the address, and an address is not a name anybody chose. With no display name the title is `Your calendar`.
   - Two more notes are load-bearing: **`Read only`** on a calendar offload cannot write to, and **`Shared with you`** on one somebody else owns. The design wrote the owner's name; Google's calendar list carries no name, so the note says what is true without naming anybody. A shared calendar that is somebody's primary is called by its address, as Google calls it, because that is its name.
3. **`Disconnect Google Calendar`** → one row in the danger colour, and the note under it says what it keeps, not only what it takes: *Notes offload made from your days stay. offload stops reading your calendars and cannot add to them.* Disconnecting asks once, with the same confirmation deleting a thread uses, then revokes at Google, deletes the copy and every pick, and keeps nothing else. 012's separate "remove what was filed" action goes with the rows it removed.
4. After every block, **`When offload adds something`** → one row, **`Ask before adding`**, a switch, off for a new account, with the note *Off means offload adds it without asking, unless somebody else would see it.* It is one switch for the offload account rather than one per Google account, which is why it sits after the blocks rather than inside each as the mock drew it, and the note is reworded from the mock's because "lands straight on the calendar" is untrue in the commonest states. On, every calendar write, adding, changing or deleting, is put to the person first through 012's proposal, whoever it reaches; the label says adding because that is the case a person pictures.

A connection whose grant Google has revoked keeps its `Sign in again` row at the top of its block, as 012 built. A connection whose grant lacks the sharing scope, below, gets the same row with the note *offload needs one more permission: to see who can see each calendar. Until then it checks with you before every write.*; the connection keeps syncing. The Connected apps row itself reads `On` with the address as its note once connected, as the kit draws it.

**States.** While the page loads nothing is drawn, as 012's page does; a tick, a switch or a disconnect that does not go through draws the one line, *That did not go through. Try again.*, and the control stays where it was.

### Participants, read rather than asked

There is no switch that says who sees a calendar. **A calendar has one or more participants**, and offload reads that from Google's sharing list with one extra read-only scope, `calendar.acls.readonly`: at connect, on every full sync pass, and **again on the write path just before the confirm-or-do test**, the way the event's guests are read live there, so a calendar shared at noon confirms at noon rather than after the nightly pass. What is stored is a **count and nothing else**: never an address, never a name, never the list. Every rule with a role other than none counts: a person is one, and a rule that opens the calendar to a domain, a group or the public counts as more than one on its own. **A calendar the person does not own has more than one participant by construction**, the owner and them, and Google does not let a non-owner read the list, so nothing is read for it.

A connection whose grant lacks the scope, because it was made before this shipped or because the person unticked it on Google's consent screen, gets no read: offload treats every calendar on it as having more than one participant, which is the safe direction, and Settings shows the row above. Signing in again asks for the full set; a grant that still lacks it leaves the row where it is. Nothing else about the connection stops.

The 8 September entry in `docs/tech/decisions.md` argued the opposite, that an access list "would still be wrong" because a calendar can be public to anyone with the link or visible to a whole domain. Google's list carries both as rules, of type `default` and `domain`, so the argument does not hold and the entry is corrected in the same change.

### What confirms

The test 012 wrote stays, with the person's flag replaced by the count. A write is put to the person first, per action, when any of these hold:

- the event has guests on either side of the edit, and the line names them;
- the calendar has **more than one participant**, or offload has not been able to read how many, and the line says everyone on the calendar will see it;
- **`Ask before adding` is on**, and the line says *You asked to check first.*

Otherwise it happens and Undo lasts eight seconds, reaching Google inside them as 012 built.

### A thread starts with no calendars and picks explicitly

**This is the model, and everything below follows from it.**

- **A new thread uses no calendar.** offload reads none of your days for it until somebody ticks one. The default thread is a thread like any other here.
- **Approving a calendar in Settings adds it to no thread, ever.** Threads gain calendars when somebody says so, from inside the thread, or by answering offload's question about a row in it, below.
- **Un-ticking a calendar in Settings removes its picks from every thread, at once and for good.** Re-ticking it later puts it back in none of them: a pick that survived an un-tick would re-widen every thread that had it, silently, which is the one thing this model forbids. The reads intersect with the approved list too, so nothing resolves through a gap.
- **A pick is the member's, and it reads for the thread.** In a shared thread each member picks from their own calendars; the thread draws on every member's picks, and every member sees the same rail. That is the design's reasoning and the product owner's confirmation: picking your work calendar in a thread two other people can read shows your meetings to them, which is exactly why a thread starts empty. A member leaving takes their picks with them.
- **A write goes only through your own picks.** offload writes, changes, deletes and undoes on a calendar only through the acting account's own connection. Another member's pick is something your turn can read, never something it can write to, and a row that remembers its event is changed on the calendar only by its author; another member's edit changes the row and the calendar keeps what it had.

**The thread control is a plain `calendar` glyph in the thread's bar**, and **it never carries a badge or a count in any state**: a dot and a bubble both mean attention, and a mark that says "you configured this" earns a tap that finds nothing wrong. On the phones it is the bar's one trailing control, left of share and the ellipsis when those are built; there is no More menu on the phones yet, so the glyph is the only way in there. On web it is the pane head's **third tool**, left of Open full and More, which the design system's pane-head rule was amended for: a tool earns a head slot only if it changes what offload reads or shows, and a scope you cannot see is a scope you forget. Web's More menu keeps a **`Calendars in this thread`** row too. The accessible name carries the state, **"Calendars, none in this thread"** or **"Calendars, 1 of 4 in this thread"**, counting the person's own. The glyph is drawn whenever the account has a calendar connection at all, whatever its state; with no connection there is no glyph and no row, because a control to nothing punishes a tap.

**On the phones it opens a sheet**, `Sheet` as governed. The title is **Calendars in this thread**; the caption under it carries the state, because the title has no trailing slot:

| The thread | The caption |
| --- | --- |
| some of yours picked | Which of your calendars offload reads when it works on Lisbon trip. |
| none of yours, nobody else's | offload is not reading any calendar for Lisbon trip. Tick the ones it should. |
| none of yours, another member's | offload is not reading any of your calendars for Lisbon trip. Tick the ones it should. |
| shared thread, in every case, a second line | Everyone in Lisbon trip sees what is on them. |

Then the person's approved calendars as the same rows Settings draws, ticks and dots and notes; where two rows share a name across two accounts the note carries the account's address. Under the rows, in a shared thread where others have picks, one caption line: **Ana reads 1 calendar here** or **Ana and Tom read 3 calendars here**, members named and calendars counted, never named. No empty illustration and no button: the rows are the call to action. A thread narrowed back to nothing gets the none sentence too. While the list loads the sheet shows its title and nothing else, so a sheet still fetching is never mistaken for a thread with nothing to tick. **On web it is a popover anchored to the glyph**, not a modal, because it is a scope and not a task and the pane behind it is what the scope is about; it reuses the More menu's shell with `role="group"` rather than `menu`, and carries the same caption, which the mock's web crop omitted. Same rows, same ticks. A tick applies at once, with no save and no toast, and un-ticking is its own way back; a tick that does not go through draws the one failure line and the box stays as it was.

**A person with no approved calendars** opens the sheet to the caption **offload has no calendars to read yet.** and one row, **Approve a calendar in Settings**, which opens Connected apps. That row is new UI no kit draws, named here as such.

### What a pick does

A thread's picks decide **what offload reads for the thread and where it writes from it.**

- **Reads come from the copy, never live.** When offload works in the thread, the events it can see are the ones on the thread's picked calendars inside the copy's window, and no others. Another member's events are read as somebody else's text whoever wrote them, exactly as an invitation from a stranger is, because trust is relative to the account whose turn it is. What crosses to another member is a title and a time: never the guests, never the place. *(030, 2026-10-02: while the map is on, a title, a time and where it is; never the guests, their answers or the description.)*
- **The thread's rail draws them** on their days beside the thread's own dated rows, because the rail is the thread's days. A pick earns the rail on its own: a thread with a pick and nothing dated shows this week. The span stays the thread's own, computed from its rows and notes as 015 built it; a calendar's twelve months of events do not stretch a rail into a month view. In the day's list an event is a line no kit has drawn yet, named here as new: the calendar's colour dot with its ring, the title, the time or `All day`, and the calendar's name as its note, so a shared thread says whose it is. It has no checkbox, no tools, no swipe and no sheet: it is the calendar's, read through the thread, and changing it is changing the calendar. A row offload put on the calendar draws once, as the row.
- **The thread's lists do not hold them.** A calendar's events are not rows in the thread. This closes the open note in `docs/tech/decisions.md` about synced events filling the leftover list.
- **From Today**, with no thread open, offload reads every approved calendar. A freshly connected and ticked calendar is on your day from the first sync, whether or not any thread has picked it.
- **Writes.** Anything offload puts on a calendar from a thread goes to the thread's calendar, decided by the thread and never by a setting. The thread that decides is the one the row landed in, so a dump from Today goes to the calendar of whichever thread offload filed it into, exactly as one dumped inside that thread would be; the planner already prefers an existing thread and falls back to the default only when nothing fits.

  | Your writable calendars picked in the row's thread | Where an event goes |
  | --- | --- |
  | one | that calendar, with nothing to ask |
  | two or more | **offload asks in the conversation**, those calendars as the values, every time |
  | none, and you have approved a writable calendar | **offload asks once**, your approved writable calendars as the values, and **the tap picks that calendar for the thread** as well as writing the event |
  | none, and nothing approved | nowhere: it stays a row in the thread, and offload says nothing |

  The asking is 018's control, extended: a sixth field, **calendar**, whose values are calendars and whose answer writes outside offload through 012's path. The sentence is *Filed "Dentist". Which calendar?*; the chips are the calendars' names, at most four by name, and `Not that`, which leaves the row as it is. **Read-only calendars are never offered.** **A tap applies on the server with no model**, through the same confirm-or-do test as any write, after checking the calendar is still yours, approved, writable and, in the two-or-more case, still picked; so an answer can still turn into a proposal when the calendar has more than one participant, drawn on the person's own turn. A tapped write that does not go through draws *That did not go through. Try again.* with the chips still there. A typed answer while the question is open is matched to a chip by name, without a model; anything else closes the question and is an ordinary dump. **Undo of a tapped write is 012's Undo**, which reaches Google first, not 018's restore of a previous value.

  **What "asks every time" costs, said plainly.** The next turn closes an open question whatever it says, so two appointments dumped in a row leave the first as a row with no calendar, silently. The way back is words: "put the dentist on the calendar" asks again about that row.

  **An event is a row first and on the calendar second.** The row lands in the thread as it does today, with the eight second Undo, and offload's calendar write is about that row: it goes on the calendar as the row is, and when it does the row remembers which event it became, so the rail draws it once rather than as the row and the calendar's copy of it. A row already on a calendar is not put on again.

  **The name of a calendar somebody else owns never enters a prompt as the person's words.** The chip and the person's turn in the log show the name; what the model later reads of that turn is that they picked a shared calendar, not the words its owner chose.

### A calendar's events, held once

012 mirrored a calendar into `content` rows in the calendar's thread. That is what made a calendar name a thread, and it is what a thread's picks cannot be built on: a calendar picked in two threads would be two copies of every event, and a calendar picked nowhere would be nowhere.

So **offload keeps one copy of each event per calendar**, on the connection, outside every thread, inside the same rolling window and with the same process-and-forget rule 012 wrote: title, when, where, who is coming as names and whether they accepted, who wrote it, never the description. **The window is the retention**: sixty days back and twelve months forward, and an event that falls behind it leaves the copy on the next full pass. Threads read it through their picks, Today reads all of it, un-ticking a calendar in Settings drops its copy, and disconnecting drops the whole of it. Two members who both connected the same Google calendar draw each event once on a shared rail, by the calendar's and the event's own identity.

**What happens on the day this ships.** The rows 012 synced into threads are deleted, not moved: the product owner's call on 18 September, with nothing that matters in production. Rows offload itself wrote from a dump and filed on confirmation stay, as rows that remember their event. The copy fills from the next sync. A calendar that named a default thread becomes a pick on that thread where the account is still a member, so an account that was reading a calendar in a thread still is; a proposal still waiting from before is closed. Rules go, with nothing to migrate. This is a dated exception of the same kind 014 made, while the product is in alpha, and it is written here rather than left in a migration comment. Appointments dumped before this and synced back will draw twice on a rail, as the row and as the event, until somebody undoes one; alpha, and noted.

**What a thread loses.** A calendar's event is no longer a row you can tick, archive, move or edit in the thread. Changing it is changing the calendar, which is what 012's tools do, and moving it makes no sense: its home is decided by the thread's picks. A note offload derived from an event stays a note. Putting an event on a different calendar after Undo has passed is a delete and a create, two writes, each confirmed if the calendar needs it; there is no move.

**What answering loses, and does not.** "What is on Thursday" and "when is the dentist" read the calendar by time and keep working, from the copy. A search by words no longer reaches a calendar's events, because they are not indexed with the thread's content. That is accepted for now and recorded in the tech log as open.

### Android

Material's own checkbox and switch in a low container group, and a Material bottom sheet for the thread's picker, as the design note expects. Nothing above depends on an iOS-only idea.

### Not built

- **Remembering a thread's write target** once it has been asked, when two or more are picked. The design wants it drawn first.
- **A long-list picker.** Seven calendars is ordinary and forty is a scroll; the design has no picker for a long list and this does not add one.
- **Today's agenda.** Today draws day one's invitation and nothing else yet. What this feature guarantees is that when Today draws a day, every approved calendar is on it; drawing it is Today's own work.
- **A calendar's events as rows in a thread.** The design left "if a thread should list them" to a different exploration.
- **A More menu on the phones**, and sharing a thread, which when built has to say that the thread reads the sharer's calendars or drop the sharer's picks at that moment.
- **Mail, Browser, Photos**, as before.

## Acceptance criteria

**AC-1** The Connected apps Calendar row opens a page on the phones and an inline block on web. With no connection it is first run's connect screen from one shared component per platform, plus the one sentence under the button; Connect starts the connector's own OAuth flow with `calendar.acls.readonly` among the scopes; on return every calendar is unticked and the person is on this page.

**AC-2** With a connection, the page shows one block per account: the provider block, the calendar list with a checkbox per calendar, `Calendars offload can use` with `N of M in use` or `None in use` in the group header, the colour dot with its ring, the primary calendar titled by the display name with `Your own calendar`, `Read only` and `Shared with you` where true, and `Disconnect Google Calendar` with its note; then one `Ask before adding` switch with its note. Ticked rows are full ink and unticked rows tertiary; nothing is struck through and no moss appears.

**AC-3** Ticking a calendar in Settings approves it: a sync is enqueued at once and the copy fills. Un-ticking stops the sync, drops the calendar's copy and deletes its picks in every thread in the same transaction, and re-ticking restores none of them. Neither adds it to any thread.

**AC-4** A calendar's participant count is read from Google's sharing list at connect, on every full pass and on the write path before the confirm-or-do test, for calendars the account owns. Only the count is stored; no address, name or rule is written anywhere, including logs and analytics. Every rule with a role other than none counts; a `domain`, `group` or `default` rule with a role counts as more than one. A calendar the account does not own is more than one without a read. *Amended 2026-10-28: the read on the write path is made for a removal only, the one write the count still confirms.*

**AC-5** A write confirms first, per action, when the event has guests on either side, when the calendar has more than one participant or an unknown count, or when `Ask before adding` is on, each with its own line. *Amended 2026-10-28 (the owner): the participant count confirms a removal only. Adding to or changing an event on a calendar other people can see, with no guests, is done with the eight second Undo, because the person knows the calendar is shared and asking on every add was friction; removing an event from one, which may be somebody else's plan, still confirms.* Otherwise it happens with the eight second Undo that reaches Google. `Ask before adding` is off for a new account, is one switch per offload account, and covers add, change and delete.

**AC-6** A connection whose stored grant lacks the scope keeps working: every calendar on it counts as more than one participant until the grant includes it (since 2026-10-28 that only confirms a removal), and Settings shows the `Sign in again` row on that block with the one-line note.

**AC-7** A thread's bar carries the `calendar` glyph whenever the account has a connection, with no badge or count in any state, and the accessible name `Calendars, none in this thread` or `Calendars, k of n in this thread` counting the person's own. Web's More menu carries `Calendars in this thread`. With no connection neither is drawn. The default thread has both like any thread.

**AC-8** The picker is a sheet on the phones and a popover on web, titled `Calendars in this thread`, with the caption for the thread's state and the shared-thread line where it applies, the person's approved calendars as tickable rows, other members' picks as one counted line, and a tick that applies at once. With no approved calendar the caption and the one row lead to Connected apps. While loading, the title alone.

**AC-9** A new thread has no calendars. Approving one in Settings picks it in no thread. A pick is stored per member and per thread; a thread reads every member's picks; a member leaving the thread removes theirs; a member can pick and un-pick only their own calendars, and only in a thread they are in.

**AC-10** Inside a thread, offload's calendar reads are served from the copy, scoped server-side to the thread's picks intersected with each picking member's approved list, and the rail draws them on their days. Another member's events are untrusted in the reader's turn, and carry no guests and no place across. From Today, reads cover every approved calendar on the account. A picked calendar's events are not rows in the thread's lists. A member reads another member's calendar only through a pick in a thread both are in, and never otherwise.

**AC-11** A calendar write goes to the one writable calendar the acting account picked in the row's thread; with two or more, offload asks with them as values and `Not that` as the way out; with none and an approved writable calendar on the account, offload asks with those and the tap picks the calendar for the thread and writes; with nothing approved, nothing is written and nothing is asked. **Changed 2026-10-04.** With none picked and exactly one approved writable calendar there is one candidate, so it is written with no question and no pick is made: only a tap picks. And a calendar they named in the dump is the one written to, over the thread's pick: the model passes the name as they said it, the server matches it against the account's approved writable calendars, one match is written (through the same confirm-or-do test), and no match or several is asked, with a tap that writes this one event and leaves the thread's picks alone. "My calendar" names none. **Changed 2026-10-05.** "My calendar", "my personal calendar" and "personal calendar" name the one of theirs nobody else sees (participants 1), or the primary one when that leaves several or none, over the thread's pick; "the calendar" and "our calendar" still name none. A calendar can be named by who it is shared with, "my calendar with Meera", when no calendar's own name matches what was said: the person is matched among their connections as sharing a thread matches them, and the calendar is the one both she and they approved in offload; failing that, Google's sharing list for up to five calendars they own that other people see is read at that moment, and a calendar matches when an address on it is the connection's or has the connection's name in it. A name that matches none of their connections is asked about and Google is not read. Their primary drops out when another calendar matches too. The list is compared and dropped, never stored or logged. No match or several is asked, as for a name. **Changed again 2026-10-05 by 038.** That question is asked in the person's terms, `Filed "<title>". Which calendar is shared with <name>?`, and its answer, tapped or typed, is remembered as a memory linked to the calendar by id (never its name), so the next "with <name>" settles on that calendar with no question and no Google read, over the thread's pick, while it is still theirs, approved and writable. **Also changed 2026-10-04.** A change or a removal of one event that reaches nobody but the person (their own calendar, no guests, "ask first" off) is done with no control, including in a turn that read the calendar, and the turn's Undo takes it back: a removed event is re-added from what was kept, guests included, and a changed one gets its old values back. The turn wears Done for it. What was kept goes on Undo or on the daily purge. "This and all following" has no Undo and still waits after a read; guests, a calendar other people can see, unknown sharing and "ask first" wait as before. A tapped calendar for a row in the default thread says Done on the tap and names no thread. Read-only calendars and other members' calendars are never offered and never written to. A tapped answer applies on the server with no model, through the confirm-or-do test, after re-checking the calendar; a failed write reopens the question; its Undo is 012's. **Changed 2026-10-13.** Rows filed in one turn that would each ask the same question ask it once: a later `create_event` in the turn joins the open question, whose text counts the rest (*Filed "Glass blowing class" and 7 more. Which calendar?*), and the tap writes every one of them through the same test, the first row's outcome deciding the tap and the rest written after it. Eight classes filed in one dump reached the calendar as one event before this. **Changed again 2026-10-13.** `create_event` takes any row of the account's own with a time, whichever turn filed it: "please add the rest" about rows filed the day before was refused seven times as `unknown_content` while the tool took only its own turn's rows. A question it raises hangs off the message asking. And the proposals one turn makes on one calendar for one reason, with no guests, are one control: its line counts them (*Everyone on this calendar will see it. 8 events.*) and the tap agrees to or declines every one, the first through the live test and the rest through the verdict just agreed to. Eight proposals on one message drew one control and left seven with no way to be agreed to before this.

**AC-12** A row offload put on a calendar remembers the event it became, is not put on again, and the thread's rail draws it once. **Changed 2026-10-05.** The row goes where its event goes when offload is what moved it: removing one event through offload deletes the row with it, on the row's own eight seconds, and the turn's Undo brings both back with the row remembering the re-added event; changing one event's title or time changes the row, and Undo changes it back. The turn names the row's thread as changed, so Today and an open thread read again. A repeating row remembers the series, and each occurrence in the copy draws once, as the row, on Today and on the rail. Not covered, and open: an event removed or moved in Google itself leaves the row as it was filed, and "this and all following" leaves the row alone.

**AC-12a** (2026-11-06) A forwarded email about an event already on the person's calendar adds nothing to it and asks nothing. The turn reads the calendar first, the row is still filed with the end, place and details the email gives, and it remembers the event as AC-12's row does: drawn once, and moving with the event from then on, with its own title. It takes the event's end when the email gave none. The link holds only for an event of the person's own, one they made or were invited to, at the row's own moment, an all-day event by its day. Another event at that time, or somebody else's plan on a shared calendar, is a different event, and the row goes on as usual. Offload did not write the event, so the row stays the person's: the turn's Undo takes the row back and leaves the event where it is, a new date on the row lets the event go, and a cancelled invitation leaves the row in place, forgetting the event and off the day it was on, rather than deleting what they forwarded. **A cancelled event says so in Activity** (2026-11-06), for every row that followed one, quietly and opening the thread: *Design review was canceled*. A row that goes with its event is named by its day instead, *An event was canceled*, *Was Thursday 17 September.*, because an Activity row naming a row goes when that row does. Typed appointments do not read first: only an email can have got there by itself.

**AC-12b** (2026-11-07) The link does not rest on the model. Before a row from a forwarded email goes on a calendar, offload reads Google around that moment and looks for an event of the person's own there with every word of its title in what the turn read, the reply history below it left out. The title has to say which: two words of four letters or more, or the model's reading decides. One found, the row remembers it as in AC-12a, whichever calendar the call named. The first real invitation showed why: the turn matched it, the copy was up to fifteen minutes old, and a second event went on.

**AC-13** Each event is held once per calendar, on the connection, inside the window, with 012's minimisation, and leaves the copy when it falls behind the window. On this shipping, the rows 012 synced into threads are deleted and the rows offload wrote from a dump stay, a calendar's default thread becomes a pick where the account is still a member, waiting proposals close, and rules and their table go.

**AC-14** The privacy page says what changed in the same change: that offload reads who can see each calendar and keeps a count; that a calendar picked for a shared thread shows its events, with the names on them, to everyone in it; that a write confirms when more than one person can see the calendar, when offload could not tell, or when the switch is on (*since 2026-10-28 the page's promise is that offload asks first when a change would notify other people, which a guestless add to a shared calendar does not*); that the copy is kept for sixty days back and twelve months forward and goes when the calendar is unticked or disconnected; and that `Ask before adding` puts every write to you first when it is on.

**AC-15** No calendar name, participant, event title, place or address reaches analytics, a log or a trace. Ids, counts and outcomes only.

**AC-16** Android draws the list, the switch and the sheet in Material's own controls; iOS and web draw the design system's; all three carry the same copy. *Status: the copy is shared and Android draws the design system's controls on Material's tokens; the Material variants are owed, logged in the design decisions on 2026-09-18.*

**AC-17** The name of a calendar the account does not own is shown in the log on the person's turn and never reaches a prompt as their words.

## Depends on

- 012 for the connector, the vault, the sync, the tools and the proposal.
- 018 for the question a two-calendar thread raises and the control that answers it.
- 015 for the rail that draws a thread's calendar days.

## Open

- **Search over a calendar's events.** Held outside threads they are outside 013's index. Whether they earn their own index is a question for when somebody misses one.
- **Two calendars with the same 24 characters** make two chips read alike; the write still goes to the one tapped. Noted, not handled.
- **Google's verification** for the added scope, as for 012's: it gates reaching people past the test-user cap, not building.
