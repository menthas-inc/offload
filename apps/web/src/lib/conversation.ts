// When a conversation is over (30 September 2026).
//
// Thirty minutes of silence ends one on every surface: the server starts a new
// conversation for the next dump, the phones end one put away that long, and
// an open tab stops drawing the old turns above the new one. The web keeps its
// close for ending one sooner.

export const STALE_MS = 30 * 60 * 1000;

/** Whether the next dump starts a new conversation, from when the current
 *  one was last spoken to. Null when nothing has been said. */
export function startsFresh(lastSaid: number | null, now: number): boolean {
  return lastSaid !== null && now - lastSaid >= STALE_MS;
}

/** When the tail was last spoken to, from its newest message. Null when it is
 *  empty or the API sends no times. */
export function lastSaidOf(messages: { createdAt?: string }[]): number | null {
  const at = messages[messages.length - 1]?.createdAt;
  return at ? Date.parse(at) : null;
}
