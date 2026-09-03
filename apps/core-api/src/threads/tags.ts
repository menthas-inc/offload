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

export class BadTags extends Error {
  constructor(readonly reason: "too_many" | "too_long" | "empty" | "duplicate_dimension") {
    super(reason);
  }
}

export interface Tag {
  dimension: string;
  value: string;
}

/** Split a tag without deciding whether it is valid. A bare tag takes the
 *  implicit dimension, so everything offload already produces is groupable
 *  without a migration. */
export function parseTag(raw: string): Tag {
  const at = raw.indexOf(":");
  if (at < 0) return { dimension: "tag", value: raw };
  return { dimension: raw.slice(0, at), value: raw.slice(at + 1) };
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

/** Which dimensions a set of rows actually uses, in the order they first
 *  appear.
 *
 *  A scan over rows already in memory, not a query. A GIN index on `text[]`
 *  indexes whole elements and not the prefix before a colon, so an indexed
 *  answer would need a different structure, and 001's heavy case is 500 rows in
 *  one thread, which is a page the screen has already fetched. Stated because
 *  "how would you enumerate these" is the question this design has to survive.
 */
export function dimensionsIn(rows: readonly { tags: string[] }[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const tag of row.tags) {
      const { dimension } = parseTag(tag);
      if (dimension !== "tag" && !out.includes(dimension)) out.push(dimension);
    }
  }
  return out;
}
