"use client";

// The application shell, and everything reachable inside it.
//
// This route is the app. Panes are client state rather than routes, for the
// reason `components/shell/Shell.tsx` states: the kit's stack renders two
// places at once and Next's router has no shape for that. The URL therefore
// stays `/today` wherever you are in the app, which is a real limitation and is
// written down rather than discovered.
//
// The shell is: a dark sidebar, a crumb trail, up to two panes side by side,
// and a toast for Undo. From ui_kits/web_app/WApp.jsx.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePanes, Sidebar, Crumbs, type Pane } from "../../../components/shell/Shell";
import { MyThreads } from "../../../components/panes/MyThreads";
import { Thread } from "../../../components/panes/Thread";
import { ContentDetail } from "../../../components/panes/ContentDetail";
import { Today } from "../../../components/panes/Today";
import { useMe } from "../../../lib/use-me";
import {
  fetchOne,
  fetchThreads,
  type ContentDetail as Detail,
  type ThreadGroup,
} from "../../../lib/threads";
import styles from "../shell.module.css";

/** OFF-6 and the readme: eight seconds, up from four, because four is not
 *  enough time to read a toast, reach for a pointer or hear a screen reader
 *  announce it. */
const UNDO_WINDOW_MS = 8_000;

interface Undoable {
  message: string;
  undo: () => Promise<unknown>;
}

export default function AppShell() {
  const state = useMe("shell");
  const { panes, open, reset, back, jump } = usePanes({ kind: "today" });
  const [groups, setGroups] = useState<ThreadGroup[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadThreads = useCallback(async () => {
    setGroups(await fetchThreads());
    setLoadingThreads(false);
  }, []);

  useEffect(() => {
    void loadThreads();
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, [loadThreads]);

  // A content pane needs its row before it can draw. Fetched here rather than
  // inside the pane so the same detail is not refetched every time the stack
  // re-renders around it.
  const top = panes.at(-1);
  useEffect(() => {
    if (top?.kind !== "content" || details[top.id]) return;
    let live = true;
    void fetchOne(top.id).then((detail) => {
      if (live && detail) setDetails((current) => ({ ...current, [detail.id]: detail }));
    });
    return () => {
      live = false;
    };
  }, [top, details]);

  const offerUndo = useCallback((message: string, undo: () => Promise<unknown>) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoable({ message, undo });
    undoTimer.current = setTimeout(() => setUndoable(null), UNDO_WINDOW_MS);
  }, []);

  async function runUndo(): Promise<void> {
    if (!undoable) return;
    const { undo } = undoable;
    setUndoable(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    await undo();
    await loadThreads();
  }

  if (state.status === "loading") return <div className={styles.shell} />;

  const allThreads = groups.flatMap((group) => group.threads);

  const render = (pane: Pane) => {
    switch (pane.kind) {
      case "today":
        return <Today />;
      case "threads":
        return <MyThreads groups={groups} open={open} loading={loadingThreads} />;
      case "thread":
        return (
          <Thread
            id={pane.id}
            open={open}
            onChanged={() => void loadThreads()}
            onUndo={offerUndo}
          />
        );
      case "content": {
        const detail = details[pane.id];
        return detail ? <ContentDetail detail={detail} open={open} /> : <div />;
      }
    }
  };

  // Two on screen. A third pushes the leftmost out rather than shrinking
  // everything, which is what the slice does.
  const shown = panes.slice(-2);

  return (
    <div className={styles.shell}>
      <Sidebar
        active={panes.at(-1) ?? { kind: "today" }}
        threads={allThreads}
        threadCount={allThreads.length}
        onTab={reset}
        onOpen={reset}
      />

      <div className={styles.main}>
        <Crumbs panes={panes} onJump={jump} onBack={back} />

        <div className={styles.paneRow}>
          {shown.map((pane, index) => (
            <div
              key={`${pane.kind}-${"id" in pane ? pane.id : ""}-${panes.length - shown.length + index}`}
              className={`${styles.pane} ${index < shown.length - 1 ? styles.paneLeft : ""}`}
            >
              {render(pane)}
            </div>
          ))}
        </div>

        {undoable ? (
          // The design system's Toast, the same one 004 wired for the dump's
          // Undo. role="status", so it is announced without interrupting.
          <div className={styles.toastRow}>
            <div className={styles.toast} role="status">
              <span className={styles.toastMessage}>{undoable.message}</span>
              <button
                type="button"
                className={styles.toastAction}
                onClick={() => void runUndo()}
              >
                Undo
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
