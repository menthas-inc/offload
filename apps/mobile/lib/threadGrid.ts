// 2026-10-29. My threads' grid on the phones, as arithmetic: two columns of
// squares, 12 apart, and which cell a finger is over while a tile is dragged.
// Apart from the screen so it can be run in a test.

/** How long a hold lifts a tile, and how far a release may have moved and
 *  still be a release rather than a drag. The handoff's numbers. */
export const HOLD_MS = 320;
export const STILL_PT = 8;

export interface GridMetrics {
  columns: number;
  gap: number;
  /** A tile's side, in points. */
  side: number;
}

export function gridMetrics(width: number, gutter: number): GridMetrics {
  const columns = 2;
  const gap = 12;
  return { columns, gap, side: Math.floor((width - gutter * 2 - gap * (columns - 1)) / columns) };
}

/** The cell under a point measured from the grid's top left, clamped. */
export function cellAt(x: number, y: number, m: GridMetrics, count: number): number {
  const column = Math.min(m.columns - 1, Math.max(0, Math.floor(x / (m.side + m.gap))));
  const row = Math.max(0, Math.floor(y / (m.side + m.gap)));
  return Math.max(0, Math.min(count - 1, row * m.columns + column));
}

/** Where a cell's top left sits, from the grid's. */
export const cellOrigin = (index: number, m: GridMetrics): { x: number; y: number } => ({
  x: (index % m.columns) * (m.side + m.gap),
  y: Math.floor(index / m.columns) * (m.side + m.gap),
});
