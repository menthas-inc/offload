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
import { ThreadsProvider, type Filed } from "../../components/shell/threads-context";
import { Composer } from "../../components/shell/Composer";
import { ToastProvider } from "../../components/shell/Toast";
import { useMe } from "../../lib/use-me";
import { Unanswered } from "../../components/Unanswered";
import { fetchThreadsAndInvitations, type ThreadGroup } from "../../lib/threads";
import type { Invitation } from "../../lib/people";
import styles from "./shell.module.css";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const state = useMe("shell");
  const pathname = usePathname();
  const [groups, setGroups] = useState<ThreadGroup[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [ready, setReady] = useState(false);
  // What the last turn wrote to, so a screen already showing one of those
  // threads can catch up without being reloaded.
  const [filed, setFiled] = useState<Filed | null>(null);

  const loadThreads = useCallback(async () => {
    const page = await fetchThreadsAndInvitations();
    setGroups(page?.groups ?? []);
    setInvitations(page?.invitations ?? []);
    setReady(true);
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
  if (state.status === "unreachable") return <Unanswered retry={state.retry} />;

  const threads = groups.flatMap((group) => group.threads);

  // The thread on screen, for the composer to file into by default. From the
  // path, because the route is the state here: a pane stack held in client
  // state was the earlier draft and the reason it went is at the top of this
  // file. Only the thread pane counts. A piece of content knows its thread on
  // the server and not here, and guessing would mean a fetch to answer a
  // question the composer only needs a label for.
  const open = /^\/threads\/([0-9a-fA-F-]{36})/.exec(pathname);
  const inThread = open ? (threads.find((one) => one.id === open[1]) ?? null) : null;

  return (
    <ThreadsProvider value={{ groups, invitations, ready, reload: () => void loadThreads(), filed }}>
      <ToastProvider>
      <div className={styles.shell}>
        <Sidebar threads={threads} threadCount={threads.length} requestsWaiting={state.me.requestsWaiting} activityNew={state.me.activityNew} />
        <div className={styles.main}>
          {children}
          <Composer
            inThread={inThread ? { id: inThread.id, name: inThread.name } : null}
            onFiled={(threadIds) => {
              void loadThreads();
              setFiled({ threadIds, at: Date.now() });
            }}
          />
        </div>
      </div>
      </ToastProvider>
    </ThreadsProvider>
  );
}
