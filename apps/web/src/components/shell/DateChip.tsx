"use client";

// The date on a row. 023.
//
// One chip, at the trailing edge of the title line on every row that has a
// date, from the shared `chipFor`, so the three surfaces cannot disagree
// about what late, soon and later are. A row with no date draws nothing and
// asks nothing. The bell after the words reports `is_reminder` and sets
// nothing.

import { chipFor, type ChipRow } from "@offload/widgets";
import { Icon } from "../Icon";
import styles from "../../app/(shell)/shell.module.css";
import { useClock } from "../../lib/clock";

export function DateChip({ row, isReminder }: { row: ChipRow; isReminder: boolean }) {
  const { zone, today } = useClock();
  const chip = chipFor(row, zone, today);
  if (!chip) return null;
  const tone = chip.tone === "late" ? styles.chipLate : chip.tone === "soon" ? styles.chipSoon : "";
  return (
    <span className={`${styles.chip} ${tone}`} role="img" aria-label={isReminder ? `${chip.label}, offload will remind you` : chip.label}>
      <Icon name="calendar" size={12} />
      {chip.label}
      {isReminder ? <Icon name="bell" size={11} /> : null}
    </span>
  );
}
