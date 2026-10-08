"use client";

// The photo, larger.
//
// The one screen no kit draws. It opens over whatever was on screen, on a
// dark plane (not `--surface-scrim`, whose 0.32 let a white screenshot read
// as a page behind a page; decisions.md 2026-09-18): the large rendition as
// big as the window allows, and beneath it the row's title and what the row
// says about the picture, which is where the four things offload wrote are
// read. The controls follow the kit's pane pattern, `maximize-2` then
// `ellipsis` then `x`: Full screen, More, Close. More holds the row's own
// tools: rename, move for the author, and one way out, never two, as the
// row's own tools have it since 5 September: put back when archived, delete
// for the author, archive for anybody else (OFF-3). Delete asks first, as
// every delete on the web does.
//
// A set is paged with the arrows and the arrow keys; Esc and the plane close
// it; focus stays inside and goes back where it came from; reduced motion
// opens it plain. Nothing else is here: no filter, no edit, no share. It is a
// viewer with the row's controls on it, not an editor.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { photoCaption, ARCHIVE_SHARED, archiveAsk, asksBeforeArchive } from "@offload/widgets";
import { Icon } from "../Icon";
import { MoveSheet } from "./MoveSheet";
import { PhotoThumb } from "./PhotoThumb";
import type { ContentRow, ThreadRow } from "../../lib/threads";
import styles from "../../app/(shell)/viewer.module.css";

export interface ViewerPhoto {
  blobId: string;
  ready: boolean;
  width: number;
  height: number;
  /** The row's title, or the photo's name in the conversation. */
  title: string;
  /** What the row says about the picture, when there is a row. */
  body?: string | null;
  /** The row, when the photo was opened from one. Its tools follow it. */
  row?: ContentRow;
  /** This device's copy of a photo just sent, until the renditions land. */
  localUrl?: string | undefined;
}

export interface ViewerActions {
  onRename: (row: ContentRow, title: string) => Promise<void> | void;
  onMove: (row: ContentRow, thread: ThreadRow) => Promise<void> | void;
  onArchive: (row: ContentRow) => Promise<void> | void;
  onDelete: (row: ContentRow) => Promise<void> | void;
}

