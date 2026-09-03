// Which widgets a thread earns, and how their contents are grouped.
//
// Two mechanisms, deliberately different, and keeping them different is most of
// the design:
//
//   **Widgets are earned.** A widget splits content by what it *is*, and a
//   thread gets one from its own contents: a map when it has locations, a
//   timeline when it has dated rows. Nobody configures a widget into existence,
//   and a thread that loses its last dated row loses its timeline. That is the
//   system working rather than state going missing.
//
//   **Groups are asked for.** A group splits content inside a widget by what it
//   is *about*, using a tag dimension the thread names. A to-do list in a
//   travel thread groups by city; the same list in a house thread groups by
//   room, or by nothing.
//
// Both run over rows the page has already fetched. **Not one query per widget**,
// which is the shape 005's AC-2 forbids and which four widgets is exactly where
// it starts to look reasonable. 001's heavy case is 500 rows in one thread and
// the page draws 30, so filtering in memory is not a compromise, it is the
// cheaper answer.

import { parseTag } from "./tags.js";

export const WIDGET_KINDS = ["map", "todo", "timeline", "files"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

/** The least a row has to be for any of this to work. */
export interface Sortable {
  id: string;
  type: string;
  priority: number;
  tags: string[];
  doneAt: string | null;
  occursAt: string | null;
  placeId: string | null;
}

/** What a thread earns a widget for.
 *
 *  One predicate each, and the order here is also the tie-break when two
 *  widgets account for the same share of a thread, so the same thread always
 *  draws the same way.
 */
const EARNS: Record<WidgetKind, (row: Sortable) => boolean> = {
  map: (row) => row.placeId !== null,
  todo: (row) => row.type === "task" && row.doneAt === null,
  timeline: (row) => row.occursAt !== null,
  files: (row) =>
    row.type === "image" ||
    row.type === "screenshot" ||
    row.type === "file" ||
    row.type === "link",
};

export interface Widget<T extends Sortable> {
  kind: WidgetKind;
  rows: T[];
}

/** Which widgets these rows justify, in the order they should appear.
 *
 *  Default order is by how much of the thread each widget accounts for, so a
 *  trip full of places leads with the map. A stated preference overrides it,
 *  and a preference naming a kind the thread no longer earns is ignored rather
 *  than treated as an error: a thread whose contents changed under a preference
 *  is the normal case, not an edge one.
 */
export function widgetsFor<T extends Sortable>(
  rows: readonly T[],
  order?: readonly string[] | null,
): Widget<T>[] {
  const earned = WIDGET_KINDS.map((kind) => ({
    kind,
    rows: rows.filter(EARNS[kind]),
  })).filter((widget) => widget.rows.length > 0);

  if (!order || order.length === 0) {
    return earned.sort((a, b) => {
      if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
      return WIDGET_KINDS.indexOf(a.kind) - WIDGET_KINDS.indexOf(b.kind);
    });
  }

  // Named first, in the order given; anything earned but unnamed follows, so a
  // widget that appears after the preference was set is visible rather than
  // silently absent.
  const named = order
    .map((kind) => earned.find((widget) => widget.kind === kind))
    .filter((widget): widget is Widget<T> => widget !== undefined);
  const rest = earned.filter((widget) => !named.includes(widget));
  return [...named, ...rest];
}

export interface Group<T> {
  /** Null is the group for rows carrying no tag in this dimension. It renders
   *  without a heading and it comes last. */
  value: string | null;
  rows: T[];
}

/** Bucket rows by one tag dimension.
 *
 *  Three rules, and the third is the one that matters:
 *
 *  - A row is in exactly one group.
 *  - Groups lead with the one holding the highest-priority row, so what matters
 *    is at the top.
 *  - **A row with no tag in this dimension is still shown**, in one unnamed
 *    group, last. Nothing is ever invisible for not having been tagged, which
 *    would be the worst possible failure of a feature whose whole pitch is that
 *    you never file anything.
 */
export function groupBy<T extends Sortable>(
  rows: readonly T[],
  dimension: string | null | undefined,
): Group<T>[] {
  if (!dimension) return [{ value: null, rows: [...rows] }];

  const buckets = new Map<string, T[]>();
  const untagged: T[] = [];

  for (const row of rows) {
    const match = row.tags
      .map(parseTag)
      .find((tag) => tag.dimension === dimension);

    if (!match) {
      untagged.push(row);
      continue;
    }
    const bucket = buckets.get(match.value) ?? [];
    bucket.push(row);
    buckets.set(match.value, bucket);
  }

  const best = (list: readonly T[]) =>
    list.reduce((top, row) => Math.max(top, row.priority), -1);

  const groups: Group<T>[] = [...buckets.entries()]
    .map(([value, list]) => ({ value, rows: list }))
    .sort((a, b) => best(b.rows) - best(a.rows));

  if (untagged.length > 0) groups.push({ value: null, rows: untagged });
  return groups;
}

/** What a stored preference is allowed to say.
 *
 *  Tolerated on read, validated on write. A preference naming a widget that no
 *  longer exists renders as though it were absent; one arriving from a model
 *  is checked against the closed set before it is stored.
 */
export interface ThreadPreference {
  groupBy?: Partial<Record<WidgetKind, string>>;
  widgets?: WidgetKind[];
}

export function readPreference(attrs: unknown): ThreadPreference {
  if (!attrs || typeof attrs !== "object") return {};
  const raw = attrs as Record<string, unknown>;

  const widgets = Array.isArray(raw["widgets"])
    ? (raw["widgets"] as unknown[]).filter((kind): kind is WidgetKind =>
        (WIDGET_KINDS as readonly unknown[]).includes(kind)
      )
    : undefined;

  const grouping: Partial<Record<WidgetKind, string>> = {};
  const stored = raw["groupBy"];
  if (stored && typeof stored === "object") {
    for (const [kind, value] of Object.entries(stored as Record<string, unknown>)) {
      if (!(WIDGET_KINDS as readonly string[]).includes(kind)) continue;
      if (typeof value === "string" && value.length > 0) {
        grouping[kind as WidgetKind] = value.toLowerCase();
      }
    }
  }

  return {
    ...(widgets && widgets.length > 0 ? { widgets } : {}),
    ...(Object.keys(grouping).length > 0 ? { groupBy: grouping } : {}),
  };
}
