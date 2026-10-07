// 040 part D. The Memories map on the phones: where every mark, label and
// camera goes, as pure functions the canvas and its buttons draw.
//
// The geometry is `@offload/widgets`'s, shared with the web: `memoryWorld`
// places the kinds, `memoryAt` a memory, `mapOpening` the first camera,
// `sentenceSize` a pill's type, `MAP_ZOOM` the range. What is left here is the
// camera's arithmetic, the web's `MemoriesMap.tsx` and the kit's `mapH()`,
// `fly()` and `zoomAt()` rewritten for a platform with no DOM.

import {
  MAP_ZOOM,
  MAP_LOOK,
  MEMORY_COPY,
  ROW_PITCH,
  mapOpening,
  matchesMemory,
  memoryAt,
  memoryKind,
  memorySections,
  sentenceLines,
  sentenceSize,
  type MemoryKindId,
  type MemoryView,
  type MemoryWorld,
  type MemoryWorldKind,
} from "@offload/widgets";

export interface Camera {
  cx: number;
  cy: number;
  z: number;
}

export interface Size {
  width: number;
  height: number;
}

// How the map is drawn and moved: one copy with the web, in @offload/widgets.
const WIDE_PAST = MAP_LOOK.widePast;
export const DIMMED = MAP_LOOK.dimmed;
export const CLOUD_REACH = MAP_LOOK.cloudReach;
const LABEL_UP = MAP_LOOK.labelUp;
const KIND_FLIGHT = MAP_LOOK.kindFlight;
const ZOOM_STEP = MAP_LOOK.zoomStep;
const EVERYTHING_PAST = MAP_LOOK.everythingPast;
/** A mark this far off the screen is not drawn, as the kit culls it. */
const CULL = MAP_LOOK.cull;

/** Tall unless the map is clearly wide. Picked once, from the first size. */
export function mapWide(width: number, height: number): boolean {
  return width > height * WIDE_PAST;
}

export function openCamera(world: MemoryWorld, size: Size, count: number): ReturnType<typeof mapOpening> {
  return mapOpening(world, size.width, size.height, count);
}

/** The whole world's zoom: the shared opening's, for a count past its sentence rule. */
export function fitZoom(world: MemoryWorld, size: Size): number {
  return mapOpening(world, size.width, size.height, Number.POSITIVE_INFINITY).z;
}

export function clampCamera(c: Camera, world: MemoryWorld, min: number): Camera {
  return {
    cx: Math.min(world.width, Math.max(0, c.cx)),
    cy: Math.min(world.height, Math.max(0, c.cy)),
    z: Math.min(MAP_ZOOM.max, Math.max(min, c.z)),
  };
}

/** A zoom that keeps the world point under (px, py) where it is. */
export function zoomAbout(c: Camera, px: number, py: number, z: number, size: Size, world: MemoryWorld, min: number): Camera {
  const wx = c.cx + (px - size.width / 2) / c.z;
  const wy = c.cy + (py - size.height / 2) / c.z;
  const nz = Math.min(MAP_ZOOM.max, Math.max(min, z));
  return clampCamera({ z: nz, cx: wx - (px - size.width / 2) / nz, cy: wy - (py - size.height / 2) / nz }, world, min);
}

/** A point on the screen from a point in the world. */
export function screenOf(c: Camera, size: Size, x: number, y: number): { x: number; y: number } {
  return { x: (x - c.cx) * c.z + size.width / 2, y: (y - c.cy) * c.z + size.height / 2 };
}

/** A flight `p` of the way along: an ease-out cubic, the zoom geometric. */
export function flightAt(from: Camera, to: Camera, p: number): Camera {
  if (p <= 0) return from;
  if (p >= 1) return to;
  const e = 1 - (1 - p) ** 3;
  return { cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e, z: from.z * (to.z / from.z) ** e };
}

export function dotFlight(at: { x: number; y: number }, c: Camera, world: MemoryWorld, min: number): Camera {
  return clampCamera({ cx: at.x, cy: at.y, z: Math.max(MAP_ZOOM.flyTo, c.z) }, world, min);
}

export function kindFlight(k: MemoryWorldKind, size: Size, world: MemoryWorld, min: number): Camera {
  const z = Math.min(KIND_FLIGHT.most, Math.max(KIND_FLIGHT.least, size.width / (k.radius * KIND_FLIGHT.across)));
  return clampCamera({ cx: k.cx, cy: k.cy, z }, world, min);
}

export function zoomStep(c: Camera, direction: 1 | -1, world: MemoryWorld, min: number): Camera {
  return clampCamera({ ...c, z: direction > 0 ? c.z * ZOOM_STEP : c.z / ZOOM_STEP }, world, min);
}

/** The level bar's fill, 0 at the least zoom and 1 at the most. */
export function zoomLevel(z: number, min: number): number {
  return Math.max(0, Math.min(1, Math.log(z / min) / Math.log(MAP_ZOOM.max / min)));
}

export function showsEverything(z: number, fit: number): boolean {
  return z > fit * EVERYTHING_PAST;
}

export function everything(world: MemoryWorld, size: Size, min: number): Camera {
  return { cx: world.width / 2, cy: world.height / 2, z: Math.max(min, fitZoom(world, size)) };
}

