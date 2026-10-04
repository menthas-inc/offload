// 028. Whether a turn did something worth the Done mark.
//
// A pill, or the server saying it filed: a turn that filed only into the
// default thread has no pill and still did something. Its own file because
// `dump.ts` reaches native modules a logic test cannot load.

export function turnDid(answer: { threads?: readonly unknown[]; filed?: boolean }): boolean {
  return (answer.threads?.length ?? 0) > 0 || answer.filed === true;
}

/** The turns once a proposal has been answered.
 *
 *  The control goes either way, from the reply and from the message that was
 *  sent, since either may be the one carrying it. A calendar write they
 *  agreed to is something the turn did, so the message that was sent wears
 *  Done from the press, as it does after a reload, where the server counts a
 *  confirmed write. Without this the control went and nothing said the thing
 *  had happened. */
export function answeredWaiting<T extends { id: string; from: "you" | "offload"; turnId?: string; did?: boolean }>(
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
