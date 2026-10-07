import { readFileSync } from "node:fs";
import { join } from "node:path";
// 040 part D on the phones: the map's placement, labels and camera, as pure
// functions the canvas and its buttons draw. AC-26 the marks and labels,
// AC-27 the opening zoom, AC-28 the shared geometry, AC-30 every mark a button
// named by its sentence and kind, in list order.

import { describe, expect, it, vi } from "vitest";
import {
  MAP_ZOOM,
  MEMORY_COPY,
  ROW_PITCH,
  mapOpening,
  memoryAt,
  memorySections,
  memoryWorld,
  sentenceLines,
  sentenceSize,
  type MemoryView,
} from "@offload/widgets";

vi.mock("../lib/api", () => ({ send: () => Promise.resolve({ status: 0, data: null }) }));

const map = await import("../lib/memories-map");

const memory = (over: Partial<MemoryView> & Pick<MemoryView, "id">): MemoryView => ({
  kind: "about",
  text: "They are allergic to nuts.",
  origin: "stated",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
  changed: false,
  source: { type: "none" },
  place: null,
  ...over,
});

const ROWS = [
  memory({ id: "a1", kind: "about", text: "They work at Shopify.", createdAt: "2026-10-02T09:00:00.000Z", place: { dx: 0, dy: 0 } }),
  memory({ id: "p1", kind: "people", text: "Their wife is Meera.", createdAt: "2026-10-01T09:00:00.000Z", place: { dx: -40, dy: -58 } }),
  memory({ id: "p2", kind: "people", text: "Their brother is Arjun.", origin: "learned", createdAt: "2026-10-03T09:00:00.000Z", place: { dx: 30, dy: 58 } }),
  memory({ id: "r1", kind: "rules", text: "They write dates day first.", createdAt: "2026-09-01T09:00:00.000Z", place: { dx: 0, dy: 0 } }),
];
const SIZE = { width: 390, height: 600 };
const world = memoryWorld(ROWS, false);

describe("the shape (AC-26)", () => {
  it("is tall unless the map is more than 1.1 times as wide as it is tall", () => {
    expect(map.mapWide(390, 600)).toBe(false);
    expect(map.mapWide(660, 600)).toBe(false);
    expect(map.mapWide(700, 600)).toBe(true);
  });
});

describe("the marks (AC-26, AC-30)", () => {
  const near = { cx: world.width / 2, cy: world.height / 2, z: MAP_ZOOM.sentences };
  const far = { ...near, z: MAP_ZOOM.sentences - 0.01 };

  it("are in list order, each named by its sentence and kind", () => {
    const marks = map.mapMarks(ROWS, world, far, SIZE, "");
    const order = memorySections(ROWS, "kind").flatMap((s) => s.rows.map((r) => r.id));
    expect(marks.map((m) => m.memory.id)).toEqual(order);
    expect(marks.map((m) => m.label)).toEqual([
      "Their brother is Arjun., People",
      "Their wife is Meera., People",
      "They work at Shopify., About",
      "They write dates day first., Rules",
    ]);
  });

  it("are dots below the sentence zoom and sentences from it", () => {
    expect(new Set(map.mapMarks(ROWS, world, far, SIZE, "").map((m) => m.shape))).toEqual(new Set(["dot"]));
    expect(new Set(map.mapMarks(ROWS, world, near, SIZE, "").map((m) => m.shape))).toEqual(new Set(["sentence"]));
  });

  it("sit where the shared world puts them, through the camera", () => {
    const at = memoryAt(world, ROWS[1]!);
    const mark = map.mapMarks(ROWS, world, near, SIZE, "").find((m) => m.memory.id === "p1")!;
    expect(mark.x).toBeCloseTo((at.x - near.cx) * near.z + SIZE.width / 2);
    expect(mark.y).toBeCloseTo((at.y - near.cy) * near.z + SIZE.height / 2);
    expect(mark.learned).toBe(false);
    expect(map.mapMarks(ROWS, world, near, SIZE, "").find((m) => m.memory.id === "p2")!.learned).toBe(true);
  });

  it("fades what search does not match to 18%", () => {
    const marks = map.mapMarks(ROWS, world, far, SIZE, "meera");
    expect(marks.filter((m) => !m.dim).map((m) => m.memory.id)).toEqual(["p1"]);
    expect(map.DIMMED).toBe(0.18);
  });

  it("says so when nothing matches", () => {
    expect(map.mapNothing(ROWS, "zebra")).toBe(MEMORY_COPY.nothingSays("zebra"));
    expect(map.mapNothing(ROWS, "meera")).toBeNull();
    expect(map.mapNothing(ROWS, "  ")).toBeNull();
  });
});

