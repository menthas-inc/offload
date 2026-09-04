"use client";

// My threads. From ui_kits/web_app/WApp.jsx's WThings.
//
// Three groups, and only one of them is stored: `always_on` is a column, and
// "older" is derived from activity, because a thread does not become old, it
// stops being used. The server derives it so all three clients agree.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { QuietEmpty } from "./QuietEmpty";
import { threadIcon } from "../shell/Sidebar";
import styles from "../../app/(shell)/shell.module.css";
import { deleteThread, restoreThread, type ThreadGroup, type ThreadRow } from "../../lib/threads";

const HEADINGS: Record<string, string> = {
  now: "For now",
  always: "Always on",
  older: "Older threads",
};

/** Which group gets which badge, and it is not a free choice: `WThings` gives
 *  "Always on" the accent and leaves "Older threads" on the default, so the
 *  solid blue lands on the group that is finished rather than the one that
 *  never closes. Written down because it reads backwards until you see it on
 *  screen. */
const TONE: Record<string, "solid" | "accent"> = {
  now: "solid",
  always: "accent",
  older: "solid",
};

interface Props {
  groups: ThreadGroup[];
  loading: boolean;
  /** Refetch the list. Deleting one is the only thing here that changes it. */
  onChanged?: () => void;
}

/** One row, and the question it turns into.
 *
 *  Straight from `WRow` in `ui_kits/web_app/W.jsx`, which is where all four of
 *  these behaviours come from: tools on hover only, the question replacing the
 *  row rather than opening over it, clicking anywhere else cancelling, and the
 *  row collapsing to nothing once it is gone.
 *
 *  **The question replaces the row in place** because a dialog would cover the
 *  thing it is asking about, and this one names it: you are looking at the row
 *  while deciding about it.
 */
function Row({
  thread,
  onDeleted,
}: {
  thread: ThreadRow;
  onDeleted: (thread: ThreadRow, deleted: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [gone, setGone] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  // Measured once, so the collapse has somewhere to animate from. `max-height`
  // cannot transition from `auto`, and the kit measures for the same reason.
  useEffect(() => {
    if (box.current && height === null) setHeight(box.current.offsetHeight);
  }, [height]);

  // Clicking anywhere else is a cancel. The question should never trap the
  // page, which is the kit's own comment on this listener.
  useEffect(() => {
    if (!asking) return;
    const away = (event: MouseEvent): void => {
      if (box.current && !box.current.contains(event.target as Node)) setAsking(false);
    };
    document.addEventListener("mousedown", away, true);
    return () => document.removeEventListener("mousedown", away, true);
  }, [asking]);

  async function confirm(): Promise<void> {
    const result = await deleteThread(thread.id);
    if (!result) return setAsking(false);
    setAsking(false);
    setGone(true);
    onDeleted(thread, result.deleted);
  }

  return (
    <div
      className={styles.collapsing}
      style={height === null ? undefined : { maxHeight: gone ? 0 : height, opacity: gone ? 0 : 1 }}
    >
      {asking ? (
        <div ref={box} className={styles.confirmRow} style={{ minHeight: height ?? undefined }}>
          <span className={styles.confirmIcon}>
            <Icon name="trash-2" size={15} />
          </span>
          <span className={styles.confirmText}>Delete {thread.name}?</span>
          <button type="button" className={styles.sectionAction} onClick={() => setAsking(false)}>
            Cancel
          </button>
          <button type="button" className={styles.danger} onClick={() => void confirm()}>
            Delete
          </button>
        </div>
      ) : (
        <div ref={box}>
          <Link
            // Says where this came from, which is what opens it beside the
            // list rather than on its own. A link somebody sends carries no
            // `from`, so it opens the thread alone.
            href={`/threads/${thread.id}?from=threads`}
            className={styles.row}
          >
            <span className={styles.rowIcon}>
              <Icon name={threadIcon(thread.icon)} size={18} />
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{thread.name}</span>
              <span className={styles.rowMeta}>{thread.meta}</span>
            </span>
            <span className={styles.rowTools}>
              {/* The default thread keeps the control and cannot use it. Hiding
                  it would leave somebody hunting for a delete that is simply
                  absent on one row; disabled with the reason on it answers the
                  question where they are already looking. */}
              <button
                type="button"
                className={styles.rowTool}
                data-tone="danger"
                disabled={thread.isDefault}
                aria-label={
                  thread.isDefault
                    ? `${thread.name} is your default thread and cannot be deleted`
                    : `Delete ${thread.name}`
                }
                title={
                  thread.isDefault
                    ? "Your default thread. Anything with no obvious home lands here."
                    : "Delete"
                }
                onClick={(event) => {
                  // Inside a link, so both, or the row navigates out from
                  // under the question it just opened.
                  event.preventDefault();
                  event.stopPropagation();
                  if (!thread.isDefault) setAsking(true);
                }}
              >
                <Icon name="trash-2" size={15} />
              </button>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

export function MyThreads({ groups, loading, onChanged }: Props) {
  const [undoable, setUndoable] = useState<{ id: string; message: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function offerUndo(thread: ThreadRow, deleted: boolean): void {
    // The eight seconds are real: the row is soft-deleted with a `purge_after`
    // and the purge job is what destroys it. Say which thing happened, because
    // leaving a shared thread and deleting one are not the same act and the
    // person is entitled to know which they just did.
    setUndoable({ id: thread.id, message: deleted ? "Thread deleted" : "You left the thread" });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoable(null), 8000);
    onChanged?.();
  }

  async function undo(): Promise<void> {
    if (!undoable) return;
    const { id } = undoable;
    setUndoable(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    await restoreThread(id);
    onChanged?.();
  }

  const total = groups.reduce((n, group) => n + group.threads.length, 0);
  const live = groups.find((group) => group.key === "now")?.threads.length ?? 0;

  if (!loading && total === 0) {
    // The kit's own line. True, and worth saying rather than showing a zero:
    // nobody makes a thread, they appear once enough has landed in one place
    // to be one.
    return (
      <QuietEmpty
        title="My threads"
        line="Threads appear here on their own, once there is enough in one place to be one."
      />
    );
  }

  return (
    <>
      <div className={styles.paneHead}>
        <div>
          <h1 className={`${styles.paneTitle} ${styles.paneTitleBig}`}>My threads</h1>
          {loading ? null : (
            <p className={styles.paneSub}>
              {total} in here, {live} live
            </p>
          )}
        </div>
      </div>

      <div className={styles.paneBody}>
        {loading ? null : (
          groups.map((group) =>
            group.threads.length === 0 ? null : (
              <section key={group.key}>
                {/* The first group has no heading. The kit omits it, and it is
                    right: the page title already says My threads, and a
                    heading directly under it that says something else is a
                    label for a list nobody was confused about. */}
                {group.key === "now" ? null : (
                  <h2 className={styles.section}>
                    {HEADINGS[group.key]}
                    <em
                      className={styles.sectionCount}
                      data-tone={TONE[group.key]}
                    >
                      {group.threads.length}
                    </em>
                  </h2>
                )}
                {group.threads.map((thread) => (
                  <Row key={thread.id} thread={thread} onDeleted={offerUndo} />
                ))}
              </section>
            )
          ))}
      </div>

      {undoable ? (
        <div className={styles.toastRow}>
          <div className={styles.toast}>
            <span className={styles.toastMessage}>{undoable.message}</span>
            <button type="button" className={styles.toastAction} onClick={() => void undo()}>
              Undo
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
