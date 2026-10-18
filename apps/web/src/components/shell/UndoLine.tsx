"use client";

// The design system's UndoLine (2026-10-18): the way back drawn where the
// change is. `slot` in the place a removed thing left, `under` a thing that
// changed, `plate` above the composer. A refusal is the same line with
// circle-alert, its clause and Retry, no rule, and is not red, as with Toast.

import { UNDO_MS, type UndoEntry } from "@offload/widgets";
import { Icon } from "../Icon";
import { undoStore, useReturned, useUndoEntry } from "../../lib/undo";
import styles from "../../app/(shell)/undo.module.css";

export function UndoLine({ entry, radius }: { entry: UndoEntry; radius?: string | undefined }) {
  const left = Math.max(0, UNDO_MS - (Date.now() - entry.startedAt));
  const action = entry.action;
  return (
    <div
      className={`${styles.line} ${styles[entry.form]}`}
      role={entry.failed ? "alert" : "status"}
      style={radius ? ({ "--undo-radius": radius } as React.CSSProperties) : undefined}
    >
      <Icon name={entry.failed ? "circle-alert" : entry.icon} size={entry.form === "under" ? 14 : 16} className={styles.glyph} />
      <span className={styles.message}>{entry.message}</span>
      {action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            undoStore.drop(entry.id, { returned: action.label === "Undo" });
            void action.onPress();
          }}
        >
          {action.label}
        </button>
      ) : null}
      {entry.failed ? null : (
        // Started where the window is now, so a line drawn late shows the time left.
        <span
          className={styles.clock}
          aria-hidden="true"
          style={{ animationDuration: `${UNDO_MS}ms`, animationDelay: `${left - UNDO_MS}ms` }}
        />
      )}
    </div>
  );
}

/** The lines for changes made off screen, stacked above the composer. */
export function UndoPlates({ entries }: { entries: UndoEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className={styles.plates}>
      {entries.map((entry) => (
        <UndoLine key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

/** The line for one id at a fixed spot, when there is one. */
export function UndoAt({ id, radius }: { id: string; radius?: string | undefined }) {
  const entry = useUndoEntry(id);
  return entry ? <UndoLine entry={entry} radius={radius} /> : null;
}

/** A thing Undo just brought back, softly lit for a moment where it returned. */
export function Returned({ id, children }: { id: string; children: React.ReactNode }) {
  const returned = useReturned();
  return returned(id) ? <div className={styles.returned}>{children}</div> : <>{children}</>;
}
