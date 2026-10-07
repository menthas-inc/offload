// 040. What every surface and the Core API agree on about memories: the five
// kinds in the order the tab draws them, their hue and glyph, the caps, and
// the map's pitches. One module, so three clients never type them three times.

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
}

export interface MemoryList {
  memories: MemoryView[];
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
    return { glyph: "text-quote", lead: "You asked offload to remember this", rest: `${on}.${said}` };
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

export function matchesMemory(memory: MemoryView, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || memory.text.toLowerCase().includes(q);
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
/** A wide world's row aims for about this many units before it wraps. */
const WIDE_ROW = 1440;

type Placed = { kind: string; place: { dx: number; dy: number } | null };

/** Every memory's offset, the place of one with none still unknown taken as the centre. */
const offsetOf = (m: Placed) => m.place ?? { dx: 0, dy: 0 };

export function memoryWorld(memories: Placed[], wide: boolean): MemoryWorld {
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

  if (!wide) {
    const widest = Math.max(...sized.map((k) => k.radius));
    const width = 2 * widest + 2 * WORLD_MARGIN;
    let y = WORLD_MARGIN;
    const kinds = sized.map((k, i) => {
      // Staggered left and right, as drawn, within the room a smaller cloud leaves.
      const room = widest - k.radius;
      const cx = width / 2 + (i % 2 === 0 ? -1 : 1) * room * 0.5;
      const cy = y + k.radius;
      y = cy + k.radius + KIND_GAP;
      return { ...k, cx, cy };
    });
    return { width, height: y - KIND_GAP + WORLD_MARGIN, kinds };
  }

  // About as wide as the clouds' combined area is square, and wider: a row
  // wraps once it is longer than that, so a large kind does not stand alone.
  const area = sized.reduce((sum, k) => sum + (2 * k.radius + KIND_GAP) ** 2, 0);
  const target = Math.max(WIDE_ROW, Math.sqrt(area) * 1.6, ...sized.map((k) => 2 * k.radius));
  const rows: (typeof sized)[] = [[]];
  let used = 0;
  for (const k of sized) {
    const span = 2 * k.radius + (rows[rows.length - 1]!.length ? KIND_GAP : 0);
    if (used + span > target && rows[rows.length - 1]!.length) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]!.push(k);
    used += 2 * k.radius + (rows[rows.length - 1]!.length > 1 ? KIND_GAP : 0);
  }
  const kinds: MemoryWorldKind[] = [];
  let top = WORLD_MARGIN;
  let width = 0;
  for (const row of rows) {
    const tallest = Math.max(...row.map((k) => k.radius));
    let x = WORLD_MARGIN;
    row.forEach((k, i) => {
      // A small stagger up and down, as drawn, inside the row's own height.
      const cy = top + tallest + (i % 2 === 0 ? -1 : 1) * (tallest - k.radius) * 0.5;
      kinds.push({ ...k, cx: x + k.radius, cy });
      x += 2 * k.radius + KIND_GAP;
    });
    width = Math.max(width, x - KIND_GAP + WORLD_MARGIN);
    top += 2 * tallest + KIND_GAP;
  }
  const byOrder = MEMORY_KINDS.map((k) => kinds.find((x) => x.kind === k.kind)).filter((k): k is MemoryWorldKind => !!k);
  return { width, height: top - KIND_GAP + WORLD_MARGIN, kinds: byOrder };
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

/** How many lines a sentence on the map may take before it is cut: one
 *  near the threshold and two from 0.7, where two lines of `sentenceSize`
 *  still fit inside a row. The whole sentence is in the editor and in the
 *  pill's name. */
export function sentenceLines(zoom: number): 1 | 2 {
  return zoom >= 0.7 ? 2 : 1;
}
