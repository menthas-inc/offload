# 048 Live updates

**Status:** drafted 2026-10-29 from the owner's brief and three answers of the same day. Revised the same day with the project-lead, client and security reviews; what changed is under Review.
**Surfaces:** the Core API, with My threads and the web's sidebar, the thread page, Not in a thread, Today, Memories, People, the Activity badge and the conversation, on iOS, Android and the web.
**Depends on:** 004 (the thread page catching up on a turn), 017 (saying what it is doing), 022 (shared threads, removal), 027 (Today), 040 (the Memories tab), 043 (Undo in place), the answer stream of the dump.
**Amends:**
- **`docs/tech/decisions.md`, server-sent events.** The second channel was scoped to one interactive answer, open while a turn is out. From here every signed-in client holds one open connection for as long as it is on screen. Its cost is stated in the impl-spec and gets its own dated entry.
- **The design system's change mark** (readme, "The change mark"). It plays for what one of the person's own dumps filed, from whichever of their devices it was sent, and deliberately not for anything else that appears while somebody is watching, which the readme's "anything that appeared while somebody was watching" would otherwise include. The implementing change logs this in `.claude/skills/offload-design/decisions.md` (OFF-7).

## Why

offload is used on more than one screen at once: a phone in the hand and the web open on a laptop, or two people in one shared thread. Today a change made in one place reaches the others only when they reload. The owner found it with threads: rename, move or add something on the phone and the web goes on showing what it held until the page is refreshed.

A screen that shows something untrue until you reload is the same class of untruth 004 retired for a single device ("added to Flat renovation" while Flat renovation visibly does not have it), arriving from another device or another person. The product says you dump things in and offload does the filing. Watching the filing land is part of trusting it.

## What

**A screen that is open shows what is true now, without being reloaded.** When something it shows changes, wherever the change came from, the screen catches up within a few seconds: another of the person's devices, another member of a shared thread, offload finishing a turn, the nightly pass, a connected calendar.

**The live connection says that something changed, never what.** It carries ids and a kind. The screen then reads what it shows through the same reads it uses today, with the same checks. Nothing a person wrote, no name and no title, ever travels on it, and nothing on it is stored.

### What updates

| Screen | Catches up when |
| --- | --- |
| My threads, and the web's sidebar | a thread the person is in is made, renamed, re-iconed, left or deleted, gains or loses a member, or something is added to it or taken out of it |
| A thread's page | what is in it, its notes, its members, its name, icon or layout change; it is left or deleted |
| Not in a thread | what is in it changes |
| Today, all its sections | a row or note of the person's with a date changes; a reminder is dismissed elsewhere |
| Memories | a memory of the person's is added, changed or forgotten |
| People, and the waiting invitations | a connection, a connection request or a thread invitation of the person's changes |
| The Activity badge | a new activity entry for the person |
| The conversation | the person dumps from another device, and offload answers it |

Each screen catches up only on the kinds it shows: a memory changing does not make an open thread page read itself again. Several changes close together are one catch-up, measured from the last of them.

Not in this feature: settings and appearance, which change rarely and on one device; the admin panel.

### How it looks

- **It just changes.** The screen redraws with what is now true. No toast, no banner, no mark. *(Owner, 2026-10-29.)*
- **One exception: the person's own dump.** What one of their dumps filed takes the change mark it already takes on the device it was sent from, on every device that has that thread open. A dump sent from the phone that files into the thread open on the web is exactly the case the mark exists for. Same rules: nothing under reduced motion, never on a row that is waiting on the person. Another member's dump, a person's edit and the nightly pass take no mark.
- **The prism's arrival pulse on the phones plays for the phone's own turns only.**
- **A catch-up draws no spinner** and never empties a screen while it reads. A screen that becomes empty draws its own empty state, as it would on a reload.

### Nothing the person is doing is disturbed

