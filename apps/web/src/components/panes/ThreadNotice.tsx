"use client";

// The design system's ThreadNotice (2026-10-31): one full-width strip under a
// thread's read for anything the thread needs to tell the person. Solid moss
// with white from offload, ink from a person, the same in both themes. Two
// lines at most, one underlined word to act on, an x to dismiss.

import { useState } from "react";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import styles from "./ThreadNotice.module.css";

export function ThreadNotice({
  message,
  action,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel = "Dismiss",
  person,
}: {
  message: string;
  /** One word: Switch, Change. */
  action: string;
  /** What a screen reader hears for the action. */
  actionLabel: string;
  onAction: () => void;
  /** Called once the strip has left. */
  onDismiss: () => void;
  dismissLabel?: string;
  /** A person's notice, drawn in ink with their face; offload's otherwise. */
  person?: { uid: string; initials: string; name: string } | undefined;
}) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div
      className={`${styles.notice} ${person ? styles.person : ""} ${leaving ? styles.leaving : ""}`}
      data-notice={person ? "person" : "offload"}
      aria-live="polite"
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) onDismiss();
      }}
    >
      {person ? <Avatar uid={person.uid} initials={person.initials} name={person.name} size={28} /> : <Icon name="sparkles" size={20} />}
      <span className={styles.message}>{message}</span>
      <button type="button" className={styles.action} aria-label={actionLabel} onClick={onAction}>
        {action}
      </button>
      <button type="button" className={styles.dismiss} aria-label={dismissLabel} onClick={() => setLeaving(true)}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
