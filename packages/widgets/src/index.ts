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
//
// ---
//
// **This is a package because it was about to be copied a third time.**
//
// It lived twice, in `apps/core-api/src/threads/widgets.ts` and
// `apps/web/src/lib/widgets.ts`, and the duplication was deliberate and said
// so in its own header. Two phones would have made four copies of the rule
// that decides what a thread looks like, and four clients disagreeing about
// that is a drift problem with a date on it rather than a risk.
//
// `parseTag` and `dimensionsIn` came along, and not for tidiness: `groupBy`
// calls `parseTag`, the server imported it from `tags.ts` and the web kept a
// private copy, so extracting the widget functions alone would have created a
// third `parseTag` sitting beside the server's. `tags.ts` imports both back
// for `normaliseTags`, which is write-time validation and stays server-side.

export const WIDGET_KINDS = ["map", "todo", "timeline", "files"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

/** Dimension plus value. A bare tag takes the implicit dimension, so
 *  everything offload already produces is groupable without a migration. */
export interface Tag {
  dimension: string;
  value: string;
}

/** Split a tag without deciding whether it is valid.
 *
 *  Here rather than beside `normaliseTags`, because `groupBy` below needs it
 *  and a second copy of this four-line function is how two clients end up
 *  disagreeing about what `city:alfama` means. */
export function parseTag(raw: string): Tag {
  const at = raw.indexOf(":");
  if (at < 0) return { dimension: "tag", value: raw };
  return { dimension: raw.slice(0, at), value: raw.slice(at + 1) };
}

/** Which dimensions a page actually uses, in first-seen order.
 *
 *  A scan over rows already fetched, not a query. A GIN on `text[]` indexes
 *  whole elements and not the prefix before a colon, so an indexed answer would
 *  need a different structure and nothing wants one. */
export function dimensionsIn(rows: readonly { tags: string[] }[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const tag of row.tags) {
      const { dimension } = parseTag(tag);
      if (dimension !== "tag" && !out.includes(dimension)) out.push(dimension);
    }
  }
  return out;
}

/** The least a row has to be for any of this to work.
 *
 *  `placeId` rather than a whole place, which is the one thing the two copies
 *  genuinely disagreed about: the server holds a foreign key and the web holds
 *  the place object because it draws the pin. Only presence decides whether the
 *  map is earned, so the shared rule takes the narrower of the two and the web
 *  carries both, the id for this and the object for the pin. */
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
  // Done tasks included. A ticked item does not leave the list, it sinks to the
  // bottom of it: something you finished this morning disappearing is how you
  // end up wondering whether you did it, and the tick is the reward for doing
  // the work. A thread whose tasks are all done still shows the list, which is
  // a record of a finished job rather than an empty widget.
  todo: (row) => row.type === "task",
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

/** Done last, then by priority, then by recency.
 *
 *  **A ticked item sinks rather than vanishing.** Its importance dropped below
 *  everything still outstanding the moment it was finished, which is exactly
 *  what "move it to the bottom" means, and it stays visible so the tick can be
 *  undone and so somebody can see they already did it. Applied to every widget,
 *  because a done task in a timeline is no more urgent than a done task in a
 *  list.
 */
export function sinkDone<T extends Sortable>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const done = Number(a.doneAt !== null) - Number(b.doneAt !== null);
    if (done !== 0) return done;
    return b.priority - a.priority;
  });
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
    rows: sinkDone(rows.filter(EARNS[kind])),
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

  // A group leads on its best outstanding row. A group of finished work sorts
  // below one with anything left in it, however important that work was.
  const best = (list: readonly T[]) =>
    list.reduce((top, row) => (row.doneAt ? top : Math.max(top, row.priority)), -1);

  const groups: Group<T>[] = [...buckets.entries()]
    .map(([value, list]) => ({ value, rows: sinkDone(list) }))
    .sort((a, b) => best(b.rows) - best(a.rows));

  if (untagged.length > 0) groups.push({ value: null, rows: sinkDone(untagged) });
  return groups;
}

/** One chip in a widget's filter row.
 *
 *  Shared rather than derived twice: this and `groupBy` read the same tags the
 *  same way, and two clients disagreeing about what `city:alfama` means is the
 *  thing `parseTag` already exists to stop.
 */
export interface Filter {
  /** The tag value this chip selects. */
  value: string;
  count: number;
}

/** The filter chips a widget offers, most-used first.
 *
 *  There is no chip for rows carrying no tag in this dimension. They are not
 *  hidden: a filter is a deliberate act and everything is under All, which is
 *  where a row nobody tagged belongs. Giving them their own chip would put
 *  offload's word for uncategorised content back on the screen, which is what
 *  the 5 September answer took out along with the grouping.
 */
export function filtersFor(
  rows: readonly Sortable[],
  dimension: string | null | undefined,
): Filter[] {
  if (!dimension) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const match = row.tags.map(parseTag).find((tag) => tag.dimension === dimension);
    if (match) counts.set(match.value, (counts.get(match.value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** The rows one chip shows. `null` is All. */
export function matching<T extends Sortable>(
  rows: readonly T[],
  dimension: string | null | undefined,
  value: string | null,
): T[] {
  if (!dimension || value === null) return [...rows];
  return rows.filter((row) =>
    row.tags.map(parseTag).some((tag) => tag.dimension === dimension && tag.value === value),
  );
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
