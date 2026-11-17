// 040. What every surface and the Core API agree on about memories: the five
// kinds in the order the tab draws them, their hue and glyph, the caps, and
// the map's pitches. One module, so three clients never type them three times.

import { toSecondPerson } from "./voice.js";

export type MemoryKindId = "people" | "things" | "about" | "rules" | "patterns";

export interface MemoryKindInfo {
  kind: MemoryKindId;
  name: string;
  /** A thread label hue token (`label-N`), or null for Rules, which are ink:
   *  the one kind offload obeys rather than knows. */
  hue: string | null;
  glyph: string;
}

export const MEMORY_KINDS: readonly MemoryKindInfo[] = [
  { kind: "people", name: "People", hue: "label-2", glyph: "users" },
  { kind: "things", name: "Things", hue: "label-1", glyph: "tag" },
  { kind: "about", name: "About", hue: "label-6", glyph: "heart" },
  { kind: "rules", name: "Rules", hue: null, glyph: "compass" },
  { kind: "patterns", name: "Patterns", hue: "label-5", glyph: "spline" },
];

export function memoryKind(kind: string): MemoryKindInfo | undefined {
  return MEMORY_KINDS.find((k) => k.kind === kind);
}

/** Active memories an account may hold, rules among them, and learned. */
export const MEMORY_CAP = 300;
export const RULES_CAP = 20;
export const LEARNED_CAP = 25;
export const MEMORY_TEXT_CHARS = 200;

/** The map, in world units: one memory per row, rows this far apart, and
 *  columns one sentence wide, so no two sentences overlap at any zoom. A pill
 *  is at most 17 of its own ems wide; at the sentence threshold that is 175px
 *  at a zoom of 0.55, so a column is 340 units, not the drawing's 300. */
export const ROW_PITCH = 58;
export const COLUMN_PITCH = 340;

/** The map's zoom: the range, where dots become sentences, and a dot's fly-to. */
export const MAP_ZOOM = { min: 0.3, max: 2.4, sentences: 0.55, flyTo: 0.9 } as const;

/** The rest of how the map is drawn and moved, from the kit's `mapH` and
 *  `bind`, one copy for the web and the phones:
 *  - `widePast`: the map is wide once it is this much wider than tall;
 *  - `dimmed`: what search does not match fades to this;
 *  - `cloudReach`: a cloud is drawn this many times its radius;
 *  - `labelUp`: how far up its cloud a kind's label sits, close in and far out;
 *  - `kindFlight`: flying into a kind, the zoom's ceiling and floor, and how
 *    many radii across the view should hold;
 *  - `zoomStep`: one press of zoom in or out;
 *  - `everythingPast`: Everything shows once zoomed past this many fits;
 *  - `cull`: a mark this far off the screen, in pixels, is not drawn, so it
 *    is never in the tab order or the frame. */
export const MAP_LOOK = {
  widePast: 1.1,
  dimmed: 0.18,
  cloudReach: 1.3,
  labelUp: { near: 0.98, far: 0.78 },
  kindFlight: { most: 1.05, least: 0.8, across: 2.6 },
  zoomStep: 1.5,
  everythingPast: 1.4,
  cull: { x: 200, y: 50 },
} as const;

// ---------------------------------------------------------------- the list
//
// What `GET /v1/memories` sends, and the words every surface draws from it.
// Pure, so the web and the phones say the same sentence about the same row.

export type MemoryOrigin = "stated" | "answered" | "learned";

export interface MemorySourceThread {
  id: string;
  /** Null for the default thread, which is never named. */
  name: string | null;
  notInAThread: boolean;
}

export type MemorySource =
  | { type: "message"; thread: MemorySourceThread | null }
  | { type: "note"; thread: MemorySourceThread | null }
  | { type: "answer"; question: string | null }
  | { type: "none" };

export interface MemoryView {
  id: string;
  kind: MemoryKindId;
  text: string;
  origin: MemoryOrigin;
  createdAt: string;
  updatedAt: string;
  /** Changed in the tab. */
  changed: boolean;
  source: MemorySource;
  place: { dx: number; dy: number } | null;
  /** 042. Remind me on a birthday or an anniversary, as the API sends it. */
  reminders?: "on" | "off" | null;
}

