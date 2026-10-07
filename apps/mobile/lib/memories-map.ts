// 040 part D. The Memories map on the phones: where every mark, label and
// camera goes, as pure functions the canvas and its buttons draw.
//
// The geometry is `@offload/widgets`'s, shared with the web: `memoryWorld`
// places the kinds, `memoryAt` a memory, `mapOpening` the first camera,
// `sentenceSize` a pill's type, `MAP_ZOOM` the range. What is left here is the
// camera's arithmetic, the web's `MemoriesMap.tsx` and the kit's `mapH()`,
// `fly()` and `zoomAt()` rewritten for a platform with no DOM.
//
// **The camera runs on the UI thread.** The functions a gesture or a flight
// calls every frame are worklets: `clampCamera`, `zoomAbout`, `flightAt`,
// `layerTransform`, `needsRecull` and `crossesSentences`. React hears only of
// discrete changes: the threshold crossed, the camera settled, or the screen
// leaving the window of marks last mounted.

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
  pillShape,
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

/** A world's extent: all a camera needs to be kept inside it. */
export interface Bounds {
  width: number;
  height: number;
}

/** A rectangle in world units. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// How the map is drawn and moved: one copy with the web, in @offload/widgets.
export const DIMMED = MAP_LOOK.dimmed;
export const CLOUD_REACH = MAP_LOOK.cloudReach;
const LABEL_UP = MAP_LOOK.labelUp;
const KIND_FLIGHT = MAP_LOOK.kindFlight;
const ZOOM_STEP = MAP_LOOK.zoomStep;
const EVERYTHING_PAST = MAP_LOOK.everythingPast;
/** A mark this far off the screen is not drawn, as the kit culls it. */
const CULL = MAP_LOOK.cull;

export function openCamera(world: MemoryWorld, size: Size, count: number): ReturnType<typeof mapOpening> {
  return mapOpening(world, size.width, size.height, count);
}

/** The whole world's zoom: the shared opening's, for a count past its sentence rule. */
export function fitZoom(world: MemoryWorld, size: Size): number {
  return mapOpening(world, size.width, size.height, Number.POSITIVE_INFINITY).z;
}

export function clampCamera(c: Camera, world: Bounds, min: number): Camera {
  "worklet";
  return {
    cx: Math.min(world.width, Math.max(0, c.cx)),
    cy: Math.min(world.height, Math.max(0, c.cy)),
    z: Math.min(MAP_ZOOM.max, Math.max(min, c.z)),
  };
}

/** A zoom that keeps the world point under (px, py) where it is. */
export function zoomAbout(c: Camera, px: number, py: number, z: number, size: Size, world: Bounds, min: number): Camera {
  "worklet";
  const wx = c.cx + (px - size.width / 2) / c.z;
  const wy = c.cy + (py - size.height / 2) / c.z;
  const nz = Math.min(MAP_ZOOM.max, Math.max(min, z));
  return clampCamera({ z: nz, cx: wx - (px - size.width / 2) / nz, cy: wy - (py - size.height / 2) / nz }, world, min);
}

/** A point on the screen from a point in the world. */
export function screenOf(c: Camera, size: Size, x: number, y: number): { x: number; y: number } {
  "worklet";
  return { x: (x - c.cx) * c.z + size.width / 2, y: (y - c.cy) * c.z + size.height / 2 };
}

/** A flight `p` of the way along: an ease-out cubic, the zoom geometric. */
export function flightAt(from: Camera, to: Camera, p: number): Camera {
  "worklet";
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
  "worklet";
  return Math.max(0, Math.min(1, Math.log(z / min) / Math.log(MAP_ZOOM.max / min)));
}

export function showsEverything(z: number, fit: number): boolean {
  return z > fit * EVERYTHING_PAST;
}

export function everything(world: MemoryWorld, size: Size, min: number): Camera {
  return { cx: world.width / 2, cy: world.height / 2, z: Math.max(min, fitZoom(world, size)) };
}

/** The world layer's transform: marks are laid out at the settled zoom `zs`
 *  (a world point at `x * zs`), and the layer scales by `z / zs` while the
 *  camera moves, so a frame moves one view. Once settled the scale is 1 and
 *  the type is drawn at its own size rather than stretched. */
export function layerTransform(c: Camera, zs: number, size: Size): { translateX: number; translateY: number; scale: number } {
  "worklet";
  return { translateX: size.width / 2 - c.cx * c.z, translateY: size.height / 2 - c.cy * c.z, scale: c.z / zs };
}

/** Whether a zoom change crosses into sentences or back out to dots. */
export function crossesSentences(from: number, to: number): boolean {
  "worklet";
  return from >= MAP_ZOOM.sentences !== to >= MAP_ZOOM.sentences;
}

/** What the screen shows, in world units. */
export function viewport(c: Camera, size: Size): Rect {
  "worklet";
  const hw = size.width / 2 / c.z;
  const hh = size.height / 2 / c.z;
  return { left: c.cx - hw, right: c.cx + hw, top: c.cy - hh, bottom: c.cy + hh };
}

/** The marks mounted: the screen, and half a screen and the cull margin past
 *  it on every side, so a pan streams them in before they show. */
