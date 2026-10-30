// 2026-10-29. My threads as a grid, the rules both clients draw it by: where a
// tile's back glyph sits, how a move lands, and the words. Design handoff
// `APPLY-2026-10-29-threads-grid.md`.

export type ThreadSort = "newest" | "mine";

/** Where the tile's back glyph sits, as a percent of the tile, and its turn in
 *  degrees. The glyph is 190% of the tile, so each tile shows a different part
 *  of it; the same thread always shows the same part. */
export function backGlyph(seed: number): { left: number; top: number; turn: number } {
  return { left: -(25 + (seed % 55)), top: -(20 + ((seed >>> 5) % 60)), turn: ((seed >>> 2) % 4) * 90 };
}

/** The list with one thread taken out and put at `to`, clamped to the ends. */
export function moveThread(ids: readonly string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const rest = ids.filter((one) => one !== id);
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, id);
  return rest;
}

/** My threads in its order: newest made first, or the person's own, where a
 *  thread not in `ids` goes first, newest first, so a new one starts at the top
 *  left, and an id no longer in `rows` is skipped. The server reads by this and
 *  a client redraws by it at the press. */
export function orderThreads<T extends { id: string; createdAt: string }>(rows: readonly T[], sort: ThreadSort, ids: readonly string[]): T[] {
  const newest = [...rows].sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
  if (sort === "newest") return newest;
  const at = new Map(ids.map((id, i) => [id, i]));
  return [...newest.filter((row) => !at.has(row.id)), ...newest.filter((row) => at.has(row.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!)];
}

/** What a screen reader hears for a tile: its name, then its line. */
export const tileLabel = (thread: { name: string; meta: string }): string =>
  thread.meta ? `${thread.name}, ${thread.meta}` : thread.name;

export const ORDER_COPY = {
  newest: "Newest first",
  mine: "Your order",
  caption: "Drag a thread to put it where you want it. New threads still start at the top.",
  did: "Showing your order",
  failed: "Couldn't keep that order",
  moved: (place: number, of: number) => `Moved to ${place} of ${of}`,
} as const;
