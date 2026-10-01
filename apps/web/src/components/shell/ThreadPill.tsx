"use client";

// The thread pill. 027.
//
// The conversation's moss chip, now one component: the turn footer draws it at
// 30, where every mark is 30, and Today at 24, where it sits on a row's marks
// line beside the date chip and on an event card. The soft accent ground,
// `--text-accent`, `lasso` at 13. A tap opens the thread.
//
// `still` is for a card that is already a door to the same thread, an offload
// event on the strip: an anchor inside an anchor is not HTML, and the card
// itself is the control, so the pill there is ink rather than a second link.

import Link from "next/link";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";

export function ThreadPill({
  id,
  name,
  size,
  still = false,
}: {
  id: string;
  name: string;
  size: 24 | 30;
  still?: boolean;
}) {
  const body = (
    <>
      <Icon name="lasso" size={13} />
      <span className={styles.threadPillName}>{name}</span>
    </>
  );
  if (still) {
    return (
      <span className={styles.threadPill} data-size={size}>
        {body}
      </span>
    );
  }
  return (
    <Link href={`/threads/${id}`} className={styles.threadPill} data-size={size}>
      {body}
    </Link>
  );
}
