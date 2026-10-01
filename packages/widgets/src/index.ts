// Which widgets a thread earns.
//
// **Widgets are earned.** A widget splits content by what it *is*, and a
// thread gets one from its own contents: a map when it has locations, a file
// grid when it has assets. Nobody configures a widget into existence, and a
// thread that loses its last place loses its map. That is the system working
// rather than state going missing.
//
// *The timeline was one of these until 015 and is not any more. It is drawn
// for every thread, including one with no dates in it at all, which is not
// something the rule above can express and not something it should stretch
// to.*
//
// *Groups inside a widget, by a tag dimension the thread named, were the second
// mechanism here from 007 until 025. Labels replaced them: a thread is grouped
// by labels a person can see, name and correct, and a widget is one flat list.*
//
// It runs over rows the page has already fetched. **Not one query per widget**,
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
/** **The timeline is not one of these, and was until 015.** It stopped being a
 *  widget when it stopped being a list: it is a rail of weeks at the top of the
 *  thread, drawn whether or not the thread has a single date on it, which is the
 *  opposite of what a widget is. The rule below is untouched by that. */
export const WIDGET_KINDS = ["map", "todo", "files"] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

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
  doneAt: string | null;
  occursAt: string | null;
  /** The other end of a span, and the day something is wanted by. Optional for
   *  the same reason `seriesRef` is: they arrived after the rows did, and 015
   *  is the first thing that reads them. */
  occursEndAt?: string | null;
  dueAt?: string | null;
  placeId: string | null;
  /** Which repeating series this occurrence belongs to, or null for a one off.
   *
   *  Optional because it arrived after the rows did, and a caller that has not
   *  been taught to send it should read as "nothing repeats" rather than fail
   *  to compile. */
  seriesRef?: string | null;
}

/** One repeating thing, and the occurrences behind it. */
export interface Series<T extends Sortable> {
  ref: string;
  /** The occurrence that stands for the series in a list. The next one that has
   *  not happened, or the most recent if they all have. */
  row: T;
  /** How many occurrences the thread actually holds. Not how many exist: a
   *  series with no end has no number, and this is the honest one. */
  count: number;
  /** Earliest and latest occurrence held, so a list can say a span. */
  from: string;
  to: string;
  /** Days between occurrences when every gap is the same, else null. Enough to
   *  say "every week" without parsing an RRULE the row does not carry. */
  everyDays: number | null;
}

/** Split dated rows into the one-off ones and the things that repeat.
 *
 *  **A repeating event is one thing, not thirty.** A weekly yoga class filed as
 *  thirty occurrences turned a thread's timeline into thirty rows of the word
 *  Yoga, and everything that only happened once was pushed off the bottom by
 *  it. On a calendar that repetition is free, because every day already has a
 *  cell and an empty one costs nothing to draw. A list has no such grid: each
 *  occurrence spends a whole row to say what the row above already said.
 *
 *  So the list collapses a series to one entry and says how often instead. The
 *  occurrences are not hidden, they are counted, and the calendar still draws
 *  every one of them.
 *
 *  **Every list, since 2026-09-11.** This was the timeline widget's alone, and
 *  the rest of a thread kept all thirty rows: 007 said collapsing anywhere else
 *  "would hide rows that are genuinely separate things". Then 015 turned the
 *  timeline into a calendar and deleted the widget, so the only place that
 *  collapsed was gone and the list somebody actually reads was thirty rows of
 *  the word Yoga, which is how it was reported. The rule the comment above
 *  states was always about lists rather than about one widget.
 *
 *  **Which occurrence stands for the series**: the next one that has not
 *  happened yet, because a repeating thing is a question about what is coming.
 *  Once they have all passed it is the most recent, which is the same rule read
 *  from the other end rather than a special case.
 */
