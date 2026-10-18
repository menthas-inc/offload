// Undo, drawn in place (2026-10-18).
//
// The floating toast covered whatever sat under it, so an Undo is now drawn
// where the change is: in the slot a removed thing left, under a thing that
// changed, or above the composer when nothing on screen did. This is the state
// behind that: one line per thing, keyed by its id, each with its own eight
// seconds, so archiving three rows shows three lines. It lives outside any
// screen, so leaving a screen does not cancel a window and coming back inside
// it shows the line with the time left.
//
// The write, the window and Retry are `optimistic.ts`, unchanged: only where
// the words are drawn moved. React-free; each client wraps it in a hook.

import type { Place, ToastAction, UndoForm } from "./optimistic.js";

/** The Undo window, the same eight seconds everything in the product uses. */
export const UNDO_MS = 8000;
/** How long a thing brought back by Undo keeps its soft highlight. */
export const RETURNED_MS = 1200;

export interface UndoEntry {
  id: string;
  message: string;
  icon: string;
  form: UndoForm;
  action?: ToastAction;
  /** A refusal: circle-alert, Retry, no rule, announced as an alert. */
  failed: boolean;
  /** When its window opened, so a line drawn later shows the time left. */
  startedAt: number;
}

export interface UndoStore {
  /** The same map until something changes, so it can be a snapshot. */
  entries: () => ReadonlyMap<string, UndoEntry>;
  put: (place: Place, message: string, action?: ToastAction) => void;
  drop: (id: string, options?: { returned?: boolean }) => void;
  returned: (id: string) => boolean;
  subscribe: (listener: () => void) => () => void;
  /** Everything gone, timers too: at sign-out, so the next account on the
   *  device sees nothing of the last one's words. */
  clear: () => void;
}

interface Timing {
  now: () => number;
  schedule: (run: () => void, ms: number) => unknown;
  cancel: (timer: unknown) => void;
}

// This package has no DOM or Node types; both runtimes have these two.
const timers = globalThis as unknown as {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};
const realTiming: Timing = {
  now: () => Date.now(),
  schedule: (run, ms) => timers.setTimeout(run, ms),
  cancel: (timer) => timers.clearTimeout(timer),
};

/** The failure forms, as the toast has always read them. */
export function isFailure(action: ToastAction | undefined): boolean {
  return !action || action.label === "Retry" || action.label === "Try again";
}

export function createUndoStore(timing: Timing = realTiming): UndoStore {
  let entries: ReadonlyMap<string, UndoEntry> = new Map();
  const timers = new Map<string, unknown>();
  const back = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());

  const remove = (id: string): void => {
    const timer = timers.get(id);
    if (timer !== undefined) timing.cancel(timer);
    timers.delete(id);
    if (!entries.has(id)) return;
    const next = new Map(entries);
    next.delete(id);
    entries = next;
  };

  return {
    entries: () => entries,
    put(place, message, action) {
      remove(place.id);
      const entry: UndoEntry = {
        id: place.id,
        message,
        icon: place.icon,
        form: place.form,
        failed: isFailure(action),
        startedAt: timing.now(),
        ...(action ? { action } : {}),
      };
      entries = new Map(entries).set(place.id, entry);
      timers.set(
        place.id,
        timing.schedule(() => {
          timers.delete(place.id);
          remove(place.id);
          tell();
        }, UNDO_MS),
      );
      tell();
    },
    drop(id, options) {
      remove(id);
      if (options?.returned) {
        const was = back.get(id);
        if (was !== undefined) timing.cancel(was);
        back.set(
          id,
          timing.schedule(() => {
            back.delete(id);
            tell();
          }, RETURNED_MS),
        );
      }
      tell();
    },
    returned: (id) => back.has(id),
    clear() {
      for (const timer of [...timers.values(), ...back.values()]) timing.cancel(timer);
      timers.clear();
      back.clear();
      entries = new Map();
      tell();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Interleaved<T> = { row: T } | { slot: string };

/** Ghosts a list remembers beyond what it draws: enough for any burst of
 *  removals, bounded so a long-lived list does not grow without end. */
const GHOSTS = 200;

/** A list with each removed thing's slot kept where it was while its line runs.
 *
 *  `drawn` is the order the list remembers; the returned `ids` is the next one
 *  to keep. A slot goes after the nearest thing above it that is still drawn,
 *  so it stays put while the rows around it reload. A thing that left is
 *  remembered as a ghost even with no line yet, because the render that
 *  removes a row can land before the one that brings its line. */
export function interleave<T>(
  drawn: readonly string[],
  items: readonly T[],
  idOf: (item: T) => string,
  slots: ReadonlySet<string>,
): { order: Interleaved<T>[]; ids: string[] } {
  const present = new Set(items.map(idOf));
  const order: Interleaved<T>[] = [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const keep = (id: string) => (ids.push(id), seen.add(id));
  let next = 0;
  let ghosts = 0;
  // Walk what was drawn, letting the current items through in their own
  // order up to each one that was drawn before.
  for (const id of drawn) {
    // Moved up since it was drawn, so already through.
    if (seen.has(id)) continue;
    if (present.has(id)) {
      // Everything new that sorts before this one, then this one.
      while (next < items.length) {
        const item = items[next]!;
        const itemId = idOf(item);
        next += 1;
        if (seen.has(itemId)) continue;
        order.push({ row: item });
        keep(itemId);
        if (itemId === id) break;
      }
      continue;
    }
    if (slots.has(id)) order.push({ slot: id });
    else if (ghosts >= GHOSTS) continue;
    else ghosts += 1;
    keep(id);
  }
  for (; next < items.length; next += 1) {
    const itemId = idOf(items[next]!);
    if (seen.has(itemId)) continue;
    order.push({ row: items[next]! });
    keep(itemId);
  }
  return { order, ids };
}

/** How many neighbours the memory holds before it starts again. */
const REMEMBERED = 5000;

/** Each thing's neighbour above it, as lists last drew them, outside every
 *  screen. A list mounted afresh mid-window (a screen come back to, a tab
 *  switched to) has drawn nothing yet, so it seeds its order from this and a
 *  removed thing's slot is still where it was. */
export function createOrderMemory() {
  let above = new Map<string, string | null>();
  let below = new Map<string, string | null>();
  return {
    clear(): void {
      above = new Map();
      below = new Map();
    },
    note(ids: readonly string[]): void {
      if (above.size > REMEMBERED) (above = new Map()), (below = new Map());
      ids.forEach((id, index) => {
        above.set(id, index === 0 ? null : ids[index - 1]!);
        below.set(id, index === ids.length - 1 ? null : ids[index + 1]!);
      });
    },
    /** A slot goes beside a neighbour this list draws, and only there: a list
     *  that draws neither is another list, or an empty one. */
    seed(ids: readonly string[], slots: ReadonlySet<string>): string[] {
      const out = [...ids];
      for (const slot of slots) {
        if (out.includes(slot)) continue;
        const up = above.get(slot);
        const down = below.get(slot);
        const after = up ? out.indexOf(up) : -1;
        if (after >= 0) out.splice(after + 1, 0, slot);
        else if (down && out.includes(down)) out.splice(out.indexOf(down), 0, slot);
      }
      return out;
    },
  };
}
