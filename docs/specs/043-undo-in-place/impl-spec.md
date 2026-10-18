# 043 Undo, in place: how

## Constitution gate

- **QUAL-1** every list's change starts with a test seen red; the shared state and ordering are unit tested once in `@offload/widgets`.
- **DEV-1** the smallest change: the write path is untouched. An op gains one optional field, `place`, and the toast's `show` routes a word with a place to a store instead of drawing it. Most call sites change by one line.
- **OFF-7** tokens only: the amber is `--surface-noticed-soft`, `--text-noticed` and `--surface-noticed`, the semantic aliases of the handoff's ramp values.
- No data, no API, no privacy-policy change: nothing new leaves the device.

## The shape in one paragraph

`Reversible` (the optimistic op) gains `place?: { id, icon, form }`. `perform` and `reverse` pass it as a third argument to `toast.show` for the Undo, the failure and the refused undo, never for a confirmation with no Undo. Each client's `useToast().show(message, action, place)` puts a word with a place into one module-level **undo store** (`createUndoStore`, keyed by the thing's id, a timer per entry) and draws only placeless words as the toast. Lists render through `useInPlace(items, idOf)`, which reads the store with `useSyncExternalStore` and runs `interleave` to keep a removed thing's slot where it was while its line runs. `UndoLine` draws an entry; `UndoAt` draws one by id at a fixed spot; `UndoPlates` stacks the plate lines; `Returned` lights a thing Undo brought back.

## Shared: `packages/widgets/src/undo.ts`

- `UNDO_MS = 8000`, `RETURNED_MS = 1200`.
- `createUndoStore(timing?)`: `entries()` (a new map on every change, so it is a stable snapshot), `put(place, message, action?)` (replaces the id's entry and restarts its timer; `failed` is true when the action is Retry, Try again or absent), `drop(id, { returned? })`, `returned(id)`, `subscribe(listener)`. Timing is injectable for tests.
- `interleave(drawn, items, idOf, slots)`: the list's order with slots, and the order to remember. A slot goes after the nearest thing above it still drawn. A thing that left is remembered as a ghost even with no line yet (bounded at 200), because the render that removes a row can land before the one that brings its line. Rows reordered since are each drawn once.

## Clients

Both clients carry the same `lib/undo.ts` (`undoStore`, `useUndoEntries`, `useInPlace`, `usePlateLines`, `useUndoEntry`, `useReturned`) and a `components/shell/UndoLine.tsx`.

- **Web**: `undo.module.css`; the clock is a CSS animation started at a negative delay for the time already gone. `Toast.tsx` routes placed words and fades on a body click (`data-leaving`, removed on `animationend`; immediately under reduced motion).
- **Phones**: NativeWind classes and Reanimated: the clock is a `scaleX` shared value timed to what is left; the line fades in unless reduced motion. `Toast.tsx`'s bar is a `Pressable` whose press hides it, and the existing `FadeOut` exit is the fade; the action's own `Pressable` keeps its press.
- `circle-alert`, the failure's glyph, was vendored into the design system's icons, the web's `public/icons/` and the phones' generated set (it was referenced by `Toast.jsx` and missing locally).

Where each action's line goes is the handoff's section 3 and its code map (section 5); the as-built list is in `tasks.md`.

## Edge cases

- **A write that fails before Undo is pressed**: the store's entry is replaced by the failure under the restored row; its Undo can no longer be pressed.
- **Undo pressed before the write lands**: unchanged, `perform` waits for the write before reversing.
- **The same id on two screens** (a row on Today and in its thread): one entry, drawn wherever that id is listed. That is the point of the store being outside the screens.
- **An entry whose thing is on no screen**: it runs out its eight seconds unseen, as a toast for a screen you left did.
