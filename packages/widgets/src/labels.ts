// 025. Labels: the rules every surface shares.
//
// The `#` token a composer is typing, the #words a sent message carries, and
// the filter bar's pick. The server reads a Today dump's #words with the same
// function the composers type them with, so a word the phone treated as a
// label is the word the server applies.

/** A #word is a label's name only at the start of the text or after
 *  whitespace, and only when a letter follows the `#`: `#3` is a number and
 *  `a#b` is not a word start. Letters, digits, `-` and `_` after that. */
const HASHTAG = /(?:^|\s)#(\p{L}[\p{L}\p{N}_-]*)/gu;

/** The #words in a sent message, each once, in the order they appear, case
 *  kept from the first time. */
export function hashtagsIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(HASHTAG)) {
    const word = match[1]!;
    if (!out.some((seen) => seen.toLowerCase() === word.toLowerCase())) out.push(word);
  }
  return out;
}

/** The `#` token at the end of a draft, as `@` reads its own: what has been
 *  typed after the `#`, empty for a bare `#`, or null when the draft does not
 *  end in one. */
export function labelQuery(draft: string): string | null {
  const match = /(?:^|\s)#([\p{L}\p{N}_-]*)$/u.exec(draft);
  if (!match) return null;
  const typed = match[1]!;
  // A letter first, as a sent #word needs; `#3` is a number being typed.
  if (typed.length > 0 && !/^\p{L}/u.test(typed)) return null;
  return typed;
}

/** The filter bar's pick. Empty with `none` false is All. Either logic: a row
 *  shows when it carries any picked label, or none when `none` is set. */
export interface LabelPick {
  labels: string[];
  none: boolean;
}

export const ALL_LABELS: LabelPick = { labels: [], none: false };

export const isAll = (pick: LabelPick): boolean => pick.labels.length === 0 && !pick.none;

export const pickAll = (): LabelPick => ({ labels: [], none: false });

export function toggleLabel(pick: LabelPick, id: string): LabelPick {
  const labels = pick.labels.includes(id) ? pick.labels.filter((one) => one !== id) : [...pick.labels, id];
  return { labels, none: pick.none };
}

export function toggleUnlabelled(pick: LabelPick): LabelPick {
  return { labels: pick.labels, none: !pick.none };
}

/** A kept pick, less the labels that no longer exist. With none left and No
 *  label not picked, that is All. */
export function keepLive(pick: LabelPick, live: readonly string[]): LabelPick {
  return { labels: pick.labels.filter((id) => live.includes(id)), none: pick.none };
}
