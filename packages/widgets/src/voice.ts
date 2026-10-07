// F-P2. A memory about the account holder is written by the memory pass about
// them, "They are allergic to penicillin.", and read back by the person it is
// about. So it is spoken to them on the way out and stored about them on the way
// back in, by these two, with no model in between.
//
// Only account memories. A thread's notes are about the thread, not about the
// person reading them.

const TO_YOU: Record<string, string> = {
  they: "you",
  them: "you",
  their: "your",
  theirs: "yours",
  themselves: "yourself",
  themself: "yourself",
};

const SECOND = /\b(you|your|yours|yourself|yourselves)\b/i;
// A contraction's tail rides along unchanged: they're, they've, they'd, they'll.
const THIRD_WORD = /\b(themselves|themself|theirs|their|them|they)\b/gi;
const SECOND_WORD = /\b(yourselves|yourself|yours|your|you)\b(['’](?:re|ve|d|ll)\b)?/gi;

/** Words after which `you` opens a clause, so it was `they` rather than `them`. */
const OPENS = new Set([
  "and", "or", "but", "nor", "so", "yet", "that", "which", "who", "when", "whenever", "where",
  "if", "unless", "because", "since", "while", "whilst", "until", "till", "before", "after",
  "though", "although", "whether", "once", "then",
]);

function cased(like: string, word: string): string {
  if (like.length > 1 && like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0]!.toUpperCase()) return word[0]!.toUpperCase() + word.slice(1);
  return word;
}

/** The stored form, spoken to the person it is about. A memory that already
 *  says you is left as it is, since its you is somebody else and the editor
 *  could not tell the two apart on the way back. */
export function toSecondPerson(text: string): string {
  if (SECOND.test(text)) return text;
  return text.replace(THIRD_WORD, (word) => cased(word, TO_YOU[word.toLowerCase()]!));
}

/** What the person typed, as the memory pass would have written it. A bare
 *  `you` is `they` where it opens a clause and `them` anywhere else. */
export function toThirdPerson(text: string): string {
  return text.replace(SECOND_WORD, (word: string, base: string, tail: string | undefined, at: number) => {
    const lower = base.toLowerCase();
    let to: string;
    if (lower === "your") to = "their";
    else if (lower === "yours") to = "theirs";
    else if (lower === "yourself" || lower === "yourselves") to = "themselves";
    else if (tail) to = "they";
    else {
      const before = text.slice(0, at);
      const prev = /([A-Za-zÀ-ɏ'’]+)\W*$/.exec(before);
      const clauseStart = !prev || /[.!?;:,(]\s*$/.test(before) || OPENS.has(prev[1]!.toLowerCase());
      to = clauseStart ? "they" : "them";
    }
    return cased(base, to) + (tail ?? "");
  });
}
