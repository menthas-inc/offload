"use client";

// The page furniture, from the kit's `APaneHead`, `AStat`, `ASection` and
// `AStatus`, and the three states every page has (034, section 0.1).

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../components/Icon";
import styles from "../admin.module.css";
import { clock } from "./format";

/** The pane's head: a title, a quiet line under it, and the page's tools.
 *  A page of figures also says when it was read and offers a refresh. */
export function PaneHead({
  title,
  sub,
  tools,
  asOf,
  onRefresh,
}: {
  title: string;
  sub?: React.ReactNode;
  tools?: React.ReactNode;
  asOf?: Date | null;
  onRefresh?: () => void;
}) {
  return (
    <div className={styles.paneHead}>
      <span>
        <h1 className={styles.paneTitle}>{title}</h1>
        {sub ? <span className={styles.paneSub}>{sub}</span> : null}
      </span>
      {tools || asOf ? (
        <span className={styles.headTools}>
          {asOf ? <span className={styles.asOf}>As of {clock(asOf)}</span> : null}
          {asOf && onRefresh ? (
            <button type="button" className={styles.ghost} onClick={onRefresh}>
              Refresh
            </button>
          ) : null}
          {tools}
        </span>
      ) : null}
    </div>
  );
}

/** The one way back from a person's page. It always says People. */
export function Back() {
  return (
    <Link href="/admin/people" className={styles.backLink}>
      <Icon name="chevron-left" size={15} />
      People
    </Link>
  );
}

/** Numbers that matter, three or four across, never a grid of twelve. */
export function Stats({ children }: { children: React.ReactNode }) {
  return <div className={styles.stats}>{children}</div>;
}

export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "attention" }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} data-tone={tone}>
        {value}
      </div>
      {note ? <div className={styles.statNote}>{note}</div> : null}
    </div>
  );
}

export function Section({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{children}</h2>
      {note ? <span className={styles.sectionNote}>{note}</span> : null}
    </div>
  );
}

export function Notes({ items }: { items: readonly string[] }) {
  return (
    <ul className={styles.notes}>
      {items.map((line) => (
        <li key={line} className={styles.noteItem}>
          <span className={styles.noteBullet}>·</span>
          {line}
        </li>
      ))}
    </ul>
  );
}

export type Tone = "plain" | "accent" | "attention" | "danger";

/** Every state the panel names, and the one tone each is drawn in. Accent
 *  for what is as it should be, attention for what wants somebody, danger for
 *  what has failed, plain for the rest. A state this does not know is plain. */
const TONES: Record<string, Tone> = {
  active: "accent",
  accepted: "accent",
  up: "accent",
  ok: "accent",
  done: "accent",
  billed: "accent",
  invited: "attention",
  late: "attention",
  stuck: "attention",
  deleting: "attention",
  running: "attention",
  down: "danger",
  dead: "danger",
  failed: "danger",
};

export function toneOf(value: string): Tone {
  return TONES[value] ?? "plain";
}

export function StatusPill({ value, label }: { value: string; label?: string }) {
  return (
    <span className={styles.badge} data-tone={toneOf(value)}>
      {label ?? value}
    </span>
  );
}

/** One spinner for the page, never one per section, and no skeleton. */
export function Loading() {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.srOnly}>Loading</span>
    </div>
  );
}

/** A failed read. Never an empty list: it says what did not load, beside the
 *  control that tries again. */
export function Failed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className={styles.failed} role="alert">
      Couldn&apos;t load {what}.
      <button type="button" className={styles.small} onClick={onRetry}>
        Try again
      </button>
    </p>
  );
}

/** A short line with no zero. The page keeps its tools. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

/** Confirmation of a write: bottom right, gone in four seconds. The panel has
 *  no Undo, so this never carries one. */
export function useSay(): { toast: React.ReactNode; say: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);
  const toast = message ? (
    <p className={styles.toast} role="status" aria-live="polite">
      {message}
    </p>
  ) : null;
  return { toast, say };
}
