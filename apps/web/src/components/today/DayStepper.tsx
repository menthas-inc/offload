"use client";

// 027 The stepper: chevrons either side of the day's name. Back stops at
// Today; forward stops twelve months ahead, the edge of what offload keeps of
// a calendar, so a far day is never confidently empty. The web has the
// chevrons and no swipe.

import { Icon } from "../Icon";
import styles from "../../app/(shell)/today.module.css";

export function DayStepper({
  name,
  sub,
  first,
  last,
  onStep,
}: {
  name: string;
  sub: string | null;
  first: boolean;
  last: boolean;
  onStep: (by: -1 | 1) => void;
}) {
  return (
    <div className={styles.stepper}>
      <button type="button" className={styles.step} aria-label="Previous day" disabled={first} onClick={() => onStep(-1)}>
        <span className={styles.stepDisc}>
          <Icon name="chevron-left" size={18} />
        </span>
      </button>
      <div className={styles.stepName} aria-live="polite">
        <h2 className={styles.stepDay}>{name}</h2>
        {sub ? <p className={styles.stepSub}>{sub}</p> : null}
      </div>
      <button type="button" className={styles.step} aria-label="Next day" disabled={last} onClick={() => onStep(1)}>
        <span className={styles.stepDisc}>
          <Icon name="chevron-right" size={18} />
        </span>
      </button>
    </div>
  );
}
