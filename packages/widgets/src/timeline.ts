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

export type RailRow =
  | { row: "week"; key: string; days: Day[] }
  | { row: "gap"; key: string; weeks: number; from: string; to: string };

/** Four, and a fifth day's worth drawn as a count.
 *
 *  Eleven dots in a 40px cell is a smudge rather than information, and nothing
 *  is hidden by the cap: the day's name says the number and opening it shows
 *  every one. */
export const MAX_DOTS = 4;

/** Three, because two empty weeks is information and fifty is furniture. */
export const GAP_WEEKS = 3;

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
  return dated.filter((one) => one.from <= iso && iso <= one.to);
}

/** The rail.
 *
 *  Whole weeks from the earliest dated thing to the latest, always containing
 *  today, so a thread with nothing dated draws this week and a thread with one
 *  thing draws the weeks between here and it.
 *
 *  **Runs of empty weeks collapse.** A note dated a year out would otherwise
 *  draw fifty empty rows between here and there, which is the passage of time
 *  rendered as scrolling.
 */
export function railFor(
  dated: readonly Dated[],
  today: string,
  weekStart: WeekStart = "monday",
  locale?: string,
): RailRow[] {
  const days = new Map<string, Dot[]>();
  for (const one of dated) {
    // Every day it covers, inclusive. A span is why this is a loop.
    for (let day = one.from; day <= one.to; day = addDays(day, 1)) {
      const held = days.get(day);
      if (held) held.push({ kind: one.kind, done: one.done });
      else days.set(day, [{ kind: one.kind, done: one.done }]);
    }
  }

  const known = [...days.keys()].sort();
  const first = startOfWeek(known[0] && known[0] < today ? known[0] : today, weekStart);
  const lastKnown = known[known.length - 1];
  const lastDay = lastKnown && lastKnown > today ? lastKnown : today;
  const last = addDays(startOfWeek(lastDay, weekStart), 6);

  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });

  const weeks: { key: string; days: Day[]; empty: boolean }[] = [];
  for (let start = first; start <= last; start = addDays(start, 7)) {
    const week: Day[] = [];
    let empty = true;
    for (let i = 0; i < 7; i += 1) {
      const iso = addDays(start, i);
      const dots = days.get(iso) ?? [];
      if (dots.length > 0) empty = false;
      const at = dayAt(iso);
      week.push({
        iso,
        dom: at.getDate(),
        dow: short.format(at),
        today: iso === today,
        past: iso < today,
        dots: dots.slice(0, MAX_DOTS),
        count: dots.length,
      });
    }
    // A week holding today is never empty for this purpose: collapsing the one
    // you are standing in is how somebody loses their place.
    weeks.push({ key: start, days: week, empty: empty && !week.some((day) => day.today) });
  }

  const rows: RailRow[] = [];
  let run: typeof weeks = [];

  const flush = (): void => {
    if (run.length === 0) return;
    if (run.length >= GAP_WEEKS) {
      rows.push({
        row: "gap",
        key: `gap-${run[0]!.key}`,
        weeks: run.length,
        from: run[0]!.key,
        to: run[run.length - 1]!.days[6]!.iso,
      });
    } else {
      for (const week of run) rows.push({ row: "week", key: week.key, days: week.days });
    }
    run = [];
  };

  for (const week of weeks) {
    if (week.empty) run.push(week);
    else {
      flush();
      rows.push({ row: "week", key: week.key, days: week.days });
    }
  }
  flush();

  return rows;
}

/** The weeks a gap row stands for, when somebody opens it.
 *
 *  **They take `today` like every other day does.** This wrote `past: true` on
 *  all of them, which is right for the gap behind you and wrong for the one in
 *  front: a note dated two years out is the headline case for collapsing a run,
 *  and opening it drew two years of future weeks as gone. Empty, always: a gap
 *  row only ever stands for weeks with nothing in them. */
export function weeksIn(
  gap: { from: string; to: string },
  today: string,
  locale?: string,
): RailRow[] {
  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const rows: RailRow[] = [];
  for (let start = gap.from; start <= gap.to; start = addDays(start, 7)) {
    const days: Day[] = [];
    for (let i = 0; i < 7; i += 1) {
      const iso = addDays(start, i);
      const at = dayAt(iso);
      days.push({
        iso,
        dom: at.getDate(),
        dow: short.format(at),
        today: iso === today,
        past: iso < today,
        dots: [],
        count: 0,
      });
    }
    rows.push({ row: "week", key: start, days });
  }
  return rows;
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
