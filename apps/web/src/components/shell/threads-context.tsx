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

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { reloadFloor, touches, type ChangeKind, type Changes } from "@offload/widgets";
import type { ThreadGroup } from "../../lib/threads";
import type { Invitation } from "../../lib/people";
import type { LooseSummary } from "../../lib/loose";

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

/** 048. What the live connection or coming back to the tab said changed, so
 *  an open screen reads itself again. Never marks: `filed` is the mark's.
 *  `at` for the reason `Filed` has one. */
export type Changed = Changes & { at: number };

interface Threads {
  groups: ThreadGroup[];
  /** 022. Waiting shares, from the same read, for the strips. */
  invitations: Invitation[];
  /** 028. What is not in a thread, from the same read. Null draws no group. */
  loose: LooseSummary | null;
  /** False only on the very first load, when there is genuinely nothing yet. */
  ready: boolean;
  reload: () => void;
  /** Null until a turn files something in this session. */
  filed: Filed | null;
  /** 048. Null until something changes while the shell is open. */
  changed: Changed | null;
  /** 048. A turn of this account is out, from this tab or another device: the
   *  thread page catches up through the path that marks while it is. */
  turnOut: boolean;
}

const ThreadsContext = createContext<Threads>({
  groups: [],
  invitations: [],
  loose: null,
  ready: false,
  reload: () => {},
  filed: null,
  changed: null,
  turnOut: false,
});

export const ThreadsProvider = ThreadsContext.Provider;

export const useThreads = (): Threads => useContext(ThreadsContext);

/** 048. Read again on a change this screen shows: at most once every two
 *  seconds, the first at once and a burst as one more at its end. A change
 *  already heard when the screen opened is not one, since it opened reading. */
export function useChanged(kinds: ChangeKind[], read: () => void, threadId?: string): void {
  const { changed } = useThreads();
  const latest = useRef(read);
  latest.current = read;
  const [floor] = useState(() => reloadFloor(() => latest.current()));
  useEffect(() => floor.cancel, [floor]);
  const heard = useRef(changed);
  useEffect(() => {
    if (!changed || changed === heard.current) return;
    heard.current = changed;
    if (touches(changed, kinds, threadId)) floor.ask();
  }, [changed]);
}
