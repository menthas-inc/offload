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
//
// **And a handle, since 2026-09-16, which is not an action and not a tool.**
// A row in a list somebody can arrange draws `grip-vertical` at its leading
// edge, left of the checkbox, always, with no container: a move area rather
// than a button. It does nothing when clicked: it is dragged, or it takes the
// arrow keys, and either way the row moves and its priority follows. It sat
// with the tools for a few hours and read as a fourth action beside Edit,
// which it is not, so the product owner moved it to where a list is held.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

/** What a row that can be moved needs from the list it is in.
 *
 *  The list owns the order and the arithmetic; the row owns the handle and the
 *  drop target. `over` is where the dragged row would land relative to this
 *  one, so the row can draw the line on the right edge. */
export interface RowReorder {
  over: "above" | "below" | null;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  /** One step up or down, from the keyboard. */
  onStep: (delta: -1 | 1) => void;
}

/** The handle, at the leading edge of a row that can be moved. A button for
 *  the keyboard's sake, drawn as nothing but the grip. */
export function ReorderHandle({ title, reorder }: { title: string; reorder: RowReorder }) {
  return (
    <button
      type="button"
      className={styles.grip}
      draggable
      aria-label={`Move ${title}`}
      title="Drag, or use the arrow keys"
      onDragStart={(event) => {
        // Firefox starts no drag without data on it. The title is as good as
        // anything: nothing reads it back.
        event.dataTransfer.setData("text/plain", title);
        event.dataTransfer.effectAllowed = "move";
        // The whole row travels with the pointer, not the 32px handle.
        const row = event.currentTarget.closest("[data-drag-row]");
        if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 24, 24);
        reorder.onDragStart();
      }}
      onDragEnd={reorder.onDragEnd}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          reorder.onStep(-1);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          reorder.onStep(1);
        }
      }}
    >
      <Icon name="grip-vertical" size={15} />
    </button>
  );
}

export function RowTools({
  title,
  archived,
  canDelete,
  onLabel,
  onEdit,
  onArchive,
  onDelete,
}: {
  title: string;
  archived: boolean;
  /** Yours, or nobody's: Archive and Delete, where anybody else's row has
   *  Archive alone. */
  canDelete: boolean;
  /** 025. A row with no label draws the tag tool, whoever wrote it. */
  onLabel?: ((anchor: HTMLElement) => void) | undefined;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <span className={styles.rowTools}>
      {/* 025. A row carrying no label draws `tag` first, because it is the
          one control that says labels exist; a labelled row draws its marks
          instead. "Two controls, never three" went for your own rows on
          2026-10-17, which carry Archive beside Delete. */}
      {onLabel ? (
        <button
          type="button"
          className={styles.tool}
          aria-label={`Label ${title}`}
          onClick={(event) => onLabel(event.currentTarget)}
        >
          <Icon name="tag" size={15} />
        </button>
      ) : null}
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
          alone. 2026-10-17 (the owner): your own row offers Archive beside
          Delete, for tidying away what is not in use without losing it. */}
      {!archived && canDelete ? (
        <button
          type="button"
          className={styles.tool}
          aria-label={`Archive ${title}`}
          title="Archive"
          onClick={onArchive}
        >
          <Icon name="archive" size={15} />
        </button>
      ) : null}
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
