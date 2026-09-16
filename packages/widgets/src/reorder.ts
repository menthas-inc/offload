// Dragging a row to a new place, expressed as priorities.
//
// A list is ordered by priority and nothing else a person can put their hands
// on, so "put this one third" has to become "give it a number that sorts third".
// The number is the midpoint between the rows that end up either side of it,
// which is the smallest write that holds the new order: one row changes, and
// the rest stay exactly as the planner or the person left them.
//
// **The scale is 0 to 100 in whole numbers**, which is what the priority
// endpoint accepts and what `content.priority` holds. A midpoint only exists
// while the two neighbours are at least two apart. When they are adjacent, or
// equal, the whole list is re-spread evenly across the scale with the moved row
// in its new slot, and every row whose number changed is written. That happens
// after about seven drops into the same gap and never before.
//
// **Ties are decided by recency, which is why a tie is never good enough.** Two
// rows at the same priority fall back to the list's own second key, newest
// first for content and oldest first for a note, and neither is where somebody
// just dropped the row. So the moved row always lands strictly between its
// neighbours, and a list of more than a hundred rows, which the scale cannot
// hold apart, is the one case where a drop may not stick.
//
// Shared rather than written per surface, for the reason everything in this
// package is: three clients disagreeing about where a row lands after a drag
// is a defect nobody would find until a shared list was arranged from two
// phones.

/** One row the list needs to know about: which, and where it sorts. */
export interface Ordered {
  id: string;
  priority: number;
}

/** A priority to write. `previous` is what Undo writes back. */
export interface ReorderWrite {
  id: string;
  priority: number;
  previous: number;
}

/** The top and bottom of the scale, and the one number past each end, so a
 *  row dropped at the top of a list whose first row is at 99 still gets 100. */
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 100;

/** The rows in their new order, and the writes that make the list sort that
 *  way.
 *
 *  `rows` is the list as drawn, top first, and only the rows that are drawn:
 *  a filter or a fold hides rows and they are not neighbours of anything. The
 *  moved row ends up between the two it was dropped between, whatever sits
 *  between them in the rows nobody can see.
 *
 *  Returns no writes when nothing moved, and at most one write when a midpoint
 *  exists. Every row the re-spread touches is written, and pinned by the
 *  endpoint, which is honest: a list somebody arranged by hand is theirs. */
export function reorderPlan<T extends Ordered>(
  rows: readonly T[],
  from: number,
  to: number,
): { rows: T[]; writes: ReorderWrite[] } {
  const next = [...rows];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) {
    return { rows: next, writes: [] };
  }
  const [moved] = next.splice(from, 1);
  if (!moved) return { rows: next, writes: [] };
  next.splice(to, 0, moved);

  const above = next[to - 1]?.priority ?? PRIORITY_MAX + 1;
  const below = next[to + 1]?.priority ?? PRIORITY_MIN - 1;

  // The list is drawn in priority order, so a row that moved is never already
  // strictly between its new neighbours: at best it ties one of them, and a
  // tie is decided by recency rather than by the drop. It always takes a new
  // number.
  const midpoint = Math.floor((above + below) / 2);
  if (midpoint < above && midpoint > below && midpoint >= PRIORITY_MIN && midpoint <= PRIORITY_MAX) {
    return {
      rows: next.map((row) => (row.id === moved.id ? { ...row, priority: midpoint } : row)),
      writes: [{ id: moved.id, priority: midpoint, previous: moved.priority }],
    };
  }

  return respread(next);
}

/** Every row evenly across the scale, top first, leaving room at both ends.
 *
 *  Three rows come out at 75, 50 and 25, so the next drop at either end still
 *  has a midpoint to take. The step is at least one whole number up to 99
 *  rows, which `floor` keeps distinct; a hundred rows take 100 down to 1, and
 *  past that the scale has no room and the last rows share a number, which is
 *  the limit stated above rather than something this papers over. */
export function respread<T extends Ordered>(
  ordered: readonly T[],
): { rows: T[]; writes: ReorderWrite[] } {
  const count = ordered.length;
  const writes: ReorderWrite[] = [];
  const rows = ordered.map((row, index) => {
    const priority =
      count < PRIORITY_MAX
        ? Math.floor((PRIORITY_MAX * (count - index)) / (count + 1))
        : Math.max(PRIORITY_MIN, PRIORITY_MAX - index);
    if (priority !== row.priority) writes.push({ id: row.id, priority, previous: row.priority });
    return priority === row.priority ? row : { ...row, priority };
  });
  return { rows, writes };
}
