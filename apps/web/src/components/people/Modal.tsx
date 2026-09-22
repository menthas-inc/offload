"use client";

// The web kit's `WModal`: a centred card over the scrim, since sharing is not
// a place you navigate to. Escape and the scrim close it; a portal, so it is
// over the panes and not inside one.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./people.module.css";

export function Modal({
  label,
  wide = false,
  onClose,
  children,
}: {
  label: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus moves into the dialog and back out to whatever opened it, so a
  // keyboard reaches its controls and lands where it was when it closes.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>("input, button");
    (first ?? box.current)?.focus();
    return () => before?.focus();
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div
        ref={box}
        className={`${styles.modal} ${wide ? styles.modalWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmRow {
  title: string;
  meta?: string | undefined;
  icon?: React.ReactNode;
}

/** A confirmation with a body and a bounded list: the design's Remove, Block
 *  and Take out, and Withdraw and Leave beside them. Two rows and a count. */
export function ConfirmModal({
  title,
  body,
  rows = [],
  rowCount,
  hint,
  action,
  danger = false,
  busy = false,
  failed = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  rows?: ConfirmRow[];
  rowCount?: number | undefined;
  hint?: string | undefined;
  action: string;
  danger?: boolean;
  busy?: boolean;
  failed?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const shown = rows.slice(0, 2);
  const more = (rowCount ?? rows.length) - shown.length;
  return (
    <Modal label={title} onClose={onClose}>
      <h2 className={styles.modalTitle}>{title}</h2>
      <p className={styles.modalBody}>{body}</p>
      {shown.length > 0 ? (
        <ul className={styles.modalList}>
          {shown.map((row, i) => (
            <li key={`${row.title}-${i}`} className={styles.modalListRow}>
              {row.icon ? <span className={styles.modalListLead}>{row.icon}</span> : null}
              <span className={styles.modalListName}>{row.title}</span>
              {row.meta ? <span className={styles.modalListMeta}>{row.meta}</span> : null}
            </li>
          ))}
          {more > 0 ? <li className={styles.modalListMore}>and {more} more</li> : null}
        </ul>
      ) : null}
      {hint ? <p className={styles.modalHint}>{hint}</p> : null}
      {failed ? (
        <p className={styles.failed} role="alert">
          That didn&rsquo;t go through.
        </p>
      ) : null}
      <div className={styles.modalActions}>
        <button type="button" className={styles.ghost} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={danger ? styles.danger : styles.primary} onClick={onConfirm} disabled={busy}>
          {failed ? "Try again" : action}
        </button>
      </div>
    </Modal>
  );
}
