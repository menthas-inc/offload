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
//   /threads/loose  My threads | not in a thread
//   /content/:id    its thread  | that piece
//
// **The composer is under the panes and belongs to none of them.** The kit says
// so in as many words, and it is the reason: any UI task in offload can be said
// instead of tapped, so the place you say things cannot be one tab.

import { useCallback, useEffect, useState } from "react";
import { reloadFloor, touches } from "@offload/widgets";
import { usePathname } from "next/navigation";
import { Sidebar } from "../../components/shell/Sidebar";
import { ThreadsProvider, type Changed, type Filed } from "../../components/shell/threads-context";
import { Composer } from "../../components/shell/Composer";
import { MapColumnContext } from "../../components/shell/map-column";
import { ToastProvider } from "../../components/shell/Toast";
import { refreshBadges, useMe } from "../../lib/use-me";
import { openLive } from "../../lib/live";
import { Unanswered } from "../../components/Unanswered";
import { fetchThreadsAndInvitations, type ThreadGroup } from "../../lib/threads";
import type { Invitation } from "../../lib/people";
import type { LooseSummary } from "../../lib/loose";
import styles from "./shell.module.css";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const state = useMe("shell");
  const pathname = usePathname();
  const [groups, setGroups] = useState<ThreadGroup[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loose, setLoose] = useState<LooseSummary | null>(null);
  const [ready, setReady] = useState(false);
  // What the last turn wrote to, so a screen already showing one of those
  // threads can catch up without being reloaded.
  const [filed, setFiled] = useState<Filed | null>(null);
  // 030. The top thread pane's map column, which the composer keeps clear of.
  const [mapColumn, setMapColumn] = useState(false);
  // 048. What changed elsewhere, for the screens to read again, and whether a
  // turn is out, for the thread page to read through the path that marks.
  const [changed, setChanged] = useState<Changed | null>(null);
  const [turnOut, setTurnOut] = useState(false);

  const loadThreads = useCallback(async () => {
    const page = await fetchThreadsAndInvitations();
    setGroups(page?.groups ?? []);
    setInvitations(page?.invitations ?? []);
    setLoose(page?.loose ?? null);
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

  // 048. Once signed in, and for the life of the shell. The list and the
  // badges are the shell's own; every screen under it reads `changed`.
  const signedIn = state.status === "ready";
  useEffect(() => {
    if (!signedIn) return;
    const threadsFloor = reloadFloor(() => void loadThreads());
    const close = openLive((changes) => {
      setChanged({ ...changes, at: Date.now() });
      if (touches(changes, ["thread", "removed", "invitation"])) threadsFloor.ask();
      if (touches(changes, ["activity"])) void refreshBadges();
    });
    return () => {
      close();
      threadsFloor.cancel();
    };
  }, [signedIn, loadThreads]);

  if (state.status === "loading") return <div className={styles.shell} />;
  if (state.status === "unreachable") return <Unanswered retry={state.retry} attempt={state.attempt} retryAfter={state.retryAfter} />;

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
    <ThreadsProvider value={{ groups, invitations, loose, ready, reload: () => void loadThreads(), filed, changed, turnOut }}>
      <ToastProvider>
      <div className={styles.shell}>
        <Sidebar threads={threads} threadCount={threads.length} requestsWaiting={state.me.requestsWaiting} activityNew={state.me.activityNew} />
        <div className={styles.main}>
          <MapColumnContext.Provider value={setMapColumn}>{children}</MapColumnContext.Provider>
          {/* The re-ask's way out reaches the account settings inside the shell;
              nothing is dumped before the changed terms are agreed to. */}
          {state.me.needsConsent ? null : (
            <Composer
              mapColumn={mapColumn}
              atDailyLimit={state.me.atDailyLimit}
              inThread={inThread ? { id: inThread.id, name: inThread.name } : null}
              onTurnOut={setTurnOut}
              onFiled={(threadIds) => {
                void loadThreads();
                setFiled({ threadIds, at: Date.now() });
              }}
            />
          )}
        </div>
      </div>
      </ToastProvider>
    </ThreadsProvider>
  );
}