describe("a sentence's pill", () => {
  it("is sized from the shared type size, as the web sizes it", () => {
    const fs = sentenceSize(1.2);
    expect(map.pillBox(1.2)).toEqual({
      fontSize: fs,
      maxWidth: Math.round(fs * 17),
      padV: fs * 0.45,
      padH: fs * 0.75,
      radius: fs * 1.1,
      spark: Math.round(fs * 0.8),
      lines: sentenceLines(1.2),
      height: Math.ceil(sentenceLines(1.2) * fs * 1.3 + fs * 0.9 + 2),
    });
  });

  it("is placed in a box as tall as the pill can be, never a zero-height one, which collapsed the sentence on iOS", () => {
    for (const z of [MAP_ZOOM.sentences, 0.7, 1, MAP_ZOOM.max]) {
      const box = map.pillBox(z);
      expect(box.height).toBeGreaterThanOrEqual(box.lines * box.fontSize * 1.3 + box.padV * 2);
    }
    const source = readFileSync(join(__dirname, "../components/memories/MemoriesMap.tsx"), "utf8");
    const pill = source.slice(source.indexOf("Centred on its point, in a box"), source.indexOf("accessibilityRole=\"button\"", source.indexOf("Centred on its point, in a box")));
    // The box, or the box and the pill's slop above and below it.
    expect(pill).toMatch(/const reach = box\.height \+ 2 \* target\.slop;/.test(source) ? /height: reach/ : /height: box\.height/);
    expect(pill).not.toContain("height: 0");
  });

  it("never sits a tappable mark in a zero-height box, which iOS delivers no touch to", () => {
    const source = readFileSync(join(__dirname, "../components/memories/MemoriesMap.tsx"), "utf8");
    expect(source).not.toMatch(/height: 0[,\s}]/);
  });

  it("clamps a sentence to the shared line count, so it never reaches the next row", () => {
    expect(map.pillBox(MAP_ZOOM.sentences).lines).toBe(sentenceLines(MAP_ZOOM.sentences));
    expect(map.pillBox(MAP_ZOOM.max).lines).toBe(sentenceLines(MAP_ZOOM.max));
  });
});

describe("a pill's target", () => {
  it("reaches past the pill only as far as the gap between rows allows, and never past 44", () => {
    for (const zoom of [MAP_ZOOM.sentences, 0.7, 1, MAP_ZOOM.max]) {
      const { height, slop } = map.pillTarget(zoom);
      expect(slop).toBeGreaterThanOrEqual(0);
      expect(height + 2 * slop).toBeLessThanOrEqual(Math.max(44, height) + 1e-9);
      if (slop > 0) expect(height + 2 * slop).toBeLessThanOrEqual(ROW_PITCH * zoom + 1e-9);
    }
    // At the threshold rows are about 32 apart: there is room, but not 44.
    const at = map.pillTarget(MAP_ZOOM.sentences);
    expect(at.slop).toBeGreaterThan(0);
    expect(at.height + 2 * at.slop).toBeLessThan(44);
  });
});

describe("the kind labels (AC-26)", () => {
  it("sit over each cloud on screen, named Go to and the count", () => {
    const whole = mapOpening(world, SIZE.width, SIZE.height, 10);
    const { onScreen, dock } = map.mapLabels(world, whole, SIZE);
    expect(onScreen.map((l) => [l.kind, l.label])).toEqual([
      ["people", "Go to People, 2"],
      ["about", "Go to About, 1"],
      ["rules", "Go to Rules, 1"],
    ]);
    expect(dock).toEqual([]);
  });

  it("dock along the top, turned towards their cloud, only once zoomed into sentences", () => {
    const people = world.kinds.find((k) => k.kind === "people")!;
    const close = { cx: people.cx, cy: people.cy, z: MAP_ZOOM.max };
    const { dock } = map.mapLabels(world, close, SIZE);
    // People's own label is above the screen this close, so it docks too.
    expect(dock.map((l) => l.kind)).toEqual(["people", "about", "rules"]);
    // The others are below People in a tall world: their arrows turn down.
    for (const l of dock.slice(1)) expect(Math.abs(l.turn - 180)).toBeLessThan(90);

    const far = { ...close, z: MAP_ZOOM.sentences - 0.01 };
    const away = { cx: people.cx, cy: people.cy - 4000, z: far.z };
    expect(map.mapLabels(world, away, SIZE).dock).toEqual([]);
  });
});

