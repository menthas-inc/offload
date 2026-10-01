"use client";

// 028. Who else will see it, on a Move to into a shared thread: up to two of
// the thread's other members as 20px initials marks on the fill, the second
// over the first, then +N. Smaller than any `Avatar` size, which stops at 28,
// so it is a mark of its own (logged with the feature's divergences). Part of
// the button it sits in, whose name is the action, so hidden from assistive
// tech like the thread's name beside it.

import type { Face } from "../../lib/loose";
import styles from "./loose.module.css";

export function Faces({ faces, more }: { faces: Face[]; more: number }) {
  if (faces.length === 0 && more === 0) return null;
  return (
    <span className={styles.faces} aria-hidden="true">
      {faces.slice(0, 2).map((face) => (
        <span key={face.accountId} className={styles.face} title={face.displayName}>
          {face.initials}
        </span>
      ))}
      {more > 0 ? <span className={styles.more}>+{more}</span> : null}
    </span>
  );
}
