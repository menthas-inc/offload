// Reading a date a model wrote.
//
// **This file exists because of a production failure.** The schema accepted
// only `z.string().datetime()`, which is ISO 8601 with a `Z`, and a model asked
// to file "book a stay in Istanbul, I should do it by next week" wrote
// `2026-09-10`. That is a perfectly good date and the endpoint answered 400,
// the worker retried it three times as though the network had failed, and
// offload told somebody "the task tool seems to be down".
//
// Two lessons, and only one of them is about dates. The other is in
// `worker.py`: a 4xx is a decision, not a blip.
//
// What a model actually writes, in rough order of frequency:
//
//   2026-09-28                    a day, and it means that day, in their zone
//   2026-09-28T09:00:00Z          what the schema wanted
//   2026-09-28T09:00:00+03:00     correct, and previously refused
//   2026-09-28T09:00:00           a time with no zone
//
// All four are accepted. The last is read in the account's zone since 023,
// and in UTC for an account that has none yet, which is what every message
// before this was read in. A bare day is a date, not an instant: it is stored
// at noon UTC and read back as its UTC date on every surface, so it never
// moves when the account's clock does.
//
// **A due date may carry an hour.** "Call the clinic at 9" and "rent by
// Friday" are both tasks, and the first one's hour matters, so the hour is
// optional on every type and `attrs.all_day` is what says whether there is
// one. A comment here used to say a due date has no time anybody expects to
// see; 023 made it wrong.

/** A day, with no time in it. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A time with no zone. Read as UTC, with the caveat above. */
const NAIVE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/;

/** Was this a day with no time in it?
 *
 *  **A bare day is not a time and must never be drawn as one.** 012 already
 *  knew: it flags an all-day calendar event, with a comment saying "an all-day
 *  event is a date, not midnight anywhere. Storing it as a time is how a
 *  birthday lands a day out for half the planet." A dumped date is the same
 *  fact arriving by a different door, and it was stored as a time and drawn as
 *  one, which is how a Sunday brunch read "Saturday, 8:00 PM". */
export function isBareDate(value: string | null | undefined): boolean {
  return typeof value === "string" && DATE_ONLY.test(value.trim());
}

/** Parse, or null if it is not a date at all.
 *
 *  Null rather than throwing: the caller turns it into a refusal the model can
 *  read and correct, which is worth more than an exception it never sees.
 */
export function parseWhen(value: string | null | undefined, zone: string | null = null): Date | null {
  if (value == null) return null;
  const raw = value.trim();
  if (raw === "") return null;

  // A bare day is **noon** UTC on that day, and it was midnight until
  // 2026-09-11.
  //
  // The old comment said midnight rather than local "would put a due date on
  // the wrong side of a boundary for half the world". It is the other way
  // round: midnight UTC is already on the wrong side for everybody west of
  // Greenwich. "Sunday brunch" filed as `2026-09-13` is `00:00Z`, which in New
  // York is Saturday at 8pm, and that is exactly how it was found, sitting
  // under Saturday on a thread's timeline with the word Sunday in its title.
  //
  // Noon UTC is a storage convention, not an instant anybody reads: since 023
  // every reader takes an all-day row's date from this instant's UTC date
  // rather than converting it into a zone, so the 25th is the 25th in Lisbon,
  // Tokyo and Auckland alike, and it never moves when the account's clock
  // does. That is what fixed New Zealand, not the zone the account now has.
  if (DATE_ONLY.test(raw)) {
    const at = new Date(`${raw}T12:00:00.000Z`);
    return Number.isNaN(at.getTime()) ? null : at;
  }

  if (NAIVE.test(raw)) return instantIn(raw, zone);

  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;

  // A model that writes "next Tuesday" into a date field has not written a
  // date, and `new Date` is generous enough to turn some prose into a real
  // timestamp on some runtimes. Anything that does not start with a year is
  // refused rather than guessed at, because a wrong date on somebody's agenda
  // is worse than no date.
  if (!/^\d{4}-/.test(raw)) return null;

  return at;
}

/** How far ahead a date may be.
 *
 *  A model reading "the 3rd" with no year can land a century out, and a task
 *  due in 2126 is invisible rather than wrong-looking: it sorts to the bottom
 *  of everything forever and nobody ever sees it to correct it. */
const MAX_YEARS_AHEAD = 10;
const MAX_YEARS_BEHIND = 5;

export function plausible(at: Date, now = new Date()): boolean {
  const years = (at.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000);
  return years < MAX_YEARS_AHEAD && years > -MAX_YEARS_BEHIND;
}

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
