# Apply: Undo, in place

Drawn in `explorations/undo-toast.html` and `explorations/undo-in-place.html` with the product
owner on 17 and 18 October 2026, over `main` as read on 17 October (`apps/mobile/components/shell/Toast.tsx`,
`apps/web/src/components/shell/Toast.tsx`, `apps/mobile/lib/optimistic.ts` and every `toast.show` caller).
All three surfaces, both themes. Standalone copy: `handoff/undo-in-place-standalone.html`, interactive,
with an iOS, Android and web switch and a **Make writes fail** control.

**Ready to build. Nothing is open.** The readme's **Undo is drawn in place** is the lasting statement;
this file is the build order. No new tokens or glyphs. The optimistic write, the eight-second window,
the commit and Retry in `optimistic.ts` are unchanged: **only where the Undo is drawn changes.**

---

## 1. The component: `UndoLine`

Reference: `components/feedback/UndoLine.jsx` and `.d.ts` in the design system. Three forms.

| Form | When | Size | Ground | Text, glyph, Undo |
|---|---|---|---|---|
| `slot` | the thing left its list | row height, min 56, padding 0 14 | `--amber-100` | `--amber-700`; Undo medium, underlined, 3px offset |
| `under` | the thing stayed, changed | min 36, left padding to the row's text (47) | none | `--text-secondary`, glyph `--text-tertiary`, Undo `--text-accent` |
| `plate` | nothing on screen changed | min 40, radius 12, hairline edge | `--surface-raised` | as `under` |

- Row: leading glyph 16px (14 in `under`), the message on one line with an ellipsis, then **Undo**
  with a 44px hit area. The glyph is the action's own: `archive`, `trash-2`, `arrow-up-right`,
  `bell`, `check`, `tag`, `pencil`, `cloudy`, `log-out`, `lasso`.
- **The clock**: a 2px rule along the foot, `--amber-600` in `slot`, `--border-strong` otherwise,
  scaling from full width to zero over 8000ms, linear.
- **In**: opacity and 3px up, 200ms `--ease-entrance`. **Out** at the end of the window: height and
  opacity to zero, 240ms `--ease-out`, then the list closes up. Reduced motion: no in or out; the rule
  still runs, because it is information.
- `slot` takes the corner of what it replaces: 0 inside a card, the card's radius (14, Android 16)
  when it replaces a card of its own, 8 on a web row.
- `role="status"`; failed, `role="alert"`.
- Dark: the tokens carry it (`--amber-100` #3E2E08, `--amber-700` #F6C86A). Contrast 6.5:1 light, 8.9:1 dark.

## 2. The state: many at once

Replace the single toast slot with a map keyed by the thing's id: `{ id: { message, icon, startedAt } }`.
Each entry has its own eight seconds. Archiving three rows shows three lines, each with its own Undo.
Starting a second action on the same id replaces its entry and restarts its clock.

- **Undo** drops the entry and reverts, as `optimistic.ts` does now. The row comes back in its slot
  with a 1.2s `--surface-attention-soft` fade.
- **Window out** drops the entry and commits; the slot closes.
- **Refused write**: the thing is put back, and its entry becomes the failure: same place, same ground,
  `circle-alert`, the existing per-action clause (*Couldn't archive that*), **Retry**, no rule. Not red,
  as with Toast. Retry runs the action again and starts a new window.
- Leaving the screen does not cancel a window. Coming back inside it shows the line with the time left
  (`startedAt`).

## 3. Every Undo, and where its line goes

**It leaves the list** (`slot`, amber, in the row's place):

| Action | Where | Line |
|---|---|---|
| Archive a row | a thread | *Archived* |
| Delete a row | a thread | *Deleted, gone in a moment* |
| Move a row or a note | a thread | *Moved to {thread}* |
| Delete a note | a thread | *Note deleted* |
| Tick off a to-do | Today, Open in your threads | *Ticked off* |
| Dismiss a reminder | Today | *Dismissed*, or *Dismissed until Thursday* for a repeating one |
| Answer a Needs you card | Today | *{option}, for {thing}*; the line takes the card's place and radius |
| Delete a thread / leave a shared one | My threads | *Thread deleted* / *You left the thread* |
| Move or delete a loose row | My threads, Not in a thread | *Moved to {thread}* / *Deleted, gone in a moment* |
| Make a thread from a suggestion | My threads | *Created {name}* in the first row's slot; the others go at once and return with Undo |
| Forget a memory | Memories | *Memory forgotten* |
| Delete a conversation | Memories, All conversations | *Conversation deleted* |

The reminder copy *Won't remind you about {name}* (11 October) is retired: the line sits where the
name was, so it says only what happened.

**It stays, changed** (`under`, grey, directly beneath it):

| Action | Line |
|---|---|
| Edit a row (row sheet Save) | *Saved* |
| Label a row | *{row} is under {label}* (existing copy) |
| Label a whole list | *Five under Repairs* (existing copy), under the filter bar |
| Edit a thread | *Thread updated*, under the thread's read |
| A dump filed into the thread you are in | *Saved to {thread}*, under the new row |

**Its home is gone:**

| Action | Line |
|---|---|
| Delete a label | `slot` in the label's chip in the filter bar, pill-shaped: *{label} deleted* |
| Delete the thread you are in | goes back to My threads; `slot` in that thread's row |
| A dump filed from Today, My threads, Memories | `plate`, above the composer: *Saved to {thread}*. Web: the line under the composer, where errors already go |

## 4. Not changed

- A tick inside a thread, the fold, mute and the switches: their own undo, no line, as now.
- Activity rows: they already carry their own Undo.
- **The Toast stays** for confirmations with no Undo (*Shared with Sam and Ana*, *Added to your
  threads*, *Added to the waitlist*) and for a conversation's own report (*Butter added to Groceries*,
  *Ticked {row}* in an answer). Those keep the ink bar and its current place.
- The web's delete confirm strip (*Delete X?*, Cancel, Delete) stays; the line follows it.

## 5. Code map

- **Mobile**: `components/shell/Toast.tsx` keeps the non-undo forms. `lib/optimistic.ts` emits to an
  in-place store (id → entry) instead of `toast.show` whenever it has an `undo`. Each list (`ThreadScreen`
  rows and notes, `TodayScreen` To do, Reminders and Needs you, `ThreadsScreen`, Not in a thread,
  `MemoriesScreen`) renders `UndoLine` for an id in the store in place of the row.
- **Web**: same store; `components/shell/Toast.tsx` keeps the non-undo forms; the list components read it.
  The composer's existing line hosts `plate`.
- Kits for reference: `ui_kits/mobile_app/UndoInPlace.jsx` (`KUndo`, `useInPlace`) wired into
  Reminders, Not in a thread, thread rows and conversation rows on both phones, and My threads on the web.

## Checks

- Nothing floats over the page while an Undo is up, on any surface.
- Three archives in a row show three lines, each with its own rule; undoing the middle one restores only it.
- A dismissed reminder's line sits in the Today card; Undo leaves Remind me on and the row in place.
- With writes failing, the row comes back and its line reads the clause with Retry, as an alert.
- Leaving a thread mid-window and coming back shows the line with the time left.
- Amber line text passes 4.5:1 in both themes.
