"use client";

// 033. First run's footer on the web: one or two pill buttons, sized to their
// labels. Skip sits beside the main button, never in a corner.

import styles from "./firstrun.module.css";

export interface FooterAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function RunFooter({ main, skip, start = false }: { main: FooterAction; skip?: FooterAction; start?: boolean }) {
  return (
    <div className={`${styles.foot} ${start ? styles.footStart : ""}`}>
      {skip ? (
        <button type="button" className={`${styles.button} ${styles.skip}`} onClick={skip.onPress}>
          {skip.label}
        </button>
      ) : null}
      <button
        type="button"
        className={`${styles.button} ${styles.main}`}
        onClick={main.onPress}
        disabled={main.disabled ?? false}
      >
        {main.label}
      </button>
    </div>
  );
}