- **An open editor, sheet, dialog or menu stays open and keeps what is typed in it.** The screen behind it catches up.
- **A thread that goes away under an open editor**, because it was deleted, the person left it elsewhere, or they were taken out of it: the editor stays open with its text. Saving fails with the editor's own failure line and keeps the text in the editor; closing the editor then closes the thread. Nobody's unsaved words are thrown away by somebody else's action.
- **A thread that goes away with nothing open** closes and lands on My threads, where it is no longer listed. No line and no Undo: the line My threads draws for a thread that went is the Undo's own slot, and here there is nothing to undo. *Amended during the build, 2026-10-29: the first draft said the line was drawn.*
- **A catch-up that arrives while the person's own write is still out waits for it**, then runs. It is never dropped.
- **What a screen drew ahead of the server survives a catch-up**: a row it drew before the server answered, an Undo line, a once-only line such as a layout heads-up, a suggestion not yet answered, a change mark still settling.
- **The list does not jump to its top.** A row added or removed above the visible ones may move what is on screen; that is accepted (Out of scope).

### The conversation on another device

A dump sent from one device appears in the conversation on the person's other devices, and offload's answer follows it there, step lines, writing indicator and Done included, as the answer arrives. *(Owner, 2026-10-29.)* The turn belongs to the device that sent it:

- **Stop and Undo stay on the sending device.** The other device draws the turn without them. Correcting what it filed is done in the thread, as for any row.
- **Try again and Finish work from any of the person's devices.** A turn that failed or stopped partway draws its line with its control everywhere it is drawn, so no device shows a failure it offers no way past. Pressed on another device, the turn is that device's from then on. *(Owner, 2026-10-29, during the build.)*
- **The other device's composer is untouched**: its draft, a pinned `+`, attachment chips and a running recording stay as they were, and it can send its own dump while the other turn is out.
- **The conversation does not rise on its own.** If it is put away, the turn is there when it is next opened, as after a reload; past the thirty-minute rule it lands where a reload would put it.

### When the connection is not there

- **Coming back is catching up.** A web tab that regains focus or visibility, and a phone app that comes back to the foreground, reads the screen it is on again. So a laptop that slept or a phone that was in a pocket is never stale for longer than it takes to look at it. This half needs no live connection and ships first.
- **A dropped connection reconnects on its own**, with backoff, and every reconnect counts as coming back.
- **Nothing is shown about it.** No offline banner. A screen with no live connection behaves exactly as today.
- **The phones do not wake up for this.** A backgrounded app holds no connection and catches up when it is opened. Push notifications are 024's and unchanged.

### Who hears what

- **A person hears about a thread only while they are an accepted member of it**, decided when the message goes, not when their connection opened. A pending invitee hears nothing about the thread, and somebody who was never in it learns nothing, not even that it changed.
- **A person taken out of a thread is told once**, on their own connection, with the thread's id and nothing else, so their screen can close it. That is the one message about a thread somebody is no longer in, and nothing follows it.
- **A thread invitation** reaches the invitee as an invitation, with no thread id and no name. Accepting it is what starts the thread's changes reaching them.
- **The conversation is the person's own.** A dump into a shared thread tells the other members that the thread changed, once its rows land, and nothing about the conversation it came from.
- **Who made a change never travels.** Every device of every member gets the same message, the device that made the change included.
- **Timing is not hidden.** A member watching a shared thread can tell roughly when another member is active in it, from when things change. That is already true on a reload and is accepted; changes are batched on a short fixed tick so the connection adds no finer timing than that.

### Ending a connection

A connection ends within 15 seconds of its session no longer allowing a read: signed out, revoked, the account disabled or deleted. A new one cannot be opened in any of those states. New terms waiting to be agreed to stop dumping, not reading, so they leave the connection open, as they leave every read. A person has at most a small, fixed number of connections open at once; the oldest goes when another opens.

### The privacy page

Nothing on it becomes untrue: no new company receives anything, nothing new is stored, the connection carries ids only, and its logs carry ids and counts, one line per connection and none per message. Checked against `apps/web/src/app/(marketing)/privacy/page.tsx` on 2026-10-29.

## Acceptance criteria

