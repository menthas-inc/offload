"use client";

// The application shell: a sidebar, and a stack of panes two of which are on
// screen. From ui_kits/web_app/WApp.jsx, which is the design.
//
// **Panes are client state, not routes.** The kit models a stack where opening
// a thread pushes a pane in beside what you were reading and a third pushes the
// first out, and Next's router has no shape for two routes rendered at once.
// The cost is real and worth stating: there is no URL for a thread, so no deep
// link and no browser back. In-app back exists, because the kit puts it in the
// crumb below 1180px where the second pane is gone. Revisit when somebody wants
// to send somebody else a link, which needs sharing anyway.

import { useCallback, useState } from "react";
import styles from "../../app/(app)/shell.module.css";

export type Pane =
  | { kind: "today" }
  | { kind: "threads" }
  | { kind: "thread"; id: string; name?: string }
  | { kind: "content"; id: string; title?: string };

export type Open = (pane: Pane) => void;

/** Up to five, two on screen. Deeper than that and the stack is holding panes
 *  nobody will scroll back to. */
const MAX_PANES = 5;

export function usePanes(initial: Pane) {
  const [panes, setPanes] = useState<Pane[]>([initial]);

  /** Push a pane beside what is already there.
   *
   *  Opening the same thing twice is a no-op rather than a second identical
   *  pane, which is what a double click would otherwise produce. */
  const open = useCallback<Open>((pane) => {
    setPanes((current) => {
      const top = current.at(-1);
      if (top && top.kind === pane.kind && idOf(top) === idOf(pane)) return current;
      return [...current, pane].slice(-MAX_PANES);
    });
  }, []);

  /** A sidebar click resets to one pane. The kit's rule, and it is what keeps
   *  the stack from growing all session. */
  const reset = useCallback<Open>((pane) => setPanes([pane]), []);

  const back = useCallback(() => {
    setPanes((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const jump = useCallback((index: number) => {
    setPanes((current) => current.slice(0, index + 1));
  }, []);

  return { panes, open, reset, back, jump };
}

function idOf(pane: Pane): string {
  return "id" in pane ? pane.id : pane.kind;
}

export function paneTitle(pane: Pane): string {
  switch (pane.kind) {
    case "today":
      return "Today";
    case "threads":
      return "My threads";
    case "thread":
      return pane.name ?? "Thread";
    case "content":
      return pane.title ?? "";
  }
}

interface SidebarProps {
  active: Pane;
  threads: { id: string; name: string; icon: string | null }[];
  threadCount: number;
  onTab: Open;
  onOpen: Open;
}

export function Sidebar({ active, threads, threadCount, onTab, onOpen }: SidebarProps) {
  // Three tabs, matching the kit. Memories has nothing behind it yet and is
  // drawn rather than hidden, because a nav that grows as features land moves
  // under people who have learned where things are.
  const tabs = [
    { key: "today", label: "Today", icon: "☀" },
    { key: "threads", label: "My threads", icon: "◎", count: threadCount },
    { key: "memories", label: "Memories", icon: "☁" },
  ] as const;

  const pinned = threads.slice(0, 3);
  const recent = threads.slice(3, 6);

  const item = (thread: { id: string; name: string; icon: string | null }) => {
    const on = active.kind === "thread" && active.id === thread.id;
    return (
      <button
        key={thread.id}
        type="button"
        className={styles.navItem}
        data-on={on}
        onClick={() => onOpen({ kind: "thread", id: thread.id, name: thread.name })}
      >
        {on ? <span className={styles.marker} /> : null}
        <span aria-hidden="true">◦</span>
        <span className={styles.navLabel}>{thread.name}</span>
      </button>
    );
  };

  return (
    <nav className={styles.sidebar} data-theme="dark" aria-label="Sections">
      <div className={styles.brand}>
        <span className={styles.wordmark}>offload</span>
      </div>

      <div className={styles.navGroup}>
        {tabs.map((tab) => {
          const on = active.kind === tab.key;
          // Memories has no pane. It is drawn and inert rather than absent, and
          // saying so out loud beats a click that silently does nothing.
          const inert = tab.key === "memories";
          return (
            <button
              key={tab.key}
              type="button"
              className={styles.navItem}
              data-on={on}
              disabled={inert}
              aria-disabled={inert}
              title={inert ? "Nothing here yet" : undefined}
              onClick={() => !inert && onTab({ kind: tab.key as "today" | "threads" })}
            >
              {on ? <span className={styles.marker} /> : null}
              <span aria-hidden="true">{tab.icon}</span>
              <span className={styles.navLabel}>{tab.label}</span>
              {"count" in tab && tab.count ? (
                <em className={styles.navCount}>{tab.count}</em>
              ) : null}
            </button>
          );
        })}
      </div>

      {pinned.length ? (
        <>
          <div className={styles.sideLabel}>Pinned</div>
          <div className={styles.navGroup}>{pinned.map(item)}</div>
        </>
      ) : null}

      {recent.length ? (
        <>
          <div className={styles.sideLabel}>Recent</div>
          <div className={styles.navGroup}>{recent.map(item)}</div>
        </>
      ) : null}
    </nav>
  );
}

interface CrumbsProps {
  panes: Pane[];
  onJump: (index: number) => void;
  onBack: () => void;
}

export function Crumbs({ panes, onJump, onBack }: CrumbsProps) {
  // Both are rendered and CSS picks one.
  //
  // Measuring the window in JavaScript would put the breakpoint in two places,
  // and the design system has no breakpoint token to hold it in one, so the
  // number would be a raw value in a stylesheet and a raw value in a component
  // that could drift apart. It also costs a resize listener and a hydration
  // mismatch on first paint. The stylesheet decides; this just supplies both.
  return (
    <div className={styles.crumbs}>
      {panes.length > 1 ? (
        <button type="button" className={styles.crumbBack} onClick={onBack}>
          ‹ Back
        </button>
      ) : null}

      <span className={styles.crumbTrail}>
        {panes.map((pane, index) => (
          <span key={`${pane.kind}-${idOf(pane)}-${index}`}>
            {index > 0 ? <span className={styles.crumbSep}> / </span> : null}
            <button type="button" className={styles.crumb} onClick={() => onJump(index)}>
              {paneTitle(pane)}
            </button>
          </span>
        ))}
      </span>
    </div>
  );
}
