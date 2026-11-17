// 2026-10-29. My threads as a grid on the phones: the read carries the order,
// a drop writes it, the cells are two columns of squares (AC-1), a hold lifts
// and a release without moving opens the menu (AC-7), and the back glyph is
// hardened (AC-6). The screens are read from their source, since these tests
// render nothing; the arithmetic is run.

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init: RequestInit }[] = [];
let reply: { status: number; data: unknown } = { status: 200, data: null };
vi.mock("../lib/api", () => ({
  send: (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return Promise.resolve(reply);
  },
}));

const threads = await import("../lib/threads");
const { cellAt, cellUnder, gridMetrics, HOLD_MS, STILL_PT, tileFit } = await import("../lib/threadGrid");

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
const screen = read("../components/screens/MyThreads.tsx");
const tile = read("../components/ThreadTile.tsx");
const glyph = read("../components/Glyph.tsx");

beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, data: null };
});

describe("the read and the write (AC-3)", () => {
  it("hands back the order, newest first when an API from before sends none", async () => {
    reply = { status: 200, data: { groups: [{ key: "now", threads: [] }], invitations: [], loose: null, order: { sort: "mine", ids: ["a"] } } };
    expect((await threads.fetchThreadsAndInvitations())?.order).toEqual({ sort: "mine", ids: ["a"] });
    reply = { status: 200, data: { groups: [], invitations: [], loose: null } };
    expect((await threads.fetchThreadsAndInvitations())?.order).toEqual({ sort: "newest", ids: [] });
  });

  it("writes a drop as the whole list, and the chip as the sort alone", async () => {
    reply = { status: 204, data: null };
    expect(await threads.putThreadOrder("mine", ["b", "a"])).toBe(true);
    expect(await threads.putThreadOrder("newest")).toBe(true);
    expect(calls.map((call) => [call.path, call.init.method, JSON.parse(String(call.init.body))])).toEqual([
      ["/v1/threads/order", "PATCH", { sort: "mine", ids: ["b", "a"] }],
      ["/v1/threads/order", "PATCH", { sort: "newest" }],
    ]);
  });
});

