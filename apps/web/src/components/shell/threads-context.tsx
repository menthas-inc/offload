"use client";

// The thread list, fetched once by the shell and read by everything under it.
//
// **This exists because navigating flashed.** Every route fetched its own copy
// of My threads, so opening a thread unmounted the list, showed nothing, and
// filled it back in a moment later, while the pane it lives in was also being
// animated. The result read as a glitch rather than as a slide, and no amount
// of tuning the animation would have fixed it: the problem was that the pane
// had no content to show while it moved.
//
// The layout already fetched this for the sidebar. Now it fetches it once and
// everything under it reads the same copy, so the left pane is fully drawn
// before the animation starts.

import { createContext, useContext } from "react";
import type { ThreadGroup } from "../../lib/threads";

/** What the last turn wrote to, so an open screen can catch up on its own.
 *
 *  The composer floats over every tab, so offload can file into the very thread
 *  you are looking at and, before this, the page went on showing what it held a
 *  moment ago until you reloaded. A reply saying "added to Flat renovation"
 *  while Flat renovation visibly does not have it is the same class of untruth
 *  004 exists to retire, arriving from the other direction.
 *
 *  `at` is a timestamp rather than a counter because the useful signal is "this
 *  happened again": filing into the same thread twice running produces the same
 *  id list, and without a changing value the second one would not re-trigger. */
export interface Filed {
  threadIds: string[];
  at: number;
}

interface Threads {
  groups: ThreadGroup[];
  /** False only on the very first load, when there is genuinely nothing yet. */
  ready: boolean;
  reload: () => void;
  /** Null until a turn files something in this session. */
  filed: Filed | null;
}

const ThreadsContext = createContext<Threads>({
  groups: [],
  ready: false,
  reload: () => {},
  filed: null,
});

export const ThreadsProvider = ThreadsContext.Provider;

export const useThreads = (): Threads => useContext(ThreadsContext);
