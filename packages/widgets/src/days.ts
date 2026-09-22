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