describe("the grid (AC-1)", () => {
  it("is two columns of squares, 12 apart, inside the screen's gutter", () => {
    expect(gridMetrics(402, 20)).toEqual({ columns: 2, gap: 12, side: 175 });
  });

  it("finds the cell under a finger, clamped to the list", () => {
    const m = gridMetrics(402, 20);
    expect(cellAt(0, 0, m, 5)).toBe(0);
    expect(cellAt(m.side + m.gap + 1, 0, m, 5)).toBe(1);
    expect(cellAt(10, m.side + m.gap + 1, m, 5)).toBe(2);
    expect(cellAt(m.side + m.gap + 1, 4 * (m.side + m.gap), m, 5)).toBe(4);
    expect(cellAt(-50, -50, m, 5)).toBe(0);
  });

  it("finds the cell under the finger from the held cell itself, with nothing measured", () => {
    const m = gridMetrics(402, 20);
    // Held in the middle of the first tile, moved one tile right: the second.
    expect(cellUnder(0, m.side / 2 + m.side + m.gap, m.side / 2, m, 6)).toBe(1);
    // Held in the fourth (second row, right), moved up a row and left: the first.
    expect(cellUnder(3, m.side / 2 - m.side - m.gap, m.side / 2 - m.side - m.gap, m, 6)).toBe(0);
    // Not moved: where it is.
    expect(cellUnder(4, 10, 10, m, 6)).toBe(4);
  });

  it("never reads the grid's place on the screen to drag, which arrives a frame late", () => {
    expect(screen).not.toContain("gridAt");
    expect(screen).toMatch(/cellUnder\(/);
  });

  it("lifts after the design's hold, and calls a release under 8pt still", () => {
    expect(HOLD_MS).toBe(320);
    expect(STILL_PT).toBe(8);
  });
});

describe("the screen (AC-1, AC-2, AC-7)", () => {
  it("draws tiles, not rows, and no swipe and no Older threads", () => {
    expect(screen).toContain("<ThreadTile");
    expect(screen).not.toContain("shell/ThreadRow");
    expect(screen).not.toContain("Older threads");
    expect(screen).not.toContain("useRowSwipe");
  });

  it("holds to lift, and a still release opens the menu with Edit, Share and Delete or Leave", () => {
    expect(screen).toMatch(/activateAfterLongPress\(HOLD_MS\)/);
    expect(screen).toContain("STILL_PT");
    expect(screen).toContain('"Edit thread"');
    expect(screen).toContain('"Share"');
    expect(screen).toMatch(/leaves \? "Leave thread" : "Delete thread"/);
    expect(screen).toMatch(/<ConfirmSheet[\s\S]*leaveAsk\([\s\S]*action="Leave"/);
  });

  it("draws a drop at once with Undo, through the shared order", () => {
    expect(screen).toMatch(/perform\(/);
    expect(screen).toContain("putThreadOrder(");
    expect(screen).toContain("ORDER_COPY.did");
    expect(screen).toContain("myThreads(groups ?? [], loose, current)");
  });

  it("lifts without a scale under Reduce Motion, and gives the chip a full target", () => {
    expect(screen).toContain("useReducedMotion()");
    expect(screen).toMatch(/reduced \? 1 : 1\.04/);
    expect(screen).toMatch(/ref=\{chipRef\}[\s\S]{0,200}hitSlop=\{6\}/);
  });

  it("caps the tile's text size, since the square cannot grow", () => {
    // The name, its line and the +N; the initials sit in a fixed 24 circle and do not grow.
    expect(tile.match(/maxFontSizeMultiplier=\{1\.3\}/g)?.length).toBe(3);
    expect(tile).toContain("maxFontSizeMultiplier={1}");
  });

  it("names each tile with its line, and offers a screen reader Move earlier and Move later", () => {
    expect(screen).toContain("accessibilityLabel={tileLabel(thread)}");
    expect(screen).toContain('"Move earlier"');
    expect(screen).toContain('"Move later"');
  });

  it("puts Not in a thread in one row that opens the full list", () => {
    expect(screen).toContain('"/threads/loose"');
    expect(screen).not.toContain("<LooseGroup");
  });
});

describe("the tile (AC-5, AC-6)", () => {
  it("is the thread's ground and wash with white text, and names itself", () => {
    expect(tile).toContain("COLOR.threadGrounds[");
    expect(tile).toContain("COLOR.onBrand");
    expect(tile).toContain("renderWash(");
    expect(tile).toMatch(/corner/);
  });

  // 2026-11-17: the owner could not tell tiles apart. The name leads, large,
  // the glyph is large at the foot, and the back glyph is gone.
  it("leads with the name on two lines, then its line on one, and draws no back glyph", () => {
    expect(tile).not.toContain("backGlyph");
    expect(tile).not.toMatch(/<Glyph[^>]*hard/);
    expect(glyph).not.toContain("hard");
    const name = tile.indexOf("{thread.name}");
    const meta = tile.indexOf("{thread.meta}");
    expect(name).toBeGreaterThan(-1);
    expect(meta).toBeGreaterThan(name);
    expect(tile).toMatch(/numberOfLines=\{2\}[^>]*>\s*\{thread\.name\}/);
    expect(tile).toMatch(/numberOfLines=\{1\}[^>]*>\s*\{thread\.meta\}/);
  });

  it("puts the people and the glyph at the foot, after the text, so neither narrows the name", () => {
    const meta = tile.indexOf("{thread.meta}");
    const faces = tile.indexOf("faces.slice(0, 2)");
    const big = tile.search(/<Glyph name=\{glyph\} size=\{fit\.glyph\}/);
    expect(faces).toBeGreaterThan(meta);
    expect(big).toBeGreaterThan(faces);
  });

  it("keeps the 54 glyph and the line on a 375 or 402 phone at the default text size", () => {
    for (const width of [375, 402]) expect(tileFit(gridMetrics(width, 20).side, 1)).toEqual({ glyph: 54, meta: true });
  });

  it("drops the line whole, never the name, when two lines of name and the line do not fit", () => {
    // 375, larger text: the name's two lines still fit, the line goes.
    expect(tileFit(161, 1.15)).toEqual({ glyph: 54, meta: false });
    // 320 (Display Zoom): a smaller glyph, and no line.
    expect(tileFit(134, 1)).toEqual({ glyph: 45, meta: false });
    // 320 at the largest text: the glyph gives way to the name, down to 30.
    expect(tileFit(134, 1.3)).toEqual({ glyph: 33, meta: false });
    expect(tileFit(100, 1.3).glyph).toBe(30);
    // The text scale is capped where the tile caps it.
    expect(tileFit(161, 2)).toEqual(tileFit(161, 1.3));
  });

  it("draws by the fit, with the name at title-1 and the line at caption", () => {
    expect(tile).toContain("tileFit(side, fontScale)");
    expect(tile).toMatch(/size=\{fit\.glyph\}/);
    expect(tile).toMatch(/fit\.meta && thread\.meta \?/);
    expect(tile).toContain("text-title-1");
    expect(tile).toContain("text-caption");
  });
});
