// 038. A remembered sentence has to come from what the person said.
//
// The `memory` tool runs in a turn that may also have read other people's
// words: a thread's notes from other members, a row somebody else filed, a
// tool result. Any of them could say "remember that…". The prompt says only
// the person's own ask counts; this checks it: most of the sentence's words,
// and every number in it, are in the person's own message. Rewording into the
// third person passes, because the words it changes are the ones ignored.

import { flat } from "./flat.js";

const IGNORED = new Set([
  "they", "their", "theirs", "them", "themselves", "s", "is", "are", "was", "were", "be", "been",
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "and", "or", "as", "by", "from",
  "it", "its", "has", "have", "had", "that", "this", "which", "who", "what", "when", "where",
  "call", "calls", "called", "mean", "means", "always", "never", "every", "everywhere", "now",
  "place", "one", "ones",
]);

const words = (text: string): string[] => flat(text).split(" ").filter((word) => word && !IGNORED.has(word));

/** A word they said, or the same word with a different ending: "lives" for
 *  "live", "married" for "marry". Four letters in common at the start. */
function heard(word: string, said: Set<string>): boolean {
  if (said.has(word)) return true;
  if (word.length < 4 || /\d/.test(word)) return false;
  for (const other of said) if (other.length >= 4 && other.slice(0, 4) === word.slice(0, 4)) return true;
  return false;
}

export function groundedIn(text: string, said: string): boolean {
  const own = new Set(flat(said).split(" ").filter(Boolean));
  const mine = words(text);
  if (mine.length === 0) return false;
  // Every number exactly: a date, an age, a PIN is the person's or it is not.
  if (!mine.filter((word) => /\d/.test(word)).every((word) => own.has(word))) return false;
  return mine.filter((word) => heard(word, own)).length * 2 >= mine.length;
}

/** Their message asks offload to remember something, in so many words. The
 *  prompt says only an explicit ask counts; this is the same rule in code, so
 *  a sentence in another member's note or a tool result cannot pass for one. */
export function askedToRemember(said: string): boolean {
  return /\b(remember|from now on|keep in mind|don'?t forget)\b/i.test(said.normalize("NFKC"));
}

export function askedToForget(said: string): boolean {
  return /\b(forget|don'?t remember|stop remembering|no longer remember)\b/i.test(said.normalize("NFKC"));
}

/** A rule is followed in every later turn, so it is held to more: every word
 *  of it they said, and an always, a never or a from now on in what they said. */
export function ruleGrounded(text: string, said: string): boolean {
  if (!/\b(always|never|from now on)\b/i.test(said.normalize("NFKC"))) return false;
  return everyWordHeard(text, said);
}

/** Every word of it, bar the ignored ones, in what they said. A rule is held
 *  to this, and so is a birthday nobody asked offload to remember (051). */
export function everyWordHeard(text: string, said: string): boolean {
  const own = new Set(flat(said).split(" ").filter(Boolean));
  const mine = words(text);
  return mine.length > 0 && mine.every((word) => heard(word, own));
}
