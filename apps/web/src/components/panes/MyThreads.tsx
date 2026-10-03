"use client";

// My threads. From ui_kits/web_app/WApp.jsx's WThings.
//
// One list by last activity, then Older threads, which is derived from
// activity, because a thread does not become old, it stops being used. The
// server derives it so all three clients agree. 028 retired Always on, whose
// only thread was the default thread, and put Not in a thread between the two.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { QuietEmpty } from "./QuietEmpty";
import { ThreadIcon } from "../ThreadIcon";
import { useToast } from "../shell/Toast";
import styles from "../../app/(shell)/shell.module.css";
import { deleteThread, restoreThread, type GroupKey, type ThreadGroup, type ThreadRow } from "../../lib/threads";
import type { Invitation } from "../../lib/people";
import { InvitationStrip } from "../people/InvitationStrip";
import { InvitationModal } from "../people/InvitationModal";
import { LooseGroup } from "../loose/LooseGroup";
import type { LooseSummary } from "../../lib/loose";

const HEADINGS: Record<GroupKey, string> = {
  now: "For now",
  older: "Older threads",
};

interface Props {
  groups: ThreadGroup[];
  /** 028. What is not in a thread. Null draws no group. */
  loose?: LooseSummary | null;
  /** 022. Waiting shares, one strip each at the top. */
  invitations?: Invitation[];
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
            <ThreadIcon icon={thread.icon} hue={thread.hue} seed={thread.id} size={32} className={styles.rowThreadIcon} />
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{thread.name}</span>
              {thread.meta ? <span className={styles.rowMeta}>{thread.meta}</span> : null}
            </span>
            <span className={styles.rowTools}>
              <button
                type="button"
                className={styles.rowTool}
                data-tone="danger"
                aria-label={`Delete ${thread.name}`}
                title="Delete"
                onClick={(event) => {
                  // Inside a link, so both, or the row navigates out from
                  // under the question it just opened.
                  event.preventDefault();
                  event.stopPropagation();
                  setAsking(true);
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

export function MyThreads({ groups, loose = null, invitations = [], loading, onChanged }: Props) {
  const toast = useToast();
  const [looking, setLooking] = useState<Invitation | null>(null);
  const strips = invitations.map((invitation) => (
    <InvitationStrip key={invitation.memberId} invitation={invitation} onLook={() => setLooking(invitation)} />
  ));
  const modal = looking ? (
    <InvitationModal
      invitation={looking}
      onClose={() => {
        setLooking(null);
        onChanged?.();
      }}
      onGone={() => onChanged?.()}
    />
  ) : null;

  function offerUndo(thread: ThreadRow, deleted: boolean): void {
    // The eight seconds are real: the row is soft-deleted with a `purge_after`
    // and the purge job is what destroys it. Say which thing happened, because
    // leaving a shared thread and deleting one are not the same act and the
    // person is entitled to know which they just did.
    toast.show(deleted ? "Thread deleted" : "You left the thread", {
      label: "Undo",
      onPress: async () => {
        await restoreThread(thread.id);
        onChanged?.();
      },
    });
    onChanged?.();
  }

  const total = groups.reduce((n, group) => n + group.threads.length, 0);

  function list(key: GroupKey) {
    const group = groups.find((one) => one.key === key);
    if (!group || group.threads.length === 0) return null;
    return (
      <section key={key}>
        {/* The first group has no heading. The kit omits it, and it is
            right: the page title already says My threads, and a heading
            directly under it that says something else is a label for a list
            nobody was confused about. */}
        {key === "now" ? null : (
          <h2 className={styles.section}>
            {HEADINGS[key]}
            <em className={styles.sectionCount}>{group.threads.length}</em>
          </h2>
        )}
        {group.threads.map((thread) => (
          <Row key={thread.id} thread={thread} onDeleted={offerUndo} />
        ))}
      </section>
    );
  }
  const live = groups.find((group) => group.key === "now")?.threads.length ?? 0;

  // 028. The threads only: what is not in a thread is not one.
  if (!loading && total === 0 && !loose) {
    // The kit's own line. True, and worth saying rather than showing a zero:
    // nobody makes a thread, they appear once enough has landed in one place
    // to be one.
    return (
      <>
        {/* 022. A strip stays over the empty state: a first thread may well
            be somebody else's. */}
        {strips.length > 0 ? <div className={styles.paneBody}>{strips}</div> : null}
        <QuietEmpty
          title="My threads"
          line="Threads appear here on their own, once there is enough in one place to be one."
        />
        {modal}
      </>
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
        {strips}
        {loading ? null : (
          <>
            {list("now")}
            {/* 028. Between the first list and Older threads, as `WThings`
                draws it, and not drawn when there is nothing in it. */}
            {loose && loose.count > 0 ? <LooseGroup summary={loose} onChanged={() => onChanged?.()} /> : null}
            {list("older")}
          </>
        )}
      </div>
      {modal}
    </>
  );
}
