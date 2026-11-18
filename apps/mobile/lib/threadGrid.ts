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

/** The cell under a finger that went down in cell `from`: `x` and `y` are
 *  where it went down in that cell plus how far it has moved since, so
 *  nothing about the grid's place on the screen is needed. */
export function cellUnder(from: number, x: number, y: number, m: GridMetrics, count: number): number {
  const origin = cellOrigin(from, m);
  return cellAt(origin.x + x, origin.y + y, m, count);
}

/** Where a cell's top left sits, from the grid's. */
export const cellOrigin = (index: number, m: GridMetrics): { x: number; y: number } => ({
  x: (index % m.columns) * (m.side + m.gap),
  y: Math.floor(index / m.columns) * (m.side + m.gap),
});

/** 2026-11-17. What a tile of `side` points holds at a text scale: its glyph's
 *  size, and whether the thread's line fits under two lines of name. The name
 *  (title-1, 28 a line) is never what gives way; the line goes whole, then the
 *  glyph shrinks from 54 toward 30. The scale is capped where the tile caps it. */
export function tileFit(side: number, fontScale: number): { glyph: number; meta: boolean } {
  const scale = Math.min(fontScale, 1.3);
  const inner = side - 2 * 14;
  const name = 2 * 28 * scale;
  const glyph = Math.max(30, Math.min(54, Math.round(side * 0.335), Math.floor(inner - name)));
  return { glyph, meta: name + 4 + 16 * scale <= inner - glyph };
}
