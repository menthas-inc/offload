# offload for web

A recreation of offload on a desktop browser, built on the same `data.js` as the iOS and
Android kits, so every string, count and event here is the product's own.

Open `index.html`. The bar above the window is preview scaffolding, not product: theme,
window width, and the first-run phases (sign in, the refusal line, no invite, the tutorial,
and day one, where the whole account is empty).

## The shell

    ┌────────┬──────────────────────────────────┐
    │ dark   │ breadcrumb, the whole path       │
    │ side   ├───────────────┬──────────────────┤
    │ bar    │ pane, depth 2 │ pane, depth 3    │
    │        │ page colour   │ white            │
    │        ├───────────────┴──────────────────┤
    │        │ composer card, centred           │
    └────────┴──────────────────────────────────┘

Six rules, in the order they bite:

1. **Paper alternates with depth.** A top-level pane is the page colour
   (`--surface-page`), the pane you open on it is white (`--surface-raised`), the next
   one is the page colour again. The depth is stamped on a pane when it opens, so
   dropping a pane off the left never repaints the ones the reader is still in.
2. **The stack holds five panes, two of them on screen.** A sixth drops the oldest.
   Opening slides the new pane in from the right in 260ms while the survivor shifts left
   with it, and the pane leaving the left edge fades on its way out.
3. **Panes are for what you click inside a pane.** Clicking anything in the sidebar
   resets to one pane showing that thing full width.
4. **The breadcrumb is the whole path**, however deep it goes: the row scrolls
   horizontally, only the current crumb keeps its full width, and clicking any crumb pops
   back to it.
5. **The sidebar marks the active pane, or its parent.** A task marks the thread it
   belongs to, a memory marks the thread it lives in, a conversation marks Memories, so
   something is always marked. The whole column is a dark-themed region
   (`data-theme="dark"` scoped to it) in both app themes, so the nav is never confused
   with a pane.
6. **One composer, under both panes.** It never belongs to a pane and never moves. It is
   a white card only as wide as its input, with a blue border and an inset blue wash, so
   it reads as one object against a white pane. What you type grows the card upward: the
   question, the answer and the same input you typed in, capped at 420px and scrolling
   past that. ⌘K is the opposite: modal, with a scrim, because it is a launcher.

Two panes split 520 / rest, so the thing you just opened is the wider one.

The width control drops to a single pane and turns the breadcrumb into a back button,
which is what a real viewport under about 1250px would do.

## Files

| File | What is in it |
| --- | --- |
| `index.html` | Loads the design-system bundle, `sun.js`, `data.js`, then the kit |
| `W.jsx` | Web layout vocabulary: `WPane`, `WPaneHead`, `WBody`, `WRow`, `WSection`, `WCrumbs`, `WTile` |
| `WApp.jsx` | The shell: pane stack and its depths, breadcrumb, composer, delete and undo, palette, `WThings`, `WCalendar` |
| `WToday.jsx` | Today, the week strip (k1), and Open in your threads (`WThreadPages`, 7 October) |
| `WThing.jsx` | A thread, and anything inside it opened as its own pane |
| `WMemories.jsx` | Memories, one memory, all conversations |
| `WMisc.jsx` | Sidebar, composer and its expanded state, turns, conversation, person, first run, ⌘K |
| `WFirstRunGate.jsx` | Everything before the shell: sign in, the refusal line, no invite, the three tutorial screens |
| `WSharing.jsx` | The share modal and its new-connection step, the @ picker, the pending invitation, the invitation modal, the quiet empty panes |
| `WSettings.jsx` | Settings as two panes: the index, and the ten pages |

Screens covered: sign in, no invite, the three tutorial screens, Today, My threads, a
thread, a task, Memories, a memory, a conversation, all conversations, a person, calendar, settings
and its ten pages, and day one with the whole account empty.

## What is different from the phone

- The diary is a week, not a day. Five cards on Today (k1), with a full week grid in a
  pane when you open the calendar. Free time is measured from the events themselves.
- Swipe is gone. Row actions appear on hover as quiet icon buttons, and the trash is the
  one red control in the kit: it only turns red once the pointer is on it.
- **Deleting asks first.** The trash turns the row into "Delete X?" in its own place, with
  Cancel and a red Delete; a click anywhere else is a cancel. On confirm the row collapses
  in 220ms and a toast holds the undo for eight seconds. Nothing leaves `data.js`, so undo
  is a flag flip, and one deletion reads the same everywhere: the pane, the sidebar's
  Pinned and Recent lists and its count, and the ⌘K jump list.
- Long press is gone. ⌘K carries what it used to: jump to a thread or a memory, and the
  handful of commands.
- **Sharing is a modal**, the only one besides ⌘K, because sharing is not a place you
  navigate to. The share control sits in the pane head of a thread with the faces beside it.
- **There is no search.** Finding something happens through the composer: ask it and it
  answers from everything you dumped, which is the same thing the phones do. ⌘K stays for
  jumping to a thing or a memory by name.

## What moves

Transform and opacity only, nothing over 260ms.

| What | How |
| --- | --- |
| Opening a pane | New pane slides in from the right, 260ms `--ease-out`; the survivor shifts left with it; the pane pushed off the left fades out |
| Going back | The returning pane enters from the left, same duration |
| Breadcrumb | Crumbs fade in from the left, 200ms |
| Sidebar selection | The blue marker scales up, 220ms |
| Row hover | Tools fade in, 120ms; the fill is a background transition |
| Deleting | Confirm strip fades in 140ms, row collapses 220ms, toast rises 220ms and sinks 200ms |
| Composer | Grows upward to its cap when a conversation opens |

## Settings

Settings is a pane like anything else. `Settings` in the sidebar resets to the index, a page
opens to its right, and the sidebar keeps marking Settings while you are in either. The ten
pages and their copy are the phone kits'; what the width buys is that the index never leaves,
so moving between pages is one click and never a back button. Two-column blocks where a page
has two halves: connected apps, and the memory counts.

Anything destructive is the last block on its page, in clay, and says what it takes with it.

## What it does not do

No notification centre, no drag and drop between panes. Activity in the
sidebar is drawn but not wired. The landing page and the invite email live at
`ui_kits/marketing_site/`.
