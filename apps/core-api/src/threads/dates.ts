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
// All four are accepted. The last is read as UTC, which is wrong for somebody
// dumping late at night in Lisbon and is the same gap the prompt's "today" has:
// `accounts` carries no timezone yet, and when it does this is one of the two
// places that changes.

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
export function parseWhen(value: string | null | undefined): Date | null {
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
  // Noon is the standard answer and it is not a complete one. It is right from
  // UTC-11 to UTC+11, which is everywhere anybody uses this, and it is still
  // wrong in New Zealand. **The complete answer is the account's timezone**,
  // which `accounts` does not carry yet; this file is one of the two places
  // that changes when it does, and the other is the prompt's "today".
  if (DATE_ONLY.test(raw)) {
    const at = new Date(`${raw}T12:00:00.000Z`);
    return Number.isNaN(at.getTime()) ? null : at;
  }

  if (NAIVE.test(raw)) {
    const at = new Date(`${raw.replace(" ", "T")}Z`);
    return Number.isNaN(at.getTime()) ? null : at;
  }

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
