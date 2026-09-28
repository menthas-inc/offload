"use client";

// A person's label on a row: the date chip's geometry, the label's solid,
// white words. From `components/core/LabelMark.jsx`, whose props these are.
// Pressing one opens the label's list. The filter bar is `Chip` with `label`.

import styles from "./labels.module.css";
import { Icon } from "../Icon";

export function LabelMark({
  children,
  color,
  size = 20,
  onClick,
  onRemove,
  className,
  style,
}: {
  children: React.ReactNode;
  /** Which of the ten, 1 to 10. Stored on the label, never derived. */
  color: number;
  /** 20 on a row and in Today, 24 on its own, 30 in the turn footer. */
  size?: 20 | 24 | 30;
  onClick?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  const colour = Math.min(10, Math.max(1, Math.round(color) || 1));
  const body = (
    <>
      {children}
      {onRemove ? (
        <span
          className={styles.markRemove}
          role="button"
          aria-label="Remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="x" size={12} />
        </span>
      ) : null}
    </>
  );
  const shared = {
    className: `${styles.mark}${className ? ` ${className}` : ""}`,
    "data-colour": colour,
    "data-size": size,
    style,
  };
  return onClick ? (
    <button type="button" {...shared} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span {...shared}>{body}</span>
  );
}

/** A label's dot: the filter chip's, the sheet's, and the timeline's anchor. */
export function LabelDot({ colour, size = 8 }: { colour: number; size?: 8 | 10 }) {
  return <span aria-hidden="true" className={styles.dot} data-colour={colour} data-size={size} />;
}