export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  actions,
  threadId,
  shared = null,
}: {
  /** 2026-10-07. Whether the thread has others in it, where known: archive
   *  hides a row for everyone there, so it asks first. */
  shared?: boolean | null;
  photos: ViewerPhoto[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
  actions?: ViewerActions;
  /** The thread the photos are in, so the move sheet leaves it out. */
  threadId?: string;
}) {
  const photo = photos[index];
  const figure = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [asking, setAsking] = useState<"delete" | "archive" | false>(false);
  // Bumped by the Retry under "Not here yet.": the same id, a new attempt.
  const [attempt, setAttempt] = useState(0);
  const plane = useRef<HTMLDivElement>(null);

  // Every control state resets when the picture changes.
  useEffect(() => {
    setMenu(false);
    setRenaming(null);
    setMoving(false);
    setAsking(false);
  }, [index]);

  // Focus goes to Close on open and back where it came from on close, which
  // is what a dialog owes the keyboard.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (moving) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (menu || renaming !== null || asking) {
          setMenu(false);
          setRenaming(null);
          setAsking(false);
        } else onClose();
        return;
      }
      // Tab stays inside the dialog.
      if (event.key === "Tab" && plane.current) {
        const focusable = [...plane.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, [tabindex]:not([tabindex='-1'])")];
        if (focusable.length > 0) {
          const first = focusable[0]!;
          const last = focusable[focusable.length - 1]!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
      // The arrows page the set, unless a field or a question has them.
      if (renaming !== null || asking) return;
      if (event.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex, onClose, menu, renaming, asking, moving]);

  if (!photo) return null;
  const row = photo.row;
  const canTools = Boolean(row && actions);

  function fullScreen(): void {
    const el = figure.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  // Through a portal onto the body: the panes animate with a transform, which
  // makes each one a stacking context, and a fixed scrim inside one sits under
  // the composer however high its own z-index goes.
  const scrim = (
    <div
      ref={plane}
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={photo.title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.tools}>
        <button type="button" className={styles.tool} aria-label="Full screen" title="Full screen" onClick={fullScreen}>
          <Icon name="maximize-2" size={20} />
        </button>
        {canTools ? (
          <span className={styles.more}>
            <button
              type="button"
              className={styles.tool}
              aria-label="More"
              title="More"
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
            >
              <Icon name="ellipsis" size={20} />
            </button>
            {menu && row ? (
              <ul className={styles.menu} role="menu">
                <li>
                  <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setMenu(false); setRenaming(row.title); }}>
                    Rename
                  </button>
                </li>
                {row.canMove ? (
                  <li>
                    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setMenu(false); setMoving(true); }}>
                      Move
                    </button>
                  </li>
                ) : null}
                {/* One way out, never two: the rows' own rule. */}
                {row.archivedAt ? (
                  <li>
                    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setMenu(false); void actions?.onArchive(row); }}>
                      Put back in the thread
                    </button>
                  </li>
                ) : row.canDelete ? (
                  <li>
                    <button type="button" role="menuitem" className={styles.menuItem} data-danger="true" onClick={() => { setMenu(false); setAsking("delete"); }}>
                      Delete
                    </button>
                  </li>
                ) : (
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        setMenu(false);
                        if (asksBeforeArchive(row, shared)) setAsking("archive");
                        else void actions?.onArchive(row);
                      }}
                    >
                      Archive
                    </button>
                  </li>
                )}
              </ul>
            ) : null}
          </span>
        ) : null}
        <button ref={closeButton} type="button" className={styles.tool} aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={20} />
        </button>
      </div>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            className={styles.page}
            data-side="left"
            aria-label="Previous"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
          >
            <Icon name="chevron-left" size={20} />
          </button>
          <button
            type="button"
            className={styles.page}
            data-side="right"
            aria-label="Next"
            disabled={index === photos.length - 1}
            onClick={() => onIndex(index + 1)}
          >
            <Icon name="chevron-right" size={20} />
          </button>
        </>
      ) : null}

      <figure ref={figure} className={styles.figure}>
        <PhotoThumb
          blobId={photo.blobId}
          ready={photo.ready}
          rendition="large"
          alt={photoCaption(photo.body) ?? photo.title}
          className={styles.picture}
          localSrc={photo.localUrl}
          attempt={attempt}
          fallback={
            <span className={styles.notYet}>
              <Icon name="image" size={28} />
              <span>Not here yet.</span>
              <button type="button" className={styles.notYetRetry} onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </span>
          }
        />
        <figcaption className={styles.caption}>
          {renaming !== null && row ? (
            <input
              className={styles.rename}
              value={renaming}
              autoFocus
              aria-label="Title"
              onChange={(event) => setRenaming(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const title = renaming.trim();
                  setRenaming(null);
                  if (title && title !== row.title) void actions?.onRename(row, title);
                }
                if (event.key === "Escape") setRenaming(null);
              }}
              onBlur={() => setRenaming(null)}
            />
          ) : (
            <h2 className={styles.title}>{photo.title}</h2>
          )}
          {asking === "archive" && row ? (
            <p className={styles.confirm}>
              {archiveAsk(row.title)} {ARCHIVE_SHARED}
              <button type="button" className={styles.confirmCancel} onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmDelete} onClick={() => { setAsking(false); void actions?.onArchive(row); }}>
                Archive
              </button>
            </p>
          ) : null}
          {asking === "delete" && row ? (
            <p className={styles.confirm}>
              Delete {row.title}?
              <button type="button" className={styles.confirmCancel} onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmDelete} onClick={() => { setAsking(false); void actions?.onDelete(row); }}>
                Delete
              </button>
            </p>
          ) : null}
          {/* The caption, never the words read out of the picture: those
              stay stored for search and are not details (2026-09-29). */}
          {photoCaption(photo.body) ? <p className={styles.body}>{photoCaption(photo.body)}</p> : null}
          {photos.length > 1 ? (
            <p className={styles.count}>
              {index + 1} of {photos.length}
            </p>
          ) : null}
        </figcaption>
      </figure>

      {moving && row ? (
        <MoveSheet
          exceptThreadId={threadId ?? null}
          onClose={() => setMoving(false)}
          onPick={(thread) => {
            setMoving(false);
            void actions?.onMove(row, thread);
          }}
        />
      ) : null}
    </div>
  );
  return createPortal(scrim, document.body);
}
