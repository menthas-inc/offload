"use client";

// The application shell.
//
// A dark sidebar, a crumb trail, up to two panes side by side, and the composer
// under all of it. From ui_kits/web_app/WApp.jsx.
//
// **Every pane has a URL.** An earlier draft held the pane stack in client
// state, which made a thread unlinkable: you could not send one to somebody,
// and offload could not answer a dump by pointing at where it filed things.
// Both of those are the product working, so the route is the state. The stack
// is derived from the path rather than accumulated, which turns out to be
// simpler as well as linkable:
//
//   /today          Today
//   /threads        My threads
//   /threads/:id    My threads | that thread
//   /content/:id    its thread  | that piece
//
// **The composer is under the panes and belongs to none of them.** The kit says
// so in as many words, and it is the reason: any UI task in offload can be said
// instead of tapped, so the place you say things cannot be one tab.

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "../../components/shell/Sidebar";
import { Composer } from "../../components/shell/Composer";
import { useMe } from "../../lib/use-me";
import { fetchThreads, type ThreadGroup } from "../../lib/threads";
import styles from "./shell.module.css";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const state = useMe("shell");
  const pathname = usePathname();
  const [groups, setGroups] = useState<ThreadGroup[]>([]);

  const loadThreads = useCallback(async () => {
    setGroups(await fetchThreads());
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // A dump can create a thread, so the sidebar and My threads are stale the
  // moment offload answers. Refetched on every navigation as well, which costs
  // one indexed query and removes a whole class of "it is there after a
  // reload" confusion.
  useEffect(() => {
    void loadThreads();
  }, [pathname, loadThreads]);

  if (state.status === "loading") return <div className={styles.shell} />;

  const threads = groups.flatMap((group) => group.threads);

  return (
    <div className={styles.shell}>
      <Sidebar threads={threads} threadCount={threads.length} />
      <div className={styles.main}>
        {children}
        <Composer onFiled={() => void loadThreads()} />
      </div>
    </div>
  );
}