- **AC-1** With the web open on My threads, renaming a thread on a phone signed in to the same account changes its name on the web within 3 seconds, with no reload.
- **AC-2** With the web open on a thread, something a dump from the phone filed into that thread appears on the web within 3 seconds, with the change mark; the same in the other direction.
- **AC-3** With a shared thread open on member B's screen, member A adding to it, editing a row or a note, or ticking a task shows on B's screen within 3 seconds, with no mark.
- **AC-4** An account that is not an accepted member of a thread, a pending invitee included, receives nothing on its connection while that thread changes. Tested at the API.
- **AC-5** Member B taken out of a thread while it is open with nothing else open: B's screen leaves it within 3 seconds, lands on My threads, offers no Undo, and B's connection carries nothing about that thread afterwards.
- **AC-6** Member B taken out of a thread while B has an editor open in it: the editor stays open with its text, a save fails with the editor's failure line keeping the text, and the thread closes when the editor does.
- **AC-7** A row, note or memory changed by offload (a turn on another device, the nightly pass, a calendar sync) reaches an open screen showing it within 3 seconds.
- **AC-8** Today, Memories, People and the Activity badge each catch up within 3 seconds of a change on another device to what they show, and a screen does not read itself again for a kind it does not show.
- **AC-9** A catch-up that arrives while the screen's own write is out runs once that write settles. Something drawn ahead of the server and an Undo line still showing survive a catch-up.
- **AC-10** A web tab hidden for any time, and a phone app backgrounded for any time, show current data within 3 seconds of being looked at again, with no live connection at all.
- **AC-11** What travels on the connection is ids and kinds only. A test asserts the shape of every message on it, and that no log line is written per message.
- **AC-12** A connection ends within 15 seconds of its session being signed out, revoked, disabled or deleted, and a new one is refused in each state.
- **AC-13** Opening one more connection than the cap closes the oldest.
- **AC-14** A dump sent from the phone appears in the web's open conversation within 3 seconds, its step lines and answer follow as they land, and the web draws no Stop or Undo for it and keeps its own composer usable; if it fails or stops partway, the web draws Try again or Finish and either works; the same in the other direction.
- **AC-15** The phones gain this with no new store build: the release goes over the air.
- **AC-16** With no live connection at all (blocked, unsupported, failing), every screen behaves as it does today and nothing is drawn about it.

## Out of scope

- Merging two people's simultaneous edits to one row. The last write wins, as today; the other screen catches up to it.
- Showing who changed something.
- Presence: who else is looking at a thread.
- Live updates to a backgrounded phone, or to settings, appearance and the admin panel.
- Holding a list still under a finger: a row that moves because one above it was added or removed may move what was about to be tapped.
- Replaying what was missed while disconnected. Coming back reads the screen again instead.

## Review

Three reviews on 2026-10-29: project lead, client, security.

**Changed.**
- The connection carries ids and a kind, and is stated as such up front; the conversation's answer is read through the ordinary reads too, which resolves AC-10 against AC-14 (security). The phones' answer poll stays as it is: it already asks every second while a turn is live, AC-16 needs a path with no connection, and the connection only has to say that a dump appeared (project lead asked for the poll to go).
- Removed while editing is decided: the editor wins, its text is kept, and the thread closes when it does (all three).
- Who hears what: decided at the moment of the change from accepted membership, pending invitees excluded, the removal message addressed to the removed person alone, invitations without a thread id, the conversation never keyed to a thread, no actor on the wire, timing accepted in writing (security, client).
- Kinds and batching: each screen catches up only on what it shows, changes coalesce, and the criteria are measured from the last change (all three).
- The change mark: plays only for what the person's own dump filed, on every device, as it already does on the sending one; everything else is the owner's silent redraw (client). Logged as a design-system amendment.
- The second device's turn: no Stop, Finish, Try again or Undo, composer untouched, conversation does not rise (client, project lead).
- A catch-up during a write is held, not dropped; drawn-ahead state survives one (client).
- Ending a connection: 15 seconds, every end state named, a per-account cap (security, project lead). New terms pending were suggested as an end state and left out: they stop dumping, not reading.
- Coming back ships first, as its own piece, since it needs no server (project lead).
- Amends filled in; the privacy page checked and the result written down (project lead, security).

**Not changed, deliberately.**
- **Splitting off Today, Memories, People and Activity** (project lead). The owner asked for most things, and with kinds on the connection they ride the same signal; the cost is per-screen wiring, which the tasks carry.
- **Dropping "something is added to it" from My threads** (project lead). The row's count and order are what the person sees change; batching bounds the cost.
- **Holding a list still under a finger.** Accepted, in Out of scope.
- Mechanism (triggers or writes, one stream or two, the phone transport, the cap's number): impl-spec.
