// The rail: a thread's dates as weeks, and the day underneath it.
//
// Shared because three surfaces draw the same thing and two of them are a
// phone. Everything here is arithmetic over rows the page already fetched: the
// timeline has no query, no index and no fetch of its own, which is 007's rule
// about widgets applied to something that is no longer one.
//
// **Dates are local, and that is why they are strings.** `occurs_at` is a
// timestamp and the day somebody sees it on is the day in their own zone. Every
// comparison here is on `YYYY-MM-DD` produced from the local date, so an event
// at 23:00 is on the day it looks like rather than on the next one in UTC. That
// is the defect that would ship quietly: right for most of the day, in most of
// the world, wrong in the evening in Lisbon.

import type { Sortable } from "./index.js";

export type WeekStart = "monday" | "sunday";

/** What a dot is. Colour says which, and colour is never the only thing that
 *  says it: see the day's accessible name. */
export type DatedKind = "task" | "event" | "note" | "other";

/** One thing with a date, whichever store it came from.
 *
 *  A range rather than a point, because a thing that spans days has a dot on
 *  every day it covers and the loop that draws them needs both ends. */
export interface Dated {
  /** The row's own id, or `<id>:due` for the day it is wanted by.
   *
   *  **A row with both is two entries and they are two facts**, so a caller
   *  drawing a day has to know which one it matched: showing the occurrence's
   *  time on the due day says the thing happens on a day it does not. */
  id: string;
  /** The row this came from, without the `:due` suffix. */
  rowId: string;
  /** Whether this entry is the day it is wanted by rather than the day it
   *  happens. */
  due: boolean;
  kind: DatedKind;
  /** Inclusive, `YYYY-MM-DD`. `to` equals `from` for a point in time. */
  from: string;
  to: string;
  done: boolean;
  /** That it comes round again.
   *
   *  **The rule, not the occurrences.** One row carries it and the calendar
   *  expands it over whatever window is on screen, so a weekly class is one
   *  line in a list and a mark on every Tuesday. A calendar's own repeats come
   *  the other way, as rows that already exist sharing a `seriesRef`, and those
   *  are collapsed by a list rather than expanded by this. Parsed once here,
   *  since 023 made it an RFC 5545 rule, and its end is inside it. */
  rule?: Rule | null;
}

export interface Dot {
  kind: DatedKind;
  done: boolean;
}

export interface Day {
  iso: string;
  dom: number;
  /** Two letters, from the locale, so the rail reads in the reader's language. */
  dow: string;
  today: boolean;
  past: boolean;
  dots: Dot[];
  /** Everything on the day, whether or not it got a dot. `dots` is capped for
   *  drawing and this is not, so the accessible name can tell the truth. */
  count: number;
}

export interface RailRow {
  key: string;
  days: Day[];
}

/** Four, and a fifth day's worth drawn as a count.
 *
 *  Eleven dots in a 40px cell is a smudge rather than information, and nothing
 *  is hidden by the cap: the day's name says the number and opening it shows
 *  every one. */
export const MAX_DOTS = 4;

/** Past this many weeks the rail stops being a rail.
 *
 *  A span of a few weeks reads as time passing, which is the whole point of
 *  drawing the empty days. A span of a year does not: it is a scroll, and the
 *  answer to it is the shape everybody already knows, a month at a time with a
 *  way to step through them. **This replaced a collapsed run of empty weeks**,
 *  which was a device for making a year of nothing short rather than for making
 *  it navigable. */
export const WEEKS_BEFORE_MONTHS = 6;

import { dayIn, utcDay } from "./days.js";
import { occurrencesIn, parseRule, type Rule } from "./rrule.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The local calendar day a timestamp falls on, as `YYYY-MM-DD`.
 *
 *  Built from the local getters rather than from `toISOString`, which is UTC
 *  and is the whole point of this function existing. */
