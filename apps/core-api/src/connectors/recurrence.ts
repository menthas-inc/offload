// Editing something that repeats, without ever asking a three-way question.
//
// **Scope is an argument, never a dialog.** "Move this week's standup" is one
// occurrence and "standup is at 3pm from now on" is this and all following;
// that distinction is already in the sentence and reading it is what the model
// is for. On a screen, where there is no sentence, it is one occurrence and the
// other is a control beside it.
//
// **One occurrence is the default**, because its blast radius is one day and
// repeating it is easy, where the opposite mistake silently rewrites a year of
// somebody's calendar.

export type Scope = "one" | "following";

/** `UNTIL` must be a UTC timestamp with no punctuation, and it is exclusive of
 *  the occurrence it names, so the split point itself belongs to the new
 *  series rather than the old one. A second either way here is an occurrence
 *  that exists twice or not at all. */
export function untilFor(splitAt: Date): string {
  const before = new Date(splitAt.getTime() - 1000);
  return before.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Put `UNTIL` on an existing rule, replacing one if it is already there.
 *
 *  `COUNT` and `UNTIL` cannot both be present, so a rule that counts loses the
 *  count: it is being given an end date instead, which is the same intent
 *  expressed the way this split needs. An all-day series ends on a date, the
 *  day before the split, because a rule's end must be the same kind of value
 *  as its start. */
export function truncate(recurrence: string[], splitAt: Date, allDay = false): string[] {
  const until = allDay ? untilFor(splitAt).slice(0, 8) : untilFor(splitAt);
  return recurrence.map((line) => {
    if (!line.startsWith("RRULE:")) return line;
    const parts = line
      .slice("RRULE:".length)
      .split(";")
      .filter((part) => part && !part.startsWith("UNTIL=") && !part.startsWith("COUNT="));
    return `RRULE:${[...parts, `UNTIL=${until}`].join(";")}`;
  });
}
