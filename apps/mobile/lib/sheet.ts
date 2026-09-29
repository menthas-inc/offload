// One physics for every sheet on the phones (30 September 2026).
//
// From `handoff/APPLY-2026-09-29-conversation-sheet.md`. A sheet has one
// position, `y`, in pixels on the UI thread: 0 is open, its travel is closed.
// The finger drives it, a spring takes over from the finger's own speed on
// release, and everything else that moves with a sheet (its scrim, the page
// behind, the tab bar) is derived from the same value, so nothing can lag.
//
// Pure functions and numbers, so the decisions are tested without a device.
// Each one is a worklet: they run inside gesture callbacks and animated
// styles on the UI thread.

/** The handoff's spring. Near critical, so an open settles without a wobble
 *  and a close with `overshootClamping` stops at the edge. */
export const SHEET_SPRING = { stiffness: 380, damping: 36, mass: 1 } as const;

/** How far a finger moves before the drag takes hold. The sheet then moves
 *  from where it was, not by the slop at once. */
export const SLOP = 8;

/** Points a second down that close from anywhere, or up that keep it open. */
const FLICK = 500;

/** A release past this share of the travel closes. */
const CLOSE_AT = 0.25;

/** Above open, the sheet gives a third of the finger's movement. */
const RESIST = 3;

/** How much of its travel a full Android back swipe pulls a sheet down. A
 *  hint that follows the finger, and the rest is the close. */
const BACK_PULL = 0.3;

/** A closed conversation this old is over: the next dump starts a new one.
 *  The product owner's number, 30 September. */
export const STALE_MS = 30 * 60 * 1000;

/** Where the sheet is while a finger holds it. `translation` is the pan's
 *  total, `anchor` what it was when the drag took hold, so the first frame
 *  is where the sheet already was. */
export function dragTo(start: number, translation: number, anchor: number): number {
  "worklet";
  const at = start + translation - anchor;
  return at < 0 ? at / RESIST : at;
}

/** Whether a release closes the sheet: a flick down from anywhere, or past a
 *  quarter unless it was flicked back up. */
export function closes(y: number, velocity: number, travel: number): boolean {
  "worklet";
  return velocity > FLICK || (velocity > -FLICK && y > travel * CLOSE_AT);
}

/** 1 open, 0 closed. Closed until the sheet has a size. */
export function progress(y: number, travel: number): number {
  "worklet";
  if (travel <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - y / travel));
}

/** The page behind the conversation, on iOS: scaled from its top edge, moved
 *  down and rounded, all by the sheet's progress. */
export function recede(p: number): { scale: number; translateY: number; radius: number } {
  "worklet";
  return {
    scale: Math.round((1 - 0.07 * p) * 1000) / 1000,
    translateY: 10 * p,
    radius: 14 * p,
  };
}

/** Where a predictive back swipe has pulled a sheet, from Android's 0 to 1. */
export function backPull(swipe: number, travel: number): number {
  "worklet";
  return Math.min(1, Math.max(0, swipe)) * travel * BACK_PULL;
}

/** Whether the next dump starts a new conversation. `closedAt` is null while
 *  the conversation is open. */
export function startsFresh(closedAt: number | null, now: number): boolean {
  return closedAt !== null && now - closedAt >= STALE_MS;
}
