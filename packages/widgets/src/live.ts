// 048. What the live connection says, both clients and the Core API.
//
// **That something changed, never what.** Ids and kinds only: a screen that
// hears about a change reads itself again through the read it already uses,
// with the checks that read already has. Nothing a person wrote travels here.

export type ChangeKind =
  /** Read everything again: coming back, a reconnect, or a server that lost
   *  track. Carries no ids. */
  | "all"
  | "thread"
  /** Taken out of a thread, or left it. Addressed to that person alone. */
  | "removed"
  | "invitation"
  | "conversation"
  | "memories"
  | "people"
  | "activity"
  | "today";

export interface Changes {
  kinds: ChangeKind[];
  threads?: string[];
  removed?: string[];
}

// This package has no DOM or Node types; both runtimes have these two.
const timers = globalThis as unknown as {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

export const EVERYTHING: Changes = { kinds: ["all"] };

/** Whether a screen that shows these kinds, or this thread, should read again.
 *  A screen with no thread of its own takes a change to any thread. */
export function touches(changes: Changes, kinds: ChangeKind[], threadId?: string): boolean {
  if (changes.kinds.includes("all")) return true;
  return kinds.some((kind) => {
    if (!changes.kinds.includes(kind)) return false;
    if (threadId === undefined) return true;
    if (kind === "thread") return changes.threads?.includes(threadId) ?? false;
    if (kind === "removed") return changes.removed?.includes(threadId) ?? false;
    return true;
  });
}

/** At most one run per `ms`, trailing: the first ask runs at once, and any
 *  asks inside the window become one run at its end. This is what bounds the
 *  reads live updates cause, so a burst is one read rather than one per change. */
export function reloadFloor(run: () => void, ms = 2000): { ask: () => void; cancel: () => void } {
  let last = -Infinity;
  let timer: unknown = null;

  const fire = (): void => {
    timer = null;
    last = Date.now();
    run();
  };

  return {
    ask: () => {
      if (timer) return;
      const wait = last + ms - Date.now();
      if (wait <= 0) fire();
      else timer = timers.setTimeout(fire, wait);
    },
    cancel: () => {
      if (timer) timers.clearTimeout(timer);
      timer = null;
    },
  };
}
