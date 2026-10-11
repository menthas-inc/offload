// 031. What each choice tile shows: a light and a dark screen and one split
// down the middle for System, the week with its first day filled and the
// weekend quieter, two sizes of Aa. From `explorations/settings-v2.html`.
// 042 adds How many: a short line ending at a date, with one, two or three
// marks before it.

import { resolved } from "@offload/tokens";
import styles from "../../app/(shell)/shell.module.css";

/** **The colours of a theme, not of this page.** Each theme's own values,
 *  resolved, the ones the phones draw their previews with, set inline so a
 *  Light tile stays light in dark. The web's token sheet has no light scope
 *  to pin a subtree to, and retyping the values would be a second source. */
const DEPICT = {
  "--depict-light-page": resolved.light["surface-page"],
  "--depict-light-bar": resolved.light["ink-200"],
  "--depict-light-edge": resolved.light["border-hairline"],
  "--depict-dark-page": resolved.dark["surface-page"],
  "--depict-dark-bar": resolved.light["ink-700"],
} as React.CSSProperties;

function Bars({ two }: { two?: boolean }) {
  return (
    <>
      <span className={styles.depictBar} />
      <span className={styles.depictBar} />
      {two ? null : <span className={styles.depictBar} data-short="" />}
    </>
  );
}

export function ThemePreview({ theme }: { theme: "light" | "dark" | "system" }) {
  if (theme === "system") {
    return (
      <span className={styles.depictSplit} style={DEPICT}>
        <span className={styles.depictLight}>
          <Bars two />
        </span>
        <span className={styles.depictDark}>
          <Bars two />
        </span>
      </span>
    );
  }
  return (
    <span className={theme === "light" ? styles.depictLight : styles.depictDark} style={DEPICT}>
      <Bars />
    </span>
  );
}

const WEEKS = {
  monday: ["M", "T", "W", "T", "F", "S", "S"],
  sunday: ["S", "M", "T", "W", "T", "F", "S"],
} as const;

export function WeekPreview({ start }: { start: "monday" | "sunday" }) {
  return (
    <span className={styles.depictWeek}>
      {WEEKS[start].map((day, at) => {
        const weekend = start === "monday" ? at > 4 : at === 0 || at === 6;
        return (
          <span key={at} className={styles.depictDay} data-first={at === 0 || undefined} data-weekend={weekend || undefined}>
            {day}
          </span>
        );
      })}
    </span>
  );
}

export function SizePreview({ size }: { size: "normal" | "large" }) {
  return (
    <span className={styles.depictSize} style={{ fontSize: size === "large" ? 28 : 20 }}>
      Aa
    </span>
  );
}

/** 042. How many reminders for each date: a short line ending at a date
 *  mark, with one, two or three marks before it. */
export function CountPreview({ count }: { count: 1 | 2 | 3 }) {
  return (
    <span className={styles.depictCount}>
      {Array.from({ length: count }, (_, at) => (
        <span key={at} className={styles.depictMark} data-mark="" />
      ))}
      <span className={styles.depictDate} data-date="" />
    </span>
  );
}
