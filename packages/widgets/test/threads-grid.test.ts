// 2026-10-29. My threads as a grid: where each tile's back glyph sits, a move
// by one place or a drop, and the words, so the phones and the web agree.

import { describe, expect, it } from "vitest";
import { backGlyph, moveThread, ORDER_COPY, orderThreads, tileLabel } from "../src/threads-grid.js";

describe("the back glyph (AC-6)", () => {
  it("sits up and to the left, turned in quarters, from the seed", () => {
    expect(backGlyph(0)).toEqual({ left: -25, top: -20, turn: 0 });
    // 54 % 55 = 54, (54 >>> 5) % 60 = 1, ((54 >>> 2) % 4) * 90 = 90.
    expect(backGlyph(54)).toEqual({ left: -79, top: -21, turn: 90 });
  });

  it("differs between two tiles", () => {
    const seen = new Set([0x1a2b3c4d, 0x5e6f7081, 0x92a3b4c5, 0xd6e7f809].map((seed) => JSON.stringify(backGlyph(seed))));
    expect(seen.size).toBe(4);
  });

  it("stays in its bounds for any seed", () => {
    for (const seed of [0, 1, 2 ** 31, 2 ** 32 - 1]) {
      const at = backGlyph(seed);
      expect(at.left).toBeLessThanOrEqual(-25);
      expect(at.left).toBeGreaterThanOrEqual(-79);
      expect(at.top).toBeLessThanOrEqual(-20);
      expect(at.top).toBeGreaterThanOrEqual(-79);
      expect([0, 90, 180, 270]).toContain(at.turn);
    }
  });
});

describe("a move", () => {
  const ids = ["a", "b", "c", "d"];
  it("puts the thread at its new place and shifts the others", () => {
    expect(moveThread(ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveThread(ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
  });
  it("clamps to the ends and leaves an unknown id alone", () => {
    expect(moveThread(ids, "b", -3)).toEqual(["b", "a", "c", "d"]);
    expect(moveThread(ids, "b", 99)).toEqual(["a", "c", "d", "b"]);
    expect(moveThread(ids, "z", 0)).toEqual(ids);
  });
});

describe("the order (AC-2, AC-4)", () => {
  const rows = [
    { id: "b", createdAt: "2026-10-02T00:00:00.000Z" },
    { id: "c", createdAt: "2026-10-03T00:00:00.000Z" },
    { id: "a", createdAt: "2026-10-01T00:00:00.000Z" },
    { id: "d", createdAt: "2026-10-03T00:00:00.000Z" },
  ];
  const ids = (list: { id: string }[]) => list.map((row) => row.id);
  it("is newest made first, a tie by id", () => {
    expect(ids(orderThreads(rows, "newest", ["a", "b"]))).toEqual(["d", "c", "b", "a"]);
  });
  it("is the person's own, with what is not in it first and newest first, skipping ids that are gone", () => {
    expect(ids(orderThreads(rows, "mine", ["gone", "a", "b"]))).toEqual(["d", "c", "a", "b"]);
  });
});

describe("the words", () => {
  it("name the tile with its line, its people and nothing else", () => {
    expect(tileLabel({ name: "Lisbon trip", meta: "3 to dos, with Ana and Tom" })).toBe("Lisbon trip, 3 to dos, with Ana and Tom");
    expect(tileLabel({ name: "Dentist", meta: "" })).toBe("Dentist");
  });
  it("say where a moved thread went", () => {
    expect(ORDER_COPY.moved(3, 10)).toBe("Moved to 3 of 10");
    expect(Object.values(ORDER_COPY).filter((v) => typeof v === "string").join(" ")).not.toMatch(/[\u2013\u2014]/);
  });
});
