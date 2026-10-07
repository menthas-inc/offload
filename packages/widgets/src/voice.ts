// F4. A memory about the account holder is written by the memory pass about
// them, "They are allergic to penicillin.", and read back by the person it is
// about. So it is spoken to them on the way out and stored about them on the way
// back in, by these two, with no model in between.
//
// Only account memories. A thread's notes are about the thread, not about the
// person reading them.
//
// The object `them` is left as it is. In "They pay their rent to Jo and text
// them the receipt." the subject and the possessive are the account holder and
// `them` is Jo, and a reader can tell `them` is somebody else far more often
// than a rewrite can.

const TO_YOU: Record<string, string> = {
  they: "you",
  their: "your",
  theirs: "yours",
  themselves: "yourself",
  themself: "yourself",
};

const SECOND = /\b(you|your|yours|yourself|yourselves)\b/i;
// A contraction's tail rides along unchanged: they're, they've, they'd, they'll.
const THIRD_WORD = /\b(themselves|themself|theirs|their|they)\b/gi;
const SECOND_WORD = /\b(yourselves|yourself|yours|your|you)\b(['’](?:re|ve|d|ll)\b)?/gi;
// What somebody types about themselves. `I am` and `I was` take the verb along.
const FIRST_WORD = /\b(?:(I)(?:(['’])(m|ve|d|ll)\b|(\s+)(am|was)\b)?|(myself|mine|my|me))\b/gi;

/** Words after which `you` opens a clause, so it was `they` rather than `them`. */
const OPENS = new Set([
  "and", "or", "but", "nor", "so", "yet", "that", "which", "who", "when", "whenever", "where",
  "if", "unless", "because", "since", "while", "whilst", "until", "till", "before", "after",
  "though", "although", "whether", "once", "then",
]);

/** Before which `mine` is a place, not a possession. */
const DETERMINERS = new Set(["a", "an", "the", "this", "that", "gold", "coal", "salt", "tin", "copper"]);

function cased(like: string, word: string): string {
  if (like.length > 1 && like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0]!.toUpperCase()) return word[0]!.toUpperCase() + word.slice(1);
  return word;
}

function previousWord(before: string): string | null {
  const prev = /([A-Za-zÀ-ɏ'’]+)\W*$/.exec(before);
  return prev ? prev[1]!.toLowerCase() : null;
}

function opensSentence(before: string): boolean {
  return /^\W*$/.test(before) || /[.!?]["'’”)]*\s+$/.test(before);
}

/** The stored form, spoken to the person it is about. A memory that already
 *  says you is left as it is, since its you is somebody else and the editor
 *  could not tell the two apart on the way back. */
export function toSecondPerson(text: string): string {
  if (SECOND.test(text)) return text;
  return text.replace(THIRD_WORD, (word) => cased(word, TO_YOU[word.toLowerCase()]!));
}

function firstToThird(text: string): string {
  return text.replace(
    FIRST_WORD,
    (
      word: string,
      i: string | undefined,
      apostrophe: string | undefined,
      tail: string | undefined,
      space: string | undefined,
      verb: string | undefined,
      other: string | undefined,
      at: number,
    ) => {
      const before = text.slice(0, at);
      if (i) {
        // i.e., I-95: a letter, not a person.
        if (!tail && !verb && /^[-.]\w/.test(text.slice(at + word.length))) return word;
        const they = opensSentence(before) ? "They" : "they";
        if (tail) return they + apostrophe + (tail.toLowerCase() === "m" ? "re" : tail);
        if (verb) return they + space + (verb.toLowerCase() === "am" ? "are" : "were");
        return they;
      }
      const lower = other!.toLowerCase();
      if (lower === "mine" && DETERMINERS.has(previousWord(before) ?? "")) return word;
      const to = lower === "my" ? "their" : lower === "mine" ? "theirs" : lower === "myself" ? "themselves" : "them";
      return cased(other!, to);
    },
  );
}

/** What the person typed, as the memory pass would have written it. The first
 *  person is theirs. A bare `you` is `they` where it opens a clause and `them`
 *  anywhere else. A `them` is left as it is, as it was shown. */
export function toThirdPerson(text: string): string {
  const typed = firstToThird(text);
  return typed.replace(SECOND_WORD, (word: string, base: string, tail: string | undefined, at: number) => {
    const lower = base.toLowerCase();
    let to: string;
    if (lower === "your") to = "their";
    else if (lower === "yours") to = "theirs";
    else if (lower === "yourself" || lower === "yourselves") to = "themselves";
    else if (tail) to = "they";
    else {
      const before = typed.slice(0, at);
      const prev = previousWord(before);
      const clauseStart = !prev || /[.!?;:,(]\s*$/.test(before) || OPENS.has(prev);
      to = clauseStart ? "they" : "them";
    }
    return cased(base, to) + (tail ?? "");
  });
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** What an editor shows for a stored memory. */
export function shownText(stored: string): string {
  return toSecondPerson(stored);
}

/** What an editor writes. `loaded` is the stored text it opened on, or null
 *  for a new memory. Words left as shown keep their stored form exactly; a
 *  memory that already said you was shown as stored, so it is saved as typed;
 *  anything else is stored about the person. On one line either way. */
export function storedText(loaded: string | null, typed: string): string {
  const words = oneLine(typed);
  if (loaded === null) return toThirdPerson(words);
  const shown = shownText(loaded);
  if (words === oneLine(shown)) return loaded;
  if (SECOND.test(loaded)) return words;
  return toThirdPerson(words);
}
