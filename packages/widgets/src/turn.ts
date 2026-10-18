// A turn once it has settled, the same on the web and the phones.

/** Whether a turn is over. */
export function isFinal(state: string): boolean {
  return (
    state === "answered" ||
    state === "partial" ||
    state === "failed" ||
    // 017. A stopped turn is over. Without this the poll would keep asking
    // about a turn nobody is working on, which is the one thing pressing Stop
    // was meant to end.
    state === "cancelled"
  );
}

/** How long to wait before asking about an answer again, after `misses`
 *  asks that found none.
 *
 *  A second while the turn is live, which is what the web used before
 *  `pg_notify` and is comfortably inside how long a turn takes. After twenty
 *  misses it slows to five, because a turn still unanswered after twenty
 *  seconds is not about to be answered in the next one. */
export function answerPollMs(misses: number): number {
  return misses >= 20 ? 5000 : 1000;
}

/** Whether a settled turn filed something, which is what draws the footer's
 *  Done. 028: what lands only where no thread is named draws no pill, so
 *  `threads` can be empty on a turn that filed; the server's `filed` says so.
 *  A move's source in `changed` alone is not a filing. */
export function turnDid(answer: { threads?: readonly unknown[]; changed?: readonly string[]; filed?: boolean }): boolean {
  return (answer.threads?.length ?? 0) > 0 || answer.filed === true;
}

/** Whether a settled turn offers Undo: anything it filed, and anything else
 *  it changed. A move out of a thread or a delete files nothing and is still
 *  a write somebody may want back, so this is wider than Done. */
export function turnUndoable(answer: { threads?: readonly unknown[]; changed?: readonly string[]; filed?: boolean }): boolean {
  return turnDid(answer) || (answer.changed?.length ?? 0) > 0;
}

/** The turns once a proposal has been answered.
 *
 *  The control goes either way, from the reply and from the message that was
 *  sent, since either may be the one carrying it. A calendar write they
 *  agreed to is something the turn did, so the message that was sent wears
 *  Done from the press, as it does after a reload, where the server counts a
 *  confirmed write. Without this the control went and nothing said the thing
 *  had happened. */
export function answeredWaiting<T extends { id: string; from: "you" | "offload"; turnId?: string | undefined; did?: boolean }>(
  turns: T[],
  answered: { id: string; turnId?: string },
  agreed: boolean,
): T[] {
  return turns.map((turn) => {
    const same = turn.id === answered.id || (answered.turnId !== undefined && turn.turnId === answered.turnId);
    if (!same) return turn;
    return { ...turn, waiting: null, ...(agreed && turn.from === "you" ? { did: true } : {}) };
  });
}

/** Take a turn back on screen first. It leaves the list on the press and
 *  comes back when the server refuses or cannot be reached, since the rows
 *  it filed are still there. False tells the caller to say so and offer
 *  Retry. */
export async function undoShown<T extends { turnId?: string | undefined }>(
  turnId: string,
  turns: readonly T[],
  draw: (turns: T[]) => void,
  undo: (turnId: string) => Promise<boolean>,
): Promise<boolean> {
  draw(turns.filter((turn) => turn.turnId !== turnId));
  if (await undo(turnId).catch(() => false)) return true;
  draw([...turns]);
  return false;
}
