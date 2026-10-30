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
const { cellAt, gridMetrics, HOLD_MS, STILL_PT } = await import("../lib/threadGrid");

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
    expect(tile.match(/maxFontSizeMultiplier=\{1\.3\}/g)?.length).toBe(2);
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

  it("draws the glyph again behind it, hardened, at 190%, 12% white, from the seed", () => {
    expect(tile).toMatch(/<Glyph[^>]*hard/);
    expect(tile).toContain("backGlyph(");
    expect(tile).toContain("1.9");
    expect(tile).toContain("0.12");
    expect(glyph).toContain('strokeLinecap={hard ? "square" : "round"}');
    expect(glyph).toContain('strokeLinejoin={hard ? "miter" : "round"}');
    expect(glyph).toContain("strokeWidth={hard ? 3 : 2}");
    expect(glyph).toMatch(/rx=\{hard \? 0 : shape\.rx\}/);
  });
});
