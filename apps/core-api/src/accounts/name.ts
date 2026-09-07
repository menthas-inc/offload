// What a display name is allowed to be.
//
// **One rule, three callers**, for the same reason `initialsOf` moved here: the
// sign-in backfill, the last screen of first run and the settings endpoint all
// write this column, and three trims is three chances to disagree about a
// trailing space. A name that arrives one way and a name that arrives another
// have to be the same name.
//
// Any character. People's names contain apostrophes, hyphens, accents, spaces
// and scripts this product has no business having opinions about, so the only
// limits are that there is something there and that it is not a paragraph.

/** The longest a name may be, after trimming. Past every real name and short of
 *  a sentence. */
export const NAME_MAX = 60;

/** A name as it is allowed to be stored, or null when nothing is left.
 *
 *  Null rather than an empty string, because the column's null is what "nobody
 *  has set one" means everywhere else: `/api/me` returns it, the avatar draws
 *  `?` and a shared thread says "Someone". An empty string would be a fourth
 *  state that renders as none of those. */
export function cleanName(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed.length === 0 || trimmed.length > NAME_MAX ? null : trimmed;
}

/** The same rule, for the one caller that cannot refuse.
 *
 *  A person typing sixty-one characters is told. A provider handing back
 *  something too long is not an error anybody can act on, so it is cut rather
 *  than dropped: the alternative is a first-run field that is mysteriously
 *  empty for one person in a thousand. */
export function cleanNameLossy(raw: string | null | undefined): string | null {
  return cleanName((raw ?? "").trim().slice(0, NAME_MAX));
}
