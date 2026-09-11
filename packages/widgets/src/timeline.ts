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
/** How often a thing comes round. The words `cadenceLabel` already says. */
export type Repeat = "day" | "weekday" | "week" | "two_weeks" | "month" | "year";

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
   *  are collapsed by a list rather than expanded by this. */
  repeats?: Repeat | null;
  /** When the rule stops, or null for no end stated. */
  until?: string | null;
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
  repeats?: Repeat | null;
  repeatsUntil?: string | null;
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
    repeats?: Repeat | null;
    repeatsUntil?: string | null;
  })[],
  notes: readonly DatedNote[] = [],
): Dated[] {
  const out: Dated[] = [];

  for (const row of rows) {
    const done = row.doneAt !== null;
    if (row.occursAt) {
      const from = localDay(new Date(row.occursAt));
      const end = row.occursEndAt ? localDay(new Date(row.occursEndAt)) : from;
      out.push({
        id: row.id,
        rowId: row.id,
        due: false,
        repeats: row.repeats ?? null,
        until: row.repeatsUntil ? localDay(new Date(row.repeatsUntil)) : null,
        kind: kindOf(row.type),
        from,
        // An end before its start is somebody else's bug, and a rail is not
        // where it gets raised: it draws as the point it started on.
        to: end < from ? from : end,
        done,
      });
    }
    if (row.dueAt) {
      const day = localDay(new Date(row.dueAt));
      out.push({
        id: `${row.id}:due`,
        rowId: row.id,
        due: true,
        kind: kindOf(row.type),
        from: day,
        to: day,
        done,
      });
    }
  }

  for (const note of notes) {
    if (note.occursAt) {
      const from = localDay(new Date(note.occursAt));
      const end = note.occursEndAt ? localDay(new Date(note.occursEndAt)) : from;
      out.push({
        id: note.id,
        rowId: note.id,
        due: false,
        repeats: note.repeats ?? null,
        until: note.repeatsUntil ? localDay(new Date(note.repeatsUntil)) : null,
        kind: "note",
        from,
        to: end < from ? from : end,
        done: false,
      });
    }
    if (note.dueAt) {
      const day = localDay(new Date(note.dueAt));
      out.push({
        id: `${note.id}:due`,
        rowId: note.id,
        due: true,
        kind: "note",
        from: day,
        to: day,
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
    if (!one.repeats) return one.from <= iso && iso <= one.to;
    if (iso < one.from) return false;
    if (one.until && iso > addDays(one.until, spanOf(one))) return false;
    // Walk the rule to the day in question. Bounded like every other walk of
    // one: a rule that cannot reach the day in four hundred steps is not one
    // this day belongs to.
    const length = spanOf(one);
    let at = one.from;
    for (let step = 0; step < REPEAT_LIMIT; step += 1) {
      if (iso >= at && iso <= addDays(at, length)) return true;
      if (at > iso) return false;
      at = nextOccurrence(at, one.repeats, dayAt(one.from).getDate());
    }
    return false;
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

    if (!one.repeats) {
      for (let day = one.from; day <= one.to; day = addDays(day, 1)) put(day, one);
      continue;
    }

    // Every occurrence the window can see. `REPEAT_LIMIT` is the guard on a
    // rule whose first occurrence is years behind the window: it stops, and
    // stopping draws fewer marks rather than hanging.
    const stop = window ? window.to : addDays(one.from, 366);
    const start = window ? window.from : one.from;
    let at = one.from;
    for (let step = 0; step < REPEAT_LIMIT && at <= stop; step += 1) {
      if (one.until && at > one.until) break;
      // Skip the ones behind the window rather than drawing them.
      if (addDays(at, length) >= start) {
        for (let i = 0; i <= length; i += 1) put(addDays(at, i), one);
      }
      at = nextOccurrence(at, one.repeats, dayAt(one.from).getDate());
    }
  }
  return days;
}

/** The next time a rule comes round.
 *
 *  **Month and year clamp rather than roll, and they count from the first
 *  occurrence rather than from the last one.** Monthly from the 31st is the
 *  30th in September and the 31st again in October; letting `Date` roll it
 *  gives 1 October and then every later occurrence is on the 1st, which is a
 *  rule quietly rewriting itself. Clamping is what every calendar does, and
 *  keeping the anchor is what stops February eating the rest of the year.
 */
function nextOccurrence(iso: string, repeats: Repeat, anchorDom: number): string {
  const at = dayAt(iso);
  if (repeats === "day") return addDays(iso, 1);
  if (repeats === "weekday") {
    // Monday to Friday. "Standup every weekday" said `day` before this
    // existed, which put a standup on Sunday.
    let next = addDays(iso, 1);
    while (dayAt(next).getDay() === 0 || dayAt(next).getDay() === 6) next = addDays(next, 1);
    return next;
  }
  if (repeats === "week") return addDays(iso, 7);
  if (repeats === "two_weeks") return addDays(iso, 14);

  const months = repeats === "month" ? 1 : 12;
  const year = at.getFullYear() + (repeats === "year" ? 1 : 0);
  const month = at.getMonth() + (repeats === "month" ? months : 0);
  // Day 0 of the month after is the last day of the month in question.
  const lastDay = new Date(year, month + 1, 0, 12).getDate();
  return localDay(new Date(year, month, Math.min(anchorDom, lastDay), 12));
}

/** How many times one rule may be walked for one window. A year of daily is
 *  365, and past that something is wrong rather than long. */
const REPEAT_LIMIT = 400;

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
  // whatever that span turns out to be.
  const known = [...dotsByDay(dated.filter((one) => !one.repeats)).keys()].sort();
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
  // The span comes from what happens once; a rule fills it rather than
  // stretching it. See `weeksSpanned`.
  const once = [...dotsByDay(dated.filter((one) => !one.repeats)).keys()].sort();
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
