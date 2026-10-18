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

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** A count in words up to nine, capitalised for the start of a sentence, and a
 *  number past that. A count stands on its own; nothing a person reads names
 *  what is being counted. */
function sentenceCount(n: number): string {
  const word = WORDS[n];
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : String(n);
}

/** A count in words up to nine, a number past that, for mid-sentence: labels
 *  and *These three look like they belong together.* alike (2026-10-17). */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/** "A, B and C". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The label sheet's toast: what the row is under now. */
export function rowLabelledCopy(title: string, names: readonly string[]): string {
  return names.length === 0 ? `${title} has no label` : `${title} is under ${nameList(names)}`;
}

/** The label's list's toast: how many are under it now. */
export function listLabelledCopy(count: number, name: string): string {
  return count === 0 ? `${name} saved` : `${sentenceCount(count)} under ${name}`;
}

/** The label's list ticks across the whole thread, so it reads every page.
 *  Each page hands over everything so far; a page that does not arrive ends
 *  the read as false, so the list can say so beside a retry rather than
 *  spin; a page that threw is one that did not arrive. Nobody looking any
 *  more is not a failure. */
export async function readEveryPage<T>(
  page: (cursor: string | undefined) => Promise<{ rows: T[]; nextCursor: string | null } | null>,
  onRows: (rows: T[]) => void,
  alive: () => boolean,
): Promise<boolean> {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const next = await page(cursor).catch(() => null);
    if (!alive()) return true;
    if (!next) return false;
    all.push(...next.rows);
    onRows([...all]);
    cursor = next.nextCursor ?? undefined;
  } while (cursor);
  return true;
}

/** The most a label's name may be, after a leading # and extra spaces go. */
export const LABEL_NAME_CHARS = 24;

/** A New label's name, folded in with the names already added in the sheet.
 *  Done calls this with whatever is still in the field: on the phones the
 *  press arrives before the field's blur has added the name, so Done read an
 *  empty list and made nothing. An empty field adds nothing. */
export function foldDraft(
  draft: string,
  made: readonly string[],
  existing: readonly string[],
): { made: string[] } | { line: string } {
  const name = draft.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
  if (!name) return { made: [...made] };
  if ([...name].length > LABEL_NAME_CHARS) return { line: `A label is ${LABEL_NAME_CHARS} characters at most.` };
  if ([...existing, ...made].some((n) => n.toLowerCase() === name.toLowerCase())) {
    return { line: `${name} is already a label here.` };
  }
  return { made: [...made, name] };
}

/** A row's write that makes labels first, then carries them in the edit.
 *
 *  2026-09-29, on the phones; the web since 2026-10-07. Whatever this attempt made is taken back when a later step
 *  fails, so a Retry starts clean instead of meeting its own first label as
 *  taken, and nothing is left behind attached to no row. Undo deletes the
 *  made labels only once the row itself is put back. The steps are passed in
 *  so the rule is tested without a network. */
export function withMadeLabels<P extends { labels?: string[] }, S>(
  steps: {
    make: (name: string) => Promise<string | null>;
    edit: (patch: P) => Promise<S | null>;
    /** The patch that puts the row back, from what the edit replaced. */
    undo: (previous: S) => P;
    drop: (id: string) => Promise<unknown>;
  },
  patch: P,
  names: string[],
): { write: () => Promise<boolean>; unwrite: () => Promise<boolean> } {
  let made: string[] = [];
  let previous: S | null = null;
  const takeBack = async (): Promise<false> => {
    for (const id of made) await steps.drop(id);
    made = [];
    return false;
  };
  return {
    write: async () => {
      made = [];
      for (const name of names) {
        const id = await steps.make(name);
        if (id === null) return takeBack();
        made.push(id);
      }
      const result = await steps.edit(made.length > 0 ? { ...patch, labels: [...(patch.labels ?? []), ...made] } : patch);
      if (result === null) return takeBack();
      previous = result;
      return true;
    },
    unwrite: async () => {
      if (previous === null) return false;
      const result = await steps.edit(steps.undo(previous));
      if (result === null) return false;
      for (const id of made) await steps.drop(id);
      made = [];
      return true;
    },
  };
}

/** The words a label refusal says, beside the control that was pressed. */
export function refusalLine(error: string | null, name?: string): string {
  if (error === "label_taken") return `${name ?? "That"} is already a label here.`;
  if (error === "label_limit") return "A thread holds ten labels.";
  if (error === "label_gone") return "That label was deleted.";
  return "Couldn't save that.";
}