export interface MemoryList {
  memories: MemoryView[];
  /** Where each kind's cloud sits, from last night's layout. */
  kinds: { kind: MemoryKindId; x: number; y: number }[];
  /** At 300: the cap line shows. */
  full: boolean;
  rulesFull: boolean;
}

export type MemoryRefusal = "empty" | "too_long" | "never_list" | "duplicate" | "rules_full" | "memories_full";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysBetween(iso: string, now: Date): number {
  const then = new Date(iso);
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** "Today", "Yesterday", "3 Oct", in the viewer's own day. */
export function memoryDay(iso: string, now: Date = new Date()): string {
  const days = daysBetween(iso, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const then = new Date(iso);
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
}

/** The day a memory became what it says: its change, or its making. */
function dayOf(memory: MemoryView): string {
  return memory.changed ? memory.updatedAt : memory.createdAt;
}

/** The row's meta: *You said · 3 Oct*, *Your answer · 2 Oct*, *✦ Learned ·
 *  Yesterday*. Origin is never a colour; the spark is the one mark. */
export function memoryMeta(memory: MemoryView, now: Date = new Date()): { learned: boolean; label: string; day: string } {
  const day = memoryDay(dayOf(memory), now);
  if (memory.changed) return { learned: false, label: "You changed", day };
  if (memory.origin === "learned") return { learned: true, label: "Learned", day };
  if (memory.origin === "answered") return { learned: false, label: "Your answer", day };
  if (memory.source.type === "none") return { learned: false, label: "You added", day };
  return { learned: false, label: "You said", day };
}

function threadClause(thread: MemorySourceThread | null, named: (name: string) => string, loose: string, gone: string): string {
  if (!thread) return gone;
  if (thread.notInAThread || !thread.name) return loose;
  return named(thread.name);
}

/** The editor's *where it came from*: a bold lead and the rest. The thread
 *  is named only while the viewer is in it, the default thread never, and
 *  an answer quotes its question, **never a calendar's name**. */
export function memoryOrigin(memory: MemoryView, now: Date = new Date()): { glyph: string; lead: string; rest: string } {
  const day = memoryDay(dayOf(memory), now);
  const on = day === "Today" || day === "Yesterday" ? ` ${day.toLowerCase()}` : ` on ${day}`;
  if (memory.changed) return { glyph: "text-quote", lead: "You changed this", rest: `${on}.` };
  const source = memory.source;
  if (memory.origin === "learned") {
    const from =
      source.type === "note"
        ? threadClause(source.thread, (n) => ` From a note in ${n}.`, " From a note.", " From a note.")
        : source.type === "message"
          ? threadClause(source.thread, (n) => ` From what you said in ${n}.`, " From what you said, not in a thread.", " From what you said.")
          : "";
    return { glyph: "sparkles", lead: "offload learned this", rest: `${on}.${from}` };
  }
  if (memory.origin === "answered") {
    const question = source.type === "answer" ? source.question : null;
    const who = question ? /shared with (.+)\?$/.exec(question)?.[1] : undefined;
    return {
      glyph: "message-circle-more",
      lead: question ? `Your answer to “${question}”` : "Your answer",
      rest: who ? `${on}. It picks that calendar the next time you say “with ${who}”.` : `${on}.`,
    };
  }
  if (source.type === "message") {
    const said = threadClause(source.thread, (n) => ` Said in ${n}.`, " Not in a thread.", "");
    return { glyph: "text-quote", lead: "You told offload this", rest: `${on}.${said}` };
  }
  return { glyph: "text-quote", lead: "You added this", rest: `${on}.` };
}

export interface MemorySection {
  key: string;
  title: string;
  /** Set on a By kind section, for its dot. */
  kind: MemoryKindId | null;
  rows: MemoryView[];
}

const newestFirst = (a: MemoryView, b: MemoryView) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

/** By kind: a section per kind in the kind order, none when empty. Newest:
 *  This week and Earlier. Newest first inside each. */
export function memorySections(memories: MemoryView[], sort: "kind" | "new", now: Date = new Date()): MemorySection[] {
  const sorted = [...memories].sort(newestFirst);
  if (sort === "kind") {
    return MEMORY_KINDS.map((k) => ({ key: k.kind, title: k.name, kind: k.kind, rows: sorted.filter((m) => m.kind === k.kind) })).filter(
      (section) => section.rows.length > 0,
    );
  }
  const week = sorted.filter((m) => daysBetween(m.createdAt, now) <= 7);
  const earlier = sorted.filter((m) => daysBetween(m.createdAt, now) > 7);
  return [
    { key: "week", title: "This week", kind: null, rows: week },
    { key: "earlier", title: "Earlier", kind: null, rows: earlier },
  ].filter((section) => section.rows.length > 0);
}

/** Search, by the words a memory is read in (F4, spoken to the person) as
 *  well as the words it is stored in, so `your` finds *Their sister is Sara.* */
export function matchesMemory(memory: MemoryView, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || memory.text.toLowerCase().includes(q) || toSecondPerson(memory.text).toLowerCase().includes(q);
}

/** The line under the field when an add or a change is refused. */
export function memoryRefusal(error: MemoryRefusal): string {
  switch (error) {
    case "never_list":
    case "empty":
      return "Not keeping that one.";
    case "too_long":
      return "That's over 200 characters.";
    case "duplicate":
      return "That's already a memory.";
    case "rules_full":
      return "That's twenty rules. Forget one to add this.";
    case "memories_full":
      return "That's 300. Forget one to keep this.";
  }
}

/** The tab's own sentences, one copy for three surfaces. */
export const MEMORY_COPY = {
  title: "Memories",
  empty: "Nothing kept yet. Tell offload something to remember, or add it here.",
  full: "Memories are full, so offload has stopped learning new ones.",
  loadFailed: "Couldn't load your memories.",
  saveFailed: "Couldn't save that",
  /** A refused Undo, as every other Undo in the product says it. */
  unfailed: "Couldn't put that back",
  /** The switch's name, the kit's, on all three. */
  view: "View",
  placeholder: "Something offload should know, in your words",
  newRule: "A rule is followed in every thread. Anything else is something offload knows, and uses when filing and answering.",
  sever: "Changing the words means offload asks which calendar again.",
  forgotten: "Memory forgotten",
  saved: "Saved",
  remembered: "Remembered",
  search: "Search memories",
  nothingSays: (query: string) => `Nothing kept says “${query}”.`,
} as const;

// ---------------------------------------------------------------- the map
//
// The server stores each memory's offset from its kind's centre; this places
// the kinds. **Picked once from the map's shape when it opens:** tall stacks
// the kinds down a world as a phone is tall, wide lays them across. A kind's
// cloud is sized from its own extent, so 300 memories never spill out of it,
// and no two clouds overlap. One copy for the three clients.

export interface MemoryWorldKind {
  kind: MemoryKindId;
  cx: number;
  cy: number;
  /** The cloud's radius: every memory of the kind sits inside it. */
  radius: number;
  count: number;
}

export interface MemoryWorld {
  width: number;
  height: number;
  kinds: MemoryWorldKind[];
}

/** Room around a kind's sentences inside its cloud, between clouds, and at the edges. */
const CLOUD_PAD = 60;
const KIND_GAP = 70;
const WORLD_MARGIN = 80;

type Placed = { kind: string; place: { dx: number; dy: number } | null };

/** Every memory's offset, the place of one with none still unknown taken as the centre. */
const offsetOf = (m: Placed) => m.place ?? { dx: 0, dy: 0 };

/** A kind's place from last night's layout: normalised, centred on zero. */
export interface MemoryKindPlace {
  kind: string;
  x: number;
  y: number;
}

/** The kinds in the world. Each goes where last night's layout put it (its
 *  memories' mean in one t-SNE of them all, so kinds that talk alike sit near
 *  each other), stretched to the canvas: `shape` is the canvas's width over
 *  its height, taller on a phone and wider on the web (`true` and `false` are
 *  the web's and the phone's usual shapes). Then any two clouds closer than
 *  their radii and a gap are pushed apart, so no two ever overlap. Deterministic. */
export function memoryWorld(memories: Placed[], shape: boolean | number, places: MemoryKindPlace[] = []): MemoryWorld {
  const sized = MEMORY_KINDS.flatMap((k) => {
    const own = memories.filter((m) => m.kind === k.kind);
    if (own.length === 0) return [];
    // A sentence is a column wide and a row tall around its point.
    const reach = Math.max(
      ...own.map((m) => {
        const { dx, dy } = offsetOf(m);
        return Math.hypot(Math.abs(dx) + COLUMN_PITCH / 2, Math.abs(dy) + ROW_PITCH / 2);
      }),
    );
    return [{ kind: k.kind, count: own.length, radius: Math.ceil(reach + CLOUD_PAD) }];
  });
  if (sized.length === 0) return { width: 2 * WORLD_MARGIN, height: 2 * WORLD_MARGIN, kinds: [] };

  const aspect = typeof shape === "number" ? shape : shape ? 1.6 : 0.6;
  // Past the canvas's own shape: making room pushes clouds apart evenly, which
  // rounds the world off, so the places lean harder than the canvas does.
  const stretch = Math.pow(aspect, 1.4);
  // A kind with no place yet (a new account, before its first night) goes
  // down the canvas's long side in kind order, staggered, as drawn.
  const targets = sized.map((k, i) => {
    const place = places.find((p) => p.kind === k.kind);
    if (place) return [place.x * stretch, place.y / stretch] as const;
    const along = i - (sized.length - 1) / 2;
    const across = i % 2 === 0 ? -0.3 : 0.3;
    return aspect >= 1 ? ([along, across] as const) : ([across, along] as const);
  });

  // Scale the places so neighbouring clouds about touch, then make room.
  let spread = 0;
  let need = 0;
  for (let i = 0; i < sized.length; i += 1)
    for (let j = i + 1; j < sized.length; j += 1) {
      spread += Math.hypot(targets[i]![0] - targets[j]![0], targets[i]![1] - targets[j]![1]);
      need += sized[i]!.radius + sized[j]!.radius + KIND_GAP;
    }
  const scale = spread > 1e-9 ? need / spread : 1;
  const at = targets.map(([x, y]) => [x * scale, y * scale]);
  for (let step = 0; step < 500; step += 1) {
    let moved = false;
    for (let i = 0; i < at.length; i += 1)
      for (let j = i + 1; j < at.length; j += 1) {
        const a = at[i]!;
        const b = at[j]!;
        let dx = b[0]! - a[0]!;
        let dy = b[1]! - a[1]!;
        let d = Math.hypot(dx, dy);
        const want = sized[i]!.radius + sized[j]!.radius + KIND_GAP;
        if (d >= want) continue;
        moved = true;
        // Coincident: apart along the canvas's long side.
        if (d < 1e-6) [dx, dy, d] = aspect >= 1 ? [1, 0, 1] : [0, 1, 1];
        const push = (want - d) / 2;
        a[0] = a[0]! - (dx / d) * push;
        a[1] = a[1]! - (dy / d) * push;
        b[0] = b[0]! + (dx / d) * push;
        b[1] = b[1]! + (dy / d) * push;
      }
    if (!moved) break;
  }

  const left = Math.min(...at.map(([x], i) => x! - sized[i]!.radius)) - WORLD_MARGIN;
  const top = Math.min(...at.map(([, y], i) => y! - sized[i]!.radius)) - WORLD_MARGIN;
  const kinds = sized.map((k, i) => ({ ...k, cx: at[i]![0]! - left, cy: at[i]![1]! - top }));
  const width = Math.max(...kinds.map((k) => k.cx + k.radius)) + WORLD_MARGIN;
  const height = Math.max(...kinds.map((k) => k.cy + k.radius)) + WORLD_MARGIN;
  return { width, height, kinds };
}

/** Where a memory sits in the world: its kind's centre plus its offset. */
export function memoryAt(world: MemoryWorld, memory: Placed): { x: number; y: number } {
  const kind = world.kinds.find((k) => k.kind === memory.kind);
  const { dx, dy } = offsetOf(memory);
  return { x: (kind?.cx ?? world.width / 2) + dx, y: (kind?.cy ?? world.height / 2) + dy };
}

/** The camera the map opens with: the whole world, or a sentence zoom under
 *  ten memories. `min` lets the whole of a large world be seen. */
export function mapOpening(
  world: MemoryWorld,
  viewWidth: number,
  viewHeight: number,
  count: number,
): { cx: number; cy: number; z: number; min: number } {
  const fit = Math.min(viewWidth / world.width, viewHeight / world.height) * 0.94;
  const min = Math.min(MAP_ZOOM.min, fit);
  const z = count < 10 ? Math.max(MAP_ZOOM.sentences, Math.min(fit, MAP_ZOOM.flyTo)) : Math.min(MAP_ZOOM.max, Math.max(min, fit));
  return { cx: world.width / 2, cy: world.height / 2, z, min };
}

/** The zoom a pill's type is set at, in screen pixels: it grows with the zoom. */
export function sentenceSize(zoom: number): number {
  return Math.min(15.5, Math.max(10, 7 + zoom * 6));
}


/** About how wide a run of text is, in ems of the core face: narrow letters,
 *  wide ones, capitals and digits apart, close enough to size a card to its
 *  words without measuring on the server. */
export function textEms(text: string): number {
  let ems = 0;
  for (const ch of text) {
    if (" ilj'.,:;!|".includes(ch)) ems += 0.27;
    else if ("ftrI()[]-".includes(ch)) ems += 0.36;
    else if ("mwMW".includes(ch)) ems += 0.82;
    else if (ch >= "A" && ch <= "Z") ems += 0.64;
    else if (ch >= "0" && ch <= "9") ems += 0.57;
    else ems += 0.52;
  }
  // Calibrated against Instrument Sans in the browser on 2026-10-07: the
  // table ran up to 4% short of the face, which wrapped a one-line card.
  return ems * FACE_CALIBRATION;
}

const FACE_CALIBRATION = 1.05;

/** A sentence's card on the map, in ems of its own type: one line when short,
 *  two when not, three or more only when truly long, and as wide as its words
 *  need, so no line ends in dead space. The clients draw it at this width with
 *  balanced lines; the nightly layout makes room for it. */
export interface PillShape {
  lines: number;
  /** The whole card, padding and the spark included. */
  widthEms: number;
  heightEms: number;
  /** What of the width is padding and the spark, not words. */
  padEms: number;
}

const ONE_LINE_EMS = 16;
const TWO_LINES_EMS = 36;
const LONG_LINE_EMS = 22;
/** Room past the words on every line, for the face's own rounding. */
const LINE_SLACK_EMS = 0.4;

/** How many lines words take when wrapped greedily at `width` ems. */
function wrappedLines(words: number[], space: number, width: number): number {
  let lines = 1;
  let used = 0;
  for (const w of words) {
    const next = used === 0 ? w : used + space + w;
    if (next > width && used > 0) {
      lines += 1;
      used = w;
    } else used = next;
  }
  return lines;
}

export function pillShape(text: string, learned: boolean): PillShape {
  const total = textEms(text);
  const lines = total <= ONE_LINE_EMS ? 1 : total <= TWO_LINES_EMS ? 2 : Math.ceil(total / LONG_LINE_EMS);
  const padEms = 1.5 + (learned ? 1.3 : 0);
  // The narrowest width at which the words, wrapped where they break, fill
  // that many lines: an even split of the length ignores that a long word
  // cannot be cut, and the card then needed a line it did not have.
  const words = text.split(/\s+/).filter(Boolean).map(textEms);
  const space = textEms(" ");
  let width = Math.max(total / lines, ...words);
  while (wrappedLines(words, space, width) > lines) width += 0.1;
  // A little past it, so the face never wraps a line the estimate fitted.
  return { lines, widthEms: width + LINE_SLACK_EMS + padEms, heightEms: lines * 1.3 + 0.9, padEms };
}

/** A card's size in world units at the zoom it first shows as a sentence,
 *  where it is largest: above it, type grows slower than the zoom, so a
 *  layout clear here is clear at every zoom. */
export function pillWorldSize(text: string, learned: boolean): { w: number; h: number } {
  const shape = pillShape(text, learned);
  const fs = sentenceSize(MAP_ZOOM.sentences);
  return { w: Math.ceil((shape.widthEms * fs) / MAP_ZOOM.sentences), h: Math.ceil((shape.heightEms * fs) / MAP_ZOOM.sentences) };
}