export function localDay(at: Date): string {
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${at.getFullYear()}-${month}-${day}`;
}

/** A `YYYY-MM-DD` back to a Date at local noon.
 *
 *  Noon rather than midnight so that adding days never lands on the hour a
 *  daylight saving change removes, which is how a rail loses a Sunday twice a
 *  year. */
export function dayAt(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function addDays(iso: string, days: number): string {
  return localDay(new Date(dayAt(iso).getTime() + days * DAY_MS));
}

function startOfWeek(iso: string, weekStart: WeekStart): string {
  const at = dayAt(iso);
  const offset = weekStart === "monday" ? (at.getDay() + 6) % 7 : at.getDay();
  return addDays(iso, -offset);
}

/** What kind of dot a row draws.
 *
 *  `note` is 014's, and it is the reason this takes two lists: a note is not a
 *  content row and both of them are on the rail. */
function kindOf(type: string): DatedKind {
  if (type === "task") return "task";
  if (type === "event") return "event";
  return "other";
}

/** The least a note has to be to land on the rail. */
export interface DatedNote {
  id: string;
  occursAt: string | null;
  occursEndAt: string | null;
  dueAt: string | null;
  rrule?: string | null;
  /** The date carries no time, so it is read as a date in no zone at all. */
  allDay?: boolean;
}

/** Everything on this thread that has a date, in one shape.
 *
 *  **A row with both a due date and an occurrence is two entries.** They are two
 *  facts: the day it happens and the day it is wanted by, and putting one of
 *  them on the calendar and not the other is choosing for somebody.
 *
 *  Archived rows never arrive here: the page filters them, which is what
 *  archive means. Muted notes do arrive, because muting stops a note reaching
 *  the model and has nothing to say about a screen.
 */
export function datedFor(
  rows: readonly (Sortable & {
    occursEndAt?: string | null;
    dueAt?: string | null;
    rrule?: string | null;
    allDay?: boolean;
  })[],
  notes: readonly DatedNote[] = [],
  /** The account's clock. A timed row lands on the day it happens in this
   *  zone; a bare day is a date and lands on itself wherever it is read. */
  zone: string | null = null,
): Dated[] {
  const out: Dated[] = [];
  const day = (at: string, allDay: boolean | undefined): string =>
    allDay ? utcDay(new Date(at)) : dayIn(new Date(at), zone);
  const ruleOf = (text: string | null | undefined): Rule | null => {
    if (!text) return null;
    const parsed = parseRule(text);
    return parsed.ok ? parsed.rule : null;
  };

  for (const row of rows) {
    const done = row.doneAt !== null;
    // A rule anchors on the type's column: an event when it happens,
    // everything else when it is wanted by (023).
    const rule = ruleOf(row.rrule);
    if (row.occursAt) {
      const from = day(row.occursAt, row.allDay);
      const end = row.occursEndAt ? day(row.occursEndAt, row.allDay) : from;
      out.push({
        id: row.id,
        rowId: row.id,
        due: false,
        rule: row.type === "event" ? rule : null,
        kind: kindOf(row.type),
        from,
        // An end before its start is somebody else's bug, and a rail is not
        // where it gets raised: it draws as the point it started on.
        to: end < from ? from : end,
        done,
      });
    }
    if (row.dueAt) {
      const when = day(row.dueAt, row.allDay);
      out.push({
        id: `${row.id}:due`,
        rowId: row.id,
        due: true,
        rule: row.type === "event" ? null : rule,
        kind: kindOf(row.type),
        from: when,
        to: when,
        done,
      });
    }
  }

  for (const note of notes) {
    if (note.occursAt) {
      const from = day(note.occursAt, note.allDay);
      const end = note.occursEndAt ? day(note.occursEndAt, note.allDay) : from;
      out.push({
        id: note.id,
        rowId: note.id,
        due: false,
        rule: ruleOf(note.rrule),
        kind: "note",
        from,
        to: end < from ? from : end,
        done: false,
      });
    }
    if (note.dueAt) {
      const when = day(note.dueAt, note.allDay);
      out.push({
        id: `${note.id}:due`,
        rowId: note.id,
        due: true,
        kind: "note",
        from: when,
        to: when,
        done: false,
      });
    }
  }

  return out;
}

/** What is on a given day, in the order the thread holds it.
 *
 *  The entries rather than the ids, because a caller drawing the day needs to
 *  know which fact put each thing there: the same row can be on two days, once
 *  because it happens and once because it is wanted by then. */
export function thingsOn(dated: readonly Dated[], iso: string): Dated[] {
  return dated.filter((one) => {
    if (!one.rule) return one.from <= iso && iso <= one.to;
    if (iso < one.from) return false;
    // Straight to the day in question rather than walking there from whenever
    // the rule began, so an old rule still answers for today.
    const length = spanOf(one);
    return occurrencesIn(one.rule, one.from, addDays(iso, -length), iso).some(
      (at) => iso >= at && iso <= addDays(at, length),
    );
  });
}

/** How many days one occurrence covers. */
function spanOf(one: Dated): number {
  return Math.round((dayAt(one.to).getTime() - dayAt(one.from).getTime()) / DAY_MS);
}

/** Every day that carries something, as a map from day to its dots.
 *
 *  A span fills every day between its ends, inclusive, which is why this is a
 *  loop rather than a lookup.
 */
function dotsByDay(
  dated: readonly Dated[],
  /** The window being drawn. A rule with no end would otherwise run forever,
   *  and a rule that started in 2020 would be walked a thousand times to reach
   *  this week. */
  window?: { from: string; to: string },
): Map<string, Dot[]> {
  const days = new Map<string, Dot[]>();
  const put = (day: string, one: Dated): void => {
    const held = days.get(day);
    if (held) held.push({ kind: one.kind, done: one.done });
    else days.set(day, [{ kind: one.kind, done: one.done }]);
  };

  for (const one of dated) {
    const length = Math.round(
      (dayAt(one.to).getTime() - dayAt(one.from).getTime()) / DAY_MS,
    );

    if (!one.rule) {
      for (let day = one.from; day <= one.to; day = addDays(day, 1)) put(day, one);
      continue;
    }

    // Every occurrence the window can see, starting at the window rather than
    // walking to it from whenever the rule began. The expander bounds the
    // walk at 400 per call, which bounds the window and never the rule's age.
    const stop = window ? window.to : addDays(one.from, 366);
    const start = window ? window.from : one.from;
    for (const at of occurrencesIn(one.rule, one.from, addDays(start, -length), stop)) {
      for (let i = 0; i <= length; i += 1) put(addDays(at, i), one);
    }
  }
  return days;
}

function dayAtIso(
  iso: string,
  days: Map<string, Dot[]>,
  today: string,
  short: Intl.DateTimeFormat,
): Day {
  const dots = days.get(iso) ?? [];
  const at = dayAt(iso);
  return {
    iso,
    dom: at.getDate(),
    dow: short.format(at),
    today: iso === today,
    past: iso < today,
    dots: dots.slice(0, MAX_DOTS),
    count: dots.length,
  };
}

/** What the span is made of: everything that happens once as it is, and a
 *  repeating thing as its first day alone, and only while that day is still
 *  ahead. A rule that began two years ago has nothing left to reach; the days
 *  it has already filled are not a span to draw back to. */
function firstDays(dated: readonly Dated[], today: string): Dated[] {
  return dated.flatMap((one) => {
    if (!one.rule) return [one];
    return one.from >= today ? [{ ...one, rule: null, to: one.from }] : [];
  });
}

/** How many whole weeks the thread's dates span, today included.
 *
 *  What decides whether the rail draws weeks or a month. */
export function weeksSpanned(
  dated: readonly Dated[],
  today: string,
  weekStart: WeekStart = "monday",
): number {
  // **A rule does not stretch the span.** "Every Tuesday" with no end would
  // otherwise make every thread a year long and push it into the month view
  // forever. The span comes from things that happen once, and the rule fills
  // whatever that span turns out to be. Its first day counts, though: a task
  // due next Wednesday that gains "every week" is still due next Wednesday,
  // and it lost its week and its dot until 023 said so; a first day already
  // behind today does not draw the rail back to it.
  const known = [...dotsByDay(firstDays(dated, today)).keys()].sort();
  const first = startOfWeek(known[0] && known[0] < today ? known[0] : today, weekStart);
  const lastKnown = known[known.length - 1];
  const last = startOfWeek(lastKnown && lastKnown > today ? lastKnown : today, weekStart);
  return Math.round((dayAt(last).getTime() - dayAt(first).getTime()) / (7 * DAY_MS)) + 1;
}

/** The rail, as weeks.
 *
 *  Whole weeks from the earliest dated thing to the latest, always containing
 *  today, so a thread with nothing dated draws this week and a thread with one
 *  thing draws the weeks between here and it.
 *
 *  Used while the span is short. Past `WEEKS_BEFORE_MONTHS` the caller draws
 *  `monthFor` instead, because a year of weeks is a scroll rather than a shape.
 */
export function railFor(
  dated: readonly Dated[],
  today: string,
  weekStart: WeekStart = "monday",
  locale?: string,
): RailRow[] {
  // The span comes from what happens once, and from a rule's first day; a
  // rule's later occurrences fill it rather than stretching it. See
  // `weeksSpanned`.
  const once = [...dotsByDay(firstDays(dated, today)).keys()].sort();
  const first = startOfWeek(once[0] && once[0] < today ? once[0] : today, weekStart);
  const lastOnce = once[once.length - 1];
  const lastDay = lastOnce && lastOnce > today ? lastOnce : today;
  const last = addDays(startOfWeek(lastDay, weekStart), 6);

  const days = dotsByDay(dated, { from: first, to: last });

  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const rows: RailRow[] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    rows.push({
      key: start,
      days: Array.from({ length: 7 }, (_, i) =>
        dayAtIso(addDays(start, i), days, today, short),
      ),
    });
  }
  return rows;
}

/** One month, as a calendar.
 *
 *  Whole weeks, so the first and last rows carry days from the months either
 *  side. Those are drawn rather than blanked: a month that starts on a Thursday
 *  with three empty cells in front of it reads as a hole, and the days there
 *  are real days somebody may want.
 */
export interface Month {
  /** The first of the month, `YYYY-MM-DD`. What prev and next step by. */
  key: string;
  /** "September 2026", in the reader's language. */
  label: string;
  weeks: RailRow[];
  /** Whether a day belongs to this month rather than to the weeks either side. */
  inMonth: (iso: string) => boolean;
}

export function monthFor(
  anchor: string,
  dated: readonly Dated[],
  today: string,
  weekStart: WeekStart = "monday",
  locale?: string,
): Month {
  const at = dayAt(anchor);
  const first = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(at.getFullYear(), at.getMonth() + 1, 1, 12);
  const last = localDay(new Date(nextMonth.getTime() - DAY_MS));

  const days = dotsByDay(dated, {
    from: startOfWeek(first, weekStart),
    to: addDays(startOfWeek(last, weekStart), 6),
  });
  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weeks: RailRow[] = [];
  for (
    let start = startOfWeek(first, weekStart);
    start <= startOfWeek(last, weekStart);
    start = addDays(start, 7)
  ) {
    weeks.push({
      key: start,
      days: Array.from({ length: 7 }, (_, i) =>
        dayAtIso(addDays(start, i), days, today, short),
      ),
    });
  }

  const month = at.getMonth();
  const year = at.getFullYear();
  return {
    key: first,
    label: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(at),
    weeks,
    inMonth: (iso) => {
      const day = dayAt(iso);
      return day.getMonth() === month && day.getFullYear() === year;
    },
  };
}

/** The month before or after this one, as an anchor `monthFor` takes. */
export function stepMonth(anchor: string, by: -1 | 1): string {
  const at = dayAt(anchor);
  const moved = new Date(at.getFullYear(), at.getMonth() + by, 1, 12);
  return localDay(moved);
}

/** What a day card is called, for somebody who cannot see the dots.
 *
 *  Counts in words, because colour is the fast read and never the only one. */
export function dayLabel(day: Day, locale?: string): string {
  const full = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dayAt(day.iso));

  if (day.count === 0) return `${full}, nothing on`;

  const counts = new Map<DatedKind, number>();
  for (const dot of day.dots) counts.set(dot.kind, (counts.get(dot.kind) ?? 0) + 1);
  const words: Record<DatedKind, [string, string]> = {
    task: ["to do", "to do"],
    event: ["event", "events"],
    note: ["note", "notes"],
    other: ["thing", "things"],
  };
  const parts = [...counts.entries()].map(
    ([kind, n]) => `${n} ${n === 1 ? words[kind][0] : words[kind][1]}`,
  );
  // Past the dot cap the parts describe what is drawn, so the total goes with
  // them rather than being implied by a number that stopped at four.
  const extra = day.count > day.dots.length ? `, ${day.count} in all` : "";
  return `${full}, ${parts.join(", ")}${extra}`;
}