describe("the camera", () => {
  const min = mapOpening(world, SIZE.width, SIZE.height, ROWS.length).min;

  it("opens where the shared opening says", () => {
    expect(map.openCamera(world, SIZE, ROWS.length)).toEqual(mapOpening(world, SIZE.width, SIZE.height, ROWS.length));
  });

  it("zooms about the point under the fingers", () => {
    const c = { cx: 300, cy: 400, z: 0.6 };
    const next = map.zoomAbout(c, 100, 200, 1.2, SIZE, world, min);
    const before = { x: c.cx + (100 - SIZE.width / 2) / c.z, y: c.cy + (200 - SIZE.height / 2) / c.z };
    const after = { x: next.cx + (100 - SIZE.width / 2) / next.z, y: next.cy + (200 - SIZE.height / 2) / next.z };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.z).toBe(1.2);
  });

  it("keeps inside the world and the zoom range", () => {
    expect(map.clampCamera({ cx: -50, cy: world.height + 50, z: 99 }, world, min)).toEqual({ cx: 0, cy: world.height, z: MAP_ZOOM.max });
    expect(map.clampCamera({ cx: 10, cy: 10, z: 0 }, world, min).z).toBe(min);
  });

  it("flies on an ease-out, the zoom geometric", () => {
    const from = { cx: 0, cy: 0, z: 0.4 };
    const to = { cx: 100, cy: 200, z: 1.6 };
    expect(map.flightAt(from, to, 0)).toEqual(from);
    expect(map.flightAt(from, to, 1)).toEqual(to);
    const half = map.flightAt(from, to, 0.5);
    const e = 1 - 0.5 ** 3;
    expect(half.cx).toBeCloseTo(100 * e);
    expect(half.z).toBeCloseTo(0.4 * 4 ** e);
  });

  it("flies to a dot at the fly-to zoom, or nearer if already nearer", () => {
    expect(map.dotFlight({ x: 10, y: 20 }, { cx: 0, cy: 0, z: 0.3 }, world, min)).toEqual({ cx: 10, cy: 20, z: MAP_ZOOM.flyTo });
    expect(map.dotFlight({ x: 10, y: 20 }, { cx: 0, cy: 0, z: 1.5 }, world, min).z).toBe(1.5);
  });

  it("flies into a kind at a zoom that fits its cloud", () => {
    const people = world.kinds.find((k) => k.kind === "people")!;
    const to = map.kindFlight(people, SIZE, world, min);
    expect([to.cx, to.cy]).toEqual([people.cx, people.cy]);
    expect(to.z).toBeGreaterThanOrEqual(0.8);
    expect(to.z).toBeLessThanOrEqual(1.05);
  });

  it("offers Everything once past 1.4 times the fit, and goes back to the fit", () => {
    const fit = map.fitZoom(world, SIZE);
    expect(map.showsEverything(fit * 1.39, fit)).toBe(false);
    expect(map.showsEverything(fit * 1.41, fit)).toBe(true);
    expect(map.everything(world, SIZE, min)).toEqual({ cx: world.width / 2, cy: world.height / 2, z: Math.max(min, fit) });
  });

  it("steps the zoom by half again, and draws the level bar from the range", () => {
    expect(map.zoomStep({ cx: 0, cy: 0, z: 1 }, 1, world, min).z).toBe(1.5);
    expect(map.zoomStep({ cx: 0, cy: 0, z: 1.5 }, -1, world, min).z).toBe(1);
    expect(map.zoomLevel(min, min)).toBe(0);
    expect(map.zoomLevel(MAP_ZOOM.max, min)).toBe(1);
  });
});

describe("the plus on the map", () => {
  it("picks the kind the camera is zoomed into", () => {
    const rules = world.kinds.find((k) => k.kind === "rules")!;
    expect(map.focusKind(world, { cx: rules.cx, cy: rules.cy, z: MAP_ZOOM.sentences })).toBe("rules");
    expect(map.focusKind(world, { cx: rules.cx, cy: rules.cy, z: MAP_ZOOM.sentences - 0.01 })).toBeNull();
  });

  it("preselects it only while the map shows", () => {
    expect(map.plusKind("map", "rules")).toBe("rules");
    expect(map.plusKind("list", "rules")).toBeNull();
    expect(map.plusKind("map", null)).toBeNull();
  });
});
