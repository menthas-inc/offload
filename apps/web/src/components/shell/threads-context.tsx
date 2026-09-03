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

interface Threads {
  groups: ThreadGroup[];
  /** False only on the very first load, when there is genuinely nothing yet. */
  ready: boolean;
  reload: () => void;
}

const ThreadsContext = createContext<Threads>({
  groups: [],
  ready: false,
  reload: () => {},
});

export const ThreadsProvider = ThreadsContext.Provider;

export const useThreads = (): Threads => useContext(ThreadsContext);