export interface Mark {
  memory: MemoryView;
  /** The button's name: the sentence and its kind. */
  label: string;
  x: number;
  y: number;
  shape: "dot" | "sentence";
  learned: boolean;
  /** Search does not match it. */
  dim: boolean;
}

/** Every memory in list order, placed through the camera: dots far out,
 *  sentences from the sentence zoom. Far off the screen is not drawn. */
export function mapMarks(memories: MemoryView[], world: MemoryWorld, c: Camera, size: Size, query: string): Mark[] {
  const shape = c.z >= MAP_ZOOM.sentences ? "sentence" : "dot";
  return memorySections(memories, "kind")
    .flatMap((section) => section.rows)
    .flatMap((memory) => {
      const at = memoryAt(world, memory);
      const { x, y } = screenOf(c, size, at.x, at.y);
      if (x < -CULL.x || x > size.width + CULL.x || y < -CULL.y || y > size.height + CULL.y) return [];
      return [
        {
          memory,
          label: `${memory.text}, ${memoryKind(memory.kind)?.name ?? memory.kind}`,
          x,
          y,
          shape,
          learned: memory.origin === "learned",
          dim: !matchesMemory(memory, query),
        } satisfies Mark,
      ];
    });
}

/** The line when a search matches nothing on the map. */
export function mapNothing(memories: MemoryView[], query: string): string | null {
  const q = query.trim();
  return q && !memories.some((m) => matchesMemory(m, q)) ? MEMORY_COPY.nothingSays(q) : null;
}

/** A sentence's pill, sized from the shared type size as the web sizes it,
 *  and clamped to the shared line count so it never reaches the next row. */
export function pillBox(zoom: number): {
  fontSize: number;
  maxWidth: number;
  padV: number;
  padH: number;
  radius: number;
  spark: number;
  lines: number;
  /** The most a pill can take up and down: its lines, its padding and its ring. */
  height: number;
} {
  const fs = sentenceSize(zoom);
  return {
    height: Math.ceil(sentenceLines(zoom) * fs * 1.3 + fs * 0.9 + 2),
    fontSize: fs,
    maxWidth: Math.round(fs * 17),
    padV: fs * 0.45,
    padH: fs * 0.75,
    radius: fs * 1.1,
    spark: Math.round(fs * 0.8),
    lines: sentenceLines(zoom),
  };
}

/** A pill's drawn height, and the slop that takes its target towards 44
 *  without reaching into the next row: rows are `ROW_PITCH * zoom` apart, so
 *  at the sentence threshold, about 32, there is room for some and not all. */
export function pillTarget(zoom: number): { height: number; slop: number } {
  const box = pillBox(zoom);
  // As tall as it can wrap to, so a wrapped pill's target never reaches the
  // next row either.
  const height = box.height;
  const room = Math.min(44, ROW_PITCH * zoom);
  return { height, slop: Math.max(0, (room - height) / 2) };
}

export interface KindLabel {
  kind: MemoryKindId;
  name: string;
  glyph: string;
  count: number;
  /** "Go to People, 12". */
  label: string;
  x: number;
  y: number;
  /** Docked: the arrow's turn towards the cloud, in degrees. */
  turn: number;
}

/** Each kind's label over its cloud while on screen; once zoomed into
 *  sentences, the kinds off screen dock in one row along the top. */
export function mapLabels(world: MemoryWorld, c: Camera, size: Size): { onScreen: KindLabel[]; dock: KindLabel[] } {
  const near = c.z >= MAP_ZOOM.sentences;
  const onScreen: KindLabel[] = [];
  const dock: KindLabel[] = [];
  for (const k of world.kinds) {
    const info = memoryKind(k.kind);
    if (!info) continue;
    const at = screenOf(c, size, k.cx, k.cy - k.radius * (near ? LABEL_UP.near : LABEL_UP.far));
    const centre = screenOf(c, size, k.cx, k.cy);
    const turn = (Math.atan2(centre.y - size.height / 2, centre.x - size.width / 2) * 180) / Math.PI + 90;
    const label: KindLabel = { kind: k.kind, name: info.name, glyph: info.glyph, count: k.count, label: `Go to ${info.name}, ${k.count}`, x: at.x, y: at.y, turn };
    if (at.x > -10 && at.x < size.width + 10 && at.y > -10 && at.y < size.height + 10) onScreen.push(label);
    else if (near) dock.push(label);
  }
  return { onScreen, dock };
}

/** The kind nearest the camera once zoomed into sentences, or null. */
export function focusKind(world: MemoryWorld, c: Camera): MemoryKindId | null {
  if (c.z < MAP_ZOOM.sentences) return null;
  let best: MemoryKindId | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const k of world.kinds) {
    const d = Math.hypot(k.cx - c.cx, k.cy - c.cy);
    if (d < distance) [best, distance] = [k.kind, d];
  }
  return best;
}

/** What the plus preselects: the map's kind, only while the map shows. */
export function plusKind(view: "list" | "map", focused: MemoryKindId | null): MemoryKindId | null {
  return view === "map" ? focused : null;
}
