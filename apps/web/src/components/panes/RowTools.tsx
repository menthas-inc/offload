"use client";

// What you can do to one row, on the row.
//
// One copy, used by the thread's own list and by every widget above it. They
// drew different rows and only one of them drew any controls at all, so a task
// in the To do widget could be ticked and nothing else: to rename it you had to
// find the same row again further down the page.
//
// **Two controls, never three: edit, and one way out.** Which way out you get
// is decided by whether the row is yours. Your own content offers Delete;
// somebody else's, in a shared thread, offers Archive, because OFF-3 says you
// may not destroy what another person wrote and a thread still has to be
// tidyable by the people in it.
//
// They were both drawn for a while and that was one control too many: on a
// solo thread, where every row is yours, Archive and Delete are two answers to
// the same question and only one of them is honest about what it does. Offering
// exactly one also means the row never draws a control the server would refuse,
// which is the readme's rule: conditional, never refused.
//
// Anything beyond these two goes behind the row's own `ellipsis` on web, or a
// `RowActionSheet` on a phone. Nothing has needed a third yet.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export function RowTools({
  title,
  archived,
  canDelete,
  onEdit,
  onArchive,
  onDelete,
}: {
  title: string;
  archived: boolean;
  /** Yours, or nobody's. Decides which of the two ways out is drawn. */
  canDelete: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <span className={styles.rowTools}>
      <button
        type="button"
        className={styles.tool}
        aria-label={`Edit ${title}`}
        title="Edit"
        onClick={onEdit}
      >
        <Icon name="pencil" size={15} />
      </button>

      {/* An archived row always offers the way back, whoever is looking:
          putting something back is not destructive and is not the author's
          alone. */}
      {archived ? (
        <button
          type="button"
          className={styles.tool}
          aria-label={`Put ${title} back in the list`}
          title="Put back in the list"
          onClick={onArchive}
        >
          <Icon name="rewind" size={15} />
        </button>
      ) : canDelete ? (
        <button
          type="button"
          className={styles.toolDanger}
          aria-label={`Delete ${title}`}
          title="Delete"
          onClick={onDelete}
        >
          <Icon name="trash-2" size={15} />
        </button>
      ) : (
        <button
          type="button"
          className={styles.tool}
          aria-label={`Archive ${title}`}
          title="Archive"
          onClick={onArchive}
        >
          <Icon name="archive" size={15} />
        </button>
      )}
    </span>
  );
}
