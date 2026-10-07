// 040. The memory kinds, caps and map geometry live in one module every client
// and the Core API imports, so three surfaces never type them three times.

import { describe, expect, it } from "vitest";
import { MEMORY_KINDS, MEMORY_CAP, RULES_CAP, LEARNED_CAP, ROW_PITCH, COLUMN_PITCH, memoryKind } from "@offload/widgets";

describe("the memory kinds", () => {
  it("are five, in the order the tab draws them, each with its hue and glyph", () => {
    expect(MEMORY_KINDS.map((k) => [k.kind, k.name, k.hue, k.glyph])).toEqual([
      ["people", "People", "label-2", "users"],
      ["things", "Things", "label-1", "tag"],
      ["about", "About", "label-6", "heart"],
      ["rules", "Rules", null, "compass"],
      ["patterns", "Patterns", "label-5", "spline"],
    ]);
    expect(memoryKind("words")).toBeUndefined();
    expect(memoryKind("rules")?.name).toBe("Rules");
  });

  it("carry the caps and the pitches", () => {
    expect([MEMORY_CAP, RULES_CAP, LEARNED_CAP, ROW_PITCH]).toEqual([300, 20, 25, 58]);
    expect(COLUMN_PITCH).toBeGreaterThan(ROW_PITCH);
  });
});

import { matchesMemory, memoryDay, memoryMeta, memoryOrigin, memoryRefusal, memorySections, type MemoryView } from "@offload/widgets";

const NOW = new Date(2026, 9, 6, 15, 0);
const at = (daysAgo: number) => new Date(2026, 9, 6 - daysAgo, 10, 0).toISOString();
const memory = (over: Partial<MemoryView>): MemoryView => ({
  id: "m",
  kind: "about",
  text: "They work at Shopify.",
  origin: "stated",
  createdAt: at(3),
  updatedAt: at(3),
  changed: false,
  source: { type: "none" },
  place: null,
  ...over,
});

describe("a memory's day and meta", () => {
  it("says Today, Yesterday, then the day and month", () => {
    expect([memoryDay(at(0), NOW), memoryDay(at(1), NOW), memoryDay(at(3), NOW)]).toEqual(["Today", "Yesterday", "3 Oct"]);
  });

  it("names how it was come by, plainly, the spark only when learned", () => {
    const thread = { id: "t", name: "Lisbon trip", notInAThread: false };
    expect(memoryMeta(memory({ source: { type: "message", thread } }), NOW)).toEqual({ learned: false, label: "You said", day: "3 Oct" });
    expect(memoryMeta(memory({ origin: "answered", source: { type: "answer", question: null } }), NOW).label).toBe("Your answer");
    expect(memoryMeta(memory({ origin: "learned", createdAt: at(1) }), NOW)).toEqual({ learned: true, label: "Learned", day: "Yesterday" });
    expect(memoryMeta(memory({}), NOW).label).toBe("You added");
    expect(memoryMeta(memory({ changed: true, updatedAt: at(0) }), NOW)).toEqual({ learned: false, label: "You changed", day: "Today" });
  });
});

describe("where a memory came from, in the editor", () => {
  it("names the thread only when there is one to name", () => {
    const named = { type: "message" as const, thread: { id: "t", name: "Lisbon trip", notInAThread: false } };
    expect(memoryOrigin(memory({ source: named }), NOW)).toEqual({ glyph: "text-quote", lead: "You asked offload to remember this", rest: " on 3 Oct. Said in Lisbon trip." });
    expect(memoryOrigin(memory({ source: { type: "message", thread: { id: "t", name: null, notInAThread: true } } }), NOW).rest).toBe(" on 3 Oct. Not in a thread.");
    expect(memoryOrigin(memory({ source: { type: "message", thread: null } }), NOW).rest).toBe(" on 3 Oct.");
    expect(memoryOrigin(memory({ origin: "learned", createdAt: at(1), source: { type: "note", thread: { id: "t", name: "Groceries", notInAThread: false } } }), NOW)).toEqual({
      glyph: "sparkles",
      lead: "offload learned this",
      rest: " yesterday. From a note in Groceries.",
    });
    expect(memoryOrigin(memory({ origin: "learned", source: { type: "message", thread: null } }), NOW).rest).toBe(" on 3 Oct. From what you said.");
    expect(memoryOrigin(memory({}), NOW)).toEqual({ glyph: "text-quote", lead: "You added this", rest: " on 3 Oct." });
    expect(memoryOrigin(memory({ changed: true, updatedAt: at(0) }), NOW).lead).toBe("You changed this");
  });

  it("quotes the question an answer answered, and never a calendar's name", () => {
    const answered = memory({ origin: "answered", source: { type: "answer", question: "Which calendar is shared with Meera?" } });
    expect(memoryOrigin(answered, NOW)).toEqual({
      glyph: "message-circle-more",
      lead: "Your answer to “Which calendar is shared with Meera?”",
      rest: " on 3 Oct. It picks that calendar the next time you say “with Meera”.",
    });
  });
});

