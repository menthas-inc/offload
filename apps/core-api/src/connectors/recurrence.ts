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
 *  expressed the way this split needs. */
export function truncate(recurrence: string[], splitAt: Date): string[] {
  const until = untilFor(splitAt);
  return recurrence.map((line) => {
    if (!line.startsWith("RRULE:")) return line;
    const parts = line
      .slice("RRULE:".length)
      .split(";")
      .filter((part) => part && !part.startsWith("UNTIL=") && !part.startsWith("COUNT="));
    return `RRULE:${[...parts, `UNTIL=${until}`].join(";")}`;
  });
}

/** A deterministic id for the series a split creates.
 *
 *  **A split is two calls and can fail between them.** Ordered new-series-first
 *  so a failure leaves a visible duplicate rather than a silent hole: a missing
 *  standup is neither obvious nor fixable, and a duplicate is both. This id is
 *  what lets a retry recognise its own work instead of posting a third one. */
export function splitUid(originalUid: string, splitAt: Date): string {
  return `offload-${splitAt.toISOString().slice(0, 19).replace(/[-:]/g, "")}-${originalUid}`;
}
