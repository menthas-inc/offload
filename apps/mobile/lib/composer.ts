// The composer's box, and when it is open for height (2026-09-26): the rule is
// the widgets' since the web took it too (2026-10-07).
export { staysOpen } from "@offload/widgets";

/** The field's flex. Across the pill's row it takes the width beside the
 *  controls; in the open column it keeps its own height, since `flex-1` there
 *  starts it at zero and leaves it only what the box's minimum has to spare
 *  (041, on the Pixel: a chip opened the box and the words vanished). */
export function fieldFlex(expanded: boolean): string {
  return expanded ? "" : "flex-1";
}

/** The kit's own twenty, rotated on a ten second fade. Five are shorter than
 *  the kit's so every one stays on one line (2026-09-30). */
export const PLACEHOLDERS = [
  "Dump anything",
  "What's on your mind?",
  "Half a thought is fine",
  "Say it before you forget",
  "Anything, in any order",
  "Throw it in here",
  "No need to tidy it",
  "Paste it, I'll sort it",
  "A link, a photo, a mumble",
  "Tell me the messy version",
  "Something for later",
  "Out of your head, in here",
  "Don't file it, drop it",
  "Several at once is fine",
  "Whatever you're holding",
  "I'll find it a home",
  "Type it badly, it's fine",
  "One line is enough",
  "Where it goes is on me",
  "Give it to me",
];

/** The day's limit, in the field's place. Once the day's model budget is spent
 *  or its turns are used (core-api budget.ts), a dump can only be refused, so
 *  the field is not offered. The refusal's own words and when it comes back;
 *  the limit is a rolling day, so tomorrow is never later than true. */
export const DAY_USED = "Enough for today. Back tomorrow.";

/** Closed when the account said so on load, or a send was refused for it. */
export function closedForTheDay(me: { atDailyLimit: boolean } | null, refused: boolean, pinned = false): boolean {
  if (pinned) return false;
  return refused || Boolean(me?.atDailyLimit);
}