export function cullWindow(c: Camera, size: Size): Rect {
  "worklet";
  const v = viewport(c, size);
  const mx = (size.width / 2 + CULL.x) / c.z;
  const my = (size.height / 2 + CULL.y) / c.z;
  return { left: v.left - mx, right: v.right + mx, top: v.top - my, bottom: v.bottom + my };
}

/** The screen has left the window last mounted: mount again around it. */
export function needsRecull(window: Rect, c: Camera, size: Size): boolean {
  "worklet";
  const v = viewport(c, size);
  return v.left < window.left || v.right > window.right || v.top < window.top || v.bottom > window.bottom;
}

export function inWindow(window: Rect, at: { x: number; y: number }): boolean {
  return at.x >= window.left && at.x <= window.right && at.y >= window.top && at.y <= window.bottom;
}

/** What a settled camera decides: the zoom the layer is laid out at, dots or
 *  sentences, the pills' type snapped to that zoom, and the window to mount. */
export function settle(c: Camera, size: Size): { zs: number; near: boolean; box: ReturnType<typeof pillBox>; window: Rect } {
  return { zs: c.z, near: c.z >= MAP_ZOOM.sentences, box: pillBox(c.z), window: cullWindow(c, size) };
}

/** Where a kind's label sits in the world. */
export function labelAnchor(k: MemoryWorldKind, near: boolean): { x: number; y: number } {
  return { x: k.cx, y: k.cy - k.radius * (near ? LABEL_UP.near : LABEL_UP.far) };
}

export interface Mark {
  memory: MemoryView;
  /** The button's name: the sentence and its kind. */
  label: string;
  /** In the world layer, at the settled zoom. */
  x: number;
  y: number;
  shape: "dot" | "sentence";
  learned: boolean;
  /** Search does not match it. */
  dim: boolean;
}

/** The memories inside the window, in list order, placed in the world
 *  layer at the settled zoom `zs`: dots far out, sentences from the sentence
 *  zoom. The rest are not mounted. */
export function mapMarks(memories: MemoryView[], world: MemoryWorld, window: Rect, zs: number, query: string): Mark[] {
  const shape = zs >= MAP_ZOOM.sentences ? "sentence" : "dot";
  return memorySections(memories, "kind")
    .flatMap((section) => section.rows)
    .flatMap((memory) => {
      const at = memoryAt(world, memory);
      if (!inWindow(window, at)) return [];
      return [
        {
          memory,
          label: `${memory.text}, ${memoryKind(memory.kind)?.name ?? memory.kind}`,
          x: at.x * zs,
          y: at.y * zs,
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

/** What every pill at a zoom shares, from the shared type size as the web
 *  sizes it: the type, the padding, the corner and the spark. Its width,
 *  height and lines are its own (`cardOf`). */
export function pillBox(zoom: number): { fontSize: number; padV: number; padH: number; radius: number; spark: number } {
  const fs = sentenceSize(zoom);
  return { fontSize: fs, padV: fs * 0.45, padH: fs * 0.75, radius: fs * 1.1, spark: Math.round(fs * 0.8) };
}

/** Room around a card for its ring: 1pt drawn, 2pt when open. The shared
 *  shape is the web's, whose ring is an inset shadow and takes no room. */
export const CARD_RING = 2;

/** One memory's card at a zoom: the shared shape (one line when short, two
 *  when not, as wide as its words need) at the zoom's type. */
export function cardOf(memory: MemoryView, zoom: number): { width: number; height: number; lines: number } {
  const shape = pillShape(memory.text, memory.origin === "learned");
  const fs = sentenceSize(zoom);
  return { width: shape.widthEms * fs + 2 * CARD_RING, height: shape.heightEms * fs + 2 * CARD_RING, lines: shape.lines };
}

/** The slop that takes a card's target towards 44 without reaching past the
 *  gap a row of the layout leaves, `ROW_PITCH * zoom`, by its own height. */
export function pillTarget(height: number, zoom: number): { slop: number } {
  const room = Math.min(44, ROW_PITCH * zoom);
  return { slop: Math.max(0, (room - height) / 2) };
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

/** A kind label's words and glyph: "Go to People, 12" is its name. */
export function kindLabel(k: MemoryWorldKind): { name: string; glyph: string; label: string } | null {
  const info = memoryKind(k.kind);
  return info ? { name: info.name, glyph: info.glyph, label: `Go to ${info.name}, ${k.count}` } : null;
}

/** Each kind's label over its cloud while on screen; once zoomed into
 *  sentences, the kinds off screen dock in one row along the top. */
export function mapLabels(world: MemoryWorld, c: Camera, size: Size): { onScreen: KindLabel[]; dock: KindLabel[] } {
  const near = c.z >= MAP_ZOOM.sentences;
  const onScreen: KindLabel[] = [];
  const dock: KindLabel[] = [];
  for (const k of world.kinds) {
    const info = kindLabel(k);
    if (!info) continue;
    const anchor = labelAnchor(k, near);
    const at = screenOf(c, size, anchor.x, anchor.y);
    const centre = screenOf(c, size, k.cx, k.cy);
    const turn = (Math.atan2(centre.y - size.height / 2, centre.x - size.width / 2) * 180) / Math.PI + 90;
    const label: KindLabel = { kind: k.kind, ...info, count: k.count, x: at.x, y: at.y, turn };
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
