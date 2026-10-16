// The conversation follows its end (16 October 2026).
//
// Scrolled once per new turn, the transcript was scrolled before a photo or
// the thinking row had its height, and the row sat half under the composer.
// It now follows its end on every change of its content's size, while the
// reader is at the end; a reader who has scrolled away keeps their place
// through a reply; and sending something always brings it back to the end.

/** How short of the end still counts as there. */
const SLACK = 24;

/** Whether the end of the transcript shows. `inset` is the keyboard's room
 *  below the content: a last turn behind the keyboard is not the end. */
export function atEnd({
  offset,
  layout,
  content,
  inset,
}: {
  offset: number;
  layout: number;
  content: number;
  inset: number;
}): boolean {
  "worklet";
  return offset + layout >= content + inset - SLACK;
}

/** Whether the person sent something since there were `before` turns of
 *  theirs. A count, not ids: a sent turn swaps its provisional id for the
 *  real one, which is not a send. */
export function sentBy(before: number, turns: readonly { from: "you" | "offload" }[]): boolean {
  return yours(turns) > before;
}

export function yours(turns: readonly { from: "you" | "offload" }[]): number {
  return turns.filter((turn) => turn.from === "you").length;
}
