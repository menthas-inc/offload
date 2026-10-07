import { readFileSync } from "node:fs";
import { join } from "node:path";
// 040 part D on the phones: the map's placement, labels and camera, as pure
// functions the canvas and its buttons draw. AC-26 the marks and labels,
// AC-27 the opening zoom, AC-28 the shared geometry, AC-30 every mark a button
// named by its sentence and kind, in list order.

import { describe, expect, it, vi } from "vitest";
import {
  MAP_ZOOM,
  MAP_LOOK,
  MEMORY_COPY,
  ROW_PITCH,
  mapOpening,
  memoryAt,
  memorySections,
  memoryWorld,
  pillShape,
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

describe("the marks (AC-26, AC-30)", () => {
  const near = { cx: world.width / 2, cy: world.height / 2, z: MAP_ZOOM.sentences };
  const far = { ...near, z: MAP_ZOOM.sentences - 0.01 };
  const all = { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };

  it("are in list order, each named by its sentence and kind", () => {
    const marks = map.mapMarks(ROWS, world, all, far.z, "");
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
    expect(new Set(map.mapMarks(ROWS, world, all, far.z, "").map((m) => m.shape))).toEqual(new Set(["dot"]));
    expect(new Set(map.mapMarks(ROWS, world, all, near.z, "").map((m) => m.shape))).toEqual(new Set(["sentence"]));
  });

  it("sit in the world layer where the shared world puts them, at the settled zoom", () => {
    const at = memoryAt(world, ROWS[1]!);
    const mark = map.mapMarks(ROWS, world, all, 1.5, "").find((m) => m.memory.id === "p1")!;
    expect(mark.x).toBeCloseTo(at.x * 1.5);
    expect(mark.y).toBeCloseTo(at.y * 1.5);
    expect(mark.learned).toBe(false);
    expect(map.mapMarks(ROWS, world, all, 1.5, "").find((m) => m.memory.id === "p2")!.learned).toBe(true);
  });

  it("fades what search does not match to 18%", () => {
    const marks = map.mapMarks(ROWS, world, all, far.z, "meera");
    expect(marks.filter((m) => !m.dim).map((m) => m.memory.id)).toEqual(["p1"]);
    expect(map.DIMMED).toBe(0.18);
  });

  it("says so when nothing matches", () => {
    expect(map.mapNothing(ROWS, "zebra")).toBe(MEMORY_COPY.nothingSays("zebra"));
    expect(map.mapNothing(ROWS, "meera")).toBeNull();
    expect(map.mapNothing(ROWS, "  ")).toBeNull();
  });
});

describe("the world layer: one transform a frame", () => {
  it("lands every world point where the camera says, whatever the settled zoom", () => {
    const c = { cx: 420, cy: 700, z: 1.7 };
    for (const zs of [0.6, 1.7, 2.2]) {
      const t = map.layerTransform(c, zs, SIZE);
      const [wx, wy] = [333, 912];
      const screen = map.screenOf(c, SIZE, wx, wy);
      expect(wx * zs * t.scale + t.translateX).toBeCloseTo(screen.x);
      expect(wy * zs * t.scale + t.translateY).toBeCloseTo(screen.y);
    }
  });

  it("is unscaled once settled, so the type is drawn at its own size, not stretched", () => {
    const c = { cx: 420, cy: 700, z: 1.7 };
    expect(map.layerTransform(c, c.z, SIZE).scale).toBe(1);
    expect(map.layerTransform(c, 0.85, SIZE).scale).toBeCloseTo(2);
  });
});

describe("settling", () => {
  it("snaps the pills' type to the settled zoom, and culls around where it stopped", () => {
    const c = { cx: 420, cy: 700, z: 1.3 };
    const settled = map.settle(c, SIZE);
    expect(settled.zs).toBe(1.3);
    expect(settled.box).toEqual(map.pillBox(1.3));
    expect(settled.box.fontSize).toBe(sentenceSize(1.3));
    expect(settled.near).toBe(true);
    expect(settled.window).toEqual(map.cullWindow(c, SIZE));
    expect(map.settle({ ...c, z: MAP_ZOOM.sentences - 0.01 }, SIZE).near).toBe(false);
  });

  it("knows when the zoom crosses into sentences or back out", () => {
    const s = MAP_ZOOM.sentences;
    expect(map.crossesSentences(s - 0.05, s + 0.05)).toBe(true);
    expect(map.crossesSentences(s + 0.05, s - 0.05)).toBe(true);
    expect(map.crossesSentences(s + 0.05, s + 0.5)).toBe(false);
    expect(map.crossesSentences(s - 0.2, s - 0.05)).toBe(false);
    expect(map.crossesSentences(s - 0.01, s)).toBe(true);
  });
});

describe("the culling window, so marks stream in as the map moves", () => {
  const c = { cx: 500, cy: 800, z: 1 };

  it("is what the screen shows, in world units", () => {
    expect(map.viewport(c, SIZE)).toEqual({ left: 305, right: 695, top: 500, bottom: 1100 });
    expect(map.viewport({ ...c, z: 2 }, SIZE)).toEqual({ left: 402.5, right: 597.5, top: 650, bottom: 950 });
  });

  it("reaches half a screen and the cull margin past it on every side", () => {
    const w = map.cullWindow(c, SIZE);
    expect(w.left).toBeCloseTo(305 - (SIZE.width / 2 + MAP_LOOK.cull.x));
    expect(w.right).toBeCloseTo(695 + (SIZE.width / 2 + MAP_LOOK.cull.x));
    expect(w.top).toBeCloseTo(500 - (SIZE.height / 2 + MAP_LOOK.cull.y));
    expect(w.bottom).toBeCloseTo(1100 + (SIZE.height / 2 + MAP_LOOK.cull.y));
    // Twice as close, half the world each way.
    const near = map.cullWindow({ ...c, z: 2 }, SIZE);
    expect(near.right - near.left).toBeCloseTo((w.right - w.left) / 2);
  });

  it("needs no recompute while the screen stays inside it", () => {
    const w = map.cullWindow(c, SIZE);
    expect(map.needsRecull(w, { ...c, cx: c.cx + 150 }, SIZE)).toBe(false);
    expect(map.needsRecull(w, { ...c, cy: c.cy - 250 }, SIZE)).toBe(false);
    expect(map.needsRecull(w, { ...c, z: 1.4 }, SIZE)).toBe(false);
  });

  it("needs one once the screen moves past it, about half a screen and the margin", () => {
    const w = map.cullWindow(c, SIZE);
    expect(map.needsRecull(w, { ...c, cx: c.cx + SIZE.width / 2 + MAP_LOOK.cull.x + 1 }, SIZE)).toBe(true);
    expect(map.needsRecull(w, { ...c, cy: c.cy - SIZE.height / 2 - MAP_LOOK.cull.y - 1 }, SIZE)).toBe(true);
  });

  it("needs one when zooming out shows world past it", () => {
    const w = map.cullWindow(c, SIZE);
    expect(map.needsRecull(w, { ...c, z: 0.4 }, SIZE)).toBe(true);
  });

  it("mounts only the marks inside it, still in list order", () => {
    const people = world.kinds.find((k) => k.kind === "people")!;
    const close = { cx: people.cx, cy: people.cy, z: MAP_ZOOM.max };
    const window = map.cullWindow(close, SIZE);
    const ids = map.mapMarks(ROWS, world, window, close.z, "").map((m) => m.memory.id);
    expect(ids).toEqual(["p2", "p1"]);
    expect(map.inWindow(window, memoryAt(world, ROWS[3]!))).toBe(false);
  });
});

describe("the kind labels ride the world layer", () => {
  it("sit where mapLabels puts them on screen, through the layer", () => {
    const c = mapOpening(world, SIZE.width, SIZE.height, 10);
    const near = c.z >= MAP_ZOOM.sentences;
    const { onScreen } = map.mapLabels(world, c, SIZE);
    for (const l of onScreen) {
      const k = world.kinds.find((one) => one.kind === l.kind)!;
      const at = map.labelAnchor(k, near);
      const screen = map.screenOf(c, SIZE, at.x, at.y);
      expect(screen.x).toBeCloseTo(l.x);
      expect(screen.y).toBeCloseTo(l.y);
    }
  });
});

describe("a sentence's pill", () => {
  it("takes its type, padding and corner from the zoom, as the web does", () => {
    const fs = sentenceSize(1.2);
    expect(map.pillBox(1.2)).toEqual({
      fontSize: fs,
      padV: fs * 0.45,
      padH: fs * 0.75,
      radius: fs * 1.1,
      spark: Math.round(fs * 0.8),
    });
  });
});

describe("a card, each at its own shape", () => {
  const short = memory({ id: "s", text: "Home is in Toronto." });
  const medium = memory({ id: "m", text: "Meera's birthday is 14 March, and she likes small dinners best." });
  const long = memory({
    id: "l",
    text: "They are allergic to nuts, so anything with almonds, cashews or pistachios is out, including the bakery's granola and most of the cookies at work.",
  });

  it("is one line when short and two when not", () => {
    expect(map.cardOf(short, 1).lines).toBe(1);
    expect(map.cardOf(medium, 1).lines).toBe(2);
    expect(map.cardOf(long, 1).lines).toBeGreaterThanOrEqual(3);
  });

  it("is as wide as its words, from the shared shape and the zoom's type", () => {
    for (const [m, z] of [[short, MAP_ZOOM.sentences], [medium, 1], [long, MAP_ZOOM.max]] as const) {
      const shape = pillShape(m.text, m.origin === "learned");
      const fs = sentenceSize(z);
      const card = map.cardOf(m, z);
      expect(card.lines).toBe(shape.lines);
      expect(card.width).toBeCloseTo(shape.widthEms * fs + 2 * map.CARD_RING);
      expect(card.height).toBeCloseTo(shape.heightEms * fs + 2 * map.CARD_RING);
    }
    expect(map.cardOf(short, 1).width).toBeLessThan(map.cardOf(medium, 1).width);
  });

  it("makes room for the spark when learned", () => {
    const learned = memory({ id: "s2", text: short.text, origin: "learned" });
    expect(map.cardOf(learned, 1).width).toBeGreaterThan(map.cardOf(short, 1).width);
  });

  it("is placed in a box as tall as the card, never a zero-height one, which collapsed the sentence on iOS", () => {
    const source = readFileSync(join(__dirname, "../components/memories/MemoriesMap.tsx"), "utf8");
    const pill = source.slice(source.indexOf("Centred on its point, in a box"), source.indexOf("accessibilityRole=\"button\"", source.indexOf("Centred on its point, in a box")));
    expect(pill).toMatch(/const reach = card\.height \+ 2 \* target\.slop;/);
    expect(pill).toMatch(/width: card\.width/);
    expect(pill).toMatch(/height: reach/);
    expect(pill).not.toContain("height: 0");
    expect(source).toMatch(/numberOfLines=\{card\.lines\}/);
    expect(source).toMatch(/textBreakStrategy="balanced"/);
    expect(source).not.toMatch(/maxWidth/);
  });

  it("never sits a tappable mark in a zero-height box, which iOS delivers no touch to", () => {
    const source = readFileSync(join(__dirname, "../components/memories/MemoriesMap.tsx"), "utf8");
    expect(source).not.toMatch(/height: 0[,\s}]/);
  });
});

describe("a pill's target", () => {
  it("reaches past the card towards 44 by its own height, never past the gap or 44", () => {
    for (const zoom of [MAP_ZOOM.sentences, 0.7, 1, MAP_ZOOM.max]) {
      for (const height of [20, 30, 50]) {
        const { slop } = map.pillTarget(height, zoom);
        expect(slop).toBeGreaterThanOrEqual(0);
        expect(height + 2 * slop).toBeLessThanOrEqual(Math.max(44, height) + 1e-9);
        if (slop > 0) expect(height + 2 * slop).toBeLessThanOrEqual(ROW_PITCH * zoom + 1e-9);
      }
    }
    expect(map.pillTarget(22, MAP_ZOOM.sentences).slop).toBeGreaterThan(0);
    expect(map.pillTarget(50, 1).slop).toBe(0);
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
