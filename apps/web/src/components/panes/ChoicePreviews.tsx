// 031. What each choice tile shows: a light and a dark screen and one split
// down the middle for System, the week with its first day filled and the
// weekend quieter, two sizes of Aa. From `explorations/settings-v2.html`.

import styles from "../../app/(shell)/shell.module.css";

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
      <span className={styles.depictSplit}>
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
    <span className={theme === "light" ? styles.depictLight : styles.depictDark}>
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
