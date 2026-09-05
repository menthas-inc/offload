"use client";

// What you can do to one row, on the row.
//
// One copy, used by the thread's own list and by every widget above it. They
// drew different rows and only one of them drew any controls at all, so a task
// in the To do widget could be ticked and nothing else: to rename it you had to
// find the same row again further down the page.
//
// **Conditional, never refused.** Edit and archive are on the row for any
// member; delete is the author's and is simply absent otherwise, which is the
// readme's rule and OFF-3's. Two rows side by side showing a different number
// of controls is the honest reading of one permission rule, and a control that
// is drawn and then refused teaches somebody a rule that is not true.
//
// Anything beyond these three goes behind the row's own `ellipsis` on web, or a
// `RowActionSheet` on a phone. Nothing has needed a fourth yet.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export function RowTools({
  title,
  archived,
  onEdit,
  onArchive,
  onDelete,
}: {
  title: string;
  archived: boolean;
  onEdit: () => void;
  onArchive: () => void;
  /** Omit and no delete is drawn. */
  onDelete?: (() => void) | undefined;
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
      <button
        type="button"
        className={styles.tool}
        aria-label={archived ? "Put back in the list" : "Archive"}
        title={archived ? "Put back in the list" : "Archive"}
        onClick={onArchive}
      >
        <Icon name={archived ? "rewind" : "archive"} size={15} />
      </button>
      {onDelete ? (
        <button
          type="button"
          className={styles.toolDanger}
          aria-label={`Delete ${title}`}
          title="Delete"
          onClick={onDelete}
        >
          <Icon name="trash-2" size={15} />
        </button>
      ) : null}
    </span>
  );
}