export function splitRepeating<T extends Sortable>(
  rows: readonly T[],
  now: Date = new Date(),
): { once: T[]; repeating: Series<T>[] } {
  const bySeries = new Map<string, T[]>();
  const once: T[] = [];

  for (const row of rows) {
    const ref = row.seriesRef ?? null;
    if (ref === null) {
      once.push(row);
      continue;
    }
    const held = bySeries.get(ref);
    if (held) held.push(row);
    else bySeries.set(ref, [row]);
  }

  const repeating: Series<T>[] = [];
  for (const [ref, group] of bySeries) {
    // A series holding one occurrence is not repeating yet, whatever Google
    // called it. Collapsing it would say "every week" about a single date and
    // move it out of the list it belongs in.
    if (group.length < 2) {
      once.push(...group);
      continue;
    }

    const dated = [...group].sort((a, b) => (a.occursAt ?? "").localeCompare(b.occursAt ?? ""));
    const iso = now.toISOString();
    const next = dated.find((row) => (row.occursAt ?? "") >= iso);

    repeating.push({
      ref,
      row: next ?? dated[dated.length - 1]!,
      count: dated.length,
      from: dated[0]!.occursAt ?? "",
      to: dated[dated.length - 1]!.occursAt ?? "",
      everyDays: cadenceOf(dated),
    });
  }

  // Soonest first, so what is coming leads and what has finished sinks. Same
  // direction the one-off list runs in.
  repeating.sort((a, b) => (a.row.occursAt ?? "").localeCompare(b.row.occursAt ?? ""));
  return { once, repeating };
}

/** Days between occurrences, when every gap is the same.
 *
 *  Null the moment two gaps disagree, which is the common case: a fortnightly
 *  thing with one moved week is not fortnightly and saying so would be worse
 *  than saying nothing. The row carries no RRULE, so this is inferred from the
 *  dates it does carry and it declines rather than guesses.
 *
 *  Rounded to whole days before comparing, because an occurrence that crosses a
 *  daylight saving boundary is an hour out and is still weekly. */
function cadenceOf(dated: readonly Sortable[]): number | null {
  const DAY = 24 * 60 * 60 * 1000;
  let every: number | null = null;

  for (let i = 1; i < dated.length; i += 1) {
    const a = dated[i - 1]!.occursAt;
    const b = dated[i]!.occursAt;
    if (!a || !b) return null;
    const gap = Math.round((Date.parse(b) - Date.parse(a)) / DAY);
    if (gap <= 0) return null;
    if (every === null) every = gap;
    else if (every !== gap) return null;
  }
  return every;
}

/** How often, in words, or null when the dates do not agree on an answer.
 *
 *  Sentence case and no unit on its own: "every week", not "Every 7 Days". */
