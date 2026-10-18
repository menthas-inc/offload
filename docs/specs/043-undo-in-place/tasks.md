# 043 Undo, in place: tasks

`[ ]` open, `[x]` done. Every task with behaviour started with its test seen red (QUAL-1).

## A. Shared

- [x] **A1** `optimistic.ts`: `Place`, `UndoForm`, `Reversible.place`, and `perform`/`reverse` passing it for the Undo, the failure and the refused undo, never for a confirmation with no Undo (`optimistic.test.ts`). *(AC-1, AC-4)*
- [x] **A2** `undo.ts`: `createUndoStore` (several at once, each its own eight seconds, a second action replaces, failed by its word, the returned highlight, subscribers), `interleave` (a slot where it was, first stays first, closes up, a late line, reordered rows) and `createOrderMemory` (a list mounted mid-window seeds a slot beside a neighbour it draws, never into a list that draws neither) (`undo.test.ts`). *(AC-2, AC-3, AC-5)*
- [x] **A3** `circle-alert` vendored: design system icons, the web's `public/icons/`, the phones' generated set.

## B. Web

- [x] **B1** `lib/undo.ts`, `UndoLine` (`UndoLine`, `UndoPlates`, `UndoAt`, `Returned`), `undo.module.css`; `Toast.tsx` routes a placed word and fades on a body click (`undo-in-place.test.tsx`). *(AC-1, AC-4, AC-8)*
- [x] **B2** Every action in the handoff's section 3: a thread's rows, To do, notes, the filter bar's labels, the thread's read, My threads, Not in a thread, Today's To do, Reminders, Open in your threads and Needs you, Memories, and the composer's plate for a filed dump (`undo-in-place-thread.test.tsx`, `undo-in-place-lists.test.tsx`, cases in `today.test.tsx`, `composer-undo.test.tsx`, `loose-group.test.tsx`, `memories-pane.test.tsx`). *(AC-1 to AC-7)*
- [x] **B3** A line with no slot on the screen you are on (a card the page stopped drawing, the rail, the Files grid, another screen) is drawn as a plate under the composer (`components/shell/InPlace.tsx`, `useUnplaced`), so no Undo is lost. Today's To do and Reminders keep their card while their last thing's line runs. *(AC-1, AC-6)*

## C. Phones

- [x] **C1** `lib/undo.ts`, `UndoLine` with the Reanimated clock, `Toast.tsx`'s body press (`undo-in-place.test.ts`). *(AC-1, AC-4, AC-8)*
- [x] **C2** Every action in section 3 on both phones, through `components/shell/InPlace.tsx`: a thread's rows, To do, notes, the filter bar's chip (at the chip's height), the thread's read, My threads, Not in a thread, Today's To do, Reminders, Open in your threads, Needs you, Memories; the plate above the composer for a filed dump while the conversation is put away (`undo-in-place-lists.test.ts`). *(AC-1 to AC-7)*

## D. As built, and what is open

- **A dump filed into the thread you are in** takes the plate on every surface: the turn does not carry the new row's id to draw the line under it.
- **Discarded** (a long voice note thrown away) and a turn's refused Undo stay toasts: they are the composer's and the conversation's own, and the handoff's table does not list them.
- **On the phones, a filed dump's Undo is a toast while the conversation sheet is up**, since the plate is under the sheet; the plate once it is put away.
- **Delete a conversation** has no screen on either client yet, so it has no line.
- **Review of PR 127, fixed:** the month read counts today's overdue to-dos and works each row's days out once (300 long repeating rows went from 18.7s to well under a second); the calendar read is capped; a row's own failed line takes the grey form on the web too; the phones plate a line with no slot on screen, as the web does (`useDrawn`, `useUnplaced`); the clock runs under reduced motion and restarts when a line is replaced; the phones fade a line out; closed days read as closed; the toast fades on Escape on the web and keeps its action reachable by a screen reader on the phones; the undo store and order memory are cleared at sign-out; the phones' Open in your threads drops a ticked row as the web does; the month re-reads after a write.
- [x] **D1** Device pass on the Pixel and the iOS simulator: the month, the lines in their slots with their clocks. Pressing Undo inside eight seconds over adb or the simulator panel is not reliable; Undo itself is proved by the tests and on the web.
