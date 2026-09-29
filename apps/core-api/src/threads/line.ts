// The line under a thread's name, in My threads and on the web's thread head.
//
// 2026-09-29. It was "33 · just you": a total that counted ticked-off rows and
// said nothing about what they were, then "just you", which is most threads
// and tells nobody anything. It says what is open in the thread by kind now,
// the two biggest, and who it is shared with. Composed here rather than in a
// client: it is one string in three clients, and composing it three times is
// how they drift.

import type { ContentTable } from "../schema.js";

type Kind = ContentTable["type"] extends { __select__: infer T } ? T : never;

/** Singular and plural, in the order kinds with the same count are listed. */
const NAMES: [string, [string, string], Kind[]][] = [
  ["task", ["to do", "to do"], ["task"]],
  ["event", ["event", "events"], ["event"]],
  ["link", ["link", "links"], ["link"]],
  ["photo", ["photo", "photos"], ["image", "screenshot"]],
  ["place", ["place", "places"], ["location"]],
  ["voice", ["voice note", "voice notes"], ["voice"]],
  ["file", ["file", "files"], ["file"]],
];

/** `counts` is what is live by content type: not archived, not deleted, and
 *  for a task not ticked off. `people` is everyone else in the thread, by
 *  display name. */
export function threadLine(counts: Partial<Record<Kind, number>>, people: string[]): string {
  const kinds = NAMES.map(([, [one, many], types]) => {
    const n = types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
    return { n, text: `${n} ${n === 1 ? one : many}` };
  })
    .filter((kind) => kind.n > 0)
    // Stable, so a tie keeps the order above.
    .sort((a, b) => b.n - a.n);

  const first = people.map((name) => name.trim().split(/\s+/)[0] || name);
  const who =
    first.length === 0
      ? null
      : first.length === 1
        ? `with ${first[0]}`
        : first.length === 2
          ? `with ${first[0]} and ${first[1]}`
          : `with ${first[0]} and ${first.length - 1} more`;

  // Two kinds alone, one beside the people, so the line stays one line.
  const parts = [...kinds.slice(0, who ? 1 : 2).map((kind) => kind.text), ...(who ? [who] : [])];
  return parts.join(", ");
}