export function cadenceLabel(everyDays: number | null): string | null {
  if (everyDays === null) return null;
  if (everyDays === 1) return "every day";
  if (everyDays === 7) return "every week";
  if (everyDays === 14) return "every two weeks";
  if (everyDays === 28 || everyDays === 30 || everyDays === 31) return "every month";
  if (everyDays === 365 || everyDays === 366) return "every year";
  return `every ${everyDays} days`;
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
  // 020. Files is the kit's grid of square tiles, and a picture is what a tile
  // is. A link earned it until then, drawn as a row; a link in a grid of
  // untitled squares loses the title and the domain that identify it, so a
  // link row stays in the list with the page's own picture on it. `file`
  // waits for the spec that brings PDFs.
  files: (row) => row.type === "image" || row.type === "screenshot",
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
 *  because a done task in a file grid is no more urgent than a done task in a
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

/** How many finished rows a list shows before it collapses. */
export const DONE_SHOWN = 5;

/** Split a list into what is left and what is finished, newest finish first.
 *
 *  A finished task keeps its place in the list and sinks below everything
 *  outstanding; past `DONE_SHOWN` the list shows the most recent and offers the
 *  rest. A long-running thread's to-do list stays about what is left without
 *  hiding that the work happened.
 */
export function splitDone<T extends Sortable>(
  rows: readonly T[],
): { left: T[]; done: T[] } {
  const left = rows.filter((row) => row.doneAt === null);
  const done = rows
    .filter((row) => row.doneAt !== null)
    // Newest finish first, so "the five most recent" is the top five.
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  return { left, done };
}

/** What a section's heading counts: the rows live in it.
 *
 *  A finished task is still in the list, sunk below what is left, and the
 *  heading does not count it: "To do 3" is how many there are to do, which is
 *  what the kit draws and what the number was read as. A map or a files
 *  section never holds a done row, so for them this is every row drawn, and one
 *  rule covers all three rather than To do being a special case. Archived rows
 *  are not here at all: the page fetches them as their own view.
 */
export function liveCount(rows: readonly Sortable[]): number {
  return rows.filter((row) => row.doneAt === null).length;
}

/** What a stored preference is allowed to say.
 *
 *  Tolerated on read, validated on write. A preference naming a widget that no
 *  longer exists renders as though it were absent; one arriving from a model
 *  is checked against the closed set before it is stored.
 */
export interface ThreadPreference {
  widgets?: WidgetKind[];
  /** The finished rows of To do are folded away. **The viewer's, not the
   *  thread's**: it is read from their membership and composed in by the
   *  server, never from `attrs`, so `readPreference` does not produce it. On
   *  the account rather than the device, so a list somebody tidied stays tidy
   *  on their phone and after a refresh. */
  hideDone?: boolean;
}

export function readPreference(attrs: unknown): ThreadPreference {
  if (!attrs || typeof attrs !== "object") return {};
  const raw = attrs as Record<string, unknown>;

  const widgets = Array.isArray(raw["widgets"])
    ? (raw["widgets"] as unknown[]).filter((kind): kind is WidgetKind =>
        (WIDGET_KINDS as readonly unknown[]).includes(kind)
      )
    : undefined;

  return {
    ...(widgets && widgets.length > 0 ? { widgets } : {}),
  };
}

// The rail, and the day under it. Its own file because it shares nothing with
// the widget rules above except the row shape, and 015 is the reason it exists.
export * from "./timeline.js";

// Dragging a row to a new place, as the priorities that hold it there. Its own
// file because it is arithmetic over one field and every surface drags.
export * from "./reorder.js";
export { photoCaption } from "./photos.js";

// 023. The recurrence rule and the day arithmetic it shares with the rail.
export {
  RULE_STEP_CAP,
  WEEKDAYS,
  anchorDayOf,
  describeRule,
  formatRule,
  isCanonicalRule,
  nextOnOrAfter,
  occurrencesIn,
  parseRule,
  presetsFor,
} from "./rrule.js";
export type { Freq, ParsedRule, Preset, Rule, RuleRefusal, Weekday } from "./rrule.js";
export { addDays as addUtcDays, dayIn, daysBetween, instantIn, noonUtc, utcDay } from "./days.js";
export { SOON_DAYS, changeToken, chipFor, nearness, timeIn, whenDayOf, whenOf } from "./nearness.js";
export type { Chip, ChipRow, Nearness } from "./nearness.js";

// 023. The zone list, the city a person reads, and when the strip shows.
export { KNOWN_ZONES, ZONE_REGIONS, knownZones, modernZoneName, zoneCity, zoneStrip, zonesByRegion } from "./zones.js";
export type { ZoneClock, ZoneGroup } from "./zones.js";

// 023. The when field as the sheets hold it, and what a row draws before the
// server answers.
export {
  NOTHING,
  anHourAfter,
  clockLabel,
  drawnWhen,
  patchFor,
  repeatsLabel,
  sameWhen,
  timeHM,
  whenChipLabel,
  whenLabel,
  whenValueOf,
} from "./when.js";
export type { WhenPatch, WhenValue } from "./when.js";

// 024. The ids a phone creates once, and the record row's glyph and tag.
export {
  CHANNELS,
  CHANNEL_REQUESTS,
  CHANNEL_SHARED,
  DIGEST_CHANNEL,
  PEOPLE_CATEGORY,
  PLAIN_CATEGORY,
  VERBS_CATEGORY,
  activityGlyph,
  activityTag,
} from "./notifications.js";
export type { ActivityKind, ActivityReason, ActivityShape, ChannelId } from "./notifications.js";

// 025. Labels: the # token, the #words a message carries, the filter's pick.
export {
  ALL_LABELS,
  countWord,
  hashtagsIn,
  isAll,
  keepLive,
  labelQuery,
  listLabelledCopy,
  nameList,
  foldDraft,
  LABEL_NAME_CHARS,
  pickAll,
  readEveryPage,
  rowLabelledCopy,
  toggleLabel,
  toggleUnlabelled,
} from "./labels.js";
export type { LabelPick } from "./labels.js";
export { dayName, eventPast, eventRange, nextLine, nothingLine, retryDelay, type LineEvent, type WeekStart } from "./today.js";
