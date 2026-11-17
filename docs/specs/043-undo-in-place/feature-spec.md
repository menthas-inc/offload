# 043 Undo, in place

**Status:** built 2026-10-18 from the designer's handoff of the same day (`.claude/skills/offload-design/handoff/APPLY-2026-10-18-undo-in-place.md`, `handoff/undo-in-place-standalone.html`), drawn with the owner on 17 and 18 October, and the owner's ask that the toast that is left goes when its body is tapped.
**Surfaces:** iOS, Android and the web. No API change, no model call.
**Depends on:** the optimistic write of 2026-09 (`@offload/widgets` `optimistic.ts`: the write drawn at the press, the eight-second Undo, Retry), and every feature whose rows offer an Undo: 005, 009, 025, 027, 028, 038, 040, 042.
**Amends:** every spec that says an Undo is offered **in a toast**. From here an Undo, and the failure that replaces it, is drawn where the change is. The window, the write, the commit and Retry are unchanged; only where the words are drawn moves. The specs that say so are not rewritten line by line: this one supersedes their "Undo toast" wherever it appears, and the toast keeps only what section 4 lists.

**Amended 2026-11-17 (owner):** *obvious changes don't need an undo.* On a thread page (web, iOS, Android) ticking a to-do and moving a row or a note, to another thread or by dragging it within its list, draw no Undo line. The tick in a Todo list layout is the plain tick, as in every other layout, and the ticked row is unticked from the week fold. A refused write still puts the thing back and says so. Everything else in section 3 is unchanged, and so is the conversation's Undo, Today and Not in a thread.

## Why

The floating toast sat over whatever was under it: the composer, the last rows of a list, the next card. It covered the thing it was offering to take back, and on a phone it covered the field it was telling you about. Several changes in a row replaced each other's Undo, so only the last could be taken back.

## What

### The line

**UndoLine** is the way back, drawn where the change is, in one of three forms:

| Form | When | Looks |
|---|---|---|
| **slot** | the thing left its list (archive, delete, move, tick off, dismiss, forget) | amber, in the row's own place and height, taking the corner of what it replaces |
| **under** | the thing stayed and changed (edit, label, a thread's edit) | grey, directly under the row, aligned with its text |
| **plate** | nothing on screen changed (a dump filed from Today, My threads or Memories) | a raised line above the composer; on the web under it, where errors already go |

Each line has the action's own glyph, the message on one line, **Undo** with a 44px target, and **the clock**: a 2px rule along its foot that runs from full width to nothing over the eight seconds. The rule runs under reduced motion too, because it is information; the line's fade in and the close are cut.

- **Several at once.** Each thing has its own line and its own eight seconds. Archiving three rows shows three lines; undoing the middle one restores only it. A second action on the same thing replaces its line and restarts its clock.
- **Undo** drops the line and puts the thing back where it was, softly lit for a moment.
- **The window's end** drops the line and the list closes up.
- **A refused write** puts the thing back and its line becomes the failure under it: `circle-alert`, the action's own clause (*Couldn't archive that*), **Retry**, no rule, announced as an alert. Not red, as the toast's failure never was.
- **Leaving a screen does not cancel a window.** Coming back inside it shows the line with the time left.

Every action, its form, its words and where its line goes are the handoff's section 3, which this spec adopts whole. The reminder's *Won't remind you about {name}* is retired for *Dismissed* (*Dismissed until Thursday* for a repeating one): the line sits where the name was.

### The toast that is left

The toast keeps confirmations with no Undo (*Shared with Sam and Ana*, *Added to your threads*) and a conversation's own report (*Butter added to Groceries*). **Tapping its body fades it out**; its action, when it has one, still acts and is not the body.

### Not changed

A tick inside a thread, the fold, mute and the switches keep their own undo with no line. Activity rows keep their own Undo. The web's delete confirm strip stays, and the line follows it.

## Acceptance criteria

- **AC-1** Nothing floats over the page while an Undo is up, on any surface: every action in the handoff's section 3 draws its line in its stated place and form.
- **AC-2** Three removals in a row show three lines, each with its own clock; undoing the middle one restores only it.
- **AC-3** Undo puts the thing back in its place; the window's end closes the slot up.
- **AC-4** With writes failing, the thing comes back and its line reads the action's clause with Retry, as an alert, with no clock; Retry runs the action again with a new window.
- **AC-5** Leaving a screen mid-window and coming back shows the line with the time left.
- **AC-6** A dismissed reminder's line sits in the Today card and reads *Dismissed*, or *Dismissed until* the next day for a repeating one.
- **AC-7** A dump filed from a page that does not show the thread draws a plate line, *Saved to {thread}*, above the composer on the phones and under it on the web.
- **AC-8** The toast's remaining messages fade out when the body is tapped; its action still acts.
- **AC-9** Amber line text passes 4.5:1 in both themes (the tokens carry it: `--text-noticed` on `--surface-noticed-soft`, 6.5:1 light and 8.9:1 dark).

## Out of scope

- A new token or a new component in the design system's governed set: `UndoLine` is the handoff's, built in each client.
- Any change to the server, the window's length or what a write does.
