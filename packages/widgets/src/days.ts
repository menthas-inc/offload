// Day arithmetic that no device's zone can bend.
//
// A day here is a `YYYY-MM-DD` string. Everything below works on the UTC noon
// of that day, so adding a day never crosses a daylight saving hour and the
// zone the code happens to run in never enters into it. `timeline.ts` keeps
// its own local-noon helpers for the rail, which are the same arithmetic in
// the device's own zone; these exist for the rule, which is drawn on the
// server as well as on three clients and has to agree everywhere.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar date of an instant. What an all-day row's date is: 023
 *  stores a bare day at noon UTC and reads it back as a date, so it never
 *  moves when the account's clock does. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The calendar date of an instant in a zone, `YYYY-MM-DD`. The account's
 *  clock for a timed row. Falls back to the UTC date when the runtime does not
 *  know the zone, which is what every date was drawn in before 023. */
export function dayIn(at: Date, zone: string | null | undefined): string {
  if (!zone) return utcDay(at);
  try {
    // en-CA formats as YYYY-MM-DD, which is the one locale whose default
    // order is the string every other function here reads.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return utcDay(at);
  }
}

/** A day as the instant of its UTC noon. */
export function noonUtc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0));
}

export function addDays(day: string, n: number): string {
  return utcDay(new Date(noonUtc(day).getTime() + n * DAY_MS));
}

/** Whole days from `a` to `b`, negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((noonUtc(b).getTime() - noonUtc(a).getTime()) / DAY_MS);
}

/** 0 is Monday, 6 is Sunday. */
export function weekdayIndex(day: string): number {
  return (noonUtc(day).getUTCDay() + 6) % 7;
}

export function partsOf(day: string): { year: number; month: number; dom: number } {
  const at = noonUtc(day);
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, dom: at.getUTCDate() };
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
}

export function dayOf(year: number, month: number, dom: number): string {
  return utcDay(new Date(Date.UTC(year, month - 1, dom, 12)));
}

// 023. A wall time in a zone, moved here from the server's dates module so
// a client can draw the instant it just asked for exactly as the route reads it.
/** A wall time in a zone, as the instant it names.
 *
 *  `2026-09-25T09:00` in Europe/Lisbon is 08:00Z in September and 09:00Z in
 *  November, and this is the only place that arithmetic lives. Two passes
 *  through the zone's offset, because the offset at the naive guess and the
 *  offset at the answer differ across a clock change; a time inside a missing
 *  hour lands on the instant after it, which is what every calendar does.
 *  With no zone the wall time is UTC, as before 023. */
export function instantIn(naive: string, zone: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(naive.trim());
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map((part) => Number(part ?? 0));
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!, s ?? 0);
  if (Number.isNaN(guess)) return null;
  if (!zone) return new Date(guess);

  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return new Date(guess);
  }
  const offsetAt = (at: number): number => {
    const parts = Object.fromEntries(format.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
    const wall = Date.UTC(
      Number(parts["year"]),
      Number(parts["month"]) - 1,
      Number(parts["day"]),
      Number(parts["hour"]) % 24,
      Number(parts["minute"]),
      Number(parts["second"]),
    );
    return wall - at;
  };
  let at = guess - offsetAt(guess);
  at = guess - offsetAt(at);
  return new Date(at);
}

/** 028. When a loose thing was put down, as its meta line says it: today,
 *  yesterday, the weekday within the week, then the date. A date rather than
 *  "last week", which says less than the day it stands for. One wording, so a
 *  row reads the same on the phones and the web. */
export function putDown(day: string, today: string): string {
  if (day === today) return "today";
  if (day === addDays(today, -1)) return "yesterday";
  const ago = daysBetween(day, today);
  if (ago > 1 && ago < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: "UTC" }).format(noonUtc(day));
  }
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).format(noonUtc(day));
}
