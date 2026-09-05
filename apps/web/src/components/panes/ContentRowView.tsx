"use client";

// One piece of content, as a row, wherever it appears.
//
// The thread's own list and every widget above it draw the same row and used to
// draw it twice. Only one copy had any controls, so a task in the To do widget
// could be ticked and nothing else: renaming it meant scrolling down and
// finding the same row again in "Everything else".
//
// Two things differ between the places it appears and both are slots: the
// **lead** is a type tile in the list and a checkbox in To do, and the **meta**
// line is who and when in the list and dates, tags and places in a widget.
// Everything else, the title, the inline rename, the tools and the delete
// confirmation, belongs to the row and is therefore written once.
//
// **The confirmation is web's alone.** The phones delete on a swipe with the
// toast as the way back, which is the gesture's own convention; here the row
// asks in its own place first. The two clients differ on purpose and
// `decisions.md` records the argument. It is the only control in the product
// that destroys something, and the eight seconds afterwards is a safety net
// rather than the whole safety story.

import Link from "next/link";
import { Icon } from "../Icon";
import { RowTools } from "./RowTools";
import styles from "../../app/(shell)/shell.module.css";
import { isFiling, type ContentRow } from "../../lib/threads";

/** Everything the row needs from whoever is holding the page's state. One
 *  object rather than nine props, because both callers pass the same nine and a
 *  list of them at each site is a list to keep in step. */
export interface RowHandlers {
  /** The row being renamed, and the text so far. */
  editing: string | null;
  draft: string;
  /** The row being asked about before deletion. */
  asking: string | null;
  /** Rows that arrived while somebody was looking at the screen. */
  arrived: Set<string>;
  onDraft: (text: string) => void;
  onEdit: (row: ContentRow) => void;
  onSaveTitle: (row: ContentRow) => void;
  onStopEditing: () => void;
  onArchive: (row: ContentRow) => void;
  onAsk: (id: string | null) => void;
  onDelete: (row: ContentRow) => void;
}

export function ContentRowView({
  row,
  lead,
  meta,
  handlers,
}: {
  row: ContentRow;
  /** The tile, the checkbox, whatever leads this row where it is shown. */
  lead: React.ReactNode;
  meta: React.ReactNode;
  handlers: RowHandlers;
}) {
  if (handlers.asking === row.id) {
    return (
      <div className={styles.confirmRow}>
        <span className={styles.confirmIcon}>
          <Icon name="trash-2" size={15} />
        </span>
        <span className={styles.confirmText}>Delete {row.title}?</span>
        <button
          type="button"
          className={styles.sectionAction}
          style={{ marginLeft: 0 }}
          onClick={() => handlers.onAsk(null)}
        >
          Cancel
        </button>
        <button type="button" className={styles.danger} onClick={() => handlers.onDelete(row)}>
          Delete
        </button>
      </div>
    );
  }

  return (
    <div
      className={styles.row}
      // Secondary ink and a hollow tile, never opacity: dimming a row on a warm
      // page reads as a rendering fault and takes the label under the contrast
      // floor with it.
      data-archived={row.archivedAt ? true : undefined}
      // A finished task keeps its place and takes tertiary ink with a 1px
      // strike. The tick, the sinking and the strike already say it, so there
      // is no opacity.
      data-done={row.doneAt ? true : undefined}
      // Moss, because moss is "offload did this, you didn't" and that is
      // exactly what happened. Blue is "this needs you", and a row that was
      // simply filed needs nothing.
      data-arrived={handlers.arrived.has(row.id) ? true : undefined}
    >
      {lead}

      <span className={styles.rowText}>
        {handlers.editing === row.id ? (
          <input
            className={styles.titleInput}
            value={handlers.draft}
            autoFocus
            onChange={(event) => handlers.onDraft(event.target.value)}
            onBlur={() => handlers.onSaveTitle(row)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handlers.onSaveTitle(row);
              if (event.key === "Escape") handlers.onStopEditing();
            }}
            aria-label="Title"
          />
        ) : (
          <Link href={`/content/${row.id}?from=thread`} className={styles.rowTitle}>
            {row.title}
          </Link>
        )}
        {meta}
      </span>

      {/* offload is still reading a row somebody typed straight in. The one
          spinner, not a second progress word: the readme reserves "filing" for
          the thread slot on a row that does not know where it is going, and
          this row knows. It is already saved and already usable; the spinner
          only says a tidier version may arrive. */}
      {isFiling(row.filingAt) ? (
        <span className={styles.rowFiling} role="status" aria-label="offload is reading this" />
      ) : null}

      <RowTools
        title={row.title}
        archived={row.archivedAt !== null}
        canDelete={row.canDelete}
        onEdit={() => handlers.onEdit(row)}
        onArchive={() => handlers.onArchive(row)}
        onDelete={() => handlers.onAsk(row.id)}
      />
    </div>
  );
}
