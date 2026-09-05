// Tags, and the one rule that makes grouping possible.
//
// A tag is either `dimension:value` or a bare value whose dimension is
// implicitly `tag`. That is what lets a thread say "group this list by city"
// and get an answer: a flat tag list cannot, because a row tagged `alfama`,
// `booking` and `urgent` offers three groupings and no way to choose.
//
// Everything here happens at write time, in the Core API, not in the prompt.
// A model producing `City:Alfama` on Monday and `city: alfama` on Tuesday makes
// two groups out of one place, and asking it nicely not to is not a mechanism.

/** Six is generous for one piece of content and finite. */
export const MAX_TAGS = 6;

/** Dimension plus value plus the colon. */
export const TAG_CHARS = 48;

/** `parseTag`, `dimensionsIn` and `Tag` live in `@offload/widgets` now, because
 *  `groupBy` needs them and four clients holding four copies of "what does
 *  city:alfama mean" is the drift this repo keeps paying for. Re-exported here
 *  so every existing import site still resolves. */
import { parseTag } from "@offload/widgets";

export { dimensionsIn, parseTag, type Tag } from "@offload/widgets";

export class BadTags extends Error {
  constructor(readonly reason: "too_many" | "too_long" | "empty" | "duplicate_dimension") {
    super(reason);
  }
}

/** Normalise and validate a whole set.
 *
 *  Throws rather than dropping. A tag silently discarded is a grouping that
 *  silently does not happen, and the model gets the refusal back and can fix
 *  it, which it cannot do with a value that vanished.
 */
export function normaliseTags(raw: readonly string[]): string[] {
  if (raw.length > MAX_TAGS) throw new BadTags("too_many");

  const seen = new Map<string, string>();
  const out: string[] = [];

  for (const item of raw) {
    const { dimension, value } = parseTag(item);
    const d = dimension.trim().toLowerCase();
    const v = value.trim().toLowerCase();

    if (!d || !v) throw new BadTags("empty");

    const tag = d === "tag" ? v : `${d}:${v}`;
    if (tag.length > TAG_CHARS) throw new BadTags("too_long");

    // One value per dimension, and the bare dimension is exempt: `receipt` and
    // `urgent` are both `tag:` and both belong. A second `city:` is refused
    // rather than appended, because a row under two headings has to be
    // reconciled by eye every time somebody reads the list.
    if (d !== "tag") {
      const already = seen.get(d);
      if (already !== undefined && already !== v) throw new BadTags("duplicate_dimension");
      seen.set(d, v);
    }

    if (!out.includes(tag)) out.push(tag);
  }

  return out;
}
