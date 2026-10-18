"use client";

// Undo in place (2026-10-18), the lists' end of it: a list drawn with each
// removed thing's line in the slot it left, and a record of which lines are on
// screen, so one whose place is not (the last row of a card that then goes,
// a list on another screen) is drawn under the composer rather than nowhere.
// An Undo nobody can see is an Undo taken away.

import { Fragment, useLayoutEffect, useSyncExternalStore } from "react";
import type { UndoEntry } from "@offload/widgets";
import { UndoLine } from "./UndoLine";
import { useInPlace, useUndoEntries, useUndoEntry } from "../../lib/undo";

const drawn = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const tell = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const read = () => version;

/** Counted before paint, so the composer's copy never flashes. */
function useDrawn(id: string): void {
  useLayoutEffect(() => {
    drawn.set(id, (drawn.get(id) ?? 0) + 1);
    tell();
    return () => {
      const left = (drawn.get(id) ?? 1) - 1;
      if (left > 0) drawn.set(id, left);
      else drawn.delete(id);
      tell();
    };
  }, [id]);
}

/** One line, drawn where its thing is, and counted as on screen. */
export function Line({ entry, radius }: { entry: UndoEntry; radius?: string | undefined }) {
  useDrawn(entry.id);
  return <UndoLine entry={entry} radius={radius} />;
}

/** The line for one id at a fixed spot: under the filter bar, under a
 *  thread's read. */
export function LineAt({ id, radius }: { id: string; radius?: string | undefined }) {
  const entry = useUndoEntry(id);
  return entry && entry.form !== "plate" ? <Line entry={entry} radius={radius} /> : null;
}

/** A list with each removed thing's line in its slot. `children` draws a thing
 *  that is here, with the line under it when it has one; a list whose rows
 *  draw their own (`ContentRowView`) leaves it. */
export function InPlace<T>({
  items,
  idOf,
  radius,
  children,
}: {
  items: readonly T[];
  idOf: (item: T) => string;
  /** The corner of what a slot replaces, when it is not a web row's. */
  radius?: string | undefined;
  children: (item: T, line: React.ReactNode, entry: UndoEntry | null) => React.ReactNode;
}) {
  const order = useInPlace(items, idOf);
  return (
    <>
      {order.map((one) =>
        "slot" in one ? (
          <Line key={one.entry.id} entry={one.entry} radius={radius} />
        ) : (
          <Fragment key={idOf(one.row)}>{children(one.row, one.line ? <Line entry={one.line} /> : null, one.line)}</Fragment>
        ),
      )}
    </>
  );
}

/** What the composer draws: the plate lines, and any line whose place is not
 *  on screen, as a plate. */
export function useUnplaced(): UndoEntry[] {
  const entries = useUndoEntries();
  useSyncExternalStore(subscribe, read, read);
  return [...entries.values()]
    .filter((entry) => entry.form === "plate" || !drawn.has(entry.id))
    .map((entry) => (entry.form === "plate" ? entry : { ...entry, form: "plate" }));
}
