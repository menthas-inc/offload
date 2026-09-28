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
// line is who and when in the list and places in a widget.
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
import { DateChip } from "../shell/DateChip";
import { PhotoThumb } from "../shell/PhotoThumb";
import { ReorderHandle, RowTools, type RowReorder } from "./RowTools";
import styles from "../../app/(shell)/shell.module.css";
import { domainOf, isFiling, isProvisional, type ContentRow } from "../../lib/threads";
import { webHref } from "../../lib/links";
import type { Label } from "../../lib/labels";
import { LabelMark } from "../labels/LabelMark";
import labelStyles from "../labels/labels.module.css";

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
  /** 020. A photo row's tile opens the viewer; the row itself opens as a row. */
  onOpenPhoto?: (row: ContentRow) => void;
  /** 025. The thread's labels by id, so a row can draw its marks. Absent where
   *  the page draws them itself (Today, beside the thread's name). */
  labels?: Map<string, Label>;
  /** 025. The tag tool and a mark: the label sheet for this row, and a
   *  label's list. Absent where the page offers neither. */
  onLabel?: (row: ContentRow, anchor: HTMLElement) => void;
  onOpenLabel?: (labelId: string) => void;
}

export function ContentRowView({
  row,
  lead,
  meta,
  handlers,
  reorder,
}: {
  row: ContentRow;
  /** The tile, the checkbox, whatever leads this row where it is shown. */
  lead: React.ReactNode;
  meta: React.ReactNode;
  handlers: RowHandlers;
  /** The row can be dragged to a new place in its list. Only To do offers it:
   *  it is the one list a person arranges, and the handle it draws is the one
   *  control here that does nothing when clicked. */
  reorder?: RowReorder | undefined;
}) {
  // Shown on a link row and nowhere else. What says the row goes somewhere.
  const domain = domainOf(row.url);
  // A link with an address is a door: the row opens the page.
  const door = row.type === "link" && Boolean(row.url) && !row.archivedAt;
  // A row drawn at the press, before the server has it. It looks like the row
  // it is about to be and offers nothing: there is nothing to open, move or
  // act on until the write lands and the id is real. The handle and the tools
  // stay in the layout and are hidden by the stylesheet, so nothing reflows
  // when the id arrives, which is the readme's own rule for the filing slot.
  const provisional = isProvisional(row.id);
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
      data-provisional={provisional ? true : undefined}
      // A drop target while a row in the same list is being dragged. The line
      // is drawn on whichever edge the dragged row would land on, and the row
      // under the pointer is what the list reads to decide where.
      data-drag-row={reorder ? true : undefined}
      data-dragging={reorder?.dragging ? true : undefined}
      data-over={reorder?.over ?? undefined}
      onDragOver={
        reorder
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              reorder.onDragOver();
            }
          : undefined
      }
      onDrop={
        reorder
          ? (event) => {
              event.preventDefault();
              reorder.onDrop();
            }
          : undefined
      }
    >
      {/* The move area, leading the row, left of the checkbox. Always drawn,
          no container: where a list is held, not one of its actions. */}
      {reorder ? <ReorderHandle title={row.title} reorder={reorder} /> : null}

      {/* **The page's own picture, in place of the type tile.** A listing is
          recognised by its photo long before its title, and the tile is already
          the right size and shape. Only on a link, so it can never displace the
          checkbox a task's lead carries, and only while the row is live: an
          archived row is a hollow tile by design.

          Loaded from the site by this browser, which is the trade the cheap
          shape makes. Written down in the privacy policy, not only here.
          `referrerPolicy` so the site is not told which page it was loaded
          from, and `decorative` alt because the page chose a picture, not a
          description of one. */}
      {row.type === "link" && row.imageUrl && !row.archivedAt ? (
        <img
          src={row.imageUrl}
          alt=""
          className={styles.rowThumb}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : row.photo && !row.archivedAt ? (
        // 020. The photo itself, in the same slot and at the same size the
        // link row's picture takes, and the one part of the row that opens the
        // viewer: the title still opens the row. The glyph until the renditions
        // exist.
        <button
          type="button"
          className={styles.rowThumbButton}
          aria-label={`Open ${row.title}`}
          onClick={() => handlers.onOpenPhoto?.(row)}
        >
          <PhotoThumb
            blobId={row.photo.blobId}
            ready={row.photo.ready}
            alt=""
            className={styles.rowThumb}
            fallback={lead}
          />
        </button>
      ) : (
        lead
      )}

      <span className={styles.rowText}>
        {/* 023. The title line carries the date chip at its trailing edge. */}
        <span className={styles.rowLine}>
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
        ) : provisional ? (
          <span className={styles.rowTitle}>{row.title}</span>
        ) : door ? (
          // 21 September design: a link's row is a door. The title opens the
          // page, the one row in the product whose content lives somewhere
          // else, with arrow-up-right saying so, since a chevron promises a
          // screen inside the app. A new tab, and `noreferrer` with it, so the
          // page is not told which thread it was opened from. The row's own
          // tools stay in the row.
          <a
            href={webHref(row.url)}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.rowTitle}
          >
            {row.title}
            <span className={styles.rowDoor} aria-hidden="true">
              <Icon name="arrow-up-right" size={14} />
            </span>
          </a>
        ) : (
          <Link href={`/content/${row.id}?from=thread`} className={styles.rowTitle}>
            {row.title}
          </Link>
        )}
          {/* 025. The marks line: the date chip, then the row's labels,
              wrapping. A row with neither draws nothing. */}
          <span className={labelStyles.marks}>
            <DateChip row={row} isReminder={row.isReminder} />
            {handlers.labels
              ? row.labels.map((id) => {
                  const label = handlers.labels!.get(id);
                  if (!label) return null;
                  const open = handlers.onOpenLabel;
                  return (
                    <LabelMark key={id} color={label.colour} onClick={open && !provisional ? () => open(id) : undefined}>
                      {label.name}
                    </LabelMark>
                  );
                })
              : null}
          </span>
        </span>
        {meta}

        {/* The domain under the title, as the caption that says where the
            door goes. Ours rather than the page's: a title is written by
            whoever owns the page and a domain is not. */}
        {domain ? (
          <span className={styles.rowLink}>
            <Icon name="link" size={12} />
            {domain}
          </span>
        ) : null}
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
        onLabel={
          handlers.onLabel && row.labels.length === 0 && !provisional
            ? (anchor) => handlers.onLabel!(row, anchor)
            : undefined
        }
        onEdit={() => handlers.onEdit(row)}
        onArchive={() => handlers.onArchive(row)}
        onDelete={() => handlers.onAsk(row.id)}
      />
    </div>
  );
}
