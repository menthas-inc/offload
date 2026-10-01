// The day's limit, in the composer's place.
//
// Once an account has spent the day's model budget or started the day's turns
// (core-api budget.ts), a dump can only be refused, so the field is not
// offered. The words are the refusal's own, "Enough for today.", with when it
// comes back: the limit is a rolling day, so tomorrow is never later than true.

import styles from "../../app/(shell)/composer.module.css";

export const DAY_USED = "Enough for today. Back tomorrow.";

export function DayUsed() {
  return (
    <p className={styles.dayUsed} role="status">
      {DAY_USED}
    </p>
  );
}
