// Thread layouts (the owner, 19 October 2026). A thread has a layout, one of
// six, and the page arranges the same rows differently for what the thread is
// for. The rows, the writes and the Undo are the same in all six; only the
// arrangement changes.
//
// **One function lays out all six.** Six layouts on three surfaces would be
// eighteen renderers; `layoutFor` is one, and the clients draw what it returns.
// Default reproduces the page as built, to the pixel: its own test pins that.
//
// Handoff: `.claude/skills/offload-design/handoff/APPLY-2026-10-19-thread-layouts.md`.

import { DAY_MS, dayIn, utcDay } from "./days.js";
import { sinkDone, widgetsFor, type Sortable, type ThreadPreference, type Widget } from "./index.js";

export const LAYOUTS = ["default", "todo", "events", "gallery", "project", "timeline"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const LAYOUT_NAMES: Record<Layout, string> = {
  default: "Default",
  todo: "Todo list",
  events: "Events",
  gallery: "Gallery",
  project: "Project",
  timeline: "Timeline",
};

/** The labels a layout makes, in section order. Matched by name, ignoring case.
 *  Only Events and Project organise by labels (decision 2). */
export const LAYOUT_LABELS: Record<Layout, readonly string[]> = {
  default: [],
  todo: [],
  events: ["Booked", "Still deciding", "Passed on"],
  gallery: [],
  project: ["Now", "Next", "Later"],
  timeline: [],
};

/** Which of a layout's own label sections start folded (decision 19). */
export const FOLDED_AT_FIRST_LABELS: Record<Layout, readonly string[]> = {
  default: [],
  todo: [],
  events: ["Passed on"],
  gallery: [],
  project: [],
  timeline: [],
};

/** Layouts offload may suggest, and the phrase the line reads (6.9). */
const PHRASES: Record<Exclude<Layout, "default">, string> = {
  todo: "a list to get through",
  events: "a trip or an event",
  gallery: "things to get round to",
  project: "a project",
  timeline: "a diary",
};

export function suggestionLine(layout: Exclude<Layout, "default">): string {
  return `Looks like ${PHRASES[layout]}`;
}

/** Which open rows reach Today's To do (decision 11). A date or a reminder
 *  always does; otherwise it is the layout's call. The SQL in `today/rows.ts`
 *  is the same rule, and a test pins the two together. */
export function reachesToday(
  layout: Layout,
  row: { dueAt?: string | null; occursAt?: string | null; isReminder?: boolean | null },
): boolean {
  if (row.dueAt != null || row.occursAt != null || row.isReminder === true) return true;
  return layout === "default" || layout === "project";
}

const lower = (s: string): string => s.toLowerCase();

/** The layout's labels the thread is missing, by name, ignoring case. The names
 *  to create, in the layout's order. */
export function labelsToMake(to: Layout, live: readonly { name: string }[]): string[] {
  const have = new Set(live.map((l) => lower(l.name)));
  return LAYOUT_LABELS[to].filter((name) => !have.has(lower(name)));
}

/** The old layout's labels to delete on a switch: its own labels, by name, with
 *  no rows under them, that the new layout does not also use (decision 3). */
export function labelsToDrop(
  from: Layout,
  to: Layout,
  live: readonly { id: string; name: string; count: number }[],
): string[] {
  const fromNames = new Set(LAYOUT_LABELS[from].map(lower));
  const toNames = new Set(LAYOUT_LABELS[to].map(lower));
  return live
    .filter((l) => fromNames.has(lower(l.name)) && l.count === 0 && !toNames.has(lower(l.name)))
    .map((l) => l.id);
}

// ---------------------------------------------------------------------------
// layoutFor: the one renderer. The clients draw its sections (section 3).

export type Form = "row" | "check" | "big" | "card" | "draft" | "tile" | "entry";

export type LayoutSection<T extends Sortable, N> =
  | { kind: "widget"; widget: Widget<T> }
  | { kind: "notes"; notes: N[] }
  | { kind: "rest"; heading: "Everything else" | "Everything in here"; rows: T[] }
  | {
      kind: "list";
      key: string;
      heading: string | null;
      labelId: string | null;
      form: Form;
      rows: T[];
      folds: boolean;
      foldedAtFirst: boolean;
      add: boolean;
    }
  | { kind: "done"; key: "done" | "week"; heading: string; rows: T[] }
  | { kind: "day"; key: string; day: string; rows: (T | N)[] }
  | { kind: "files"; rows: T[] };

export interface LayoutPage<T extends Sortable, N> {
  /** The layout permits a calendar rail (decision 21). AND-ed by the client
   *  with the page's own `railEarned`. */
  rail: boolean;
  sections: LayoutSection<T, N>[];
  /** What the foot row ("N other things in here") opens. Empty draws no row. */
  others: { rows: T[]; notes: N[] };
}

/** What `layoutFor` reads off a content row, beyond `Sortable`. */
export type LayoutRow = Sortable & {
  labels: string[];
  createdAt: string;
  title: string;
  dueAt?: string | null;
  isReminder?: boolean | null;
};

/** What it reads off a note: enough to place it on a timeline day. */
export interface LayoutNote {
  id: string;
  createdAt: string;
  occursAt?: string | null;
}

export interface LayoutInput<T extends LayoutRow, N extends LayoutNote> {
  layout: Layout;
  /** Live, unarchived rows, as the page already fetches them. */
  rows: readonly T[];
  notes: readonly N[];
  /** The thread's labels, in their order. */
  labels: readonly { id: string; name: string }[];
  preference: ThreadPreference;
  now: Date;
  /** The account's clock, for timeline's day buckets. Null reads a day in UTC. */
  zone?: string | null;
}

export function layoutFor<T extends LayoutRow, N extends LayoutNote>(input: LayoutInput<T, N>): LayoutPage<T, N> {
  const { layout, rows, notes, labels, preference, now, zone = null } = input;
  switch (layout) {
    case "todo":
      return todoPage(rows, notes, now);
    case "events":
      return eventsPage(rows, notes, labels);
    case "gallery":
      return galleryPage(rows, notes);
    case "project":
      return projectPage(rows, notes, labels);
    case "timeline":
      return timelinePage(rows, notes, zone);
    default:
      return defaultPage(rows, notes, preference);
  }
}

const isFileRow = (r: Sortable): boolean =>
  r.type === "image" || r.type === "screenshot" || (r.type === "file" && r.photo?.kind === "pdf");

/** A row is on the rail when it carries a date, zone-independent membership. */
const onRail = (r: LayoutRow): boolean => r.occursAt != null || r.dueAt != null;

// Default: the page as built. rail, widgets, notes, rest, nothing to others.
function defaultPage<T extends LayoutRow, N extends LayoutNote>(
  rows: readonly T[],
  notes: readonly N[],
  preference: ThreadPreference,
): LayoutPage<T, N> {
  const widgets = widgetsFor(rows, preference.widgets);
  const inWidgets = new Set(widgets.flatMap((w) => w.rows.map((r) => r.id)));
  const rest = rows.filter((r) => !inWidgets.has(r.id) && !onRail(r));
  const sections: LayoutSection<T, N>[] = [
    ...widgets.map((widget) => ({ kind: "widget" as const, widget })),
    { kind: "notes", notes: [...notes] },
    { kind: "rest", heading: inWidgets.size > 0 ? "Everything else" : "Everything in here", rows: rest },
  ];
  return { rail: true, sections, others: { rows: [], notes: [] } };
}

// Todo list: big rows, the whole row ticks, a ticked row leaves to the week
// fold. Ticks older than the week, and anything not a task, stay reachable in
// others (AC-4), since the week fold is only the last seven days.
function todoPage<T extends LayoutRow, N extends LayoutNote>(
  rows: readonly T[],
  notes: readonly N[],
  now: Date,
): LayoutPage<T, N> {
  const tasks = rows.filter((r) => r.type === "task");
  const notTasks = rows.filter((r) => r.type !== "task");
  const left = sinkDone(tasks.filter((r) => r.doneAt === null));
  const done = tasks.filter((r) => r.doneAt !== null);
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const week = done
    .filter((r) => Date.parse(r.doneAt as string) >= weekAgo)
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const older = done.filter((r) => Date.parse(r.doneAt as string) < weekAgo);

  const sections: LayoutSection<T, N>[] = [
    { kind: "list", key: "todo", heading: null, labelId: null, form: "big", rows: left, folds: false, foldedAtFirst: false, add: true },
  ];
  if (week.length > 0) sections.push({ kind: "done", key: "week", heading: "got this week", rows: week });
  return { rail: false, sections, others: { rows: [...notTasks, ...older], notes: [...notes] } };
}

// Events: everything but files, grouped by labels. Booked as cards, Still
// deciding as drafts, else rows; files and notes to others.
function eventsPage<T extends LayoutRow, N extends LayoutNote>(
  rows: readonly T[],
  notes: readonly N[],
  labels: readonly { id: string; name: string }[],
): LayoutPage<T, N> {
  const drawn = rows.filter((r) => !isFileRow(r));
  const sections = labelSections<T, N>(drawn, labels, "events");
  return { rail: true, sections, others: { rows: rows.filter(isFileRow), notes: [...notes] } };
}

// Gallery: link and task tiles, done ones to a fold. Everything else and notes
// to others.
function galleryPage<T extends LayoutRow, N extends LayoutNote>(
  rows: readonly T[],
  notes: readonly N[],
): LayoutPage<T, N> {
  const draws = (r: T): boolean => r.type === "link" || r.type === "task";
  const drawn = rows.filter(draws);
  const left = drawn.filter((r) => r.doneAt === null);
  const done = drawn.filter((r) => r.doneAt !== null).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const sections: LayoutSection<T, N>[] = [
    { kind: "list", key: "gallery", heading: null, labelId: null, form: "tile", rows: left, folds: false, foldedAtFirst: false, add: false },
  ];
  if (done.length > 0) sections.push({ kind: "done", key: "done", heading: "Done", rows: done });
  return { rail: false, sections, others: { rows: rows.filter((r) => !draws(r)), notes: [...notes] } };
}

// Project: label sections of open tasks, then Done, then Files. Links, events,
// places and notes to others.
function projectPage<T extends LayoutRow, N extends LayoutNote>(
  rows: readonly T[],
  notes: readonly N[],
  labels: readonly { id: string; name: string }[],
): LayoutPage<T, N> {
  const tasks = rows.filter((r) => r.type === "task");
  const open = tasks.filter((r) => r.doneAt === null);
  const done = tasks.filter((r) => r.doneAt !== null).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const files = rows.filter(isFileRow);
  const sections: LayoutSection<T, N>[] = labelSections<T, N>(open, labels, "project");
  if (done.length > 0) sections.push({ kind: "done", key: "done", heading: "Done", rows: done });
  if (files.length > 0) sections.push({ kind: "files", rows: files });
  const others = rows.filter((r) => r.type !== "task" && !isFileRow(r));
  return { rail: true, sections, others: { rows: others, notes: [...notes] } };
}

// Timeline: one day per calendar day of occursAt ?? createdAt, newest first,
// rows and notes together. Nothing to others.
function timelinePage<T extends LayoutRow, N extends LayoutNote>(
  rows: readonly T[],
  notes: readonly N[],
  zone: string | null,
): LayoutPage<T, N> {
  const dayOf = (at: string): string => (zone ? dayIn(new Date(at), zone) : utcDay(new Date(at)));
  const entries: { day: string; at: string; item: T | N }[] = [
    ...rows.map((r) => ({ at: r.occursAt ?? r.createdAt, item: r as T | N })),
    ...notes.map((n) => ({ at: n.occursAt ?? n.createdAt, item: n as T | N })),
  ].map((x) => ({ day: dayOf(x.at), at: x.at, item: x.item }));

  const byDay = new Map<string, { at: string; item: T | N }[]>();
  for (const e of entries) {
    const held = byDay.get(e.day);
    if (held) held.push(e);
    else byDay.set(e.day, [e]);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const sections: LayoutSection<T, N>[] = days.map((day) => ({
    kind: "day",
    key: `day:${day}`,
    day,
    rows: byDay
      .get(day)!
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((e) => e.item),
  }));
  return { rail: false, sections, others: { rows: [], notes: [] } };
}

/** Label sections in the order decision 18 fixes: the layout's own labels in
 *  its order, then the thread's other labels in theirs, then No label last. A
 *  row with several labels draws once, in its first section. The layout's own
 *  labels draw even when empty, so the setup is visible. */
function labelSections<T extends LayoutRow, N extends LayoutNote>(
  drawn: readonly T[],
  labels: readonly { id: string; name: string }[],
  layout: "events" | "project",
): LayoutSection<T, N>[] {
  const ownNames = LAYOUT_LABELS[layout];
  const byName = new Map(labels.map((l) => [lower(l.name), l]));
  const ordered: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const name of ownNames) {
    const l = byName.get(lower(name));
    if (l && !seen.has(l.id)) {
      ordered.push(l);
      seen.add(l.id);
    }
  }
  for (const l of labels) if (!seen.has(l.id)) ordered.push(l), seen.add(l.id);

  const foldedAtFirst = new Set(FOLDED_AT_FIRST_LABELS[layout].map(lower));
  const sections: LayoutSection<T, N>[] = [];
  const placed = new Set<string>();
  for (const l of ordered) {
    const here = sinkDone(drawn.filter((r) => !placed.has(r.id) && r.labels.includes(l.id)));
    here.forEach((r) => placed.add(r.id));
    const isOwn = ownNames.some((n) => lower(n) === lower(l.name));
    if (here.length === 0 && !isOwn) continue;
    sections.push({
      kind: "list",
      key: `label:${l.id}`,
      heading: l.name,
      labelId: l.id,
      form: formFor(layout, l.name),
      rows: here,
      folds: true,
      foldedAtFirst: foldedAtFirst.has(lower(l.name)),
      add: false,
    });
  }
  const noLabel = sinkDone(drawn.filter((r) => !placed.has(r.id)));
  if (noLabel.length > 0) {
    sections.push({
      kind: "list",
      key: "label:none",
      heading: "No label",
      labelId: null,
      form: formFor(layout, null),
      rows: noLabel,
      folds: true,
      foldedAtFirst: false,
      add: false,
    });
  }
  return sections;
}

/** A section's row form. Events follows the name (a renamed Booked draws a
 *  plain row); Project is always the To do check row. */
function formFor(layout: "events" | "project", name: string | null): Form {
  if (layout === "project") return "check";
  if (name && lower(name) === "booked") return "card";
  if (name && lower(name) === "still deciding") return "draft";
  return "row";
}