describe("the list", () => {
  it("by kind: the kind order, newest first in each, none drawn when empty", () => {
    const list = [memory({ id: "a", kind: "about", createdAt: at(5) }), memory({ id: "b", kind: "people" }), memory({ id: "c", kind: "about", createdAt: at(1) })];
    expect(memorySections(list, "kind", NOW).map((s) => [s.key, s.title, s.rows.map((r) => r.id)])).toEqual([
      ["people", "People", ["b"]],
      ["about", "About", ["c", "a"]],
    ]);
  });

  it("newest: This week and Earlier", () => {
    const list = [memory({ id: "old", createdAt: at(20) }), memory({ id: "new", createdAt: at(2) })];
    expect(memorySections(list, "new", NOW).map((s) => [s.title, s.rows.map((r) => r.id)])).toEqual([
      ["This week", ["new"]],
      ["Earlier", ["old"]],
    ]);
  });

  it("search matches the words, any case", () => {
    expect(matchesMemory(memory({}), "shopify")).toBe(true);
    expect(matchesMemory(memory({}), "")).toBe(true);
    expect(matchesMemory(memory({}), "toronto")).toBe(false);
  });

  it("says each refusal in the spec's words", () => {
    expect(memoryRefusal("never_list")).toBe("Not keeping that one.");
    expect(memoryRefusal("too_long")).toBe("That's over 200 characters.");
    expect(memoryRefusal("duplicate")).toBe("That's already a memory.");
    expect(memoryRefusal("rules_full")).toBe("That's twenty rules. Forget one to add this.");
    expect(memoryRefusal("memories_full")).toBe("That's 300. Forget one to keep this.");
  });
});

import { memoryWorld, memoryAt, mapOpening, MAP_ZOOM, ROW_PITCH as PITCH, COLUMN_PITCH as COLUMN } from "@offload/widgets";

describe("the map's world", () => {
  const grid = (kind: string, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const columns = Math.max(1, Math.round(Math.sqrt((n * PITCH) / COLUMN)));
      const rows = Math.ceil(n / columns);
      const c = Math.floor(i / rows);
      const r = i % rows;
      return { kind, place: { dx: (c - (columns - 1) / 2) * COLUMN, dy: (r - (rows - 1) / 2) * PITCH } };
    });
  const set = [...grid("people", 12), ...grid("about", 200), ...grid("rules", 3), ...grid("patterns", 40)];

  for (const wide of [false, true]) {
    it(`${wide ? "wide" : "tall"}: draws only kinds that have memories, never one cloud on another, every memory inside its own`, () => {
      const world = memoryWorld(set, wide);
      expect(world.kinds.map((k) => [k.kind, k.count])).toEqual([
        ["people", 12],
        ["about", 200],
        ["rules", 3],
        ["patterns", 40],
      ]);
      for (const a of world.kinds)
        for (const b of world.kinds) {
          if (a === b) continue;
          expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(a.radius + b.radius);
        }
      for (const m of set) {
        const k = world.kinds.find((x) => x.kind === m.kind)!;
        const at = memoryAt(world, m);
        expect(Math.hypot(at.x - k.cx, at.y - k.cy)).toBeLessThanOrEqual(k.radius);
        expect(at.x).toBeGreaterThanOrEqual(0);
        expect(at.y).toBeGreaterThanOrEqual(0);
        expect(at.x).toBeLessThanOrEqual(world.width);
        expect(at.y).toBeLessThanOrEqual(world.height);
      }
      expect(memoryWorld(set, wide)).toEqual(world);
    });
  }

  it("is taller than wide on a phone and wider than tall on the web", () => {
    const tall = memoryWorld(set, false);
    const wide = memoryWorld(set, true);
    expect(tall.height).toBeGreaterThan(tall.width);
    expect(wide.width).toBeGreaterThan(wide.height);
  });

  it("opens on the whole world, and at a sentence zoom under ten memories", () => {
    const big = memoryWorld(set, true);
    const open = mapOpening(big, 1000, 700, set.length);
    expect(open.z).toBeLessThan(MAP_ZOOM.sentences);
    expect(open.min).toBeLessThanOrEqual(open.z);
    const few = memoryWorld(grid("people", 4), true);
    expect(mapOpening(few, 1000, 700, 4).z).toBeGreaterThanOrEqual(MAP_ZOOM.sentences);
  });
});

import { sentenceLines, sentenceSize as size } from "@offload/widgets";

describe("a sentence on the map", () => {
  it("never overlaps the next row or the next column, at any zoom from the threshold", () => {
    for (let z = MAP_ZOOM.sentences; z <= MAP_ZOOM.max; z += 0.01) {
      const fs = size(z);
      const height = sentenceLines(z) * 1.3 * fs + 0.9 * fs;
      expect(height, `zoom ${z.toFixed(2)}`).toBeLessThanOrEqual(PITCH * z);
      expect(17 * fs, `zoom ${z.toFixed(2)}`).toBeLessThanOrEqual(COLUMN * z);
    }
  });
});
