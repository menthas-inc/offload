"use client";

// 028. The type chips: All, then each type present with its count, only when
// two are. 025's `Chip` and filter bar, a 30px pill on min-height in a 44px
// target, selected inverting to ink, scrolling sideways. On My threads they
// filter the group in place; on the full list, the whole list.

import { Chip } from "../labels/Chip";
import labels from "../labels/labels.module.css";
import { chipInfo, chipsShown, type ByType, type ChipKey } from "../../lib/loose";
import styles from "./loose.module.css";

export function TypeChips({
  count,
  byType,
  picked,
  onPick,
  sticky = false,
}: {
  count: number;
  byType: ByType;
  picked: ChipKey | null;
  onPick: (key: ChipKey | null) => void;
  /** Under the pane head, as the thread page's filter bar is. */
  sticky?: boolean;
}) {
  const keys = chipsShown(byType);
  if (keys.length === 0) return null;
  return (
    <div className={sticky ? labels.bar : styles.chips} role="group" aria-label="Filter by type">
      <div className={labels.barScroll}>
        <Chip selected={picked === null} onClick={() => onPick(null)}>
          All <span className={styles.count}>{count}</span>
        </Chip>
        {keys.map((key) => {
          const info = chipInfo(key);
          return (
            <Chip key={key} icon={info.icon} selected={picked === key} onClick={() => onPick(key)}>
              {info.label} <span className={styles.count}>{byType[key]}</span>
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
