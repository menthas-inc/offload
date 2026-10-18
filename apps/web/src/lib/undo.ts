"use client";

// Undo, drawn in place (2026-10-18): the one store, and the hooks a list reads
// it through. The state and the slot ordering are `@offload/widgets`, shared
// with the phones; this is the React end of it.

import { useCallback, useRef, useSyncExternalStore } from "react";
import { createOrderMemory, createUndoStore, interleave, type UndoEntry } from "@offload/widgets";

/** Outside every screen, so leaving one does not cancel a window. */
export const undoStore = createUndoStore();
/** Where each thing sat, so a list mounted mid-window keeps a slot in place. */
const order = createOrderMemory();

/** At sign-out: the next account on this device sees nothing of the last. */
export function forgetUndo(): void {
  undoStore.clear();
  order.clear();
}

const read = () => undoStore.entries();

export function useUndoEntries(): ReadonlyMap<string, UndoEntry> {
  return useSyncExternalStore(undoStore.subscribe, read, read);
}

/** Whether a thing was just brought back by Undo, for its soft highlight. */
export function useReturned(): (id: string) => boolean {
  useSyncExternalStore(undoStore.subscribe, read, read);
  return useCallback((id: string) => undoStore.returned(id), []);
}

/** The line drawn under a thing that is still here, or none. A refused write
 *  put the thing back, so its failure sits under it, grey. */
export function lineFor(entry: UndoEntry | undefined | null): UndoEntry | null {
  if (!entry || entry.form === "plate") return null;
  return entry.failed && entry.form === "slot" ? { ...entry, form: "under" } : entry;
}

export type InPlace<T> = { row: T; line: UndoEntry | null } | { slot: true; entry: UndoEntry };

/** A list with its lines: a removed thing's `slot` where it was, and a line
 *  under a thing that is still here. A `plate` line is never a list's. */
export function useInPlace<T>(items: readonly T[], idOf: (item: T) => string): InPlace<T>[] {
  const entries = useUndoEntries();
  const drawn = useRef<string[]>([]);
  const slots = new Set<string>();
  for (const [id, entry] of entries) if (entry.form !== "plate") slots.add(id);
  const start = drawn.current.length > 0 ? drawn.current : order.seed(items.map(idOf), slots);
  const { order: placed, ids } = interleave(start, items, idOf, slots);
  drawn.current = ids;
  order.note(ids);
  return placed.map((one) => {
    if ("slot" in one) return { slot: true as const, entry: entries.get(one.slot)! };
    return { row: one.row, line: lineFor(entries.get(idOf(one.row))) };
  });
}

/** The line for one thing by its id, for a line drawn at a fixed spot rather
 *  than in a list: under a thread's read, under the filter bar, in a chip. */
export function useUndoEntry(id: string): UndoEntry | null {
  return useUndoEntries().get(id) ?? null;
}
